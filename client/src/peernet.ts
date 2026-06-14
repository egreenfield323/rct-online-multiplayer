// Peer-to-peer transport over WebRTC (PeerJS), a drop-in replacement for the
// old websocket relay. It presents the exact same surface the Session expects
// (on/send/toHost/broadcast/toPlayer + the ServerMsg events) so the lockstep
// driver is unchanged — only the wire underneath is different.
//
// Topology: a STAR with the host at the hub. The host owns the only copy of the
// park (unchanged from PLAN.md). Signalling uses the FREE public PeerJS cloud
// broker — no game server, no cloud saves, nothing to pay for. A friend joins
// with a 6-letter code that doubles as the host's peer id (`openpark-<CODE>`).
//
// Host responsibilities (it acts as the relay the server used to be):
//   guest→host  toHost{payload}              → deliver to host sim
//   guest→host  broadcast{payload}           → fan out to every other guest + host
//   guest→host  toPlayer{playerId,payload}   → forward to that one peer
//   host→guests fromPlayer / welcome / roomUpdate / hostLeft / joinFailed
//
// Guests only ever talk to the host; the host re-labels and forwards.

import Peer, { DataConnection } from 'peerjs';
import type { ServerMsg } from './net.js';

const HOST_ID = 1; // the host is always player #1
const PREFIX = 'openpark-'; // peer-id namespace on the public broker

// guest→host envelopes (host→guest uses ServerMsg directly)
type Up =
  | { t: 'toHost'; payload: unknown }
  | { t: 'broadcast'; payload: unknown }
  | { t: 'toPlayer'; playerId: number; payload: unknown };

type Handler = (msg: ServerMsg) => void;

function randomCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return s;
}

export class PeerNet {
  private peer: Peer | null = null;
  private handlers: Handler[] = [];

  // host state
  private isHost = false;
  private conns = new Map<number, DataConnection>(); // guestId → connection
  private names = new Map<number, string>(); // guestId → name
  private nextId = HOST_ID + 1;
  private code = '';

  // guest state
  private toHostConn: DataConnection | null = null;

  connected = false;
  onClose: (() => void) | null = null;

  constructor(private myName: string) {}

  on(h: Handler): void {
    this.handlers.push(h);
  }

  private emit(msg: ServerMsg): void {
    for (const h of this.handlers) h(msg);
  }

  // The Session drives setup through send() (createRoom / joinRoom / invite),
  // exactly as it did with the relay.
  send(msg: unknown): void {
    const m = msg as { t: string; code?: string };
    if (m.t === 'createRoom') this.startHost();
    else if (m.t === 'joinRoom') this.startGuest(m.code ?? '');
    // 'invite' (lobby invites) has no meaning without a global directory — ignored.
  }

  // ------------------------------------------------------------ host

  private startHost(attempt = 0): void {
    this.isHost = true;
    this.code = randomCode();
    const peer = new Peer(PREFIX + this.code);
    this.peer = peer;

    peer.on('open', () => {
      this.connected = true;
      // bootstrap the host's own Session, mirroring the relay's welcome+room
      this.emit({ t: 'welcome', playerId: HOST_ID, name: this.myName });
      this.broadcastRoom();
    });

    peer.on('connection', (conn) => this.acceptGuest(conn));

    peer.on('error', (err) => {
      // taken id → pick a new code and retry a couple of times
      if ((err as { type?: string }).type === 'unavailable-id' && attempt < 3) {
        peer.destroy();
        this.startHost(attempt + 1);
        return;
      }
      if (!this.connected) this.emit({ t: 'joinFailed', reason: `Could not open a room: ${err.message ?? err}` });
    });
  }

  private acceptGuest(conn: DataConnection): void {
    const id = this.nextId++;
    const name = (conn.metadata as { name?: string } | undefined)?.name || `Player ${id}`;
    this.names.set(id, name);

    conn.on('open', () => {
      this.conns.set(id, conn);
      // tell the newcomer who they are, then refresh the roster for everyone.
      conn.send({ t: 'welcome', playerId: id, name } satisfies ServerMsg);
      this.broadcastRoom(); // host Session reacts to this by shipping a snapshot
    });

    conn.on('data', (raw) => this.onGuestData(id, raw as Up));

    conn.on('close', () => {
      this.conns.delete(id);
      this.names.delete(id);
      this.broadcastRoom();
    });
    conn.on('error', () => {
      this.conns.delete(id);
      this.names.delete(id);
      this.broadcastRoom();
    });
  }

