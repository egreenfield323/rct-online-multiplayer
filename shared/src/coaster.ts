import { World, Ride, TrackPiece, TrackKind, Dir, ti, inMap, DX, DY } from './types.js';
import { PIECES, rideDef, rotOff } from './catalog.js';
import { tileMaxH, tileMinH, isFlat, buildableFlat } from './terrain.js';
import { addMessage } from './world.js';
import { unloadRiders, boardOne } from './rides.js';
import { MAX_H, HU_M } from './constants.js';

export const MAX_TRACK_PIECES = 140;
const DT = 0.05; // physics step, seconds (one tick)

// ---------------------------------------------------------------- geometry

export interface Cursor { x: number; y: number; z: number; dir: Dir }

export function pieceExit(p: TrackPiece): Cursor {
  const def = PIECES[p.kind];
  const [ox, oy] = rotOff(def.next[0], def.next[1], p.dir);
  return { x: p.x + ox, y: p.y + oy, z: p.z + def.dz, dir: ((p.dir + def.dirD) & 3) as Dir };
}

export function pieceCells(p: TrackPiece): [number, number][] {
  const def = PIECES[p.kind];
  return def.cells.map(([dx, dy]) => {
    const [ox, oy] = rotOff(dx, dy, p.dir);
    return [p.x + ox, p.y + oy] as [number, number];
  });
}

export function trackEnd(ride: Ride): Cursor | null {
  if (!ride.track || ride.track.length === 0) return null;
  return pieceExit(ride.track[ride.track.length - 1]);
}

export function isClosed(ride: Ride): boolean {
  const end = trackEnd(ride);
  const first = ride.track?.[0];
  if (!end || !first) return false;
  return end.x === first.x && end.y === first.y && end.z === first.z && end.dir === first.dir;
}

export function trackLengths(ride: Ride): { lens: number[]; total: number } {
  const lens: number[] = [];
  let total = 0;
  for (const p of ride.track!) {
    lens.push(total);
    total += PIECES[p.kind].len;
  }
  return { lens, total };
}

export function pieceAt(ride: Ride, s: number): { idx: number; t: number } {
  const { lens, total } = trackLengths(ride);
  let ss = s % total;
  if (ss < 0) ss += total;
  for (let i = lens.length - 1; i >= 0; i--) {
    if (ss >= lens[i]) {
      const len = PIECES[ride.track![i].kind].len;
      return { idx: i, t: Math.min(1, (ss - lens[i]) / len) };
    }
  }
  return { idx: 0, t: 0 };
}

// ---------------------------------------------------------------- validation

export function pieceError(w: World, ride: Ride, kind: TrackKind, cur: Cursor): string | null {
  const def = PIECES[kind];
  const typeDef = rideDef(ride.type);
  const cost = Math.floor(def.cost * (typeDef.coaster?.pieceCostMul ?? 1));
  if (!ride.track) return 'no track';
  if (ride.track.length >= MAX_TRACK_PIECES) return 'track too long';
  if (w.cash < cost) return 'not enough cash';
  if (kind === 'station') {
    // stations: only as a contiguous run at the start of the track
    if (!ride.track.every((p) => p.kind === 'station')) return 'stations must be at the start';
    if (ride.track.length >= 7) return 'station too long';
  }
  if (cur.z + Math.min(0, def.dz) < 0 || cur.z + Math.max(0, def.dz) > MAX_H + 14) return 'height limit';
  const piece: TrackPiece = { kind, x: cur.x, y: cur.y, z: cur.z, dir: cur.dir };
  const minZ = cur.z + Math.min(0, def.dz);
  for (const [cx, cy] of pieceCells(piece)) {
    if (!inMap(w.size, cx, cy)) return 'outside the park';
    const ground = tileMaxH(w, cx, cy);
    const i = ti(w.size, cx, cy);
    if (kind === 'station') {
      if (!isFlat(w, cx, cy) || cur.z !== ground) return 'station must sit on flat ground';
      if (w.path[i] !== 0) return 'blocked by path';
    } else {
      if (minZ < ground) return 'clipping the ground';
      if (w.path[i] !== 0 && minZ < ground + 2) return 'too low over path';
    }
    if (w.scen[i] !== 0) return 'blocked by scenery';
    if (w.rideAt[i] !== 0 && w.rideAt[i] !== ride.id) return 'blocked by another ride';
    if (w.water[i] > tileMinH(w, cx, cy) && minZ < w.water[i] + 1) return 'too low over water';
  }
  return null;
}

