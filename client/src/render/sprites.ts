// Procedural pixel-art sprites, generated once at boot into offscreen canvases.
// Original art in an RCT-inspired palette — no copyrighted assets.
//
// Every sprite is drawn with a local isometric projector (same 2:1 projection
// as the world: tile = 64×32, height unit = 8px) so volumes sit correctly on
// the terrain. Sprites carry their anchor: ax/ay is the projected center of
// their footprint at ground level.

export interface Spr {
  cv: HTMLCanvasElement;
  ax: number;
  ay: number;
}

export type SpriteMap = Record<string, Spr>;

type P = (tx: number, ty: number, z: number) => [number, number];

interface Ctx2 extends CanvasRenderingContext2D {}

// ---------------------------------------------------------------- color math

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------- iso helpers

// Create a sprite canvas spanning `tilesW` tiles of width and `px` extra height,
// with a local projector whose (0,0,0) is the footprint center at ground level.
function isoSprite(
  name: string,
  S: SpriteMap,
  tilesW: number,
  topPx: number,
  draw: (c: Ctx2, p: P) => void,
): void {
  const w = Math.ceil(tilesW * 64) + 8;
  const ax = w / 2;
  const ay = topPx + Math.ceil(tilesW * 16) + 4; // room below center for the front half of the footprint
  const h = ay + Math.ceil(tilesW * 16) + 6;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')! as Ctx2;
  c.imageSmoothingEnabled = false;
  const p: P = (tx, ty, z) => [ax + (tx - ty) * 32, ay + (tx + ty) * 16 - z * 8];
  draw(c, p);
  S[name] = { cv, ax, ay };
}

function poly(c: Ctx2, pts: [number, number][], fill: string | CanvasGradient, stroke?: string): void {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.stroke();
  }
}

// linear gradient between two projected points (pre-rendered-3D face shading)
function grad(c: Ctx2, a: [number, number], b: [number, number], col0: string, col1: string): CanvasGradient {
  const g = c.createLinearGradient(a[0], a[1], b[0], b[1]);
  g.addColorStop(0, col0);
  g.addColorStop(1, col1);
  return g;
}

// shaded iso box over footprint [x0..x1]×[y0..y1] (tile units), z0..z1 (height units).
// Light from the upper-left (RCT-style): top brightest, left face mid, right face dark,
// every face gradient-shaded toward the ground with a specular line on the top edges.
function box(c: Ctx2, p: P, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, col: string, outline = true): void {
  const o = outline ? shade(col, 0.42) : undefined;
  // right face (+x side, toward screen lower-right) — darkest, in shade
  poly(c, [p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0), p(x1, y0, z0)],
    grad(c, p(x1, y0, z1), p(x1, y0, z0), shade(col, 0.78), shade(col, 0.55)), o);
  // left face (+y side, toward screen lower-left) — mid light
  poly(c, [p(x1, y1, z1), p(x0, y1, z1), p(x0, y1, z0), p(x1, y1, z0)],
    grad(c, p(x0, y1, z1), p(x0, y1, z0), shade(col, 0.98), shade(col, 0.74)), o);
  // top — brightest toward the back-left corner (light direction)
  poly(c, [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)],
    grad(c, p(x0, y0, z1), p(x1, y1, z1), shade(col, 1.26), shade(col, 1.04)), o);
  // specular highlight on the two top edges facing the light
  c.strokeStyle = 'rgba(255,255,240,0.4)';
  c.lineWidth = 1;
  const tA = p(x0, y0, z1), tB = p(x1, y0, z1), tC = p(x0, y1, z1);
  c.beginPath(); c.moveTo(tC[0], tC[1]); c.lineTo(tA[0], tA[1]); c.lineTo(tB[0], tB[1]); c.stroke();
}

// pyramid / hipped roof over a footprint, gradient-lit toward the apex
function roof(c: Ctx2, p: P, x0: number, y0: number, x1: number, y1: number, zBase: number, zApex: number, col: string): void {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const apex = p(cx, cy, zApex);
  const o = shade(col, 0.42);
  poly(c, [p(x1, y0, zBase), p(x1, y1, zBase), apex],
    grad(c, apex, p(x1, y1, zBase), shade(col, 0.82), shade(col, 0.55)), o); // right
  poly(c, [p(x1, y1, zBase), p(x0, y1, zBase), apex],
    grad(c, apex, p(x0, y1, zBase), shade(col, 1.05), shade(col, 0.78)), o); // front-left
  poly(c, [p(x0, y0, zBase), p(x1, y0, zBase), apex],
    grad(c, apex, p(x0, y0, zBase), shade(col, 1.3), shade(col, 1.05)), o); // back, catches the light
  // ridge highlights
  c.strokeStyle = 'rgba(255,255,240,0.35)';
  c.lineWidth = 1;
  const rA = p(x0, y1, zBase), rB = p(x0, y0, zBase);
  c.beginPath(); c.moveTo(rA[0], rA[1]); c.lineTo(apex[0], apex[1]); c.lineTo(rB[0], rB[1]); c.stroke();
}

