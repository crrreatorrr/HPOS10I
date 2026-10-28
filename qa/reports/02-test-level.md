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

### BUG-02-01: Jumping into a loop traps Sproto inside the ring

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

### BUG-02-02: Side spring at the start faces a walker 1.3 screens ahead

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
