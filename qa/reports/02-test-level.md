# QA report 02: levels (test zone) @ 85958e3

- **Date:** 2026-10-28
- **Reviewed:**
  - Branch `levels` at 85958e3, which includes main 6d42411: the test zone, LevelRoot, tiles, objects and pill-robot enemies.
  - Also merged with `physics` 02677a7 (main + 53a6989): `git merge-tree` is clean.
- **Checklist:** `qa/checklists/02-test-level.md`, plus the rules in docs/LEVELS.md and the physics review.

## Verdict: MERGE, with one major for the physics owner

The test zone is solid:
- Every checklist item that can be checked passes.
- The level lint shows 0 errors and is on the D0 row.
- The bot clears the zone in about 28 s with 0 deaths.
- Fuzz runs are clean.

The one major, BUG-02-01, is a loop behaviour in `terrain/loop.tscn` (physics), not something the levels branch introduced. It shows on the playground loop too. It shouldn't block this merge, but it should be fixed before real zone acts reuse loops.

## Tool results

| Check | Result |
|---|---|
| Scope | Only `levels/` and `tests/levels/` changed against main. |
| Import | clean |
| Test suite | 339 passed, 0 failed (2 runs). 44 of them are the level agent's own tests. QA's new physics guards skip until 53a6989 is on main. |
| Merged with physics 02677a7 | Clean; 344 passed, 0 failed. QA's corner and ceiling guards arm and pass. The bot clears the zone at frame 1660. |
| `scene_smoke.sh` | 24 run, 24 passed |
| `originality_scan.sh` | 0 hits (367 files) |
| Level lint, design rules | 0 errors. 2 × `step.height` (16 px) at x 3921/3953: the deliberate spike block, accepted (TL-R8). |
| Level lint, difficulty (D0) | On the row. Ramp details below the table. |
| Bot, runner (5 variants) | Reaches the goal with 0 deaths. Goal frames are 1824 (no extra jumps), 1660 (jump every 90), 1716 (every 150) and 1718 (every 240), so about 28 s against a par of 60 s. With a jump every 45 frames it reaches the goal only at frame 4512, after about 50 s stuck **inside the loop** (BUG-02-01). |
| Bot, fuzz without pause | 4 × 18,000 frames plus 1 × 36,000 (TL-K1): 0 errors, 0 NaN, 0 deaths, 0 orphans; nodes fall from 444 as tickets are taken. Two runs end stuck inside the loop (BUG-02-01). TL-K2 (1 hour) was not run. |
| Visual pass | Recorded run: `qa/reports/evidence/02-test-level/test_zone_run.png`. Camera, HUD, ticket counter, pill robots, parallax placeholders and the tally all render cleanly with no errors. |

Difficulty details (D0):
- 19.8 screens (row 20), 4 enemies (0.20/screen, all T1), 2 checkpoints (row 2), 130 tickets (6.6/screen against 6.0, +10 %), R1.
- Ramp by section, in enemies per screen: opening 0.2, middle 0.1, finale 0.4. The finale is the densest, and a checkpoint sits at the finale start.
- The finale tops out at T1, while the ramp table asks for one tier above the act's ceiling (T2). For the test zone the lint only reports this (FYI; see below).

## Checklist 02

