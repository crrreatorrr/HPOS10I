# Handoff status: HPOS10I optimization pass

Branch `claude/happy-pasteur-0dhfzp` (main + `CLAUDE_HANDOFF_OPTIMIZATION.md` + `CLAUDE_SESSION_BRIEF.md`).
No pull request opened, nothing pushed to `main`, no deploys.

## Items

### Phase 0 (§1, P0)
- §1.1 Silent audio on Safari / iOS — **done** (c62c4b9, 41f163e, 7b7eff9). Every Ogg file has an AAC twin
  (`audio/**/*.m4a`, `audio/tools/make_m4a.sh`: ffmpeg `aac`, 96 kbps music, 128 kbps SFX); `src/core/audio.ts`
  picks the format with `canPlayType('audio/ogg; codecs="vorbis"')` and retries a file in the other format when
  `decodeAudioData` refuses it. All 74 files decode in Chromium; music loop lengths are unchanged (title 16.000 s,
  z1 25.600 s), mean loudness within 0.6 dB. AAC pads short SFX by ~30 ms of silence at the tail, and a few
  square-wave SFX peak higher after AAC (menu_select -5.8 → -0.2 dBFS, no clipping in float Web Audio).
  `web_check` now requires an AAC twin for every Ogg file; checklists updated. Not verified on real Safari/iOS
  (no WebKit here): the smoke test simulates the Safari path by refusing Ogg in `canPlayType`.
- §1.2 `window.hpos` and dev/TAS URL options in production — **done** (41f163e). `__HPOS_TEST_HOOKS__` define:
  true under `vite` (serve), Vitest and `HPOS_TEST_BUILD=1`; false in `npm run build`. Production honours only
  `?touch`, `?mute`, `?overlay`. `web_check` fails a production build containing `.hpos=`, the timeline loader
  or the hooks marker; the smoke test boots the production build with `?dev&scene&zone&inputs` and checks there
  is no `window.hpos` and no timeline fetch, then builds its own test build in `build/web-test` for the rest.
  `tests/core/dev_args.test.ts` covers the argument filter. §1.2.4 (replay payload for server verification):
  **skipped**, needs a server-side verifier in metaverse-hub.
- §1.3 Ranked/Relic boot race — **done** (161fce9). While a hub *visit* is pending (`reach === 'pending'` and a
  portal ticket or live session), `extras_allowed` is false (no item boxes, no extra moves). A stage start during a
  pending visit waits for init, capped at 1.5 s (`SceneRouter.beforeStage` → `HubClient.whenSettled`). If the cap
  hits, Golden Sproto's life is granted once init answers. Plain page loads (never Ranked) are unaffected.
  Tests: `tests/hub/ranked_race.test.ts`.

### Phase 1 (§2, §3.1, §3.2)
- §2.1 `exitToHub()` save race and double navigation — **done** (647d0b3). Awaits `save.flush()` capped at 500 ms,
  then navigates once: `sdk.exit()` when a session is live (it closes the session and navigates), else
  `location.assign`. Game-side only; no dependency on the unmerged SDK keepalive. Tests: `tests/hub/exit_to_hub.test.ts`.
- §2.2.1 `loadoutFrom()` — **done** (c4cebc0). Never reads `.loadout` off SDK 0.8.0's `items: string[]`; reads a
  top-level `loadout` object or an object-shaped `items.loadout`. 0.8.0 sends neither (no loadout in its
  `InitResult`, none in the org's code search), so slots stay a local choice as before.
- §2.2.2 `outbox_repair.ts` — **done, removed** (c4cebc0). Proof it is obsolete: SDK 0.8.0 `drain()`
  (`vendor/hub-sdk/dist/live.js:370-424`) sends each queued row independently ("No single row fails init") and
  `transmit()` drops final refusals (`finalRefusal()`, lines 142-156, which names `amount_over_rule`). It also no
  longer delays hub init (it waited up to 1.5 s on IndexedDB, which now matters because a stage start waits for
  init). Not re-proven end to end here: `npm run e2e:hub` step 7 covers exactly this case and needs the hub stack.
- §2.2.3 `HubClient.effects` unused — **done** (c4cebc0), removed.
- §2.2 remove `vendor/hub-sdk/dist/hub-sdk.iife.js` — **skipped**: vendored by metaverse-hub's
  `scripts/vendor-sdk.mjs`, and `tools/qa/originality_allow.txt:31-33` pins lines in it; it is not bundled
  (`@hub-sdk` resolves to `dist/index.js`). Belongs to the next re-vendor.
- §3.1.1 boot preload — **done** (c9ecd48). Boot waits for the menu backdrop layers and Sproto's sheet (what the
  title and zone select draw on frame 1), not the floor-hazard and Zone 4 atlases. The handoff's claim that the
  title art was not loaded at boot was half right: it was fetched, just not awaited.