// striped conical canopy (carousel top): fan of triangles around the apex,
// lit from the upper-left so the cone reads as a volume
function canopy(c: Ctx2, p: P, cx: number, cy: number, r: number, zBase: number, zApex: number, colA: string, colB: string, segs = 12): void {
  const apex = p(cx, cy, zApex);
  const lightDir = -Math.PI * 0.75; // upper-left
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const q0 = p(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, zBase);
    const q1 = p(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, zBase);
    // facing-the-light factor: 1.25 lit side → 0.65 shadow side
    const lit = 0.95 + 0.3 * Math.cos(mid - lightDir);
    const base = shade(i % 2 ? colA : colB, lit);
    poly(c, [q0, q1, apex], grad(c, apex, [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2], shade(base, 1.12), shade(base, 0.88)));
  }
}

// flat ellipse on the ground plane (shadow / platter)
function disc(c: Ctx2, p: P, cx: number, cy: number, r: number, z: number, col: string, stroke?: string): void {
  const [sx, sy] = p(cx, cy, z);
  // subtle radial shading so platters don't read flat
  const g = c.createRadialGradient(sx - r * 14, sy - r * 8, r * 4, sx, sy, r * 45);
  g.addColorStop(0, shade(col.startsWith('rgba') ? '#888888' : col, 1.12));
  g.addColorStop(1, col.startsWith('rgba') ? col : shade(col, 0.85));
  c.beginPath();
  c.ellipse(sx, sy, r * 45, r * 22.5, 0, 0, Math.PI * 2);
  c.fillStyle = col.startsWith('rgba') ? col : g;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}

