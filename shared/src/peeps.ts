import { World, Peep, Ride, ti, inMap, DX, DY } from './types.js';
import { rngNext, rngInt, chance, pick } from './rng.js';
import { rideDef } from './catalog.js';
import { findPath, isWalkable } from './path.js';
import { joinSpot, queueTileFor } from './rides.js';
import { PEEP_SPEED_BASE, QUEUE_MAX, MAX_PEEPS } from './constants.js';
import { addMessage } from './world.js';

// ---------------------------------------------------------------- spawning

export function spawnPeep(w: World): Peep | null {
  if (w.peeps.length >= MAX_PEEPS) return null;
  const fee = w.park.entranceFee;
  const cash = 3000 + rngInt(w, 5000); // $30–$80
  if (cash < fee + 800) return null; // can't afford the gate, walks on by
  const id = w.nextPeepId++;
  const p: Peep = {
    id,
    name: `Guest ${id}`,
    x: w.park.spawn.x + 0.5,
    y: w.park.spawn.y + 0.5,
    tx: w.park.spawn.x,
    ty: w.park.spawn.y,
    dir: 3,
    speed: PEEP_SPEED_BASE * (0.85 + rngNext(w) * 0.3),
    state: 'entering',
    goal: 'none',
    plan: [],
    rideId: -1,
    queuePos: -1,
    hunger: 60 + rngInt(w, 60),
    thirst: 60 + rngInt(w, 60),
    toilet: 30 + rngInt(w, 60),
    energy: 200 + rngInt(w, 55),
    nausea: 0,
    happiness: 160 + rngInt(w, 40),
    cash,
    intensityPref: 150 + rngInt(w, 500),
    color: rngInt(w, 8),
    holding: 0,
    holdT: 0,
    thought: '',
    lastRide: -1,
    cooldown: 0,
    enteredTick: w.tick,
    failedSeeks: 0,
  };
  w.peeps.push(p);
  return p;
}

// ---------------------------------------------------------------- helpers

function stallSelling(w: World, x: number, y: number, sells: string): Ride | null {
  for (const r of w.rides) {
    if (!r.open || !r.entrance) continue;
    const def = rideDef(r.type);
    if (def.category !== 'stall' || def.sells !== sells) continue;
    if (r.entrance.x === x && r.entrance.y === y) return r;
  }
  return null;
}

function rideEntranceAt(w: World, x: number, y: number, p: Peep): Ride | null {
  for (const r of w.rides) {
    if (!r.open || !r.entrance) continue;
    const def = rideDef(r.type);
    if (def.category === 'stall') continue;
    if (r.entrance.x !== x || r.entrance.y !== y) continue;
    if (r.id === p.lastRide) continue;
    if (r.queue.length >= QUEUE_MAX) continue;
    if (r.intensity > p.intensityPref + 250) continue; // too scary
    if (r.intensity >= 0 && r.intensity < p.intensityPref - 420) continue; // too boring
    if (r.price > p.cash) continue;
    return r;
  }
  return null;
}

// walk toward the center of (tx, ty); true when arrived
function stepWalk(p: Peep): boolean {
  const gx = p.tx + 0.5, gy = p.ty + 0.5;
  const dx = gx - p.x, dy = gy - p.y;
  if (Math.abs(dx) + Math.abs(dy) <= p.speed) {
    p.x = gx;
    p.y = gy;
    return true;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    p.x += Math.sign(dx) * p.speed;
    p.dir = dx > 0 ? 0 : 2;
  } else {
    p.y += Math.sign(dy) * p.speed;
    p.dir = dy > 0 ? 1 : 3;
  }
  return false;
}

function setPlan(p: Peep, plan: number[] | null): boolean {
  if (!plan) {
    p.failedSeeks++;
    return false;
  }
  p.plan = plan;
  p.failedSeeks = 0;
  return true;
}

// random junction step: prefer not turning straight back
function wanderStep(w: World, p: Peep): void {
  const opts: number[] = [];
  const back = (p.dir + 2) & 3;
  for (let d = 0; d < 4; d++) {
    if (d === back) continue;
    if (isWalkable(w, p.tx + DX[d], p.ty + DY[d])) opts.push(d);
  }
  let d: number;
  if (opts.length > 0) d = opts[rngInt(w, opts.length)];
  else if (isWalkable(w, p.tx + DX[back], p.ty + DY[back])) d = back;
  else return; // stranded — stand still
  p.tx += DX[d];
  p.ty += DY[d];
  p.dir = d as Peep['dir'];
}

// ---------------------------------------------------------------- needs

