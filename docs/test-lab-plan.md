# Test Lab plan: HPOS10I

Status: plan only, nothing built yet. This plan was written on 7 November 2026 from a read-only pass over `main` at `7b7ddfe`.
Implementer: Cursor, working on branch `cursor/test-lab`. Before changing an area, read `docs/CONTRACTS.md`, `docs/PHYSICS.md` and `qa/README.md`.

## What the lab is for

The lab is a separate page at `lab.html` in the deployed build. It shows:
- **Sproto:** every state and animation, sensor rays and radii, and every power-up and skin.
- **Enemies:** every one from zones 1–4, including the neon variants, with tiers and hurtboxes.
- **Bosses:** all four, each forced into any attack or phase, with the telegraph's landing point drawn.
- **Projectiles and objects:** all of them, plus a physics sandbox with a single-tick step.

## Owner decisions (7 November 2026, the same for every game repo)

These answers came from the owner's Q&A and apply to every game. Repo-specific sections below may add to them, but never relax them.

1. **A separate page.** The lab is its own HTML entry, `lab.html`, at the root of the built site, with its own JS bundle. The game's `index.html` must not import, link to or preload anything from the lab.
   - Measure the game's load before and after: JS bytes, request count and time to first frame. Put both sets of numbers in the PR. The game's numbers must not change.
2. **A hidden URL in production.** The lab ships in the production build at `lab.html`, relative to the game's base path.
   - Nothing in the game links to it.
   - It has `<meta name="robots" content="noindex,nofollow">`.
   - It must pass every existing production check, including banned-string scans. The repo section lists them.
3. **Desktop browser only:** keyboard and mouse. No touch layout.
4. **Automated QA.** Expose a small automation API on `window.testLab`. Never reuse an existing debug handle name. It needs at least:
   - `list()`, which returns every entity with its id, kind and animations/attacks;
   - `select(id)`;
   - `play(clipOrAttack)`;
   - `step(n)`;
   - `state()`, which returns position, velocity, state, clip, frame and HP;
   - `ready`, a promise that resolves when the current view has finished loading and drawing.

   Add a headless script (Playwright or CDP) that opens `lab.html`, visits every entity and every animation, and fails on console errors, failed requests or a blank canvas. Wire it into the repo's checks where browser checks already exist.
5. **Interaction:**
   - **Playback controls:** play, pause, step ±1 frame or tick, speed from 0.1× to 4×, scrub and loop.
   - **Live sandbox:** drive the character with the game's own controls. Show a live readout of position, velocity, facing, state, current animation and frame.
   - **Overlays:** see item 8.
   - **Spawn and fire:** spawn any enemy or boss; force any boss phase or attack; set HP; freeze AI; give any weapon, item or power-up; fire any attack on demand.
6. **Extras:**
   - **Load-time panel.** For each asset show bytes, fetch ms, decode ms and whether it came from cache; show a total per character. Load each character only when it is selected, never the whole roster up front. Use `PerformanceResourceTiming` plus timing around decode.
   - **Side-by-side compare.** Two entities, or two phases or variants of one entity, on one shared clock.
   - **Share links.** Keep all view state in the URL hash, for example `#tab=anim&id=x&clip=y&frame=12`, so a reload restores the exact view. Add a "Save PNG" button.
7. **No sim edits.** The lab is lab-only code. Do not change gameplay or sim files, or anything that changes a sim fingerprint, server bundle, replay golden or gameplay hash.
   - If the lab needs a private value, such as a collision function the game does not export, mirror it in lab code.
   - Add a unit test that fails when the mirror drifts from the source, for example by comparing outputs on sample inputs.
8. **Overlays show the game's truth plus the art's bounds.** Draw exactly what gameplay uses (hit, hurt and collision shapes; anchors; muzzle and spawn points) in one colour, and the sprite or model bounds in another, so mismatches are obvious. Also draw a grid with world coordinates.
9. **Accepted art only.** The roster lists only art the game currently uses. Pending or archived art may appear only in a tab labelled "Archive (not in game)", never in the sandbox.
10. **Isolation.** The lab never writes the player's real save, never takes tab or writer locks, never initialises the hub and never sends scores or tickets. Use an in-memory save with everything unlocked.
11. **Free-form per repo.** Fit the layout to the game. There is no shared kit across repos.
12. **Branch and PR.** Work on `cursor/test-lab`. It was created from the latest `main` with this plan committed. Commit after each phase below, and open a PR into `main` when done. Never push to `main`. Run every repo check and report any you could not run. A different agent reviews the PR.

## HPOS10I-specific rules

- **Originality scan.** `tools/qa/originality_scan.sh` scans `.ts`, `.html`, `.json` and `.md` files, and file and folder names. The lab, its labels and its docs must pass it.
  - Generic words are fine: "lab", "debug", "sandbox", "hitbox", "sprite", "inspector" and "ring".
  - Avoid any franchise, mascot, studio or console name.
  - Use `Emeralds.NAME`; never type the collectible's display name.
