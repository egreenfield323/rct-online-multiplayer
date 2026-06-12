import { World, corners, vh, rideDef } from '@park/shared';
import { Camera, proj } from './iso.js';
import { drawPiece } from './renderer.js';
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