function tickNeeds(w: World, p: Peep): void {
  if ((w.tick + p.id) % 8 !== 0) return; // needs drift ~2.5×/sec
  p.hunger = Math.min(255, p.hunger + 1);
  p.thirst = Math.min(255, p.thirst + (p.holding === 1 ? 2 : 1));
  if (p.state === 'walking' || p.state === 'entering' || p.state === 'leaving')
    p.energy = Math.max(0, p.energy - 1);
  if (p.hunger > 200 || p.thirst > 200 || p.toilet > 200) p.happiness = Math.max(0, p.happiness - 2);
  p.nausea = Math.max(0, p.nausea - 1);
  if (p.nausea > 180) p.happiness = Math.max(0, p.happiness - 2);
  if (p.hunger > 100 || p.thirst > 100) p.toilet = Math.min(255, p.toilet + 1);

  // eating / drinking in hand
  if (p.holding !== 0) {
    p.holdT -= 8;
    if (p.holdT <= 0) {
      if (p.holding === 1) p.hunger = Math.max(0, p.hunger - 130);
      else p.thirst = Math.max(0, p.thirst - 130);
      p.happiness = Math.min(255, p.happiness + 10);
      p.holding = 0;
      const i = ti(w.size, p.tx, p.ty);
      if (inMap(w.size, p.tx, p.ty) && w.path[i] !== 0 && w.pathAdd[i] !== 3 && chance(w, 0.55)) {
        w.litter[i] = Math.min(255, w.litter[i] + 1);
      }
    }
  }

  // queasy stomach
  if (p.nausea > 210 && chance(w, 0.05)) {
    const i = ti(w.size, p.tx, p.ty);
    if (inMap(w.size, p.tx, p.ty) && w.path[i] !== 0) w.litter[i] = Math.min(255, w.litter[i] + 2);
    p.nausea -= 70;
    p.happiness = Math.max(0, p.happiness - 14);
    p.thought = 'I feel sick…';
  }

  // grumble about mess underfoot
  if (inMap(w.size, p.tx, p.ty) && w.litter[ti(w.size, p.tx, p.ty)] >= 3 && chance(w, 0.1)) {
    p.happiness = Math.max(0, p.happiness - 3);
    p.thought = 'This path is disgusting!';
  }
}

// ---------------------------------------------------------------- goal AI

const EXIT_AFTER = 26_000; // ticks in park before heading home (~20 min real)

function chooseGoal(w: World, p: Peep): void {
  if (p.cooldown > 0) return;
  const tired = p.energy < 30 || p.happiness < 40 || p.cash < 300;
  const overstayed = w.tick - p.enteredTick > EXIT_AFTER;
  if (tired || overstayed || p.failedSeeks > 6) {
    p.goal = 'exit';
    p.thought = tired ? 'I want to go home' : 'What a great day out!';
    seek(w, p, (x, y) => x === w.park.entrance.x && y === w.park.entrance.y);
    return;
  }
  if (p.toilet > 170) {
    p.goal = 'toilet';
    if (!seek(w, p, (x, y) => stallSelling(w, x, y, 'toilet') !== null)) p.thought = 'I need the toilet!';
    return;
  }
  if (p.hunger > 150 && p.holding === 0) {
    p.goal = 'food';
    if (!seek(w, p, (x, y) => stallSelling(w, x, y, 'food') !== null)) p.thought = 'I’m hungry';
    return;
  }
  if (p.thirst > 150 && p.holding === 0) {
    p.goal = 'drink';
    if (!seek(w, p, (x, y) => stallSelling(w, x, y, 'drink') !== null)) p.thought = 'I’m thirsty';
    return;
  }
  // fancy a ride?
  if (p.cooldown === 0 && chance(w, 0.25)) {
    p.goal = 'ride';
    if (seek(w, p, (x, y) => rideEntranceAt(w, x, y, p) !== null)) return;
    p.goal = 'none';
  }
  p.cooldown = 40 + rngInt(w, 60);
}

function seek(w: World, p: Peep, goal: (x: number, y: number) => boolean): boolean {
  const plan = findPath(w, p.tx, p.ty, goal);
  if (!setPlan(p, plan)) {
    p.goal = 'none';
    p.cooldown = 80 + rngInt(w, 80);
    return false;
  }
  return true;
}

// at the plan's destination: act on the goal
function arrive(w: World, p: Peep): void {
  const x = p.tx, y = p.ty;
  switch (p.goal) {
    case 'food':
    case 'drink': {
      const stall = stallSelling(w, x, y, p.goal);
      if (stall && p.cash >= stall.price) {
        buy(w, p, stall);
        p.holding = p.goal === 'food' ? 1 : 2;
        p.holdT = 350 + rngInt(w, 150);
        p.thought = p.goal === 'food' ? 'Mmm, tasty!' : 'Nice and refreshing';
      }
      break;
    }
    case 'toilet': {
      const stall = stallSelling(w, x, y, 'toilet');
      if (stall && p.cash >= stall.price) {
        buy(w, p, stall);
        p.toilet = 10 + rngInt(w, 20);
      }
      break;
    }
    case 'ride': {
      const ride = rideEntranceAt(w, x, y, p);
      if (ride) {
        const spot = joinSpot(w, ride);
        if (spot) {
          ride.queue.push(p.id);
          p.state = 'queueing';
          p.rideId = ride.id;
          p.queuePos = spot.pos;
          p.goal = 'none';
          p.plan = [];
          return;
        }
      }
      break;
    }
    case 'exit': {
      if (x === w.park.entrance.x && y === w.park.entrance.y) {
        p.state = 'leaving';
        p.tx = w.park.spawn.x;
        p.ty = w.park.spawn.y;
        p.plan = [];
        p.goal = 'none';
        return;
      }
      break;
    }
  }
  p.goal = 'none';
  p.cooldown = 50 + rngInt(w, 50);
}