| Items | Result |
|---|---|
| TL-A1–A5 structure | PASS. `test_contracts` passes with LevelRoot; smoke 24/24; registry path. The PlayerStart standing test is the level agent's. |
| TL-B1 features in order | PASS. Flats, stump, 1:2 and 1:1 hills, up spring onto the mesa, 45° descent, diagonal spring over pits, checkpoint, breakable wall and roll tunnel, booster, loop, quarter pipe, finale, goal (see the run sheet). |
| TL-B2 objects referenced | PASS |
| TL-B3 bot reaches the goal | PASS (0 deaths) |
| TL-C1–C4 tickets | PASS (level agent's tests: collect once, overlap counts 2, waits while hurt, row at 16 px/f, 100 tickets = 1 life) |
| TL-D1–D6 springs | PASS. TL-D5 (spring under a low ceiling) still allows 8 px until 53a6989 is on main; QA's ceiling guard covers it after the merge (0.000 px). |
| TL-E1–E4 booster | PASS |
| TL-F1–F4 breakable wall | PASS |
| TL-G1–G6 enemies | PASS (contract, stomp, hurt, two in one frame, ledges, scaling with D) |
| TL-G7 look | PASS (manual). Capsule pill robots with a dark outline, readable. The checklist item was updated from "red". |
| TL-H1–H4 checkpoint | PASS |
| TL-I1–I4 goal and tally | PASS. After the test zone, the next stage falls back to the boot menu (no zone 1 yet). |
| TL-J1–J6 bounds, death, respawn | PASS (level agent's tests and lint) |
| TL-K1 fuzz | PASS (36,000 frames, clean) |
| TL-K2 1-hour bot | not run |
| TL-K3, K4 manual | PASS on the recorded run. No seams or objects half inside terrain; nothing needs frame-perfect input. |
| TL-R1–R7 rules (lint) | PASS |
| TL-R2 "the runner completes every loop" | **FAIL** for a runner that jumps on the run-up (BUG-02-01) |
| TL-R8 accepted warnings | PASS (spike block) |

LEVELS.md rules:
- **No enemy within 2 screens after a checkpoint or a loop exit:** PASS (checked statically).
- **The same after a spring:** the side spring at the start (x 40) faces the walker 549 px (1.3 screens) ahead; see BUG-02-02.
- **Teach → test → twist and fairness:** PASS on the recorded run. There are no blind drops; the pits are announced by the spring gate.

## Bugs

### BUG-02-01: Jumping into a loop traps Sproto inside the ring (FIXED in 883c648)

- **Severity:** major. It happens on the main route; a jump on the run-up is common; and the escape (spin dash or roll) is not obvious to a first-time player.
- **Owner:** physics (`terrain/loop.tscn` / TerrainLoop path switching)
- **Repro:**
  - `qa/repros/physics/BUG-02-01_loop_jump_trap.gd`: the playground loop at x 2400. Copy it to `tests/qa/test_bug_02_01.gd`; it fails while the bug exists.
  - Bot timeline: `qa/repros/levels/BUG-02-01_runner45_inputs.json`. Replay with `-- --zone=test_zone --stage=1 --inputs=<file>`; Sproto is stuck from frame 1123.
  - Evidence: `qa/reports/evidence/02-test-level/BUG-02-01_loop_jump_trap.png`.
- **Expected:** As with a too-slow ground entry (01-physics), Sproto can walk back out to the left, or runs through on path A.
- **Actual:**
  - A jump at run speed (6 px/f) from about 120–520 px before the loop centre lands Sproto inside the ring on **path B**. It happens at both test-zone x 5050–5420 and playground x 1882–2182.
  - Holding left for 5 s doesn't leave the ring (min x 2333 against a footprint edge of 2160).
  - Holding right rocks him up the inner side, because 6 px/f is short of the ~10 px/f a full turn needs.
  - Only a spin dash or roll escapes. The runner bot stayed inside for about 50 s, and fuzz runs ended inside.
  - Same on physics 02677a7 (with 53a6989).
- **Fix ideas:**
  - Let the entry-side switcher (or the ring's lower-left arc) set path A when Sproto is inside the ring below the centre and moving left.
  - Or only switch paths on the ground (classic "grounded only" switchers), so a mid-air entry stays on path A and can walk out.

### BUG-02-02: Side spring at the start faces a walker 1.3 screens ahead (FIXED in 69f2067)

- **Severity:** minor (advisory)
- **Owner:** levels (`levels/test_zone/build_test_zone.gd`)
- **Actual:** The side spring at x 40 pushes Sproto right, toward the stump and the walker at x 589 (549 px). The LEVELS.md rule asks for 2 screens after a spring landing, below D5. A side spring has no landing, so this is a judgement call: the stump stops a launched player first.
- **Fix:** Move the walker 300 px further right, or accept it with a note.

## FYI

- **Test zone ramp:** the finale tops out at T1, but the ramp table asks for one tier above the act's ceiling (T2). For D0 the lint only reports it. If the director wants the test zone to preview the ramp, make one finale pill a T2.
- **Lint changes from this review:**
  - A plain group node that holds the items ("Tickets", "Checkpoints") is now a container: its contents count, not the node (the level agent's report).
  - D0 ramp findings are warnings.
  - The fuzz bot has a `--no-pause` option, so the real pause menu can't end fuzz runs through QUIT.

## Re-check: levels @ 69f2067 (on main 41fb2c4): MERGE

- **Scope:** `levels/test_zone/` and `tests/levels/` only.
- **Checks:** a single fresh import has 0 errors; 348 passed, 0 failed; smoke 25/25; 0 originality hits.
- **Level lint:** 0 errors. Its 3 warnings are all accepted: the spike-block step ×2 and the report-only D0 `finale_tier`.
- **Spring test tightened:** the spring-under-ceiling test now allows 0.1 px instead of 8 px, and it passes (physics 53a6989 is on main).
- **BUG-02-02 FIXED:** the side spring is on the mesa at x 2080. A static check of every checkpoint, spring and loop exit finds no enemy within 2 screens ahead of any of them.
- **Recorded run (Dev replay through the bot, `--policy=none`):** goal at frame 1519, 0 deaths, score 12,700 (every enemy beaten).
- **Bot runner:** goal at frames 1599, 1689 and 1605 (jump every 0/150/240), 0 deaths.
  - With a jump every 90 frames the goal comes at 2395. Sproto spends 6.4 s at x 5630 inside the loop, which is BUG-02-01 again (physics, fix in progress); he gets out on his own.
- **Still open:** BUG-02-01 (major, physics), which I'll re-check when the physics agent reports.

## Re-check: BUG-02-01 fix, physics @ 883c648 (merged with main 4b18adb): FIXED

- **Fix:** LoopGuard (`terrain/loop_guard.gd`), plus 50d932a (UI-01/02) and decc4af (perf).
- **Merge:** `git merge-tree` with main 4b18adb is clean.
- **Checks:** 0 import errors; 360 passed, 0 failed; smoke 24/24; 0 originality hits.
- **QA repro** (`qa/repros/physics/BUG-02-01_loop_jump_trap.gd`): it now passes. Sproto still lands inside the ring, at (2366, -28) on path B, but holding left walks him out.
- **New QA guard, `tests/qa/test_loop_escape.gd`:**
  - 28 tests over radii 48, 80, 112 and 200, with 23 awkward starts per radius:
    - drops into the ring and onto both feet;
    - respawns inside the ring and at the footprint edges;
    - slow ground entries at 1.5/3/4.5 px/f, running and rolling, from both sides;
    - spin dashes and hurt knockback inside;
    - jumps into the ring from both run-ups at 4 take-off distances.
  - After each start, holding left and (separately) holding right for 8 s must each leave the loop, and Sproto must never end up inside terrain.
  - On 883c648 all 28 tests pass. Without the guard (53a6989 plus a stub `loop_guard.gd`), 21 of 28 fail. The guard skips until `terrain/loop_guard.gd` exists.
- **Bots on the test zone:**
  - The runner reaches the goal at every jump interval: never, 30, 45, 60, 90, 120, 150 and 240 frames. Goal frames run 1599–2449, with 0 deaths and no stuck period before the goal.
  - The runner jumping every 45 frames, which was trapped before, now reaches the goal at frame 1639.
  - Fuzz without pause, 4 × 5 min: 0 errors, 0 NaN, 0 orphans. On the playground (2 × 5 min) also clean.
- **Frame identity (playground, physics branch alone, 53a6989 vs 883c648):**
  - Fuzz seeds 5 and 9 and runner jump-every 240 are byte-identical.
  - Runner jump-every 45 differs from frame 521, inside the r112 loop: before the fix he stayed trapped there to the end, max x 2493; now he walks out and reaches the end, x 4350.
  - Runner jump-every 90 differs from frame 1004, inside the r80 loop, after a turn back; both runs reach x 4350.
  - That is the accepted behaviour change: a turn back now opens the way out.

**BUG-02-03 (new, minor; physics):**
- In a **radius-48** loop, a Sproto standing still inside who holds **right** pushes on the steep right quarter forever. He never rolls back past the bottom centre, so the guard never opens that side. 9 of the 23 starts at r48 show it.
- Holding left walks out, and a spin dash goes through. It doesn't affect radius 80 and up (playground and test-zone loops are 80/112).
- `test_loop_escape.gd` logs these cases and only requires one direction below r80.
- Fix idea: let the guard also open the way ahead for a standing or pushing Sproto once he is past the bottom centre, not only after a turn back.