function remarkTrack(w: World, ride: Ride): void {
  for (let i = 0; i < w.rideAt.length; i++) if (w.rideAt[i] === ride.id) w.rideAt[i] = 0;
  for (const p of ride.track ?? []) for (const [cx, cy] of pieceCells(p)) w.rideAt[ti(w.size, cx, cy)] = ride.id;
  if (ride.entrance) w.rideAt[ti(w.size, ride.entrance.x, ride.entrance.y)] = ride.id;
  if (ride.exit) w.rideAt[ti(w.size, ride.exit.x, ride.exit.y)] = ride.id;
}

// ---------------------------------------------------------------- building

export function applyTrackStart(w: World, type: string, x: number, y: number, rot: Dir): boolean {
  const def = rideDef(type);
  if (!def.coaster || !w.research.invented.includes(type)) return false;
  if (!buildableFlat(w, x, y)) return false;
  const cost = Math.floor(PIECES.station.cost * def.coaster.pieceCostMul);
  if (w.cash < cost) return false;
  const z = tileMaxH(w, x, y);
  const id = w.nextRideId++;
  const count = w.rides.filter((r) => r.type === type).length + 1;
  const ride: Ride = {
    id, type, name: `${def.name} ${count}`,
    x, y, rot,
    open: false,
    price: def.defaultPrice,
    phase: 'idle', timer: 0,
    riders: [], queue: [],
    entrance: null, exit: null,
    totalCustomers: 0, monthCustomers: 0, income: 0,
    excitement: -1, intensity: -1, nausea: -1,
    track: [{ kind: 'station', x, y, z, dir: rot }],
    trackDone: false,
  };
  w.rides.push(ride);
  w.rideAt[ti(w.size, x, y)] = id;
  w.cash -= cost;
  w.curExpense += cost;
  return true;
}

export function applyTrackAdd(w: World, rideId: number, kind: TrackKind): boolean {
  const ride = w.rides.find((r) => r.id === rideId);
  if (!ride || !ride.track || ride.trackDone) return false;
  const cur = trackEnd(ride)!;
  if (pieceError(w, ride, kind, cur) !== null) return false;
  const def = rideDef(ride.type);
  const cost = Math.floor(PIECES[kind].cost * (def.coaster?.pieceCostMul ?? 1));
  const piece: TrackPiece = { kind, x: cur.x, y: cur.y, z: cur.z, dir: cur.dir };
  ride.track.push(piece);
  for (const [cx, cy] of pieceCells(piece)) w.rideAt[ti(w.size, cx, cy)] = ride.id;
  w.cash -= cost;
  w.curExpense += cost;
  return true;
}

export function applyTrackBack(w: World, rideId: number): boolean {
  const ride = w.rides.find((r) => r.id === rideId);
  if (!ride || !ride.track || ride.trackDone || ride.track.length <= 1) return false;
  const piece = ride.track.pop()!;
  const def = rideDef(ride.type);
  const refund = Math.floor(PIECES[piece.kind].cost * (def.coaster?.pieceCostMul ?? 1));
  w.cash += refund;
  remarkTrack(w, ride);
  return true;
}

export function applyTrackCancel(w: World, rideId: number): boolean {
  const ride = w.rides.find((r) => r.id === rideId);
  if (!ride || !ride.track || ride.trackDone) return false;
  const def = rideDef(ride.type);
  const mul = def.coaster?.pieceCostMul ?? 1;
  let refund = 0;
  for (const p of ride.track) refund += Math.floor(PIECES[p.kind].cost * mul);
  w.cash += Math.floor(refund * 0.7);
  for (let i = 0; i < w.rideAt.length; i++) if (w.rideAt[i] === rideId) w.rideAt[i] = 0;
  w.rides.splice(w.rides.findIndex((r) => r.id === rideId), 1);
  return true;
}

