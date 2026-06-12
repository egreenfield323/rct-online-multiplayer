import { World, inMap } from '@park/shared';
import { vh } from '@park/shared';

// 64×32 diamond tiles, 8px per height unit (RCT proportions)
export const TW = 64;
export const TH = 32;
export const ZH = 8;

export interface Camera {
  x: number; // world-projected px the canvas center looks at
  y: number;
  zoom: number; // 0.5 | 1 | 2
}

// world (tile units, float) + height → projected px (pre-camera)
export function proj(wx: number, wy: number, z: number): { sx: number; sy: number } {
  return { sx: (wx - wy) * (TW / 2), sy: (wx + wy) * (TH / 2) - z * ZH };
}

export function unproj(sx: number, sy: number, z: number): { wx: number; wy: number } {
  const a = sx / (TW / 2);
  const b = (sy + z * ZH) / (TH / 2);
  return { wx: (a + b) / 2, wy: (b - a) / 2 };
}

export function screenToCanvas(cam: Camera, canvas: HTMLCanvasElement, cx: number, cy: number): { sx: number; sy: number } {
  return {
    sx: (cx - canvas.width / 2) / cam.zoom + cam.x,
    sy: (cy - canvas.height / 2) / cam.zoom + cam.y,
  };
}

// pick the tile under projected point (sx, sy), accounting for terrain height
export function pickTile(w: World, sx: number, sy: number): { x: number; y: number } {
  let z = 0;
  let wx = 0, wy = 0;
  for (let i = 0; i < 5; i++) {
    ({ wx, wy } = unproj(sx, sy, z));
    const tx = Math.floor(wx), ty = Math.floor(wy);
    z = vh(w, Math.round(wx), Math.round(wy));
    if (!inMap(w.size, tx, ty)) break;
  }
  const x = Math.max(0, Math.min(w.size - 1, Math.floor(wx)));
  const y = Math.max(0, Math.min(w.size - 1, Math.floor(wy)));
  return { x, y };
}

// nearest vertex (for the land tool)
export function pickVertex(w: World, sx: number, sy: number): { vx: number; vy: number } {
  const { x, y } = pickTile(w, sx, sy);
  const z = vh(w, x, y);
  const { wx, wy } = unproj(sx, sy, z);
  return {
    vx: Math.max(0, Math.min(w.size, Math.round(wx))),
    vy: Math.max(0, Math.min(w.size, Math.round(wy))),
  };
}
