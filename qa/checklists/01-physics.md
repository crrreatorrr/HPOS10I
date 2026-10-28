# 01 – Physics (player controller)

Branch: `physics` · Owner: physics agent · Folders: `player/`, `terrain/`, `tests/physics/`

Tags: **[auto]** a script, test or timeline checks it · **[manual]** needs a human (feel, looks).
Units are classic pixels per frame (px/f) at 60 Hz. "Timeline" means a Dev input
timeline replayed with `--inputs=` (see `qa/README.md`); "bot" means
`tools/qa/playtest_bot.gd`.

Reference numbers derived from the constants (use them as expected values):

| Quantity | Expected |
|---|---|
| Frames from 0 to top speed 6 holding forward | 128 (6 / 0.046875) |
| Frames to stop from 6 by friction (no input) | 128 |
| Frames to stop from 6 by pressing backward | 12 (6 / 0.5) |
| Full-jump apex on flat ground | 93–100 px (order of gravity vs move) |
| Shortest hop (jump released on frame 1) | about 36–45 px |
| Spin dash release speed | 8 (no extra taps) to 12 (charge 8) |

## A. Constants and tuning

- [ ] PHY-A1 [auto] `core/physics_constants.tres` holds the Director's values (ground 0.046875 / 0.5 / 0.046875 / 6; air 0.09375, gravity 0.21875, jump 6.5, release 4; slope 0.125, roll up 0.078125, roll down 0.3125; roll friction 0.0234375, roll decel 0.125). `tests/core/test_core.gd`.
- [ ] PHY-A2 [auto] No movement constant is hard-coded in `player/` or `terrain/`:
  `grep -rnE '0\.046875|0\.21875|0\.09375|0\.0234375|0\.078125|0\.3125|\b6\.5\b|0\.1875' player terrain` finds nothing outside comments.
- [ ] PHY-A3 [auto] `Tuning.physics` is read every frame, never cached:
  `grep -rnE '(@onready|var ).*Tuning\.physics' player` finds nothing (a local inside `_physics_process` is fine).
- [ ] PHY-A4 [manual] Live tuning: run from the editor, set `top_speed` to 12 in the `.tres` and save. Within 1 s the console prints `[Tuning] physics constants reloaded` and the player reaches the new top speed without restarting.
- [ ] PHY-A5 [auto] Movement runs in `_physics_process` once per 60 Hz tick and does not multiply per-frame constants by `delta` twice. With `--fixed-fps 60`, holding right from rest gives ground speed `0.046875 * n` on frame n (±1 frame) and exactly 6.0 from frame 128.
- [ ] PHY-A6 [auto] `project.godot` keeps `physics/common/physics_ticks_per_second` at 60 (absent = default 60).

## B. Ground movement (flat)

- [ ] PHY-B1 [auto] Acceleration: from rest, 128 ± 1 frames to reach 6.0; never exceeds 6.0 from input alone.
- [ ] PHY-B2 [auto] Friction: release at 6.0, ground speed drops by 0.046875 per frame, reaches exactly 0 (never flips sign) after 128 ± 1 frames; state becomes `idle`.
- [ ] PHY-B3 [auto] Deceleration: press backward at 6.0, speed drops 0.5 per frame; on the frame it would cross 0 it becomes -0.5 (classic turnaround), then accelerates the other way.
- [ ] PHY-B4 [auto] Skid: reversing at |ground speed| >= 4 enters `skid` (and plays `skid` once); below 4 it turns without skidding. `state_changed` fires once per change.
- [ ] PHY-B5 [auto] Above top speed (after a spring, booster or spin dash), holding forward does NOT clamp speed back to 6; only friction/slopes reduce it.
- [ ] PHY-B6 [auto] Holding left and right on the same frame: no oscillation, no NaN, the documented direction wins.
- [ ] PHY-B7 [auto] `velocity` equals `ground_speed` projected on the ground angle every grounded frame (x = gsp·cos, y = gsp·sin with the documented sign), within 0.001.
- [ ] PHY-B8 [auto] Running off a ledge keeps x speed, switches to air, y speed starts at 0 and gravity applies; no snap down to a floor more than the sensor range below.
- [ ] PHY-B9 [auto] Small steps and bumps (up to the documented step height, about 14 px) are climbed at speed without stopping or launching.
- [ ] PHY-B10 [manual] Feel: start-up, turn-around and stop feel like classic 16-bit momentum games (heavy, slidey stop, snappy turn).

## C. Air movement and jumping

