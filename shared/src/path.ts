import { COST_PATH, COST_QUEUE } from './constants.js';
import { World, ti, inMap, DX, DY } from './types.js';
import { pathSlope, hasWater } from './terrain.js';

export function canPlacePath(w: World, x: number, y: number): boolean {
  if (!inMap(w.size, x, y)) return false;
  const i = ti(w.size, x, y);
  if (w.rideAt[i] !== 0 || w.scen[i] !== 0) return false;
  if (hasWater(w, x, y)) return false;
  return pathSlope(w, x, y) >= 0;
}

export function applyPath(w: World, x: number, y: number, kind: 1 | 2): boolean {
  if (!canPlacePath(w, x, y)) return false;
  const i = ti(w.size, x, y);
  if (w.path[i] === kind) return false;
  const cost = kind === 2 ? COST_QUEUE : COST_PATH;
  if (w.cash < cost) return false;
  w.path[i] = kind;
  w.pathAdd[i] = 0;
  w.cash -= cost;
  w.curExpense += cost;
  return true;
}

export function applyUnpath(w: World, x: number, y: number): boolean {
  if (!inMap(w.size, x, y)) return false;
  const i = ti(w.size, x, y);
  if (w.path[i] === 0) return false;
  w.path[i] = 0;
  w.pathAdd[i] = 0;
  w.litter[i] = 0;
  return true;
}

export function isPath(w: World, x: number, y: number): boolean {
  return inMap(w.size, x, y) && w.path[ti(w.size, x, y)] !== 0;
}

export function isWalkable(w: World, x: number, y: number): boolean {
  // peeps walk on footpaths; queues only when queueing (handled separately)
  return inMap(w.size, x, y) && w.path[ti(w.size, x, y)] === 1;
}

// neighbor dirs that connect for rendering + junction logic (any path kind or a
// ride entrance/exit tile)
export function pathConnections(w: World, x: number, y: number): boolean[] {
  const out = [false, false, false, false];
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d],
      ny = y + DY[d];
    if (!inMap(w.size, nx, ny)) continue;
    const i = ti(w.size, nx, ny);
    if (w.path[i] !== 0) out[d] = true;
    else if (w.rideAt[i] !== 0) {
      // entrance/exit tiles connect to paths
      const r = w.rides.find((rr) => rr.id === w.rideAt[i]);
      if (r && ((r.entrance && r.entrance.x === nx && r.entrance.y === ny) || (r.exit && r.exit.x === nx && r.exit.y === ny)))
        out[d] = true;
    }
  }
  return out;
}

// BFS over footpath tiles from (sx,sy) to the first tile satisfying `goal`.
// Returns list of tile indices from start (exclusive) to goal (inclusive).
export function findPath(
  w: World,
  sx: number,
  sy: number,
  goal: (x: number, y: number) => boolean,
  maxDepth = 56,
  walkQueues = false,
): number[] | null {
  const size = w.size;
  const start = ti(size, sx, sy);
  if (goal(sx, sy)) return [];
  const prev = new Map<number, number>();
  prev.set(start, -1);
  let frontier = [start];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const cur of frontier) {
      const cx = cur % size,
        cy = (cur / size) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d],
          ny = cy + DY[d];
        if (!inMap(size, nx, ny)) continue;
        const ni = ti(size, nx, ny);
        if (prev.has(ni)) continue;
        const p = w.path[ni];
        const ok = p === 1 || (walkQueues && p === 2);
        if (goal(nx, ny)) {
          prev.set(ni, cur);
          return reconstruct(prev, ni, start);
        }
        if (!ok) continue;
        prev.set(ni, cur);
        next.push(ni);
      }
    }
    frontier = next;
  }
  return null;
}

function reconstruct(prev: Map<number, number>, end: number, start: number): number[] {
  const out: number[] = [];
  let cur = end;
  while (cur !== start) {
    out.push(cur);
    cur = prev.get(cur)!;
  }
  out.reverse();
  return out;
}