// soft contact shadow (radial falloff, like a pre-rendered drop shadow)
function shadow(c: Ctx2, p: P, r: number): void {
  const [sx, sy] = p(0, 0, 0);
  const g = c.createRadialGradient(sx, sy, 1, sx, sy, r * 45);
  g.addColorStop(0, 'rgba(16,32,12,0.38)');
  g.addColorStop(0.7, 'rgba(16,32,12,0.18)');
  g.addColorStop(1, 'rgba(16,32,12,0)');
  c.save();
  c.translate(sx, sy);
  c.scale(1, 0.5);
  c.translate(-sx, -sy);
  c.fillStyle = g;
  c.beginPath();
  c.arc(sx, sy, r * 45, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// silhouette outline pass: dark 1px rim around the whole sprite (the RCT /
// Stardew look that makes objects pop off the terrain)
function outlineSprite(spr: Spr): Spr {
  const { cv } = spr;
  // silhouette = sprite alpha filled with the outline color
  const sil = document.createElement('canvas');
  sil.width = cv.width;
  sil.height = cv.height;
  const sc = sil.getContext('2d')!;
  sc.drawImage(cv, 0, 0);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = 'rgba(24,18,12,0.85)';
  sc.fillRect(0, 0, sil.width, sil.height);
  const out = document.createElement('canvas');
  out.width = cv.width + 2;
  out.height = cv.height + 2;
  const oc = out.getContext('2d')!;
  oc.imageSmoothingEnabled = false;
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) oc.drawImage(sil, dx, dy);
  oc.drawImage(cv, 1, 1);
  return { cv: out, ax: spr.ax + 1, ay: spr.ay + 1 };
}

// little blobby foliage cluster with 3-tone shading
function foliage(c: Ctx2, x: number, y: number, r: number, col: string): void {
  c.fillStyle = shade(col, 0.62);
  c.beginPath(); c.arc(x + r * 0.18, y + r * 0.18, r, 0, 7); c.fill();
  c.fillStyle = col;
  c.beginPath(); c.arc(x, y, r * 0.92, 0, 7); c.fill();
  c.fillStyle = shade(col, 1.3);
  c.beginPath(); c.arc(x - r * 0.3, y - r * 0.33, r * 0.45, 0, 7); c.fill();
  c.fillStyle = shade(col, 1.12);
  c.beginPath(); c.arc(x + r * 0.25, y - r * 0.15, r * 0.3, 0, 7); c.fill();
}

// ---------------------------------------------------------------- sprites

export function generateSprites(): SpriteMap {
  const S: SpriteMap = {};

  // ------------------------------------------------------------ trees
  isoSprite('tree_oak', S, 1, 52, (c, p) => {
    shadow(c, p, 0.42);
    const [bx, by] = p(0, 0, 0);
    c.fillStyle = '#6b4423';
    c.fillRect(bx - 3, by - 26, 6, 26);
    c.fillStyle = '#54351b';
    c.fillRect(bx + 1, by - 26, 2, 26);
    foliage(c, bx - 9, by - 36, 11, '#3a8f3e');
    foliage(c, bx + 9, by - 34, 10, '#2f7a33');
    foliage(c, bx, by - 46, 12, '#43a047');
  });
  isoSprite('tree_pine', S, 1, 62, (c, p) => {
    shadow(c, p, 0.36);
    const [bx, by] = p(0, 0, 0);
    c.fillStyle = '#5d4524';
    c.fillRect(bx - 2.5, by - 14, 5, 14);
    for (let i = 0; i < 4; i++) {
      const y = by - 16 - i * 12;
      const half = 17 - i * 3.6;
      // two-tone cone layer
      poly(c, [[bx, y - 14], [bx + half, y], [bx, y + 3]], '#1e5e23');
      poly(c, [[bx, y - 14], [bx - half, y], [bx, y + 3]], '#2e7d32');
      c.strokeStyle = '#144017';
      c.beginPath(); c.moveTo(bx - half, y); c.lineTo(bx, y + 3); c.lineTo(bx + half, y); c.stroke();
    }
  });
  isoSprite('tree_palm', S, 1, 56, (c, p) => {
    shadow(c, p, 0.4);
    const [bx, by] = p(0, 0, 0);
    // curved trunk with ring shading
    c.strokeStyle = '#8d6e3f';
    c.lineWidth = 5;
    c.beginPath(); c.moveTo(bx - 1, by); c.quadraticCurveTo(bx + 7, by - 22, bx + 3, by - 40); c.stroke();
    c.strokeStyle = '#6e5430';
    c.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const x = bx - 1 + (8 * t * (1 - t) * 2 + 4 * t * t) - 2, y = by - 40 * t;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 5, y - 1); c.stroke();
    }
    // fronds, two greens
    for (const [dx, dy, col] of [[-16, -2, '#2e9e3e'], [16, -2, '#27873a'], [-12, -10, '#36b549'], [12, -10, '#2e9e3e'], [-2, -13, '#27873a'], [5, -12, '#36b549']] as [number, number, string][]) {
      c.strokeStyle = col;
      c.lineWidth = 3.5;
      c.beginPath();
      c.moveTo(bx + 3, by - 40);
      c.quadraticCurveTo(bx + 3 + dx * 0.6, by - 44 + dy, bx + 3 + dx, by - 38 + dy + 6);
      c.stroke();
    }
    c.fillStyle = '#7a4f1d';
    c.beginPath(); c.arc(bx + 3, by - 40, 3, 0, 7); c.fill();
  });
  isoSprite('tree_bush', S, 1, 26, (c, p) => {
    shadow(c, p, 0.36);
    const [bx, by] = p(0, 0, 0);
    foliage(c, bx - 7, by - 8, 8, '#3a8f3e');
    foliage(c, bx + 7, by - 7, 7, '#2f7a33');
    foliage(c, bx, by - 13, 8, '#4aa84f');
  });

  // ------------------------------------------------------------ garden / hedge
  isoSprite('garden', S, 1, 14, (c, p) => {
    // stone border + soil bed
    poly(c, [p(-0.46, -0.46, 0), p(0.46, -0.46, 0), p(0.46, 0.46, 0), p(-0.46, 0.46, 0)], '#9b9b8c', '#6f6f63');
    poly(c, [p(-0.36, -0.36, 0.12), p(0.36, -0.36, 0.12), p(0.36, 0.36, 0.12), p(-0.36, 0.36, 0.12)], '#5d4a2e');
    const cols = ['#e53935', '#ffeb3b', '#f06292', '#ffffff', '#ff9800', '#ab47bc'];
    let k = 0;
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++) {
        if ((i + j) % 2 === 0) continue;
        const [fx, fy] = p(i * 0.14, j * 0.14, 0.2);
        c.fillStyle = '#2e7d32';
        c.fillRect(fx - 1, fy, 2, 3);
        c.fillStyle = cols[k++ % cols.length];
        c.fillRect(fx - 1.5, fy - 3, 3, 3);
      }
  });
  isoSprite('fence', S, 1, 20, (c, p) => {
    // hedge block
    box(c, p, -0.42, -0.18, 0.42, 0.18, 0, 1.6, '#2e7d32');
    // leafy texture on top
    const [tx, ty] = p(0, 0, 1.6);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = i % 2 ? '#3c9a41' : '#256b29';
      c.fillRect(tx - 24 + i * 5, ty - 2 + ((i * 13) % 3), 3, 2);
    }
  });

  // ------------------------------------------------------------ path furniture
  isoSprite('bench', S, 1, 16, (c, p) => {
    const [bx, by] = p(0, 0, 0);
    c.fillStyle = '#4a3018';
    c.fillRect(bx - 9, by - 5, 2, 6);
    c.fillRect(bx + 7, by - 5, 2, 6);
    c.fillStyle = '#a1762f';
    c.fillRect(bx - 11, by - 9, 22, 3);
    c.fillStyle = '#8a6325';
    c.fillRect(bx - 11, by - 6, 22, 2);
    c.fillStyle = '#b8893c';
    c.fillRect(bx - 11, by - 14, 22, 3); // backrest
  });
  isoSprite('lamp', S, 1, 36, (c, p) => {
    const [bx, by] = p(0, 0, 0);
    c.fillStyle = '#2f3b42';
    c.fillRect(bx - 4, by - 2, 8, 3);
    c.fillRect(bx - 1.5, by - 28, 3, 27);
    c.fillStyle = '#1f2930';
    c.fillRect(bx + 0.5, by - 28, 1, 27);
    c.fillStyle = '#ffe082';
    c.fillRect(bx - 4, by - 36, 8, 9);
    c.fillStyle = '#fff7d0';
    c.fillRect(bx - 2, by - 34, 3, 4);
    c.strokeStyle = '#2f3b42';
    c.strokeRect(bx - 4.5, by - 36.5, 9, 10);
    c.fillStyle = '#2f3b42';
    poly(c, [[bx - 6, by - 36], [bx + 6, by - 36], [bx, by - 41]], '#2f3b42');
  });
  isoSprite('bin', S, 1, 16, (c, p) => {
    const [bx, by] = p(0, 0, 0);
    c.fillStyle = '#48626e';
    c.fillRect(bx - 5, by - 12, 10, 12);
    c.fillStyle = '#39505a';
    c.fillRect(bx + 1, by - 12, 4, 12);
    c.fillStyle = '#2c3e46';
    c.fillRect(bx - 6, by - 14, 12, 3);
    c.fillStyle = '#5d7d8c';
    c.fillRect(bx - 4, by - 10, 2, 8);
  });

  // ------------------------------------------------------------ entrance gate (spans the path tile)
  isoSprite('gate', S, 2.4, 92, (c, p) => {
    const brick = '#9c4a3c';
    const stone = '#cfc6ad';
    // two square towers astride the path
    for (const side of [-1, 1]) {
      const x0 = side * 0.95 - 0.42, x1 = side * 0.95 + 0.42;
      box(c, p, x0, -0.42, x1, 0.42, 0, 7.2, brick);
      // stone trim base + cap
      box(c, p, x0 - 0.06, -0.48, x1 + 0.06, 0.48, 0, 0.7, stone);
      box(c, p, x0 - 0.08, -0.5, x1 + 0.08, 0.5, 7.2, 8, stone);
      // battlements
      for (const [mx, my] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28], [0, 0]] as [number, number][]) {
        box(c, p, side * 0.95 + mx - 0.12, my - 0.12, side * 0.95 + mx + 0.12, my + 0.12, 8, 8.8, stone);
      }
      // arrow-slit window
      const [wx, wy] = p(side * 0.95, 0.43, 4.4);
      c.fillStyle = '#3a2420';
      c.fillRect(wx - 2, wy - 8, 4, 12);
      // mortar lines on the front-left face
      c.strokeStyle = shade(brick, 0.75);
      c.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const a = p(x1, 0.42, i * 1.15);
        const b = p(x0, 0.42, i * 1.15);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      }
    }
    // archway beam connecting the towers (a box high over the path)
    box(c, p, -0.78, -0.3, 0.78, 0.3, 5.2, 6.8, '#8c2f39');
    // sign face on the beam
    const a = p(0.78, 0.3, 6.5), b = p(-0.78, 0.3, 6.5), d = p(-0.78, 0.3, 5.5), e = p(0.78, 0.3, 5.5);
    poly(c, [a, b, d, e], '#26333d');
    c.save();
    const mid = p(0, 0.3, 6);
    c.translate(mid[0], mid[1]);
    c.transform(1, 0.5, 0, 1, 0, 0); // shear text onto the iso face
    c.fillStyle = '#ffd54f';
    c.font = 'bold 10px monospace';
    c.textAlign = 'center';
    c.fillText('OPENPARK', 0, 3);
    c.restore();
    // flags
    for (const side of [-1, 1]) {
      const [fx, fy] = p(side * 0.95, 0, 8.8);
      c.strokeStyle = '#444';
      c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 12); c.stroke();
      c.fillStyle = side < 0 ? '#e53935' : '#1e88e5';
      poly(c, [[fx, fy - 12], [fx + 9, fy - 9.5], [fx, fy - 7]], side < 0 ? '#e53935' : '#1e88e5');
    }
  });

  // ------------------------------------------------------------ ride entrance/exit huts
  const hut = (name: string, roofCol: string, sign: string) =>
    isoSprite(name, S, 1, 40, (c, p) => {
      shadow(c, p, 0.45);
      box(c, p, -0.34, -0.34, 0.34, 0.34, 0, 2.6, '#c9b079');
      // doorway on the front-left face
      const [dx, dy] = p(0, 0.35, 0);
      c.fillStyle = '#3c2a1a';
      c.fillRect(dx - 5, dy - 17, 10, 14);
      c.fillStyle = '#55402a';
      c.fillRect(dx - 5, dy - 17, 3, 14);
      roof(c, p, -0.46, -0.46, 0.46, 0.46, 2.6, 4.6, roofCol);
      // little sign
      const [sx2, sy2] = p(0, 0.46, 3.4);
      c.fillStyle = '#fff8e0';
      c.fillRect(sx2 - 8, sy2 - 4, 16, 8);
      c.strokeStyle = '#6b5b3a';
      c.strokeRect(sx2 - 8, sy2 - 4, 16, 8);
      c.fillStyle = '#333';
      c.font = 'bold 6px monospace';
      c.textAlign = 'center';
      c.fillText(sign, sx2, sy2 + 2.5);
    });
  hut('hutEnt', '#2962ff', 'IN');
  hut('hutExit', '#78909c', 'OUT');

  // ------------------------------------------------------------ stalls (1 tile)
  const stall = (name: string, body: string, awnA: string, awnB: string, icon: (c: Ctx2, x: number, y: number) => void) =>
    isoSprite(name, S, 1, 46, (c, p) => {
      shadow(c, p, 0.5);
      box(c, p, -0.4, -0.4, 0.4, 0.4, 0, 2.8, body);
      // serving window + counter on the front-left face
      const [wx, wy] = p(0, 0.41, 0);
      c.fillStyle = '#2e2218';
      c.fillRect(wx - 11, wy - 19, 22, 11);
      c.fillStyle = '#f5ead0';
      c.fillRect(wx - 11, wy - 20, 22, 2);
      c.fillStyle = shade(body, 0.6);
      c.fillRect(wx - 12, wy - 8, 24, 3);
      // striped awning over the window
      for (let i = 0; i < 6; i++) {
        const x = wx - 15 + i * 5;
        poly(c, [[x, wy - 26], [x + 5, wy - 26 + 2.5], [x + 5, wy - 20 + 2.5], [x, wy - 20]], i % 2 ? awnA : awnB, shade(awnB, 0.6));
      }
      roof(c, p, -0.48, -0.48, 0.48, 0.48, 2.8, 4.4, awnA);
      // rooftop icon sign on a pole
      const [ix, iy] = p(0, 0, 4.4);
      c.strokeStyle = '#5d4a2e';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(ix, iy + 2); c.lineTo(ix, iy - 7); c.stroke();
      c.fillStyle = '#fff8e0';
      c.beginPath(); c.arc(ix, iy - 12, 8.5, 0, 7); c.fill();
      c.strokeStyle = '#6b5b3a';
      c.lineWidth = 1.5;
      c.stroke();
      icon(c, ix, iy - 12);
    });
  stall('stall_burger', '#b8742f', '#e65100', '#ffcc80', (c, x, y) => {
    c.fillStyle = '#e8a33d';
    c.fillRect(x - 5, y - 4, 10, 2.5); // bun top
    c.fillStyle = '#7c4a1e';
    c.fillRect(x - 5, y - 1, 10, 2); // patty
    c.fillStyle = '#8bc34a';
    c.fillRect(x - 5, y + 0.5, 10, 1);
    c.fillStyle = '#e8a33d';
    c.fillRect(x - 5, y + 2, 10, 2);
  });
  stall('stall_fries', '#c9a227', '#f9a825', '#fff59d', (c, x, y) => {
    c.fillStyle = '#d32f2f';
    poly(c, [[x - 4, y - 1], [x + 4, y - 1], [x + 3, y + 5], [x - 3, y + 5]], '#d32f2f');
    c.fillStyle = '#ffe082';
    for (let i = 0; i < 4; i++) c.fillRect(x - 3.5 + i * 2.2, y - 6, 1.6, 6);
  });
  stall('stall_iceCream', '#b86a8e', '#ec407a', '#f8bbd0', (c, x, y) => {
    c.fillStyle = '#d9a066';
    poly(c, [[x - 3, y], [x + 3, y], [x, y + 6]], '#d9a066');
    c.fillStyle = '#fce4ec';
    c.beginPath(); c.arc(x, y - 2, 3.5, 0, 7); c.fill();
    c.fillStyle = '#e57373';
    c.fillRect(x - 0.5, y - 6.5, 1.5, 2);
  });
  stall('stall_drinks', '#3878a8', '#0277bd', '#81d4fa', (c, x, y) => {
    c.fillStyle = '#e53935';
    c.fillRect(x - 3, y - 4, 6, 9);
    c.fillStyle = '#ffffff';
    c.fillRect(x - 3, y - 1, 6, 2);
    c.fillStyle = '#90a4ae';
    c.fillRect(x + 1, y - 7, 1.2, 4);
  });
  stall('stall_infoKiosk', '#56783a', '#33691e', '#c5e1a5', (c, x, y) => {
    c.fillStyle = '#1b5e20';
    c.font = 'bold 11px serif';
    c.textAlign = 'center';
    c.fillText('i', x, y + 4);
  });
  stall('stall_toilets', '#5c707a', '#455a64', '#b0bec5', (c, x, y) => {
    c.fillStyle = '#37474f';
    c.font = 'bold 7px sans-serif';
    c.textAlign = 'center';
    c.fillText('WC', x, y + 2.5);
  });

  // ------------------------------------------------------------ flat rides (3×3 footprint → ~192px wide)
  isoSprite('ride_merryGoRound', S, 3, 86, (c, p) => {
    disc(c, p, 0, 0, 1.25, 0, '#8d6e63', '#5d4037'); // wooden deck
    disc(c, p, 0, 0, 1.1, 0.25, '#a1887f', '#6d4c41');
    // horses on poles around the platform
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const hx = Math.cos(a) * 0.82, hy = Math.sin(a) * 0.82;
      const [px2, py2] = p(hx, hy, 0.25);
      c.strokeStyle = '#d4af37';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px2, py2 - 2); c.lineTo(px2, py2 - 26); c.stroke();
      // pony: body + head + legs
      const col = ['#ffffff', '#e57373', '#7986cb', '#ffb74d'][i % 4];
      const back = Math.sin(a) < -0.2;
      c.globalAlpha = back ? 0.92 : 1;
      c.fillStyle = col;
      c.fillRect(px2 - 5, py2 - 16, 10, 5);
      c.fillRect(px2 + 3, py2 - 19, 4, 4);
      c.fillStyle = shade(col, 0.7);
      c.fillRect(px2 - 4, py2 - 11, 2, 4);
      c.fillRect(px2 + 2, py2 - 11, 2, 4);
      c.globalAlpha = 1;
    }
    // center column
    box(c, p, -0.16, -0.16, 0.16, 0.16, 0.25, 3.4, '#b03a48');
    const [mx, my] = p(0, 0, 3.4);
    c.fillStyle = '#d4af37';
    c.fillRect(mx - 3, my - 4, 6, 4);
    // grand striped canopy with scalloped rim
    canopy(c, p, 0, 0, 1.35, 3.2, 5.6, '#e53935', '#fdd835', 16);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const [ex, ey] = p(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 3.2);
      c.fillStyle = i % 2 ? '#e53935' : '#fdd835';
      c.beginPath(); c.arc(ex, ey, 3, 0, Math.PI); c.fill();
    }
    const apex = p(0, 0, 5.6);
    c.fillStyle = '#d4af37';
    c.beginPath(); c.arc(apex[0], apex[1] - 2, 3, 0, 7); c.fill();
  });

  isoSprite('ride_ferrisWheel', S, 3, 150, (c, p) => {
    disc(c, p, 0, 0, 1.2, 0, '#9e9e9e', '#6e6e6e');
    const [hx, hy] = p(0, 0, 8.5); // hub
    // A-frame supports (both sides for depth)
    for (const dy of [-0.5, 0.5]) {
      const [f1x, f1y] = p(-0.9, dy, 0);
      const [f2x, f2y] = p(0.9, dy, 0);
      c.strokeStyle = dy < 0 ? '#7e8a90' : '#aab4ba';
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(f1x, f1y); c.lineTo(hx, hy); c.lineTo(f2x, f2y); c.stroke();
      c.lineWidth = 2;
      c.beginPath(); c.moveTo((f1x + hx) / 2, (f1y + hy) / 2); c.lineTo((f2x + hx) / 2, (f2y + hy) / 2); c.stroke();
    }
    // wheel: double rim + spokes
    const R = 58;
    c.strokeStyle = '#1565c0';
    c.lineWidth = 3.5;
    c.beginPath(); c.ellipse(hx, hy, R, R * 0.92, 0, 0, 7); c.stroke();
    c.strokeStyle = '#1e88e5';
    c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(hx, hy, R - 6, (R - 6) * 0.92, 0, 0, 7); c.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(a) * (R - 6), hy + Math.sin(a) * (R - 6) * 0.92); c.stroke();
    }
    c.fillStyle = '#0d47a1';
    c.beginPath(); c.arc(hx, hy, 5, 0, 7); c.fill();
    c.fillStyle = '#90caf9';
    c.beginPath(); c.arc(hx - 1.5, hy - 1.5, 2, 0, 7); c.fill();
    // gondolas hanging off the rim
    const cols = ['#e53935', '#fdd835', '#43a047', '#8e24aa', '#fb8c00', '#00acc1'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      const gx = hx + Math.cos(a) * R, gy = hy + Math.sin(a) * R * 0.92;
      c.strokeStyle = '#555';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx, gy + 4); c.stroke();
      const col = cols[i % 6];
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(gx - 6, gy + 4); c.lineTo(gx + 6, gy + 4); c.lineTo(gx + 4, gy + 11); c.lineTo(gx - 4, gy + 11);
      c.closePath(); c.fill();
      c.fillStyle = shade(col, 0.65);
      c.fillRect(gx - 6, gy + 4, 12, 2);
    }
  });

  isoSprite('ride_twist', S, 3, 64, (c, p) => {
    disc(c, p, 0, 0, 1.3, 0, '#78909c', '#546e7a');
    disc(c, p, 0, 0, 1.15, 0.2, '#90a4ae', '#607d8b');
    // central column, three sweep arms with spinning car clusters at the tips
    const [hx2, hy2] = p(0, 0, 2.8);
    for (let arm = 0; arm < 3; arm++) {
      const a = (arm / 3) * Math.PI * 2 + 0.55;
      const ex2 = Math.cos(a) * 0.85, ey2 = Math.sin(a) * 0.85;
      const tip = p(ex2, ey2, 1.9);
      const back = Math.sin(a) < -0.3;
      // arm: thick dark line with a highlight
      c.strokeStyle = back ? '#33424a' : '#455a64';
      c.lineWidth = 5;
      c.beginPath(); c.moveTo(hx2, hy2); c.lineTo(tip[0], tip[1]); c.stroke();
      c.strokeStyle = '#78909c';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(hx2, hy2 - 1.5); c.lineTo(tip[0], tip[1] - 1.5); c.stroke();
      // hub + 3 cars around the tip
      c.fillStyle = '#37474f';
      c.beginPath(); c.arc(tip[0], tip[1], 3, 0, 7); c.fill();
      for (let k = 0; k < 3; k++) {
        const b = a * 2 + (k / 3) * Math.PI * 2;
        const cx2 = tip[0] + Math.cos(b) * 14, cy2 = tip[1] + Math.sin(b) * 7 + 4;
        c.strokeStyle = '#546e7a';
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(cx2, cy2 - 3); c.stroke();
        const col = ['#7cb342', '#d84315', '#ffb300'][k];
        c.fillStyle = '#263238';
        c.beginPath(); c.ellipse(cx2, cy2 + 1.5, 7.5, 4.5, 0, 0, 7); c.fill();
        c.fillStyle = col;
        c.beginPath(); c.ellipse(cx2, cy2, 7, 4.5, 0, 0, 7); c.fill();
        c.fillStyle = shade(col, 1.35);
        c.beginPath(); c.ellipse(cx2 - 1.5, cy2 - 1.5, 3, 1.8, 0, 0, 7); c.fill();
        c.fillStyle = '#263238'; // seat back
        c.beginPath(); c.ellipse(cx2 + 2, cy2 - 2.5, 2.5, 1.5, 0, 0, 7); c.fill();
      }
    }
    // column drawn after back arms, before front: simple cheat — redraw over center
    box(c, p, -0.12, -0.12, 0.12, 0.12, 0.2, 2.8, '#b03a48');
    const capq = p(0, 0, 2.8);
    c.fillStyle = '#d4af37';
    c.beginPath(); c.arc(capq[0], capq[1], 4, 0, 7); c.fill();
  });

  isoSprite('ride_hauntedHouse', S, 3, 110, (c, p) => {
    shadow(c, p, 1.3);
    // main mansion block
    box(c, p, -1.1, -0.9, 0.7, 0.9, 0, 6, '#4e342e');
    // tower
    box(c, p, 0.5, -0.9, 1.3, -0.1, 0, 8.5, '#3e2723');
    roof(c, p, 0.42, -0.98, 1.38, -0.02, 8.5, 11.5, '#311b92');
    // mansion gabled roof
    roof(c, p, -1.2, -1, 0.8, 1, 6, 8.2, '#4527a0');
    // glowing windows on the front-left face
    const win = (tx: number, z: number, lit: boolean) => {
      const [wx2, wy2] = p(tx, 0.91, z);
      c.fillStyle = lit ? '#ffd54f' : '#1a1208';
      c.fillRect(wx2 - 3.5, wy2 - 9, 7, 9);
      c.strokeStyle = '#241a10';
      c.strokeRect(wx2 - 3.5, wy2 - 9, 7, 9);
      if (lit) {
        c.fillStyle = '#241a10';
        c.fillRect(wx2 - 0.5, wy2 - 9, 1, 9);
        c.fillRect(wx2 - 3.5, wy2 - 5, 7, 1);
      }
    };
    win(-0.8, 4.6, true);
    win(-0.2, 4.6, false);
    win(0.4, 4.6, true);
    win(-0.8, 2.2, false);
    win(0.4, 2.2, true);
    // door
    const [dx2, dy2] = p(-0.2, 0.91, 0);
    c.fillStyle = '#140c06';
    c.fillRect(dx2 - 5, dy2 - 14, 10, 14);
    c.beginPath(); c.arc(dx2, dy2 - 14, 5, Math.PI, 0); c.fill();
    // tower window (ghost!)
    const [gx2, gy2] = p(0.9, -0.09, 6.4);
    c.fillStyle = '#0d0d1a';
    c.fillRect(gx2 - 4, gy2 - 10, 8, 10);
    c.fillStyle = 'rgba(200,230,255,0.9)';
    c.beginPath(); c.arc(gx2, gy2 - 6, 2.5, 0, 7); c.fill();
    // crooked weathervane
    const [vx, vy] = p(0.9, -0.5, 11.5);
    c.strokeStyle = '#888';
    c.beginPath(); c.moveTo(vx, vy); c.lineTo(vx + 3, vy - 7); c.stroke();
  });

  isoSprite('ride_observationTower', S, 3, 170, (c, p) => {
    disc(c, p, 0, 0, 0.9, 0, '#9e9e9e', '#6e6e6e');
    // lattice mast
    const top = p(0, 0, 19);
    const [bx, by] = p(0, 0, 0.2);
    c.fillStyle = '#90a4ae';
    c.fillRect(bx - 5, top[1], 10, by - top[1]);
    c.fillStyle = '#62757f';
    c.fillRect(bx + 1, top[1], 4, by - top[1]);
    c.strokeStyle = '#546e7a';
    c.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const y0 = by - i * ((by - top[1]) / 16);
      c.beginPath(); c.moveTo(bx - 5, y0); c.lineTo(bx + 5, y0 - 5); c.stroke();
    }
    // observation cabin partway up: red drum with window quads on the iso faces
    const zCab = 12;
    box(c, p, -0.5, -0.5, 0.5, 0.5, zCab, zCab + 1.7, '#e53935');
    box(c, p, -0.56, -0.56, 0.56, 0.56, zCab - 0.3, zCab, '#b71c1c'); // skirt
    const winFace = (fx0: number, fy0: number, fx1: number, fy1: number) => {
      for (let k = 0; k < 4; k++) {
        const t0 = 0.12 + k * 0.22, t1 = t0 + 0.14;
        const ax = fx0 + (fx1 - fx0) * t0, ay = fy0 + (fy1 - fy0) * t0;
        const bx2 = fx0 + (fx1 - fx0) * t1, by2 = fy0 + (fy1 - fy0) * t1;
        poly(c, [p(ax, ay, zCab + 1.35), p(bx2, by2, zCab + 1.35), p(bx2, by2, zCab + 0.45), p(ax, ay, zCab + 0.45)], '#bbdefb', '#7a1f1f');
      }
    };
    winFace(-0.5, 0.5, 0.5, 0.5); // front-left face
    winFace(0.5, -0.5, 0.5, 0.5); // front-right face
    // crown
    box(c, p, -0.2, -0.2, 0.2, 0.2, 19, 19.6, '#eceff1');
    const [fx, fy] = p(0, 0, 19.6);
    c.strokeStyle = '#666';
    c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 9); c.stroke();
    c.fillStyle = '#e53935';
    poly(c, [[fx, fy - 9], [fx + 7, fy - 7], [fx, fy - 5]], '#e53935');
  });

  isoSprite('ride_bumperCars', S, 4, 70, (c, p) => {
    // arena: floor + low walls + corner posts + light gantry
    poly(c, [p(-1.9, -1.9, 0), p(1.9, -1.9, 0), p(1.9, 1.9, 0), p(-1.9, 1.9, 0)], '#37474f', '#263238');
    poly(c, [p(-1.7, -1.7, 0.15), p(1.7, -1.7, 0.15), p(1.7, 1.7, 0.15), p(-1.7, 1.7, 0.15)], '#546e7a');
    // floor sheen
    poly(c, [p(-1.5, -1.2, 0.16), p(0.2, -1.6, 0.16), p(1.2, -0.4, 0.16), p(-0.6, 0.2, 0.16)], 'rgba(255,255,255,0.06)');
    box(c, p, -1.9, -1.9, 1.9, -1.7, 0, 0.8, '#b03a48', false);
    box(c, p, -1.9, -1.9, -1.7, 1.9, 0, 0.8, '#b03a48', false);
    box(c, p, 1.7, -1.9, 1.9, 1.9, 0, 0.8, '#8c2f39', false);
    box(c, p, -1.9, 1.7, 1.9, 1.9, 0, 0.8, '#8c2f39', false);
    for (const [px3, py3] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]] as [number, number][]) {
      box(c, p, px3 - 0.1, py3 - 0.1, px3 + 0.1, py3 + 0.1, 0, 4.2, '#78909c');
    }
    // ceiling grid wires
    c.strokeStyle = 'rgba(180,200,210,0.55)';
    c.lineWidth = 1;
    const c1 = p(-1.8, -1.8, 4.2), c2 = p(1.8, -1.8, 4.2), c3 = p(1.8, 1.8, 4.2), c4 = p(-1.8, 1.8, 4.2);
    c.beginPath(); c.moveTo(c1[0], c1[1]); c.lineTo(c2[0], c2[1]); c.lineTo(c3[0], c3[1]); c.lineTo(c4[0], c4[1]); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo((c1[0] + c4[0]) / 2, (c1[1] + c4[1]) / 2); c.lineTo((c2[0] + c3[0]) / 2, (c2[1] + c3[1]) / 2); c.stroke();
    // cars with poles
    const cars: [number, number, string][] = [
      [-0.9, -0.6, '#e53935'], [0.4, -1.0, '#1e88e5'], [1.0, 0.2, '#fdd835'],
      [-0.3, 0.6, '#43a047'], [-1.1, 1.0, '#fb8c00'], [0.7, 1.1, '#8e24aa'],
    ];
    for (const [cx3, cy3, col] of cars) {
      const [qx, qy] = p(cx3, cy3, 0.16);
      c.strokeStyle = '#90a4ae';
      c.lineWidth = 1.5;
      const top2 = p(cx3, cy3, 4.1);
      c.beginPath(); c.moveTo(qx, qy - 6); c.lineTo(top2[0] + 2, top2[1]); c.stroke();
      c.fillStyle = '#212121';
      c.beginPath(); c.ellipse(qx, qy, 10, 6, 0, 0, 7); c.fill();
      c.fillStyle = col;
      c.beginPath(); c.ellipse(qx, qy - 2, 9, 5.5, 0, 0, 7); c.fill();
      c.fillStyle = shade(col, 1.35);
      c.beginPath(); c.ellipse(qx - 2, qy - 3.5, 3.5, 2, 0, 0, 7); c.fill();
      c.fillStyle = '#37474f';
      c.beginPath(); c.ellipse(qx + 2, qy - 4, 2.5, 1.5, 0, 0, 7); c.fill();
    }
  });

  // rim every sprite with a dark silhouette outline
  for (const key of Object.keys(S)) S[key] = outlineSprite(S[key]);

  return S;
}

// stable per-player cursor colors
export const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#f06292', '#c0ca33'];
export const PEEP_SHIRTS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#26a69a', '#ec407a'];
