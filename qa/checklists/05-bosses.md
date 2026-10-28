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

- [ ] BOS-C1 [auto] Every attack is preceded by a telegraph (visual + sfx `boss_telegraph`) of at least `Difficulty.telegraph(base, d)` and never under 0.35 s before the first damaging frame (log telegraph and attack frames). d is the boss's own value from `Difficulty.boss(zone_id)` (BOS-H1, BOS-H4).
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

## H. Boss difficulty (docs/LEVELS.md "Bosses", `Difficulty.boss(zone_id)`, main a866341)

Expected values. Multipliers are at the boss's own d; the telegraph is `Difficulty.telegraph(base, d)`, floored at 0.35 s.

| Boss | d | Weak window | Attacks per cycle | Telegraph | Escalation after hits 4 and 6 | Desperation (hits 7–8) | Ticket refills |
|---|---|---|---|---|---|---|---|
| Rug Pull (Z1) | 2.5 | 2.0 s | 1 | 0.8 → 0.752 s | ×1.15 | no | 3 |
| Library Demon (Z2) | 4.5 | 1.7 s | 2 | 0.7 → 0.602 s | ×1.15 | no | 2 |
| Broccoli Head (Z3) | 8 | 1.1 s | 3 | 0.5 → 0.36 s | ×1.25 | yes | 1 |
| The Executive (Z4) | 10 | 0.9 s | 4 | 0.45 → 0.35 s (floor) | ×1.3 | yes | 1 |

Speed and interval multipliers:

| Boss | `speed_mult` | `interval_mult` |
|---|---|---|
| Rug Pull | 1.09 | 0.925 |
| Library Demon | 1.21 | 0.825 |
| Broccoli Head | 1.42 | 0.65 |
| The Executive | 1.54 | 0.55 |

Measure every item with a probe that logs, per physics frame: boss state, attack start and end, telegraph start, damaging hitboxes active, weak point hittable, hits, and tickets spawned. Use the documented debug hook to start the fight at hit N.

- [ ] BOS-H0 [auto] `tests/qa/test_boss_difficulty.gd` checks the table itself (runs now):
  - d rises boss by boss, the weak window shrinks, attacks per cycle never drop, and refills never rise;
  - every `telegraph(base, d)` is at least 0.35 s;
  - desperation only for Z3/Z4;
  - the arena stage's `for_stage` equals the boss d;
  - once `bosses/` has scripts, they read `Difficulty.boss(`.
- [ ] BOS-H1 [auto] The arena stage's D is `Difficulty.for_stage(zone, acts + 1)` = the boss's d (2.5 / 4.5 / 8 / 10). The boss reads `Difficulty.boss(zone_id)` and the multipliers at that d, never hard-coded numbers (grep `bosses/`).
- [ ] BOS-H2 [auto] **Weak-point window.** Per opening, the weak point (`boss_weak_point` area enabled and hittable) stays open `weak_window` seconds ±1 frame. Check every opening of every phase. Escalation must not shorten it below the table unless LEVELS.md says so.
- [ ] BOS-H3 [auto] **Attacks per cycle.** Between two openings, the boss starts exactly `attacks_per_cycle` attacks in phases 1–2. In desperation, combined attacks may overlap but are still counted and listed in the report.
- [ ] BOS-H4 [auto] **Telegraph floor.** In phase 1, every attack's telegraph starts at least `Difficulty.telegraph(base, d)` before its first damaging frame (table above). In every phase, including after escalation and in desperation, it is never under 0.35 s. Report the shortest telegraph per boss and phase.
- [ ] BOS-H5 [auto] **Escalation.** Mean move speed (and attack rate) after hit 4 is ×`escalation` of phase 1 (±5 %), and after hit 6 ×`escalation`² (Executive ×1.69). Hits 4 and 6 also emit `phase_changed`.
- [ ] BOS-H6 [auto] **Desperation.** Broccoli Head and The Executive enter an extra phase at hit 7: `phase_changed` fires, it is the fastest phase, and the documented combined attacks appear. The Rug Pull and Library Demon have no desperation phase.
- [ ] BOS-H7 [auto] **Ticket refills.** Over a whole fight the arena hands out exactly `ticket_refills` small ticket bursts (3 / 2 / 1 / 1), each reachable without taking damage. No other ticket source exists in the arena.
- [ ] BOS-H8 [auto] **Fair after a respawn.** After a death in the arena the player respawns at the checkpoint right outside the gate (04 ZN-I16). For the first 1.0 s after control returns: no damaging hitbox is active, no projectile spawns, and no attack starts. The boss doesn't start a chain while the player is still invulnerable from the respawn.
- [ ] BOS-H9 [auto] **Fairness proof for Z3 and Z4.** For each phase (1, 2, desperation) of Broccoli Head and The Executive, a scripted route proves the phase can be cleared with no damage:
  - an input timeline `tests/qa/inputs/bosses/<boss>_phase<N>.json`, or a deterministic bot policy;
  - started at that phase through the debug hook;
  - lands the phase's hits with 0 `hurt` events.
  The full chain of routes (hits 1–8) also wins from a fresh fight, taking at most 1 hit.
- [ ] BOS-H10 [auto] **"Very difficult" evidence (Z3, Z4).** Run 5 bot runs per boss: `runner` with jump-every 45/90/150 and `fuzz` seeds 1 and 2, 3 minutes each. Record hits landed and damage taken.
  - Expected: the simple bots land few hits (median ≤ 2 of 8) and run out of tickets and lives, while the scripted expert route from BOS-H9 still wins.
  - Z1 and Z2 for contrast: the runner lands at least 4 hits.
  - Report the table, so "very difficult" is backed by numbers, not taste.
- [ ] BOS-H11 [auto] Later bosses start harder. Phase-1 mean attack interval and fastest move speed rise boss by boss (Z1 < Z2 < Z3 < Z4), and the weak window shrinks (2.0 > 1.7 > 1.1 > 0.9 s).
- [ ] BOS-H12 [manual] Very difficult but fair at Z3/Z4: every attack is readable, there is always a safe spot or answer, nothing is unavoidable at top speed, and a first-time player can learn it within a few attempts. The director plays both.

## G. Originality

- [ ] BOS-G1 [auto] `tools/qa/originality_scan.sh` finds nothing in `bosses/`.
- [ ] BOS-G2 [manual] Boss names, dialogue and visuals are original parodies of generic types, not of real people or existing characters.
