import { World, Command, TICK_MS, createWorld, stepWorld, serializeWorld, deserializeWorld } from '@park/shared';
import { PeerNet } from './peernet.js';
import { Ghost, Peer, LobbyPlayer } from './state.js';
import { PLAYER_COLORS } from './render/sprites.js';

// Host-paced deterministic lockstep ("live replay"). The host's world is the
// park; guests replay the host's committed {tick, cmds} batches in order.

type SimPayload =
  | { k: 'cmdReq'; cmd: Command }
  | { k: 'tickBatch'; tick: number; cmds: Command[] }
  | { k: 'snapshot'; world: string }
  | { k: 'needSnapshot' }
  | { k: 'eph'; cx: number; cy: number; ghost: Ghost | null };

export type Mode = 'offline' | 'host' | 'guest';

const MAX_CATCHUP = 60; // guest ticks per frame while catching up

export class Session {
  world: World | null = null;
  mode: Mode = 'offline';
  net: PeerNet | null = null;
  myId = 0;
  myName = 'Player';
  roomCode = '';
  peers = new Map<number, Peer>();
  lobby: LobbyPlayer[] = [];

  onHostLeft: (() => void) | null = null;
  onInvite: ((from: string, code: string) => void) | null = null;
  onLobby: (() => void) | null = null;
  onJoinFailed: ((reason: string) => void) | null = null;

  private pending: Command[] = []; // host: commands awaiting the next tick
  private batches = new Map<number, Command[]>(); // guest: tick → cmds
  private latestBatch = -1;
  private acc = 0;
  private last = 0;
  private synced = new Set<number>(); // host: members already sent a snapshot
  private lastEph = 0;
  private ephDirty = false;
  private cx = 0;
  private cy = 0;
  private ghost: Ghost | null = null;

  // ------------------------------------------------------------ setup

  startOffline(seed: number, parkName: string): void {
    this.mode = 'offline';
    this.world = createWorld(seed, parkName);
  }

  attachNet(net: PeerNet): void {
    this.net = net;
    net.on((msg) => {
      switch (msg.t) {
        case 'welcome':
          this.myId = msg.playerId;
          this.myName = msg.name;
          break;
        case 'lobby':
          this.lobby = msg.players;
          this.onLobby?.();
          break;
        case 'roomUpdate': {
          this.roomCode = msg.code;
          const alive = new Set<number>();
          for (const m of msg.members) {
            alive.add(m.id);
            if (m.id === this.myId) continue;
            if (!this.peers.has(m.id)) {
              this.peers.set(m.id, {
                id: m.id, name: m.name, isHost: m.isHost,
                color: PLAYER_COLORS[m.id % PLAYER_COLORS.length],
                cx: -99, cy: -99, ghost: null, seen: 0,
              });
            } else {
              const p = this.peers.get(m.id)!;
              p.name = m.name;
              p.isHost = m.isHost;
            }
            // host: ship the park to brand-new members
            if (this.mode === 'host' && this.world && !this.synced.has(m.id)) {
              this.synced.add(m.id);
              this.net!.toPlayer(m.id, { k: 'snapshot', world: serializeWorld(this.world) } satisfies SimPayload);
            }
          }
          for (const id of [...this.peers.keys()]) {
            if (!alive.has(id)) {
              this.peers.delete(id);
              this.synced.delete(id);
            }
          }
          this.onLobby?.();
          break;
        }
        case 'invited':
          this.onInvite?.(msg.from, msg.code);
          break;
        case 'joinFailed':
          this.onJoinFailed?.(msg.reason);
          break;
        case 'hostLeft':
          this.roomCode = '';
          this.peers.clear();
          if (this.mode === 'guest') {
            this.mode = 'offline';
            this.onHostLeft?.();
          }
          break;
        case 'fromPlayer':
          this.onSim(msg.playerId, msg.payload as SimPayload);
          break;
      }
    });
  }

  hostPark(world: World): void {
    this.mode = 'host';
    this.world = world;
    this.synced.clear();
    this.net?.send({ t: 'createRoom' });
  }

