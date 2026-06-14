import { World, Ride, Peep, Dir, ti, inMap, DX, DY } from './types.js';
import { rideDef } from './catalog.js';
import { buildableFlat, corners } from './terrain.js';
import { addMessage } from './world.js';
import { chance } from './rng.js';
import { BREAKDOWN_CHANCE } from './constants.js';

// ---------------------------------------------------------------- placement

export function entranceSpots(size: number, x: number, y: number, n: number, rot: Dir): { ent: { x: number; y: number }; ext: { x: number; y: number } } {
  const mid = n >> 1;
  let ex = 0, ey = 0, dx = 0, dy = 0;
  if (rot === 0) { ex = x + n; ey = y + mid; dx = 0; dy = 1; }
  else if (rot === 1) { ex = x + mid; ey = y + n; dx = 1; dy = 0; }
  else if (rot === 2) { ex = x - 1; ey = y + mid; dx = 0; dy = 1; }
  else { ex = x + mid; ey = y - 1; dx = 1; dy = 0; }
  let xx = ex + dx, xy = ey + dy;
  if (!inMap(size, xx, xy)) { xx = ex - dx; xy = ey - dy; }
  return { ent: { x: ex, y: ey }, ext: { x: xx, y: xy } };
}

export function canPlaceRide(w: World, type: string, x: number, y: number, rot: Dir): boolean {
  const def = rideDef(type);
  if (!w.research.invented.includes(type)) return false;
  if (w.cash < def.cost) return false;
  const n = def.size;
  if (n < 1) return false;
  let h = -1;
  for (let dy = 0; dy < n; dy++)
    for (let dx = 0; dx < n; dx++) {
      if (!buildableFlat(w, x + dx, y + dy)) return false;
      const c = corners(w, x + dx, y + dy)[0];
      if (h === -1) h = c;
      else if (c !== h) return false;
    }
  if (def.category !== 'stall') {
    const { ent, ext } = entranceSpots(w.size, x, y, n, rot);
    if (!buildableFlat(w, ent.x, ent.y) || !buildableFlat(w, ext.x, ext.y)) return false;
    if (ent.x === ext.x && ent.y === ext.y) return false;
  }
  return true;
}

export function applyRide(w: World, type: string, x: number, y: number, rot: Dir): boolean {
  if (!canPlaceRide(w, type, x, y, rot)) return false;
  const def = rideDef(type);
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
    excitement: def.stats.e, intensity: def.stats.i, nausea: def.stats.n,
  };
  const n = def.size;
  for (let dy = 0; dy < n; dy++)
    for (let dx = 0; dx < n; dx++) w.rideAt[ti(w.size, x + dx, y + dy)] = id;
  if (def.category === 'stall') {
    // stalls face `rot`; peeps buy standing on the tile in front
    const fx = x + DX[rot], fy = y + DY[rot];
    ride.entrance = { x: fx, y: fy };
    ride.open = true; // stalls open immediately
  } else {
    const { ent, ext } = entranceSpots(w.size, x, y, n, rot);
    ride.entrance = ent;
    ride.exit = ext;
    w.rideAt[ti(w.size, ent.x, ent.y)] = id;
    w.rideAt[ti(w.size, ext.x, ext.y)] = id;
  }
  w.rides.push(ride);
  w.cash -= def.cost;
  w.curExpense += def.cost;
  addMessage(w, `${ride.name} built!`, 'info');
  return true;
}

export function applyDemolish(w: World, rideId: number): boolean {
  const idx = w.rides.findIndex((r) => r.id === rideId);
  if (idx === -1) return false;
  const ride = w.rides[idx];
  // free every tile this ride occupies
  for (let i = 0; i < w.rideAt.length; i++) if (w.rideAt[i] === rideId) w.rideAt[i] = 0;
  // release peeps
  for (const p of w.peeps) {
    if ((p.state === 'queueing' || p.state === 'riding') && p.rideId === rideId) {
      releasePeep(w, p, ride);
    }
  }
  const def = rideDef(ride.type);
  let refund = Math.floor(def.cost * 0.4);
  if (ride.track) refund = Math.floor(trackValue(ride) * 0.3);
  w.cash += refund;
  w.rides.splice(idx, 1);
  addMessage(w, `${ride.name} demolished.`, 'info');
  return true;
}