- **Public deploy.** Every push to `main` deploys `build/web` to GitHub Pages, so the lab will be publicly reachable at `.../HPOS10I/lab.html`. It is not linked from anywhere and carries `noindex`.
  - `lab.html` must sit at the build root. `tools/qa/web_check.mjs:61` fails if any built file is under `tests/`, `tools/`, `docs/`, `qa/` or `_raw/`.
- **Folder ownership** (`CONTRACTS.md:10-18`).
  - The Lead owns `vite.config.ts`, `index.html`, `src/core` and `src/runtime`.
  - The lab gets its own folder, `src/lab/`, and imports the other folders read-only.
  - The only edit in a Lead-owned file is the `vite.config.ts` input entry. Flag it in the PR for Lead sign-off.
  - Do not register lab scenes in the main `Scenes` registry. Otherwise `smoke.mjs` and `?dev` would pick them up in `index.html`.

## Facts this plan relies on

- **Runtime.** A Canvas2D runtime at 424×240 with nearest-neighbour scaling, running a fixed 60 Hz loop. It has `tree.physicsStep()`, `processStep()`, `timeScale`, `hitStop` and `advance(n)` (`src/runtime/tree.ts`). Sim and render are separate.
- **Player.** `src/player/player.ts`.
  - States: idle, run, skid, jump, roll, spindash, spring, hurt, dead, dropdash, peelout, airdash, plus crouching and `playPose()`.
  - Visuals: `player_visual.ts`. `wantedAnimation()` and the fallback table are at lines 397 and 429-455. Skins: golden, nobu, tidebreaker. Accessories: wizard_hat, sunglasses. Also cape and time focus.
- **Player physics.** Sensors A–F (`src/player/sensors.ts`), `getRadii()` and live `Tuning.physics` (`src/core/physics_constants.json`, hot-reloaded). Crush boxes are 38×18 standing and 28×14 rolling.
- **Shapes.** `CollisionObject2D.shapes` and `areaRects(area)` (`physics.ts:821`, marked "debug, tests") give every shape the lab needs to draw. Collision uses 9 named layers (`src/core/layers.ts`).
- **Enemies.** Registered in `src/levels/registry_enemies.ts:36-61`, with the neon variants in `src/levels/z4/neon_pills.ts`. Tiers 1–4. They work outside a LevelRoot, as `tests/levels/enemies.test.ts` shows.
- **Bosses.** `boss:rug_pull`, `boss:library_demon`, `boss:broccoli_head` and `boss:the_executive` (`src/bosses/register.ts`).
  - The attack ids are listed per boss in the analysis.
  - Phases 1–3 progress over 8 hits.
  - Signals: telegraph, attackStarted, hitTaken, phaseChanged, defeated.
  - Each boss exposes its telegraph target (`boss_base.ts:341`).
- **Power-ups.** `Moves.give('shield'|'speed_shoes'|'invincibility')`. Item boxes can also give a life. Projectiles: Pellet, Shot, PaperSheet. Objects: springs, booster, breakable wall, checkpoint, goal sign, spikes and zone setpieces.
- **Existing tools.**
  - URL flags: `?dev`, `?scene=`, `?zone=&stage=`, `?overlay`, `?accessory=`.
  - The F1 overlay covers the player only (`src/player/debug_overlay.ts`).
  - `window.hpos` exists. `src/ui/dev_menu.ts:63` lists `sandbox:*` ids that don't exist yet.
  - The physics playground is at `src/levels/playground/physics_playground.ts`.
  - The headless world helper is `tests/helpers/world.ts`.
- **Art.** Almost all art is drawn in code. The only image files are 3 tile atlases and the collectible. Sheet format: 64×64 cells, one animation per row (`CONTRACTS.md:271-279`). The lab must show today's procedural art and also pick up future `_sheet.png`/`_sheet.json` files automatically.

## Owner decisions applied here

- **Overlays.**
  - Game truth: sensor rays A–F, player radii, crush box, every enemy and boss area/shape (`areaRects`), projectile shapes, collision layers (each can be toggled and coloured), boss telegraph landing targets, and a pixel grid with coordinates.
  - Art bounds: the drawn sprite's frame rectangle.
  - Reuse the F1 overlay's drawing where it is importable read-only.
- **Boss control.** Pick a boss, jump to phase 1–3, fire any attack id, set hits left, freeze its AI, show the telegraph, and step one tick at a time.

## Tabs

