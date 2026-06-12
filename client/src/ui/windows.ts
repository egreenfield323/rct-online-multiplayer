import {
  World, Ride, TrackKind, fmtMoney, dateOf, rideDef, RIDE_DEFS, SCENERY_DEFS,
  TEMPLATES, templateCost, MAX_LOAN, LOAN_STEP, RESEARCH_GOAL, RESEARCH_COST_MONTH,
  MARKETING_COST, isClosed,
} from '@park/shared';
import { Session } from '../session.js';
import { Tools } from '../tools.js';
import { exportPark, importPark } from '../save.js';

// ---------------------------------------------------------------- manager

interface Win {
  el: HTMLElement;
  update?: () => void;
}

const wins = new Map<string, Win>();
let zTop = 10;
let root: HTMLElement;

export function initWindows(container: HTMLElement): void {
  root = container;
}

export function closeWin(id: string): void {
  wins.get(id)?.el.remove();
  wins.delete(id);
}

export function openWin(id: string, title: string, build: (body: HTMLElement) => (() => void) | void, x = 90, y = 70): void {
  if (wins.has(id)) {
    const w = wins.get(id)!;
    w.el.style.zIndex = String(++zTop);
    return;
  }
  const el = document.createElement('div');
  el.className = 'win';
  el.style.left = `${x + wins.size * 24}px`;
  el.style.top = `${y + wins.size * 24}px`;
  el.style.zIndex = String(++zTop);
  const tb = document.createElement('div');
  tb.className = 'win-title';
  tb.innerHTML = `<span>${title}</span>`;
  const close = document.createElement('button');
  close.className = 'win-close';
  close.textContent = '×';
  close.onclick = () => closeWin(id);
  tb.appendChild(close);
  el.appendChild(tb);
  const body = document.createElement('div');
  body.className = 'win-body';
  el.appendChild(body);
  // dragging
  let drag: { dx: number; dy: number } | null = null;
  tb.addEventListener('mousedown', (e) => {
    if (e.target === close) return;
    drag = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
    el.style.zIndex = String(++zTop);
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (drag) {
      el.style.left = `${e.clientX - drag.dx}px`;
      el.style.top = `${e.clientY - drag.dy}px`;
    }
  });
  window.addEventListener('mouseup', () => (drag = null));
  el.addEventListener('mousedown', () => (el.style.zIndex = String(++zTop)));
  const update = build(body) ?? undefined;
  root.appendChild(el);
  wins.set(id, { el, update });
}

export function updateWindows(): void {
  for (const w of wins.values()) w.update?.();
}

// ---------------------------------------------------------------- dom helpers

export function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function btn(label: string, fn: () => void, cls = 'b'): HTMLElement {
  const b = el('button', cls, label) as HTMLButtonElement;
  b.onclick = fn;
  return b;
}

// ---------------------------------------------------------------- game windows

export interface WinCtx {
  session: Session;
  tools: Tools;
  toast: (text: string) => void;
}

const w0 = (ctx: WinCtx): World | null => ctx.session.world;

export function openBuildRides(ctx: WinCtx): void {
  openWin('buildRides', 'Build Rides', (body) => {
    const grid = el('div', 'grid');
    body.appendChild(grid);
    return () => {
      const w = w0(ctx);
      if (!w) return;
      grid.innerHTML = '';
      for (const def of RIDE_DEFS) {
        if (def.category !== 'gentle' && def.category !== 'thrill') continue;
        if (!w.research.invented.includes(def.id)) continue;
        grid.appendChild(btn(`${def.name}\n${fmtMoney(def.cost)}`, () => ctx.tools.set({ t: 'ride', type: def.id }), 'b card'));
      }
      if (!grid.hasChildNodes()) grid.appendChild(el('div', 'hint', 'Nothing invented yet — fund research!'));
    };
  });
}

export function openBuildStalls(ctx: WinCtx): void {
  openWin('buildStalls', 'Build Stalls', (body) => {
    const grid = el('div', 'grid');
    body.appendChild(grid);
    return () => {
      const w = w0(ctx);
      if (!w) return;
      grid.innerHTML = '';
      for (const def of RIDE_DEFS) {
        if (def.category !== 'stall' || !w.research.invented.includes(def.id)) continue;
        grid.appendChild(btn(`${def.name}\n${fmtMoney(def.cost)}`, () => ctx.tools.set({ t: 'ride', type: def.id }), 'b card'));
      }
    };
  });
}

