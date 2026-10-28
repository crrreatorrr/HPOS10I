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
- [ ] CAM-D6 [auto] `start_autoscroll(v)`: camera moves exactly v / 60 px per frame; `stop_autoscroll()` stops on that frame (see section I for `clamp_rect`).
- [ ] CAM-D7 [auto] `shake(s, t)`: offset within ±s, decays to exactly 0 after t; overlapping shakes do not accumulate beyond the strongest; the camera returns to its exact target.
- [ ] CAM-D8 [auto] Pause: camera does not drift, shake and lock transitions pause and resume.

## E. Death and respawn

- [ ] CAM-E1 [auto] Player dies (any cause): the camera stops following from `kill()` (or the documented frame). It never scrolls into the void below Bounds during the about 60-frame fall before `died`.
- [ ] CAM-E2 [auto] Respawn, about 120 frames after `kill()`: the camera is on the player on the first frame (no long pan from the death point), with no look-ahead or look-up offset carried over.
- [ ] CAM-E3 [auto] Boss arena: entering locks the camera; dying and respawning re-locks it; defeat unlocks.

## F. Pixel quality and windows

- [ ] CAM-F1 [manual] No sub-pixel shimmer or tile seams while scrolling slowly (pixel snapping on).
- [ ] CAM-F2 [manual] Window resize, maximise and fullscreen: framing stays 424×240, nothing outside Bounds becomes visible, no blur.
- [ ] CAM-F3 [manual] On a 120/144 Hz display the scroll is not juddery (see section J).
- [ ] CAM-F4 [manual] Overall feel: classic deadzone + look-ahead, readable at top speed.

## G. Spin dash release hold

- [ ] CAM-G1 [auto] On a spin dash release the horizontal follow holds for the documented number of frames. Record the agent's numbers; the classic reference is up to 32 frames, shorter with more charge. The vertical follow is unaffected.
- [ ] CAM-G2 [auto] During the hold Sproto stays fully on screen: his x stays within the camera's 424 px view minus 16 px margins, for a 12 px/f release on flat ground and towards a level edge.
- [ ] CAM-G3 [auto] After the hold the camera catches up at no more than 16 px per frame (no snap) and settles into the normal look-ahead within 60 frames.
- [ ] CAM-G4 [auto] Spin dash release into a wall, or released while the camera is locked (boss) or autoscrolling: no hold artefacts, and the lock or autoscroll wins.

## H. Look up and down

- [ ] CAM-H1 [auto] Standing still and holding up, the camera starts to pan after 120 ± 2 frames (about 2 s). Holding down (crouch) behaves the same. Pan speed and limit are as documented; the classic reference is 2 px/frame, up to 104 px up and 88 px down.
- [ ] CAM-H2 [auto] Releasing returns the camera to normal at the same speed. Moving (ground speed not 0), jumping or rolling cancels the look at once.
- [ ] CAM-H3 [auto] Down + jump during the 120-frame wait still starts a spin dash, and the look never blocks it.
- [ ] CAM-H4 [auto] The look offset never shows outside `Bounds`, and it is 0 on respawn and after a lock or unlock.

## I. Autoscroll drives `player.clamp_rect`

- [ ] CAM-I1 [auto] During autoscroll, every frame, `player.clamp_rect` equals the camera's visible rectangle (424×240, centred on the camera, within 1 px).
- [ ] CAM-I2 [auto] `stop_autoscroll()` sets `clamp_rect` back to an empty `Rect2()` on the same frame.
- [ ] CAM-I3 [auto] Sproto is pushed by the left edge; pinned against a wall by it he is killed (`kill()`); he can't leave through the right or top edge.
- [ ] CAM-I4 [auto] Pause freezes the scroll and `clamp_rect`. A death during autoscroll respawns before the section, and the autoscroll restarts (zone 2 broom section).

## J. Physics interpolation (if adopted, as recommended)

- [ ] CAM-J1 [auto] `project.godot` has `physics/common/physics_interpolation=true` if the lead adopts it. Pixel snapping (`2d/snap/snap_2d_transforms_to_pixel`) stays on.
- [ ] CAM-J2 [auto] Gameplay is unchanged: a bot timeline replayed with interpolation on and off gives the same physics results (positions, states, deaths).
- [ ] CAM-J3 [auto] Teleports (respawn, `respawn_at`, scene start, camera lock snaps) reset the interpolation, so no smeared frame between the old and new position.
- [ ] CAM-J4 [manual] On 60, 120 and 144 Hz displays: smooth scroll, no judder, no sub-pixel shimmer of tiles or the player.