  joinPark(code: string): void {
    this.mode = 'guest';
    this.world = null; // waiting for snapshot
    this.batches.clear();
    this.latestBatch = -1;
    this.net?.send({ t: 'joinRoom', code });
  }

  invite(playerId: number): void {
    this.net?.send({ t: 'invite', playerId });
  }

  // host only: replace the world (Load Park) and resync everyone
  loadWorld(world: World): void {
    if (this.mode === 'guest') return;
    this.world = world;
    this.pending = [];
    if (this.mode === 'host' && this.net) {
      const snap = serializeWorld(world);
      for (const id of this.peers.keys()) this.net.toPlayer(id, { k: 'snapshot', world: snap } satisfies SimPayload);
    }
  }

  // ------------------------------------------------------------ sim traffic

  private onSim(from: number, p: SimPayload): void {
    switch (p.k) {
      case 'cmdReq':
        if (this.mode === 'host') this.pending.push(p.cmd);
        break;
      case 'tickBatch':
        if (this.mode === 'guest') {
          this.batches.set(p.tick, p.cmds);
          this.latestBatch = Math.max(this.latestBatch, p.tick);
        }
        break;
      case 'snapshot':
        if (this.mode === 'guest') {
          this.world = deserializeWorld(p.world);
          // drop batches from before the snapshot
          for (const t of [...this.batches.keys()]) if (t < this.world.tick) this.batches.delete(t);
        }
        break;
      case 'needSnapshot':
        if (this.mode === 'host' && this.world) {
          this.net?.toPlayer(from, { k: 'snapshot', world: serializeWorld(this.world) } satisfies SimPayload);
        }
        break;
      case 'eph': {
        const peer = this.peers.get(from);
        if (peer) {
          peer.cx = p.cx;
          peer.cy = p.cy;
          peer.ghost = p.ghost;
          peer.seen = performance.now();
        }
        break;
      }
    }
  }

  // queue a player command for execution (next host tick)
  issue(cmd: Command): void {
    if (this.mode === 'guest') this.net?.toHost({ k: 'cmdReq', cmd } satisfies SimPayload);
    else this.pending.push(cmd);
  }

  // ephemeral channel: cursor + current tool ghost (never touches the sim)
  setCursor(cx: number, cy: number): void {
    if (this.cx !== cx || this.cy !== cy) {
      this.cx = cx;
      this.cy = cy;
      this.ephDirty = true;
    }
  }

  setGhost(g: Ghost | null): void {
    this.ghost = g;
    this.ephDirty = true;
  }

  // ------------------------------------------------------------ pacing

  update(now: number): void {
    if (this.last === 0) this.last = now;
    const dt = Math.min(250, now - this.last);
    this.last = now;

    if (this.world && this.mode !== 'guest') {
      // we pace the sim
      this.acc += dt;
      while (this.acc >= TICK_MS) {
        this.acc -= TICK_MS;
        const cmds = this.pending;
        this.pending = [];
        const tick = this.world.tick;
        stepWorld(this.world, cmds);
        if (this.mode === 'host') this.net?.broadcast({ k: 'tickBatch', tick, cmds } satisfies SimPayload);
      }
    } else if (this.world && this.mode === 'guest') {
      // replay committed batches; never run ahead of the host
      let steps = 0;
      while (steps < MAX_CATCHUP && this.world.tick <= this.latestBatch) {
        const cmds = this.batches.get(this.world.tick);
        if (cmds === undefined) break; // gap — wait for delivery
        this.batches.delete(this.world.tick);
        stepWorld(this.world, cmds);
        steps++;
      }
    }

    // ephemeral broadcast at ~12 Hz
    if (this.net && this.roomCode && this.ephDirty && now - this.lastEph > 80) {
      this.lastEph = now;
      this.ephDirty = false;
      this.net.broadcast({ k: 'eph', cx: this.cx, cy: this.cy, ghost: this.ghost } satisfies SimPayload);
    }
  }
}