export function applyTrackDone(w: World, rideId: number): boolean {
  const ride = w.rides.find((r) => r.id === rideId);
  if (!ride || !ride.track || ride.trackDone) return false;
  if (!isClosed(ride)) return false;
  // entrance + exit beside the station run
  const stations = ride.track.filter((p) => p.kind === 'station');
  if (stations.length === 0) return false;
  const first = stations[0];
  const last = stations[stations.length - 1];
  const ent = sideTile(w, ride, first);
  const ext = sideTile(w, ride, last, ent);
  if (!ent || !ext) {
    ride.testFail = 'No room for entrance/exit beside the station';
    addMessage(w, `${ride.name}: no room for entrance/exit!`, 'warn');
    return false;
  }
  ride.entrance = ent;
  ride.exit = ext;
  ride.trackDone = true;
  // test run → ratings
  const res = testRun(ride);
  if (!res.ok) {
    ride.testFail = res.reason;
    addMessage(w, `${ride.name} failed testing: ${res.reason}`, 'warn');
  } else {
    ride.testFail = undefined;
    ride.excitement = res.e;
    ride.intensity = res.i;
    ride.nausea = res.n;
    addMessage(w, `${ride.name} testing complete! Excitement: ${(res.e / 100).toFixed(2)}`, 'info');
  }
  ride.train = { s: stopPoint(ride), v: 0, arriving: false, peeps: [] };
  remarkTrack(w, ride);
  return true;
}

function sideTile(
  w: World,
  ride: Ride,
  piece: TrackPiece,
  not?: { x: number; y: number } | null,
): { x: number; y: number } | null {
  for (const side of [1, 3]) {
    const d = (piece.dir + side) & 3;
    const x = piece.x + DX[d], y = piece.y + DY[d];
    if (!inMap(w.size, x, y)) continue;
    if (not && not.x === x && not.y === y) continue;
    const i = ti(w.size, x, y);
    if (w.rideAt[i] !== 0 || w.scen[i] !== 0 || w.path[i] !== 0) continue;
    if (!isFlat(w, x, y) || tileMaxH(w, x, y) !== piece.z) continue;
    return { x, y };
  }
  return null;
}

// ---------------------------------------------------------------- physics

function stationRunLen(ride: Ride): number {
  let n = 0;
  for (const p of ride.track!) {
    if (p.kind === 'station') n++;
    else break;
  }
  return n * PIECES.station.len;
}

export function stopPoint(ride: Ride): number {
  return Math.max(1, stationRunLen(ride) - 1.2);
}

interface RunStats {
  ok: boolean;
  reason?: string;
  e: number;
  i: number;
  n: number;
  maxV: number;
  time: number;
}

