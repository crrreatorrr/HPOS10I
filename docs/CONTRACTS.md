# System contracts

How the parts of HPOS10I talk to each other. Every agent builds against this
file. Owned by the lead; agents request changes in their report.

## Ownership

Each agent works on its own branch and only touches its own folders.

| Owner | Folders |
|---|---|
| Lead | `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `public/`, `.github/`, `src/main.ts`, `src/runtime/`, `src/core/`, `src/hub/`, `src/levels/content.ts`, `src/levels/scenes.ts`, `docs/`, `README.md`, `AGENTS.md`, `tools/lead/`, `tests/core/`, `tests/hub/`, `tests/gameplay/`, `tests/helpers/` |
| Physics agent | `src/player/`, `src/camera/`, `src/terrain/`, `src/levels/playground/`, `tests/physics/`, `tests/player/` |
| Level agent | `src/levels/` (except the lead's files above), `tests/levels/` |
| Boss agent | `src/bosses/`, `tests/bosses/` |
| Art agent | `assets/`, `tools/art/`, `prompts.md` |
| UI/audio agent | `src/ui/`, `audio/`, `ui/font/`, `tests/ui/` |
| QA agent | `qa/`, `tools/qa/`, `tests/qa/` |

Other agents' folders are **read-only** to you. The QA agent reads
everything and changes nothing outside its folders: bugs go back to the
owning agent. If you need a shared-file change (a physics constant, an input
action, a runtime feature, a collision layer, a change to this file), do not
edit it: write a local fallback marked `// LEAD-REQUEST` and list the request
in your final report.

## Conventions

- **TypeScript** (strict, ES2022 modules), built by Vite, tested by Vitest.
  No game engine and no runtime dependencies: the runtime in `src/runtime` is
  ours. Two-space indent, single quotes, semicolons, no `any`.
- **Resolution:** 424×240 game pixels, 1 unit = 1 pixel, y points down.
  Integer scaling on desktop, fractional on touch. Nearest-neighbour
  everywhere; positions are rounded to whole pixels when drawn.
- **Physics tick:** fixed 60 Hz (`physicsProcess(delta)`). Gameplay speeds in
  public APIs are **pixels per frame** (classic units). Convert with
  `speed()` / `accel()` / `frames()` from `src/core/physics_constants.ts`.
  Rendering interpolates between ticks; teleports call
  `resetPhysicsInterpolation()`.
- **Physics constants:** read `Tuning.physics` every tick; never cache a
  value. Never hard-code a value that belongs there
  (`src/core/physics_constants.json`, reloaded live by the dev server).
- **Missing pieces never crash.** `assetImage(path)` returns null until an
  image loads or when it doesn't exist: draw the placeholder then. A stage
  missing from the scene registry falls back to the dev menu.
- **What ships:** `src/` (and `audio/`, `assets/`, `ui/font/src/`,
  `public/`). `tests/`, `tools/`, `qa/` and
  `docs/` never ship (`tools/qa/web_check.mjs` fails the build if they do).
- **Placeholders:** until art is approved, draw simple shapes in `draw(g)`.
  Keep them readable and on-model (docs/DESIGN.md): Sproto blue and yellow,
  enemies as pill robots, hazards orange, springs yellow and red, tickets gold.

## Runtime (`src/runtime`)

- `Node` / `Node2D` / `CanvasLayer` (`node.ts`): children, groups, meta,
  `queueFree()`; hooks `enterTree()`, `ready()` (children first),
  `physicsProcess(dt)` and `process(dt)` (tree order, parents first;
  `processPriority` lower runs earlier), `input(ev)` (menus) and `draw(g)`.
  `Node2D`: `position`, `globalPosition`, `rotation`, `scale`, `zIndex`,
  `zAsRelative`, `visible`, `modulate`, `showBehindParent`, `topLevel`,
  optional `cullRect()`. `ProcessMode` decides what runs while paused.
- `tree` (`tree.ts`): the scene tree and main loop: `physicsStep()`,
  `processStep()`, `advance(n)` (tests), `changeScene()`, `callDeferred()`,
  `getNodesInGroup()`, `paused`, `timeScale`, `hitStop(ticks)`, `camera`.