- §3.1.2 level art before mount — **done** (c9ecd48). `levels/common/level_preload.ts`: zone tile atlas, terrain
  materials, backdrop layers, props/pills/hazard sheets, zone accessory, Zone 4 atlas, boss sheets, capped at 2.5 s.
  PNGs arriving after a level was already showing: 3-8 per level before, 0 after (Z1-Z4 acts and two arenas).
- §3.1.3 SFX deferral — **done** (c62c4b9). Only `menu_move`/`menu_select` at boot; the rest at the unlock
  gesture (or at once when the browser starts the context unlocked).
- §3.2.1 numeric tile keys — **done** (4d0661c). Same shapes, flags, order and bounds as the original
  (`tests/levels/tile_geometry.test.ts`).
- §3.2.2 skip buried tiles in `polyGrid` — **skipped**: buried tiles answer `intersectPoint` (that is why they
  keep their polygon), so dropping them changes physics. `mergeEdges()` O(N log N) — **done** (e396a18), exact
  same output and order as the original on every tile level and 300 random sets (`tests/physics/merge_edges.test.ts`).
  In-game, buried tiles never reached `mergeEdges()`, so the quadratic case was milder than the handoff says
  (~90 ms, not seconds); the reference version takes 7-14 s on the same levels when buried tiles are included.
- §3.2.3 respawn geometry cache — **partial** (4d0661c, e396a18). Not the handoff's in-place reset (that would
  change how a respawn resets every entity, a gameplay risk). Instead: tile shapes are shared per (cells,
  tileset), `PhysicsWorld` reuses a merge group's last result when shapes/flags/transforms are identical
  (indexed in the same order, so queries answer as after a fresh merge: `tests/physics/merge_cache.test.ts`), and
  the last layer's pre-rendered chunks are reused. Z3 Act 2 restart: longest main-thread task 125-225 ms →
  50-66 ms; Z2 Act 2 121-154 → 0-51 ms (Chromium reports long tasks only above 50 ms). Not the `<16 ms` target:
  what remains is spread over re-indexing ~90k tile polygons, entity rebuilds and GC.
- §3.2.4 compact tilemap encoding — **done** (4cc5fcd). Build-time transform (`vite.config.ts` plugin,
  `levels/common/cell_codec.ts`); source JSON unchanged; round trip tested on every level. Dynamic import of
  Zone 4 acts — **done** (73219b5, -9 KB from the boot bundle). `level_builder.ts` stays in the boot bundle
  because `z4/zone.ts` (imported at boot for its ids) imports it, and boss modules stay static — **skipped**,
  small gain for the churn.

### Phase 2 (multiplayer and online)
- Nothing for this repo: the handoff has no multiplayer items for HPOS10I, and the brief lists none.

