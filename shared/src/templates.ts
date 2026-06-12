import { World, Ride, TrackPiece, TrackKind, Dir, ti, inMap } from './types.js';
import { PIECES, rideDef } from './catalog.js';
import { tileMaxH, isFlat, hasWater } from './terrain.js';
import { pieceExit, pieceCells, applyTrackDone, Cursor } from './coaster.js';
import { addMessage } from './world.js';

// Prebuilt coaster designs: a ride type + a kind sequence that forms a closed
// circuit when laid from a station at dir 0. Geometry (incl. closure and clear
// station side-tiles for entrance/exit) is verified by shared/test/coaster.

export interface TemplateDef {
  id: string;
  name: string;
  type: string; // coaster RideDef id (gates research too)
  kinds: TrackKind[];
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'miniSteel',
    name: 'Mini Steel Oval',
    type: 'steelMini',
    // small starter loop: lift to +4, two gentle drops, flat run home
    kinds: [
      'station', 'station', 'lift', 'lift', 'turnR',
      'down', 'flat', 'down', 'turnR',
      'flat', 'flat', 'flat', 'flat', 'turnR',
      'flat', 'flat', 'flat', 'turnR',
    ],
  },
  {
    id: 'woodenOAB',
    name: 'Wooden Out-and-Back',
    type: 'wooden',
    // long out run with camelbacks, 180° turnaround, bunny-hop return
    kinds: [
      'station', 'station', 'station', 'lift', 'lift', 'lift', 'lift',
      'down', 'down', 'up', 'down', 'down', 'brakes', 'turnR',
      'turnR',
      'down', 'flat', 'up', 'down', 'flat', 'up', 'down',
      'flat', 'flat', 'flat', 'flat', 'flat', 'flat',
      'turnR', 'turnR',
    ],
  },
  {
    id: 'figure8',
    name: 'Figure Eight',
    type: 'steelMini',
    // two crossing loops; second chain lift carries the train over the first
    kinds: [
      'station', 'station', 'lift', 'lift', 'flat', 'turnR',
      'down', 'down', 'turnR', 'flat', 'flat', 'turnR',
      'lift', 'lift', 'flat', 'turnL',
      'down', 'down', 'turnL', 'turnL',
    ],
  },
  {
    id: 'wildMouse',
    name: 'Wild Mouse Classic',
    type: 'wildMouse',
    // tall lift, hairpin zig-zags with a steep plunge
    kinds: [
      'station', 'station', 'lift', 'lift', 'lift', 'turnR', 'turnR',
      'flat', 'down', 'flat', 'flat', 'turnL', 'turnL',
      'steepDown', 'up', 'flat', 'flat', 'turnR', 'turnR',
      'flat', 'down', 'flat', 'flat', 'flat', 'turnR',
      'flat', 'flat', 'turnR',
    ],
  },
];

export const templateDef = (id: string): TemplateDef => {
  const t = TEMPLATES.find((d) => d.id === id);
  if (!t) throw new Error(`unknown template ${id}`);
  return t;
};

// lay the kind sequence from (x, y, z, dir 0) — pure geometry, no validation
export function templatePieces(tpl: TemplateDef, x: number, y: number, z: number): TrackPiece[] {
  const out: TrackPiece[] = [];
  let cur: Cursor = { x, y, z, dir: 0 as Dir };
  for (const kind of tpl.kinds) {
    const p: TrackPiece = { kind, x: cur.x, y: cur.y, z: cur.z, dir: cur.dir };
    out.push(p);
    cur = pieceExit(p);
  }
  return out;
}

export function templateCost(tpl: TemplateDef): number {
  const mul = rideDef(tpl.type).coaster?.pieceCostMul ?? 1;
  let c = 0;
  for (const k of tpl.kinds) c += Math.floor(PIECES[k].cost * mul);
  return c;
}

// every cell the template touches (for ghost preview + validation)
export function templateCells(tpl: TemplateDef, x: number, y: number, z: number): [number, number][] {
  const cells: [number, number][] = [];
  for (const p of templatePieces(tpl, x, y, z)) cells.push(...pieceCells(p));
  return cells;
}

export function templateError(w: World, tplId: string, x: number, y: number): string | null {
  const tpl = templateDef(tplId);
  if (!w.research.invented.includes(tpl.type)) return 'not yet invented';
  if (w.cash < templateCost(tpl)) return 'not enough cash';
  if (!inMap(w.size, x, y) || !isFlat(w, x, y)) return 'needs flat ground';
  const z = tileMaxH(w, x, y);
  for (const [cx, cy] of templateCells(tpl, x, y, z)) {
    if (!inMap(w.size, cx, cy)) return 'outside the park';
    if (!isFlat(w, cx, cy) || tileMaxH(w, cx, cy) !== z) return 'ground must be flat and level';
    if (hasWater(w, cx, cy)) return 'blocked by water';
    const i = ti(w.size, cx, cy);
    if (w.path[i] !== 0) return 'blocked by path';
    if (w.scen[i] !== 0) return 'blocked by scenery';
    if (w.rideAt[i] !== 0) return 'blocked by another ride';
  }
  return null;
}

export function applyTemplate(w: World, tplId: string, x: number, y: number): boolean {
  if (templateError(w, tplId, x, y) !== null) return false;
  const tpl = templateDef(tplId);
  const def = rideDef(tpl.type);
  const z = tileMaxH(w, x, y);
  const track = templatePieces(tpl, x, y, z);
  const cost = templateCost(tpl);
  const id = w.nextRideId++;
  const count = w.rides.filter((r) => r.type === tpl.type).length + 1;
  const ride: Ride = {
    id, type: tpl.type, name: `${tpl.name} ${count}`,
    x, y, rot: 0,
    open: false,
    price: def.defaultPrice,
    phase: 'idle', timer: 0,
    riders: [], queue: [],
    entrance: null, exit: null,
    totalCustomers: 0, monthCustomers: 0, income: 0,
    excitement: -1, intensity: -1, nausea: -1,
    track,
    trackDone: false,
  };
  w.rides.push(ride);
  for (const p of track) for (const [cx, cy] of pieceCells(p)) w.rideAt[ti(w.size, cx, cy)] = id;
  if (!applyTrackDone(w, id)) {
    // no room for entrance/exit (or other close failure): roll back fully
    for (let i = 0; i < w.rideAt.length; i++) if (w.rideAt[i] === id) w.rideAt[i] = 0;
    w.rides.splice(w.rides.findIndex((r) => r.id === id), 1);
    w.nextRideId--;
    return false;
  }
  w.cash -= cost;
  w.curExpense += cost;
  addMessage(w, `${ride.name} built!`, 'info');
  return true;
}
