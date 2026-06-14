import { World, vh } from '@park/shared';
import { Camera, screenToCanvas, pickTile, pickVertex, proj, unproj } from './render/iso.js';
import { Session } from './session.js';
import { Tools } from './tools.js';

const ZOOMS = [0.5, 1, 2];

const EDGE_MARGIN = 48; // px from the viewport edge that triggers a camera scroll

export class Input {
  private panning = false;
  private painting = false;
  private lastPaint = '';
  private lastMx = 0;
  private lastMy = 0;
  private mx = -1; // last cursor position in client px (for edge-scroll)
  private my = -1;
  private overUI = false; // cursor is over a draggable window / the menu
  private dragPeep: number | null = null; // guest grabbed on mousedown (pointer)
  private dragMoved = false;
  private downX = 0;
  private downY = 0;
  edgeScroll = true; // user-toggleable (Park window); see UI
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
    // stop edge-scrolling when the cursor leaves the window or focus is lost
    document.addEventListener('mouseleave', () => { this.mx = -1; this.my = -1; });
    window.addEventListener('blur', () => { this.mx = -1; this.my = -1; this.keys.clear(); });
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
    // precise float coords (peep picking + the live cursor channel)
    const z = vh(w, Math.round(x), Math.round(y));
    const f = unproj(sx, sy, z);
    this.tools.hover = { x, y, vx, vy, wx: f.wx, wy: f.wy };
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
      // pointer tool: a guest under the cursor is grabbed (click = inspect,
      // drag = pick up & set down elsewhere) instead of running a build click.
      if (this.tools.tool.t === 'pointer') {
        const h = this.tools.hover;
        const pid = h ? this.tools.peepAt(this.world, h.wx, h.wy) : null;
        if (pid !== null) {
          this.dragPeep = pid;
          this.dragMoved = false;
          this.downX = e.clientX;
          this.downY = e.clientY;
          return;
        }
      }
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
    this.mx = e.clientX;
    this.my = e.clientY;
    // suppress edge-scroll while the cursor is over interactive chrome: the
    // toolbar / status bar / ticker / toasts (which live inside the edge margin)
    // or a draggable window / the menu.
    const t = e.target as HTMLElement | null;
    this.overUI = !!t?.closest?.('.win, #menu, #toolbar, #status, #ticker, #toasts');
    if (e.target === this.canvas || this.panning || this.painting || this.dragPeep !== null) {
      const rect = this.canvas.getBoundingClientRect();
      this.updateHover(e.clientX - rect.left, e.clientY - rect.top);
    }
    if (this.dragPeep !== null) {
      if (Math.abs(e.clientX - this.downX) + Math.abs(e.clientY - this.downY) > 4) this.dragMoved = true;
      this.tools.carriedPeep = this.dragMoved ? this.dragPeep : null;
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
    if (e.button === 0) {
      this.painting = false;
      if (this.dragPeep !== null && this.world) {
        const pid = this.dragPeep;
        const h = this.tools.hover;
        if (this.dragMoved && h) this.tools.dropPeep(this.world, pid, h.x, h.y); // set down
        else this.tools.onOpenPeep?.(pid); // a tap → inspect
        this.dragPeep = null;
        this.dragMoved = false;
        this.tools.carriedPeep = null;
      }
    }
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

  // arrow-key + edge-of-screen panning, called each frame
  update(dt: number): void {
    const v = (0.7 * dt) / this.cam.zoom;
    if (this.keys.has('ArrowLeft')) this.cam.x -= v;
    if (this.keys.has('ArrowRight')) this.cam.x += v;
    if (this.keys.has('ArrowUp')) this.cam.y -= v;
    if (this.keys.has('ArrowDown')) this.cam.y += v;

    // edge scroll: push the camera when the cursor nears a viewport edge,
    // ramping up over the margin so it feels like RCT's edge-pan. Disabled at
    // the menu (no world), while dragging a window, or when toggled off.
    if (this.edgeScroll && this.world && !this.overUI && !this.panning && this.mx >= 0) {
      const W = window.innerWidth, H = window.innerHeight;
      const ramp = (d: number) => Math.max(0, (EDGE_MARGIN - d) / EDGE_MARGIN); // 0..1
      this.cam.x -= v * ramp(this.mx);          // left edge
      this.cam.x += v * ramp(W - 1 - this.mx);  // right edge
      this.cam.y -= v * ramp(this.my);          // top edge
      this.cam.y += v * ramp(H - 1 - this.my);  // bottom edge
    }
  }

  centerOn(wx: number, wy: number, z: number): void {
    const q = proj(wx, wy, z);
    this.cam.x = q.sx;
    this.cam.y = q.sy;
  }
}