- `crashGuard` (`crash_guard.ts`, `tree.crash`): the main loop always
  reschedules; a frame that throws stops its remaining ticks and is counted.
  `CRASH_HALT_FRAMES` failures in a row (or a boot failure) halt the game and
  show the "Something broke" panel (`crash_panel.ts`). Window `error` /
  `unhandledrejection` are counted but only extend a streak that a failing
  frame started; browser noise and other origins' scripts are ignored, and
  the events are never `preventDefault`-ed. The guard writes at most
  `CRASH_LOG_LIMIT` console lines and hands each new frame error once to
  `reportError`, so page-error checks still see it. `onCrash(fn)` is the hook
  for an opt-in crash reporter; nothing is sent anywhere by default.
- `PhysicsWorld` (`physics.ts`, `tree.physics`): `StaticBody2D`,
  `AnimatableBody2D`, `Area2D` with rectangle, circle and polygon shapes on
  collision layers. Rays (`intersectRay`) only hit surfaces facing them;
  tile edges shared by neighbours are merged away; moving bodies are seen by
  rays where they were at the end of the last tick. `intersectPoint` for
  point queries. Areas report `areaEntered` / `areaExited` once per tick.
- `Input` (`input.ts`), `Gfx` (`gfx.ts`), `Fonts` (`font.ts`), `Color`,
  `Vec2`, `Rect2`, `Signal`, `Rng`, `assetImage` / `assetUrl`.

## Collision layers

| Bit | Name | Used for |
|---|---|---|
| 1 | `TERRAIN_SOLID` | Ground/walls/ceilings on both paths |
| 2 | `TERRAIN_PATH_A` | Solid only while the player is on path A |
| 3 | `TERRAIN_PATH_B` | Solid only while the player is on path B |
| 4 | `TERRAIN_TOP_ONLY` | One-way platforms (land from above only) |
| 5 | `PLAYER` | Player hitbox area |
| 6 | `ENEMIES` | Enemy hurtboxes |
| 7 | `OBJECTS` | Tickets, springs, boosters, checkpoints, goal sign, item boxes |
| 8 | `HAZARDS` | Spikes, projectiles, crushers |
| 9 | `BOSS` | Boss body and weak point |

Use `Layers` (`src/core/layers.ts`) instead of numbers. Terrain is static
geometry: the tile layer (`TileLayer`) and `CurveTerrain` pieces. The player
never resolves collisions generically; it raycasts against bits 1–4.
Objects, enemies, hazards and bosses **detect the player** with their own
area (mask bit 5) and call the player API below.

## Core (`src/core`)

| Name | What other code may use |
|---|---|
| `GameState` | **Signals:** `ticketsChanged`, `scoreChanged`, `livesChanged`, `checkpointReached`, `levelCompleted`, `levelStarted(zone, act)` (fresh attempts only), `emeraldWon(zone, act)`. **Fields:** `tickets`, `score`, `lives`, `levelTime` (seconds, physics-ticked), `timerRunning`, `checkpointPosition`, `zoneId`, `act`, `emeralds`, `emeraldJustWon`. **Methods:** `addTickets`, `loseTickets`, `addScore`, `addLife`, `setCheckpoint`, `completeLevel`, `hasEmerald`, `emeraldCount`. `startLevel`, `restartFromCheckpoint`, `resetGame` and `loseLife` belong to SceneRouter. |
| `Emeralds` | One per act of every zone (8). `Emeralds.NAME` is the display name: a director-approved exception to the originality guardrails, allowlisted for one line of `src/core/emeralds.ts` only, so always show it through `Emeralds.NAME` and never write the word elsewhere. `icon(small)`, `total()`, `allKeys()`, `key()`, `isEmeraldAct()`. |
| `SceneRouter` | `goTitle()`, `goZoneSelect()`, `startZone(id, stage)`, `nextStage()`, `respawn()` (takes a life, except in free scenes), `restart()`, `openScene(id)`, `inGameplay()`, `currentZone()`; `zoneId`, `stage` (1-based; the boss is acts + 1), `freeScene`, `currentId`; `stageStarted`, `sceneChanged`. Only the first scene change per frame takes effect. |
| `Scenes` | The scene registry: `register(id, factory)` (factories may be async), `exists`, `ids`. Menu ids: `main` (dev menu), `title`, `zone_select`, `game_over`, `ending`. Stages: `level:<zone>/<act>`, `level:test_zone`, `boss:<id>`, playgrounds `playground:<name>`. |
| `ZoneRegistry` | `allZones(includeTest)`, `getZone(id)`, `stagePath(id, stage)` (a scene id), `nextZoneId(id)`, `isReleased(id)`. Zone: `id`, `name`, `acts`, `boss`, `accessory`, `music`. |
| `Tuning` | `physics: PhysicsConstants`; read it every tick. |
| `Settings` | Player options: `extraMoves`, `itemBoxes`, `screenShake`, `speedEffects`, `muted`. |
| `Audio` | `playSfx(name)`, `playMusic(name)`, `stopMusic()` (see Audio). |
| `Dev` | `args` (URL options), `play(timeline)`, `sendAction(action, pressed)`. |
| `Difficulty` | See "Difficulty". |

