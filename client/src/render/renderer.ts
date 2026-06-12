import {
  World, Ride, TrackPiece, Peep, ti, DX, DY,
  vh, corners, tileMinH, rideDef, SCENERY_DEFS,
  PIECES, pieceExit, pieceAt, trackLengths, pathConnections,
} from '@park/shared';
import { ZH, Camera, proj, unproj } from './iso.js';
import { Spr, SpriteMap, PEEP_SHIRTS } from './sprites.js';

// ---------------------------------------------------------------- helpers

const GRASS_A = '#58a843';
const GRASS_B = '#51a03c';
const DIRT = '#8a6b3d';
const DIRT_DARK = '#6e5530';

function blit(c: CanvasRenderingContext2D, s: Spr, sx: number, sy: number): void {
  c.drawImage(s.cv, Math.round(sx - s.ax), Math.round(sy - s.ay));
}

function tilePoly(c: CanvasRenderingContext2D, x: number, y: number, hs: [number, number, number, number]): void {
  const p0 = proj(x, y, hs[0]);
  const p1 = proj(x + 1, y, hs[1]);
  const p2 = proj(x + 1, y + 1, hs[2]);
  const p3 = proj(x, y + 1, hs[3]);
  c.beginPath();
  c.moveTo(p0.sx, p0.sy);
  c.lineTo(p1.sx, p1.sy);
  c.lineTo(p2.sx, p2.sy);
  c.lineTo(p3.sx, p3.sy);
  c.closePath();
}

// cheap deterministic per-tile hash for texture variation (render-only)
function thash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// point on the tile interior at fractional (fx, fy), lerping corner heights
function tilePoint(x: number, y: number, cs: [number, number, number, number], fx: number, fy: number) {
  const zTop = cs[0] + (cs[1] - cs[0]) * fx;
  const zBot = cs[3] + (cs[2] - cs[3]) * fx;
  return proj(x + fx, y + fy, zTop + (zBot - zTop) * fy);
}

// ---------------------------------------------------------------- track geometry

export interface TPoint { x: number; y: number; z: number }

const SAMPLES = 8;
const curveCache = new Map<string, TPoint[]>();

// sampled center-line of a piece in world tile coords
export function piecePoints(p: TrackPiece): TPoint[] {
  const key = `${p.kind},${p.x},${p.y},${p.z},${p.dir}`;
  const hit = curveCache.get(key);
  if (hit) return hit;
  const def = PIECES[p.kind];
  const out: TPoint[] = [];
  const ex = pieceExit(p);
  // entry/exit edge midpoints of the entry/exit cells
  const E = { x: p.x + 0.5 - DX[p.dir] * 0.5, y: p.y + 0.5 - DY[p.dir] * 0.5 };
  const X = { x: ex.x + 0.5 - DX[ex.dir] * 0.5, y: ex.y + 0.5 - DY[ex.dir] * 0.5 };
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    let x: number, y: number;
    if (def.dirD === 0) {
      x = E.x + (X.x - E.x) * t;
      y = E.y + (X.y - E.y) * t;
    } else {
      // quadratic bezier; control point where entry and exit lines cross
      const C = p.dir === 0 || p.dir === 2 ? { x: X.x, y: E.y } : { x: E.x, y: X.y };
      const u = 1 - t;
      x = u * u * E.x + 2 * u * t * C.x + t * t * X.x;
      y = u * u * E.y + 2 * u * t * C.y + t * t * X.y;
    }
    out.push({ x, y, z: p.z + def.dz * t });
  }
  if (curveCache.size > 4000) curveCache.clear();
  curveCache.set(key, out);
  return out;
}

function curveAt(pts: TPoint[], t: number): TPoint {
  const f = Math.max(0, Math.min(0.9999, t)) * SAMPLES;
  const i = Math.floor(f);
  const u = f - i;
  const a = pts[i], b = pts[i + 1];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
}

