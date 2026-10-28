# 05 – Bosses

Branch: `bosses` · Owner: boss agent · Base: `bosses/boss_base.gd` (`class_name Boss`),
arenas `bosses/<boss_id>/arena.tscn` (LevelRoot + `bosses/arena.gd`).
Boss ids: `rug_pull` (Z1), `library_demon` (Z2), `broccoli_head` (Z3), `the_executive` (Z4).
Run one with `godot --path . -- --zone=<zone_id> --stage=3`.

Tags: **[auto]** script/test/timeline · **[manual]** human judgement.

## A. Base class and contract

- [ ] BOS-A1 [auto] `tests/qa/test_contracts.gd`: `Boss` extends `Node2D` with signals `hit_taken(hits_left)`, `phase_changed(phase)`, `defeated`; every arena is a `LevelRoot` with `PlayerStart` and `Bounds`.
- [ ] BOS-A2 [auto] Weak point `Area2D` in group `boss_weak_point`, harmful body `Area2D` in group `boss_body`, both on layer 9, masking bit 5.
- [ ] BOS-A3 [auto] Scene smoke: each arena runs 120 frames, no `ERROR`/`WARNING`.

## B. Hits and health (every boss)

- [ ] BOS-B1 [auto] Exactly 8 valid hits defeat the boss: `hit_taken` emits 7, 6, … 0 in order; `defeated` emits once.
- [ ] BOS-B2 [auto] A hit only counts when the weak point is touched while `player.is_attacking()` (jump, roll, spin dash); the player gets `bounce_off()`.
- [ ] BOS-B3 [auto] Touching the weak point while not attacking, or the body at any time: `player.hurt()` (unless invincible).
- [ ] BOS-B4 [auto] After each hit: invincible for 60–120 frames with a hit flash; hits during that window do not count, even on the very next frame.
- [ ] BOS-B5 [auto] Weak point overlapped twice on one frame (two shapes, or re-entry) counts once.
- [ ] BOS-B6 [auto] Speeds up after hits 4 and 6: `phase_changed` fires exactly at those hits; attack timings measurably shorter.
- [ ] BOS-B7 [auto] Bot `--policy=fuzz` in the arena 18 000 frames: no errors, no NaN, no softlock; boss health never goes below 0 or above 8.

## C. Telegraphs and fairness

- [ ] BOS-C1 [auto] Every attack is preceded by a telegraph (visual + sfx `boss_telegraph`) of at least `Difficulty.telegraph(base, D)` and never under 0.35 s before the first damaging frame (log telegraph and attack frames). D is the zone's Act 2 value (BOS-H1).
- [ ] BOS-C2 [manual] Every attack is avoidable with normal inputs; there is always a safe spot.
- [ ] BOS-C3 [manual] Fight length 1–3 minutes for a first-time player.
- [ ] BOS-C4 [manual] Phases read clearly (colour, speed or pattern change).

## D. Camera and arena

- [ ] BOS-D1 [auto] Entering the arena calls `GameCamera.lock_to()`; the player cannot leave the arena while the boss lives.
- [ ] BOS-D2 [auto] The boss and its projectiles never leave the arena or go inside terrain.
- [ ] BOS-D3 [auto] Player death in the arena: respawn resets the boss to 8 hits and re-locks the camera; no leftover projectiles.

## E. Defeat sequence

- [ ] BOS-E1 [auto] On defeat: explosions, sfx `boss_explode`, the gate opens, score tally (`ui/tally/score_tally.tscn` `finished`), then `SceneRouter.next_stage()`.
- [ ] BOS-E2 [auto] Projectiles and hazards are removed or harmless after defeat; the player cannot die after the final hit.
- [ ] BOS-E3 [auto] Final hit and player death on the same frame: exactly one outcome, no softlock, no double scene change.
- [ ] BOS-E4 [auto] Pause during the defeat sequence and the tally resumes correctly.
- [ ] BOS-E5 [auto] Camera unlocks (or the stage ends) after defeat.

## F. Specific bosses

- [ ] BOS-F1 [manual] Rug Pull: a magic carpet; the carpet "pull" never pushes the player through floors or walls. [auto] carpet motion keeps the player outside terrain.
- [ ] BOS-F2 [manual] Library Demon: smoke and ink; smoke never hides the weak point or an incoming attack; ink projectiles have a telegraph.
- [ ] BOS-F3 [manual] Broccoli Head: a cartoon teen on a hoverboard; an original design that does not resemble any real person.
- [ ] BOS-F4 [manual] The Executive: a generic businessman, no real person's likeness, no real company logo or brand.
- [ ] BOS-F5 [auto] The Executive's final hit plays in slow motion: `Engine.time_scale` < 1 for at most about 2 s, then exactly 1.0, also if the game is paused or the player dies during it; the next scene starts at 1.0.

## H. Difficulty scaling (docs/LEVELS.md, `core/difficulty.gd`)

- [ ] BOS-H1 [auto] Each arena runs at its zone's Act 2 D: Rug Pull 2, Library Demon 4, Broccoli Head 6, The Executive 8. `Difficulty.for_stage(zone, acts + 1)` matches, and the boss reads `Difficulty.current()` (not a constant).
- [ ] BOS-H2 [auto] The boss scales speed by `Difficulty.speed_mult()`, attack intervals by `interval_mult()` and telegraphs by `telegraph()`. Probe the same boss scene at D 2 and D 8 (set `SceneRouter.zone_id`/`stage`, or call with an explicit D):
  - movement speed ratio `speed_mult(8)/speed_mult(2)` = 1.42/1.06 ≈ 1.34;
  - interval ratio 0.65/0.95 ≈ 0.68;
  - telegraphs never under 0.35 s.
- [ ] BOS-H3 [auto] Later bosses start harder. Record each boss's mean attack interval and its fastest move speed in phase 1. Each is at least as hard as the previous boss's (shorter interval or faster). The base aggression rises with D on top of the multipliers.
- [ ] BOS-H4 [auto] Phase speed-ups after hits 4 and 6 multiply with the D scaling. They never push a telegraph under 0.35 s or an attack interval under the telegraph plus 0.25 s of recovery.
- [ ] BOS-H5 [manual] Still fair at D 8: the 8 hits stay reachable, there is always a safe spot, and the fight lasts 1–3 minutes for a first-time player.

## G. Originality

- [ ] BOS-G1 [auto] `tools/qa/originality_scan.sh` finds nothing in `bosses/`.
- [ ] BOS-G2 [manual] Boss names, dialogue and visuals are original parodies of generic types, not of real people or existing characters.
