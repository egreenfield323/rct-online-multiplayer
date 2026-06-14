import { World, Peep, corners, vh, rideDef, isWalkable } from '@park/shared';
import { Camera, proj } from './iso.js';
import { drawPiece } from './renderer.js';
import { PEEP_SHIRTS } from './sprites.js';
import { Ghost, Peer } from '../state.js';

// Collaborative layer: other players' named cursors (always visible) and
// translucent ghosts of whatever anyone is currently placing. Local tool
// preview is drawn through the same path (drawGhost) for consistency.

export function drawGhost(c: CanvasRenderingContext2D, w: World, g: Ghost, color: string): void {
  c.save();
  if (g.k === 'tiles') {
    c.globalAlpha = 0.45;
    for (const [x, y] of g.tiles) {
      if (x < 0 || y < 0 || x >= w.size || y >= w.size) continue;
      const cs = corners(w, x, y);
      const p0 = proj(x, y, cs[0]);
      const p1 = proj(x + 1, y, cs[1]);
      const p2 = proj(x + 1, y + 1, cs[2]);
      const p3 = proj(x, y + 1, cs[3]);
      c.beginPath();
      c.moveTo(p0.sx, p0.sy); c.lineTo(p1.sx, p1.sy); c.lineTo(p2.sx, p2.sy); c.lineTo(p3.sx, p3.sy);
      c.closePath();
      c.fillStyle = g.ok ? color : '#d33';
      c.fill();
      c.globalAlpha = 0.8;
      c.strokeStyle = g.ok ? '#fff' : '#f99';
      c.stroke();
      c.globalAlpha = 0.45;
    }
  } else {
    const railCol = g.ok ? color : '#d33';
    let def;
    try {
      def = rideDef(g.type);
    } catch {
      def = null;
    }
    for (const p of g.pieces) {
      drawPiece(c, w, p, railCol, def?.coaster?.colors[1] ?? '#999', 0.5);
    }
  }
  if (g.label && (g.k !== 'tiles' ? g.pieces.length : g.tiles.length) > 0) {
    const at = g.k === 'tiles' ? g.tiles[0] : [g.pieces[0].x, g.pieces[0].y];
    const z = vh(w, at[0], at[1]) + (g.k === 'track' ? g.pieces[0].z - vh(w, at[0], at[1]) : 0);
    const q = proj(at[0] + 0.5, at[1] + 0.5, Math.max(z, vh(w, at[0], at[1])));
    label(c, q.sx, q.sy - 34, g.label, g.ok ? '#234' : '#a22', '#fff');
  }
  c.restore();
}

function label(c: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string): void {
  c.save();
  c.font = 'bold 11px system-ui, sans-serif';
  const wpx = c.measureText(text).width + 10;
  c.globalAlpha = 0.85;
  c.fillStyle = bg;
  c.fillRect(x - wpx / 2, y - 8, wpx, 16);
  c.globalAlpha = 1;
  c.fillStyle = fg;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x, y);
  c.restore();
}

// A guest being dragged: highlight the drop tile (green on a path, red off it)
// and draw the lifted guest hovering above the cursor.
export function drawCarriedPeep(c: CanvasRenderingContext2D, w: World, peep: Peep, wx: number, wy: number): void {
  const tx = Math.floor(wx), ty = Math.floor(wy);
  c.save();
  if (tx >= 0 && ty >= 0 && tx < w.size && ty < w.size) {
    const ok = isWalkable(w, tx, ty);
    const cs = corners(w, tx, ty);
    const p0 = proj(tx, ty, cs[0]), p1 = proj(tx + 1, ty, cs[1]), p2 = proj(tx + 1, ty + 1, cs[2]), p3 = proj(tx, ty + 1, cs[3]);
    c.globalAlpha = 0.5;
    c.beginPath();
    c.moveTo(p0.sx, p0.sy); c.lineTo(p1.sx, p1.sy); c.lineTo(p2.sx, p2.sy); c.lineTo(p3.sx, p3.sy); c.closePath();
    c.fillStyle = ok ? '#5dca5d' : '#d33';
    c.fill();
    c.globalAlpha = 1;
  }
  const cz = vh(w, Math.max(0, Math.min(w.size - 1, tx)), Math.max(0, Math.min(w.size - 1, ty)));
  const q = proj(wx, wy, cz);
  const lift = 24;
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(q.sx, q.sy, 4, 2, 0, 0, 7); c.fill();
  const shirt = PEEP_SHIRTS[peep.color % PEEP_SHIRTS.length];
  c.fillStyle = shirt;
  c.fillRect(q.sx - 3, q.sy - lift - 5, 6, 7);
  c.fillStyle = '#ffd9b3';
  c.fillRect(q.sx - 2.5, q.sy - lift - 11, 5, 5);
  c.strokeStyle = 'rgba(255,255,255,0.65)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(q.sx, q.sy - lift - 11); c.lineTo(q.sx, q.sy - lift - 18); c.stroke();
  c.restore();
}

export function drawPeers(c: CanvasRenderingContext2D, w: World, peers: Map<number, Peer>, now: number): void {
  for (const peer of peers.values()) {
    if (peer.ghost) drawGhost(c, w, peer.ghost, peer.color);
    if (peer.cx < -10) continue;
    const stale = now - peer.seen > 6000;
    const x = Math.max(0, Math.min(w.size, peer.cx));
    const y = Math.max(0, Math.min(w.size, peer.cy));
    const z = vh(w, Math.round(x), Math.round(y));
    const q = proj(x, y, z);
    c.save();
    c.globalAlpha = stale ? 0.35 : 1;
    // whiteboard-style pointer
    c.fillStyle = peer.color;
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(q.sx, q.sy);
    c.lineTo(q.sx + 10, q.sy + 13);
    c.lineTo(q.sx + 4, q.sy + 12);
    c.lineTo(q.sx + 1, q.sy + 17);
    c.closePath();
    c.fill();
    c.stroke();
    label(c, q.sx + 14, q.sy + 24, peer.name, peer.color, '#fff');
    c.restore();
  }
}
