# 04 – Zones (4 zones × 2 acts)

Branch: `levels` · Owner: level agent · Scenes: `res://levels/<zone_id>/act1.tscn`, `act2.tscn`.
Zone ids: `z1_retro_rush_hills`, `z2_wizard_academy`, `z3_capital_mansion`, `z4_neon_rush_remix`.
Run one act with `godot --path . -- --zone=<zone_id> --stage=<1|2>`.

Tags: **[auto]** script/test/timeline · **[manual]** human judgement.
Every act gets section A and B; then the zone-specific section.

## A. Every act: structure and smoke

- [ ] ZN-A1 [auto] `tests/qa/test_contracts.gd`: `LevelRoot` root with `PlayerStart` and `Bounds`.
- [ ] ZN-A2 [auto] The file path matches `ZoneRegistry.stage_path(zone, stage)`.
- [ ] ZN-A3 [auto] `tools/qa/scene_smoke.sh`: 120 frames, no `ERROR`/`WARNING`.
- [ ] ZN-A4 [auto] `tools/qa/originality_scan.sh`: no hits in level files, node names or file names.
- [ ] ZN-A5 [auto] Parallax: at runtime 4 `Parallax2D` layers with scroll scales 0.1 / 0.3 / 0.6 / 0.9 from `assets/backgrounds/<zone_id>/` (when the art exists).
- [ ] ZN-A6 [auto] Music: `Audio` plays the zone track (`z1`…`z4`) when the act starts via `SceneRouter`.
- [ ] ZN-A7 [auto] Accessory: `SceneRouter.current_zone().accessory` is `wizard_hat` in Zone 2, `sunglasses` in Zone 3, empty in Zones 1 and 4; the player draws it.

## B. Every act: playability

- [ ] ZN-B1 [auto] Bot `--zone=<id> --stage=<n> --frames=18000`: record max x progress, deaths and stuck periods (> 5 s). Every stuck spot is listed in the report and checked by hand.
- [ ] ZN-B2 [manual] A human finishes the act start to goal, with no frame-perfect input required on the main route.
- [ ] ZN-B3 [manual] No softlocks: there is no place the player can get stuck without being able to leave or die (check every bot stuck period, pits, closed rooms, one-way drops).
- [ ] ZN-B4 [auto] Death pits only below `Bounds`; `Bounds` covers all terrain (camera never shows the void).
- [ ] ZN-B5 [auto] At least one checkpoint per act; respawn spot is safe (not over a pit, not on an enemy, not under a crusher).
- [ ] ZN-B6 [auto] Goal sign at the end -> tally -> next stage (act 1 -> act 2 -> boss arena).
- [ ] ZN-B7 [auto] Enemies extend `Enemy`, detect the player with mask bit 5, and follow the hurt/kill rules (see 02 TL-G).
- [ ] ZN-B8 [auto] Bot `--policy=fuzz` 18 000 frames: no errors, no NaN, no softlock.
- [ ] ZN-B9 [manual] Every loop is traversable both ways; path switchers put the player on the right path.
- [ ] ZN-B10 [manual] Act length about 1.5–4 minutes for a first-time player; routes branch high/low.
- [ ] ZN-B11 [manual] Web performance: 60 fps in the browser on a mid laptop through the busiest part.

## C. Moving solids (any zone that has them)

- [ ] ZN-C1 [auto] Player standing on a moving platform is carried exactly (no slide, no jitter, stays grounded going down).
- [ ] ZN-C2 [auto] Jumping off a moving platform: documented velocity inheritance.
- [ ] ZN-C3 [auto] Platform pushes the player into a wall or ceiling: `kill()` (crush), never pushes the player inside terrain.
- [ ] ZN-C4 [auto] Platform moving into the player from the side pushes the player out, does not trap.
- [ ] ZN-C5 [auto] Pause and respawn: moving solids pause, and reset or continue consistently after a respawn.

## I. Difficulty curve (docs/LEVELS.md, `core/difficulty.gd`)

The rows of `Difficulty.TARGETS` are the contract: D 0 is the test zone, D 1–8 run from Z1 Act 1 to Z4 Act 2.
`tests/qa/qa_difficulty.gd` documents how each number is measured.
Run `godot --headless --path . -s res://tools/qa/level_lint.gd` for the full per-act report; the auto items below run in `tests/qa/test_level_difficulty.gd`.

