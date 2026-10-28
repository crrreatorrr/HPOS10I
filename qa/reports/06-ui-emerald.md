# QA report 06: ui-audio emerald work @ d004c43

- **Date:** 2026-10-28
- **Reviewed:**
  - Branch `ui-audio` at d004c43 (on main 6db21c8): ba09398 (EmeraldIcon), fea0282 (the `emerald_get` chime) and 957a088 (the real act-clear tally, replacing levels' `placeholder_tally`).
  - Only `ui/`, `audio/` and `tests/ui/` changed against main.
- **Not reviewed:**
  - The pending tally-overlap fix: uncommitted in the UI agent's worktree when I started.
  - The title screen and zone select: not committed yet.

## Verdict: MERGE

- The tally keeps the placeholder's contract.
- The emerald moment appears only when it was just won.
- The display name is used only through `Emeralds.NAME`.
- Everything works at 30, 60 and 144 fps and from every input device.
- A real Act 1 clear shows the emerald moment.

## Tool results

| Check | Result |
|---|---|
| Import / tests / smoke | 0 errors / 465 passed, 0 failed / 35 of 35 |
| Originality | 0 hits. The allowlist is now narrowed to the single line `core/emeralds.gd:13` (it was the whole file), so the scan would flag any other use of the name, including elsewhere in that file. Display text comes from `Emeralds.NAME.to_upper()` (`score_tally.gd`). |
| Frame rates (`tools/qa/suite_framerates.sh`) | The tally tests (the UI agent's 9 plus QA's 5) pass at 30, 60 and 144 fps. The EmeraldIcon tests pass at 30 and 144, including `test_width_is_whole_even_pixels_and_never_zero` and `test_one_turn_per_second_at_any_frame_rate`. |
| Audio budget | `emerald_get.ogg` is 13.6 KB (peak -2.7 dBFS, mean -13.9 dB, in line with the other SFX). All audio totals 1.7 MB. A simulated web pack is 2.9 MB (2.0 MB gzip) with 34 Ogg streams; `web_check` reports 0 FAIL, 0 WARN. |

## Checks

| Item | Result |
|---|---|
| Same contract as the placeholder | PASS. QA probe `tests/qa/test_tally_review.gd`: identical `TIME_BONUS` table and `TICKET_BONUS`. 50 s + 20 tickets adds exactly 3000 + 2000 to the score. `finished` fires exactly once. `zone_id`/`act` default to GameState (the UI agent's test). |
| A held jump doesn't skip | PASS. Jump held from before the tally appears: still counting 60 ticks later (0.4 s grace, then only fresh presses count). |
| Keyboard, gamepad, touch, mouse | PASS. After the grace, keyboard Z, gamepad A, a screen touch and a left click each skip the count, and the full bonus is still added. |
| Emerald moment only when just won | PASS. Zone 1 Act 1: the moment shows with `emerald_just_won`; without it, none (the quiet line when won earlier); never in the test zone. The UI agent's tests also cover boss arenas. |
| Whole-pixel spin widths at 30/60/144 | PASS (see the frame-rate row above) |
| A real act clear | PASS. The runner bot finishes Zone 1 Act 1 in a window (goal at frame 5443). See below. |

The real act clear (`qa/reports/evidence/06-ui-emerald/act1_clear_tally.png`; the name row is blacked out so the image carries no name text):
- The tally shows "ACT 1 CLEAR!" with the zone name.
- The spinning green emerald arrives with its name and "1 / 8".
- The bonuses count in: time 1:30 gives a 1000 time bonus, 6 tickets give 600, and 200 + 1600 = 1800.
- "JUMP OR TAP TO CONTINUE" blinks, then Act 2 loads.

## Z1-01 re-check (timeline clock, lead): fixed headless; windowed runs still drift

- **Headless: FIXED.** The plain launch and the bot replay both complete Act 1 at timeline frame 3748 and Act 2 at 4643.
- **QA tooling:** `playtest_bot.gd --record` counts from the same clock. A runner recording finishes at timeline frame 5255 in the recording, the plain replay and the bot replay alike.

**New, minor (lead, `core/dev.gd`): windowed replays still drift.**
- **Symptom:** any windowed run of a timeline (plain launch, the bot in a window, Movie Maker or `record_clip.sh`) can drop a held input for one tick, and long recorded runs then diverge. The Act 1 run doesn't finish by frame 3900 in a window.
- **Repro** (hold right from frame 0, playground, `--trace=1`): headless and windowed match up to frame 55. At frame 56 the windowed run decelerates for one tick (gsp 2.48 → 2.44) instead of accelerating.
- **Cause, most likely:** a window focus change at startup. Godot releases all pressed actions when the window loses focus, and Dev only re-presses its held timeline actions later in the frame, so the player's physics sees one tick without input. The bot showed the same blip at a different frame (between 105 and 120), which points at OS window events rather than the game.
- **Fix:** re-press held timeline actions at the very start of every physics tick (Dev at the lowest `process_physics_priority`, or in a `physics_frame` handler) and flush the event immediately. Then a focus blip can't eat a tick.
- **Impact:** QA's playtest bot now flushes its inputs immediately, so its windowed and headless runs apply each press on the same tick. Until Dev is fixed, take visual evidence of recorded runs from the bot or from headless runs.

## Open items

- **Tally overlap fix:** pending in the UI agent's worktree; not reviewed. In the real act clear above (keyboard mode) the panel overlaps no HUD element.
- **Title screen and zone select:** not committed yet.
