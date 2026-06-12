# OpenPark — Online Multiplayer Theme-Park Tycoon (RCT-Deluxe-style)

A browser game inspired by RollerCoaster Tycoon Deluxe: isometric 2D pixel-art park builder
with guests (peeps), flat rides, buildable + prebuilt roller coasters, shops, research
unlocks, finances — and **real-time co-op multiplayer** in the style of Google Docs /
collaborative whiteboards (live cursors + ghost previews of what others are placing).

> **Resume instructions for Claude:** This file is the source of truth for progress.
> Work top-to-bottom through the milestone checklists. Update checkboxes as you finish
> items. Conventions + architecture decisions are below — follow them, don't re-decide.
> After each milestone, run `npm run build` and `npm test` from the repo root and fix errors.

---

## Product requirements (from user)

1. Like original RollerCoaster Tycoon Deluxe: features, similar 2D isometric art style.
2. Online multiplayer: multiple people co-own a park, edit simultaneously.
3. **No cloud saves.** The park "file" lives with the host (game creator). Host invites
   online players from a lobby; the server only relays messages (signaling + relay).
4. Prebuilt roller-coaster templates the player can stamp down.
5. Research/unlock progression over time (rides, shops, scenery) like RCT.
6. Google-Docs-style collaboration: translucent **ghost wireframes** of whatever another
   player is currently placing, live, before they commit.
7. **Always-visible named cursors** for all players, like a collaborative whiteboard.
8. Original art only (procedurally drawn pixel sprites in an RCT-inspired style — no
   copyrighted RCT assets).

## Architecture (decided — do not re-litigate)

- **Monorepo, npm workspaces:** `shared/` (deterministic sim, no DOM), `server/` (Node ws
  relay + static file host), `client/` (Vite + TS + Canvas2D).
- **Networking model: host-paced deterministic lockstep ("live replay").**
  - The host's browser is authoritative and holds the only copy of the park.
  - Sim advances at fixed 20 ticks/sec (`TICK_MS = 50`).
  - Guests send *commands* (build path, place ride, set price…) to the host via the relay.
  - Host stamps commands into a tick, executes locally, and broadcasts
    `{tick, cmds[]}` batches every tick. Guests run the identical sim and execute exactly
    those batches in order. Guests never advance past the host's committed tick.
  - New joiner: host serializes full world → relay → joiner loads snapshot at tick T,
    then consumes batches from T. Save/Load = the same serializer to/from a local .json
    file on the host's machine. **Nothing stored server-side.**
  - If host disconnects, session ends for guests (host migration = future work).
- **Determinism rules (critical):** integer/fixed math where possible; `mulberry32` seeded
  RNG inside world state; **never** `Math.sin/cos/atan2` etc. in `shared/` sim code (use
  the precomputed tables in `coaster.ts` — float +,-,*,/ and sqrt are IEEE-deterministic
  and OK); no iteration over object keys for sim decisions (use arrays / insertion-ordered
  Maps); all entity IDs allocated from counters in world state.
- **Ephemeral channel (not simulated, not deterministic):** cursor positions (~15 Hz,
  world coords) and ghost previews (current tool + hover + rotation + blueprint) are
  broadcast via the relay and rendered translucent on other clients. Never touches sim.
- **Server** (`server/`): rooms with 6-char invite codes, lobby of online players
  (name + status), host can invite any lobby player (push popup), relay cmd/snapshot/
  ephemeral traffic. Also serves the built client (`npm start` = one process, port 3000).
- **Rendering:** Canvas2D, 64×32 diamond tiles, height unit = 8 px. Terrain stores
  **vertex heights** on an (N+1)×(N+1) grid (RCT-style slopes derived from 4 corners).
  Painter's algorithm: tiles back-to-front, per-tile content stack (path → scenery/ride →
  track → trains → peeps). Zoom 0.5/1/2, MMB/RMB-drag or arrows to pan.
- **Sprites:** generated at boot into offscreen canvases (`client/src/render/sprites.ts`),
  pixel-art style, palette inspired by RCT (bright grass green checker, tan paths, pastel
  ride colors). `image-rendering: pixelated`.
- **UI:** DOM overlay styled like RCT (beveled tan/brown windows, top icon toolbar,
  bottom status bar: cash / guests / park rating / date). Window manager with draggable
  panels. Message ticker for events ("New ride invented!").
- **Money** = integer cents. Co-op shared park funds. Date: 1 game month = 1300 ticks.
- Client exposes `window.__game` (world, session, renderer) for headless/screenshot
  debugging (Playwright-friendly).

## Repo layout

