# Claude Code Implementation Handoff — `HPOS10I`

**Branch:** `claude/ios-audio-security-load-handoff`  
**Scope:** Fix **100% silent audio on Safari & all iOS devices** (Ogg-only legacy Godot rule), close the **production `window.hpos` & `?inputs=<TAS>` anti-cheat backdoor**, fix the **Ranked / Relic boot race condition**, fix **`exitToHub()` cloud-save data loss & broken `serverLoadout` parser**, eliminate invisible first-frame tiles & 28-request SFX storm, and fix the **90,501-cell synchronous respawn rebuild + $O(N^2)$ `mergeEdges()` bottleneck**.

---

## 0. Hard Invariants (`AGENTS.md`)

- **Originality rule:** Free, non-commercial fan parody; all names, art, audio, and levels must remain original (`tools/qa/originality_scan.sh .` must pass).
- If `vendor/hub-sdk` is ever re-vendored from `metaverse-hub`, update pinned line numbers in `tools/qa/originality_allow.txt:27-38`.
- `tools/qa/web_check.mjs` enforces `build/web` budgets (25 MB total / 12 MB gzip).
- Never push directly to `main`; open a PR after running all checks.

---

## 1. P0 — Critical Platform & Security Fixes

### 1.1 Fix 100% Silent Audio on macOS Safari & All iOS Browsers (Ogg-Only Bug)
- **Files:** `src/core/audio.ts:57-58, 174-178`, `audio/{music,sfx}/*.ogg`, `tools/qa/web_check.mjs:62-64`, `qa/checklists/08-web.md:20`
- **Current Problem:** `src/core/audio.ts` loads only `.ogg` (Ogg Vorbis) files via `AudioContext.decodeAudioData()`, silently returning `null` on decode error, and `tools/qa/web_check.mjs:62-64` explicitly enforces a legacy Godot-era Ogg-only rule. **Safari (macOS) and every browser on iOS (all WebKit) cannot decode Ogg Vorbis in Web Audio** — making the game completely mute on Apple devices!
- **Exact Changes:**
  1. Transcode all 37 `audio/{music,sfx}/*.ogg` files (9 music + 28 SFX) to **MP3 (128 kbps music / 96 kbps SFX)** or **AAC/M4A** (universally supported by Chrome, Firefox, Edge, Safari, and iOS WebKit — OR ship dual `.ogg` + `.m4a` and select the preferred extension once at boot via `document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"')`). Replacing `.ogg` with `.mp3` keeps `build/web` smallest (~1.7 MB total, zero duplicate audio files) and works in every browser!
  2. Update `src/core/audio.ts:57-58, 174-178` to load the compatible format(s) cleanly.
  3. Update `tools/qa/web_check.mjs:62-64` and `qa/checklists/08-web.md:20` to enforce `.mp3`/`.m4a`/`.ogg` web-audio compatibility instead of Ogg-only.

### 1.2 Strip `window.hpos` Debug Backdoor & Dev/TAS URL Flags From Production Builds
- **Files:** `src/main.ts:187-193, 204, 216-236`, `src/core/dev.ts:23-29, 93-99`, `vite.config.ts`, `tools/e2e/hub_e2e.mjs`, `tools/qa/smoke.mjs`
- **Current Problem:**
  - `src/main.ts:204, 224-236` exposes `window.hpos = { tree, router, state, hub, dev, feedback, scenes, play }` **unconditionally in production builds**.
  - `src/core/dev.ts:23-29, 93-99` and `src/main.ts:187-193, 216-221` honor `?dev`, `?zone=<id>&stage=<n>`, `?scene=<id>`, and **`?inputs=<arbitrary-URL>`** (fetching and replaying arbitrary TAS scripts!) in production!
  - Any user on live production can open DevTools and run `hpos.state.attemptTime = 23; hpos.state.addTickets(20); hpos.state.completeLevel()` to forge a 23.0 s #1 Ranked `hpos10i_act_time` record, farm 200 Tickets/session, and unlock `hpos10i_core` + pets without playing.
- **Exact Changes:**
  1. Introduce a compile-time Vite define `__HPOS_TEST_HOOKS__` in `vite.config.ts` that is **`false` in all production builds** and `true` ONLY when `import.meta.env.DEV` or `HPOS_TEST_BUILD=1` (set exclusively in CI smoke/e2e jobs, never in production GitHub Pages / `web-build` deploys!).
  2. Gate `exposeDebugApi()` (`window.hpos`) and all dev/TAS query parameters (`?dev`, `?zone`, `?scene`, `?inputs`) inside `if (__HPOS_TEST_HOOKS__)` so Vite dead-code-eliminates them completely from production bundles.
  3. Add a check in `tools/qa/web_check.mjs` asserting production `build/web` JS bundles do not expose `window.hpos` or `?inputs=` TAS hooks.
  4. *(Optional P2 follow-up)*: Because `Dev.play` already supports deterministic 60 Hz input timelines, record compact input logs on Z1A1 runs and attach a replay payload to `submitScore('hpos10i_act_time', ...)` for server-side V8 verification.