function buy(w: World, p: Peep, stall: Ride): void {
  const def = rideDef(stall.type);
  p.cash -= stall.price;
  stall.income += stall.price;
  stall.totalCustomers++;
  stall.monthCustomers++;
  w.cash += stall.price - (def.stockCost ?? 0);
  w.curIncome += stall.price;
  w.curExpense += def.stockCost ?? 0;
  p.happiness = Math.min(255, p.happiness + 4);
}

// ---------------------------------------------------------------- main tick

export function tickPeeps(w: World): void {
  for (const p of w.peeps) {
    if (p.state === 'gone' || p.state === 'riding') continue;
    if (p.cooldown > 0) p.cooldown--;
    tickNeeds(w, p);

    switch (p.state) {
      case 'entering': {
        if (!stepWalk(p)) break;
        if (p.tx === w.park.entrance.x && p.ty === w.park.entrance.y) {
          p.cash -= w.park.entranceFee;
          w.cash += w.park.entranceFee;
          w.curIncome += w.park.entranceFee;
          w.park.guestsTotal++;
          p.state = 'walking';
          p.thought = 'This place looks fun!';
        } else {
          // march straight up the promenade toward the gate
          if (p.ty > w.park.entrance.y) { p.ty--; p.dir = 3; }
          else if (p.tx !== w.park.entrance.x) { p.tx += Math.sign(w.park.entrance.x - p.tx); }
          else p.ty--;
        }
        break;
      }
      case 'walking': {
        if (!stepWalk(p)) break;
        if (p.plan.length > 0) {
          const next = p.plan.shift()!;
          p.tx = next % w.size;
          p.ty = (next / w.size) | 0;
        } else if (p.goal !== 'none') {
          arrive(w, p);
        } else {
          chooseGoal(w, p);
          if (p.plan.length > 0) {
            const next = p.plan.shift()!;
            p.tx = next % w.size;
            p.ty = (next / w.size) | 0;
          } else if (p.state === 'walking') {
            wanderStep(w, p);
          }
        }
        break;
      }
      case 'queueing': {
        const ride = w.rides.find((r) => r.id === p.rideId);
        if (!ride || !ride.open || !ride.entrance) {
          // ride closed under us — give up
          if (ride) {
            const qi = ride.queue.indexOf(p.id);
            if (qi >= 0) {
              ride.queue.splice(qi, 1);
              for (const q of w.peeps) if (q.state === 'queueing' && q.rideId === p.rideId && q.queuePos > qi) q.queuePos--;
            }
          }
          p.state = 'walking';
          p.goal = 'none';
          p.rideId = -1;
          p.queuePos = -1;
          p.cooldown = 60;
          break;
        }
        const target = queueTileFor(w, ride, p.queuePos);
        p.tx = target % w.size;
        p.ty = (target / w.size) | 0;
        stepWalk(p);
        // boredom in long queues
        if ((w.tick + p.id) % 64 === 0) p.happiness = Math.max(0, p.happiness - 1);
        break;
      }
      case 'leaving': {
        if (stepWalk(p)) {
          if (p.ty >= w.park.spawn.y) {
            p.state = 'gone';
          } else {
            p.ty++; // walk back down the promenade
            p.dir = 1;
          }
        }
        break;
      }
    }
  }

  // reap departed guests
  for (let i = w.peeps.length - 1; i >= 0; i--) {
    if (w.peeps[i].state === 'gone') w.peeps.splice(i, 1);
  }
}

// spawn pacing: park appeal draws a crowd (called once per tick from sim)
export function tickSpawning(w: World): void {
  if (w.tick % 16 !== 0) return;
  const appeal = w.park.rating + (w.park.marketingTicks > 0 ? 250 : 0);
  const inPark = w.peeps.length;
  const want = Math.min(MAX_PEEPS, Math.floor(appeal / 5));
  if (inPark >= want) return;
  const pr = 0.12 + appeal / 4000;
  if (chance(w, pr)) {
    const p = spawnPeep(w);
    if (p && w.park.guestsTotal === 0 && inPark === 0) {
      addMessage(w, 'The first guests are arriving!', 'info');
    }
  }
}
