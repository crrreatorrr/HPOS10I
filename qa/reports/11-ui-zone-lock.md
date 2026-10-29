# 11 — ui-audio zone-select lock (62d081b) — merge review

Branch: `ui-audio` @ 62d081b (4 commits ahead of main a8616a7, two of them merges of main).
Review copy: `git merge-tree --write-tree main ui-audio` archived to a fresh dir;
the copy still has the z3/z4 scenes on disk, so it exercises the *released* gate
rather than the *scene missing* gate.

Scope: the diff against main is exactly 2 files (+35 / −7):

- `ui/zone_select/zone_select.gd` — adds `is_zone_released()` and gates `open`
  on it, so unreleased zones are locked the same way unbuilt ones already were.
- `tests/ui/test_zone_select.gd` — covers the locked state.

## Verdict: MERGE

## What was checked

| # | Check | Result |
|---|-------|--------|
| 1 | Zone 3 / Zone 4 act buttons on the zone-select grid | `disabled = true`, `focus_mode = FOCUS_NONE` (0) for all z3/z4 acts; z1/z2 enabled |
| 2 | Keyboard navigation | From the last Zone 2 act: row 1 → row 2 → BACK → wraps to row 1; focus never lands on a z3/z4 button |
| 3 | Emerald tray | 8 slots, unchanged |
| 4 | Keyboard path title → zone select → Zone 2 Act 1 | reaches Zone 2 Act 1 (frame 112 of the Dev timeline clock) |
| 5 | Touch path (synthetic taps) → Zone 2 Act 1 | reaches Zone 2 Act 1 (frame 162) |
| 6 | Tap on a disabled Zone 3 button | no scene change, no script error |
| 7 | `tools/qa/suite_framerates.sh . --rates=30,60,144` | 30: 584/0 · 60: 582/2 · 144: 584/0 (see note) |
| 8 | `tools/qa/scene_smoke.sh` | 68 run, 68 passed |
| 9 | `tools/qa/originality_scan.sh` | 439 terms, 639 files, 0 hits |
| 10 | QA tests on `qa` (`tests/qa/test_ui_review.gd`, `test_project_setup.gd`) | pass on the merged tree |

Note on 7: the two 60 Hz failures were both playtest-bot cases
(`levels/test_z1_acts.gd :: test_act_2_recorded_run_…`,
`levels/test_z2_acts.gd :: test_playtest_bot_clears_both_acts`) reporting
"no bot result". They ran while `scene_smoke.sh` was spawning Godot
instances in parallel on the same copy; re-run alone at `--fixed-fps 60`
both files pass 8/8. Environmental (bot sub-process starved/timed out), not a
regression on this branch — the same tests pass at 30 and 144 in the same run
and the branch does not touch levels or the bot.

## Notes (not blocking)

- The gate reads `ZoneRegistry.is_released()` directly (62d081b), so the UI and
  the web-build exclusion share one source of truth. Good.
- The lock still relies on the earlier UI contract that disabled buttons also get
  `FOCUS_NONE`; the new test only asserts `disabled`. If someone later changes
  the focus handling the keyboard skip (check 2) would silently regress — a
  one-line assertion on `focus_mode` in `tests/ui/test_zone_select.gd` would
  pin it. Suggestion for the UI agent, not a blocker.
- Live main a8616a7 ships without the z3/z4 scenes at all (see
  `qa/reports/10-web-check-a8616a7.md`), so on the web both gates apply; this
  branch matters for desktop/dev builds where the scenes exist on disk.