**Input actions** (`src/runtime/input.ts`, bound by physical key position):

| Action | Keyboard | Gamepad (standard mapping) | Notes |
|---|---|---|---|
| `move_left` / `move_right` | Left/Right, A/D | D-pad, left stick | stick deadzone 0.45 |
| `move_up` / `move_down` | Up/Down, W/S | D-pad, left stick | deadzone 0.75, so 45° diagonals read as horizontal |
| `jump` | Z, X, C, Space, K | A, B, X, Y | |
| `pause` | P, Enter, Esc | Start | |
| `focus` | F | LB | Time Focus (Duelist cape) |
| `debug_overlay` | F1 | | |
| `ui_*` | arrows, Enter, Space, Esc | D-pad, A, B | menus |

"Just pressed" is per consumer clock: the first physics tick after a press
(gameplay), or the first rendered frame (menus). Key names in UI text come
from the bindings, never hard-coded.

**Dev URL options:** `?scene=<id>`, `?zone=<id>&stage=<n>`, `?inputs=<name>`
(a timeline from `tests/**/inputs/`, dev server only, or a URL), `?dev`
(dev menu), `?touch`, `?overlay` (F1 open), `?mute`, `?start=<x>` and
`?accessory=<id>` (physics playground). Input timeline:
`{"events": [[frame, action, pressed], ...]}`; frame 0 is the first tick the
target scene runs. `window.hpos` exposes the tree, router and state for bots
and the smoke test.

## Player (`src/player`)

`Player` (`player.ts`), in group `player`. Its hitbox is an `Area2D` on
layer 5. Public API (pixels per frame, Physics Guide degrees):

```ts
static fromArea(area): Player | null
groundSpeed; velocity; groundAngle; grounded; collisionMode; state; facing
// state: 'idle' | 'run' | 'skid' | 'jump' | 'roll' | 'spindash' | 'spring' | 'hurt' | 'dead' | 'peelout'
stateChanged; hurtTaken; died; shieldLost
isAttacking()          // jump/roll/spindash, or invincible: touching an enemy destroys it
isInvincible()
hurt(sourcePosition)   // shield absorbs it; else knockback, scatter tickets, or die at 0
kill()                 // pits, crush, time over
bounceOff(targetY, reverseX = false)   // bosses pass reverseX = true
launch(velocity)       // springs; not attacking
pushGround(speed, lockFrames = 16)     // horizontal springs, boosters
setControlLock(n); setCollisionPath(p); freeze(b); playPose(p); respawnAt(pos)
clampRect              // non-empty: kept inside (autoscroll); crushed against a wall = kill()
collisionPath; controlLock; crouching; spindashCharge; getRadii(); canCollectTickets()
moves                  // power-ups: give('shield'|'speed_shoes'|'invincibility'), shield,
                       // speedShoesFrames, invincibilityFrames, peelOutCharge()
```

The player reads `SceneRouter.currentZone().accessory` (`''`,
`'wizard_hat'`, `'sunglasses'`) for the accessory overlay. Visuals and the
ticket scatter attach through `PlayerHooks` (`visuals_setup.ts`).
Scattered tickets and placed tickets both call `GameState.addTickets(1)`,
`Audio.playSfx('ticket')` and `Effects.ticketSparkle(at, parent)`.

**Extra moves** (`moves.ts`): drop dash, charge run and shield bounce, with
the player's option on and never in Ranked. With them off, the physics are
exactly the classic model (docs/PHYSICS.md); the tests run that way.

