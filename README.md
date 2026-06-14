# 🎢 OpenPark

A browser theme-park tycoon in the spirit of RollerCoaster Tycoon Deluxe — isometric
pixel-art park building with terrain, paths, scenery, stalls, flat rides, a piece-by-piece
**roller coaster builder** (plus 4 prebuilt designs), guests with needs and moods,
finances, and research — and **real-time co-op multiplayer** with Google-Docs-style live
cursors and ghost previews of what your friends are placing.

All art is procedurally drawn at boot — original work, ordered-dithered for a pre-rendered
look. No copyrighted assets. See the **🏆 Credits** screen on the title menu for the full
list of inspirations (RollerCoaster Tycoon Deluxe, Stardew Valley) and technology.

## Play

- **Solo / offline:** open the deployed page (works on GitHub Pages) and hit *New park*.
- **Co-op (peer-to-peer, free):** tick **🌐 Play online** on the title screen, start a park,
  then open the **👥** window to copy a 6-letter invite code. Friends type it into
  *Join a friend*. The park lives **only on the host's machine**; everyone else mirrors it
  live. Networking is pure **WebRTC peer-to-peer** (via [PeerJS](https://peerjs.com)'s free
  public signalling broker) — **no game server, no cloud saves, nothing to pay for.**
- **Camera:** arrow keys, drag with the middle/right mouse button, or push the cursor to a
  screen edge to scroll (toggle in the *Park* window).

## Windows desktop build (.exe)

For native performance, package the whole game into a single portable Windows executable:

```bash
npm run exportGame      # builds the client, then electron-builder → release/OpenPark-<ver>-portable.exe
```

The resulting `release/OpenPark-*-portable.exe` is self-contained — share it and anyone can
double-click to play, including online co-op (it dials the same free PeerJS broker, so no
setup is needed on their end).

## Saves

- **Export save** (Park window) downloads an integrity-checked `.park` file.
- **Import save / Load .park file** restores it (host only in co-op — guests get resynced).
- The game also autosaves to your browser every in-game month (*Continue* on the title screen).

## Development

```bash
npm ci
npm run dev        # vite on :5173 (legacy ws relay also starts on :3001, unused by default)
npm test           # deterministic sim test suite (vitest)
npm run build      # server/dist + client/dist
npm start          # production static host: one node process on :3000
npm run electron   # build client + launch the desktop shell locally
npm run exportGame # build client + package the portable Windows .exe
```

The deterministic simulation lives in `shared/` (no DOM, lockstep-replayable), the
peer-to-peer transport in `client/src/peernet.ts` (PeerJS/WebRTC, host-as-hub), the canvas
client in `client/`, and the Electron shell in `electron/`. The legacy websocket relay in
`server/` is kept for static hosting but is no longer required for multiplayer. `PLAN.md`
documents the architecture and milestone history. `window.__game` exposes the
session/world/input for headless testing.
