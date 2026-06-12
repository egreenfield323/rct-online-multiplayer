// mulberry32 — all sim randomness flows through world.rngState so that
// host and guests stay bit-identical (lockstep determinism).

export interface HasRng {
  rngState: number;
}

export function rngNext(w: HasRng): number {
  let t = (w.rngState = (w.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngInt(w: HasRng, n: number): number {
  return Math.floor(rngNext(w) * n);
}

export function chance(w: HasRng, p: number): boolean {
  return rngNext(w) < p;
}

export function pick<T>(w: HasRng, arr: readonly T[]): T {
  return arr[rngInt(w, arr.length)];
}
