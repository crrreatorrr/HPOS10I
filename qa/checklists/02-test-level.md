# 02 – Test level

Branch: `levels` · Owner: level agent · Scene: `res://levels/test_zone/test_zone.tscn`
(zone id `test_zone`, run with `godot --path . -- --zone=test_zone`).

Tags: **[auto]** script/test/timeline · **[manual]** human judgement.

## A. Structure

- [ ] TL-A1 [auto] `tests/qa/test_contracts.gd`: root uses `LevelRoot`, has `PlayerStart` (`Marker2D`) and `Bounds` (`ReferenceRect`, non-zero size).
- [ ] TL-A2 [auto] `tools/qa/scene_smoke.sh`: the level and every scene in `levels/` run 120 frames with no `ERROR`/`WARNING`.
- [ ] TL-A3 [auto] `ZoneRegistry.stage_path("test_zone", 1)` exists and the dev menu lists it.
- [ ] TL-A4 [auto] Missing UI/art does not crash: with `ui/` and `assets/backgrounds/` absent the level still runs (LevelRoot checks `ResourceLoader.exists`).
- [ ] TL-A5 [auto] `PlayerStart` is on solid ground: bot with no input for 120 frames ends `grounded` and not dead.

## B. Required features (each present and working)

- [ ] TL-B1 [manual] Present in order or reachable: flat ground, gentle slope (about 20–25°), steep slope (about 45–60°), full loop (`terrain/loop.tscn`), quarter pipe, up spring, diagonal spring, speed booster, breakable wall, 2 simple enemies, checkpoint, goal sign.
- [ ] TL-B2 [auto] Scene references each object scene (grep the `.tscn` for the loop, spring, booster, breakable wall, enemy, checkpoint and goal sign `ext_resource` paths).
- [ ] TL-B3 [auto] Bot (`--zone=test_zone --frames=7200`) reaches the goal x (`level_completed` true) with 0 deaths, or every stuck period it logs is a documented intentional obstacle.

## C. Tickets (`levels/objects/ticket.tscn`)

- [ ] TL-C1 [auto] Collect: +1 ticket, sfx `ticket`, ticket disappears, `GameState.tickets_changed` fires.
- [ ] TL-C2 [auto] Two overlapping tickets collected on the same frame count 2, never 1 or 3.
- [ ] TL-C3 [auto] Tickets are not collected while dead; 100 tickets gives exactly one life.
- [ ] TL-C4 [auto] Collecting at 16 px/f does not skip tickets in a row (area big enough or swept).

## D. Springs

- [ ] TL-D1 [auto] Up spring: `player.launch()` with the documented speed (classic yellow about -10 px/f); sfx `spring`; state `spring`; not attacking.
- [ ] TL-D2 [auto] Diagonal spring launches at 45° with equal x and y magnitude in the spring's facing.
- [ ] TL-D3 [auto] Triggers from every approach: walking in, falling on it, rolling into it, spin dash into it, landing on its edge.
- [ ] TL-D4 [auto] Spring touched while dead does nothing; spring touched while hurt launches and ends hurt (or documented).
- [ ] TL-D5 [auto] Spring under a low ceiling does not push the player into the ceiling.
- [ ] TL-D6 [auto] Re-triggering every frame while standing on it does not stack speed.

## E. Speed booster

- [ ] TL-E1 [auto] Calls `push_ground(speed)` in its facing direction; sfx `booster`; control lock as documented.
- [ ] TL-E2 [auto] Entering faster than the booster speed keeps the higher speed (or documented).
- [ ] TL-E3 [auto] Entering from the wrong side (running left into a right booster): documented result, no stuck.
- [ ] TL-E4 [auto] Booster triggered while airborne over it: no effect or documented.

## F. Breakable wall

- [ ] TL-F1 [auto] Breaks only when the player is rolling/spin dashing (or the documented rule); solid otherwise.
- [ ] TL-F2 [auto] Breaking at 16 px/f: wall breaks, player does not stop dead and does not tunnel before it breaks.
- [ ] TL-F3 [auto] sfx `break_wall` once; debris does not collide with the player; cannot break twice.
- [ ] TL-F4 [auto] After death and respawn the wall state is consistent (restored if before the checkpoint).

## G. Enemies (2)

- [ ] TL-G1 [auto] Contact while `is_attacking()`: enemy dies, +100 score, sfx `enemy_pop`, `player.bounce_off()` called.
- [ ] TL-G2 [auto] Contact while not attacking: `player.hurt(enemy_position)`; during invincibility: no hurt.
- [ ] TL-G3 [auto] Jumping into an enemy from below while rising: the documented outcome, no double hit.
- [ ] TL-G4 [auto] Two enemies touched on the same frame: both resolved, one bounce, score +200.
- [ ] TL-G5 [auto] Enemies use `Area2D` with mask bit 5, sit on layer 6, extend `Enemy` (`levels/enemies/enemy_base.gd`).
- [ ] TL-G6 [auto] Enemies do not walk off ledges or through walls; they respawn when the level reloads.
- [ ] TL-G7 [manual] Placeholder enemies are red and readable.

## H. Checkpoint

- [ ] TL-H1 [auto] First touch: `GameState.set_checkpoint()`, sfx `checkpoint`; second touch does nothing.
- [ ] TL-H2 [auto] Death after the checkpoint: respawn at the checkpoint, timer restored to `checkpoint_time`, tickets 0, lives -1.
- [ ] TL-H3 [auto] Touching an earlier checkpoint after a later one does not move the respawn back.
- [ ] TL-H4 [auto] Passing the checkpoint at 16 px/f still triggers it.

## I. Goal sign

- [ ] TL-I1 [auto] Triggers once: `GameState.complete_level()` (timer stops), sfx `goal_sign`, player frozen or victory pose, tally, then `SceneRouter.next_stage()`.
- [ ] TL-I2 [auto] Passing at 16 px/f or in the air above it still triggers it.
- [ ] TL-I3 [auto] Dying on the same frame as the goal: one outcome only (no life lost after the goal, no double scene change).
- [ ] TL-I4 [auto] Pause during the goal/tally sequence resumes cleanly.

## J. Bounds, death and respawn

- [ ] TL-J1 [auto] Falling below `Bounds` bottom kills; death waits about 2 s then `SceneRouter.respawn()`.
- [ ] TL-J2 [auto] Pausing during the 2 s death wait also pauses the wait (no respawn while paused).
- [ ] TL-J3 [auto] Camera limits equal `Bounds`; the camera never shows outside them.
- [ ] TL-J4 [auto] Losing the last life goes to game over (or title), not to a crash or a respawn with 0 lives.

## K. Edge cases

- [ ] TL-K1 [auto] Bot `--policy=fuzz` 36 000 frames on the test level: no errors, no NaN, no softlock.
- [ ] TL-K2 [auto] Bot 216 000 frames (1 hour): node count and orphans stable, no errors.
- [ ] TL-K3 [manual] No visible seams, gaps or overlaps between terrain pieces; objects not half inside terrain.
- [ ] TL-K4 [manual] Every feature is reachable without frame-perfect inputs.
