import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.js';
import { stepWorld } from '../src/sim.js';
import { RESEARCH_ORDER } from '../src/catalog.js';
import { RESEARCH_RATE, RESEARCH_GOAL } from '../src/constants.js';

describe('research', () => {
  it('inventions arrive in catalog order while funded', () => {
    const w = createWorld(3);
    stepWorld(w, [{ t: 'research', funding: 3 }]);
    const perInvention = Math.ceil(RESEARCH_GOAL / RESEARCH_RATE[3]);
    for (let t = 0; t < perInvention * 2 + 10; t++) stepWorld(w, []);
    expect(w.research.invented).toContain(RESEARCH_ORDER[0]);
    expect(w.research.invented).toContain(RESEARCH_ORDER[1]);
    expect(w.research.invented).not.toContain(RESEARCH_ORDER[3]);
    expect(w.research.pending[0]).toBe(RESEARCH_ORDER[2]);
  });

  it('no progress with funding off', () => {
    const w = createWorld(3);
    stepWorld(w, [{ t: 'research', funding: 0 }]);
    for (let t = 0; t < 500; t++) stepWorld(w, []);
    expect(w.research.progress).toBe(0);
    expect(w.research.invented.length).toBe(5); // just the starter set
  });

  it('funding is charged monthly', () => {
    const a = createWorld(3);
    const b = createWorld(3);
    stepWorld(a, [{ t: 'research', funding: 3 }]);
    stepWorld(b, [{ t: 'research', funding: 1 }]);
    for (let t = 0; t < 1400; t++) {
      stepWorld(a, []);
      stepWorld(b, []);
    }
    // same world otherwise (same seed) — only research cost differs in expenses
    expect(a.months[0].expense).toBeGreaterThan(b.months[0].expense);
  });
});