// world position of distance s along a finished circuit
export function trackPointAt(ride: Ride, s: number): { p: TPoint; ang: number } {
  const { idx, t } = pieceAt(ride, s);
  const pts = piecePoints(ride.track![idx]);
  const p = curveAt(pts, t);
  const q = curveAt(pts, Math.min(1, t + 0.08));
  const a = proj(p.x, p.y, p.z);
  const b = proj(q.x, q.y, q.z);
  return { p, ang: Math.atan2(b.sy - a.sy, b.sx - a.sx) };
}

// draw one piece: supports, ties, rails. Exported for ghost previews.
export function drawPiece(
  c: CanvasRenderingContext2D,
  w: World,
  p: TrackPiece,
  railCol: string,
  supCol: string,
  alpha = 1,
  wooden = false,
): void {
  const pts = piecePoints(p);
  c.save();
  c.globalAlpha *= alpha;

  // supports
  c.strokeStyle = supCol;
  for (const t of [0.2, 0.8]) {
    const m = curveAt(pts, t);
    const gx = Math.max(0, Math.min(w.size - 1, Math.floor(m.x)));
    const gy = Math.max(0, Math.min(w.size - 1, Math.floor(m.y)));
    const g = vh(w, Math.round(m.x), Math.round(m.y));
    const wl = w.water[ti(w.size, gx, gy)];
    const ground = Math.max(g, wl);
    if (m.z > ground + 0.3) {
      const top = proj(m.x, m.y, m.z - 0.15);
      const bot = proj(m.x, m.y, ground);
      if (wooden) {
        // trestle: two splayed legs + cross-brace
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(top.sx - 1, top.sy); c.lineTo(bot.sx - 5, bot.sy); c.stroke();
        c.beginPath(); c.moveTo(top.sx + 1, top.sy); c.lineTo(bot.sx + 5, bot.sy); c.stroke();
        const n = Math.max(1, Math.floor((bot.sy - top.sy) / 14));
        for (let i = 1; i <= n; i++) {
          const yy = top.sy + (bot.sy - top.sy) * (i / (n + 1));
          const spread = 1 + 4 * ((yy - top.sy) / Math.max(1, bot.sy - top.sy));
          c.beginPath(); c.moveTo(top.sx - spread, yy); c.lineTo(top.sx + spread, yy); c.stroke();
        }
      } else {
        c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(top.sx, top.sy); c.lineTo(bot.sx, bot.sy); c.stroke();
        c.lineWidth = 1;
        c.strokeRect(bot.sx - 2.5, bot.sy - 1, 5, 2);
      }
    }
  }

  // station platform
  if (p.kind === 'station') {
    const cs: [number, number, number, number] = [p.z, p.z, p.z, p.z];
    tilePoly(c, p.x, p.y, cs);
    c.fillStyle = '#b5ab93';
    c.fill();
    c.strokeStyle = '#857b63';
    c.stroke();
    // platform edge stripe along the track
    const e0 = curveAt(pts, 0.04), e1 = curveAt(pts, 0.96);
    const q0 = proj(e0.x, e0.y, e0.z), q1 = proj(e1.x, e1.y, e1.z);
    c.strokeStyle = '#d8d0b8';
    c.lineWidth = 5;
    c.beginPath(); c.moveTo(q0.sx, q0.sy + 3); c.lineTo(q1.sx, q1.sy + 3); c.stroke();
  }

  // crossties under the rails
  const off = 0.11;
  const tieN = p.kind === 'lift' ? 8 : 5;
  c.lineWidth = p.kind === 'brakes' ? 3 : 2;
  c.strokeStyle = p.kind === 'lift' ? '#caa53d' : p.kind === 'brakes' ? '#c0392b' : supCol;
  for (let i = 0; i <= tieN; i++) {
    const m = curveAt(pts, (i + 0.5) / (tieN + 1));
    const n = curveAt(pts, Math.min(1, (i + 0.5) / (tieN + 1) + 0.02));
    const dx = n.x - m.x, dy = n.y - m.y;
    const len = Math.hypot(dx, dy) || 1;
    const a = proj(m.x + (-dy / len) * off * 1.25, m.y + (dx / len) * off * 1.25, m.z);
    const b = proj(m.x + (dy / len) * off * 1.25, m.y + (-dx / len) * off * 1.25, m.z);
    c.beginPath(); c.moveTo(a.sx, a.sy); c.lineTo(b.sx, b.sy); c.stroke();
  }

  // two rails, with a darker underside line for depth
  for (const side of [-off, off]) {
    for (const [w2, col, dy2] of [[3, 'rgba(0,0,0,0.35)', 1.5], [2.5, railCol, 0]] as [number, string, number][]) {
      c.strokeStyle = col;
      c.lineWidth = w2;
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const q = proj(a.x + (-dy / len) * side, a.y + (dx / len) * side, a.z);
        if (i === 0) c.moveTo(q.sx, q.sy + dy2);
        else c.lineTo(q.sx, q.sy + dy2);
      }
      c.stroke();
    }
  }

  // chain lift: center chain dashes
  if (p.kind === 'lift') {
    c.strokeStyle = '#8a6d20';
    c.lineWidth = 1.5;
    c.setLineDash([3, 3]);
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const q = proj(pts[i].x, pts[i].y, pts[i].z);
      if (i === 0) c.moveTo(q.sx, q.sy);
      else c.lineTo(q.sx, q.sy);
    }
    c.stroke();
    c.setLineDash([]);
  }
  c.restore();
}