## Terrain (`src/terrain`)

- `CurveTerrain` (static body): collision and placeholder visuals for a
  loop arc, quarter pipe, ramp, free curve or block; path layer (both / A /
  B) and top-only.
- `PathSwitcher`: sets the player's path when his centre crosses it.
- `TerrainLoop` (`loop.ts`): a ready-made loop with its switchers and the
  `LoopGuard`. Levels set the radius.
- `TileLayer` (`src/levels/common/level_nodes.ts`): 16×16 terrain tiles
  from the zone tileset (`src/levels/data/tilesets/<zone>.json`, atlas
  `assets/tiles/<zone>_tiles.png`), merged collision edges,
  pre-rendered 256 px chunks.

## Moving terrain

- Moving platforms and solids extend `MovingBody`
  (`src/levels/common/moving_body.ts`) on the terrain bits, move only in
  `physicsProcess` by calling `moveTo()` every tick, and expose
  `platformDelta()` (having it marks a body as moving terrain).
- The player is carried by the body's motion over the last tick while
  standing on it; ground speed is never changed. A jump of more than 64 px in
  one tick is a reset and doesn't carry him.
- **Lift-off:** a platform that drops faster than his sink speed + gravity +
  4 px in one tick leaves him falling.
- **Conveyors:** a static terrain body with meta `conveyor_speed` (px/frame,
  + is right) adds it to his motion while grounded on it.
- **Crushing:** `kill()` when his centre is inside a moving body; when the
  free span between the nearest solids (one of them moving) is shorter than
  his hitbox by more than 1 px (38×18 standing, 28×14 rolling); or a
  platform lifts him into a ceiling. Touching is never a crush. Crushers
  telegraph for `Difficulty.telegraph(base, local)` (never under 0.35 s).
- Level-building rules (QA-measured): descending ridden platforms ≤ 6
  px/frame; leave ≥ 39 px vertical (≥ 29 in roll tunnels) and ≥ 19 px
  horizontal clearance where crushing isn't intended; conveyors show their
  direction; one-way moving platforms use `TERRAIN_TOP_ONLY`; never a
  checkpoint or PlayerStart on a moving platform.

## Camera (`src/camera/game_camera.ts`)

`GameCamera`, in group `game_camera`, follows the `player` group.

```ts
static current(): GameCamera | null
setLevelBounds(rect); lockTo(rect, seconds = 0.5); unlock(seconds = 0.5)
startAutoscroll(speedPxPerSecond); stopAutoscroll()
shake(strengthPx, seconds)   // off when Settings.screenShake is off
viewRect()
```

## Levels (`src/levels`)

- Every act scene's root is a `LevelRoot` (`common/level_root.ts`) with
  children `PlayerStart` (marker), `Bounds` (camera limits; below its bottom
  edge = death pit), and any structure for `Terrain`, `Objects`, `Enemies`.
  `LevelRoot` spawns the player (at the checkpoint if any), the camera, the
  HUD (`LevelHooks.hud`) and the backdrop (`LevelHooks.backdrop`); kills him
  below Bounds; after `Player.died` (about 1 s after `kill()`) waits about 1 s
  more and calls `SceneRouter.respawn()` once. After the goal sign or a boss
  it shows the tally (`LevelHooks.tally`, signal `finished`), then
  `SceneRouter.nextStage()`. `progressAt(x)` (0 at PlayerStart, 1 at the
  goal), `completeLevel()`, `getBounds()`, `LevelRoot.find(node)`.
- Level data: `src/levels/data/<zone>/<act>.json`, a node list with typed
  values, one node (or one row of tiles) per line. It was converted once from
  the original scene files and is now the source of truth.
  Node types are registered by their original scene path in
  `LevelTypes.register(key, factory)` (`common/level_loader.ts`); new types
  use `hpos://...` keys. A type implements `applyProps(p: Props)`.
  New acts can be written in code with the level builder
  (`src/levels/builder/`).
- Added to every act at runtime (`src/levels/content.ts`): item boxes along
  the route (off in Ranked and by option), the 10:00 time limit, impact feel.
- Backdrop: 4 parallax layers (scroll 0.1 / 0.3 / 0.6 / 0.9) from
  `assets/backgrounds/<zone>/1_far.png` … `4_near.png` when they exist,
  placeholder layers drawn in code otherwise.
