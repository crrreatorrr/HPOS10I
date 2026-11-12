# Gameplay improvement plan

## 1. Status

Implemented on branch `claude/trusting-ramanujan-63h582` (2026-11-11), except as listed here.
Sections 2 to 10 are the plan as written and describe the game before the work.

- Done: A1 to A7, B1 to B3, C1 to C5, D1, and D4 and D5 for Zones 1 to 3.
- B2 rides the existing EXTRA MOVES option instead of a row of its own.
- A6 also keeps item boxes 384 px from pits and 512 px before a climb, and gives Zone 4 no speed
  shoes; with that the Zone 4 route pilot finishes both acts with the shipped hooks on.
- A7: the Zone 4 Act 1 ram drops only on a player who stays in its lane for 1.5 s.
- 4b applies to new saves only: a save from before progress v2 keeps every act open.
- D2 and D3 were built, failed QA and were cut back. Holding a direction cannot climb a 1:2 slope
  from rest, and without the hurdle blocks and stairs the runner bots walked into every enemy.
  What remains: the staircases that go DOWN in Zone 2 are 1:2 ramps (nine in all). Up-stairs,
  hurdle blocks, lifts and enemy positions are as before. Zone 3 Act 1 has no ramps: with them
  the bots cleared it faster than Zone 2 Act 2, which the bot test forbids.