  // host receives a guest message and routes it like the old server did
  private onGuestData(from: number, m: Up): void {
    if (m.t === 'toHost') {
      this.emit({ t: 'fromPlayer', playerId: from, payload: m.payload });
    } else if (m.t === 'broadcast') {
      // fan out to every other guest, and deliver to the host's own sim
      for (const [id, conn] of this.conns) {
        if (id !== from) conn.send({ t: 'fromPlayer', playerId: from, payload: m.payload } satisfies ServerMsg);
      }
      this.emit({ t: 'fromPlayer', playerId: from, payload: m.payload });
    } else if (m.t === 'toPlayer') {
      if (m.playerId === HOST_ID) this.emit({ t: 'fromPlayer', playerId: from, payload: m.payload });
      else this.conns.get(m.playerId)?.send({ t: 'fromPlayer', playerId: from, payload: m.payload } satisfies ServerMsg);
    }
  }

  private broadcastRoom(): void {
    const members = [
      { id: HOST_ID, name: this.myName, isHost: true },
      ...[...this.names.entries()].map(([id, name]) => ({ id, name, isHost: false })),
    ];
    const msg: ServerMsg = { t: 'roomUpdate', code: this.code, members };
    this.emit(msg); // host's own Session (creates peers, ships snapshots)
    for (const conn of this.conns.values()) conn.send(msg);
  }

  // ------------------------------------------------------------ guest

  private startGuest(code: string): void {
    const peer = new Peer();
    this.peer = peer;

    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code.toUpperCase(), {
        reliable: true,
        metadata: { name: this.myName },
      });
      this.toHostConn = conn;

      const failTimer = setTimeout(() => {
        if (!this.connected) this.emit({ t: 'joinFailed', reason: 'No park found for that code (or the host is offline).' });
      }, 8000);

      conn.on('open', () => {
        this.connected = true;
        clearTimeout(failTimer);
      });
      conn.on('data', (raw) => this.emit(raw as ServerMsg)); // host already speaks ServerMsg
      conn.on('close', () => {
        this.connected = false;
        this.emit({ t: 'hostLeft' });
        this.onClose?.();
      });
      conn.on('error', () => {
        if (!this.connected) this.emit({ t: 'joinFailed', reason: 'Could not reach the host.' });
      });
    });

    peer.on('error', (err) => {
      if (!this.connected) {
        const unavailable = (err as { type?: string }).type === 'peer-unavailable';
        this.emit({ t: 'joinFailed', reason: unavailable ? 'No park found for that code (or the host is offline).' : `Connection error: ${err.message ?? err}` });
      }
    });
  }

  // ------------------------------------------------------------ outgoing (Session API)

  toHost(payload: unknown): void {
    if (this.isHost) this.emit({ t: 'fromPlayer', playerId: HOST_ID, payload });
    else this.toHostConn?.send({ t: 'toHost', payload } satisfies Up);
  }

  broadcast(payload: unknown): void {
    if (this.isHost) {
      for (const conn of this.conns.values()) conn.send({ t: 'fromPlayer', playerId: HOST_ID, payload } satisfies ServerMsg);
    } else {
      this.toHostConn?.send({ t: 'broadcast', payload } satisfies Up);
    }
  }

  toPlayer(playerId: number, payload: unknown): void {
    if (this.isHost) {
      if (playerId === HOST_ID) this.emit({ t: 'fromPlayer', playerId: HOST_ID, payload });
      else this.conns.get(playerId)?.send({ t: 'fromPlayer', playerId: HOST_ID, payload } satisfies ServerMsg);
    } else {
      this.toHostConn?.send({ t: 'toPlayer', playerId, payload } satisfies Up);
    }
  }

  // tidy up (used when leaving a session)
  destroy(): void {
    this.peer?.destroy();
    this.peer = null;
    this.connected = false;
    this.conns.clear();
  }
}