```
PLAN.md                  ← this file (keep updated!)
package.json             ← workspaces root: build/dev/test/start scripts
shared/src/              ← deterministic sim (no DOM imports!)
  constants.ts rng.ts types.ts world.ts terrain.ts path.ts scenery.ts
  rides.ts coaster.ts templates.ts peeps.ts economy.ts research.ts
  commands.ts sim.ts serialize.ts index.ts
shared/test/             ← vitest: determinism, serialize, coaster, research
server/src/index.ts      ← ws relay + lobby/rooms/invites + static hosting
client/index.html
client/src/
  main.ts net.ts session.ts input.ts tools.ts state.ts save.ts
  render/ sprites.ts iso.ts renderer.ts overlay.ts
  ui/ ui.ts windows.ts style.css
.github/workflows/pages.yml ← GitHub Pages deploy (client only; relay runs elsewhere)
```

## Protocol sketch

Client→Server: `hello{name}` `createRoom` `joinRoom{code}` `invite{playerId}`
`inviteResponse{accept}` `leaveRoom` `toHost{payload}` (guest cmds/requests),
`broadcast{payload}` (host batches, ephemeral), `toPlayer{playerId,payload}` (snapshots).
Server→Client: `welcome{playerId}` `lobby{players,rooms}` `roomUpdate{members,code}`
`invited{from,code}` `fromPlayer{playerId,payload}` `hostLeft`.
Sim payloads: `cmdReq{cmd}` `tickBatch{tick,cmds}` `snapshot{tick,world}` `needSnapshot`.
Ephemeral payloads: `cursor{x,y,tool}` `ghost{kind,...}|null`.

## Milestones

### M0 — Scaffolding ✅
- [x] PLAN.md (this file)
- [x] Root package.json (workspaces, scripts: dev / build / start / test), tsconfigs, .gitignore
- [x] shared/server/client packages compile; vite dev + ws server run together (`npm run dev`)

### M1 — World, terrain, rendering core ✅
- [x] shared: constants, rng, types, world create/serialize, vertex-height terrain + water,
      slope math, tile picking helpers
- [x] client: canvas boot, camera (pan/zoom), iso projection, terrain renderer (slopes,
      cliffs, water anim, grid), mouse→tile picking
- [x] terrain tools: raise/lower land (vertex + brush), water raise/lower
- [x] path tool: place/remove footpath + queue, auto-connect sprites

### M2 — Multiplayer core (the heart) ✅
- [x] server: lobby (names), rooms + codes, invites, relay, static hosting
- [x] client: menu screen (name → create park / join code), lobby list + invite popups
- [x] lockstep session driver (host + guest), command queue, tick batches, catch-up
- [x] snapshot on join; mid-session join works (verified headless: 2 browsers, lockstep state identical)
- [x] live cursors w/ names + player colors (always visible)
- [x] ghost previews of other players' pending placements (path/terrain/scenery/ride/track)
- [x] determinism test: two worlds, same seed + cmd stream → identical serialize hash

### M3 — Park content: scenery, shops, peeps, economy ✅
- [x] scenery catalog (trees ×4, garden, bench, lamp, fence) place/remove, costs
- [x] shops/stalls: food (burger, fries, ice cream), drink, info kiosk, toilet; build,
      open/close, set prices; stock costs
- [x] peeps: spawn at gate (rate ← park rating + marketing), path-walk w/ junction AI,
      needs (hunger/thirst/toilet/energy/nausea/happiness), thoughts, buy from stalls,
      use toilets, litter, leave park when done/unhappy
- [x] economy: shared cash, build costs, monthly stall upkeep, income tracking, loan,
      finances window w/ monthly history
- [x] park rating calc + bottom status bar + message ticker

### M4 — Flat rides ✅
- [x] ride catalog: merry-go-round, ferris wheel, twist, haunted house, observation tower,
      bumper cars (each: footprint, cost, base stats, sprite)
- [x] placement w/ entrance+exit tiles, queue paths feed entrance
- [x] ride operation loop: load peeps from queue, run cycle (animated), unload; tickets;
      excitement/intensity/nausea affect peep decisions + nausea
- [x] ride window: open/close/test, price, stats, customer count; ride list window

### M5 — Coasters ✅
- [x] track model: piece types (station, flat, slope up/down, steep, turns 90° small/large,
      lift hill, brakes), per-piece geometry tables (deterministic), supports
- [x] interactive builder: piece-by-piece w/ ghost preview, validation, demolish,
      must close circuit; entrance/exit placement
- [x] train physics: gravity/friction/lift/brake point-mass over track graph, multi-car
      train render, RCT1-style valley-stall detection → test fails
