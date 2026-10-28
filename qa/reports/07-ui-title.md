# QA report 07b: ui-audio title screen, zone select, tally overlap fix @ b6e8329

- **Date:** 2026-10-28
- **Reviewed:**
  - Branch `ui-audio` at b6e8329 (title screen and zone select) and 69dcdd9 (tally panel kept above the bottom hint line).
  - Checked merged with main e8947e9 via `git merge-tree`.
  - Only `ui/` and `tests/ui/` changed.
- **Checklist:** 07-ui sections A, B and I.

## Verdict: MERGE, together with qa 3a71797

- **One QA test fix must land with or before this branch.** QA's own `tests/qa/test_ui_review.gd` used the real `core/main.tscn` as a menu scene. Now that boot goes on to the title, its deferred scene change freed the test's nodes. That caused 6 failures in the merged suite, cascading into 3 of the UI agent's tests.
- **Fixed on qa (3a71797)** with a stand-in menu scene. Merged suite: 483 passed, 0 failed.
- **This is QA's bug, not the UI agent's.**

## Tool results

| Check | Result |
|---|---|
| Import / tests / smoke / originality | 0 errors / 483 passed, 0 failed (with qa 3a71797) / 38 of 38 / 0 hits |
| Frame rates | All 80 UI tests pass at 30 and 144 fps (`suite_framerates.sh -- --filter=ui/`). |
| End-to-end menu flow (bot, Dev timeline from boot) | boot (frame 0) → title (1) → jump → zone select (42) → jump on the first act → Zone 1 Act 1 (102), with the player found |
| Menu timeline fuzz | 4 seeds × 1,500 frames of random move, jump and pause presses from boot: 11–25 scene changes per run (title ↔ zone select ↔ acts ↔ pause and quit), 0 errors, 0 same-frame double changes, no stuck screens |

## Checklist 07

| Item | Result |
|---|---|
| UI-A3 boot reaches the title | PASS; `-- --dev` still shows the boot menu (UI agent's test) |
| UI-B1 title | PASS. Jump, accept, Start, tap and click go to the zone select once. There is a 0.25 s input grace, and "PRESS JUMP OR TAP TO START" blinks. |
| Title disclaimer (FQ-28) | PASS. One line on the title: "A free, non-commercial fan parody. All characters and art are original." |
| UI-B2 zone select | PASS. 4 zones × 2 acts from ZoneRegistry, and unbuilt acts are greyed out and skipped. Navigation wraps. Pause, Esc or BACK returns to the title; Enter chooses. Each act has its emerald slot. |
| UI-B3 unbuilt acts | PASS: locked and skipped, never a crash |
| UI-B4 spam | PASS: menu fuzz, no double start |
| UI-B5 look | PASS. Crisp pixel font; original logo text; Sproto at 2× on the backdrop. The emerald count line uses `Emeralds.NAME` (the approved exception). The evidence image has that name blacked out. |
| Tally overlap (69dcdd9) | PASS. The UI agent's `test_panel_clears_the_hud_and_the_hint_line` checks the HUD counters and the playground's bottom hint line in three modes, and it passes at 30, 60 and 144 fps. |

Evidence: `qa/reports/evidence/07-ui-title/title_and_zone_select.png` (top row keyboard mode, bottom row `--touch`).

## Findings

| ID | Severity | Owner | Finding | Fix |
|---|---|---|---|---|
| UI-T1 | polish | ui-audio | In touch mode the zone select's bottom hint still reads "JUMP: START  PAUSE: BACK TO TITLE". | Show "TAP AN ACT  TAP BACK FOR THE TITLE" when `Display.is_touch`, as the playground hint does. |
