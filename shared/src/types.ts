// Core simulation types. The World object is fully JSON-serializable via
// serialize.ts (typed arrays converted there). Determinism: see PLAN.md.

export type Dir = 0 | 1 | 2 | 3; // grid dirs: 0:+x 1:+y 2:-x 3:-y
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

// ---------------------------------------------------------------- catalog

export type RideCategory = 'gentle' | 'thrill' | 'coaster' | 'stall';

export interface RideDef {
  id: string;
  name: string;
  category: RideCategory;
  size: number; // NxN footprint (stalls 1, coasters 0 = track-defined)
  cost: number; // build cost, cents (templates/coasters: per-piece instead)
  defaultPrice: number; // ticket / item price, cents
  capacity: number; // riders per cycle (stall: ignored)
  cycleTicks: number; // flat ride run time
  stats: { e: number; i: number; n: number }; // x100 (coasters: rated by test run)
  sells?: 'food' | 'drink' | 'toilet' | 'info';
  stockCost?: number; // cents per item sold
  coaster?: CoasterTypeDef;
}

export interface CoasterTypeDef {
  liftV: number; // chain lift speed m/s
  launchV: number; // station launch speed m/s
  cars: number;
  carCap: number; // peeps per car
  pieceCostMul: number;
  colors: [string, string]; // track / supports (render hint)
}

export interface SceneryDef {
  id: string;
  name: string;
  cost: number;
  kind: 'tree' | 'garden' | 'bench' | 'lamp' | 'bin' | 'fence';
}

// ---------------------------------------------------------------- track

export type TrackKind =
  | 'station'
  | 'flat'
  | 'up'
  | 'down'
  | 'steepUp'
  | 'steepDown'
  | 'lift'
  | 'turnR'
  | 'turnL'
  | 'turnRL' // large radius (2x2)
  | 'turnLL'
  | 'brakes';

export interface TrackPiece {
  kind: TrackKind;
  x: number; // entry cell
  y: number;
  z: number; // entry height (height units, absolute)
  dir: Dir; // entry direction
}

export interface Train {
  s: number; // front-of-train distance along circuit, meters
  v: number; // m/s
  arriving: boolean; // completed circuit, braking into station
  peeps: number[];
}

// ---------------------------------------------------------------- entities

export type RidePhase = 'idle' | 'loading' | 'running' | 'unloading';

export interface Ride {
  id: number;
  type: string; // RideDef id
  name: string;
  x: number; // anchor tile (rides/stalls); first station piece (coasters)
  y: number;
  rot: Dir;
  open: boolean;
  price: number;
  phase: RidePhase;
  timer: number;
  riders: number[];
  queue: number[]; // peep ids, [0] = front
  entrance: { x: number; y: number } | null;
  exit: { x: number; y: number } | null;
  totalCustomers: number;
  monthCustomers: number;
  income: number;
  excitement: number; // x100, -1 unrated
  intensity: number;
  nausea: number;
  // coasters only
  track?: TrackPiece[];
  trackDone?: boolean;
  train?: Train;
  testFail?: string; // last failed test reason
}

export type PeepState = 'entering' | 'walking' | 'queueing' | 'riding' | 'leaving' | 'gone';
export type PeepGoal = 'none' | 'ride' | 'food' | 'drink' | 'toilet' | 'exit';

export interface Peep {
  id: number;
  name: string;
  x: number; // world coords in tiles, tile center = n + 0.5
  y: number;
  tx: number; // tile currently walking toward
  ty: number;
  dir: Dir;
  speed: number;
  state: PeepState;
  goal: PeepGoal;
  plan: number[]; // tile indices to visit, next = plan[0] (goal-seeking)
  rideId: number; // queueing/riding
  queuePos: number;
  // needs 0..255
  hunger: number;
  thirst: number;
  toilet: number;
  energy: number;
  nausea: number;
  happiness: number;
  cash: number;
  intensityPref: number; // x100
  color: number; // shirt palette index
  holding: 0 | 1 | 2; // 0 none, 1 food, 2 drink
  holdT: number; // ticks until consumed
  thought: string;
  lastRide: number; // ride id cooldown
  cooldown: number;
  enteredTick: number;
  failedSeeks: number;
}

// ---------------------------------------------------------------- world

export interface MonthStats {
  income: number;
  expense: number;
  cash: number;
  guests: number;
}

export interface Research {
  funding: 0 | 1 | 2 | 3;
  progress: number;
  pending: string[]; // ride def ids in invention order
  invented: string[]; // ride def ids available to build
}

export interface ParkInfo {
  name: string;
  rating: number;
  entranceFee: number;
  marketingTicks: number;
  entrance: { x: number; y: number }; // gate tile (on path)
  spawn: { x: number; y: number }; // map-edge tile where peeps appear
  guestsTotal: number; // lifetime entries
}

export interface Message {
  tick: number;
  text: string;
  kind: 'info' | 'award' | 'research' | 'warn' | 'money';
}

export interface World {
  seed: number;
  rngState: number;
  tick: number;
  size: number;
  // terrain: vertex heights (size+1)^2; rest are per-tile size^2
  heights: Uint8Array;
  water: Uint8Array; // water surface level (0 = dry)
  path: Uint8Array; // 0 none, 1 footpath, 2 queue
  pathAdd: Uint8Array; // 0 none, 1 bench, 2 lamp, 3 bin
  scen: Uint8Array; // scenery def index + 1
  litter: Uint8Array;
  rideAt: Int16Array; // ride id + 1 occupying tile (footprint/track/ent/exit)
  rides: Ride[];
  peeps: Peep[];
  cash: number;
  loan: number;
  curIncome: number;
  curExpense: number;
  months: MonthStats[];
  research: Research;
  park: ParkInfo;
  messages: Message[];
  nextRideId: number;
  nextPeepId: number;
}

// ---------------------------------------------------------------- commands

export type Command =
  | { t: 'land'; vx: number; vy: number; d: 1 | -1; brush: number }
  | { t: 'water'; x: number; y: number; d: 1 | -1; brush: number }
  | { t: 'path'; x: number; y: number; kind: 1 | 2 }
  | { t: 'unpath'; x: number; y: number }
  | { t: 'scenery'; x: number; y: number; type: string }
  | { t: 'unscenery'; x: number; y: number }
  | { t: 'ride'; type: string; x: number; y: number; rot: Dir }
  | { t: 'demolish'; rideId: number }
  | { t: 'rideSet'; rideId: number; open?: boolean; price?: number; name?: string }
  | { t: 'trackStart'; type: string; x: number; y: number; rot: Dir }
  | { t: 'trackAdd'; rideId: number; kind: TrackKind }
  | { t: 'trackBack'; rideId: number }
  | { t: 'trackCancel'; rideId: number }
  | { t: 'trackDone'; rideId: number }
  | { t: 'template'; tpl: string; x: number; y: number }
  | { t: 'research'; funding: 0 | 1 | 2 | 3 }
  | { t: 'park'; fee?: number; name?: string }
  | { t: 'marketing' }
  | { t: 'loan'; d: 1 | -1 }
  | { t: 'sweep'; x: number; y: number };

// helpers
export const ti = (size: number, x: number, y: number) => y * size + x;
export const vi = (size: number, vx: number, vy: number) => vy * (size + 1) + vx;
export const inMap = (size: number, x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size;