- Enemy base: `Enemy` (`enemies/enemy_base.ts`). On contact, if
  `player.isAttacking()` the enemy dies (+100 score, `enemy_pop`) and calls
  `player.bounceOff(y)`; otherwise `player.hurt(position)`.

## Difficulty (`src/core/difficulty.ts`, `docs/LEVELS.md`)

Every act is built to the curve in docs/LEVELS.md. `Difficulty.current()`
gives D (0 for the test zone, 1..8 across the acts; a boss its own value).
Enemies and bosses scale with `speedMult()`, `intervalMult()` and
`telegraph(seconds)` at their local difficulty
`Difficulty.local(LevelRoot.progressAt(x))` (the `Enemy` helpers
`moveSpeed`, `intervalFrames`, `telegraphFrames` do it). Never hard-code a
per-zone speed. `Enemy.tier` feeds QA's lint. Bosses read
`Difficulty.boss(zoneId)`.

## Bosses (`src/bosses`)

`Boss` (`boss_base.ts`): 8 hits, phases, hit flash, 1–2 s invincibility
after each hit, speed-up after hits 4 and 6, a telegraph before every attack,
the defeat sequence. Weak point area in group `boss_weak_point`, harmful
body in group `boss_body`; hitting the weak point while attacking counts and
calls `player.bounceOff(y, true)`. Signals `hitTaken(hitsLeft)`,
`phaseChanged(phase)`, `defeated`. Each arena (`boss:<id>`) is a `LevelRoot`
that locks the camera on entry and, on defeat, opens the gate and shows the
tally.

## Art (`assets/`)

- Sprites: `assets/sprites/<zone_id>/<name>/`, `<zone_id>` = `common` for
  shared ones.
  - `<name>_sheet.png`: 64×64 cells, one animation per row, nearest filter,
    lossless. Optional `<name>_sheet.json`:
    `{"cell": 64, "animations": {"run": {"row": 1, "frames": 4, "fps": 12, "loop": true}}}`.
    Without it the rows are `idle`, `run`, `jump`, `hurt`.
  - `anchors.json`: optional per-frame points (`head` for accessories).
- Sproto: `assets/sprites/common/sproto/sproto_sheet.png`; the feet's centre
  sits at (32, 60) in each cell. Code derives `walk` from `run`,
  `roll`/`spindash` from `jump`, `dead` from `hurt`. Relic skins:
  `golden_sproto_sheet.png`, `tidebreaker_sproto_sheet.png` (tinted base
  until they exist).
- Accessories: `assets/sprites/z2_wizard_academy/wizard_hat/`,
  `assets/sprites/z3_capital_mansion/sunglasses/`.
- Backgrounds: `assets/backgrounds/<zone_id>/1_far.png` … `4_near.png`.
- Terrain materials: `assets/terrain/<zone_id>/fill.png`, `top.png`,
  optional `side.png` (read by `CurveTerrain`).
- Raw generations go in `_raw/` folders (git-ignored).

Zone ids: `test_zone`, `z1_retro_rush_hills`, `z2_wizard_academy`,
`z3_capital_mansion`, `z4_neon_rush_remix`, `common`.

## Audio (`src/core/audio.ts`)

`Audio.playSfx('name')`, `Audio.playMusic('name')`, `Audio.stopMusic()`.
Files: `audio/sfx/<name>.ogg`, `audio/music/<name>.ogg`. Missing = silent.
Web Audio, unlocked by the first key press, click or tap.

- **SFX:** `jump`, `roll`, `spindash_charge`, `spindash_release`, `skid`,
  `ticket`, `ticket_loss`, `hurt`, `death`, `spring`, `booster`, `break_wall`,
  `enemy_pop`, `checkpoint`, `goal_sign`, `boss_hit`, `boss_explode`,
  `boss_telegraph`, `enemy_telegraph`, `one_up`, `menu_move`, `menu_select`,
  `pause`, `tally_tick`, `emerald_get`, `item_box`, `shield`, `power_up`
- **Music:** `title`, `zone_select`, `z1`, `z2`, `z3`, `z4`, `boss`,
  `act_clear`, `game_over`

## UI (`src/ui`)

