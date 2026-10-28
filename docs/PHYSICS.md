# Physics accuracy audit

Sproto's controller (`player/player.gd`) against the community Physics Guide
for the classic 16-bit trilogy. Baseline: the second game's values where the
games differ (roll threshold 1.03125, spin dash), no later additions (no drop
dash, insta-shield or peel-out), no coyote time, no input buffering.

How it is checked: `tests/physics/reference_sim.gd` is a pure-math model of
the Guide in px/frame, written without reference to the controller and with
every constant spelled out. `tests/physics/test_reference.gd` runs the real
Player and the model on the same inputs and demands the same position and
speed every frame, to 1/256 px, for 300+ frames per scenario (17 scenarios:
flat runs, jumps, slopes, rolls, landing bands, slipping, spin dash, hurt,
death, rebounds, springs, a loop and a half-pipe). The older tests named in
the matrix pin single rules.

Units: the public API is px/frame at 60 Hz; the controller integrates px/s
with the fixed delta, which is the same thing to about 1e-14 per frame.

## Matrix

Status: **exact** = matches the Guide rule and value; **choice** = a
documented alternative the Guide itself allows (which game, or a stated
reason); **fixed** = deviated before this audit, fixed now.

### Ground movement

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Acceleration | 0.046875 | `_run_input` | test_ground: top speed after exactly 128 frames; test_reference flat run | exact |
| Deceleration (pressing against motion) | 0.5 | `_run_input` | test_ground: deceleration and turnaround quirk | exact |
| Turnaround snap | crossing 0 while decelerating sets 0.5 the new way | `_run_input` | test_ground; test_reference flat run (hard turnaround) | exact |
| Friction | 0.046875, only with no left/right input | `_run_input` | test_ground: friction to zero; test_reference | exact |
| Top speed | 6; accelerate then clamp, never reduce a higher speed | `_run_input` | test_ground; test_reference (jumps at 6, loop at 8) | exact |
| Skid | reversing at or above 4 px/f in floor mode | `_run_input` (`_skidding`) | test_ground: skid when reversing fast | exact (animation only) |
| Slope factor, running | gsp -= 0.125 * sin(angle), before input | `_apply_slope_factor` | test_slopes: uphill/downhill; test_reference 22.5/45 | exact |
| Slope factor on ceilings | none in the ceiling range (135-225) | `_apply_slope_factor` | test_reference loop (speed gained on the ceiling by acceleration only) | exact |
| Standing still on a shallow slope | no slope factor when gsp = 0 and the factor is under 0.05078125 | `_apply_slope_factor` | test_slopes: standing on gentle slope does not slip; test_reference roll uphill (30 deg: slides back after unrolling) | choice: the third game's rule (the second slides from rest) |
| Order of the ground step | spin dash, slope factor, jump, input, roll start, move, floor sensors, slip | `_ground_step` | test_reference (every ground scenario) | exact (Guide main loop) |
| Movement | x += gsp cos, y -= gsp sin | `_move_on_ground` | test_reference | exact; sub-stepped against the sensors (same end position on a plane) |
| Floor snapping while grounded | leave the ground when the floor is further than min(abs(speed) + 4, 14) | `_ground_floor_check` | test_slopes: sharp crests keep speed; test_reference | exact (second game window) |
| Wall sensors | E/F from the centre, push radius 10, 8 px lower on flat floor, only the one facing the motion, off on the ceiling half | `_ground_wall_check` | test_ground: wall stops ground speed; no tunnelling at 16 | exact |
| Speed cap | 16 | `_ground_step`, `_cap_velocity` | test_ground: wall at speed 16 | exact |

### Rolling

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Roll start | down held, no left/right, abs(gsp) >= 1.03125 | `_ground_step` step 5 | test_ground: roll needs minimum speed; test_reference slope down into a roll | exact (second game threshold) |
| No acceleration while rolling | input only decelerates | `_roll_input` | test_reference roll uphill | exact |
| Roll deceleration | 0.125, with the 0.5 turnaround snap | `_roll_input` | test_ground: roll friction and unroll | exact |
| Roll friction | 0.0234375, always (input or not), after deceleration | `_roll_input` | test_ground; test_reference | exact |
| Unroll | abs(gsp) < 0.5 | `_roll_input` | test_ground: roll friction and unroll | exact |
| Slope factor rolling | 0.078125 uphill, 0.3125 downhill (sign of gsp vs sin) | `_apply_slope_factor` | test_slopes: rolling uses up and down factors; test_reference | exact |
| Ball hitbox shift | centre moves 5 px along "down" when the hitbox changes, feet stay | `_set_ball` | test_player_api: respawn from a ball is exact | exact |
| Rolling jump | no air control after jumping from a roll | `_jump` (`_air_locked = _ball`) | test_air; test_reference jump at 6 (no drift) | exact |
| Landing from the air | always standing (the ball ends) | `_attach` | test_reference landing bands | choice: second game (the third lands rolling after a rolling jump) |
| Force roll | keeps rolling at 0.5 under a ceiling too low to stand | `_roll_input`, `_is_force_rolling` | test_ground: no unroll under a low ceiling | addition (classic tunnels do the same) |