- [ ] ZN-I1 [auto] `Difficulty.for_stage(zone, act)` gives the D in the LEVELS.md table for every built act (`level_lint.gd -- --list-acts`).
- [ ] ZN-I2 [auto] Length is within ±25 % of the row's `screens` (45–85 screens from a866341). Length = walkable width in 424 px screens.
- [ ] ZN-I3 [auto] Enemy density (Enemy nodes per screen) is within ±25 % of `enemies_per_screen`.
- [ ] ZN-I4 [auto] Every enemy extends `Enemy` and sets `tier` (1–4).
  - No enemy before the finale is above the row's highest tier (error); the finale may go one tier higher (ZN-I14).
  - Each tier's share is within 25 points of the row's mix (warning).
- [ ] ZN-I5 [auto] The checkpoint count matches `checkpoints`: 1 off is a warning, 2 or more is an error.
  - No gap between start, checkpoints and goal is longer than 1.75× the even spacing (and 3 screens).
- [ ] ZN-I6 [auto] Ticket density is within ±25 % of `tickets_per_screen`.
- [ ] ZN-I7 [auto] Direction score is at least the row's R level: 1 below is a warning, 2 or more below is an error. It is built from:
  - routes per third;
  - vertical screens;
  - leftward-travel screens (goal left of the start, plus `Leftward*`/`Reverse*` nodes);
  - dead ends (walls over 96 px with no spring);
  - doors and switches;
  - forced sections (autoscroll, reverse runs).

  If an act is R4/R5 by design but scores lower, the levels agent names the feature nodes so the lint can see them (e.g. `LeftwardRun`, `Door`, `Switch`, `Autoscroll…`), rather than QA lowering the bar.
- [ ] ZN-I8 [auto] Act to act (sorted by D), no act is easier than the one before. These are errors:
  - lower enemy density (more than 10 %);
  - a lower tier ceiling;
  - a lower direction score.

  More tickets per screen is a warning.
- [ ] ZN-I9 [auto] `tools/qa/difficulty_bot.sh` (slow, not in CI):
  - The runner bot finishes every act in at least one of 5 variants.
  - Once two or more acts exist, its median clear time rises with D.
  - Report the medians next to `par_seconds`.
- [ ] ZN-I10 [auto] Enemies scale with D. Probe one enemy of each tier in a D1 and a D8 act:
  - speed ratio = `Difficulty.speed_mult(8) / speed_mult(1)` (1.42);
  - attack interval ratio 0.65;
  - telegraphs = `Difficulty.telegraph(base, D)`, never below 0.35 s.

  No per-zone speed constants in `levels/enemies/` (grep).
- [ ] ZN-I14 [auto] In-act ramp (docs/LEVELS.md "Rising difficulty inside every act", acts with D ≥ 1). Progress is 0 at PlayerStart and 1 at the goal (x proxy of `LevelRoot.progress_at`); the sections are opening 0–25 %, middle 25–75 % and finale 75–100 %. `level_lint` prints each section's density and highest tier. Errors:
  - finale enemy density below 1.3× the middle (target 1.4×);
  - the finale's highest tier not one above the act's ceiling (T4 stays T4);
  - an opening or middle enemy above the act's ceiling.

  Warning: the opening already uses the act's top tier.
- [ ] ZN-I15 [auto] A checkpoint sits within 1.5 screens of the finale start (progress 0.75) in every act.
- [ ] ZN-I16 [auto] In the act before a boss (the last act of a zone with a boss):
  - a checkpoint is within about 2 screens of the arena gate (a node named `BossGate`/`ArenaGate`, otherwise the goal);
  - the gauntlet ends in a short calm corridor (manual: no enemies in the last ~1 screen before the gate).
- [ ] ZN-I17 [auto] Finale enemies really are harder:
  - The base `levels/enemies/enemy_base.gd` (or every enemy script) reads `Difficulty.local(...)` / `progress_at(...)` (source check).
  - When enemies expose a read-only `local_difficulty`, the finale's median is above the middle's; pre-boss acts climb to about D + 1.5 at the gate.
  - Runtime probe on a built act: the same enemy scene placed at progress 0.5 and 0.95 moves faster (`speed_mult(local)`) and attacks sooner (`interval_mult`), and its telegraph is never under 0.35 s.