import { PIECES } from './catalog.js';
function trackValue(ride: Ride): number {
  if (!ride.track) return 0;
  const def = rideDef(ride.type);
  const mul = def.coaster?.pieceCostMul ?? 1;
  let v = 0;
  for (const p of ride.track) v += Math.floor(PIECES[p.kind].cost * mul);
  return v;
}

function releasePeep(w: World, p: Peep, ride: Ride): void {
  const at = ride.exit ?? ride.entrance ?? { x: ride.x, y: ride.y };
  p.x = at.x + 0.5;
  p.y = at.y + 0.5;
  p.tx = at.x;
  p.ty = at.y;
  p.state = 'walking';
  p.goal = 'none';
  p.plan = [];
  p.rideId = -1;
  p.queuePos = -1;
  p.cooldown = 60;
}

// ---------------------------------------------------------------- queueing

// ordered queue-path tiles walking outward from the entrance
export function queueChain(w: World, ride: Ride): number[] {
  if (!ride.entrance) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  let cx = ride.entrance.x, cy = ride.entrance.y;
  seen.add(ti(w.size, cx, cy));
  for (let step = 0; step < 40; step++) {
    let found = false;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d], ny = cy + DY[d];
      if (!inMap(w.size, nx, ny)) continue;
      const i = ti(w.size, nx, ny);
      if (seen.has(i)) continue;
      if (w.path[i] !== 2) continue;
      out.push(i);
      seen.add(i);
      cx = nx; cy = ny;
      found = true;
      break;
    }
    if (!found) break;
  }
  return out;
}

// where should the next joining peep head? null = queue full / unreachable
export function joinSpot(w: World, ride: Ride): { tile: number; pos: number } | null {
  if (!ride.entrance) return null;
  const pos = ride.queue.length;
  if (pos === 0) return { tile: ti(w.size, ride.entrance.x, ride.entrance.y), pos };
  const chain = queueChain(w, ride);
  if (pos - 1 >= chain.length) return null;
  return { tile: chain[pos - 1], pos };
}

// target tile for a peep already in the queue
export function queueTileFor(w: World, ride: Ride, pos: number): number {
  if (pos <= 0) return ti(w.size, ride.entrance!.x, ride.entrance!.y);
  const chain = queueChain(w, ride);
  const i = Math.min(pos - 1, chain.length - 1);
  return i < 0 ? ti(w.size, ride.entrance!.x, ride.entrance!.y) : chain[i];
}

// ---------------------------------------------------------------- operation

export function chargeBoard(w: World, ride: Ride, p: Peep): boolean {
  if (p.cash < ride.price) return false;
  p.cash -= ride.price;
  ride.income += ride.price;
  ride.totalCustomers++;
  ride.monthCustomers++;
  w.cash += ride.price;
  w.curIncome += ride.price;
  return true;
}

// peep at the front of the queue, standing on the entrance tile, ready to board
function nextBoarder(w: World, ride: Ride): Peep | null {
  if (ride.queue.length === 0 || !ride.entrance) return null;
  const p = w.peeps.find((q) => q.id === ride.queue[0]);
  if (!p) {
    ride.queue.shift();
    return null;
  }
  const ex = ride.entrance.x + 0.5, ey = ride.entrance.y + 0.5;
  if (Math.abs(p.x - ex) < 0.2 && Math.abs(p.y - ey) < 0.2) return p;
  return null;
}

export function boardOne(w: World, ride: Ride): boolean {
  const p = nextBoarder(w, ride);
  if (!p) return false;
  ride.queue.shift();
  for (const q of w.peeps) if (q.state === 'queueing' && q.rideId === ride.id) q.queuePos--;
  if (!chargeBoard(w, ride, p)) {
    p.state = 'walking';
    p.goal = 'none';
    p.rideId = -1;
    p.queuePos = -1;
    p.thought = 'I can’t afford that!';
    p.cooldown = 120;
    return false;
  }
  p.state = 'riding';
  p.rideId = ride.id;
  p.queuePos = -1;
  ride.riders.push(p.id);
  return true;
}

