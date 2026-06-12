import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.js';
import { World } from '../src/types.js';
import { stepWorld } from '../src/sim.js';

// a small functioning park: plaza + path row, burger stall, open merry-go-round
function parkWorld(): World {
  const w = createWorld(77);
  w.scen.fill(0);
  for (let t = 0; t < 11; t++) stepWorld(w, [{ t: 'path', x: 35 + t, y: 65, kind: 1 }]);
  stepWorld(w, [{ t: 'ride', type: 'burger', x: 44, y: 64, rot: 1 }]); // sells onto the path row
  stepWorld(w, [{ t: 'ride', type: 'merryGoRound', x: 35, y: 61, rot: 1 }]); // entrance at (36,64), beside path
  const ride = w.rides.find((r) => r.type === 'merryGoRound')!;
  stepWorld(w, [{ t: 'rideSet', rideId: ride.id, open: true }]);
  return w;
}

describe('peep flow', () => {
  it('guests enter, buy food, and ride the merry-go-round', () => {
    const w = parkWorld();
    for (let t = 0; t < 9000; t++) stepWorld(w, []);
    expect(w.park.guestsTotal).toBeGreaterThan(5);
    expect(w.peeps.length).toBeGreaterThan(0);
    const stall = w.rides.find((r) => r.type === 'burger')!;
    const ride = w.rides.find((r) => r.type === 'merryGoRound')!;
    expect(stall.totalCustomers).toBeGreaterThan(0);
    expect(ride.totalCustomers).toBeGreaterThan(0);
    expect(w.curIncome + (w.months[0]?.income ?? 0)).toBeGreaterThan(0);
  });

  it('entrance fee is collected at the gate', () => {
    const w = parkWorld();
    stepWorld(w, [{ t: 'park', fee: 4_00 }]);
    const before = w.cash;
    for (let t = 0; t < 3000; t++) stepWorld(w, []);
    expect(w.park.guestsTotal).toBeGreaterThan(0);
    // gate + stall + ride income lands in shared cash (upkeep may offset some)
    expect(w.curIncome).toBeGreaterThan(0);
    expect(w.cash).not.toBe(before);
  });

  it('peeps drain back out when the park has nothing left for them', () => {
    const w = parkWorld();
    for (let t = 0; t < 4000; t++) stepWorld(w, []);
    const ride = w.rides.find((r) => r.type === 'merryGoRound')!;
    stepWorld(w, [{ t: 'rideSet', rideId: ride.id, open: false }]);
    stepWorld(w, [{ t: 'demolish', rideId: ride.id }]);
    // nobody should stay stuck in queue/riding state for a demolished ride
    for (let t = 0; t < 200; t++) stepWorld(w, []);
    for (const p of w.peeps) {
      expect(p.state === 'queueing' && p.rideId === ride.id).toBe(false);
    }
  });
});
