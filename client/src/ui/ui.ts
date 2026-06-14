import { World, fmtMoney, dateOf, createWorld } from '@park/shared';
import { Session } from '../session.js';
import { Tools } from '../tools.js';
import { PeerNet } from '../peernet.js';
import { loadAutosave, importPark } from '../save.js';
import {
  WinCtx, initWindows, updateWindows, el, btn,
  openBuildRides, openBuildStalls, openBuildCoasters, openBuildScenery,
  openTrackBuilder, openRideWin, openRideList, openFinances, openResearch,
  openParkWin, openMultiplayer, openPeepWin, openStaff, closeWin,
} from './windows.js';

export class UI {
  ctx: WinCtx;
  private status: HTMLElement;
  private ticker: HTMLElement;
  private toasts: HTMLElement;
  private menu: HTMLElement;
  private lastMsgKey = '';

  constructor(
    private uiRoot: HTMLElement,
    private session: Session,
    private tools: Tools,
    private onStart: () => void, // called when a park begins (any mode)
  ) {
    this.ctx = { session, tools, toast: (t) => this.toast(t) };
    initWindows(uiRoot.querySelector('#windows')!);
    this.status = uiRoot.querySelector('#status')!;
    this.ticker = uiRoot.querySelector('#ticker')!;
    this.toasts = uiRoot.querySelector('#toasts')!;
    this.menu = document.querySelector('#menu')!;
    this.buildToolbar(uiRoot.querySelector('#toolbar')!);
    tools.onOpenRide = (id) => openRideWin(this.ctx, id);
    tools.onOpenPeep = (id) => openPeepWin(this.ctx, id);
    tools.toast = (t) => this.toast(t);
    tools.onTrackStarted = () => openTrackBuilder(this.ctx);
    session.onInvite = (from, code) => this.invitePopup(from, code);
    session.onHostLeft = () => this.toast('The host left — the park is now yours to keep playing locally.');
    session.onJoinFailed = (reason) => {
      this.toast(reason);
      this.showMenu();
    };
  }

  // ------------------------------------------------------------ toolbar

  private buildToolbar(bar: HTMLElement): void {
    const tool = (icon: string, title: string, fn: () => void) => {
      const b = btn(icon, fn, 'tb');
      b.title = title;
      bar.appendChild(b);
      return b;
    };
    tool('🖱', 'Select / inspect (Esc)', () => this.tools.set({ t: 'pointer' }));
    tool('⛰+', 'Raise land', () => this.tools.set({ t: 'land', d: 1, brush: 2 }));
    tool('⛰−', 'Lower land', () => this.tools.set({ t: 'land', d: -1, brush: 2 }));
    tool('💧+', 'Raise water', () => this.tools.set({ t: 'water', d: 1, brush: 2 }));
    tool('💧−', 'Lower water', () => this.tools.set({ t: 'water', d: -1, brush: 2 }));
    tool('🛤', 'Footpath', () => this.tools.set({ t: 'path', kind: 1 }));
    tool('🚧', 'Queue path', () => this.tools.set({ t: 'path', kind: 2 }));
    tool('⌫', 'Remove path', () => this.tools.set({ t: 'unpath' }));
    bar.appendChild(el('span', 'tb-sep'));
    tool('🌳', 'Scenery', () => openBuildScenery(this.ctx));
    tool('🎠', 'Rides', () => openBuildRides(this.ctx));
    tool('🍔', 'Stalls', () => openBuildStalls(this.ctx));
    tool('🎢', 'Coasters', () => openBuildCoasters(this.ctx));
    tool('🧹', 'Sweep litter', () => this.tools.set({ t: 'sweep' }));
    tool('💥', 'Demolish ride', () => this.tools.set({ t: 'demolish' }));
    bar.appendChild(el('span', 'tb-sep'));
    tool('📋', 'Ride list', () => openRideList(this.ctx));
    tool('🧑‍🔧', 'Staff', () => openStaff(this.ctx));
    tool('💰', 'Finances', () => openFinances(this.ctx));
    tool('🔬', 'Research', () => openResearch(this.ctx));
    tool('🏞', 'Park & save', () => openParkWin(this.ctx));
    tool('👥', 'Online players', () => openMultiplayer(this.ctx));
  }

  // ------------------------------------------------------------ status + ticker