export function unloadRiders(w: World, ride: Ride): void {
  const def = rideDef(ride.type);
  const at = ride.exit ?? ride.entrance ?? { x: ride.x, y: ride.y };
  for (const id of ride.riders) {
    const p = w.peeps.find((q) => q.id === id);
    if (!p) continue;
    p.x = at.x + 0.5;
    p.y = at.y + 0.5;
    p.tx = at.x;
    p.ty = at.y;
    p.state = 'walking';
    p.goal = 'none';
    p.plan = [];
    p.rideId = -1;
    p.lastRide = ride.id;
    p.cooldown = 90;
    const exc = ride.excitement > 0 ? ride.excitement : def.stats.e;
    const inten = ride.intensity > 0 ? ride.intensity : def.stats.i;
    const naus = ride.nausea > 0 ? ride.nausea : def.stats.n;
    p.happiness = Math.min(255, p.happiness + 8 + Math.floor(exc / 28));
    const over = Math.max(0, inten - p.intensityPref - 150);
    p.nausea = Math.min(255, p.nausea + Math.floor(naus / 10) + Math.floor(over / 12));
    p.energy = Math.max(0, p.energy - 4);
    p.thought = exc > 450 ? 'That was great!' : 'That was fun';
  }
  ride.riders = [];
}

function breakdown(w: World, ride: Ride): void {
  ride.broken = true;
  ride.breakdownT = 0;
  ride.phase = 'idle';
  addMessage(w, `${ride.name} has broken down! Send a mechanic.`, 'warn');
  for (const id of ride.queue) {
    const p = w.peeps.find((q) => q.id === id);
    if (p) p.thought = 'This ride is broken down!';
  }
}

export function tickFlatRide(w: World, ride: Ride): void {
  const def = rideDef(ride.type);
  if (def.category === 'stall' || def.category === 'coaster') return;
  if (ride.broken) {
    if (ride.riders.length > 0) unloadRiders(w, ride);
    ride.phase = 'idle';
    // the occasional fed-up guest abandons the queue of a stuck ride
    if (ride.queue.length > 0 && chance(w, 0.004)) {
      const pid = ride.queue.shift()!;
      for (const q of w.peeps) if (q.state === 'queueing' && q.rideId === ride.id) q.queuePos--;
      const p = w.peeps.find((x) => x.id === pid);
      if (p) {
        p.state = 'walking'; p.goal = 'none'; p.rideId = -1; p.queuePos = -1; p.plan = [];
        p.thought = 'I gave up waiting.';
        p.happiness = Math.max(0, p.happiness - 10);
        p.cooldown = 120;
      }
    }
    return;
  }
  if (!ride.open) {
    if (ride.riders.length > 0) unloadRiders(w, ride);
    ride.phase = 'idle';
    return;
  }
  ride.timer++;
  switch (ride.phase) {
    case 'idle':
      if (ride.queue.length > 0) {
        if (chance(w, BREAKDOWN_CHANCE)) { breakdown(w, ride); break; }
        ride.phase = 'loading';
        ride.timer = 0;
      }
      break;
    case 'loading': {
      if (ride.timer % 6 === 0 && ride.riders.length < def.capacity) boardOne(w, ride);
      const full = ride.riders.length >= def.capacity;
      if ((full || ride.timer > 160) && ride.riders.length > 0) {
        ride.phase = 'running';
        ride.timer = 0;
      } else if (ride.timer > 400 && ride.riders.length === 0) {
        ride.phase = 'idle';
        ride.timer = 0;
      }
      break;
    }
    case 'running':
      if (ride.timer >= def.cycleTicks) {
        ride.phase = 'unloading';
        ride.timer = 0;
      }
      break;
    case 'unloading':
      if (ride.timer >= 14) {
        unloadRiders(w, ride);
        ride.phase = 'idle';
        ride.timer = 0;
      }
      break;
  }
}