- Not done: Zone 4 checkpoints and the Zone 4 Act 2 route share (D4, D5 for Zone 4), D6, the
  recomputation of the pars (C2 keeps the plan's values) and re-recording `tests/levels/inputs/`.
- Not reached: the sloped-floor, blocking-step and pilot pace targets for Zones 2 and 3.
- Decisions taken as recommended: 1b, 2b, 3b, 4b, 6. Decision 5 (the emerald's name) is unchanged.

- First audit: 2026-11-09, commit `85fb306`.
- Re-validated: 2026-11-11, commit `a1041ad` (seven commits later: new sprite and level art,
  boss animation, and the new floor hazards and ceiling rams). Every finding, table and plan item
  below was re-checked against `a1041ad`; line numbers and values are for that commit. Section 4
  ends with what changed between the two commits.
- Scope: how the game plays (feel, camera, levels, bosses, rewards, onboarding). Art, audio
  production and hub server work are out of scope except where they block a gameplay item.

Units used throughout: speeds are pixels per frame at 60 Hz (px/f), as in `docs/PHYSICS.md`. A
"screen" is 424 px, the view width (`VIEW_W` in `src/runtime/tree.ts:19`).

## 2. How this was audited and how far to trust it

| Method | What was done | Trust |
|---|---|---|
| Browser play | Dev server, headless Chromium at 848×480, synthetic keys, screenshots, state read through `window.hpos`. Played title → zone select → Zone 1 Act 1; held right for 8–10 s in Z1A1, Z2A1, Z2A2, Z3A1 and Z4A1; one spin dash; the Zone 1 boss arena; three forced deaths to game over; the pause menu. No console errors or warnings in any run. At `a1041ad` the hold-right runs in Z1A1, Z2A1 and Z4A1 were repeated with the same results; the rest was not replayed. | Observed, but short and scripted. |
| Unit tests | `npm test`: 40 files, 706 tests, all pass at `a1041ad` (39 files, 695 tests at the first audit). | High. |
| Column scan | All 8 acts, see below. | Measured; the step count is a proxy. |
| Playtest bots | The repo's QA bot on the six acts that have a level file; the Zone 4 route pilot on both Zone 4 acts. All repeated at `a1041ad`. | Measured; bots are not people. |
| Reading | Bosses 2–4, most enemies, the hub client and save. | Read only. |

Not verified: audio, gamepad and touch, performance on real devices, how the game feels to a
person at 60 Hz, a full Zone 4 playthrough in the browser, bosses 2–4 in play, the new hazards
in the browser (they were read, and measured only through the bots), and the full
`npm run test:bots` run (started, then stopped because seven bot variants per act took too long).
Whether `test:bots` passes at this commit is unknown.

The measurement scripts were throwaway and are not committed. To repeat them:

**Column scan.** Build each act headlessly the way `tools/qa/level_lint.ts` does (`prepare()`,
which stops moving terrain and takes it off the collision layers), then call `scan()` on the
level bounds: one column every 2 px, loop footprints skipped. Use only columns between
`PlayerStart` and the goal sign. Per column:

- **Stacked routes**: count floors with at least 28 px of clearance that are at least 64 px below
  the previous counted floor (the lint's own `BALL_HEIGHT` and `ROUTE_GAP`). A column with two
  or more counts as "two stacked routes".
- **Sloped**: any floor whose angle is between 8° and 80° from flat.
- **Pit**: no floor at all. Consecutive pit columns are one pit; pit width × 2 px gives screens.
- **Blocking step**: the lowest floor is 16–96 px higher than the lowest floor of the column
  before it. This is a proxy: where the route runs on an upper floor it misses steps there.
- **Loops**: `TerrainLoop` nodes. **Checkpoint gaps**: distances between start, each checkpoint
  (`findCheckpoints()`) and the goal.

Zone 4 acts are built in code, so build them with `buildAct1().build()` and `buildAct2().build()`
from `src/levels/z4/`.

**QA bot.** `playAct()` from `tools/qa/playtest_bot.ts`, item boxes on (the default setting):

- *Pilot bot*: policy `pilot`, `jumpEvery` 0, 30,000 frames allowed.
- *Naive bot*: policy `runner`, `jumpEvery` 90 (holds right, hops every 1.5 s, jumps when
  blocked, spin dashes after 2 s without progress), 20,000 frames allowed.

"Pace" is route length in pixels divided by frames to the goal. "Airborne" is the share of frames
the bot spent in the `jump` state (`stateFrames.jump`).

**Zone 4 route pilot.** `flyPilot()` from `src/levels/builder/route_pilot.ts` with every enemy
present, respawning at checkpoints. The numbers in this document are the ones
`tests/levels/z4.test.ts` prints for its "full run" (run that file with the verbose reporter and
console output on). That test does not register the item-box hook, so those runs have no item
boxes. It is a different pilot from the QA bot, so the times are not comparable. Running the same
pilot with `registerNewContent()` called first (item boxes, time limit and hit-stop on, as in the
shipped game) gave very different results; see F17.

## 3. What already works and should be kept

- **Physics exactness.** `docs/PHYSICS.md` audits 63 rules; `tests/physics/reference.test.ts`
  holds the real controller to an independent model to 1/256 px over 17 scenarios. Nothing in
  this plan changes a classic rule with the extra options off.
- **Anti-tunnelling.** Movement is sub-stepped (at most 8 px), and tests cover a wall at 16 px/f
  and a fast fall. No clipping was seen.
- **Telegraph rules.** Enemies and bosses use `telegraphFrames()` with a 0.35 s floor, and aimed
  attacks lock their target when the telegraph starts (`src/levels/enemies/diver.ts`,
  `src/bosses/boss_base.ts`).
- **No softlocks.** Twelve QA-bot runs finished with no stuck period over 6.2 s and no NaN.
- **Boss structure.** 8 hits, 1.5 s of mutual safety after each hit, 2 s of grace at the start,
  ticket refills on the far side.
- **Presentation basics.** 28 sound effects and 9 music tracks are wired, the HUD warns at
  0 tickets, the pause menu lists controls from the real bindings, hit-stop and shake exist and
  can be turned off.

## 4. Findings

Severity: High = most players meet it and it hurts; Med = hurts some players or some sessions;
Low = polish.

### Per-act data

Length is PlayerStart to goal. Tickets and enemies per screen use the lint's walkable length.
Par is `par_seconds` in `src/core/difficulty.ts:44-52`.

| Act | Length (screens) | Sloped floor | Loops | Blocking steps | Two stacked routes | Enemies (per screen) | Pit (screens) | Tickets per screen | Checkpoints | Longest gap (screens) | Par (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Test zone | 19.2 | 12% | 1 | 3 | 12% | 4 (0.20) | 0.2 | 6.6 | 2 | 10.0 | 60 |
| Z1 Act 1 | 52.4 | 15% | 3 | 3 | 2% | 19 (0.36) | 0.2 | 5.7 | 3 | 14.6 | 150 |
| Z1 Act 2 | 67.2 | 21% | 2 | 3 | 8% | 34 (0.50) | 0.2 | 5.3 | 4 | 18.8 | 195 |
| Z2 Act 1 | 66.2 | 0% | 0 | 43 | 11% | 47 (0.70) | 0 | 4.6 | 4 | 17.1 | 210 |
| Z2 Act 2 | 75.0 | 0% | 0 | 27 | 8% | 61 (0.80) | 0 | 4.6 | 5 | 19.4 | 255 |
| Z3 Act 1 | 79.9 | 0% | 0 | 13 | 14% | 69 (0.86) | 0.7 | 4.2 | 5 | 20.5 | 255 |
| Z3 Act 2 | 87.8 | 0% | 0 | 11 | 18% | 84 (0.94) | 0 | 3.8 | 6 | 21.8 | 300 |
| Z4 Act 1 | 91.1 | 6% | 2 | 0 (plus one well basin) | 21% | 104 (1.24) | 8.2 | 3.0 | 6 | 16.5 | 300 |
| Z4 Act 2 | 108.2 | 2% | 3 | 0 (plus one well basin) | 17% | 127 (1.35) | 15.2 | 3.2 | 7 | 18.9 | 345 |

Enemy counts include the new burrowers (one each in Z2A2, Z3A2 and Z4A2). Lava vents, ceiling
rams and fluid wells are not enemies and are not counted anywhere in this table.

Bot results at `a1041ad` (QA bot: item boxes on, no deaths in any run; Zone 4 route pilot: no
item boxes):

| Act | Pilot bot time (s) | Pilot pace (px/f) | Pilot airborne | Naive bot time (s) | Naive pace (px/f) |
|---|---|---|---|---|---|
| Test zone | 30.7 | 4.4 | 9% | 29.1 | 4.7 |
| Z1 Act 1 | 51.2 | 7.2 | 23% | 76.8 | 4.8 |
| Z1 Act 2 | 74.6 | 6.4 | 23% | 95.8 | 5.0 |
| Z2 Act 1 | 79.4 | 5.9 | 52% | 91.6 | 5.1 |
| Z2 Act 2 | 114.6 | 4.6 | 42% | 128.6 | 4.1 |
| Z3 Act 1 | 116.1 | 4.9 | 47% | 91.8 | 6.2 |
| Z3 Act 2 | 124.8 | 5.0 | 51% | 152.5 | 4.1 |
| Z4 Act 1 | 142.3 (route pilot, 0 deaths, 7 hits) | 4.5 | not measured | not run | – |
| Z4 Act 2 | 178.0 (route pilot, 0 deaths, 8 hits) | 4.3 | not measured | not run | – |

### Per-boss data

From `Difficulty.BOSSES` (`src/core/difficulty.ts:55-60`) and `src/bosses/boss_base.ts:230-240,
460-461`. Bosses with desperation use a window 1.4× longer until hit 6. The boss changes since
the first audit are poses, sprites and arena backdrops; no tuning value changed.

| Boss | Hits to win | Weak-point window | Attacks per opening | Base telegraph | Ticket refills (after hits) | Tickets before the gate | Game over sends the player to |
|---|---|---|---|---|---|---|---|
| The Rug Pull (Z1) | 8 | 2.0 s | 1 | 0.8 s | 3 (2, 4, 6) | 5 | Title; replay Z1 Act 2 (67 screens) |
| Library Demon (Z2) | 8 | 1.7 s | 2 | 0.7 s | 2 (4, 6) | 5 | Title; replay Z2 Act 2 (75 screens) |
| Broccoli Head (Z3) | 8 | 1.54 s, then 1.1 s for hits 7–8 | 3 | 0.5 s | 1 (4) | 5 | Title; replay Z3 Act 2 (88 screens) |
| The Executive (Z4) | 8 | 1.26 s, then 0.9 s for hits 7–8 | 4 | 0.45 s | 1 (4) | 5 | Title; replay Z4 Act 2 (108 screens) |

Only the Zone 1 row was observed running; the routing is shared code, the rest is read.

### Camera look-ahead

`src/camera/game_camera.ts:36-43`: `deadzoneWidth` 16, `maxSpeedX` 16, `lookAheadMax` 64,
`lookAheadStartSpeed` 5, `lookAheadFullSpeed` 12. Steady-state lead (camera centre minus Sproto)
is `64 × clamp((speed − 5) / 7, 0, 1) − 8`. Warning time is `(212 + lead) / (speed × 60)`.

| Speed (px/f) | When it happens | Lead by formula (px) | Lead observed (px) | Warning (s) |
|---|---|---|---|---|
| 6 | Top running speed | 1 | 1 | 0.59 |
| 8 | Spin dash, no charge | 19 | 7–19 (still easing) | 0.48 |
| 10 | Downhill roll | 38 | not sampled | 0.42 |
| 12 | Full spin dash, charge run | 56 | 33–39 at 11.2 px/f (still easing) | 0.37 |
| 16 | Speed cap | below 0 (camera capped at 16 px/f) | not sampled | about 0.21 |

`docs/LEVELS.md` ("Fair, never cheap") promises that an enemy on a fast route is visible at least
1 s ahead at that speed, or can be destroyed by a rolling Sproto. With Sproto centred, 1 s of
warning is only possible below 3.5 px/f (212 px/s).

### Findings list

| ID | Severity | Finding | Evidence | How | What the player experiences |
|---|---|---|---|---|---|
| F1 | High | Zones 2 and 3 have no momentum terrain. | 0% sloped floor and 0 loops in all four acts; Zone 2 has 43 and 27 blocking steps, all 32 px risers; pilot airborne share 41–52% against 23% in Zone 1; pace falls from 7.2 to 4.6–5.9 px/f. Both Zone 2 tilesets already hold slope shapes (768 slope cells in `src/levels/data/tilesets/z2_wizard_academy.json` and `z3_capital_mansion.json`) that the acts never use. | Measured; holding right stops dead at x = 918 in both Zone 2 acts and at x = 1206 in Z3A1 (observed) | After Zone 1 the game becomes hop-over-the-block platforming. Speed is never the reward. |
| F2 | High | The camera gives almost no look-ahead. | Table above. Holding right was hit by the first enemy in Z1A1 (walker at x = 958, at the foot of the first downhill) after 4.5 s, in Z3A1 after 5 s and in Z4A1 after 4 s. | Observed and read | Hits feel unearned; players learn to slow down. |
| F3 | High | A game over at a boss costs the whole of Act 2. | `SceneRouter.respawn()` goes to `game_over` at 0 lives (`src/core/scene_router.ts:56-71`); `GameOverScreen.continueGame()` resets and goes to the title (`src/ui/game_over/game_over.ts:69-75`); zone select lists acts only (`src/ui/zone_select/zone_select.ts:137-150`). | Observed for Zone 1 | Three failed attempts at the two "very difficult" bosses mean replaying 88–108 screens. |
| F4 | High | Nothing rewards a fast or clean run. | Best times are saved (`src/hub/hub_save.ts:95-106`) and never shown (`bestTime()` has no caller in `src/`). `par_seconds` is read only by tests. `TIME_BONUS` (`src/ui/tally/score_tally.ts:33-41`) is one table for every act: the pilot's 124.8 s on Z3A2 earns 500 while each ticket earns 100. Pars are 2–3× bot times. Enemies score a flat 100 (`src/levels/enemies/enemy_base.ts:36`). The emerald is won by any clear (`src/core/game_state.ts:107-118`). | Read and measured | One clear per act exhausts the game. |
| F5 | High | Second routes barely exist. | Two stacked routes on 2–21% of each act; the lint prints `routes [1,1,1]` for all six acts it covers and has no rule on it. In Z1A1 the only stacked stretch is screens 16.8–18.1. | Measured | No route choice, no reason to learn a level. |
| F6 | Med | The act timer rewinds on death and on RESTART. | `restartFromCheckpoint()` sets `levelTime = checkpointTime` (`src/core/game_state.ts:101-104`); the pause menu's RESTART calls it without costing a life (`src/core/scene_router.ts:73-78`). | Read | A saved best time can be stitched from retried segments; RESTART is a free escape from any bad situation. |
| F7 | Med | Survival difficulty is flat through Zone 3; Zone 4 is a large step on paper. | The naive bot cleared all six acts with no deaths in 77–153 s. Tickets run 3.8–5.7 per screen, all are recoverable after a hit, and rule-placed boxes hand out shields. Zone 4 raises enemies to 1.24–1.35 per screen and adds 8.2 and 15.2 screens of pit, timed platforms and the new instant-kill ram. Its route pilot clears both acts without dying (7 and 8 hits) when there are no item boxes, so the step is not proven to be unfair; how it feels to a person is unverified. | Measured | Zones 1–3 never threaten; Zone 4 asks for everything at once. |
| F8 | Med | Checkpoint gaps are long, longest in the finales. | Longest gaps 14.6–21.8 screens; the last stretch is 20.5 screens in Z3A1 and 21.8 in Z3A2, where enemy density is highest. | Measured | A late death replays the hardest fifth of the act. |
| F9 | Med | Nothing teaches the moves in the level. | Controls appear only in the pause menu; `MOVES_LINE` (`src/ui/pause/pause_menu.ts:61`) omits the drop dash, charge run and shield bounce, which are on by default. No sign or prompt object exists in any level file. | Observed and read | A player stuck at a hill never learns the spin dash. |
| F10 | Med | Rule-placed item boxes stop a runner dead. | `placeItemBoxes()` (`src/levels/content.ts:121-159`) puts a solid box on level ground every five screens; only a jump or roll opens it (`src/levels/objects/item_box.ts:152`). Holding right stopped at x = 1288 in Z1A1 at 7 s, and at x = 1608 in Z4A1 two seconds after running at 11.8 px/f. | Observed | The reward object interrupts the run it is meant to reward. |
| F11 | Med | No late-jump or early-jump forgiveness. | By design (`docs/PHYSICS.md`, opening paragraph); the ground step reads only `isActionJustPressed('jump')` (`src/player/player.ts:477`). | Read | Missed jumps at ledges and on Zone 4's vanishing platforms read as dropped inputs. |
| F12 | Low | Speed has little visual feedback. | The afterimage starts above 10 px/f (`src/player/afterimage.ts:16`); the option text promises "SPEED LINES" (`src/ui/pause/pause_menu.ts:86`) and none exist. | Observed and read | Running at top speed looks the same as jogging. |
| F13 | Med | Zone 4 is outside the QA lint and the QA bots. | `zoneActs()` keeps only acts with a level file (`tools/qa/level_lint.ts:116-123`); Zone 4 is built in code. `tests/qa/playtest.test.ts` still describes Zone 3 as unreleased while `RELEASED` in `src/core/zone_registry.ts` lists all four zones. | Read | The hardest zone has the least automated checking. |
| F14 | Low | Lives only matter at bosses. | All eight acts are open from a fresh save (`zone_select.ts:139`), so a game over in an act costs only the checkpoint. | Observed | The lives counter and extra lives carry little weight. |
| F15 | Med | New: the Zone 4 Act 1 ceiling ram is an instant kill on a fixed timer. | `src/levels/z4/act1.ts:99-101`: no `wake_radius`, travel 48 px onto the low deck floor, so it closes the lane completely. A crush kills whatever tickets or shield the player holds (`tests/levels/floor_hazards.test.ts`, "crushes a player who stays in the lane"). Timing worked through in "The new hazards" below: a runner at 6 px/f who never slows is safe by about 5 frames; one who hesitates under it is not. While down it is a 48 px wall for 70 frames. | Read; not played | The only one-hit kill outside pits, and it punishes slowing down to look. |
| F16 | Low | New: lava vents, rams and fluid wells are invisible to the checks. | They are in group `level_hazard` but are not enemies, so the lint's density, tier and safe-spot rules ignore them, and no rule asks whether a timed hazard sits on the main route. Only item-box placement knows them (`src/levels/content.ts`, `keepOutSpans()`). | Read | A future placement on a fast route would pass every automated check. |
| F17 | Med | New measurement: Zone 4 is not tested with item boxes. | `tests/levels/z4.test.ts` registers no box hook. With the shipped hooks on, the same route pilot reached 6 deaths and did not finish either act; at the first audit it finished with 2 and 3 deaths (203.9 s and 212.3 s). The pilot does not know about boxes, so this shows the boxes sit on its line, not that a person would die. Cause not isolated. | Measured | Boxes placed by rule may block Zone 4's precise jumps; unverified in play. |

### Where the docs and the game disagree

| Doc | Says | Game |
|---|---|---|
| `docs/LEVELS.md`, principle 3 | Enemies on a fast route are visible at least 1 s ahead | 0.59 s at 6 px/f, 0.37 s at 12 px/f (F2) |
| `docs/LEVELS.md`, principle 2 | Every act has a fast high route and a slower low route | 2–21% of each act (F5) |
| `docs/LEVELS.md`, bosses | A failed attempt restarts the boss, not the act | True for a death, false for a game over (F3) |
| `docs/LEVELS.md`, the curve | More checkpoints so a death never sends you far back | Gaps up to 21.8 screens (F8) |
| `docs/LEVELS.md`, the curve | Par 2:30 to 5:45 | Bots finish in a third to a half of par |
| `docs/LEVELS.md`, the curve | 45–85 screens per act | 52–108 screens, inside the lint's 25% tolerance except by span in Z4A2 |
| `docs/LEVELS.md`, principle 5 | Direction is signalled with arrows and lit doors | No arrow or sign object exists |
| `docs/LEVELS.md`, principle 6 | Extra lives move from plain sight to hidden | Extra lives come only from every seventh rule-placed box (`BOX_CONTENTS`, `content.ts:38`) and from 100 tickets |
| `docs/LEVELS.md`, bosses table | Weak-point window 1.1 s and 0.9 s | 1.54 s and 1.26 s until hit 6; the table's values apply to hits 7–8 |
| `docs/LEVELS.md`, how it's checked | The bot's median time rises act to act | Naive bot: Z3A1 (91.8 s) is faster than Z2A2 (128.6 s); the pilot is level (115.6 s, 116.1 s). The seven-variant median was not measured. |
| `docs/LEVELS.md`, hazards (updated since the first audit) | Vents, burrowers and rams sit on optional shelves in Zones 2–3 and on lower routes with upper bypasses in Zone 4 | Matches the data: the QA bots' Zone 2–3 results did not change, so those hazards are off the bots' line. The Zone 4 fluid wells are on the only route, which the doc also says ("ticket arcs to mark the jump"). |
| `docs/LEVELS.md`, principle 3 | Every hazard is telegraphed | True for vents, burrowers and rams. A fluid well has no telegraph because it never changes; it relies on being seen (F2). |
| `docs/DESIGN.md`, feel; pause options | Speed effects | Only the afterimage above 10 px/f (F12) |
| `docs/PHYSICS.md` | – | No disagreement found; the reference tests pass. |

### The new hazards (added between the two audited commits)

All in `src/levels/objects/hazards/`. Timed hazards share `HazardCycle`
(`hazard_cycle.ts`): rest, warning, extend, hold, retract. Rest is scaled by the local
difficulty's interval multiplier and the warning by its telegraph multiplier (never under
0.35 s). Cycles restart from rest on every level load, so the timing is the same on every
attempt. The warning sound plays only within 260 px.

| Hazard | Placed | Default cycle (frames) | Warning | Damage | Stops the run line? |
|---|---|---|---|---|---|
| Lava vent (`LavaVent`) | Z2A1 (8240, −720), Z2A2 (17088, −672), Z3A2 (23504, −672): shelves reached by one-way steps marked with tickets. Z4A2 low deck (`z4/act2.ts:136`). | rest 132, extend 18, hold 38, retract 32 | 0.8 s default, 1.0 s in Z2A1; sparks and a flashing outlet | A normal hit: tickets scatter, shield absorbs | No. 44–58 px tall; a jump clears it in any phase. A roll does not protect. |
| Burrower (`Burrower`, tier 3 enemy) | Z2A2 (19024, −832), Z3A2 (18128, −416) on shelves; Z4A2 low deck (`z4/act2.ts:137`). | rest 132, extend 22, hold 54, retract 32 | 0.8–1.0 s; flashing hatch | A normal hit; a jumping or rolling player destroys it | No. Rolling through is safe. |
| Ceiling ram (`CeilingRam`, moving solid) | Z3A1 (19424, −432): starts only when the player is within 96 px (`wake_radius`). Z4A1 low deck (`z4/act1.ts:99-101`): fixed timer. | rest 132 (60 in Z3A1), extend at least 18, hold 38 (26 in Z3A1), retract 32 | At least 1.0 s before scaling; flashing ram and a flashing plate on the floor under it | Crush: instant death | Z3A1: no, a runner is gone before it starts. Z4A1: yes, a wall for hold plus retract. |
| Fluid well (`FluidWell`, in `LevelBuilder.fluidPit()`) | Z4A1 opening, 96 px wide (`z4/act1.ts:52`); Z4A2, 112 px wide (`z4/act2.ts:148`). Both on the only route, with 192–240 px of flat either side. | none | none; animated surface and a ticket arc | A normal hit on every tick inside, so again when invincibility ends; the basin floor is solid 44 px down | Only if the player runs in: the 44 px basin wall then needs a jump. |

Fairness at speed, given F2:

- **Vents and burrowers** are fair at any speed: jumping is always enough, and the three on
  shelves are optional.
- **Fluid wells** behave like short pits that forgive one mistake. At 6 px/f the player has
  0.59 s to see a 96 px gap; that is the same exposure as every other pit and improves with B1.
  With 0 tickets a fall is a death, as with any hit.
- **The Zone 3 ram** is fair: it only threatens a player who stops under it.
- **The Zone 4 Act 1 ram** is marginal. At difficulty 7 its warning lasts about 46 frames and the
  gap falls below Sproto's standing height about 4 frames into the 18-frame descent. A runner at
  6 px/f needs 35 frames from first sight to the lane and 11 to cross it, 46 in total, so a ram
  that was not flashing when it came into view cannot catch a runner who keeps going (lethal no
  earlier than frame 51). Slowing down removes that margin. If it is flashing on first sight the
  player has 213 px to stop, which a run can do (about 36 px) and a roll cannot (roll
  deceleration is 0.125 px/f per frame). These numbers are derived from the code and were not
  played.

### Changed since the first audit

Resolved: none of F1–F14. Between `85fb306` and `a1041ad` no camera, controller, scoring,
menu, save or hub code changed; the level changes are the hazards above plus their approach
steps and tickets.

Changed or corrected:

- Per-act numbers moved slightly: one more enemy in Z2A2, Z3A2 and Z4A2 (burrowers); a few
  tickets added; Zone 4 acts are 1.3 and 1.0 screens longer; Z2A2 pilot time 115.6 → 114.6 s.
- Zone 4 pilot results were restated. The first audit quoted runs made with the item-box hook on
  (2 and 3 deaths). The repo's own test runs without boxes and clears both acts deathless; both
  facts are now reported (F7, F17), and the Zone 4 pars in C2 are recomputed from the deathless
  runs.
- `docs/LEVELS.md` now describes the hazards; its other statements are unchanged.
- New: F15, F16, F17 and plan item A7.

## 5. The plan

Effort: S = under a day, M = a few days, L = a week or more.

### Phase A: fail states and quick wins

**A1. Retry the stage after a game over.**
- Goal: a game over never costs more than the current stage.
- Change: `GameOverScreen` shows two choices, RETRY STAGE (default) and QUIT TO TITLE, instead of
  one prompt. Add `SceneRouter.retryStage()`: read `zoneId` and `stage`, call
  `GameState.resetGame()`, then `doStartZone(zoneId, stage)`. Lives return to `START_LIVES`,
  score to 0.
- Steps: add the method beside `restart()` in `src/core/scene_router.ts`; build the two-item
  list with `MenuList` from `src/ui/common/menu.ts`; keep `CONTINUE_AFTER` (1.5 s) as the input
  grace; in a free scene fall back to today's behaviour.
- Tests: `tests/ui/ui.test.ts` (game over: default item, both paths), `tests/core/core.test.ts`
  (`retryStage` keeps zone and stage, resets lives).
- Acceptance: three deaths in any boss arena followed by one press puts the player back in that
  arena with 3 lives.
- Effort S. Depends on nothing. Risk: a fresh start mints a new hub attempt id; that is safe
  (section 7).

**A2. Boss on the zone select.**
- Goal: practise and replay bosses.
- Change: a third button, BOSS, per zone row, enabled when `HubSave.isCleared(zone, acts.length)`
  is true; it calls `SceneRouter.startZone(zone, acts.length + 1)`.
- Steps: `ROW_W` and the grid in `src/ui/zone_select/zone_select.ts:125-160` need room: shrink
  `NAME_WIDTH` or the act buttons; keep the emerald slots. A locked boss draws in
  `COLORS.locked`.
- Tests: `tests/ui/ui.test.ts` (locked and unlocked, grid navigation skips a locked boss).
- Acceptance: after clearing Act 2 once, the boss is selectable on the next visit.
- Effort S–M (layout). Risk: a replayable boss also banks tickets; see section 7 and decision 3.

**A3. Show the saved best time.**
- Change: zone select prints `HubSave.bestTime(zone, act)` as `m:ss.cc` under the focused act
  (or `--:--`); the tally adds a BEST row and a "NEW BEST" flash when this clear beat it.
- Steps: expose the best time through `HubClient` (the save is private to it); in
  `ScoreTally.ready()` read the previous best before `onLevelCompleted` overwrites it, or have
  `recordClear()` return both values.
- Tests: `tests/ui/ui.test.ts`, `tests/hub/hub.test.ts`.
- Acceptance: a second, faster clear shows NEW BEST and the zone select shows the new time.
- Effort S. Risk: none to the save format (`best_times` already exists). Superseded in part by C4.

**A4. Speed feedback from top running speed.**
- Change: `MIN_SPEED` in `src/player/afterimage.ts:16` from 10 to 7.5. Add the promised speed
  lines: a small `UiLayer` that draws 6–10 horizontal 1 px streaks at the screen edges, alpha
  scaled by `clamp((speed − 6) / 6, 0, 1)`, behind `Settings.data.speedEffects`.
- Tests: `tests/player/visuals.test.ts` (copies appear at 8 px/f, none at 6).
- Acceptance: a roll at 8 px/f shows a trail; a walk shows nothing.
- Effort S. Risk: none to the simulation.

**A5. Complete the controls list.**
- Change: `MOVES_LINE` in `src/ui/pause/pause_menu.ts:61` becomes two lines; the second, shown
  only while `Moves.extrasEnabled()`, reads `JUMP TWICE AND HOLD: DROP DASH   HOLD UP + JUMP:
  CHARGE RUN   JUMP WITH A SHIELD: BOUNCE`.
- Tests: `tests/ui/ui.test.ts` (panel still fits between y 44 and 223).
- Effort S.

**A6. Item boxes do not stop a fast runner.**
- Change: in `ItemBox`'s look-ahead check (`src/levels/objects/item_box.ts:152`) also burst when
  the player is grounded and `abs(groundSpeed) >= 4.5`, the threshold the armored pill already
  uses. Speed is kept, as for a roll.
- Tests: `tests/levels/objects.test.ts`; `tests/gameplay/box_counts.test.ts`;
  `tests/qa/playtest_boxes.test.ts` warnings about boxes slowing runs should fall.
- Acceptance: holding right no longer stops at x = 1288 in Z1A1 or x = 1608 in Z4A1; the Zone 4
  route pilot run with the box hook on finishes both acts (F17).
- Effort S. Risk: boxes are already off in Ranked, so no ranked behaviour changes.

**A7. Make the Zone 4 Act 1 ram depend on the player, not the clock (F15).**
- Goal: no one-hit kill decided by arrival time.
- Change: in `src/levels/z4/act1.ts:99-101` add `wake_radius: 160` and drop `first_delay`, as the
  Zone 3 ram already does (`wake_radius` 96 in `z3_capital_mansion/act1.json`). The ram then
  rests, warns for at least 0.35 s after scaling (about 0.76 s here) and only then descends, all
  counted from the moment the player comes near. Keep the instant kill; it now needs a player
  who waits under a flashing ram.
- Alternative if the fixed timer is wanted as a Zone 4 idea: travel 48 → 18, which leaves a 30 px
  gap that a rolling Sproto (28 px tall) fits through, so it becomes a hazard that forces a roll.
- Tests: `tests/levels/floor_hazards.test.ts` (a player entering the lane at 4 px/f or faster
  while the plate is unlit is never crushed), `tests/levels/z4.test.ts`.
- Acceptance: the route pilot's hit count in Z4A1 does not rise; 20 scripted crossings at speeds
  from 2 to 12 px/f that start with the plate unlit produce no death.
- Effort S. Do this before or with B1 (see B1's risk).

### Phase B: camera and feel

**B1. Retune the look-ahead.**
- Goal: see far enough ahead to react at speed.
- Change, in `src/camera/game_camera.ts:36-43`:

| Field | Now | Proposed |
|---|---|---|
| `lookAheadStartSpeed` | 5 | 2 |
| `lookAheadFullSpeed` | 12 | 9 |
| `lookAheadMax` | 64 | 112 |
| `lookAheadSmoothTime` | 0.35 | 0.30 |
| `maxSpeedX` | 16 | 20 |

  Resulting steady lead and warning: 6 px/f → 56 px, 0.74 s; 8 px/f → 88 px, 0.63 s; 9 px/f and
  above → 104 px (0.53 s at 10, 0.44 s at 12, 0.33 s at 16). Sproto is never closer than 108 px
  to the trailing edge.
- Steps: change the fields; check turnarounds at walking speed for sway (raise the start speed to
  3 if it shows); update `docs/CONTRACTS.md` if it lists the values; propose to the lead that
  `docs/LEVELS.md` principle 3 becomes "at least 0.7 s at top running speed, or destroyable by a
  roll", since 1 s is not reachable in a 424 px view.
- Tests: `tests/physics/camera.test.ts:73` computes the expected value without clamping and must
  clamp; `tests/physics/qa_camera_review.test.ts:66` hard-codes 64, 5 and 7.
- Acceptance: steady lead of 56 ± 2 px at 6 px/f; at least 0.70 s of warning at 6 px/f and 0.40 s
  at 12 px/f; largest per-frame change of the lead still within `lookAheadMaxRate`.
- Effort S. Risk: `Enemy.onScreen()` reads the camera view (`src/levels/enemies/enemy_base.ts:
  157-162`), and snipers, divers, pellet pills and projectiles use it, so their timing shifts.
  Bot baselines move, and the recorded input timelines in `tests/levels/inputs/` may stop
  reaching the goal (`tests/qa/playtest_replay.test.ts` tolerates that but reports it). Re-record
  after B1 and B2 together. More look-ahead also means more frames between first sight of the
  Zone 4 Act 1 ram and reaching it (44 instead of 35 at 6 px/f), which removes the 5-frame margin
  described under "The new hazards"; A7 must land first.

**B2. Optional jump forgiveness.**
- Goal: jumps at ledges and on landing register as intended, without touching classic mode.
- Change: a new setting `jumpAssist` (default on, off in Ranked, own row in the pause options
  beside EXTRA MOVES). Two constants in `src/player/moves.ts`: `COYOTE_FRAMES = 5` and
  `JUMP_BUFFER_FRAMES = 6`.
- Steps:
  1. In `Player`, when the ground step calls `leaveGround()` because the floor was lost
     (`src/player/player.ts:815` and `:828`), set a coyote counter; not on a jump, spring or hurt.
  2. In `airStep()` (`player.ts:842-846`), a fresh jump press with the counter above 0 and
     `_jumped` false performs a jump: keep horizontal speed, set vertical speed to minus
     `jump_force`, then the usual ball, `_jumped` and sound.
  3. Otherwise a fresh air press starts a 6-frame buffer. On landing, if the buffer is live and no
     drop dash fired, jump on the next ground step.
  4. Precedence on one press: shield bounce, then drop dash (held 20 frames), then buffer.
- Tests: new cases in `tests/physics/air.test.ts`; `tests/physics/reference.test.ts` must pass
  unchanged with the assist off; `tests/gameplay/upgrades.test.ts` for the drop-dash precedence.
- Acceptance: with the assist on, a press up to 5 frames after running off a ledge jumps; with it
  off, every reference scenario still matches to 1/256 px.
- Effort S–M. Depends on decision 1. Risk: input timelines, as B1.

**B3. Teach in the level.**
- Goal: the first act teaches roll, spin dash and jump-on-enemy where they are needed.
- Change: a new object `PromptZone` in `src/levels/objects/` (an area with a text key). While
  Sproto stands in it at under 1 px/f for 60 frames, or on first entry in Z1A1, the HUD shows one
  line built from `InputHints`. Place three in `src/levels/data/z1_retro_rush_hills/act1.json`:
  before the first walker (x ≈ 700, "JUMP ON IT OR ROLL THROUGH"), at the foot of the first
  climb ("HOLD DOWN, TAP JUMP, LET GO: SPIN DASH"), and before the first loop ("KEEP YOUR SPEED").
  Each shows at most once per run.
- Tests: `tests/levels/objects.test.ts`, `tests/ui/ui.test.ts`; register the type in
  `src/levels/registry_objects.ts`.
- Acceptance: a new player who stops at the first hill sees the spin-dash line within 1 s.
- Effort M. Risk: text only, no new art; later arrow signs need sprite art through the art
  workflow.

### Phase C: speedrun and replay layer

**C1. An honest act clock.**
- Change: add `GameState.attemptTime`, which counts every physics tick from `startLevel()` and is
  never rewound, and `GameState.cleanRun` (false after any death or RESTART). The HUD keeps
  showing `levelTime`. Best times, ranks and any board post use `attemptTime`.
- Steps: tick it in `GameState.tick()`; stop it in `completeLevel()`; `HubClient.
  onLevelCompleted()` passes it to `recordClear()`. Add RESTART ACT to the pause menu
  (`SceneRouter.startZone(zoneId, stage)`), so a runner can reset to 0:00.
- Tests: `tests/core/core.test.ts`, `tests/hub/hub.test.ts`, `tests/ui/ui.test.ts`.
- Acceptance: dying once and finishing records a time longer than the HUD clock by the lost
  segment.
- Effort S. Risk: existing saved bests were set by the rewinding clock; keep them (they can only
  be beaten honestly from now on) or clear them once with a save version bump in
  `src/hub/hub_save.ts`.

**C2. Recalibrated pars.**
- Formula: par = 1.5 × the best deathless bot time (the faster of pilot and naive), rounded up to
  5 s. Zone 4 uses the route pilot's deathless runs without item boxes and is provisional until
  the QA bots cover it (D1).
- Change `par_seconds` in `src/core/difficulty.ts:44-52` and the table in `docs/LEVELS.md`:

| Act | Best bot (s) | Par now | Par proposed | S rank at or under |
|---|---|---|---|---|
| Test zone | 29.1 | 60 | 45 | 31 |
| Z1 Act 1 | 51.2 | 150 | 80 | 56 |
| Z1 Act 2 | 74.6 | 195 | 115 | 80 |
| Z2 Act 1 | 79.4 | 210 | 120 | 84 |
| Z2 Act 2 | 114.6 | 255 | 175 | 122 |
| Z3 Act 1 | 91.8 | 255 | 140 | 98 |
| Z3 Act 2 | 124.8 | 300 | 190 | 133 |
| Z4 Act 1 | 142.3 | 300 | 215 (provisional) | 150 |
| Z4 Act 2 | 178.0 | 345 | 270 (provisional) | 189 |

- Tests: `tests/levels/z4.test.ts` asserts the pilot beats par; with 215 and 270 it has 73 s and
  92 s of margin. Recompute after phase D changes the levels.
- Effort S. Depends on C1 and, for final numbers, phase D.

**C3. Per-act time bonus and rank.**
- Change: replace `TIME_BONUS` in `src/ui/tally/score_tally.ts:33-41` with a ratio table, where
  r = `attemptTime` / par:

| r at or under | Rank | Time bonus |
|---|---|---|
| 0.70 | S | 20,000 |
| 0.85 | A | 12,000 |
| 1.00 | B | 8,000 |
| 1.50 | C | 3,000 |
| 2.00 | D | 1,000 |
| above | D | 0 |

  A run that is not clean (C1) is capped at rank A. `TICKET_BONUS` stays 100.
- Steps: `ScoreTally.timeBonusFor(seconds)` takes the par; add a rank row to the tally; draw the
  letter with the existing pixel font.
- Tests: `tests/ui/ui.test.ts` pins the bonus table today and must be rewritten.
- Acceptance: on every act the pilot bot's time scores S or A; a par-pace run scores B.
- Effort M. Risk: scores are not comparable with old ones; nothing stores them.

**C4. Rank and best time on the zone select; replay prompts.**
- Change: store the best rank per act beside `best_times` (new `best_ranks` map, save version 2,
  with a migration that leaves it empty); zone select shows time and rank per act; the tally
  shows NEW BEST and NEW RANK. The ending screen lists all eight ranks.
- Tests: `tests/hub/hub.test.ts` (migration, two-tab merge), `tests/ui/ui.test.ts`.
- Effort M. Depends on C1–C3. Risk: save format change; keep the migration tolerant.

**C5. Chain score (optional).**
- Change: enemies popped without touching the ground score 100, 200, 400, 800, then 1,000 each;
  reset in `Moves.onLand()`. Lives in `Enemy.destroy()` (`enemy_base.ts:105-112`).
- Tests: `tests/levels/enemies.test.ts`. Effort S.

### Phase D: level flow, routes and difficulty curve

Level data and `docs/LEVELS.md` belong to the lead; `tools/qa/` belongs to QA. Items here are
proposals to those owners.

**D1. Lint rules for flow and routes (QA).**
- New measures in `measure()` of `tools/qa/level_lint.ts`: share of columns with two stacked
  routes (whole act and middle third), share of sloped floor, blocking steps per screen.
- New rules: `flow.routes` (error under 20% of the act or under 25% of the middle third, for
  D ≥ 1); `flow.slope` (warn under 8% sloped floor); `flow.steps` (warn above 0.25 blocking
  steps per screen); and `difficulty.checkpoint_gap` becomes an error above 16 screens.
- Hazards (F16): collect nodes in group `level_hazard`; report them per act; new rule
  `hazard.timed_solid` warns when a moving solid hazard with no `wake_radius` stands on the
  lowest route, and `hazard.safe_spot` applies the 2-screen rule after checkpoints, springs and
  loop exits to hazards as it does to enemies.
- Run the Zone 4 pilot once with `registerNewContent()` (item boxes on) in
  `tests/levels/z4.test.ts` or `tests/qa/playtest_boxes.test.ts` (F17).
- Also make `zoneActs()` include acts built in code (give Zone 4 a data source the lint can load,
  or export the built `LevelData`), so the lint and the QA bots cover Zone 4 (F13).
- Introduce the rules as warnings first; switch to errors per act as D2–D5 land.
- Effort M.

**D2. Momentum pass on Zone 2.** Files: `src/levels/data/z2_wizard_academy/act1.json`,
`act2.json`.
- Staircases are 32 px risers every 64 px, which is exactly the gentle 1:2 tile slope already in
  the tileset. Replace each with slope tiles. Per `docs/LEVELS.md` principle 4 a 1:2 climb needs a
  run-up, so keep at least 2 screens of flat before each up-ramp (the lint's `momentum.runup`
  checks it) or use `CurveTerrain` for a 1:4 ramp, which can be climbed from a standstill.
  - Act 1, up: x 1121–1249, 1825–1953, 5969–6097, 7089–7281, 10817–10945, 13873–13937,
    20385–20513, 24129–24257. Down: 2081–2209, 6225–6353, 11073–11201, 11777–11969,
    14065–14193, 20641–20769, 24385–24513.
  - Act 2, up: x 1441–1569, 12929–13121. Down: 19793–19985.
- Single 32×32 floor blocks ("hurdle blocks") stop a runner and teach nothing. Remove about two
  in three and turn the rest into a 16 px half tile with a slope tile on each side.
  - Act 1 (17): x 929, 2817, 3985, 4657, 5457, 8465, 8753, 10305, 12897, 15393, 17217, 19873,
    23041, 25185, 25473, 26849, 27137.
  - Act 2 (18): x 929, 2241, 3105, 4657, 5713, 6769, 8785, 10065, 16113, 19601, 21297, 25537,
    25825, 27585, 27873, 29121, 29665, 30657; plus the 64 px block at 14145.
- One speed set piece per act, in the zone's own idea (a long banister slide): a booster, a
  down-ramp, then a clear run with tickets on the roll line.
  - Act 1: x 15,425–18,945 (8 screens with one hurdle block, at 17217).
  - Act 2: x 16,145–19,600 (8 screens, already flat).
- Move enemies that now sit at a ramp foot at least 2 screens past it (`difficulty.safe_spot`).
- Tests: `tests/levels/zone_acts.test.ts`, `tests/levels/tiles.test.ts` (seams),
  `tests/qa/level_lint.test.ts`; re-record `tests/levels/inputs/z2_act1_run.json` and
  `z2_act2_run.json`.
- Acceptance: pilot pace at least 6.5 px/f in Act 1 (5.9 now) and 5.5 in Act 2 (4.6 now); pilot
  airborne share at most 35%; sloped floor at least 10%; at most 0.25 blocking steps per screen.
- Effort L. Risk: whether the Zone 2 atlas has finished art for its slope cells is unverified;
  if not, art is needed before this ships. All set pieces must be the zone's own designs.

**D3. Momentum pass on Zone 3.** Files: `src/levels/data/z3_capital_mansion/act1.json`,
`act2.json`.
- `docs/LEVELS.md` describes Act 1 as a rooftop speed run; the rooftops are staircases. Convert
  them to pitched roofs with 1:2 slope tiles: Act 1 up at x 1217–1281, 4801–4993 and 6241–6625
  (seven risers, 224 px: split into two pitches with a flat between), down at 11393–11585,
  13793–13985, 20289–20481 and 24353–24545; Act 2 up at 1505–1569, 3329–3521 and 5249–5505.
- The step proxy shows few steps after screen 15 in either act, yet the pilot is airborne
  47–51% of the time. The cause was not isolated (doors, switches, beams, conveyors and enemy
  spacing are candidates). First step: log where the pilot jumps, by x, and review the ten
  densest screens of each act before editing.
- Acceptance: pilot pace at least 5.5 px/f in both acts (4.9 and 5.0 now); airborne at most 40%.
- Effort L. Risk: as D2.

**D4. Real second routes.**
- Target: two stacked routes on at least 20% of each act and at least 25% of the middle third;
  the upper route is faster and harder to stay on, and rejoins before each checkpoint.
- Order: Z1A1 first (2% now). Add an upper deck over screens 6–12 (x ≈ 2,640–5,180), entered
  from a spring or a ramp jump at speed, and a second over screens 30–36 (x ≈ 12,800–15,360);
  with the existing 16.8–18.1 stretch that gives about 25%. Then Z1A2 (8%), Z2A2 (8%), Z2A1
  (11%), Z3A1 (14%), Z3A2 (18%), Z4A2 (17%).
- Put half of each act's tickets-per-screen surplus on the upper route so it pays.
- Tests: D1's `flow.routes`; `tests/qa/playtest.test.ts`.
- Effort L per zone. Risk: item-box placement alternates highest and lowest floors
  (`content.ts:139-141`) and will start using the new decks; check with
  `tests/gameplay/box_counts.test.ts`.

**D5. Checkpoints.**
- Change: no gap above 16 screens; one checkpoint inside every finale.
  - Add: Z1A2 near screens 41 and 59; Z2A1 near 58; Z2A2 near 9 and 65; Z3A1 near 70; Z3A2
    near 77; Z4A1 near 60; Z4A2 near 53 and 72 (exact x after D2–D4). Keep new checkpoints at
    least 2 screens from the new hazards.
  - Raise `checkpoints` in `TARGETS` (`src/core/difficulty.ts:44-52`) to 6, 5, 7, 6, 7, 7 and 9
    for D2–D8 (D1 stays 3), and the `docs/LEVELS.md` table to match.
- Acceptance: lint reports a longest gap of at most 16 screens on every act.
- Effort S–M. Risk: slightly more tickets reach the goal after a late death (section 7).

**D6. Difficulty calibration.**
- Zones 1–3: keep ticket density, but make hits matter more as zones advance: recoverable
  tickets `max_scattered_tickets` 32 → 32, 24, 16, 12 by zone (a per-zone override, not a change
  to `src/core/physics_constants.json`, which the reference tests read); shield share of
  `BOX_CONTENTS` falls from 3 in 7 to 2 in 7 from Zone 3.
- Zone 4: no change is justified by the data yet (its pilot clears deathless without boxes).
  After D1 puts Zone 4 under the QA bots and A6 and A7 land, run the naive bot there. Only if it
  cannot finish, put floor under the first vanishing run after each checkpoint in Act 2 and hold
  enemy density at the Zone 3 level for the opening quarter.
- Acceptance: the naive bot dies at least once in Z3A1 and Z3A2 and still finishes; the Zone 4
  route pilot stays deathless with item boxes on; the QA bots' median time rises from act to
  act.
- Effort M. Depends on D1 (Zone 4 under the bots). Risk: needs human playtests; bots do not feel
  frustration.

## 6. Suggested order and PR batching

Every push to `main` redeploys the web build once checks pass, so each PR must be shippable on
its own. Run `tools/lead/gate.sh` on each before merge, and `npm run test:bots` on any PR that
changes levels, the camera or the controller.

| PR | Items | Notes |
|---|---|---|
| 1 | A1, A5 | Smallest fix with the largest effect. |
| 2 | A3, A4, A6, A7 | Quick wins; A6 moves box bot numbers; A7 before any camera change. |
| 3 | A2 | After decision 3 on boss payouts. |
| 4 | B1, B2 | Together, then re-record input timelines once. |
| 5 | C1, C2, C3 | The clock, pars and ranks in one change so scores never mix. |
| 6 | C4, C5 | Save version bump. |
| 7 | D1 (QA) | Warnings only. |
| 8 | B3 | Needs Z1A1 untouched by D4, or lands with it. |
| 9–12 | D2, D3, D4, D5 | One zone per PR; D5 with each zone. Recompute C2 pars after each. |
| 13 | D6 | Last, with a human playtest. |

## 7. Hub integration items

Facts marked "hub side" come from the hub's audit and cannot be checked from this repo.

| Topic | Fact | Source | Consequence for this plan |
|---|---|---|---|
| Earn size | At most 20 Tickets per clear: `EARN_MAX_PER_ACT` (`src/hub/hub_client.ts:41`), `Math.min(tickets, 20)` at `:284`. The amount is the count held at the goal, reported by the client. | Read here; "checked only against caps" is hub side | Acts hold 254–359 tickets, so changing ticket density (D4, D6) does not change payouts while a player ends with 20 or more. |
| Attempt ids | `GameState.startLevel()` emits `levelStarted`, and `HubSave.beginAttempt()` mints a new id (`src/hub/hub_save.ts:130-136`). Respawns and RESTART call `restartFromCheckpoint()`, which does not. Earns are keyed by that id and sent only on a clear (`hub_client.ts:250-275`). | Read here | A1's retry and C1's RESTART ACT mint a new id but cannot pay twice: one id, one clear, one earn. A failed attempt pays nothing. |
| Replays pay again | Each fresh attempt that is cleared banks up to 20; the README's "each act once" reads as once per attempt. | Read here | A2 adds a short repeatable earn (a boss clear holds at most 20: 5 before the gate plus 5 per refill). Bounded by the caps; see decision 3. |
| Caps | 200 Tickets per session and 1,000 per game per day. The client drops an earn refused with a `*_cap` code and sets `earnCapped` (`hub_client.ts:327-330`), which no UI reads. | Hub side; client handling read here | Show "hub Ticket limit reached" on the tally when `earnCapped` is true. |
| Core Relic | Live; granted by the server on the Zone 1 Act 1 `hpos10i.level_complete` event. | Hub side; the event is sent at `hub_client.ts:268-270` | No change. |
| Act-time board | The client posts only Zone 1 Act 1's best time (`hub_client.ts:31-33, 263-266`). The plaza always launches unranked and the server rejects unranked scores for this game, so the board is empty. | Hub side | Phase C must stand on local best times and ranks. If the hub later accepts posts, send `attemptTime` from a clean run (C1), not the rewinding clock. |
| Ranked | `HubClient.ranked` comes from the session (`hub_client.ts:208`); extra moves, item boxes and Relic effects are off in Ranked. | Read here | With no ranked launches, the Ranked rule set is unreachable in practice. B2's assist follows the same switch. |
| Exchange | Ticket-to-Verse exchange is refused for this game on purpose. | Hub side | Nothing in the game should suggest tickets convert to anything. |

## 8. Decisions for the owner

1. **Classic exactness or optional forgiveness (B2).** Option a: keep no forgiveness anywhere;
   costs nothing, keeps F11. Option b: assist on by default, off in Ranked and switchable
   (recommended); costs S–M and one re-record of the input timelines. Option c: assist off by
   default; safe, but most players never find it.
2. **Are Zones 2–3 meant to be slower platforming?** Option a: yes, by design; then drop D2–D3,
   keep D4–D5, and change `docs/LEVELS.md` principle 2 to say so. Option b: they should flow like
   Zone 1 (recommended); costs two L items and possibly slope art.
3. **Do hub payouts constrain the levels, and may a replayed boss pay?** Ticket density does not
   move payouts (section 7). Option a: boss replays from the zone select bank like any clear
   (simplest). Option b: boss replays bank nothing (recommended; one `if` in
   `HubClient.onLevelCompleted()`), so the short fight is not the best Ticket source.
4. **Should acts unlock by progress?** Option a: keep everything open; then lives only matter at
   bosses and A1 removes most of that. Option b: unlock each act by clearing the one before
   (recommended; `HubSave.isCleared()` already exists; S), which gives the emerald row and the
   ending a path. Option c: keep open and remove lives; larger redesign.
5. **The emerald's display name.** `docs/DESIGN.md` records it as a director exception to the
   originality rule, scoped to one constant. It is now on the zone select and the tally in every
   session. Please confirm it stays.
6. **`docs/LEVELS.md` principle 3.** The 1 s rule cannot be met in a 424 px view. Recommended:
   restate it as 0.7 s at top running speed after B1.

## 9. How to verify the changes improved play

Repeat the section 2 measurements after each phase and compare:

| Measure | Now | Target |
|---|---|---|
| Warning at 6 px/f / 12 px/f | 0.59 s / 0.37 s | ≥ 0.70 s / ≥ 0.40 s |
| Hold right in Z1A1 for 10 s | Hit at 4.5 s, stopped by a box at 7 s | Not stopped by a box |
| Pilot pace Z2A1 / Z2A2 / Z3A1 / Z3A2 (px/f) | 5.9 / 4.6 / 4.9 / 5.0 | ≥ 6.5 / 5.5 / 5.5 / 5.5 |
| Pilot airborne share, Zones 2–3 | 41–52% | ≤ 35% Zone 2, ≤ 40% Zone 3 |
| Sloped floor, Zones 2–3 | 0% | ≥ 10% |
| Two stacked routes, every act | 2–21% | ≥ 20%, middle third ≥ 25% |
| Longest checkpoint gap | 14.6–21.8 screens | ≤ 16 |
| Naive bot deaths, Z3 acts | 0 | ≥ 1, still finishing |
| Zone 4 route pilot, item boxes on | 6 deaths, does not finish | Finishes both acts deathless |
| Crossings of the Z4A1 ram that start with the plate unlit | Safe by about 5 frames at 6 px/f | Never a death at 2–12 px/f |
| Game over at a boss | Title | Same arena in one press |
| Pilot bot rank on each act | none | S or A |

Human playtest checklist (one new player, one experienced player, keyboard and gamepad):

- First five minutes with no instructions: does the player find the roll and the spin dash?
- Count hits the player says they "could not see coming" per act.
- Does the player choose the upper route twice in a row once they find it?
- After the first clear of Z1A1, do they replay it for a rank without being asked?
- Three attempts at each boss: time from game over to being back in the fight.
- Zone 2 and Zone 3: does the player describe them as fast?
- With jump assist on and off: missed jumps at ledges in Zone 4 Act 1.
- Any moment the camera sway is noticed at walking speed.
- Zone 4 Act 1 low deck: deaths to the ram, and whether the player saw the floor plate flash.
- The two fluid wells: does the player read the ticket arc as "jump here" at running speed?

## 10. Not audited / out of scope

- Audio mix and music, gamepad and touch controls, phone performance and battery.
- Bosses 2–4 and Zone 4 in real play; boss fairness was read, not tested.
- The new hazards in real play: their fairness numbers are derived from the code.
- The new sprite and level art, beyond confirming the game still runs with it.
- The full seven-variant bot suite and the recorded-timeline replays.
- Whether the Zone 2 and Zone 3 tile atlases have finished art for slope cells.
- Art quality, the art pipeline and sprite animation.
- Hub server behaviour (caps, ranked rules, the board, exchange): taken from the hub's audit.
- Accessibility beyond the existing shake and speed-effect options.
