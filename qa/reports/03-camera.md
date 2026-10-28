# QA report 03: physics (GameCamera) @ 4027c9f

- **Date:** 2026-10-28
- **Reviewed:** branch `physics` at 4027c9f (two camera commits on b8e1593), merged with main afe934f in a throw-away copy (`git merge-tree`, no worktree touched).
- **Target mode:** physics interpolation ON (the lead plans `physics/common/physics_interpolation=true` at merge); OFF reviewed as the fallback.
- **Checklist:** `qa/checklists/03-camera.md`

## Verdict: FIX FIRST (one line)

Everything on the checklist passes except one item, CAM-J3. With interpolation
on, the camera's teleport snap smears for 1–2 frames at 120/144 Hz on every
respawn. The fix is one line and QA verified it in a recording (BUG-03-01).
With interpolation off, the branch is MERGE as is.

## Tool results (merged copy)

| Check | Result |
|---|---|
| Import | clean, no errors or warnings |
| Test suite | 188 passed, 0 failed. This includes the 15 new camera probes in `tests/qa/test_camera_review.gd`; 173 + 15. Suite runtime about 8.5 s. |
| `tools/qa/scene_smoke.sh` | 7 run, 7 passed |
| `tools/qa/originality_scan.sh` | 0 hits (439 terms, 153 files) |
| Physics regression and fix guards (`tests/qa/test_physics_*.gd`) | all pass |
| Level lint, playground | unchanged from main; see "Level lint" |

## Checklist

| Item | Result | Evidence |
|---|---|---|
| A1 contract API | PASS | `tests/qa/test_contracts.gd` (camera part) |
| A2 `current()` | PASS | contract test |
| A3 follows `player` group | PASS (code) | Re-finds the target through the group when `_target` is invalid. No probe frees and re-instances the player. |
| A4 camera alone, no player | PASS | Returns early when the group is empty; smoke shows no errors. |
| B1 deadzone | PASS | `test_b1_deadzone` |
| B2 look-ahead by speed | PASS | Lead is 9.1 px at 6 px/frame, 27.4 at 8, 64 at 12. At 16 px/frame the camera trails 8 px, because the catch-up cap is 16. |
| B3/B5 top speed, turnaround | PASS | Largest step 16.5 px/frame (whole-pixel rounding); Sproto stays at least 150 px from the screen edges. |
| B4 wall flip | PASS | The camera does not move (spread 0). |
| C1 ground caps | PASS | 5.47 px/frame (cap 6) at 4 px/frame; 9.01 px/frame (cap 16) at 9 px/frame |
| C2–C4 jump, spring, long fall | PASS | Jump moves the camera 59.6 px (window 32). Spring -16 keeps a 53 px margin; long fall keeps 73 px. |
| D1/D2 bounds, small level | PASS | Never shows anything outside the bounds; a small level is centred. |
| D3–D5 lock, unlock, nested | PASS | Lock settles in 30 frames; peak step 31.8 px/frame (smoothstep over 612 px). Unlock peak 17.5 px/frame. No snap. |
| D6 + I autoscroll | PASS | Average scroll exactly 2.000 px/frame. `clamp_rect` matches the view (0 px difference). Crushed at the wall at frame 547; stop clears the rect. See BUG-03-02 for the 1-frame lag. |
| D7 shake | PASS | Largest offset 6.4 px, back to 0, no drift |
| D8 pause | PASS | no drift |
| E1 death | PASS | Holds still from `kill()`. |
| E2 respawn | PASS (OFF) / FAIL (ON, 120+ Hz) | Snaps on the first frame with no carried offsets. With interpolation ON, see BUG-03-01. |
| E3 boss arena | SKIP | no boss yet |
| F1–F4 pixel quality, windows, feel | PASS / see 00-full-qa | Recordings at 60/120/144 Hz. Window sizes are covered in `qa/reports/00-full-qa.md`. |
| G spin dash hold | PASS | Holds 16 frames (0 extra presses) and 13 (6 presses); Sproto stays on screen; catch-up up to 16.8 px/frame. |
| H look up/down | PASS | Starts after 121 frames; goes to 104 / 88 px at 2 px/frame; returns after release. A spin dash works during the wait. |
| J1 setting | n/a | Not set on the branch; the lead sets it at merge. Pixel snap stays on. |
| J2 gameplay identical ON/OFF | PASS | Fuzz (seed 5, 5,400 ticks) and runner (3,000 ticks) `--trace=1` traces are byte-identical ON and OFF, at both 60 and 144 fps rendering. |
| J3 teleports reset interpolation | **FAIL** | BUG-03-01 |
| J4 smooth at 60/120/144 Hz | PASS | Details below. |

## Interpolation findings (Movie Maker, `tests/qa_clips/cam_strip`, review copy only)