- [ ] PHY-C1 [auto] Jump from flat ground: first airborne y speed is -6.5; full hold reaches the expected apex (93–100 px); total air time 59–61 frames back to the same floor.
- [ ] PHY-C2 [auto] Variable jump: releasing jump while y speed < -4 sets it to exactly -4; releasing after that (or after the apex) changes nothing.
- [ ] PHY-C3 [auto] Air acceleration 0.09375 per frame in either direction; input never pushes |x speed| above 6, but a higher x speed is kept.
- [ ] PHY-C4 [auto] Air drag: only while -4 < y speed < 0 and |x speed| >= 0.125, x speed loses `x_speed / 0.125 / 256` (integer part) per frame; no drag outside that band.
- [ ] PHY-C5 [auto] Gravity 0.21875 per frame; falling speed caps at `max_fall_speed` 16.
- [ ] PHY-C6 [auto] Jumping on a slope launches perpendicular to the surface (x -= 6.5·sin, y -= 6.5·cos of the ground angle). Test on 22°, 45° and both slope directions.
- [ ] PHY-C7 [auto] No double jump: pressing jump in the air (any state) does nothing.
- [ ] PHY-C8 [auto] Jump pressed 1 frame before landing does not jump unless a buffer is documented; jump pressed on the landing frame jumps.
- [ ] PHY-C9 [auto] Jumping into a flat ceiling zeroes upward speed with no clipping; on steep ceiling slopes the player either attaches (documented angle range) or slides off cleanly.
- [ ] PHY-C10 [auto] Jumping under a low ceiling (clearance just above standing height) does not clip into it or teleport.
- [ ] PHY-C11 [auto] Jumping while pressed against a wall: player rises straight, no wall sticking, no jitter on the wall side.
- [ ] PHY-C12 [manual] Jump arc feels like the classic game (floaty apex, firm fall).

## D. Slopes and landing

- [ ] PHY-D1 [auto] Running uphill loses `0.125 · sin(angle)` per frame; downhill gains the same.
- [ ] PHY-D2 [auto] Rolling uphill uses 0.078125, downhill 0.3125 (times sin(angle)).
- [ ] PHY-D3 [auto] Standing still on a gentle slope (< `slip_angle` 35°): no slide.
- [ ] PHY-D4 [auto] Slip: on slopes steeper than 35° with |ground speed| < 2.5 the player slips, horizontal input is locked for 30 frames; steeper than 69° the player detaches and falls.
- [ ] PHY-D5 [auto] Landing converts air speed by angle (Physics Guide rules): flat (0–23°) gsp = x speed; 24–45°: x speed if moving mostly sideways, else y speed × 0.5 × direction; 46–90°: the larger of x speed and y speed × direction. Check a straight drop onto 45°: |gsp| = |y speed| / 2.
- [ ] PHY-D6 [auto] Ground angle is reported in degrees, 0 = flat, with the documented direction convention; mirrored slopes report mirrored angles (θ and 360 - θ).
- [ ] PHY-D7 [auto] Convex and concave transitions at 6 and 12 px/f: no launch off small convex bumps, no sinking into concave joins, no one-frame airborne flicker (`grounded` stays true).
- [ ] PHY-D8 [auto] Running down a slope steeper than the sensor reach at top speed keeps the player grounded or detaches cleanly, never stair-steps in the air.

## E. Collision sensors (A/B floor, C/D ceiling, E/F wall)

- [ ] PHY-E1 [auto] No `move_and_slide` / `move_and_collide` / `CharacterBody2D` for ground movement:
  `grep -rnE 'move_and_slide|move_and_collide|CharacterBody2D' player` finds nothing.
- [ ] PHY-E2 [auto] Sensors are raycasts (`intersect_ray` or `RayCast2D`) against collision bits 1–4 only (mask value 15 plus path logic); never against enemies, objects or hazards.
- [ ] PHY-E3 [auto] Floor sensors A/B take the higher (closer) surface; standing with only one sensor over the floor (ledge) does not fall.
- [ ] PHY-E4 [auto] Wall sensors E/F push the player out flush, set ground speed to 0 on contact, and do not trigger on gentle slopes.
- [ ] PHY-E5 [auto] High speed into walls: at 16 px/f (speed cap) into walls 16 px, 8 px and 1 px thick: no tunnelling, final x flush against the wall (±1 px), no jitter over the next 60 frames.
- [ ] PHY-E6 [auto] High speed into ceilings: spring launch at -16 px/f into ceilings 16 px and 8 px thick: no tunnelling, no stuck inside.
- [ ] PHY-E7 [auto] Path layers: bit 1 always solid; bit 2 only on path A; bit 3 only on path B; `set_collision_path()` switches immediately.
- [ ] PHY-E8 [auto] Top-only platforms (bit 4): land from above at any speed; pass through from below and from the sides; no snap up when walking under them.
- [ ] PHY-E9 [auto] Landing exactly on a corner or the edge of a 1-tile pillar: lands or falls, never stuck inside.
- [ ] PHY-E10 [auto] Gap narrower than the player width: player walks over or falls in cleanly; pit narrower than the player: no wedge.
- [ ] PHY-E11 [manual] Sensor lines in the F1 overlay match where collisions actually happen.