  update(): void {
    const w = this.session.world;
    if (!w) return;
    const d = dateOf(w.tick);
    const mode = this.session.mode === 'offline' ? '' :
      this.session.mode === 'host' ? ` · hosting ${this.session.roomCode}` : ' · guest';
    this.status.innerHTML =
      `<b>${fmtMoney(w.cash)}</b> · 👥 ${w.peeps.length} · ⭐ ${w.park.rating} · ${d.label}${mode}`;
    const last = w.messages[w.messages.length - 1];
    if (last) {
      const key = `${last.tick}:${last.text}`;
      if (key !== this.lastMsgKey) {
        this.lastMsgKey = key;
        this.ticker.textContent = last.text;
        this.ticker.className = `msg-${last.kind}`;
        this.ticker.style.opacity = '1';
      } else if (w.tick - last.tick > 200) {
        this.ticker.style.opacity = '0.45';
      }
    }
    updateWindows();
  }

  toast(text: string): void {
    const t = el('div', 'toast', text);
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }

  private invitePopup(from: string, code: string): void {
    const t = el('div', 'toast invite');
    t.appendChild(el('div', '', `${from} invites you to their park!`));
    const row = el('div', 'row');
    row.appendChild(btn('Join', () => {
      this.session.joinPark(code);
      this.hideMenu();
      this.onStart();
      t.remove();
    }));
    row.appendChild(btn('Ignore', () => t.remove()));
    t.appendChild(row);
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), 20000);
  }

  // ------------------------------------------------------------ title menu

  hideMenu(): void {
    this.menu.style.display = 'none';
  }

  showMenu(): void {
    this.menu.style.display = 'flex';
    this.menu.innerHTML = '';
    const card = el('div', 'menu-card');
    card.appendChild(el('h1', '', '🎢 OpenPark'));
    card.appendChild(el('p', 'hint', 'A co-op theme park you build together — live cursors and all.'));

    const nameRow = el('div', 'row');
    nameRow.appendChild(el('label', '', 'Your name:'));
    const nameIn = el('input') as HTMLInputElement;
    nameIn.value = localStorage.getItem('openpark-name') ?? '';
    nameIn.placeholder = 'e.g. Evan';
    nameRow.appendChild(nameIn);
    card.appendChild(nameRow);

    const onlineRow = el('div', 'row');
    const onlineCb = el('input') as HTMLInputElement;
    onlineCb.type = 'checkbox';
    onlineCb.id = 'onlineCb';
    onlineCb.checked = localStorage.getItem('openpark-online') === '1';
    onlineCb.style.flex = '0';
    onlineCb.onchange = () => localStorage.setItem('openpark-online', onlineCb.checked ? '1' : '0');
    const onlineLabel = el('label', '', '🌐 Play online — let friends join') as HTMLLabelElement;
    onlineLabel.htmlFor = 'onlineCb';
    onlineLabel.style.minWidth = '0';
    onlineLabel.style.cursor = 'pointer';
    onlineRow.appendChild(onlineCb);
    onlineRow.appendChild(onlineLabel);
    card.appendChild(onlineRow);
    card.appendChild(el('p', 'hint',
      'Online play is free peer-to-peer (WebRTC) — no server, no cloud saves. ' +
      'Tick the box, start a park, then open 👥 to get a 6-letter code your friends type in below. ' +
      'The park lives on the host’s machine; everyone else mirrors it live.'));

    const status = el('p', 'hint', '');
    card.appendChild(status);

    const getName = () => {
      const n = nameIn.value.trim() || 'Player';
      localStorage.setItem('openpark-name', n);
      return n;
    };

    const begin = (w: World, online: boolean) => {
      if (online) {
        const net = new PeerNet(getName());
        this.session.attachNet(net);
        this.session.hostPark(w); // PeerNet opens a room + invite code asynchronously
      } else {
        this.session.mode = 'offline';
        this.session.world = w;
      }
      this.hideMenu();
      this.onStart();
    };

    const rowB = el('div', 'row menu-actions');
    rowB.appendChild(btn('🌱 New park', () => {
      begin(createWorld((Math.random() * 0xffffffff) >>> 0), onlineCb.checked);
    }, 'b big'));

    const auto = loadAutosave();
    if (auto) {
      rowB.appendChild(btn(`⏪ Continue “${auto.park.name}”`, () => {
        begin(auto, onlineCb.checked);
      }, 'b big'));
    }
    rowB.appendChild(btn('📂 Load .park file', async () => {
      try {
        const w = await importPark();
        begin(w, onlineCb.checked);
      } catch (e) {
        status.textContent = String((e as Error).message ?? e);
      }
    }, 'b big'));
    card.appendChild(rowB);

    const joinRow = el('div', 'row');
    const codeIn = el('input') as HTMLInputElement;
    codeIn.placeholder = 'INVITE CODE';
    codeIn.maxLength = 6;
    codeIn.style.textTransform = 'uppercase';
    joinRow.appendChild(codeIn);
    joinRow.appendChild(btn('🤝 Join a friend', () => {
      if (codeIn.value.trim().length < 6) {
        status.textContent = 'Enter the 6-letter invite code.';
        return;
      }
      status.textContent = 'Connecting to the host…';
      const net = new PeerNet(getName());
      this.session.attachNet(net);
      this.session.joinPark(codeIn.value.trim().toUpperCase());
      this.hideMenu();
      this.onStart();
    }, 'b big'));
    card.appendChild(joinRow);

    const footer = el('div', 'row menu-footer');
    footer.appendChild(btn('🏆 Credits', () => this.showCredits(), 'b link'));
    card.appendChild(footer);

    this.menu.appendChild(card);
  }

  // ------------------------------------------------------------ credits scene

  showCredits(): void {
    const back = el('div', 'credits-scene');
    const card = el('div', 'credits-card');

    card.appendChild(el('h1', '', '🏆 Credits & Acknowledgements'));
    card.appendChild(el('p', 'credits-lead',
      'OpenPark is a co-op theme-park tycoon built from scratch as a love letter to the ' +
      'isometric park-builders we grew up with. Everything you see is original work — no ' +
      'art, code, or data is taken from any commercial game. Here is where it all comes from.'));

    const section = (title: string, rows: [string, string][]) => {
      card.appendChild(el('h2', '', title));
      const list = el('div', 'credits-list');
      for (const [k, v] of rows) {
        const r = el('div', 'credits-row');
        r.appendChild(el('div', 'credits-k', k));
        const val = el('div', 'credits-v');
        val.innerHTML = v;
        r.appendChild(val);
        list.appendChild(r);
      }
      card.appendChild(list);
    };

    section('Design inspiration', [
      ['RollerCoaster Tycoon Deluxe', 'Chris Sawyer — the 2:1 isometric grid, beveled-tan window chrome, ' +
        'top icon toolbar, bottom cash/guests/rating/date status bar, research unlocks, and the whole ' +
        'flat-ride + buildable-coaster tycoon loop are modelled on the original. <i>No RCT assets are used.</i>'],
      ['Stardew Valley', 'ConcernedApe (Eric Barone) — the warm, sunlit palette, soft drop-shadows, ' +
        'dappled-light grass and cozy hand-detailed objects take their cue from Stardew’s pixel art.'],
    ]);

    section('Art &amp; graphics', [
      ['All sprites &amp; terrain', 'Procedurally drawn in code at boot — every tree, stall, flat ride, ' +
        'coaster car, peep and the entrance gate is generated by ' +
        '<code>client/src/render/sprites.ts</code> and <code>renderer.ts</code> using a local isometric ' +
        'projector with directional lighting.'],
      ['Pre-rendered look', 'Faces are gradient-shaded then <b>ordered-dithered</b> (Bayer 4×4 colour ' +
        'quantisation) and rimmed with a dark silhouette + contact ambient-occlusion shadow, to read as ' +
        'pre-rendered 3D rather than flat vector art.'],
      ['Palette', 'Hand-tuned, RCT-inspired: bright checkered grass, tan/blue paths, pastel ride colours. ' +
        'Original — CC0, no external asset packs.'],
    ]);

    section('Technology', [
      ['Engine', 'TypeScript + Vite, rendered on a single HTML5 <code>&lt;canvas&gt;</code> (Canvas2D), ' +
        'deterministic fixed-step simulation shared between all players.'],
      ['Multiplayer', '<b>PeerJS</b> over WebRTC — peer-to-peer data channels using the free public PeerJS ' +
        'broker for signalling only. No game server, no cloud saves: the park lives with the host.'],
      ['Desktop build', '<b>Electron</b> + electron-builder package the same game into a portable Windows ' +
        '<code>.exe</code> (<code>npm run exportGame</code>) for native performance.'],
      ['Fonts &amp; icons', 'System UI fonts; emoji supplied by your operating system.'],
    ]);

    section('Made by', [
      ['Evan Greenfield', 'Design, code &amp; pixel-pushing.'],
      ['Claude (Anthropic)', 'AI pair-programmer.'],
    ]);

    const close = btn('← Back to menu', () => back.remove(), 'b big');
    card.appendChild(el('div', 'row credits-actions')).appendChild(close);

    back.appendChild(card);
    back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
  }
}
