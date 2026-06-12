import { World, fmtMoney, dateOf, createWorld } from '@park/shared';
import { Session } from '../session.js';
import { Tools } from '../tools.js';
import { Net, resolveRelayUrl, saveRelayUrl } from '../net.js';
import { loadAutosave, importPark } from '../save.js';
import {
  WinCtx, initWindows, updateWindows, el, btn,
  openBuildRides, openBuildStalls, openBuildCoasters, openBuildScenery,
  openTrackBuilder, openRideWin, openRideList, openFinances, openResearch,
  openParkWin, openMultiplayer, closeWin,
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

    const relayRow = el('div', 'row');
    relayRow.appendChild(el('label', '', 'Relay server:'));
    const relayIn = el('input') as HTMLInputElement;
    relayIn.placeholder = 'wss://your-relay.example.com (blank = offline)';
    relayIn.value = localStorage.getItem('openpark-relay') ?? (resolveRelayUrl() ?? '');
    relayRow.appendChild(relayIn);
    card.appendChild(relayRow);
    card.appendChild(el('p', 'hint',
      'On GitHub Pages there is no built-in server: run `npm start` somewhere reachable ' +
      '(or a tunnel) and paste its wss:// address — or leave blank to play solo offline. ' +
      'Saves stay on your machine either way.'));

    const status = el('p', 'hint', '');
    card.appendChild(status);

    const getName = () => {
      const n = nameIn.value.trim() || 'Player';
      localStorage.setItem('openpark-name', n);
      return n;
    };

    const connect = async (): Promise<boolean> => {
      const url = relayIn.value.trim();
      saveRelayUrl(url === (resolveRelayUrl() ?? '') ? '' : url);
      const target = url || resolveRelayUrl();
      if (!target) return false;
      if (this.session.net?.connected) return true;
      status.textContent = 'Connecting to relay…';
      const net = new Net();
      try {
        this.session.attachNet(net);
        await net.connect(target, getName());
        this.session.net = net;
        status.textContent = 'Connected!';
        return true;
      } catch {
        status.textContent = 'Relay unreachable — playing offline.';
        this.session.net = null;
        return false;
      }
    };

    const begin = (w: World, online: boolean) => {
      if (online && this.session.net?.connected) this.session.hostPark(w);
      else {
        this.session.mode = 'offline';
        this.session.world = w;
      }
      this.hideMenu();
      this.onStart();
    };

    const rowB = el('div', 'row menu-actions');
    rowB.appendChild(btn('🌱 New park', async () => {
      const online = await connect();
      begin(createWorld((Math.random() * 0xffffffff) >>> 0), online);
    }, 'b big'));

    const auto = loadAutosave();
    if (auto) {
      rowB.appendChild(btn(`⏪ Continue “${auto.park.name}”`, async () => {
        const online = await connect();
        begin(auto, online);
      }, 'b big'));
    }
    rowB.appendChild(btn('📂 Load .park file', async () => {
      try {
        const w = await importPark();
        const online = await connect();
        begin(w, online);
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
    joinRow.appendChild(btn('🤝 Join a friend', async () => {
      const ok = await connect();
      if (!ok) {
        status.textContent = 'Need a relay connection to join someone.';
        return;
      }
      if (codeIn.value.trim().length < 6) {
        status.textContent = 'Enter the 6-letter invite code.';
        return;
      }
      this.session.joinPark(codeIn.value.trim().toUpperCase());
      this.hideMenu();
      this.onStart();
    }, 'b big'));
    card.appendChild(joinRow);

    this.menu.appendChild(card);
  }
}