### 1.3 Fix Ranked / Relic Boot Race Condition (`HubClient.reach === 'pending'`)
- **Files:** `src/main.ts:184, 199`, `src/hub/relic_loadout.ts:67-102`, `src/levels/content.ts:229`, `src/core/game_state.ts:199`, `src/core/scene_router.ts`
- **Current Problem:** `HubClient.init()` runs non-blocking at `main.ts:184`. While `reach === 'pending'`, `RelicLoadout.resolve()` returns `{ ranked: false, extras_allowed: true, extra_life: false }`. Because `boxesEnabled()` (`src/levels/content.ts:229`) and `grantGoldenLife()` (`src/core/game_state.ts:199`) do not guard against `reach === 'pending'`, entering Act 1 quickly spawns shields/speed shoes/invincibility ItemBoxes into a **Ranked** run (and never removes them when `ranked: true` arrives), or skips Golden Sproto's extra life on an unranked run!
- **Exact Changes:**
  1. In `RelicLoadout.resolve()` / `boxesEnabled()`, **fail closed** while `HubClient.reach === 'pending'` (`extras_allowed: false`, no ItemBoxes spawned).
  2. When `hubVisitStarting('hpos10i')` is true and the player clicks Start/Zone Select while `HubClient.reach === 'pending'`, briefly await `HubClient.ready` (capped at `1,500 ms` timeout) before building the gameplay level so `ranked` and `relics` are settled cleanly before `boxesEnabled()` and `grantGoldenLife()` execute.
  3. Add a Vitest test confirming ItemBoxes cannot spawn during `reach === 'pending'` and Golden Sproto's extra life applies reliably on portal entry.

---

## 2. P1 — Hub Integration Reliability & Dead Glue Cleanup

### 2.1 Fix `exitToHub()` Cloud-Save Race & Double Navigation
- **File:** `src/hub/hub_client.ts:213-225`
- **Current Problem:** `exitToHub()` fires unawaited `void this.save.flush()` (which sends `save.put` without `keepalive: true`), then calls `this.sdk?.exit('exit_to_hub')` (which navigates), and then **immediately calls `window.location.assign(target)` a second time**, aborting the in-flight `save.put`!
- **Exact Changes:**
  1. Make `exitToHub()` `async` and await `Promise.race([this.save.flush(), new Promise((r) => setTimeout(r, 500))])` before calling `this.sdk.exit('exit_to_hub')`.
  2. Only call `window.location.assign(target)` as fallback when `this.sdk` has no active session (never invoke both `sdk.exit()` and `location.assign()` back-to-back).

### 2.2 Fix Broken `loadoutFrom()` Parser & Remove Obsolete `outbox_repair.ts`
- **Files:** `src/hub/hub_client.ts:101, 142, 322, 510-515`, `src/hub/outbox_repair.ts`
- **Current Problem:**
  1. `loadoutFrom(payload)` (`hub_client.ts:510-515`) reads `(payload.items as Payload).loadout`, expecting `payload.items` to be an object—but SDK 0.8.0 sets `payload.items` to `string[]`, so `serverLoadout` is **always `{}`**.
  2. `outbox_repair.ts` opens the SDK's private `hub-outbox` IndexedDB on every boot (up to 1.5 s timeout) for an SDK 0.6.0 bug already fixed inside SDK 0.8.0 (`finalRefusal()` in `vendor/hub-sdk/dist/live.js:150-156, 389-424`).
  3. `HubClient.effects` (`hub_client.ts:101, 322`) is stored and never read.
- **Exact Changes:**
  1. Fix or remove `loadoutFrom()` to match SDK 0.8.0's `items: string[]` + `relics: string[]` contract (do not read `.loadout` off an array).
  2. Remove `outbox_repair.ts` (or guard it behind a one-time `localStorage` migration flag so returning/new users never open `hub-outbox` directly on boot).
  3. Remove unused `vendor/hub-sdk/dist/hub-sdk.iife.js` (237 KB) if not needed by `vite.config.ts` / `originality_allow.txt`, and note `hub-sdk` v0.9 tree-shaking when re-vendoring.

---

## 3. P2 — Boot Pipeline, Tilemap Compression, $O(N \log N)$ Physics & Instant Respawns

### 3.1 Fix Misaligned Boot Preloading & Defer 26 Non-Menu SFX Fetches
- **Files:** `src/main.ts:135-140`, `src/core/audio.ts:113`, `src/levels/common/level_nodes.ts:128-129`, `src/levels/scenes.ts`
- **Current Problem:**
  1. `src/main.ts:135-140` blocks boot on **`floor_hazards.png` (212 KB — largest PNG in repo!)** and `remix_enemies.png` (8 KB), neither of which appears on Title or Zone Select.
  2. Meanwhile, Title backdrop PNGs, `sproto_sheet.png`, zone tile atlases (`assets/tiles/<zone>_tiles.png`, 150–201 KB), and boss sheets (`181 + 159 KB`) are NOT preloaded before scene mount, causing **completely invisible terrain tiles for several frames** on level entry!
  3. `Audio.attach()` (`src/core/audio.ts:113`) immediately dispatches **28 parallel SFX fetches** at boot, competing with Title backdrops and `title` music.
