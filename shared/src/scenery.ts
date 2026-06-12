import { World, ti, inMap } from './types.js';
import { SCENERY_DEFS, sceneryDef, sceneryIdx } from './catalog.js';
import { buildableFlat } from './terrain.js';

export function applyScenery(w: World, x: number, y: number, type: string): boolean {
  const def = SCENERY_DEFS.find((s) => s.id === type);
  if (!def) return false;
  if (w.cash < def.cost) return false;
  const i = ti(w.size, x, y);
  const onPath = def.kind === 'bench' || def.kind === 'lamp' || def.kind === 'bin';
  if (onPath) {
    // path furniture sits on a footpath tile
    if (!inMap(w.size, x, y) || w.path[i] !== 1 || w.pathAdd[i] !== 0) return false;
    w.pathAdd[i] = def.kind === 'bench' ? 1 : def.kind === 'lamp' ? 2 : 3;
  } else {
    if (!buildableFlat(w, x, y)) return false;
    w.scen[i] = sceneryIdx(type) + 1;
  }
  w.cash -= def.cost;
  w.curExpense += def.cost;
  return true;
}

export function applyUnscenery(w: World, x: number, y: number): boolean {
  if (!inMap(w.size, x, y)) return false;
  const i = ti(w.size, x, y);
  if (w.pathAdd[i] !== 0) {
    w.pathAdd[i] = 0;
    return true;
  }
  if (w.scen[i] === 0) return false;
  w.scen[i] = 0;
  return true;
}

export function sceneryAt(w: World, x: number, y: number): string | null {
  const v = w.scen[ti(w.size, x, y)];
  return v === 0 ? null : SCENERY_DEFS[v - 1].id;
}

export { sceneryDef };
