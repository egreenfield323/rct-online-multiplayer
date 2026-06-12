import { RideDef, SceneryDef, TrackKind } from './types.js';

// ------------------------------------------------------------ rides & stalls

export const RIDE_DEFS: RideDef[] = [
  // gentle
  {
    id: 'merryGoRound', name: 'Merry-Go-Round', category: 'gentle', size: 3,
    cost: 425_00, defaultPrice: 100, capacity: 12, cycleTicks: 170,
    stats: { e: 210, i: 60, n: 45 },
  },
  {
    id: 'ferrisWheel', name: 'Ferris Wheel', category: 'gentle', size: 3,
    cost: 675_00, defaultPrice: 120, capacity: 16, cycleTicks: 330,
    stats: { e: 250, i: 90, n: 60 },
  },
  {
    id: 'hauntedHouse', name: 'Haunted House', category: 'gentle', size: 3,
    cost: 700_00, defaultPrice: 120, capacity: 10, cycleTicks: 290,
    stats: { e: 270, i: 170, n: 80 },
  },
  {
    id: 'observationTower', name: 'Observation Tower', category: 'gentle', size: 3,
    cost: 900_00, defaultPrice: 150, capacity: 16, cycleTicks: 360,
    stats: { e: 230, i: 50, n: 25 },
  },
  // thrill
  {
    id: 'twist', name: 'Twist', category: 'thrill', size: 3,
    cost: 540_00, defaultPrice: 130, capacity: 12, cycleTicks: 230,
    stats: { e: 240, i: 250, n: 190 },
  },
  {
    id: 'bumperCars', name: 'Bumper Cars', category: 'thrill', size: 4,
    cost: 810_00, defaultPrice: 130, capacity: 14, cycleTicks: 310,
    stats: { e: 200, i: 130, n: 60 },
  },
  // coasters (size 0 = track-built)
  {
    id: 'wooden', name: 'Wooden Roller Coaster', category: 'coaster', size: 0,
    cost: 0, defaultPrice: 250, capacity: 0, cycleTicks: 0, stats: { e: 0, i: 0, n: 0 },
    coaster: { liftV: 2.2, launchV: 2.6, cars: 4, carCap: 2, pieceCostMul: 1.0, colors: ['#8a5a2b', '#e8e0d0'] },
  },
  {
    id: 'steelMini', name: 'Steel Mini Coaster', category: 'coaster', size: 0,
    cost: 0, defaultPrice: 200, capacity: 0, cycleTicks: 0, stats: { e: 0, i: 0, n: 0 },
    coaster: { liftV: 2.0, launchV: 2.4, cars: 3, carCap: 2, pieceCostMul: 0.9, colors: ['#d04848', '#888898'] },
  },
  {
    id: 'wildMouse', name: 'Wild Mouse', category: 'coaster', size: 0,
    cost: 0, defaultPrice: 220, capacity: 0, cycleTicks: 0, stats: { e: 0, i: 0, n: 0 },
    coaster: { liftV: 2.5, launchV: 2.4, cars: 1, carCap: 2, pieceCostMul: 1.1, colors: ['#3a78d0', '#c8c840'] },
  },
  // stalls
  {
    id: 'burger', name: 'Burger Bar', category: 'stall', size: 1,
    cost: 300_00, defaultPrice: 150, capacity: 0, cycleTicks: 0,
    stats: { e: 0, i: 0, n: 0 }, sells: 'food', stockCost: 60,
  },
  {
    id: 'fries', name: 'Fries Stall', category: 'stall', size: 1,
    cost: 280_00, defaultPrice: 120, capacity: 0, cycleTicks: 0,
    stats: { e: 0, i: 0, n: 0 }, sells: 'food', stockCost: 45,
  },
  {
    id: 'iceCream', name: 'Ice Cream Stall', category: 'stall', size: 1,
    cost: 270_00, defaultPrice: 110, capacity: 0, cycleTicks: 0,
    stats: { e: 0, i: 0, n: 0 }, sells: 'food', stockCost: 40,
  },
  {
    id: 'drinks', name: 'Drinks Stall', category: 'stall', size: 1,
    cost: 225_00, defaultPrice: 90, capacity: 0, cycleTicks: 0,
    stats: { e: 0, i: 0, n: 0 }, sells: 'drink', stockCost: 35,
  },
  {
    id: 'infoKiosk', name: 'Information Kiosk', category: 'stall', size: 1,
    cost: 250_00, defaultPrice: 50, capacity: 0, cycleTicks: 0,
    stats: { e: 0, i: 0, n: 0 }, sells: 'info', stockCost: 10,
  },
  {
    id: 'toilets', name: 'Toilets', category: 'stall', size: 1,
    cost: 175_00, defaultPrice: 20, capacity: 0, cycleTicks: 0,
    stats: { e: 0, i: 0, n: 0 }, sells: 'toilet', stockCost: 0,
  },
];

export const rideDef = (id: string): RideDef => {
  const d = RIDE_DEFS.find((r) => r.id === id);
  if (!d) throw new Error(`unknown ride def ${id}`);
  return d;
};