1. **Sproto:** every state and named animation, with playback controls and frame stepping at the Physics Guide rates. Pickers for skin and accessory, cape and time focus. Buttons to give each power-up.
2. **Enemies:** each enemy at each tier, idle, with hurtbox and projectile shapes. Buttons to force its attack or script states where they exist.
3. **Bosses:** the arena with Sproto, phase and attack forcing, and a signal log that shows telegraph, attackStarted, and so on, with tick numbers.
4. **Sandbox:** a physics-playground-style room.
   - Spawn any enemy, object, spring, item box or projectile at the cursor.
   - Drive Sproto with real input.
   - Live readout: gsp, x/y velocity, angle, mode, state, layer, path and charge.
   - Pause, step 1 tick, set timeScale.
   - Live-edit `Tuning.physics` sliders. These are lab-only and never written to disk.
5. **Levels:** load any zone and act read-only with overlays, and teleport along it. Levels load lazily, one chunk per level.
6. **Sheets:** a viewer for any `_sheet.png` + `_sheet.json`, with cell grid, anchors and per-row playback. This is for future art.
7. **Compare** and **Loading.**

## Files

- Add:
  - `lab.html` (root)
  - `src/lab/**`
  - `tests/lab/*.test.ts`. These check that every registered enemy and boss can be built in the lab host, that every boss attack id is accepted, and that the hash round-trips.
  - The lab smoke test goes in **`tools/qa/lab_smoke.mjs`**. QA tools live there and never ship.
- Edit:
  - `vite.config.ts`: add `build.rollupOptions.input = { main: 'index.html', lab: 'lab.html' }`. This needs Lead sign-off.
  - `README.md`: a short section on the lab.
- Do not touch: `src/runtime`, `src/core`, `src/player`, `src/levels`, `src/bosses` (read-only imports only), `tools/qa/originality_allow.txt` (unless pinned vendor lines move) or `index.html`.

## Phases

1. Skeleton. Wire the entry and input, and give the lab its own `tree` instance on its own canvas. Do not call `HubClient.init()` and do not write saves. Compare the main chunk size before and after, because Vite may re-split shared chunks.
2. The Sproto and Enemies tabs, with overlays.
3. The Bosses tab, with forced attacks and the signal log.
4. The Sandbox and Levels tabs, with tuning sliders.
5. Sheets, Compare, Loading, PNG export, `window.testLab`, the smoke test, the README and the PR.

## Acceptance

Every gate check passes:
- `npm ci`
- `npm run typecheck`
- `npm test`
- `tools/qa/originality_scan.sh .`
- `npm run build && node tools/qa/web_check.mjs build/web && npm run smoke`
- `tools/qa/lab_smoke.mjs`

Beyond the checks:
- Every enemy, at every tier, and every boss attack in every phase runs in the lab with no console errors.
- `index.html` behaves exactly as before. Smoke still lists only the game's scenes.

## Cursor prompt

The owner pastes this into Cursor:

```text
You are working in the HPOS10I repo (crrreatorrr/HPOS10I). Check out the existing branch `cursor/test-lab`. It was created from the latest `main` and already contains `docs/test-lab-plan.md`.

1. Read `AGENTS.md`, `docs/CONTRACTS.md`, `docs/PHYSICS.md` and `qa/README.md`, then read `docs/test-lab-plan.md` in full. That plan is the spec. It records the owner's answers, so follow it exactly and don't re-ask anything it already settles.
2. Build the Test Lab phase by phase as the plan lays out, and commit after each phase. The lab is a separate, unlinked `lab.html` page with `noindex` and its own bundle. It loads each character only when that character is selected. It ships hidden in the production build.
3. Repo-specific hard rules:
   - Everything you write, including labels, code, file names and docs, must pass `tools/qa/originality_scan.sh .`: no franchise, mascot, studio or console names. Use `Emeralds.NAME`.
   - `lab.html` goes at the build root, because `web_check.mjs` rejects built files under `tools/`, `tests/`, `docs/` or `qa/`. The lab smoke script lives in `tools/qa/`.
   - Lab code goes in `src/lab/`. The only edit to a Lead-owned file is the `vite.config.ts` input; flag it in the PR for Lead sign-off. Don't register lab scenes in the game's `Scenes` registry.
   - Every push to `main` deploys publicly, so the lab must be unlinked and carry `noindex`.
4. Never write the real save, never take tab or writer locks, and never initialise the hub. Use `window.testLab` as the automation handle.
5. When done, run: `npm ci`, `npm run typecheck`, `npm test`, `tools/qa/originality_scan.sh .`, `npm run build && node tools/qa/web_check.mjs build/web && npm run smoke`, and `tools/qa/lab_smoke.mjs`. Then open a PR from `cursor/test-lab` into `main` titled "Add Test Lab (lab.html)". In the PR, report:
   - the game page's load numbers (JS bytes, request count, time to first frame) before and after;
   - the result of every check, and any check you could not run, with the reason;
   - every place you mirrored private code, and the drift test that guards it.
6. If part of the plan can only be done by breaking one of these rules, stop and ask me rather than editing a protected file.
```
