// Procedural pixel-art sprites, generated once at boot into offscreen canvases.
// Original art in an RCT-inspired palette — no copyrighted assets.

export type SpriteMap = Record<string, HTMLCanvasElement>;

function mk(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  draw(c);
  return cv;
}

function px(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// little iso diamond base (footprint hint under ride sprites)
function base(c: CanvasRenderingContext2D, w: number, h: number, col: string, edge: string): void {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(w / 2, h - 16);
  c.lineTo(w - 1, h - 8);
  c.lineTo(w / 2, h);
  c.lineTo(1, h - 8);
  c.closePath();
  c.fill();
  c.strokeStyle = edge;
  c.stroke();
}

export function generateSprites(): SpriteMap {
  const S: SpriteMap = {};

  // ------------------------------------------------------------ trees
  S.tree_oak = mk(28, 40, (c) => {
    px(c, 12, 26, 4, 12, '#7a4a22');
    c.fillStyle = '#2e7d32';
    c.beginPath(); c.arc(14, 16, 11, 0, 7); c.fill();
    c.fillStyle = '#43a047';
    c.beginPath(); c.arc(10, 12, 7, 0, 7); c.fill();
    c.fillStyle = '#1b5e20';
    c.beginPath(); c.arc(19, 20, 6, 0, 7); c.fill();
  });
  S.tree_pine = mk(24, 44, (c) => {
    px(c, 10, 34, 4, 10, '#6d4c41');
    c.fillStyle = '#1b5e20';
    for (let i = 0; i < 4; i++) {
      const y = 6 + i * 8, half = 4 + i * 2.5;
      c.beginPath(); c.moveTo(12, y - 6); c.lineTo(12 + half, y + 4); c.lineTo(12 - half, y + 4); c.closePath(); c.fill();
    }
  });
  S.tree_palm = mk(32, 42, (c) => {
    px(c, 14, 18, 4, 24, '#8d6e3f');
    c.strokeStyle = '#2e9e3e'; c.lineWidth = 3;
    for (const [dx, dy] of [[-12, -4], [12, -4], [-9, -10], [9, -10], [0, -13]]) {
      c.beginPath(); c.moveTo(16, 18); c.quadraticCurveTo(16 + dx * 0.7, 14 + dy, 16 + dx, 18 + dy); c.stroke();
    }
  });
  S.tree_bush = mk(22, 20, (c) => {
    c.fillStyle = '#388e3c';
    c.beginPath(); c.arc(11, 12, 8, 0, 7); c.fill();
    c.fillStyle = '#66bb6a';
    c.beginPath(); c.arc(8, 9, 5, 0, 7); c.fill();
  });
  S.garden = mk(40, 24, (c) => {
    c.fillStyle = '#6d8c3f';
    c.beginPath(); c.moveTo(20, 8); c.lineTo(38, 16); c.lineTo(20, 24); c.lineTo(2, 16); c.closePath(); c.fill();
    const cols = ['#e53935', '#ffeb3b', '#f06292', '#fff', '#ff9800'];
    for (let i = 0; i < 12; i++) px(c, 8 + (i * 7) % 24, 12 + ((i * 5) % 8), 2, 2, cols[i % 5]);
  });
  S.fence = mk(40, 22, (c) => {
    c.fillStyle = '#2e7d32';
    c.beginPath(); c.moveTo(2, 14); c.lineTo(20, 5); c.lineTo(38, 14); c.lineTo(38, 18); c.lineTo(20, 10); c.lineTo(2, 18); c.closePath(); c.fill();
  });
  S.bench = mk(20, 14, (c) => {
    px(c, 2, 4, 16, 3, '#a1762f');
    px(c, 2, 8, 16, 2, '#8d6e3f');
    px(c, 3, 10, 2, 4, '#5d4524'); px(c, 15, 10, 2, 4, '#5d4524');
  });
  S.lamp = mk(10, 30, (c) => {
    px(c, 4, 6, 2, 24, '#37474f');
    px(c, 2, 0, 6, 7, '#ffe082');
    c.strokeStyle = '#37474f'; c.strokeRect(2, 0, 6, 7);
  });
  S.bin = mk(12, 14, (c) => {
    px(c, 2, 2, 8, 11, '#546e7a');
    px(c, 1, 0, 10, 3, '#37474f');
  });

  // ------------------------------------------------------------ huts & gate
  const hut = (roof: string) =>
    mk(28, 30, (c) => {
      px(c, 4, 12, 20, 14, '#c9b079');
      px(c, 10, 17, 8, 9, '#4e342e');
      c.fillStyle = roof;
      c.beginPath(); c.moveTo(2, 13); c.lineTo(14, 2); c.lineTo(26, 13); c.closePath(); c.fill();
    });
  S.hutEnt = hut('#2962ff');
  S.hutExit = hut('#9e9e9e');
  S.gate = mk(72, 48, (c) => {
    px(c, 2, 16, 12, 30, '#b8a070');
    px(c, 58, 16, 12, 30, '#b8a070');
    px(c, 2, 10, 68, 10, '#8c2f39');
    c.fillStyle = '#ffe082';
    c.font = 'bold 8px monospace';
    c.fillText('OPENPARK', 16, 18);
  });

  // ------------------------------------------------------------ stalls
  const stall = (body: string, roof: string, sign: string) =>
    mk(40, 36, (c) => {
      base(c, 40, 36, '#9c9c9c', '#777');
      px(c, 6, 14, 28, 14, body);
      px(c, 8, 18, 24, 6, '#fff');
      c.fillStyle = roof;
      c.beginPath(); c.moveTo(2, 15); c.lineTo(20, 3); c.lineTo(38, 15); c.closePath(); c.fill();
      c.fillStyle = '#333'; c.font = 'bold 7px monospace';
      c.fillText(sign, 12, 24);
    });
  S.stall_burger = stall('#ffb74d', '#e65100', 'BURG');
  S.stall_fries = stall('#fff176', '#f9a825', 'FRY');
  S.stall_iceCream = stall('#f8bbd0', '#ec407a', 'ICE');
  S.stall_drinks = stall('#81d4fa', '#0277bd', 'SODA');
  S.stall_infoKiosk = stall('#c5e1a5', '#33691e', 'INFO');
  S.stall_toilets = stall('#b0bec5', '#455a64', 'WC');

  // ------------------------------------------------------------ flat rides (3×3 ≈ 96px wide)
  S.ride_merryGoRound = mk(96, 84, (c) => {
    c.fillStyle = '#d32f2f';
    c.beginPath(); c.ellipse(48, 36, 34, 16, 0, 0, 7); c.fill();
    c.fillStyle = '#ffca28';
    c.beginPath(); c.ellipse(48, 30, 34, 16, 0, 0, 7); c.fill();
    c.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      px(c, 48 + Math.cos(a) * 26 - 1, 36 + Math.sin(a) * 12, 2, 18, '#eee');
    }
    c.fillStyle = '#7b1fa2';
    c.beginPath(); c.moveTo(48, 6); c.lineTo(82, 30); c.lineTo(14, 30); c.closePath(); c.fill();
  });
  S.ride_ferrisWheel = mk(96, 110, (c) => {
    c.strokeStyle = '#90a4ae'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(30, 104); c.lineTo(48, 50); c.lineTo(66, 104); c.stroke();
    c.strokeStyle = '#1976d2'; c.lineWidth = 4;
    c.beginPath(); c.arc(48, 48, 40, 0, 7); c.stroke();
    c.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.beginPath(); c.moveTo(48, 48); c.lineTo(48 + Math.cos(a) * 40, 48 + Math.sin(a) * 40); c.stroke();
      px(c, 48 + Math.cos(a) * 40 - 5, 48 + Math.sin(a) * 40, 10, 8, ['#e53935', '#fdd835', '#43a047', '#8e24aa'][i % 4]);
    }
  });
  S.ride_twist = mk(96, 80, (c) => {
    base(c, 96, 80, '#8d8d8d', '#666');
    for (const [cx, cy] of [[30, 46], [66, 46], [48, 30]]) {
      px(c, cx - 2, cy, 4, 22, '#555');
      c.fillStyle = '#7cb342';
      c.beginPath(); c.ellipse(cx, cy, 16, 8, 0, 0, 7); c.fill();
      for (let i = 0; i < 3; i++) px(c, cx - 12 + i * 10, cy - 4, 6, 6, '#d84315');
    }
  });
  S.ride_hauntedHouse = mk(96, 92, (c) => {
    px(c, 14, 36, 68, 50, '#4e342e');
    px(c, 22, 48, 12, 16, '#1a1a1a'); px(c, 62, 48, 12, 16, '#1a1a1a');
    px(c, 42, 60, 14, 26, '#1a1a1a');
    c.fillStyle = '#311b92';
    c.beginPath(); c.moveTo(10, 38); c.lineTo(48, 6); c.lineTo(86, 38); c.closePath(); c.fill();
    px(c, 24, 14, 6, 26, '#3e2723');
    c.fillStyle = '#ffeb3b'; c.beginPath(); c.arc(48, 44, 4, 0, 7); c.fill();
  });
  S.ride_observationTower = mk(60, 130, (c) => {
    px(c, 26, 14, 8, 112, '#90a4ae');
    for (let y = 18; y < 120; y += 10) px(c, 22, y, 16, 2, '#78909c');
    px(c, 12, 30, 36, 12, '#ef5350');
    px(c, 16, 33, 28, 5, '#b3e5fc');
    px(c, 18, 2, 24, 12, '#eceff1');
  });
  S.ride_bumperCars = mk(128, 96, (c) => {
    c.fillStyle = '#616161';
    c.beginPath(); c.moveTo(64, 30); c.lineTo(124, 60); c.lineTo(64, 90); c.lineTo(4, 60); c.closePath(); c.fill();
    c.fillStyle = '#9e9e9e';
    c.beginPath(); c.moveTo(64, 26); c.lineTo(124, 56); c.lineTo(64, 86); c.lineTo(4, 56); c.closePath(); c.fill();
    const cols = ['#e53935', '#1e88e5', '#fdd835', '#43a047'];
    for (let i = 0; i < 6; i++) {
      const cx = 30 + (i % 3) * 26 + (i > 2 ? 13 : 0), cy = 46 + (i > 2 ? 14 : 0);
      c.fillStyle = cols[i % 4];
      c.beginPath(); c.ellipse(cx, cy, 9, 5, 0, 0, 7); c.fill();
    }
    px(c, 8, 20, 4, 36, '#757575'); px(c, 116, 20, 4, 36, '#757575');
    px(c, 8, 18, 112, 4, '#fdd835');
  });

  return S;
}

// stable per-player cursor colors
export const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#f06292', '#c0ca33'];
export const PEEP_SHIRTS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#26a69a', '#ec407a'];