export function openBuildCoasters(ctx: WinCtx): void {
  openWin('buildCoasters', 'Roller Coasters', (body) => {
    const custom = el('div', 'grid');
    const tplGrid = el('div', 'grid');
    body.appendChild(el('div', 'sect', 'Custom build (pick a type, place a station):'));
    body.appendChild(custom);
    body.appendChild(el('div', 'sect', 'Prebuilt designs (stamp down):'));
    body.appendChild(tplGrid);
    return () => {
      const w = w0(ctx);
      if (!w) return;
      custom.innerHTML = '';
      tplGrid.innerHTML = '';
      for (const def of RIDE_DEFS) {
        if (def.category !== 'coaster' || !w.research.invented.includes(def.id)) continue;
        custom.appendChild(btn(def.name, () => {
          ctx.tools.set({ t: 'trackStart', type: def.id });
        }, 'b card'));
      }
      for (const tpl of TEMPLATES) {
        if (!w.research.invented.includes(tpl.type)) continue;
        tplGrid.appendChild(btn(`${tpl.name}\n${fmtMoney(templateCost(tpl))}`, () => ctx.tools.set({ t: 'template', tpl: tpl.id }), 'b card'));
      }
      if (!custom.hasChildNodes()) custom.appendChild(el('div', 'hint', 'No coaster types invented yet.'));
    };
  });
}

export function openBuildScenery(ctx: WinCtx): void {
  openWin('buildScenery', 'Scenery & Theming', (body) => {
    const grid = el('div', 'grid');
    body.appendChild(grid);
    for (const def of SCENERY_DEFS) {
      grid.appendChild(btn(`${def.name}\n${fmtMoney(def.cost)}`, () => ctx.tools.set({ t: 'scenery', type: def.id }), 'b card'));
    }
    grid.appendChild(btn('Remove\nscenery', () => ctx.tools.set({ t: 'unscenery' }), 'b card'));
  });
}

const PIECE_LABELS: [TrackKind, string][] = [
  ['station', 'Station'], ['flat', 'Straight'], ['up', 'Slope Up'], ['down', 'Slope Down'],
  ['steepUp', 'Steep Up'], ['steepDown', 'Steep Down'], ['lift', 'Chain Lift'],
  ['turnL', 'Turn Left'], ['turnR', 'Turn Right'], ['turnLL', 'Wide Left'], ['turnRL', 'Wide Right'],
  ['brakes', 'Brakes'],
];

export function openTrackBuilder(ctx: WinCtx): void {
  openWin('trackBuilder', 'Coaster Construction', (body) => {
    const status = el('div', 'sect', '');
    const grid = el('div', 'grid track-grid');
    body.appendChild(status);
    body.appendChild(grid);
    for (const [kind, label] of PIECE_LABELS) {
      grid.appendChild(btn(label, () => {
        const w = w0(ctx);
        if (!w) return;
        ctx.tools.nextPiece = kind;
        ctx.tools.set({ t: 'track' });
        ctx.tools.trackAdd(w, kind);
      }, 'b card'));
    }
    const row = el('div', 'row');
    row.appendChild(btn('⟲ Undo piece', () => { const w = w0(ctx); if (w) ctx.tools.trackBack(w); }));
    row.appendChild(btn('✓ Finish circuit', () => { const w = w0(ctx); if (w) ctx.tools.trackDone(w); }));
    row.appendChild(btn('✗ Scrap coaster', () => {
      const w = w0(ctx);
      if (w) ctx.tools.trackCancel(w);
      closeWin('trackBuilder');
    }));
    body.appendChild(row);
    return () => {
      const w = w0(ctx);
      if (!w) return;
      const ride = ctx.tools.activeCoaster(w);
      if (!ride) {
        status.textContent = 'No coaster under construction. (Pick a type and place a station.)';
        return;
      }
      const closed = isClosed(ride);
      status.textContent = `${ride.name} — ${ride.track!.length} pieces${closed ? ' — CIRCUIT CLOSED, hit Finish!' : ''}`;
      if (ride.trackDone) {
        closeWin('trackBuilder');
        ctx.tools.set({ t: 'pointer' });
        openRideWin(ctx, ride.id);
      }
    };
  }, window.innerWidth - 420, 90);
}