| Screen | |
|---|---|
| Title (`title`) | Shows the one-line disclaimer: "A free, non-commercial fan parody. All characters and art are original." |
| Zone select (`zone_select`) | `ZoneRegistry` + `SceneRouter.startZone()`; 8 emerald slots; Relic skin row; BACK and HUB (straight to the hub) |
| HUD | Score, time, tickets, lives, power-ups |
| Pause menu | Global overlay, only while `SceneRouter.inGameplay()`: Resume, Restart, Options, Exit to Hub (asks EXIT TO HUB? first), Quit to title |
| Hub chrome (`hub_chrome.ts`) | DOM bar over the canvas's top-right on every screen: hub Ticket balance (`HubClient.ticketText()`, `--` with no session; display only) and RETURN TO HUB (straight away from menus, asks through the pause menu mid-run) |
| Touch controls | Global overlay in touch mode; presses the normal actions |
| Tally | Emits `finished`; the emerald moment; "+N Tickets sent to the hub" |
| Game over, ending, dev menu (`main`), sound hint, rotate hint | |

## Hub (`src/hub`)

`HubClient` on the vendored `@metaverse/hub-sdk` (`vendor/hub-sdk`):
- `init()` at boot redeems `#t=` (or the tab's saved session) and reads
  Relics, Ranked and the loadout; without a server key or network the game
  plays standalone (`reach = 'offline'`).
- Every fresh act start mints a run id (UUIDv7, saved first); every clear
  banks the act's tickets with `earnTickets(n, 'level_end', runId)`, so a
  retry, a reload or a second tab never pays twice. Unacked earns are resent
  after the next successful init. Caps, key mismatches and bad requests are final.
- One `level_end` earn carries at most **20** Tickets (`EARN_MAX_PER_ACT`, the
  hub's `event_rule.max_amount`): the server refuses more with
  `amount_over_rule` and stores nothing, so an over-cap earn saved by an older
  build is resent capped with the same key. Before the SDK starts, queued earns
  that can never be delivered are cleared from its outbox (`outbox_repair.ts`),
  so one refused write can't keep every later launch offline.
- `npm run e2e:hub` checks the web build against a running hub server (the hub
  repo's `server/docker-compose.yml`): ticket redeem, earn once per attempt,
  reloads, the Relic, the board, outbox recovery and Exit to Hub.
- Every act clear reports `hpos10i.level_complete {zone, act, time}` with a
  key unique to that attempt (the server grants the HPOS10I Core and pets).
- Only Zone 1 Act 1 posts to `hpos10i_act_time` (the server keeps one time
  per player for this game and ignores unranked runs).
- The Ticket→Verse exchange is not offered: the server refuses it for this game.
- `exitToHub()`: flushes the outbox, returns to `<hubUrl>#from=hpos10i`.
- With a session, `init()` reads the Ticket balance once (`getTicketBalance`);
  earn answers update it after that. `ticketText()` is the balance, or `--`
  with no session. Read-only: nothing in the game spends or exchanges Tickets.
- `RelicLoadout.resolve()` is the only reader of Relic ownership: skins
  (Golden, Nobu, Tidebreaker), the cape, and their effects (off in Ranked),
  plus `extras_allowed` for the extra moves and item boxes.
- Saves: `localStorage` keys `hpos10i/progress.json`,
  `hpos10i/write_keys.json`, `hpos10i/relic_slots.json`,
  `hpos10i/settings.json`; imported once from the old Godot build's storage
  (`godot_migration.ts`).

## Merge gate

1. The agent finishes and reports.
2. The QA agent reviews the branch against `qa/checklists/` and writes
   `qa/reports/<NN>-<branch>.md` with a verdict and bugs by severity
   (blocker / major / minor).
3. The owner fixes blockers. QA re-checks them.
4. The lead plays the build and merges with `--no-ff` after
   `tools/lead/gate.sh` passes on a clean checkout (install, typecheck,
   originality, tests, build, web check, smoke). CI repeats every check
   before deploying.

## Before you report back

1. `npm run typecheck` and `npm test` pass.
2. `tools/qa/originality_scan.sh .` is clean.
3. `git diff --name-only main...HEAD` lists only your folders.
4. Commit in small steps with clear messages on your branch.
5. Report: what you built, how to run it, what to check by hand, known gaps,
   any `LEAD-REQUEST`s.