- [ ] ZN-I18 [manual] The boss approach gauntlet combines every mechanic the zone taught. Its high route is the hardest stretch of the act, and the low route stays survivable.
- [ ] ZN-I11 [manual] Teach → test → twist: the act's new idea appears first where it is safe (no pit or enemy nearby).
- [ ] ZN-I12 [manual] Fairness:
  - No blind drops into pits.
  - An enemy on a fast route is visible at least 1 s ahead at that speed, or can be rolled through.
  - Before D5, no enemy within 2 screens after a spring landing, a loop exit or a checkpoint.
  - Backtracking is never more than 3 screens without a visible reason.
- [ ] ZN-I13 [manual] Every act has a fast HIGH route and a safer LOW route. In later acts the high route is harder to stay on and the low route longer.

## D. Zone 1 – Retro Rush Hills (`z1_retro_rush_hills`)

- [ ] Z1-1 [manual] Bright checkered dirt, palm trees, loops, waterfalls; original art, no recognisable copies of existing games' levels.
- [ ] Z1-2 [auto] Every loop completes clockwise and counter-clockwise at speed (bot or timeline).
- [ ] Z1-3 [manual] Waterfalls are decoration (no collision) or behave as documented.
- [ ] Z1-4 [manual] Teaches the mechanics: first spring, first loop and first enemy are safe and readable.

## E. Zone 2 – Wizard Academy (`z2_wizard_academy`)

- [ ] Z2-1 [manual] Magic-school castle, candle-lit halls; pill-robot enemies in zone costume (spellbook pill = Floater/Diver, knight pill = Armored pill, docs/LEVELS.md); original names and designs.
- [ ] Z2-2 [auto] Shifting staircases: rideable, crush rule (C3) holds, never leave the player inside a step.
- [ ] Z2-3 [auto] Moving bookshelves: push the player out or crush, never trap without death.
- [ ] Z2-4 [auto] Flying-broom section: `GameCamera.start_autoscroll()` starts, player `clamp_rect` is set; the player cannot get ahead of or behind the screen; caught by the left edge against a wall = death.
- [ ] Z2-5 [auto] Broom section: dying mid-section respawns before it and restarts the autoscroll; the section ends with `stop_autoscroll()` and an empty `clamp_rect`.
- [ ] Z2-6 [auto] Pause during the broom section pauses the autoscroll.
- [ ] Z2-7 [manual] Wizard hat drawn on every frame of every animation.

## F. Zone 3 – Capital Mansion (`z3_capital_mansion`)

- [ ] Z3-1 [manual] Grand white mansion and lawn, rooftops, ballrooms, underground bunker.
- [ ] Z3-2 [manual] No real people, real seals, flags, logos, signage or recognisable real buildings' insignia.
- [ ] Z3-3 [manual] Drone pills (Floater/Diver with a searchlight) and clerk pills (Pellet pill throwing paper): original designs, readable as enemies.
- [ ] Z3-4 [auto] Rooftop gaps: falling below `Bounds` kills; no ledges that look solid but are not.
- [ ] Z3-5 [manual] Sunglasses drawn on every frame of every animation.

## G. Zone 4 – Neon Rush Remix (`z4_neon_rush_remix`)

- [ ] Z4-1 [manual] Zone 1 ideas re-dressed in synthwave neon; layout not a 1:1 copy of Zone 1.
- [ ] Z4-2 [auto] Music track `z4` is faster than `z1` (tempo noted in the UI/audio report).
- [ ] Z4-3 [auto] No effects unsupported by the Compatibility renderer (no errors in a web build console, smoke clean).
- [ ] Z4-4 [manual] Neon glow does not hide hazards or the player; no full-screen flashing faster than 3 Hz.

## H. Title screen and zone select

See `07-ui.md` (owned by the UI/audio agent). Zone-side checks:

- [ ] ZN-H1 [auto] Every zone in `ZoneRegistry.ZONES` starts from the zone select once its act 1 exists.
- [ ] ZN-H2 [auto] Unbuilt stages fall back to the dev menu with a warning, never a crash.
