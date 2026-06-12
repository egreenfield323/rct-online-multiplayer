import { MONTH_TICKS } from '@park/shared';
import { Camera } from './render/iso.js';
import { generateSprites, PLAYER_COLORS } from './render/sprites.js';
import { render } from './render/renderer.js';
import { drawGhost, drawPeers } from './render/overlay.js';
import { Session } from './session.js';
import { Tools } from './tools.js';
import { Input } from './input.js';
import { UI } from './ui/ui.js';
import { autosave } from './save.js';
import './ui/style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const sprites = generateSprites();
const session = new Session();
const tools = new Tools(session);
const cam: Camera = { x: 0, y: 0, zoom: 1 };
const input = new Input(canvas, cam, session, tools);

const ui = new UI(document.querySelector('#ui')!, session, tools, () => {
  // center on the park entrance when a park starts
  started = true;
  centered = false;
});

let started = false;
let centered = false;
let frame = 0;
let lastNow = 0;
let lastAutosaveMonth = -1;

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min(100, now - lastNow);
  lastNow = now;
  frame++;

  session.update(now);
  input.update(dt);

  const w = session.world;
  if (!w) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1d2a38';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (started) {
      ctx.fillStyle = '#fff';
      ctx.font = '20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Joining park — waiting for the host’s snapshot…', canvas.width / 2, canvas.height / 2);
    }
    return;
  }

  if (!centered) {
    centered = true;
    input.centerOn(w.park.entrance.x, w.park.entrance.y - 8, 6);
  }

  render(ctx, canvas, w, cam, sprites, frame);

  // local tool ghost + other players' cursors/ghosts
  const g = tools.ghost(w);
  session.setGhost(g);
  if (g) drawGhost(ctx, w, g, '#ffe082');
  drawPeers(ctx, w, session.peers, now);

  // UI refresh ~5 Hz
  if (frame % 12 === 0) ui.update();

  // monthly autosave (anyone who owns the sim: host or offline)
  if (session.mode !== 'guest') {
    const month = Math.floor(w.tick / MONTH_TICKS);
    if (month !== lastAutosaveMonth && w.tick % MONTH_TICKS > 4) {
      lastAutosaveMonth = month;
      autosave(w);
    }
  }
}

ui.showMenu();
requestAnimationFrame(loop);

// headless / screenshot debugging hook (Playwright-friendly)
declare global {
  interface Window {
    __game: { session: Session; tools: Tools; cam: Camera; colors: string[] };
  }
}
window.__game = { session, tools, cam, colors: PLAYER_COLORS };