// research progression: starts invented vs pending (invention order fixed)
export const START_INVENTED = ['merryGoRound', 'wooden', 'burger', 'drinks', 'toilets'];
export const RESEARCH_ORDER = [
  'ferrisWheel',
  'fries',
  'steelMini',
  'twist',
  'iceCream',
  'hauntedHouse',
  'infoKiosk',
  'bumperCars',
  'wildMouse',
  'observationTower',
];

// ------------------------------------------------------------ scenery

export const SCENERY_DEFS: SceneryDef[] = [
  { id: 'oak', name: 'Oak Tree', cost: 28_00, kind: 'tree' },
  { id: 'pine', name: 'Pine Tree', cost: 24_00, kind: 'tree' },
  { id: 'palm', name: 'Palm Tree', cost: 32_00, kind: 'tree' },
  { id: 'bush', name: 'Round Bush', cost: 14_00, kind: 'tree' },
  { id: 'garden', name: 'Flower Garden', cost: 18_00, kind: 'garden' },
  { id: 'fence', name: 'Hedge', cost: 8_00, kind: 'fence' },
  { id: 'bench', name: 'Bench', cost: 10_00, kind: 'bench' },
  { id: 'lamp', name: 'Lamp Post', cost: 12_00, kind: 'lamp' },
  { id: 'bin', name: 'Litter Bin', cost: 11_00, kind: 'bin' },
];

export const sceneryDef = (id: string): SceneryDef => {
  const d = SCENERY_DEFS.find((s) => s.id === id);
  if (!d) throw new Error(`unknown scenery ${id}`);
  return d;
};
export const sceneryIdx = (id: string): number => SCENERY_DEFS.findIndex((s) => s.id === id);

// ------------------------------------------------------------ track pieces

export interface PieceDef {
  kind: TrackKind;
  dz: number; // height units across piece
  dirD: 0 | 1 | 3; // direction change (mod 4)
  len: number; // meters
  cost: number; // cents, before coaster type multiplier
  cells: [number, number][]; // occupied cells, canonical dir=0, relative entry
  next: [number, number]; // next piece entry cell offset, canonical dir=0
  chain?: boolean;
}

const GENTLE_LEN = Math.sqrt(4 * 4 + 2 * 2); // 4m run, 2m rise
const STEEP_LEN = Math.sqrt(4 * 4 + 4 * 4);
const TURN_LEN = (Math.PI * 2 * 2) / 4; // r=2m quarter
const TURNL_LEN = (Math.PI * 2 * 6) / 4; // r=6m quarter

export const PIECES: Record<TrackKind, PieceDef> = {
  station: { kind: 'station', dz: 0, dirD: 0, len: 4, cost: 120_00, cells: [[0, 0]], next: [1, 0] },
  flat: { kind: 'flat', dz: 0, dirD: 0, len: 4, cost: 75_00, cells: [[0, 0]], next: [1, 0] },
  up: { kind: 'up', dz: 2, dirD: 0, len: GENTLE_LEN, cost: 105_00, cells: [[0, 0]], next: [1, 0] },
  down: { kind: 'down', dz: -2, dirD: 0, len: GENTLE_LEN, cost: 105_00, cells: [[0, 0]], next: [1, 0] },
  steepUp: { kind: 'steepUp', dz: 4, dirD: 0, len: STEEP_LEN, cost: 135_00, cells: [[0, 0]], next: [1, 0] },
  steepDown: { kind: 'steepDown', dz: -4, dirD: 0, len: STEEP_LEN, cost: 135_00, cells: [[0, 0]], next: [1, 0] },
  lift: { kind: 'lift', dz: 2, dirD: 0, len: GENTLE_LEN, cost: 126_00, cells: [[0, 0]], next: [1, 0], chain: true },
  turnR: { kind: 'turnR', dz: 0, dirD: 1, len: TURN_LEN, cost: 90_00, cells: [[0, 0]], next: [0, 1] },
  turnL: { kind: 'turnL', dz: 0, dirD: 3, len: TURN_LEN, cost: 90_00, cells: [[0, 0]], next: [0, -1] },
  turnRL: { kind: 'turnRL', dz: 0, dirD: 1, len: TURNL_LEN, cost: 165_00, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], next: [1, 2] },
  turnLL: { kind: 'turnLL', dz: 0, dirD: 3, len: TURNL_LEN, cost: 165_00, cells: [[0, 0], [1, 0], [0, -1], [1, -1]], next: [1, -2] },
  brakes: { kind: 'brakes', dz: 0, dirD: 0, len: 4, cost: 114_00, cells: [[0, 0]], next: [1, 0] },
};

// rotate a canonical (dir=0) offset into direction d
export function rotOff(dx: number, dy: number, d: number): [number, number] {
  switch (d & 3) {
    case 0: return [dx, dy];
    case 1: return [-dy, dx];
    case 2: return [-dx, -dy];
    default: return [dy, -dx];
  }
}
