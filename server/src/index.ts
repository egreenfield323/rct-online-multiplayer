// OpenPark relay server: lobby + rooms + message relay + static client hosting.
// Holds NO game state — the host's browser owns the park; we only pass messages.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const argPort = process.argv.indexOf('--port');
const PORT = argPort >= 0 ? Number(process.argv[argPort + 1]) : Number(process.env.PORT ?? 3000);

// ---------------------------------------------------------------- state

interface Client {
  id: number;
  name: string;
  ws: WebSocket;
  room: string | null; // invite code
}

interface Room {
  code: string;
  hostId: number;
  members: number[]; // [0] is always the host
}

const clients = new Map<number, Client>();
const rooms = new Map<string, Room>();
let nextId = 1;

// ---------------------------------------------------------------- helpers

function send(c: Client, msg: unknown): void {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function lobbySnapshot() {
  return {
    t: 'lobby',
    players: [...clients.values()].map((c) => ({
      id: c.id,
      name: c.name,
      status: c.room ? 'playing' : 'lobby',
    })),
    rooms: [...rooms.values()].map((r) => ({ code: r.code, size: r.members.length })),
  };
}

function broadcastLobby(): void {
  const msg = lobbySnapshot();
  for (const c of clients.values()) send(c, msg);
}

function roomUpdate(room: Room): void {
  const msg = {
    t: 'roomUpdate',
    code: room.code,
    members: room.members
      .map((id) => clients.get(id))
      .filter((c): c is Client => !!c)
      .map((c) => ({ id: c.id, name: c.name, isHost: c.id === room.hostId })),
  };
  for (const id of room.members) {
    const c = clients.get(id);
    if (c) send(c, msg);
  }
}

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function leaveRoom(c: Client): void {
  if (!c.room) return;
  const room = rooms.get(c.room);
  c.room = null;
  if (!room) return;
  room.members = room.members.filter((id) => id !== c.id);
  if (c.id === room.hostId || room.members.length === 0) {
    // host gone — session over for everyone
    for (const id of room.members) {
      const m = clients.get(id);
      if (m) {
        m.room = null;
        send(m, { t: 'hostLeft' });
      }
    }
    rooms.delete(room.code);
  } else {
    roomUpdate(room);
  }
  broadcastLobby();
}

// ---------------------------------------------------------------- ws

function handleMessage(c: Client, raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  switch (msg.t) {
    case 'hello': {
      c.name = String(msg.name ?? 'Player').slice(0, 20) || 'Player';
      send(c, { t: 'welcome', playerId: c.id, name: c.name });
      broadcastLobby();
      break;
    }
    case 'createRoom': {
      leaveRoom(c);
      const room: Room = { code: makeCode(), hostId: c.id, members: [c.id] };
      rooms.set(room.code, room);
      c.room = room.code;
      roomUpdate(room);
      broadcastLobby();
      break;
    }
    case 'joinRoom': {
      const room = rooms.get(String(msg.code ?? '').toUpperCase());
      if (!room) {
        send(c, { t: 'joinFailed', reason: 'No park with that code.' });
        return;
      }
      if (room.members.length >= 8) {
        send(c, { t: 'joinFailed', reason: 'That park is full.' });
        return;
      }
      leaveRoom(c);
      room.members.push(c.id);
      c.room = room.code;
      roomUpdate(room);
      broadcastLobby();
      break;
    }
    case 'invite': {
      // host pushes an invite popup to a lobby player
      const room = c.room ? rooms.get(c.room) : null;
      if (!room || room.hostId !== c.id) return;
      const target = clients.get(Number(msg.playerId));
      if (target && !target.room) send(target, { t: 'invited', from: c.name, code: room.code });
      break;
    }
    case 'leaveRoom': {
      leaveRoom(c);
      break;
    }
    case 'toHost': {
      const room = c.room ? rooms.get(c.room) : null;
      if (!room) return;
      const host = clients.get(room.hostId);
      if (host) send(host, { t: 'fromPlayer', playerId: c.id, payload: msg.payload });
      break;
    }
    case 'broadcast': {
      // to everyone else in my room (host batches; anyone's cursors/ghosts)
      const room = c.room ? rooms.get(c.room) : null;
      if (!room) return;
      for (const id of room.members) {
        if (id === c.id) continue;
        const m = clients.get(id);
        if (m) send(m, { t: 'fromPlayer', playerId: c.id, payload: msg.payload });
      }
      break;
    }
    case 'toPlayer': {
      const room = c.room ? rooms.get(c.room) : null;
      if (!room || !room.members.includes(Number(msg.playerId))) return;
      const target = clients.get(Number(msg.playerId));
      if (target) send(target, { t: 'fromPlayer', playerId: c.id, payload: msg.payload });
      break;
    }
  }
}

// ---------------------------------------------------------------- static

const here = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(here, '../../client/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0];
    let file = join(clientDist, url === '/' ? 'index.html' : url);
    if (!file.startsWith(clientDist)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file)) file = join(clientDist, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('Client not built. Run: npm run build');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(500).end();
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  const c: Client = { id: nextId++, name: 'Player', ws, room: null };
  clients.set(c.id, c);
  ws.on('message', (data) => handleMessage(c, data.toString()));
  ws.on('close', () => {
    clients.delete(c.id);
    leaveRoom(c);
    broadcastLobby();
  });
  ws.on('error', () => ws.close());
});

server.listen(PORT, () => {
  console.log(`OpenPark relay + web server on http://localhost:${PORT} (ws: /ws)`);
});