The test scene is a flat run at 6 px/frame with 2 px magenta background markers
every 32 px. Measurements are physics ticks 200–380, read from marker left
edges away from the screen border.

| Render rate | Interp ON (background step per frame) | Interp OFF |
|---|---|---|
| 144 Hz | 2/3 alternating (2: 215, 3: 216), every frame | 0/6 judder (0: 251, 6: 180) |
| 120 Hz | 3 every frame (359 of 359) | 0/6 judder (0: 180, 6: 179) |

- Sproto's eye stays on the same screen pixel in every run. There is no 1 px
  jitter between Sproto and the background. The camera's offset from Sproto is
  a whole number of pixels, so both snap together.
- During acceleration (ticks 10–200, fractional speeds) there are no
  reversals in the background or in Sproto. Sproto drifts 1 px at a time while
  the look-ahead builds, and does the same with interpolation on and off.
- An earlier reading of occasional ±1 px pairs was a measurement artifact: a
  marker half-clipped at x=0. It does not occur in the game.
- `_process` holds only visuals: `player_visual.gd` (rotation easing,
  invincibility blink), `accessory.gd` and `debug_overlay.gd`. Nothing that
  affects gameplay.

## Bugs

### BUG-03-01: Camera snap smears for 1–2 frames with interpolation on (every respawn, level start)

- **Severity:** major. It happens on every death, it is in the target mode, and
  it only shows at 120/144 Hz, so it is easy to miss in testing. 60 Hz and
  interpolation OFF are clean.
- **Owner:** physics (`camera/game_camera.gd`, `_snap_to_target`)
- **Checklist:** CAM-J3, CAM-E2
- **Repro:** Kill Sproto, then `respawn_at` 600 px further, with `--interp` and
  `--fixed-fps 144` (or 120) in Movie Maker. Look at the frames around the
  respawn.
- **Expected:** A clean cut from the old view to the new one.
- **Actual:**
  - At 144 Hz, two in-between frames: the background passes through
    intermediate positions, and in one frame Sproto is drawn 100 px right of
    centre. Evidence: `qa/reports/evidence/03-camera/respawn_smear_144hz.png`
    (top row as merged, bottom row with the fix).
  - At 120 Hz, one in-between frame.
- **Cause:** `_snap_to_target()` calls `reset_physics_interpolation()` before
  the new position is applied. `_apply_position()` runs later in the same tick,
  so the interpolation runs from the old camera position to the new one. The
  player's `respawn_at` does it in the right order: set the position, then reset.
- **Fix (verified):** in `_snap_to_target`, call `_apply_position()` right
  before `reset_physics_interpolation()`.
  - With that one line, re-recorded at 144 and 120 Hz: the cut is clean, and
    the steady scroll is unchanged (2/3 and 3).

### BUG-03-02: Autoscroll `clamp_rect` lags the view by one frame

- **Severity:** minor
- **Owner:** physics (`camera/game_camera.gd`)
- **Repro:** `test_d6_autoscroll` in `tests/qa/test_camera_review.gd` (it prints
  the overshoot).
- **Expected:** Sproto never outside the view.
- **Actual:** Up to 2.0 px outside the view at 2 px/frame. The camera sets
  `player.clamp_rect` after the player has moved, so the player is clamped to
  last frame's view.
- **Fix:** Set the rect from the next frame's focus (`focus + _autoscroll *
  delta`), or let the player read `GameCamera.current().view_rect()` at the
  start of its step.

### BUG-03-03: Invincibility blink counts render frames

- **Severity:** minor
- **Owner:** physics (`player/player_visual.gd`)
- **Actual:** The blink counter runs in `_process`, so the blink rate scales
  with the display refresh rate. At 144 Hz it blinks 2.4× faster, which is
  also an accessibility concern (flashing).
- **Fix:** Count physics ticks (read the player's remaining invincibility
  frames) instead.

## Level lint on the playground (requested)

`tools/qa/level_lint.gd` gives the same result on the merged copy as on main:
the quarter-pipe changes neither fixed nor worsened anything.

- `loop.intrusion` (error) at (3296, -4): terrain inside the footprint of the loop at x 3120.
- `loop.runup` (warn): 376 px of run-up into that loop (needs 384).

Both are minor for a dev playground. Owner: physics (playground).

## Notes for the lead

- Dev input timelines replay one tick later at 144 fps rendering than at 60.
  The shift comes from boot timing, not physics. Compare traces by state, not
  by absolute tick, across render rates.
- **Interpolation ON is recommended:**
  - It turns the 0/6 judder at 120/144 Hz into an even 2–3 px per frame.
  - Gameplay stays byte-identical.
  - Pixel snapping keeps Sproto rock-steady.
  - Ship it together with the BUG-03-01 line.