// ---------------------------------------------------------------- drawables

interface Drawable {
  key: number;
  draw: () => void;
}

const STALL_SPRITE: Record<string, string> = {
  burger: 'stall_burger', fries: 'stall_fries', iceCream: 'stall_iceCream',
  drinks: 'stall_drinks', infoKiosk: 'stall_infoKiosk', toilets: 'stall_toilets',
};

// ---------------------------------------------------------------- main render

export function render(
  c: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  w: World,
  cam: Camera,
  S: SpriteMap,
  frame: number,
): void {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#1d2a38';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.setTransform(cam.zoom, 0, 0, cam.zoom, canvas.width / 2 - cam.x * cam.zoom, canvas.height / 2 - cam.y * cam.zoom);
  c.imageSmoothingEnabled = false;

  // visible tile bounds (unproject canvas corners, pad for height)
  const tl = unproj(cam.x - canvas.width / 2 / cam.zoom, cam.y - canvas.height / 2 / cam.zoom - ZH * 30, 0);
  const br = unproj(cam.x + canvas.width / 2 / cam.zoom, cam.y + canvas.height / 2 / cam.zoom + ZH * 4, 0);
  const trc = unproj(cam.x + canvas.width / 2 / cam.zoom, cam.y - canvas.height / 2 / cam.zoom - ZH * 30, 0);
  const blc = unproj(cam.x - canvas.width / 2 / cam.zoom, cam.y + canvas.height / 2 / cam.zoom + ZH * 4, 0);
  const x0 = Math.max(0, Math.floor(Math.min(tl.wx, blc.wx)) - 1);
  const x1 = Math.min(w.size - 1, Math.ceil(Math.max(br.wx, trc.wx)) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(tl.wy, trc.wy)) - 1);
  const y1 = Math.min(w.size - 1, Math.ceil(Math.max(br.wy, blc.wy)) + 1);

  const drawables: Drawable[] = [];

  // ---- pass 1: ground ----
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = ti(w.size, x, y);
      const cs = corners(w, x, y);
      const slope = cs[0] + cs[1] - cs[2] - cs[3];
      const h = thash(x, y);
      tilePoly(c, x, y, cs);
      let col = (x + y) % 2 === 0 ? GRASS_A : GRASS_B;
      if (slope > 0) col = '#65b94e';
      else if (slope < 0) col = '#46913a';
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.06)';
      c.stroke();

      const pk = w.path[i];

      // grass texture: sparse speckles + occasional tuft (skip under paths)
      if (pk === 0 && cam.zoom >= 1) {
        const n = 2 + ((h * 7) | 0) % 3;
        for (let k = 0; k < n; k++) {
          const fx = 0.15 + ((h * 113 + k * 47) % 70) / 100;
          const fy = 0.15 + ((h * 191 + k * 83) % 70) / 100;
          const q = tilePoint(x, y, cs, fx, fy);
          c.fillStyle = (k + ((h * 10) | 0)) % 2 ? 'rgba(255,255,230,0.13)' : 'rgba(20,60,20,0.18)';
          c.fillRect(q.sx, q.sy - 1, 2, 1.5);
        }
        if (h > 0.93) {
          const q = tilePoint(x, y, cs, 0.5, 0.5);
          c.strokeStyle = 'rgba(28,90,30,0.5)';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(q.sx - 2, q.sy); c.lineTo(q.sx - 3, q.sy - 4);
          c.moveTo(q.sx, q.sy); c.lineTo(q.sx, q.sy - 5);
          c.moveTo(q.sx + 2, q.sy); c.lineTo(q.sx + 3, q.sy - 4);
          c.stroke();
        }
      }

      // cliff faces toward the camera (south +y and east +x edges)
      {
        const nb = y + 1 < w.size ? [vh(w, x, y + 1), vh(w, x + 1, y + 1)] : [0, 0];
        if (cs[3] > nb[0] || cs[2] > nb[1]) {
          const a = proj(x, y + 1, cs[3]);
          const b = proj(x + 1, y + 1, cs[2]);
          const a2 = proj(x, y + 1, nb[0]);
          const b2 = proj(x + 1, y + 1, nb[1]);
          c.beginPath(); c.moveTo(a.sx, a.sy); c.lineTo(b.sx, b.sy); c.lineTo(b2.sx, b2.sy); c.lineTo(a2.sx, a2.sy); c.closePath();
          c.fillStyle = DIRT;
          c.fill();
          // strata
          c.strokeStyle = 'rgba(60,40,15,0.4)';
          c.lineWidth = 1;
          const depth = Math.max(cs[3] - nb[0], cs[2] - nb[1]);
          for (let s = 1; s < depth; s++) {
            const f = s / depth;
            c.beginPath();
            c.moveTo(a.sx, a.sy + (a2.sy - a.sy) * f);
            c.lineTo(b.sx, b.sy + (b2.sy - b.sy) * f);
            c.stroke();
          }
          // grass lip
          c.strokeStyle = '#3e7d32';
          c.lineWidth = 2;
          c.beginPath(); c.moveTo(a.sx, a.sy + 1); c.lineTo(b.sx, b.sy + 1); c.stroke();
        }
        const nbe = x + 1 < w.size ? [vh(w, x + 1, y), vh(w, x + 1, y + 1)] : [0, 0];
        if (cs[1] > nbe[0] || cs[2] > nbe[1]) {
          const a = proj(x + 1, y, cs[1]);
          const b = proj(x + 1, y + 1, cs[2]);
          const a2 = proj(x + 1, y, nbe[0]);
          const b2 = proj(x + 1, y + 1, nbe[1]);
          c.beginPath(); c.moveTo(a.sx, a.sy); c.lineTo(b.sx, b.sy); c.lineTo(b2.sx, b2.sy); c.lineTo(a2.sx, a2.sy); c.closePath();
          c.fillStyle = DIRT_DARK;
          c.fill();
          c.strokeStyle = '#3e7d32';
          c.lineWidth = 2;
          c.beginPath(); c.moveTo(a.sx, a.sy + 1); c.lineTo(b.sx, b.sy + 1); c.stroke();
        }
      }

      // water
      const wl = w.water[i];
      if (wl > tileMinH(w, x, y)) {
        const depth = wl - tileMinH(w, x, y);
        tilePoly(c, x, y, [wl, wl, wl, wl]);
        c.fillStyle = depth > 2 ? 'rgba(24,84,160,0.88)' : 'rgba(42,116,190,0.8)';
        c.fill();
        c.strokeStyle = 'rgba(160,210,255,0.35)';
        c.stroke();
        // animated sparkles
        const ph = Math.sin(frame * 0.045 + h * 12);
        if (ph > 0.4) {
          const q = tilePoint(x, y, [wl, wl, wl, wl] as [number, number, number, number], 0.25 + h * 0.5, 0.3 + ((h * 7) % 0.5));
          c.fillStyle = `rgba(220,245,255,${(ph - 0.4) * 0.9})`;
          c.fillRect(q.sx - 2, q.sy, 4, 1.2);
          c.fillRect(q.sx + 6, q.sy + 3, 3, 1);
        }
      }

      // path
      if (pk !== 0) {
        const conn = pathConnections(w, x, y);
        const main = pk === 1 ? '#c4ad7c' : '#7d99c0';
        const edge = pk === 1 ? '#8f7c52' : '#54688a';
        tilePoly(c, x, y, cs);
        c.fillStyle = main;
        c.fill();
        // edging strips on unconnected sides
        const edgePts = [
          [proj(x, y, cs[0]), proj(x + 1, y, cs[1])], // -y side (d3)
          [proj(x + 1, y, cs[1]), proj(x + 1, y + 1, cs[2])], // +x side (d0)
          [proj(x + 1, y + 1, cs[2]), proj(x, y + 1, cs[3])], // +y side (d1)
          [proj(x, y + 1, cs[3]), proj(x, y, cs[0])], // -x side (d2)
        ];
        const sideForDir = [1, 2, 3, 0]; // dir 0..3 → edge index
        c.lineWidth = 2.5;
        for (let d = 0; d < 4; d++) {
          if (conn[d]) continue;
          const [a, b] = edgePts[sideForDir[d]];
          c.strokeStyle = edge;
          c.beginPath(); c.moveTo(a.sx, a.sy - 1); c.lineTo(b.sx, b.sy - 1); c.stroke();
        }
        // paving texture
        if (cam.zoom >= 1) {
          c.strokeStyle = pk === 1 ? 'rgba(110,90,55,0.3)' : 'rgba(50,70,110,0.35)';
          c.lineWidth = 1;
          const m1 = tilePoint(x, y, cs, 0.5, 0);
          const m2 = tilePoint(x, y, cs, 0.5, 1);
          const m3 = tilePoint(x, y, cs, 0, 0.5);
          const m4 = tilePoint(x, y, cs, 1, 0.5);
          c.beginPath(); c.moveTo(m1.sx, m1.sy); c.lineTo(m2.sx, m2.sy); c.moveTo(m3.sx, m3.sy); c.lineTo(m4.sx, m4.sy); c.stroke();
        }
        if (pk === 2) {
          // queue handrails along the walking direction
          c.strokeStyle = '#39506e';
          c.lineWidth = 1.5;
          for (const f of [0.22, 0.78]) {
            const a = tilePoint(x, y, cs, conn[0] || conn[2] ? 0.05 : f, conn[0] || conn[2] ? f : 0.05);
            const b = tilePoint(x, y, cs, conn[0] || conn[2] ? 0.95 : f, conn[0] || conn[2] ? f : 0.95);
            c.beginPath(); c.moveTo(a.sx, a.sy - 4); c.lineTo(b.sx, b.sy - 4); c.stroke();
            // posts
            c.beginPath(); c.moveTo(a.sx, a.sy); c.lineTo(a.sx, a.sy - 4); c.moveTo(b.sx, b.sy); c.lineTo(b.sx, b.sy - 4); c.stroke();
          }
        }
      }

      // litter
      const lit = w.litter[i];
      if (lit > 0 && pk !== 0) {
        for (let k = 0; k < Math.min(4, lit); k++) {
          const q = tilePoint(x, y, cs, 0.2 + ((k * 37) % 55) / 100, 0.2 + ((k * 53) % 55) / 100);
          c.fillStyle = k % 2 ? '#6b5e42' : '#9b8d6b';
          c.fillRect(q.sx - 1, q.sy - 1, 3, 2);
        }
      }
    }
  }

  // ---- pass 2: collect drawables ----
  // scenery + path furniture
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = ti(w.size, x, y);
      const sv = w.scen[i];
      const z = vh(w, x, y);
      if (sv !== 0) {
        const def = SCENERY_DEFS[sv - 1];
        const sprite =
          def.kind === 'tree' ? S[`tree_${def.id}`] ?? S.tree_oak
          : def.kind === 'garden' ? S.garden
          : def.kind === 'fence' ? S.fence
          : S.tree_bush;
        drawables.push({
          key: x + y + 0.4,
          draw: () => {
            const q = proj(x + 0.5, y + 0.5, z);
            blit(c, sprite, q.sx, q.sy);
          },
        });
      }
      const pa = w.pathAdd[i];
      if (pa !== 0) {
        const sprite = pa === 1 ? S.bench : pa === 2 ? S.lamp : S.bin;
        drawables.push({
          key: x + y + 0.3,
          draw: () => {
            const q = proj(x + 0.5, y + 0.5, z);
            blit(c, sprite, q.sx, q.sy);
          },
        });
      }
    }
  }

  // rides, stalls, huts, track
  for (const ride of w.rides) {
    const def = rideDef(ride.type);
    if (def.category === 'stall') {
      const sprite = S[STALL_SPRITE[ride.type]] ?? S.stall_burger;
      const { x, y } = ride;
      const z = vh(w, x, y);
      drawables.push({
        key: x + y + 0.5,
        draw: () => {
          const q = proj(x + 0.5, y + 0.5, z);
          blit(c, sprite, q.sx, q.sy);
        },
      });
    } else if (def.category !== 'coaster') {
      const n = def.size;
      const cx = ride.x + n / 2, cy = ride.y + n / 2;
      const z = vh(w, ride.x, ride.y);
      const sprite = S[`ride_${ride.type}`];
      drawables.push({
        key: cx + cy - n / 2 + 0.6,
        draw: () => {
          // paved apron under the ride
          const p0 = proj(ride.x, ride.y, z);
          const p1 = proj(ride.x + n, ride.y, z);
          const p2 = proj(ride.x + n, ride.y + n, z);
          const p3 = proj(ride.x, ride.y + n, z);
          c.beginPath(); c.moveTo(p0.sx, p0.sy); c.lineTo(p1.sx, p1.sy); c.lineTo(p2.sx, p2.sy); c.lineTo(p3.sx, p3.sy); c.closePath();
          c.fillStyle = ride.open ? '#a8a090' : '#98917f';
          c.fill();
          c.strokeStyle = '#6f685c';
          c.stroke();
          if (sprite) {
            const q = proj(cx, cy, z);
            const bob = ride.phase === 'running' ? Math.sin(frame * 0.3) * 1.5 : 0;
            blit(c, sprite, q.sx, q.sy + bob);
          }
        },
      });
    } else if (ride.track) {
      const colors = def.coaster!.colors;
      const wooden = ride.type === 'wooden';
      for (const p of ride.track) {
        drawables.push({
          key: p.x + p.y + 0.5 + p.z * 0.004,
          draw: () => drawPiece(c, w, p, colors[0], colors[1], 1, wooden),
        });
      }
      // train
      if (ride.trackDone && ride.train && (ride.phase === 'running' || ride.train.v > 0 || ride.riders.length > 0 || ride.open)) {
        const t = ride.train;
        const { total } = trackLengths(ride);
        for (let car = 0; car < def.coaster!.cars; car++) {
          let s = t.s - car * 2.4;
          while (s < 0) s += total;
          const { p, ang } = trackPointAt(ride, s);
          drawables.push({
            key: p.x + p.y + 0.55 + p.z * 0.004,
            draw: () => {
              const q = proj(p.x, p.y, p.z + 0.5);
              c.save();
              c.translate(q.sx, q.sy);
              c.rotate(ang);
              // body with shaded skirt + nose
              c.fillStyle = 'rgba(0,0,0,0.3)';
              c.fillRect(-8, 2, 16, 3);
              c.fillStyle = colors[0];
              c.fillRect(-8, -5, 16, 8);
              c.fillStyle = 'rgba(255,255,255,0.25)';
              c.fillRect(-8, -5, 16, 2.5);
              c.fillStyle = 'rgba(0,0,0,0.25)';
              c.fillRect(-8, 0, 16, 3);
              if (car === 0) {
                c.fillStyle = colors[0];
                c.beginPath(); c.moveTo(8, -5); c.lineTo(13, -1); c.lineTo(8, 3); c.closePath(); c.fill();
              }
              if (t.peeps.length > car * def.coaster!.carCap) {
                c.fillStyle = '#ffd9b3';
                c.fillRect(-5, -8, 4, 4);
                c.fillRect(1, -8, 4, 4);
                c.fillStyle = PEEP_SHIRTS[(car * 3 + ride.id) % 8];
                c.fillRect(-5, -5.5, 4, 2);
                c.fillRect(1, -5.5, 4, 2);
              }
              c.restore();
            },
          });
        }
      }
    }
    // entrance / exit huts
    for (const [spot, sprite] of [[ride.entrance, S.hutEnt], [ride.exit, S.hutExit]] as const) {
      if (!spot || def.category === 'stall') continue;
      const z = vh(w, spot.x, spot.y);
      drawables.push({
        key: spot.x + spot.y + 0.45,
        draw: () => {
          const q = proj(spot.x + 0.5, spot.y + 0.5, z);
          blit(c, sprite, q.sx, q.sy);
        },
      });
    }
  }

  // park gate
  {
    const e = w.park.entrance;
    const z = vh(w, e.x, e.y);
    drawables.push({
      key: e.x + e.y + 0.7,
      draw: () => {
        const q = proj(e.x + 0.5, e.y + 0.5, z);
        blit(c, S.gate, q.sx, q.sy);
      },
    });
  }

  // peeps
  for (const p of w.peeps) {
    if (p.state === 'riding' || p.state === 'gone') continue;
    if (p.x < x0 - 1 || p.x > x1 + 2 || p.y < y0 - 1 || p.y > y1 + 2) continue;
    drawables.push({
      key: p.x + p.y + 0.35,
      draw: () => drawPeep(c, w, p, frame),
    });
  }

  drawables.sort((a, b) => a.key - b.key);
  for (const d of drawables) d.draw();
}