## F. Collision modes, loops, wall running

- [ ] PHY-F1 [auto] `collision_mode` switches FLOOR -> RIGHT_WALL -> CEILING -> LEFT_WALL at the 45° boundaries (documented hysteresis ok), and back the same way.
- [ ] PHY-F2 [auto] Full loop clockwise at 6, 8, 12 and 16 px/f: completes, `collision_mode` cycles 0->1->2->3->0, no detach, exits at the expected side.
- [ ] PHY-F3 [auto] Same loop counter-clockwise (enter from the right, running left).
- [ ] PHY-F4 [auto] Loop threshold: find the minimum entry speed that completes the loop (record it). At that speed minus 0.25: player detaches near the top and falls cleanly into the loop bottom, no clipping, no stuck in a wall mode.
- [ ] PHY-F5 [auto] Rolling through the loop and spin dash straight into the loop both complete.
- [ ] PHY-F6 [auto] Jumping at the loop's 90°, 180° and 270° points launches perpendicular to the surface; no clipping into terrain.
- [ ] PHY-F7 [auto] Reversing input mid-loop slows the player and detaches below the threshold; no stuck state.
- [ ] PHY-F8 [auto] Path switchers: traverse the loop on path A and exit on path B; run it backwards too; re-entering after a respawn starts on the right path.
- [ ] PHY-F9 [auto] Quarter pipe: at speed the player goes vertical, launches straight up, falls back into the pipe and returns down it; at low speed slips back down; never lands on top of the pipe edge by accident.
- [ ] PHY-F10 [auto] Wall running: below the fall threshold on a vertical wall the player detaches with a 30-frame control lock.
- [ ] PHY-F11 [manual] Loops look smooth: sprite rotation follows the angle, no one-frame pops.

## G. Rolling

- [ ] PHY-G1 [auto] Down while |gsp| >= 1.03125 starts a roll (sfx `roll`); below that, down does not roll.
- [ ] PHY-G2 [auto] Roll friction 0.0234375 per frame; pressing backward decelerates 0.125 per frame; pressing forward does not accelerate.
- [ ] PHY-G3 [auto] Roll ends when |gsp| < 0.5 (`unroll_speed`) and the state goes to idle/run.
- [ ] PHY-G4 [auto] Roll hitbox shrinks to 7/14 and the centre moves down by 5 px so the feet stay on the floor; standing up restores it with no pop through the floor or ceiling.
- [ ] PHY-G5 [auto] Unrolling under a low ceiling does not push the player into the ceiling (stays rolling or is pushed out cleanly).
- [ ] PHY-G6 [auto] Jump from a roll keeps the small hitbox; air control after a roll jump follows the documented rule.
- [ ] PHY-G7 [auto] `is_attacking()` is true in `jump`, `roll`, `spindash`; false in `idle`, `run`, `skid`, `spring`, `hurt`, `dead`.

## H. Spin dash

- [ ] PHY-H1 [auto] Hold down at rest, press jump: state `spindash`, sfx `spindash_charge`; each extra press adds 2 charge up to 8.
- [ ] PHY-H2 [auto] Release down: ground speed = 8 + floor(charge) / 2 in the facing direction (8 with no extra taps, 12 at max); sfx `spindash_release`; state `roll`.
- [ ] PHY-H3 [auto] Jump spam on every frame for 2 s while charging: charge clamps at 8, no extra jumps, no stuck sfx loop.
- [ ] PHY-H4 [auto] Releasing down and pressing jump on the same frame: one well-defined outcome (release or jump), never both.
- [ ] PHY-H5 [auto] Spin dash on a 22° and 45° slope, both directions: release speed follows the surface.
- [ ] PHY-H6 [auto] Spin dash facing a wall at 0 distance: speed 0, no tunnel, no jitter.
- [ ] PHY-H7 [auto] Getting hurt mid-charge cancels the charge cleanly (state `hurt`, charge reset, no lingering charge sfx).
- [ ] PHY-H8 [auto] Charge decay (if implemented) is documented and deterministic.

## I. States, damage and the player API

