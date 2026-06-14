import { World, Staff, StaffKind, Dir, ti, inMap, DX, DY } from './types.js';
import { rngInt } from './rng.js';
import { findPath, isWalkable } from './path.js';
import { STAFF_SPEED, STAFF_HIRE_COST, GUARD_RADIUS, REPAIR_TICKS } from './constants.js';
import { addMessage } from './world.js';

// Park staff: handymen (clean litter + sick), mechanics (repair breakdowns),
// security guards (calm guests / deter mess nearby). All movement + decisions
// are deterministic (rng in world state, no trig) so they replay in lockstep.

export function staffLabel(kind: StaffKind): string {
  return kind === 'handyman' ? 'Handyman' : kind === 'mechanic' ? 'Mechanic' : 'Security guard';
}

export function applyHireStaff(w: World, kind: StaffKind, x: number, y: number): boolean {
  if (!inMap(w.size, x, y) || !isWalkable(w, x, y)) return false;
  const cost = STAFF_HIRE_COST[kind];
  if (w.cash < cost) return false;
  w.cash -= cost;
  w.curExpense += cost;
  const s: Staff = {
    id: w.nextStaffId++, kind,
    x: x + 0.5, y: y + 0.5, tx: x, ty: y, dir: 1,
    state: 'walking', plan: [], targetRide: 0, workT: 0, repathT: 0,
  };
  w.staff.push(s);
  addMessage(w, `${staffLabel(kind)} hired.`, 'info');
  return true;
}

export function applyFireStaff(w: World, staffId: number): boolean {
  const i = w.staff.findIndex((s) => s.id === staffId);
  if (i < 0) return false;
  w.staff.splice(i, 1);
  return true;
}

// is there a security guard within GUARD_RADIUS of (x,y)? (Manhattan)
export function guardNear(w: World, x: number, y: number): boolean {
  for (const s of w.staff) {
    if (s.kind !== 'security') continue;
    if (Math.abs((s.x | 0) - x) + Math.abs((s.y | 0) - y) <= GUARD_RADIUS) return true;
  }
  return false;
}

// ---------------------------------------------------------------- movement

const atCenter = (s: Staff) => Math.abs(s.x - (s.tx + 0.5)) < 0.001 && Math.abs(s.y - (s.ty + 0.5)) < 0.001;

function walk(w: World, s: Staff): void {
  const gx = s.tx + 0.5, gy = s.ty + 0.5;
  const dx = gx - s.x, dy = gy - s.y;
  if (Math.abs(dx) + Math.abs(dy) <= STAFF_SPEED) {
    s.x = gx; s.y = gy;
    if (s.plan.length > 0) {
      const n = s.plan.shift()!;
      s.tx = n % w.size;
      s.ty = (n / w.size) | 0;
      s.dir = (s.tx > (n % w.size) ? 2 : 0) as Dir; // overwritten below by axis
    }
    return;
  }
  if (Math.abs(dx) > Math.abs(dy)) { s.x += Math.sign(dx) * STAFF_SPEED; s.dir = (dx > 0 ? 0 : 2) as Dir; }
  else { s.y += Math.sign(dy) * STAFF_SPEED; s.dir = (dy > 0 ? 1 : 3) as Dir; }
}

function wander(w: World, s: Staff): void {
  const back = (s.dir + 2) & 3;
  const opts: number[] = [];
  for (let d = 0; d < 4; d++) {
    if (d === back) continue;
    if (isWalkable(w, s.tx + DX[d], s.ty + DY[d])) opts.push(d);
  }
  let d: number;
  if (opts.length > 0) d = opts[rngInt(w, opts.length)];
  else if (isWalkable(w, s.tx + DX[back], s.ty + DY[back])) d = back;
  else return; // stranded
  s.tx += DX[d];
  s.ty += DY[d];
}

// ---------------------------------------------------------------- per-role AI

function brokenRideAdjacent(w: World, x: number, y: number): number {
  for (const r of w.rides) {
    if (!r.broken) continue;
    for (const spot of [r.entrance, r.exit]) {
      if (spot && Math.abs(spot.x - x) + Math.abs(spot.y - y) <= 1) return r.id;
    }
  }
  return 0;
}

function tickHandyman(w: World, s: Staff): void {
  const i = ti(w.size, s.tx, s.ty);
  if (w.vomit[i] > 0) { w.vomit[i] = 0; s.state = 'working'; s.workT = 10; return; }
  if (w.litter[i] > 0) { w.litter[i] = Math.max(0, w.litter[i] - 2); s.state = 'working'; if (w.litter[i] > 0) return; }
  if (s.workT > 0) { s.workT--; return; }
  s.state = 'walking';
  if (s.repathT === 0) {
    s.repathT = 10;
    const plan = findPath(w, s.tx, s.ty, (x, y) => { const j = ti(w.size, x, y); return w.litter[j] > 0 || w.vomit[j] > 0; }, 48);
    if (plan && plan.length > 0) { s.plan = plan; return; }
  }
  wander(w, s);
}

function tickMechanic(w: World, s: Staff): void {
  const rid = brokenRideAdjacent(w, s.tx, s.ty);
  if (rid !== 0) {
    const r = w.rides.find((x) => x.id === rid);
    if (r && r.broken) {
      s.state = 'working';
      s.targetRide = rid;
      r.breakdownT = (r.breakdownT ?? 0) + 1;
      if (r.breakdownT >= REPAIR_TICKS) {
        r.broken = false;
        r.breakdownT = 0;
        addMessage(w, `${r.name} has been fixed.`, 'info');
        s.targetRide = 0;
        s.state = 'walking';
      }
      return;
    }
  }
  s.state = 'walking';
  s.targetRide = 0;
  if (s.repathT === 0) {
    s.repathT = 12;
    const plan = findPath(w, s.tx, s.ty, (x, y) => brokenRideAdjacent(w, x, y) !== 0, 56);
    if (plan && plan.length > 0) { s.plan = plan; return; }
  }
  wander(w, s);
}

export function tickStaff(w: World): void {
  for (const s of w.staff) {
    if (s.repathT > 0) s.repathT--;
    if (s.plan.length === 0 && atCenter(s)) {
      if (s.kind === 'handyman') tickHandyman(w, s);
      else if (s.kind === 'mechanic') tickMechanic(w, s);
      else { s.state = 'walking'; wander(w, s); } // security patrols; effect via guardNear
    }
    walk(w, s);
  }
}