### Air

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Gravity | 0.21875, applied after the move | `_air_step` steps 4-5 | test_air: apex height 99.84; test_reference jumps | **fixed**: was a trapezoid (half a gravity added to each move: 96.6 px apex, every arc 0.1 px/frame short) |
| Hurt gravity | 0.1875 | `_air_step` | test_reference hurt arc | exact |
| Air acceleration | 0.09375, up to top speed, never reducing a higher speed | `_air_step` step 2 | test_reference jumps at 3 and 6 | exact |
| Air drag | xsp -= trunc(xsp / 0.125) / 256 while -4 < ysp < 0 and abs(xsp) >= 0.125, before gravity | `_air_step` step 3 | test_air: drag only while rising slowly; test_reference air drag | exact (the fixed-point original floors negatives: at most 1/256 px/f apart) |
| Variable jump | releasing jump caps upward speed at 4 | `_air_step` step 1 | test_air: releasing cuts speed to 4; test_reference releases at 1/5/10 | exact |
| Angle easing in the air | 2.8125 deg per frame back to 0 | `_air_step` step 6 | test_reference jump off 45 | exact |
| Jump | xsp -= 6.5 sin, ysp -= 6.5 cos, on top of gsp along the ground; no movement on the jump frame | `_jump` | test_air: jump force; test_reference jump off 45 at +/-4 | exact |
| Jump clearance | no jump with a ceiling within 6 px of the head | `_has_jump_clearance` | test_air: ceiling | exact |
| Landing bands | flat (<= 23 deg): gsp = xsp; slope (<= 45): gsp = ysp/2 downhill when abs(xsp) <= ysp; steep: gsp = ysp downhill | `_land` | test_air: land on flat/slope/steep; test_reference landing on 0/30/60 | exact |
| Landing frame | the whole frame's motion, then the feet snap | `_move_in_air`, `_finish_landing_frame` | test_reference landing bands (position to 1/256) | **fixed**: a sub-step that landed dropped the rest of the frame |
| Ceiling landing | steep ceilings (91-135, 225-269) attach with gsp = ysp along them; flatter ones stop the rise | `_air_ceiling_check` | test_air: ceiling stops upward speed; qa: hurt on the loop ceiling | exact |
| Top-only platforms | land only within ysp + 8 px of the top | `_air_floor_check` | test_air: top-only platform | exact (third game grace) |
| Max fall speed | 16 | `_air_step` | test_air: fast fall does not tunnel | exact |

### Slipping and falling

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Slip | abs(gsp) < 2.5 on a slope at least `slip_angle` from flat: 30-frame control lock | `_check_slip` | test_slopes: standing on steep slope slips; test_reference slip on 50 | exact rule; see the angle below |
| Slip angle | 35 deg (tuning) | `core/physics_constants.tres` | test_slopes | choice to make (LEAD): the second game slips from 45 deg (and falls), the third from 35 (and slides); the controller has the third game's angle with the brief's "slide + lock" behaviour. Set `slip_angle = 45` to follow the second game's angle. The model uses 45. |
| Fall off | slipping on more than 69 deg from flat: leave the ground | `_check_slip` | test_slopes: very steep slope falls; test_reference wall climb | exact |
| Control lock | 30 frames, counts down on the ground, input ignored | `_check_slip`, `_ground_step` | test_reference slip on 50 (sliding back locked) | exact; friction still applies while locked (the original skips it while a direction is held) |

### Spin dash

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Start | jump while crouching (down held, standing still) | `_ground_step` step 1 | test_ground: spin dash tests | exact |
| Charge | +2 per press, at most 8 | `_spindash_step` | test_ground: four presses; full charge is 12 | exact |
| Decay | charge -= floor(charge / 0.125) / 256 each frame, before the press | `_spindash_step` | test_ground: charge decays; test_reference x1/x3/x7 with a 20-frame wait | exact |
| Release | 8 + floor(charge) / 2 the way he faces, on releasing down; rolling | `_spindash_step` | test_ground; test_reference | exact |
| While charging | no slope factor, friction or movement | `_ground_step` | test_reference | exact |

### Hurt, death, rebounds, springs

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Hurt knockback | xsp 2 away from the source, ysp -4, no drag, no control, 0.1875 gravity | `hurt`, `_air_step` | test_hurt; test_reference hurt arc | exact |
| Landing hurt | gsp 0 | `_attach` | test_hurt: no control until landing then stop | exact |
| Invincibility | 120 frames | `hurt` | test_hurt | exact |
| Death | xsp 0, ysp -7, gravity 0.21875, no collision | `kill`, `_dead_step` | test_reference death arc | exact (gravity order fixed with the air step) |
| Rebound | rising or below the enemy: ysp moves 1 toward 0; falling above it: ysp = -ysp | `bounce_off` | test_hurt: bounce off; test_reference rising/falling, jump held/not | exact |
| Springs | yellow 10, red 16, set (not added), no variable jump | `launch`; `levels/objects/spring.gd` | test_player_api: launch is a spring; test_reference yellow/red | exact |

