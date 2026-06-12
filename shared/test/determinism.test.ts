import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.js';
import { Command } from '../src/types.js';
import { stepWorld } from '../src/sim.js';
import { serializeWorld, deserializeWorld, hashWorld } from '../src/serialize.js';

// the exact command stream a host would commit: tick → commands that tick
function script(): Map<number, Command[]> {
  const m = new Map<number, Command[]>();
  const at = (t: number, ...cmds: Command[]) => m.set(t, [...(m.get(t) ?? []), ...cmds]);
  // a path loop off the plaza
  for (let i = 0; i < 10; i++) at(5 + i, { t: 'path', x: 35 + i, y: 65, kind: 1 });
  at(20, { t: 'scenery', x: 30, y: 30, type: 'oak' });
  at(25, { t: 'land', vx: 10, vy: 10, d: 1, brush: 3 });
  at(30, { t: 'water', x: 50, y: 50, d: 1, brush: 4 });
  at(40, { t: 'ride', type: 'burger', x: 44, y: 64, rot: 1 });
  at(50, { t: 'ride', type: 'merryGoRound', x: 35, y: 61, rot: 1 });
  at(60, { t: 'rideSet', rideId: 2, open: true });
  at(70, { t: 'template', tpl: 'woodenOAB', x: 20, y: 40 });
  at(80, { t: 'rideSet', rideId: 3, open: true });
  at(90, { t: 'research', funding: 3 });
  at(100, { t: 'park', fee: 5_00 });
  at(110, { t: 'marketing' });
  at(120, { t: 'loan', d: 1 });
  return m;
}

const TICKS = 2800; // > 2 game months

describe('lockstep determinism', () => {
  it('same seed + same command stream ⇒ identical state hash', () => {
    const a = createWorld(42);
    const b = createWorld(42);
    a.scen.fill(0); // clear starter woods so every scripted build lands
    b.scen.fill(0);
    const cmds = script();
    for (let t = 0; t < TICKS; t++) {
      stepWorld(a, cmds.get(t) ?? []);
      stepWorld(b, cmds.get(t) ?? []);
    }
    expect(a.peeps.length).toBeGreaterThan(0); // the run actually simulated guests
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('mid-session join: snapshot + remaining batches converge', () => {
    const host = createWorld(7);
    host.scen.fill(0);
    const cmds = script();
    let joiner: ReturnType<typeof createWorld> | null = null;
    for (let t = 0; t < TICKS; t++) {
      if (t === 1400) joiner = deserializeWorld(serializeWorld(host)); // guest joins here
      stepWorld(host, cmds.get(t) ?? []);
      if (joiner) stepWorld(joiner, cmds.get(t) ?? []);
    }
    expect(hashWorld(joiner!)).toBe(hashWorld(host));
  });

  it('different seeds diverge (sanity)', () => {
    const a = createWorld(1);
    const b = createWorld(2);
    for (let t = 0; t < 200; t++) {
      stepWorld(a, []);
      stepWorld(b, []);
    }
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
