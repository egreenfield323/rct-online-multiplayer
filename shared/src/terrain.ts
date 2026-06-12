import { MAX_H, COST_LAND, COST_WATER } from './constants.js';
import { World, vi, ti, inMap } from './types.js';

// Terrain is a vertex-height grid; a tile's shape comes from its 4 corners
// (NW, NE, SE, SW relative to grid axes: (x,y),(x+1,y),(x+1,y+1),(x,y+1)).

export function vh(w: World, vx: number, vy: number): number {
  const s = w.size + 1;
  if (vx < 0) vx = 0;
  if (vy < 0) vy = 0;
  if (vx >= s) vx = s - 1;
  if (vy >= s) vy = s - 1;
  return w.heights[vy * s + vx];
}

export function corners(w: World, x: number, y: number): [number, number, number, number] {
  return [vh(w, x, y), vh(w, x + 1, y), vh(w, x + 1, y + 1), vh(w, x, y + 1)];
}

export function tileMinH(w: World, x: number, y: number): number {
  const c = corners(w, x, y);
  return Math.min(c[0], c[1], c[2], c[3]);
}

export function tileMaxH(w: World, x: number, y: number): number {
  const c = corners(w, x, y);
  return Math.max(c[0], c[1], c[2], c[3]);
}

export function isFlat(w: World, x: number, y: number): boolean {
  const c = corners(w, x, y);
  return c[0] === c[1] && c[1] === c[2] && c[2] === c[3];
}

// A tile walkable by paths: flat, or a simple ramp (exactly 2 adjacent corners
// one unit higher). Returns -1 not allowed, 0 flat, 1..4 ramp rising toward dir.
export function pathSlope(w: World, x: number, y: number): number {
  const [nw, ne, se, sw] = corners(w, x, y);
  const min = Math.min(nw, ne, se, sw);
  const d = [nw - min, ne - min, se - min, sw - min];
  if (d[0] === 0 && d[1] === 0 && d[2] === 0 && d[3] === 0) return 0;
  if (d.some((v) => v > 1)) return -1;
  // ramps: corners pattern raised on one edge
  if (d[1] === 1 && d[2] === 1 && d[0] === 0 && d[3] === 0) return 1; // rising +x
  if (d[2] === 1 && d[3] === 1 && d[0] === 0 && d[1] === 0) return 2; // rising +y
  if (d[0] === 1 && d[3] === 1 && d[1] === 0 && d[2] === 0) return 3; // rising -x
  if (d[0] === 1 && d[1] === 1 && d[2] === 0 && d[3] === 0) return 4; // rising -y
  return -1;
}

export function hasWater(w: World, x: number, y: number): boolean {
  return inMap(w.size, x, y) && w.water[ti(w.size, x, y)] > tileMinH(w, x, y);
}

// tile is clear of built things (not terrain shape)
export function tileEmpty(w: World, x: number, y: number): boolean {
  if (!inMap(w.size, x, y)) return false;
  const i = ti(w.size, x, y);
  return w.path[i] === 0 && w.scen[i] === 0 && w.rideAt[i] === 0 && !hasWater(w, x, y);
}

export function buildableFlat(w: World, x: number, y: number): boolean {
  return tileEmpty(w, x, y) && isFlat(w, x, y);
}

// raise/lower a brush x brush square of vertices anchored at (vx,vy)
export function applyLand(w: World, vx: number, vy: number, d: 1 | -1, brush: number): boolean {
  const s = w.size + 1;
  let cost = 0;
  const changes: number[] = [];
  for (let dy = 0; dy < brush; dy++)
    for (let dx = 0; dx < brush; dx++) {
      const X = vx + dx,
        Y = vy + dy;
      if (X < 0 || Y < 0 || X >= s || Y >= s) continue;
      const i = Y * s + X;
      const nh = w.heights[i] + d;
      if (nh < 0 || nh > MAX_H) continue;
      // refuse if a touching tile is occupied by ride/path (terrain locked under builds)
      if (vertexLocked(w, X, Y)) continue;
      changes.push(i, nh);
      cost += COST_LAND;
    }
  if (changes.length === 0 || w.cash < cost) return false;
  for (let k = 0; k < changes.length; k += 2) w.heights[changes[k]] = changes[k + 1];
  w.cash -= cost;
  w.curExpense += cost;
  return true;
}

function vertexLocked(w: World, vx: number, vy: number): boolean {
  // the 4 tiles sharing this vertex must have no path/ride/scenery
  for (let dy = -1; dy <= 0; dy++)
    for (let dx = -1; dx <= 0; dx++) {
      const x = vx + dx,
        y = vy + dy;
      if (!inMap(w.size, x, y)) continue;
      const i = ti(w.size, x, y);
      if (w.path[i] !== 0 || w.rideAt[i] !== 0 || w.scen[i] !== 0) return true;
    }
  return false;
}

export function applyWater(w: World, x: number, y: number, d: 1 | -1, brush: number): boolean {
  let cost = 0;
  const changes: number[] = [];
  for (let dy = 0; dy < brush; dy++)
    for (let dx = 0; dx < brush; dx++) {
      const X = x + dx,
        Y = y + dy;
      if (!inMap(w.size, X, Y)) continue;
      const i = ti(w.size, X, Y);
      if (w.path[i] !== 0 || w.rideAt[i] !== 0 || w.scen[i] !== 0) continue;
      const min = tileMinH(w, X, Y);
      let lvl = w.water[i] === 0 ? min : w.water[i];
      lvl += d;
      if (lvl <= min) lvl = 0; // drained
      else if (lvl > min + 6) continue;
      changes.push(i, lvl);
      cost += COST_WATER;
    }
  if (changes.length === 0 || w.cash < cost) return false;
  for (let k = 0; k < changes.length; k += 2) w.water[changes[k]] = changes[k + 1];
  w.cash -= cost;
  w.curExpense += cost;
  return true;
}
