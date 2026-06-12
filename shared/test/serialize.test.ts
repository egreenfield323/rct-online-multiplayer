import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.js';
import { stepWorld } from '../src/sim.js';
import { serializeWorld, deserializeWorld, hashWorld } from '../src/serialize.js';

describe('serialize', () => {
  it('round-trips a fresh world exactly', () => {
    const w = createWorld(99);
    const w2 = deserializeWorld(serializeWorld(w));
    expect(hashWorld(w2)).toBe(hashWorld(w));
    expect(w2.heights).toBeInstanceOf(Uint8Array);
    expect(w2.rideAt).toBeInstanceOf(Int16Array);
    expect(w2.size).toBe(w.size);
  });

  it('round-trips a lived-in world (peeps, rides, months)', () => {
    const w = createWorld(5);
    w.scen.fill(0);
    w.research.invented.push('steelMini');
    stepWorld(w, [{ t: 'template', tpl: 'figure8', x: 30, y: 30 }]);
    for (let t = 0; t < 1500; t++) stepWorld(w, []);
    const w2 = deserializeWorld(serializeWorld(w));
    expect(hashWorld(w2)).toBe(hashWorld(w));
    expect(w2.peeps.length).toBe(w.peeps.length);
    expect(w2.rides.length).toBe(w.rides.length);
  });

  it('negative rideAt values survive the int16 packing', () => {
    const w = createWorld(1);
    w.rideAt[0] = -123;
    const w2 = deserializeWorld(serializeWorld(w));
    expect(w2.rideAt[0]).toBe(-123);
  });
});
