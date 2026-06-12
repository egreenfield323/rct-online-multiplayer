import {
  World, Ride, TrackPiece, Peep, ti, DX, DY,
  vh, corners, tileMinH, rideDef, sceneryDef, SCENERY_DEFS,
  PIECES, pieceExit, pieceAt, trackLengths,
} from '@park/shared';
import { TW, TH, ZH, Camera, proj, unproj } from './iso.js';
import { SpriteMap, PEEP_SHIRTS } from './sprites.js';

// ---------------------------------------------------------------- helpers

const GRASS_A = '#5daa44';
const GRASS_B = '#55a23c';
const DIRT = '#8a6b3d';
const DIRT_DARK = '#73592f';

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

// draw one piece: supports, then rails. Exported for ghost previews.
export function drawPiece(c: CanvasRenderingContext2D, w: World, p: TrackPiece, railCol: string, supCol: string, alpha = 1): void {
  const pts = piecePoints(p);
  c.save();
  c.globalAlpha *= alpha;
  // supports at entry + middle
  c.strokeStyle = supCol;
  c.lineWidth = 2;
  for (const t of [0.15, 0.85]) {
    const m = curveAt(pts, t);
    const gx = Math.max(0, Math.min(w.size - 1, Math.floor(m.x)));
    const gy = Math.max(0, Math.min(w.size - 1, Math.floor(m.y)));
    const g = vh(w, Math.round(m.x), Math.round(m.y));
    const wl = w.water[ti(w.size, gx, gy)];
    const ground = Math.max(g, wl);
    if (m.z > ground) {
      const top = proj(m.x, m.y, m.z);
      const bot = proj(m.x, m.y, ground);
      c.beginPath(); c.moveTo(top.sx, top.sy); c.lineTo(bot.sx, bot.sy); c.stroke();
    }
  }
  // station platform
  if (p.kind === 'station') {
    const cs: [number, number, number, number] = [p.z, p.z, p.z, p.z];
    tilePoly(c, p.x, p.y, cs);
    c.fillStyle = '#b8b09a';
    c.fill();
    c.strokeStyle = '#8a8270';
    c.stroke();
  }
  // two rails
  const off = 0.09;
  for (const side of [-off, off]) {
    c.strokeStyle = railCol;
    c.lineWidth = p.kind === 'lift' ? 2.5 : 2;
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const q = proj(a.x + (-dy / len) * side, a.y + (dx / len) * side, a.z);
      if (i === 0) c.moveTo(q.sx, q.sy);
      else c.lineTo(q.sx, q.sy);
    }
    c.stroke();
  }
  // ties (chain lift = dense yellow ladder, brakes = red)
  const tieN = p.kind === 'lift' ? 7 : p.kind === 'brakes' ? 5 : 3;
  c.strokeStyle = p.kind === 'lift' ? '#caa53d' : p.kind === 'brakes' ? '#c0392b' : supCol;
  c.lineWidth = 1.5;
  for (let i = 1; i <= tieN; i++) {
    const m = curveAt(pts, i / (tieN + 1));
    const n = curveAt(pts, Math.min(1, i / (tieN + 1) + 0.02));
    const dx = n.x - m.x, dy = n.y - m.y;
    const len = Math.hypot(dx, dy) || 1;
    const a = proj(m.x + (-dy / len) * off, m.y + (dx / len) * off, m.z);
    const b = proj(m.x + (dy / len) * off, m.y + (-dx / len) * off, m.z);
    c.beginPath(); c.moveTo(a.sx, a.sy); c.lineTo(b.sx, b.sy); c.stroke();
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
      const slope = cs[0] + cs[1] - cs[2] - cs[3]; // simple light: north-up brighter
      tilePoly(c, x, y, cs);
      let col = (x + y) % 2 === 0 ? GRASS_A : GRASS_B;
      if (slope > 0) col = '#69b850';
      else if (slope < 0) col = '#4c9434';
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.07)';
      c.stroke();

      // cliff faces toward the camera (south +y and east +x edges)
      const se = corners(w, x, y + 1); // [nw,ne,..] of southern neighbor = our [sw?]..
      if (y + 1 <= w.size - 1 || true) {
        const nb = y + 1 < w.size ? [vh(w, x, y + 1), vh(w, x + 1, y + 1)] : [0, 0];
        if (cs[3] > nb[0] || cs[2] > nb[1]) {
          const a = proj(x, y + 1, cs[3]);
          const b = proj(x + 1, y + 1, cs[2]);
          const a2 = proj(x, y + 1, nb[0]);
          const b2 = proj(x + 1, y + 1, nb[1]);
          c.beginPath(); c.moveTo(a.sx, a.sy); c.lineTo(b.sx, b.sy); c.lineTo(b2.sx, b2.sy); c.lineTo(a2.sx, a2.sy); c.closePath();
          c.fillStyle = DIRT; c.fill();
        }
        const nbe = x + 1 < w.size ? [vh(w, x + 1, y), vh(w, x + 1, y + 1)] : [0, 0];
        if (cs[1] > nbe[0] || cs[2] > nbe[1]) {
          const a = proj(x + 1, y, cs[1]);
          const b = proj(x + 1, y + 1, cs[2]);
          const a2 = proj(x + 1, y, nbe[0]);
          const b2 = proj(x + 1, y + 1, nbe[1]);
          c.beginPath(); c.moveTo(a.sx, a.sy); c.lineTo(b.sx, b.sy); c.lineTo(b2.sx, b2.sy); c.lineTo(a2.sx, a2.sy); c.closePath();
          c.fillStyle = DIRT_DARK; c.fill();
        }
      }

      // water
      const wl = w.water[i];
      if (wl > tileMinH(w, x, y)) {
        const shimmer = Math.sin(frame * 0.05 + x * 1.3 + y * 2.1) * 0.04;
        tilePoly(c, x, y, [wl, wl, wl, wl]);
        c.fillStyle = `rgba(42,110,187,${0.78 + shimmer})`;
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.25)';
        c.stroke();
      }

      // path
      const pk = w.path[i];
      if (pk !== 0) {
        tilePoly(c, x, y, cs);
        c.fillStyle = pk === 1 ? '#c8b485' : '#7d99c0';
        c.fill();
        c.strokeStyle = pk === 1 ? '#9a8a64' : '#5c7396';
        c.stroke();
        if (pk === 2) {
          // queue rails
          const m0 = proj(x + 0.5, y + 0.18, cs[0]);
          const m1 = proj(x + 0.5, y + 0.82, cs[2]);
          c.strokeStyle = '#3b5070'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(m0.sx, m0.sy); c.lineTo(m1.sx, m1.sy); c.stroke();
        }
      }

      // litter
      const lit = w.litter[i];
      if (lit > 0 && pk !== 0) {
        c.fillStyle = '#6b5e42';
        for (let k = 0; k < Math.min(4, lit); k++) {
          const q = proj(x + 0.25 + ((k * 37) % 50) / 100, y + 0.25 + ((k * 53) % 50) / 100, cs[0]);
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
            c.drawImage(sprite, q.sx - sprite.width / 2, q.sy - sprite.height + 4);
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
            c.drawImage(sprite, q.sx - sprite.width / 2, q.sy - sprite.height + 2);
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
          c.drawImage(sprite, q.sx - sprite.width / 2, q.sy - sprite.height + 6);
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
          const q = proj(cx, cy, z);
          // platform
          const p0 = proj(ride.x, ride.y, z);
          const p1 = proj(ride.x + n, ride.y, z);
          const p2 = proj(ride.x + n, ride.y + n, z);
          const p3 = proj(ride.x, ride.y + n, z);
          c.beginPath(); c.moveTo(p0.sx, p0.sy); c.lineTo(p1.sx, p1.sy); c.lineTo(p2.sx, p2.sy); c.lineTo(p3.sx, p3.sy); c.closePath();
          c.fillStyle = ride.open ? '#a8a090' : '#988f80';
          c.fill(); c.strokeStyle = '#6f685c'; c.stroke();
          if (sprite) {
            const bob = ride.phase === 'running' ? Math.sin(frame * 0.3) * 2 : 0;
            c.drawImage(sprite, q.sx - sprite.width / 2, q.sy - sprite.height + 10 + bob);
          }
        },
      });
    } else if (ride.track) {
      const colors = def.coaster!.colors;
      for (const p of ride.track) {
        drawables.push({
          key: p.x + p.y + 0.5 + p.z * 0.004,
          draw: () => drawPiece(c, w, p, colors[0], colors[1]),
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
              c.fillStyle = colors[0];
              c.fillRect(-7, -5, 14, 8);
              c.fillStyle = '#222';
              c.fillRect(-7, 1, 14, 2);
              if (t.peeps.length > car * def.coaster!.carCap) {
                c.fillStyle = '#ffd9b3';
                c.fillRect(-4, -7, 3, 3);
                c.fillRect(1, -7, 3, 3);
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
          c.drawImage(sprite, q.sx - sprite.width / 2, q.sy - sprite.height + 4);
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
        c.drawImage(S.gate, q.sx - S.gate.width / 2, q.sy - S.gate.height + 6);
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

function drawPeep(c: CanvasRenderingContext2D, w: World, p: Peep, frame: number): void {
  const z = vh(w, Math.floor(p.x), Math.floor(p.y));
  const q = proj(p.x, p.y, z);
  const step = Math.sin(frame * 0.4 + p.id) * 0.8;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(q.sx - 2, q.sy - 1, 5, 2);
  c.fillStyle = '#3d3d6b'; // legs
  c.fillRect(q.sx - 1.5, q.sy - 4 + Math.abs(step) * 0.4, 3, 4);
  c.fillStyle = PEEP_SHIRTS[p.color]; // shirt
  c.fillRect(q.sx - 2, q.sy - 8, 4.5, 5);
  c.fillStyle = '#ffd9b3'; // head
  c.fillRect(q.sx - 1.5, q.sy - 11, 3.5, 3.5);
  if (p.holding === 1) { c.fillStyle = '#e6a23c'; c.fillRect(q.sx + 2.5, q.sy - 7, 2, 2); }
  if (p.holding === 2) { c.fillStyle = '#e74c3c'; c.fillRect(q.sx + 2.5, q.sy - 7, 1.5, 2.5); }
}
