import { MAP, START_CASH, START_LOAN } from './constants.js';
import { World, ti } from './types.js';
import { rngInt, chance } from './rng.js';
import { sceneryIdx, START_INVENTED, RESEARCH_ORDER } from './catalog.js';

export function createWorld(seed: number, name = 'Meadowbrook Park'): World {
  const size = MAP;
  const w: World = {
    seed,
    rngState: seed | 0,
    tick: 0,
    size,
    heights: new Uint8Array((size + 1) * (size + 1)).fill(6),
    water: new Uint8Array(size * size),
    path: new Uint8Array(size * size),
    pathAdd: new Uint8Array(size * size),
    scen: new Uint8Array(size * size),
    litter: new Uint8Array(size * size),
    rideAt: new Int16Array(size * size),
    rides: [],
    peeps: [],
    cash: START_CASH,
    loan: START_LOAN,
    curIncome: 0,
    curExpense: 0,
    months: [],
    research: {
      funding: 2,
      progress: 0,
      pending: [...RESEARCH_ORDER],
      invented: [...START_INVENTED],
    },
    park: {
      name,
      rating: 0,
      entranceFee: 0,
      marketingTicks: 0,
      entrance: { x: size >> 1, y: size - 4 },
      spawn: { x: size >> 1, y: size - 1 },
      guestsTotal: 0,
    },
    messages: [],
    nextRideId: 1,
    nextPeepId: 1,
  };

  // entrance promenade: path from map edge up into the park
  const px = w.park.spawn.x;
  for (let y = size - 1; y >= size - 12; y--) w.path[ti(size, px, y)] = 1;
  // small plaza at the head of the promenade
  for (let x = px - 2; x <= px + 2; x++)
    for (let y = size - 14; y <= size - 12; y++) w.path[ti(size, x, y)] = 1;

  // scattered starter woods
  const treeKinds = ['oak', 'pine', 'bush', 'palm'].map(sceneryIdx);
  for (let i = 0; i < 260; i++) {
    const x = rngInt(w, size);
    const y = rngInt(w, size - 18); // keep the entrance area clear
    const idx = ti(size, x, y);
    if (w.path[idx] === 0 && w.scen[idx] === 0 && chance(w, 0.8)) {
      w.scen[idx] = treeKinds[rngInt(w, treeKinds.length)] + 1;
    }
  }

  w.park.rating = 420;
  w.messages.push({ tick: 0, text: `Welcome to ${name}! Invite friends and build together.`, kind: 'info' });
  return w;
}

export function addMessage(w: World, text: string, kind: 'info' | 'award' | 'research' | 'warn' | 'money' = 'info'): void {
  w.messages.push({ tick: w.tick, text, kind });
  if (w.messages.length > 14) w.messages.splice(0, w.messages.length - 14);
}
