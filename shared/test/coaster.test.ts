import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.js';
import { World } from '../src/types.js';
import { TEMPLATES, templatePieces, templateError, applyTemplate } from '../src/templates.js';
import { pieceExit, isClosed, testRun, applyTrackStart, applyTrackAdd, applyTrackDone, tickCoaster } from '../src/coaster.js';
import { applyCommand } from '../src/commands.js';

function freshWorld(): World {
  const w = createWorld(1234);
  w.scen.fill(0); // clear the starter woods so templates fit anywhere
  w.cash = 10_000_000;
  w.research.invented.push('steelMini', 'wildMouse');
  return w;
}

describe('coaster templates', () => {
  for (const tpl of TEMPLATES) {
    it(`${tpl.id}: circuit closes`, () => {
      const pieces = templatePieces(tpl, 0, 0, 10);
      const end = pieceExit(pieces[pieces.length - 1]);
      expect({ x: end.x, y: end.y, z: end.z, dir: end.dir }).toEqual({ x: 0, y: 0, z: 10, dir: 0 });
    });

    it(`${tpl.id}: stamps down, passes its test run, gets rated`, () => {
      const w = freshWorld();
      expect(templateError(w, tpl.id, 30, 30)).toBeNull();
      expect(applyTemplate(w, tpl.id, 30, 30)).toBe(true);
      const ride = w.rides[w.rides.length - 1];
      expect(ride.trackDone).toBe(true);
      expect(ride.testFail).toBeUndefined();
      expect(ride.entrance).not.toBeNull();
      expect(ride.exit).not.toBeNull();
      expect(ride.excitement).toBeGreaterThan(0);
      expect(ride.intensity).toBeGreaterThan(0);
      expect(ride.train).toBeDefined();
    });
  }

  it('rejects placement over another ride and off the map', () => {
    const w = freshWorld();
    expect(applyTemplate(w, 'miniSteel', 30, 30)).toBe(true);
    expect(templateError(w, 'miniSteel', 30, 30)).toBe('blocked by another ride');
    expect(templateError(w, 'miniSteel', 0, 0)).toBe('outside the park'); // extends to x=-1
  });

  it('respects research gating', () => {
    const w = freshWorld();
    w.research.invented = w.research.invented.filter((r) => r !== 'wildMouse');
    expect(templateError(w, 'wildMouse', 30, 30)).toBe('not yet invented');
  });
});

describe('manual track building', () => {
  it('builds the mini oval piece by piece and rates it', () => {
    const w = freshWorld();
    expect(applyTrackStart(w, 'steelMini', 20, 20, 0)).toBe(true);
    const ride = w.rides[w.rides.length - 1];
    const kinds = TEMPLATES.find((t) => t.id === 'miniSteel')!.kinds;
    for (const k of kinds.slice(1)) expect(applyTrackAdd(w, ride.id, k)).toBe(true);
    expect(isClosed(ride)).toBe(true);
    expect(applyTrackDone(w, ride.id)).toBe(true);
    expect(ride.testFail).toBeUndefined();
    expect(ride.excitement).toBeGreaterThan(0);
  });

  it('refuses to finish an open circuit', () => {
    const w = freshWorld();
    expect(applyTrackStart(w, 'steelMini', 20, 20, 0)).toBe(true);
    const ride = w.rides[w.rides.length - 1];
    expect(applyTrackAdd(w, ride.id, 'flat')).toBe(true);
    expect(applyTrackDone(w, ride.id)).toBe(false);
    expect(ride.trackDone).toBe(false);
  });

  it('fails the test run when the train would valley', () => {
    const w = freshWorld();
    expect(applyTrackStart(w, 'steelMini', 20, 20, 0)).toBe(true);
    const ride = w.rides[w.rides.length - 1];
    // oval with a big climb but no chain lift: up-up where the lifts were
    const kinds = TEMPLATES.find((t) => t.id === 'miniSteel')!.kinds
      .slice(1)
      .map((k) => (k === 'lift' ? 'up' as const : k));
    for (const k of kinds) expect(applyTrackAdd(w, ride.id, k)).toBe(true);
    const res = testRun(ride);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('valley');
  });
});

describe('coaster operation', () => {
  it('train launches with riders and returns to the station', () => {
    const w = freshWorld();
    expect(applyTemplate(w, 'miniSteel', 30, 30)).toBe(true);
    const ride = w.rides[w.rides.length - 1];
    expect(applyCommand(w, { t: 'rideSet', rideId: ride.id, open: true })).toBe(true);
    // fake a loaded train (boarding flow is covered by the peeps test)
    ride.phase = 'running';
    ride.riders = [999];
    ride.train!.peeps = [999];
    ride.train!.v = 2.4;
    let returned = false;
    for (let i = 0; i < 4000 && !returned; i++) {
      tickCoaster(w, ride);
      if ((ride.phase as string) === 'unloading') returned = true;
    }
    expect(returned).toBe(true);
  });
});