- [x] ratings: excitement/intensity/nausea from speed/drops/Gs/length
- [x] **prebuilt templates ×4** (mini steel oval, wooden out-and-back, figure-8 w/ crossing,
      wild mouse) — stamp-down placement with ghost, terrain check, cost; closure +
      test-run verified in shared/test/coaster.test.ts
- [x] coaster trains render with peeps, queue/load/unload integration

### M6 — Research & progression ✅
- [x] research tree w/ funding levels, progress ticks, unlock messages; RCT-style
      starter set (merry-go-round, wooden coaster, burger, drinks, toilets) vs pending
- [x] research window (progress, funding, invented list)
- [x] invention ticker message (toolbar badge skipped — build menus update live instead)

### M7 — Save/load & polish ✅ (sounds + help overlay deferred)
- [x] host Save Park → downloads .park; Load from title screen or Park window (host only);
      autosave to localStorage every game month + Continue button
- [x] online-players panel (members + lobby + invites), host-left handling (guest keeps a
      local copy and continues offline), connection mode in status bar
- [x] park window: name, entrance fee, marketing campaign
- [x] title screen
- [ ] help overlay (keys), sounds (WebAudio) — deferred to M8

### M7.5 — GitHub Pages + portable saves (user request, 2026-06-12) ✅
- [x] vite `base: './'` → client works at any path (Pages serves under /<repo>/)
- [x] static-host awareness: on github.io / file:// there is no same-origin ws; relay URL
      is user-configurable (title screen box, `?relay=`, localStorage) with graceful
      offline-solo fallback. WebSockets carry no CORS preflight; the relay accepts any origin.
- [x] `.github/workflows/pages.yml`: npm test + build client → deploy to Pages on push to main
- [x] export/import `.park` files: XOR-stream-obfuscated JSON + FNV integrity check
      (client/src/save.ts) — survives editing attempts loudly, loads via menu or Park window
- [x] README.md with Pages/relay/save instructions

### M8 — Stretch (future sessions)
- [ ] staff (handymen sweep litter, mechanics fix breakdowns), ride breakdowns
- [ ] banked turns, vertical loop piece, on-ride photo; more templates
- [ ] scenario objectives + multiple maps; land ownership
- [ ] host migration; spectator mode; in-game chat
- [ ] WebRTC datachannel transport (server = signaling only)

## Status log (append entries; newest last)

- 2026-06-12: Repo was empty. Wrote PLAN.md. Building M0→M7 in order.
- 2026-06-12 (session 1, corrected): M0–M4 partially built — scaffolding, configs, and
  shared sim through coaster.ts (terrain/path/scenery/rides/coaster physics+ratings).
  The earlier "M0–M7 complete" entry here was written prematurely and was wrong:
  no client/src, no server source, no tests existed yet.
- 2026-06-12 (session 2): Everything else built and verified. shared: templates (4 designs,
  closure + ratings tested), peeps, economy, research, commands, sim, serialize.
  26 vitest tests green (determinism incl. mid-session snapshot join, serialize
  round-trip, coaster build/templates/valley-fail/operation, research order, peep flow).
  server: ws relay + lobby/rooms/invites + static hosting (smoke-tested with 2 ws clients).
  client: full game (iso renderer, procedural sprites, tools, ghosts, cursors, windows UI,
  lockstep session, save export/import). Headless Playwright E2E: host page builds a
  wooden out-and-back via real commands (rated E5.49/I4.34/N2.88), guest joins by code,
  commands replicate, cursors visible. User request folded in: GitHub Pages deploy
  (workflow + relative base + configurable relay w/ offline fallback) and encrypted
  .park save export/import + monthly autosave.
  `npm run dev` → http://localhost:5173 (ws :3001). `npm start` → :3000. Next: M8 stretch.
- 2026-06-12 (session 2, art pass): User feedback — assets too flat/undetailed. Searched for
  CC0 isometric park assets (nothing cohesive exists; RCT rips are copyrighted), so the
  procedural sprites were rebuilt instead: sprites.ts now draws with a local iso projector
  (same 2:1 math as the world) — shaded boxes/roofs/striped canopies, sprites carry ax/ay
  anchors, ride sprites at true footprint scale (3×3 ride ≈ 192px). Gate is a real archway
  (brick towers, battlements, sheared OPENPARK sign, flags). Renderer: grass speckles+tufts,
  path edging+paving texture, queue handrails, water depth tint+sparkles, cliff strata+grass
  lip, track crossties + dark rail underside + wooden trestle supports, detailed train cars,
  peeps with hair/arms/walk cycle. Verified via zoom-2 Playwright screenshots, iterated on
  tower cabin/twist/stall signs. Tests/build green.