export function openRideWin(ctx: WinCtx, rideId: number): void {
  const id = `ride${rideId}`;
  openWin(id, 'Ride', (body) => {
    const title = el('div', 'sect', '');
    const stats = el('div', 'kv', '');
    const fail = el('div', 'warn', '');
    const row1 = el('div', 'row');
    const row2 = el('div', 'row');
    const openBtn = btn('Open', () => {
      const w = w0(ctx);
      const r = w?.rides.find((x) => x.id === rideId);
      if (r) ctx.session.issue({ t: 'rideSet', rideId, open: !r.open });
    }) as HTMLButtonElement;
    row1.appendChild(openBtn);
    row1.appendChild(btn('Price −10¢', () => {
      const r = w0(ctx)?.rides.find((x) => x.id === rideId);
      if (r) ctx.session.issue({ t: 'rideSet', rideId, price: r.price - 10 });
    }));
    row1.appendChild(btn('Price +10¢', () => {
      const r = w0(ctx)?.rides.find((x) => x.id === rideId);
      if (r) ctx.session.issue({ t: 'rideSet', rideId, price: r.price + 10 });
    }));
    row2.appendChild(btn('Rename', () => {
      const r = w0(ctx)?.rides.find((x) => x.id === rideId);
      const name = prompt('Ride name:', r?.name ?? '');
      if (name) ctx.session.issue({ t: 'rideSet', rideId, name });
    }));
    row2.appendChild(btn('🗑 Demolish', () => {
      ctx.session.issue({ t: 'demolish', rideId });
      closeWin(id);
    }));
    body.append(title, stats, fail, row1, row2);
    return () => {
      const w = w0(ctx);
      const r = w?.rides.find((x) => x.id === rideId);
      if (!w || !r) {
        closeWin(id);
        return;
      }
      const def = rideDef(r.type);
      title.textContent = `${r.name} — ${r.open ? 'OPEN' : 'CLOSED'} (${r.phase})`;
      openBtn.textContent = r.open ? 'Close ride' : 'Open ride';
      const fmt = (v: number) => (v < 0 ? '—' : (v / 100).toFixed(2));
      stats.innerHTML =
        `Price: <b>${fmtMoney(r.price)}</b> · Queue: ${r.queue.length}<br>` +
        `Excitement <b>${fmt(r.excitement)}</b> · Intensity <b>${fmt(r.intensity)}</b> · Nausea <b>${fmt(r.nausea)}</b><br>` +
        `Customers: ${r.totalCustomers} (month: ${r.monthCustomers}) · Income: ${fmtMoney(r.income)}`;
      fail.textContent = r.testFail ? `⚠ ${r.testFail}` : '';
      if (def.category === 'coaster' && !r.trackDone) {
        fail.textContent = 'Under construction…';
      }
    };
  });
}

export function openRideList(ctx: WinCtx): void {
  openWin('rideList', 'Rides & Stalls', (body) => {
    const list = el('div', 'list');
    body.appendChild(list);
    return () => {
      const w = w0(ctx);
      if (!w) return;
      list.innerHTML = '';
      for (const r of w.rides) {
        const row = btn(`${r.open ? '🟢' : '🔴'} ${r.name} — ${fmtMoney(r.income)}`, () => openRideWin(ctx, r.id), 'b wide');
        list.appendChild(row);
      }
      if (!w.rides.length) list.appendChild(el('div', 'hint', 'Nothing built yet.'));
    };
  });
}

export function openFinances(ctx: WinCtx): void {
  openWin('finances', 'Finances', (body) => {
    const top = el('div', 'kv');
    const hist = el('div', 'kv');
    const row = el('div', 'row');
    row.appendChild(btn('Borrow $1,000', () => ctx.session.issue({ t: 'loan', d: 1 })));
    row.appendChild(btn('Repay $1,000', () => ctx.session.issue({ t: 'loan', d: -1 })));
    row.appendChild(btn(`📣 Marketing (${fmtMoney(MARKETING_COST)})`, () => ctx.session.issue({ t: 'marketing' })));
    body.append(top, row, el('div', 'sect', 'Monthly history:'), hist);
    return () => {
      const w = w0(ctx);
      if (!w) return;
      top.innerHTML = `Cash: <b>${fmtMoney(w.cash)}</b> · Loan: <b>${fmtMoney(w.loan)}</b> / ${fmtMoney(MAX_LOAN)}<br>` +
        `This month — income: ${fmtMoney(w.curIncome)}, spent: ${fmtMoney(w.curExpense)}` +
        (w.park.marketingTicks > 0 ? '<br>📣 Marketing campaign running' : '');
      hist.innerHTML = w.months.slice(-6).map((m, i) =>
        `${i + 1 + Math.max(0, w.months.length - 6)}. +${fmtMoney(m.income)} / −${fmtMoney(m.expense)} · ${m.guests} guests`,
      ).join('<br>') || '<i>No full months yet</i>';
    };
  });
}