### Hitboxes and sensors

| Item | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Standing radii | 9 x 19 | `get_radii`, tuning | test_player_api | exact |
| Rolling radii | 7 x 14, centre 5 px lower | `get_radii`, `_set_ball` | test_player_api: respawn from a ball | exact |
| Push radius | 10 | tuning; `_ground_wall_check`, `_air_wall_check` | test_ground: wall stops | exact |
| A/B floor sensors | at centre +/- 9 (7 rolling) along the mode's "right", cast along "down" from the centre; grounded reach 19 + 14, airborne to the feet (a floor up to 19 px above the feet at a sensor still lands and pushes him out) | `_ground_floor_check`, `_air_floor_check` | test_air; test_reference | exact |
| C/D ceiling sensors | centre +/- width, cast "up" to the head | `_air_ceiling_check`, `_has_jump_clearance` | test_air: ceiling | exact |
| E/F wall sensors | centre, +/- 10 along "right"; +8 px down on flat floor | `_ground_wall_check`, `_air_wall_check` | test_ground | exact |
| Modes | floor 0-45 and 315-360, right wall 46-134, ceiling 135-225, left wall 226-314 (boundaries inclusive) | `mode_for_angle` | test_loop: angle smooth round the loop | exact |
| Hitbox (Area2D) | the sensor box 3 px shorter at each end | `_update_hitbox` | qa: hitbox contract | choice |

### Animation timing

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Walk/run frame duration | max(0, 8 - floor(abs(gsp))) + 1 ticks per frame | `player_visual.gd` `frame_ticks` | test_animation_timing | **fixed**: was a smooth speed scale |
| Rolling frame duration | max(0, 4 - floor(abs(gsp))) + 1 ticks | `frame_ticks` | test_animation_timing | fixed |
| Walk vs run | run from 6 px/f | `wanted_animation` | - | exact |

## Choices and deviations, in one place

1. **Gravity order (fixed).** The move used `v*dt + g*dt^2/2`; the Guide
   moves by this frame's speed and only then adds gravity. Every arc was
   0.109 px per frame short and the standing jump peaked at 96.6 px instead
   of 99.84. Fixed in `_air_step` and `_dead_step`. All air behaviour changes
   by that much: the recorded input runs of the levels desynchronise
   (`tests/levels/inputs/*.json`) and need re-recording with the level
   agent's recorders.
2. **Landing frame (fixed).** Landing inside a movement sub-step dropped the
   rest of the frame's motion; the Guide moves the full frame, then snaps.
3. **Slip angle.** Tuning has 35 deg (third game); the brief's "slide + lock
   from 45" matches the second game's angle with the third's behaviour. The
   model uses 45. A lead decision on `core/physics_constants.tres`
   (`slip_angle`); the controller needs no change either way.
4. **Standing-still slope rule (0.05078125)** and **top-only landing grace
   (ysp + 8)** are the third game's rules, kept on purpose (the brief lists
   both).
5. **Landing from a rolling jump** stands up (second game).
6. **Friction under a control lock** applies as the Guide describes; the
   original engine skips it while a direction is held. Sub-pixel only, kept.
7. **Air drag rounding**: truncating division (the Guide's formula); the
   fixed-point original floors, which differs by at most 1/256 px/f for
   negative speeds.
8. **Sub-stepped movement** (at most 8 px, 4 in a sharp V) is an
   anti-tunnelling measure the classics did not need; on a plane the end
   position is identical, and walls stop him at the same place.
9. **Loops.** With right held at 8 px/f the exit speed is 8.68: the slope
    factor's losses and gains cancel, and on the ceiling (no slope factor,
    gsp below 6) acceleration adds the rest. The model agrees (test_reference
    full loop, within 0.25).
10. **Steep V valleys.** Running into a V with 60 deg or steeper sides at
    8 px/f no longer carries him out: he leaves the lip, lands on the far
    side and the steep landing band sends him back down, as in the classics.
    The old trapezoid happened to re-attach him to the lip. Jumping and spin
    dashing out still work (test_slopes).
11. **Animation timing** now follows the Guide formula on physics ticks
    (test_animation_timing); the placeholder's legs and the ball spin follow
    the same counter.

## Summary

63 rows audited: 54 exact, 4 fixed this round (gravity order, landing frame,
walk/run timing, roll timing), 4 documented choices between
the games (standing-still slope rule, rolling-jump landing, hitbox trim, and
the slip angle, which is the lead's call on the tuning resource), and 1
addition (the force roll under low ceilings).
