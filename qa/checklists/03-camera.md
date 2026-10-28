# 03 – Camera

Branch: `physics` · Owner: physics agent · Scene: `res://camera/game_camera.tscn`
(`class_name GameCamera`, extends `Camera2D`, group `game_camera`).

Tags: **[auto]** script/test/timeline · **[manual]** human judgement.
Viewport is 424×240. Record the agent's documented numbers (deadzone width,
look-ahead distance, vertical lag caps) in the report and test against them.

## A. Contract

- [ ] CAM-A1 [auto] `tests/qa/test_contracts.gd`: scene loads, root is `Camera2D` with script `GameCamera`, in group `game_camera`, exposes `current()` (static), `set_level_bounds`, `lock_to`, `unlock`, `start_autoscroll`, `stop_autoscroll`, `shake` with the contract arities.
- [ ] CAM-A2 [auto] `GameCamera.current()` returns the live camera, and null (no error) when none exists.
- [ ] CAM-A3 [auto] Follows the `player` group automatically, including after the player is freed and respawned (new instance).
- [ ] CAM-A4 [auto] Scene smoke: camera scene alone runs 120 frames without errors (no player present).

## B. Horizontal follow

- [ ] CAM-B1 [auto] Deadzone: player moving slowly inside the documented deadzone does not move the camera.
- [ ] CAM-B2 [auto] Look-ahead: at a steady speed the camera settles ahead of the player in the direction of motion, by the documented amount; scales with speed.
- [ ] CAM-B3 [auto] Turning around at top speed: the look-ahead swings to the other side smoothly (no snap larger than the documented max camera speed per frame).
- [ ] CAM-B4 [auto] Pushing against a wall while the input flips every frame: camera does not oscillate.
- [ ] CAM-B5 [auto] At 16 px/f (speed cap) the player never leaves the screen, horizontally or vertically.

## C. Vertical follow

- [ ] CAM-C1 [auto] Vertical lag: on the ground the camera catches up at the documented cap (classic: 6 px/f slow, 16 px/f fast); in the air it allows the documented vertical border.
- [ ] CAM-C2 [auto] A jump on flat ground moves the camera less than the jump height (lag works).
- [ ] CAM-C3 [auto] Spring launch straight up at -16 px/f: player stays on screen.
- [ ] CAM-C4 [manual] Running a loop: camera follows without jerks or one-frame jumps.

## D. Bounds, locks, autoscroll, shake

- [ ] CAM-D1 [auto] `set_level_bounds(rect)`: camera never shows outside the rect at any player position (corners included).
- [ ] CAM-D2 [auto] A level smaller than the viewport: camera centred, no jitter.
- [ ] CAM-D3 [auto] `lock_to(rect, 0.5)`: reaches the rect in 0.5 s (30 frames ±1), then stays fixed while the player moves inside.
- [ ] CAM-D4 [auto] `unlock(0.5)`: returns to following over 0.5 s without a snap.
- [ ] CAM-D5 [auto] `lock_to` called again during a transition, and `unlock` during a lock transition: no snap, no stuck.
- [ ] CAM-D6 [auto] `start_autoscroll(v)`: camera moves exactly v px/s; `stop_autoscroll()` stops on that frame.
- [ ] CAM-D7 [auto] `shake(s, t)`: offset within ±s, decays to exactly 0 after t; overlapping shakes do not accumulate beyond the strongest; the camera returns to its exact target.
- [ ] CAM-D8 [auto] Pause: camera does not drift, shake and lock transitions pause and resume.

## E. Death and respawn

- [ ] CAM-E1 [auto] Player dies falling into a pit: camera stops following downward (no scroll into the void below Bounds).
- [ ] CAM-E2 [auto] Respawn: camera is on the player on the first frame (no long pan from the death point).
- [ ] CAM-E3 [auto] Boss arena: entering locks the camera; dying and respawning re-locks it; defeat unlocks.

## F. Pixel quality and windows

- [ ] CAM-F1 [manual] No sub-pixel shimmer or tile seams while scrolling slowly (pixel snapping on).
- [ ] CAM-F2 [manual] Window resize, maximise and fullscreen: framing stays 424×240, nothing outside Bounds becomes visible, no blur.
- [ ] CAM-F3 [manual] On a 120/144 Hz display the scroll is not juddery (60 Hz physics, no interpolation by default).
- [ ] CAM-F4 [manual] Overall feel: classic deadzone + look-ahead, readable at top speed.