export function openResearch(ctx: WinCtx): void {
  openWin('research', 'Research & Development', (body) => {
    const cur = el('div', 'kv');
    const row = el('div', 'row');
    const levels = ['None', 'Minimum', 'Normal', 'Maximum'];
    const radios: HTMLButtonElement[] = [];
    levels.forEach((label, i) => {
      const b = btn(`${label}`, () => ctx.session.issue({ t: 'research', funding: i as 0 | 1 | 2 | 3 })) as HTMLButtonElement;
      radios.push(b);
      row.appendChild(b);
    });
    const invented = el('div', 'kv');
    body.append(cur, el('div', 'sect', 'Funding (per month):'), row, el('div', 'sect', 'Invented:'), invented);
    return () => {
      const w = w0(ctx);
      if (!w) return;
      const r = w.research;
      const pct = Math.floor((r.progress / RESEARCH_GOAL) * 100);
      cur.innerHTML = r.pending.length
        ? `Working on something new… <b>${pct}%</b>`
        : 'All research complete!';
      radios.forEach((b, i) => {
        b.classList.toggle('active', r.funding === i);
        b.textContent = `${levels[i]} (${fmtMoney(RESEARCH_COST_MONTH[i])})`;
      });
      invented.innerHTML = r.invented.map((id) => rideDef(id).name).join(', ');
    };
  });
}

export function openParkWin(ctx: WinCtx): void {
  openWin('park', 'Park', (body) => {
    const info = el('div', 'kv');
    const row = el('div', 'row');
    row.appendChild(btn('Rename park', () => {
      const name = prompt('Park name:', w0(ctx)?.park.name ?? '');
      if (name) ctx.session.issue({ t: 'park', name });
    }));
    row.appendChild(btn('Fee −50¢', () => {
      const w = w0(ctx);
      if (w) ctx.session.issue({ t: 'park', fee: w.park.entranceFee - 50 });
    }));
    row.appendChild(btn('Fee +50¢', () => {
      const w = w0(ctx);
      if (w) ctx.session.issue({ t: 'park', fee: w.park.entranceFee + 50 });
    }));
    const row2 = el('div', 'row');
    row2.appendChild(btn('💾 Export save', () => {
      const w = w0(ctx);
      if (w) exportPark(w);
    }));
    row2.appendChild(btn('📂 Import save', async () => {
      if (ctx.session.mode === 'guest') {
        ctx.toast('Only the host can load a park.');
        return;
      }
      try {
        const w = await importPark();
        ctx.session.loadWorld(w);
        ctx.toast(`Loaded ${w.park.name}.`);
      } catch (e) {
        ctx.toast(String((e as Error).message ?? e));
      }
    }));
    body.append(info, row, el('div', 'sect', 'Save file (host keeps the park — nothing is stored online):'), row2);
    return () => {
      const w = w0(ctx);
      if (!w) return;
      info.innerHTML = `<b>${w.park.name}</b><br>` +
        `Rating: <b>${w.park.rating}</b> · Guests in park: ${w.peeps.length} · Total visits: ${w.park.guestsTotal}<br>` +
        `Entrance fee: <b>${fmtMoney(w.park.entranceFee)}</b> · ${dateOf(w.tick).label}`;
    };
  });
}

export function openMultiplayer(ctx: WinCtx): void {
  openWin('mp', 'Online Players', (body) => {
    const info = el('div', 'kv');
    const members = el('div', 'list');
    const lobbyEl = el('div', 'list');
    body.append(info, el('div', 'sect', 'In this park:'), members, el('div', 'sect', 'Online lobby (invite them!):'), lobbyEl);
    return () => {
      const s = ctx.session;
      if (!s.net?.connected) {
        info.textContent = 'Offline — no relay connection. Set a relay on the title screen to play together.';
        members.innerHTML = '';
        lobbyEl.innerHTML = '';
        return;
      }
      info.innerHTML = s.roomCode
        ? `Invite code: <b class="code">${s.roomCode}</b> — friends can “Join” with this code.`
        : 'Not in an online park.';
      members.innerHTML = '';
      members.appendChild(el('div', 'hint', `⭐ ${s.myName} (you${s.mode === 'host' ? ', host' : ''})`));
      for (const p of s.peers.values()) {
        const d = el('div', 'hint', `${p.isHost ? '⭐' : '👤'} ${p.name}`);
        d.style.color = p.color;
        members.appendChild(d);
      }
      lobbyEl.innerHTML = '';
      for (const p of s.lobby) {
        if (p.id === s.myId || p.status !== 'lobby') continue;
        const row = el('div', 'row');
        row.appendChild(el('span', 'hint', p.name));
        if (s.mode === 'host') row.appendChild(btn('Invite', () => s.invite(p.id)));
        lobbyEl.appendChild(row);
      }
      if (!lobbyEl.hasChildNodes()) lobbyEl.appendChild(el('div', 'hint', 'Nobody else online right now.'));
    };
  });
}
