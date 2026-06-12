# 🎢 OpenPark

A browser theme-park tycoon in the spirit of RollerCoaster Tycoon Deluxe — isometric
pixel-art park building with terrain, paths, scenery, stalls, flat rides, a piece-by-piece
**roller coaster builder** (plus 4 prebuilt designs), guests with needs and moods,
finances, and research — and **real-time co-op multiplayer** with Google-Docs-style live
cursors and ghost previews of what your friends are placing.

All art is procedurally drawn at boot. No copyrighted assets.

## Play

- **Solo / offline:** open the deployed page (works on GitHub Pages) and hit *New park*.
- **Co-op:** one player hosts; the park lives **only in the host's browser**. Friends join
  with a 6-letter invite code. The server is a dumb message relay — nothing is stored online.

### Multiplayer on GitHub Pages

GitHub Pages only serves static files, so it can't host the relay. To play together:

1. Run the relay somewhere reachable: `npm ci && npm run build && npm start`
   (one process: serves the game *and* relays on port 3000, `PORT` env to change), or
   expose your local one with any https tunnel.
2. Paste its address (e.g. `wss://your-host.example.com`) into the **Relay server** box on
   the title screen — or open the page with `?relay=wss://your-host.example.com`.

Leave the relay blank to play solo offline.

## Saves

- **Export save** (Park window) downloads an integrity-checked `.park` file.
- **Import save / Load .park file** restores it (host only in co-op — guests get resynced).
- The game also autosaves to your browser every in-game month (*Continue* on the title screen).

## Development

```bash
npm ci
npm run dev    # vite on :5173 + relay on :3001 (proxied at /ws)
npm test       # deterministic sim test suite (vitest)
npm run build  # server/dist + client/dist
npm start      # production: one node process on :3000
```

The deterministic simulation lives in `shared/` (no DOM, lockstep-replayable), the relay
in `server/`, the canvas client in `client/`. `PLAN.md` documents the architecture and
milestone history. `window.__game` exposes the session/world for headless testing.