- **Exact Changes:**
  1. Remove `HAZARD_ATLAS` (212 KB) and `REMIX_ATLAS` from boot `preload()`; preload Title backdrop + `sproto_sheet.png` instead.
  2. Inside each async level/boss factory (`buildLevel()` / `registerBosses()`), `await preload([zoneTileAtlas, ...zoneBackdrops, HAZARD_ATLAS, ...bossSheets])` **before** mounting the scene so tiles and sprites appear on frame 1 with zero pop-in.
  3. In `src/core/audio.ts:113`, preload only `menu_move` and `menu_select` at boot; defer the other 26 gameplay SFX until first user gesture or first act load.

### 3.2 Compress 90,501-Cell Tilemaps, Fix $O(N^2)$ `mergeEdges()`, & Cache Static Geometry Across Respawns
- **Files:** `src/levels/data/<zone>/<act>.json` (`z2/act1` 1.05 MB / 63.5k cells, `z2/act2` 1.14 MB / 69.2k cells, `z3/act2` **1.47 MB / 90,501 cells**), `src/levels/common/level_nodes.ts:82-120`, `src/runtime/physics.ts:384-409, 668-684`, `src/core/scene_router.ts`
- **Current Problem:**
  1. `TileLayer.build()` (`level_nodes.ts:82-120`) iterates up to **90,501 `[x,y,ax,ay]` sub-arrays**, allocating >450k temporary `"${x},${y}"` strings and 90,501 `polygonShape` objects.
  2. `PhysicsWorld.flushMerges()` (`physics.ts:398-405, 668-684`) inserts all 90,501 polygons into `polyGrid` (even completely buried `edgeless` interior tiles!) and executes an **$O(N^2)$ collinear interval subtraction** in `mergeEdges()`.
  3. `SceneRouter.respawn()` and `restart()` destroy and recreate the entire `LevelRoot`, re-running this multi-hundred-ms synchronous rebuild on **every single death and checkpoint respawn**!
- **Exact Changes:**
  1. **Zero-String Tile Neighbor Lookup (`level_nodes.ts:82-120`):** Replace `"${x},${y}"` string keys with packed numeric keys `(x << 16) | (y & 0xffff)` (or flat typed array grid indexed by `y * width + x`), eliminating >450k string allocations per load.
  2. **Skip Buried Tiles & $O(N \log N)$ `mergeEdges()` (`src/runtime/physics.ts`):** Do not insert fully surrounded (`edgeless`) interior tiles into `polyGrid` unless queried by special triggers; sort intervals in `mergeEdges()` (`physics.ts:668-684`) and sweep linearly in $O(N \log N)$ instead of $O(N^2)$.
  3. **Cache Static Terrain Across Checkpoint Respawns (`scene_router.ts`):** Separate static terrain/collision layer from dynamic entities (player, enemies, rings, moving platforms, item boxes) so `respawn()` / `restart()` resets dynamic entities in-place without rebuilding the 90k-cell `TileLayer` and `PhysicsWorld`!
  4. **Compact Tilemap Encoding (Optional Follow-up):** Write a build-time converter compressing `src/levels/data/*/*.json` tile arrays into flat RLE/delta arrays (~60–75% smaller raw JSON and faster `JSON.parse`), plus dynamic-import Zone 4 (`act1.ts`, `act2.ts`, 1,029-LOC `level_builder.ts`) and boss modules inside their async scene factories.

### 3.3 Repo Hygiene
- Update GitHub repo description to remove stale `"Godot 4"` mention (it is pure TypeScript + HTML5 Canvas 2D).
- Remove or archive unshipped `docs/art/higgsfield-preview.png` (668 KB), `tools/art/sources/emerald_source.webp` (378 KB), and old `qa/` screenshots (~1.6 MB) if not needed by active QA checks.

---

## 4. Verification Checklist

Run before opening PR (from `AGENTS.md`):
```bash
npm ci
npm run typecheck
npm test
tools/qa/originality_scan.sh .
npm run build && node tools/qa/web_check.mjs build/web && npm run smoke
npm run test:bots
```
Verify explicitly:
- Audio plays cleanly in **Safari / WebKit** (Playwright WebKit check or manual macOS/iOS check).
- Production `build/web` has **zero** `window.hpos` export and ignores `?dev`/`?zone`/`?inputs=`.
- Ranked run entry while `HubClient.reach === 'pending'` never spawns ItemBoxes.
- Checkpoint respawn on `z3_capital_mansion/act2` executes in `<16 ms` without rebuilding static tiles.