### Phase 3 (§3.3 repo hygiene) — proposals only, nothing deleted
None of these ship: `web_check` already fails a build containing `docs/`, `tools/`, `qa/` or `tests/` files, and
the build is 161 files of runtime assets. They only cost clone size. For the owner to decide:
- `docs/art/higgsfield-preview.png` (684,103 B) — referenced by nothing in the tree (added in a138471 "Refresh
  HPOS10I art with Higgsfield Unlimited"). **Proposal: delete** or move to the art archive outside git.
- `tools/art/sources/emerald_source.webp` (387,558 B) — the director-supplied source of the emerald icon, cited as
  provenance in `prompts.md` row 3. **Proposal: keep** (it is the originality record for that asset).
- `qa/reports/evidence/**` (1,534,400 B for all of `qa/`, ~25 PNGs) — linked from 10 QA reports, which
  `qa/README.md` keeps as history. **Proposal: keep**, or move to a release asset if clone size matters.
- `vendor/hub-sdk/dist/hub-sdk.iife.js` (~237 KB) — not bundled; drop it in metaverse-hub's vendor script at the
  next re-vendor and update `tools/qa/originality_allow.txt` then.
- GitHub repo description still says "Godot 4" — **not changed**: it is a live repository setting. The owner can
  change it in the repo's settings (it is pure TypeScript + Canvas 2D now).

## Final review (`/code-review medium` on `origin/main...HEAD`)
Fixed:
- Exit to Hub could still navigate twice on a double press within the 500 ms wait, and the pause menu's exit let
  the game run during it — fixed (be66c03): presses join the in-flight exit; `tree.suspended` holds the game
  still until the page leaves (given back after 3 s if it never does).
- Merge cache compared shape identity and flags but not geometry — fixed (7c32d60): per-shape geometry hash.
- Respawn caches outlived the level (tile geometry per level for the whole session, chunk pictures, merges) —
  fixed (7c32d60): single entry, released when a menu scene takes over.
- Audio fallback fetched every file twice on a browser that claims Ogg but cannot decode it, and a missing file
  could switch the session's format — fixed (270eb0b): the first load probes, only a decode failure switches;
  smoke covers it (1 Ogg file, then AAC).
- Zone 4 atlas not preloaded for the Zone 4 boss arena — fixed (c86c210).
Not changed:
- A tab opened before a deploy can fail to import a Zone 4 act chunk: true of every level already (z1-z3 levels
  were dynamic chunks before this work), and a failed level load falls back as before. A reload-once-on-stale-chunk
  handler would be a separate change.
- `?overlay` in `PRODUCTION_ARGS`: harmless; the debug overlay reads `location.search` itself, so production does
  honour it, as the comment says.

## Checks

| Check | Phase 0 | Phase 1 | Final (after review fixes) |
|---|---|---|---|
| `npm ci` | pass | pass | pass |
| `npm run typecheck` | pass | pass | pass |
| `npm test` | pass: 855 passed, 1 skipped (baseline 845) | pass: 881 passed, 1 skipped | pass: 884 passed, 1 skipped |
| `tools/qa/originality_scan.sh .` | pass: 0 hits | pass: 0 hits | pass: 0 hits |
| `npm run build && node tools/qa/web_check.mjs build/web` | pass | pass | pass |
| `npm run smoke` | pass: 19 scenes, production-hooks check, play path, feedback, Ogg and AAC audio paths | pass | pass (+ Ogg-decode-failure case) |
| `npm run test:bots` | pass (11 tests) | pass (11 tests: every act, item boxes on and off, timeline replays) | pass (11) |
| `npm run e2e:hub` | not run: needs the metaverse-hub Nakama stack (docker) | not run | not run |
| Real Safari / iOS audio | not run: no WebKit in this container; simulated in smoke | — | — |

## Measurements

Boot = page load until the boot screen hides, plus 1.5 s on the title, in headless Chromium with the
AudioContext held suspended until a gesture (as real browsers do). Script:
`node measure.mjs <build dir>` (kept outside the repo).

| | baseline (main) | after Phase 0 | after Phase 1 |
|---|---|---|---|
| `build/web` bytes | 9,273,675 (122 files) | 11,424,798 (159 files; +2.15 MB AAC twins, one format is fetched) | 9,716,215 (161 files) |
| web_check gzip estimate | 4.31 MB | 6.46 MB (budget 12) | 5.66 MB |
| boot requests | 43 (28 audio, 13 PNG) | 17 (2 audio) | 15 (2 audio, 11 PNG) |
| boot bytes | 1,141 KB | 903 KB | 677 KB |
| largest level chunk (Z3 Act 2) | 1,499,987 B / 261 KB gzip | same | 950,256 B / 16 KB gzip |
| boot JS bundle | 620,705 B | 624,992 B | 618,419 B |
| PNGs arriving after a level is showing | 3-8 per level | same | 0 |
| Z3 Act 2 restart, longest task | 125-225 ms | same | 50-66 ms |
| Z3 Act 2 tile build / merge (Node) | 196 ms / ~100 ms each load | same | 8 ms / cached merge on respawn |

Scripts (kept in the session scratchpad, not the repo): `measure.mjs` (boot and act-entry requests, AudioContext
held suspended until a gesture), `popin.mjs` (resource timing vs the moment a level shows), `respawn.mjs`
(`PerformanceObserver` long tasks around `router.restart()`), `profile.mjs` (CDP CPU profile of three restarts).

## Cross-repo follow-ups
- Run `npm run e2e:hub` against the metaverse-hub Nakama stack: it now builds with `HPOS_TEST_BUILD=1`, and its
  step 7 is the end-to-end proof that SDK 0.8.0 handles the undeliverable queued earn `outbox_repair.ts` used to.
- metaverse-hub re-vendor of hub-sdk (not done here, per the brief): drop `dist/hub-sdk.iife.js` from the vendored
  files and update `tools/qa/originality_allow.txt` line pins; re-check `loadoutFrom()` if the SDK adds a loadout
  to `InitResult`.
- Check on a real iOS device and in desktop Safari that music and effects play (AAC path).
- metaverse-hub: the hub's `fetch:games` downloads the `web-build` artifact, which is the production build and so
  has no `window.hpos`. Anything in the hub that drove `window.hpos` must use a `HPOS_TEST_BUILD=1` build.
- metaverse-hub: §1.2.4 server-side replay verification of `hpos10i_act_time` submissions.