const HAIR = ['#4a2c12', '#1a1a1a', '#c8973a', '#6e3a1a', '#888888'];

function drawPeep(c: CanvasRenderingContext2D, w: World, p: Peep, frame: number): void {
  const z = vh(w, Math.floor(p.x), Math.floor(p.y));
  const q = proj(p.x, p.y, z);
  const step = Math.sin(frame * 0.35 + p.id * 1.7);
  const bob = Math.abs(step) * 0.7;
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath(); c.ellipse(q.sx, q.sy, 3.5, 1.6, 0, 0, 7); c.fill();
  // legs (scissor while walking)
  c.fillStyle = '#3d3d6b';
  c.fillRect(q.sx - 2 + step, q.sy - 4, 2, 4);
  c.fillRect(q.sx + 0.5 - step, q.sy - 4, 2, 4);
  // body
  const shirt = PEEP_SHIRTS[p.color];
  c.fillStyle = shirt;
  c.fillRect(q.sx - 2.5, q.sy - 9 - bob, 5.5, 5.5);
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.fillRect(q.sx - 2.5, q.sy - 9 - bob, 5.5, 1.5);
  // arms
  c.fillStyle = shirt;
  c.fillRect(q.sx - 3.5, q.sy - 8.5 - bob, 1.5, 4);
  c.fillRect(q.sx + 2.5, q.sy - 8.5 - bob, 1.5, 4);
  // head + hair
  c.fillStyle = '#ffd9b3';
  c.fillRect(q.sx - 2, q.sy - 13 - bob, 4.5, 4.5);
  c.fillStyle = HAIR[p.id % HAIR.length];
  c.fillRect(q.sx - 2, q.sy - 14 - bob, 4.5, 2);
  if (p.holding === 1) {
    c.fillStyle = '#e8a33d';
    c.fillRect(q.sx + 3.5, q.sy - 9 - bob, 2.5, 2);
  }
  if (p.holding === 2) {
    c.fillStyle = '#e74c3c';
    c.fillRect(q.sx + 3.5, q.sy - 9.5 - bob, 2, 3);
  }
}
