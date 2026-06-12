import { World, vh } from '@park/shared';
import { Camera, screenToCanvas, pickTile, pickVertex, proj, unproj } from './render/iso.js';
import { Session } from './session.js';
import { Tools } from './tools.js';

const ZOOMS = [0.5, 1, 2];

export class Input {
  private panning = false;
  private painting = false;
  private lastPaint = '';
  private lastMx = 0;
  private lastMy = 0;
  keys = new Set<string>();

  constructor(
    private canvas: HTMLCanvasElement,
    private cam: Camera,
    private session: Session,
    private tools: Tools,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.down(e));
    window.addEventListener('mousemove', (e) => this.move(e));
    window.addEventListener('mouseup', (e) => this.up(e));
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }

  private get world(): World | null {
    return this.session.world;
  }

  private updateHover(mx: number, my: number): void {
    const w = this.world;
    if (!w) return;
    const { sx, sy } = screenToCanvas(this.cam, this.canvas, mx, my);
    const { x, y } = pickTile(w, sx, sy);
    const { vx, vy } = pickVertex(w, sx, sy);
    this.tools.hover = { x, y, vx, vy };
    // precise float coords for the live cursor channel
    const z = vh(w, Math.round(x), Math.round(y));
    const f = unproj(sx, sy, z);
    this.session.setCursor(Math.round(f.wx * 10) / 10, Math.round(f.wy * 10) / 10);
  }

  private down(e: MouseEvent): void {
    if (e.button === 1 || e.button === 2) {
      this.panning = true;
      e.preventDefault();
      return;
    }
    if (e.button === 0 && this.world) {
      this.updateHover(e.offsetX, e.offsetY);
      this.tools.click(this.world);
      if (this.tools.paints()) {
        this.painting = true;
        this.lastPaint = `${this.tools.hover?.x},${this.tools.hover?.y},${this.tools.hover?.vx},${this.tools.hover?.vy}`;
      }
    }
  }

  private move(e: MouseEvent): void {
    if (this.panning) {
      this.cam.x -= (e.clientX - this.lastMx) / this.cam.zoom;
      this.cam.y -= (e.clientY - this.lastMy) / this.cam.zoom;
    }
    this.lastMx = e.clientX;
    this.lastMy = e.clientY;
    if (e.target === this.canvas || this.panning || this.painting) {
      const rect = this.canvas.getBoundingClientRect();
      this.updateHover(e.clientX - rect.left, e.clientY - rect.top);
    }
    if (this.painting && this.world) {
      const h = this.tools.hover;
      const key = `${h?.x},${h?.y},${h?.vx},${h?.vy}`;
      if (key !== this.lastPaint) {
        this.lastPaint = key;
        this.tools.click(this.world);
      }
    }
  }

  private up(e: MouseEvent): void {
    if (e.button === 1 || e.button === 2) this.panning = false;
    if (e.button === 0) this.painting = false;
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const i = ZOOMS.indexOf(this.cam.zoom);
    const ni = Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1)));
    this.cam.zoom = ZOOMS[ni];
  }

  private key(e: KeyboardEvent, downEv: boolean): void {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (downEv) {
      this.keys.add(e.key);
      if (e.key === 'r' || e.key === 'R') this.tools.rotate();
      if (e.key === 'Escape') this.tools.set({ t: 'pointer' });
    } else {
      this.keys.delete(e.key);
    }
  }

  // arrow-key panning, called each frame
  update(dt: number): void {
    const v = (0.7 * dt) / this.cam.zoom;
    if (this.keys.has('ArrowLeft')) this.cam.x -= v;
    if (this.keys.has('ArrowRight')) this.cam.x += v;
    if (this.keys.has('ArrowUp')) this.cam.y -= v;
    if (this.keys.has('ArrowDown')) this.cam.y += v;
  }

  centerOn(wx: number, wy: number, z: number): void {
    const q = proj(wx, wy, z);
    this.cam.x = q.sx;
    this.cam.y = q.sy;
  }
}
