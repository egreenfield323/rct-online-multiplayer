// Thin typed wrapper over the relay websocket.
//
// Relay resolution: same-origin /ws when served by our node server; on static
// hosts (GitHub Pages, file://) there is no same-origin socket, so a relay URL
// can be supplied via ?relay=… or saved in localStorage. Without one the game
// runs offline solo (multiplayer buttons disabled).

export function resolveRelayUrl(): string | null {
  const qs = new URLSearchParams(location.search).get('relay');
  const saved = localStorage.getItem('openpark-relay');
  const explicit = qs ?? saved;
  if (explicit) {
    let u = explicit.trim();
    if (!/^wss?:\/\//.test(u)) u = (location.protocol === 'https:' ? 'wss://' : 'ws://') + u;
    if (!/\/ws$/.test(u)) u = u.replace(/\/$/, '') + '/ws';
    return u;
  }
  if (location.protocol === 'file:') return null;
  if (/\.github\.io$/.test(location.hostname)) return null; // Pages: static only
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

export function saveRelayUrl(u: string): void {
  if (u.trim()) localStorage.setItem('openpark-relay', u.trim());
  else localStorage.removeItem('openpark-relay');
}

export type ServerMsg =
  | { t: 'welcome'; playerId: number; name: string }
  | { t: 'lobby'; players: { id: number; name: string; status: string }[]; rooms: { code: string; size: number }[] }
  | { t: 'roomUpdate'; code: string; members: { id: number; name: string; isHost: boolean }[] }
  | { t: 'invited'; from: string; code: string }
  | { t: 'joinFailed'; reason: string }
  | { t: 'fromPlayer'; playerId: number; payload: unknown }
  | { t: 'hostLeft' };

type Handler = (msg: ServerMsg) => void;

export class Net {
  private ws: WebSocket | null = null;
  private handlers: Handler[] = [];
  connected = false;
  onClose: (() => void) | null = null;

  connect(url: string, name: string, timeoutMs = 4000): Promise<void> {
    return new Promise((res, rej) => {
      let settled = false;
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          rej(new Error('relay timeout'));
        }
      }, timeoutMs);
      ws.onopen = () => {
        this.ws = ws;
        this.connected = true;
        this.send({ t: 'hello', name });
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMsg;
        if (msg.t === 'welcome' && !settled) {
          settled = true;
          clearTimeout(timer);
          res();
        }
        for (const h of this.handlers) h(msg);
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          rej(new Error('relay unreachable'));
        }
      };
      ws.onclose = () => {
        this.connected = false;
        this.onClose?.();
      };
    });
  }

  on(h: Handler): void {
    this.handlers.push(h);
  }

  send(msg: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  toHost(payload: unknown): void {
    this.send({ t: 'toHost', payload });
  }

  broadcast(payload: unknown): void {
    this.send({ t: 'broadcast', payload });
  }

  toPlayer(playerId: number, payload: unknown): void {
    this.send({ t: 'toPlayer', playerId, payload });
  }
}
