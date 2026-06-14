import {
  World, Peep, Dir, TrackKind, TrackPiece, StaffKind, ti, inMap, fmtMoney,
  canPlacePath, sceneryDef, canPlaceRide, rideDef, entranceSpots,
  buildableFlat, tileMaxH, PIECES, trackEnd, pieceError, pieceCells, isClosed,
  templateDef, templatePieces, templateError, templateCost, isWalkable,
  STAFF_HIRE_COST, staffLabel,
} from '@park/shared';
import { Session } from './session.js';
import { Ghost } from './state.js';
import { audio } from './audio.js';

export type Tool =
  | { t: 'pointer' }
  | { t: 'land'; d: 1 | -1; brush: number }
  | { t: 'water'; d: 1 | -1; brush: number }
  | { t: 'path'; kind: 1 | 2 }
  | { t: 'unpath' }
  | { t: 'scenery'; type: string }
  | { t: 'unscenery' }
  | { t: 'ride'; type: string }
  | { t: 'staff'; kind: StaffKind }
  | { t: 'template'; tpl: string }
  | { t: 'trackStart'; type: string }
  | { t: 'track' } // builder active; pieces added via the palette window
  | { t: 'demolish' }
  | { t: 'sweep' };

export interface Hover {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wx: number; // precise cursor world coords (tile units, float)
  wy: number;
}

export class Tools {
  tool: Tool = { t: 'pointer' };
  rot: Dir = 0;
  nextPiece: TrackKind = 'flat';
  hover: Hover | null = null;
  carriedPeep: number | null = null; // guest currently being dragged
  onOpenRide: ((rideId: number) => void) | null = null;
  onOpenPeep: ((peepId: number) => void) | null = null;
  onTrackStarted: (() => void) | null = null;
  toast: ((msg: string) => void) | null = null;

  constructor(private session: Session) {}