// deterministic point-mass run around the circuit (used to rate + validate)
export function testRun(ride: Ride): RunStats {
  const def = rideDef(ride.type);
  const c = def.coaster!;
  const { total } = trackLengths(ride);
  let s = stopPoint(ride);
  let v = c.launchV;
  let maxV = 0;
  let maxLat = 0;
  let latSum = 0;
  let steps = 0;
  const start = s;
  let traveled = 0;
  while (traveled < total && steps < 12000) {
    steps++;
    const { idx } = pieceAt(ride, s);
    const p = ride.track![idx];
    const pd = PIECES[p.kind];
    const slope = (pd.dz * HU_M) / pd.len;
    let a = -9.81 * slope * 0.92 - 0.10 - 0.011 * v - 0.0009 * v * v;
    v += a * DT;
    if (pd.chain || p.kind === 'station') v = Math.max(v, c.liftV);
    if (p.kind === 'brakes') v = Math.max(2.0, v - 0.45);
    v = Math.min(v, 34);
    if (v < 0.12) return { ok: false, reason: 'train valleys — needs more height or a lift', e: 0, i: 0, n: 0, maxV, time: steps };
    if (pd.dirD !== 0) {
      const r = pd.len > 5 ? 6 : 2;
      const lat = (v * v) / r / 9.81;
      maxLat = Math.max(maxLat, lat);
      latSum += lat * DT;
    }
    maxV = Math.max(maxV, v);
    s += v * DT;
    traveled = s - start;
  }
  if (traveled < total) return { ok: false, reason: 'test timed out', e: 0, i: 0, n: 0, maxV, time: steps };
  // piece-sequence stats
  let drops = 0, maxDrop = 0, run = 0, steepN = 0, turns = 0;
  for (const p of ride.track!) {
    const dz = PIECES[p.kind].dz;
    if (PIECES[p.kind].dirD !== 0) turns++;
    if (p.kind === 'steepUp' || p.kind === 'steepDown') steepN++;
    if (dz < 0) run += -dz;
    else {
      if (run > 0) { drops++; maxDrop = Math.max(maxDrop, run); }
      run = 0;
    }
  }
  if (run > 0) { drops++; maxDrop = Math.max(maxDrop, run); }
  const len = total;
  let e = 110 + maxV * 16 + maxDrop * 9 + drops * 20 + Math.min(150, len * 0.32) + Math.min(130, latSum * 26) + turns * 4;
  let i = 35 + maxV * 19 + maxDrop * 11 + steepN * 14 + maxLat * 95;
  let n = 25 + maxLat * 70 + drops * 9 + i * 0.22;
  e = Math.round(Math.max(50, Math.min(1100, e)));
  i = Math.round(Math.max(30, Math.min(1100, i)));
  n = Math.round(Math.max(15, Math.min(1000, n)));
  return { ok: true, e, i, n, maxV, time: steps };
}

// ---------------------------------------------------------------- operation

export function tickCoaster(w: World, ride: Ride): void {
  if (!ride.trackDone || !ride.train) return;
  const def = rideDef(ride.type);
  const c = def.coaster!;
  const train = ride.train;
  const { total } = trackLengths(ride);
  const stopS = stopPoint(ride);
  const capacity = c.cars * c.carCap;

  if (!ride.open) {
    if (ride.riders.length > 0 && train.v === 0) {
      unloadRiders(w, ride);
      train.peeps = [];
    }
    ride.phase = 'idle';
    return;
  }

  if (train.v === 0 && !train.arriving) {
    // parked at the station: load
    ride.timer++;
    if (ride.phase === 'unloading') {
      if (ride.timer > 16) {
        unloadRiders(w, ride);
        train.peeps = [];
        ride.phase = 'loading';
        ride.timer = 0;
      }
      return;
    }
    ride.phase = 'loading';
    if (ride.timer % 6 === 0 && ride.riders.length < capacity) {
      if (boardOne(w, ride)) train.peeps = [...ride.riders];
    }
    const full = ride.riders.length >= capacity;
    if ((full || ride.timer > 220) && ride.riders.length > 0) {
      ride.phase = 'running';
      ride.timer = 0;
      train.v = c.launchV;
    }
    return;
  }

  // moving
  const { idx } = pieceAt(ride, train.s);
  const p = ride.track![idx];
  const pd = PIECES[p.kind];
  if (train.arriving) {
    train.v = Math.max(0.9, train.v - 0.5);
    if (train.s >= stopS) {
      train.s = stopS;
      train.v = 0;
      train.arriving = false;
      ride.phase = 'unloading';
      ride.timer = 0;
      return;
    }
  } else {
    const slope = (pd.dz * HU_M) / pd.len;
    const a = -9.81 * slope * 0.92 - 0.10 - 0.011 * train.v - 0.0009 * train.v * train.v;
    train.v += a * DT;
    if (pd.chain || p.kind === 'station') train.v = Math.max(train.v, c.liftV);
    if (p.kind === 'brakes') train.v = Math.max(2.0, train.v - 0.45);
    train.v = Math.min(train.v, 34);
    if (train.v < 0.1) train.v = 0.6; // operational nudge (validated tracks shouldn't stall)
  }
  train.s += train.v * DT;
  if (train.s >= total) {
    train.s -= total;
    train.arriving = true;
  }
}