- [ ] PHY-I1 [auto] Every state in the contract is reachable and `state` only ever holds contract values. `state_changed(old, new)` fires once per change and never with old == new.
- [ ] PHY-I2 [auto] `hurt(source)`: knockback away from the source (x ±2, y -4), hurt gravity 0.1875, no control until landing, landing zeroes ground speed; `hurt_taken` fires once; sfx `hurt`.
- [ ] PHY-I3 [auto] Tickets on hit: with N tickets, min(N, 32) scattered tickets spawn, the counter goes to 0, sfx `ticket_loss`; they can be recollected after 64 frames, disappear after 256; 0 tickets on hit = death.
- [ ] PHY-I4 [auto] Invincibility: 120 frames after a hit with visible blinking; `hurt()` during them is ignored; `is_invincible()` true only then.
- [ ] PHY-I5 [auto] `kill()` kills even while invincible; `died` fires exactly once; y speed -7; falls through terrain; inputs ignored.
- [ ] PHY-I6 [auto] `hurt()` and `kill()` on the same frame: one death, one life lost.
- [ ] PHY-I7 [auto] Dying while on a spring: `launch()` on a dead player does nothing; `kill()` during a spring launch dies cleanly.
- [ ] PHY-I8 [auto] Hurt in every state: idle, run, skid, jump, roll, spindash, spring, on a loop ceiling (mode resets to FLOOR and the player goes airborne).
- [ ] PHY-I9 [auto] `launch(v)`: airborne with exactly v, state `spring`, not attacking, jump release does not cut the launch.
- [ ] PHY-I10 [auto] `push_ground(speed, lock)`: ground speed set, horizontal input ignored for `lock` frames; jump still works.
- [ ] PHY-I11 [auto] `set_control_lock(n)`: horizontal input ignored for n frames, then restored.
- [ ] PHY-I12 [auto] `bounce_off(target_y)`: moving down from above reverses y speed; from below it does not pull the player up into the target.
- [ ] PHY-I13 [auto] `freeze(true)`: no movement, no input, no gravity; `freeze(false)` resumes with the previous speeds (or documented reset).
- [ ] PHY-I14 [auto] `respawn_at(p)`: at p, speeds 0, state `idle`, grounded on the next frame, no leftover invincibility or control lock.
- [ ] PHY-I15 [auto] `clamp_rect`: player kept inside while non-empty; pushed by the moving edge into a wall = `kill()`.
- [ ] PHY-I16 [auto] `Player.from_area()` returns the player for its own hitbox (`Area2D`, layer bit 5) and null for any other area.
- [ ] PHY-I17 [auto] `tests/qa/test_contracts.gd` passes (group `player`, every contract method, property and signal).
- [ ] PHY-I18 [manual] Accessory: wizard hat in Zone 2, sunglasses in Zone 3, nothing elsewhere; follows facing and every animation frame.
- [ ] PHY-I19 [manual] Hurt and death read clearly (knockback, blink, death fall).

## J. Input robustness

- [ ] PHY-J1 [auto] Frame-perfect input spam: bot `--policy=fuzz` for 36 000 frames (10 min) with 3 seeds: no `ERROR`/`SCRIPT ERROR`, no NaN/INF in position or speeds, no state stuck for > 10 s while inputs change.
- [ ] PHY-J2 [auto] Determinism: replay the same timeline twice; final position, ground speed and state are identical.
- [ ] PHY-J3 [auto] Pause during every state (idle, run, skid, jump, roll, spindash charge, spring, hurt, dead): nothing moves while paused; inputs pressed during pause do not fire on unpause; the state continues exactly.
- [ ] PHY-J4 [auto] Jump pressed on the frame of landing, down pressed on the frame of landing (roll on landing), jump + down on the same frame.
- [ ] PHY-J5 [manual] Losing window focus while holding right (alt-tab / tab switch) releases the input; no running on its own after returning.
- [ ] PHY-J6 [manual] Gamepad: stick at the 0.5 deadzone does not flicker between run and idle; diagonal stick + jump works.

## K. Long sessions and stability

- [ ] PHY-K1 [auto] Bot 216 000 frames (1 hour) on the test level: node count and orphan count stable (no growth trend), no errors.
- [ ] PHY-K2 [auto] No NaN or INF ever: guard angle math against zero-length normals.
- [ ] PHY-K3 [auto] Position precision at x = 50 000 px is still smooth (no visible jitter).

## L. Debug overlay (F1)

- [ ] PHY-L1 [manual] F1 toggles an overlay with ground speed, x/y speed, ground angle, collision mode, state, and sensor lines A–F drawn.
- [ ] PHY-L2 [auto] Overlay values match the player properties on the same frame.
- [ ] PHY-L3 [auto] Toggling the overlay does not change the simulation (same timeline with and without `--overlay` gives identical results).
- [ ] PHY-L4 [manual] Overlay is readable at 424×240 and does not cover the HUD.