  // nearest visible guest within click radius of the precise cursor, or null
  peepAt(w: World, wx: number, wy: number): number | null {
    let best = -1;
    let bestD = 0.55 * 0.55; // ~half a tile
    for (const p of w.peeps) {
      if (p.state === 'riding' || p.state === 'gone') continue;
      const dx = p.x - wx, dy = p.y - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = p.id; }
    }
    return best >= 0 ? best : null;
  }

  // issue a "pick up & set down" for a dragged guest; toasts if the drop is bad
  dropPeep(w: World, peepId: number, x: number, y: number): void {
    if (!inMap(w.size, x, y) || !isWalkable(w, x, y)) {
      this.toast?.('Guests can only be set down on a path.');
      return;
    }
    this.session.issue({ t: 'movePeep', peepId, x, y });
  }

  set(tool: Tool): void {
    this.tool = tool;
  }

  rotate(): void {
    this.rot = ((this.rot + 1) & 3) as Dir;
  }

  // the coaster currently under construction (latest unfinished track)
  activeCoaster(w: World) {
    for (let i = w.rides.length - 1; i >= 0; i--) {
      const r = w.rides[i];
      if (r.track && !r.trackDone) return r;
    }
    return null;
  }

  // ------------------------------------------------------------ ghost

  ghost(w: World): Ghost | null {
    const h = this.hover;
    const t = this.tool;
    if (!h && t.t !== 'track') return null;
    switch (t.t) {
      case 'pointer':
        return null;
      case 'land': {
        // brush = vertices per side; the touched tiles are (brush-1)², min 1
        const n = Math.max(1, t.brush - 1);
        const tiles: [number, number][] = [];
        for (let dy = 0; dy < n; dy++)
          for (let dx = 0; dx < n; dx++) tiles.push([h!.vx + dx, h!.vy + dy]);
        return { k: 'tiles', tiles, ok: true, label: t.d > 0 ? 'Raise land' : 'Lower land' };
      }
      case 'water': {
        const tiles: [number, number][] = [];
        for (let dy = 0; dy < t.brush; dy++) for (let dx = 0; dx < t.brush; dx++) tiles.push([h!.x + dx, h!.y + dy]);
        return { k: 'tiles', tiles, ok: true, label: t.d > 0 ? 'Raise water' : 'Lower water' };
      }
      case 'path': {
        const ok = canPlacePath(w, h!.x, h!.y);
        return { k: 'tiles', tiles: [[h!.x, h!.y]], ok, label: t.kind === 1 ? 'Footpath' : 'Queue' };
      }
      case 'unpath':
        return { k: 'tiles', tiles: [[h!.x, h!.y]], ok: w.path[ti(w.size, h!.x, h!.y)] !== 0, label: 'Remove path' };
      case 'scenery': {
        const def = sceneryDef(t.type);
        const onPath = def.kind === 'bench' || def.kind === 'lamp' || def.kind === 'bin';
        const i = ti(w.size, h!.x, h!.y);
        const ok = onPath
          ? inMap(w.size, h!.x, h!.y) && w.path[i] === 1 && w.pathAdd[i] === 0
          : buildableFlat(w, h!.x, h!.y);
        return { k: 'tiles', tiles: [[h!.x, h!.y]], ok, label: `${def.name} ${fmtMoney(def.cost)}` };
      }
      case 'unscenery':
        return { k: 'tiles', tiles: [[h!.x, h!.y]], ok: true, label: 'Remove scenery' };
      case 'ride': {
        const def = rideDef(t.type);
        const tiles: [number, number][] = [];
        for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) tiles.push([h!.x + dx, h!.y + dy]);
        if (def.category !== 'stall') {
          const { ent, ext } = entranceSpots(w.size, h!.x, h!.y, def.size, this.rot);
          tiles.push([ent.x, ent.y], [ext.x, ext.y]);
        } else {
          tiles.push([h!.x + [1, 0, -1, 0][this.rot], h!.y + [0, 1, 0, -1][this.rot]]);
        }
        const ok = canPlaceRide(w, t.type, h!.x, h!.y, this.rot);
        return { k: 'tiles', tiles, ok, label: `${def.name} ${fmtMoney(def.cost)} (R rotates)` };
      }
      case 'staff': {
        const ok = inMap(w.size, h!.x, h!.y) && w.path[ti(w.size, h!.x, h!.y)] === 1;
        return { k: 'tiles', tiles: [[h!.x, h!.y]], ok, label: `${staffLabel(t.kind)} ${fmtMoney(STAFF_HIRE_COST[t.kind])}` };
      }
      case 'template': {
        const tpl = templateDef(t.tpl);
        const err = templateError(w, t.tpl, h!.x, h!.y);
        const z = inMap(w.size, h!.x, h!.y) ? tileMaxH(w, h!.x, h!.y) : 0;
        const pieces = templatePieces(tpl, h!.x, h!.y, z);
        return {
          k: 'track', pieces, type: tpl.type, ok: err === null,
          label: err ?? `${tpl.name} ${fmtMoney(templateCost(tpl))}`,
        };
      }
      case 'trackStart': {
        const ok = buildableFlat(w, h!.x, h!.y);
        return { k: 'tiles', tiles: [[h!.x, h!.y]], ok, label: `${rideDef(t.type).name}: place station (R rotates)` };
      }
      case 'track': {
        const ride = this.activeCoaster(w);
        if (!ride) return null;
        const cur = trackEnd(ride);
        if (!cur) return null;
        const err = pieceError(w, ride, this.nextPiece, cur);
        const piece: TrackPiece = { kind: this.nextPiece, x: cur.x, y: cur.y, z: cur.z, dir: cur.dir };
        const def = rideDef(ride.type);
        const cost = Math.floor(PIECES[this.nextPiece].cost * (def.coaster?.pieceCostMul ?? 1));
        return {
          k: 'track', pieces: [piece], type: ride.type, ok: err === null,
          label: err ?? `${this.nextPiece} ${fmtMoney(cost)}${isClosed(ride) ? ' — circuit closed!' : ''}`,
        };
      }
      case 'demolish': {
        const id = inMap(w.size, h!.x, h!.y) ? w.rideAt[ti(w.size, h!.x, h!.y)] : 0;
        if (id === 0) return { k: 'tiles', tiles: [[h!.x, h!.y]], ok: false, label: 'Demolish ride' };
        const tiles: [number, number][] = [];
        for (let i = 0; i < w.rideAt.length; i++) {
          if (w.rideAt[i] === id) tiles.push([i % w.size, (i / w.size) | 0]);
        }
        const ride = w.rides.find((r) => r.id === id);
        return { k: 'tiles', tiles, ok: true, label: `Demolish ${ride?.name ?? ''}` };
      }
      case 'sweep':
        return { k: 'tiles', tiles: [[h!.x, h!.y]], ok: true, label: 'Sweep litter' };
    }
  }

  // ------------------------------------------------------------ clicks

  // returns true if the click consumed (drag-paint tools return true too)
  click(w: World): boolean {
    const h = this.hover;
    if (!h) return false;
    const s = this.session;
    const t = this.tool;
    switch (t.t) {
      case 'pointer': {
        const id = inMap(w.size, h.x, h.y) ? w.rideAt[ti(w.size, h.x, h.y)] : 0;
        if (id > 0) this.onOpenRide?.(id);
        return id > 0;
      }
      case 'land':
        s.issue({ t: 'land', vx: h.vx, vy: h.vy, d: t.d, brush: t.brush });
        return true;
      case 'water':
        s.issue({ t: 'water', x: h.x, y: h.y, d: t.d, brush: t.brush });
        return true;
      case 'path':
        s.issue({ t: 'path', x: h.x, y: h.y, kind: t.kind });
        return true;
      case 'unpath':
        s.issue({ t: 'unpath', x: h.x, y: h.y });
        return true;
      case 'scenery': {
        const def = sceneryDef(t.type);
        const onPath = def.kind === 'bench' || def.kind === 'lamp' || def.kind === 'bin';
        const i = ti(w.size, h.x, h.y);
        const ok = onPath
          ? inMap(w.size, h.x, h.y) && w.path[i] === 1 && w.pathAdd[i] === 0
          : buildableFlat(w, h.x, h.y);
        if (!ok) {
          audio.sfx('fail');
          this.toast?.(onPath ? `${def.name} must go on an empty footpath.` : `Can't place ${def.name} here — needs flat, clear ground.`);
          return true;
        }
        s.issue({ t: 'scenery', x: h.x, y: h.y, type: t.type });
        audio.sfx('place');
        this.set({ t: 'pointer' }); // back to Select after placing
        return true;
      }
      case 'unscenery':
        s.issue({ t: 'unscenery', x: h.x, y: h.y });
        return true;
      case 'ride': {
        if (!canPlaceRide(w, t.type, h.x, h.y, this.rot)) {
          const def = rideDef(t.type);
          audio.sfx('fail');
          this.toast?.(w.cash < def.cost
            ? `Not enough cash for ${def.name} (${fmtMoney(def.cost)}).`
            : `Can't build ${def.name} here — needs flat, clear ground with room for the entrance & exit (press R to rotate).`);
          return true;
        }
        s.issue({ t: 'ride', type: t.type, x: h.x, y: h.y, rot: this.rot });
        audio.sfx('cash');
        this.set({ t: 'pointer' }); // back to Select after placing a building
        return true;
      }
      case 'template': {
        const err = templateError(w, t.tpl, h.x, h.y);
        if (err) { audio.sfx('fail'); this.toast?.(err); return true; }
        s.issue({ t: 'template', tpl: t.tpl, x: h.x, y: h.y });
        audio.sfx('cash');
        this.set({ t: 'pointer' });
        return true;
      }
      case 'staff': {
        if (!(inMap(w.size, h.x, h.y) && w.path[ti(w.size, h.x, h.y)] === 1)) {
          audio.sfx('fail');
          this.toast?.('Hire staff onto a footpath.');
          return true;
        }
        if (w.cash < STAFF_HIRE_COST[t.kind]) {
          audio.sfx('fail');
          this.toast?.(`Not enough cash to hire a ${staffLabel(t.kind).toLowerCase()}.`);
          return true;
        }
        s.issue({ t: 'hireStaff', kind: t.kind, x: h.x, y: h.y });
        audio.sfx('hire');
        this.set({ t: 'pointer' });
        return true;
      }
      case 'trackStart':
        s.issue({ t: 'trackStart', type: t.type, x: h.x, y: h.y, rot: this.rot });
        this.tool = { t: 'track' };
        this.onTrackStarted?.();
        return true;
      case 'track':
        return false; // pieces come from the palette window
      case 'demolish': {
        const id = inMap(w.size, h.x, h.y) ? w.rideAt[ti(w.size, h.x, h.y)] : 0;
        if (id > 0) s.issue({ t: 'demolish', rideId: id });
        return true;
      }
      case 'sweep':
        s.issue({ t: 'sweep', x: h.x, y: h.y });
        return true;
    }
  }

  // tools that paint while dragging across tiles
  paints(): boolean {
    return ['land', 'water', 'path', 'unpath', 'sweep'].includes(this.tool.t);
  }

  // ------------------------------------------------------------ track palette actions

  trackAdd(w: World, kind: TrackKind): void {
    const ride = this.activeCoaster(w);
    if (ride) this.session.issue({ t: 'trackAdd', rideId: ride.id, kind });
  }

  trackBack(w: World): void {
    const ride = this.activeCoaster(w);
    if (ride) this.session.issue({ t: 'trackBack', rideId: ride.id });
  }

  trackCancel(w: World): void {
    const ride = this.activeCoaster(w);
    if (ride) this.session.issue({ t: 'trackCancel', rideId: ride.id });
    this.tool = { t: 'pointer' };
  }

  trackDone(w: World): void {
    const ride = this.activeCoaster(w);
    if (ride) this.session.issue({ t: 'trackDone', rideId: ride.id });
  }
}
