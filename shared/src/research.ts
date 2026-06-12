import { World } from './types.js';
import { rideDef } from './catalog.js';
import { RESEARCH_RATE, RESEARCH_GOAL } from './constants.js';
import { addMessage } from './world.js';

export function applyResearchFunding(w: World, funding: 0 | 1 | 2 | 3): boolean {
  if (w.research.funding === funding) return false;
  w.research.funding = funding;
  return true;
}

export function tickResearch(w: World): void {
  const r = w.research;
  if (r.pending.length === 0 || r.funding === 0) return;
  r.progress += RESEARCH_RATE[r.funding];
  if (r.progress < RESEARCH_GOAL) return;
  r.progress = 0;
  const id = r.pending.shift()!;
  r.invented.push(id);
  const def = rideDef(id);
  addMessage(w, `New ${def.category === 'stall' ? 'stall' : 'ride'} invented: ${def.name}!`, 'research');
  if (r.pending.length === 0) addMessage(w, 'All research complete!', 'research');
}
