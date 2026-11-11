# Physics accuracy audit

Sproto's controller (`src/player/player.ts`) against the community Physics Guide
for the classic 16-bit trilogy. Baseline: the second game's values where the
games differ (roll threshold 1.03125, spin dash), no later additions (no drop
dash, insta-shield or peel-out), no coyote time, no input buffering.

How it is checked: `tests/physics/reference_sim.ts` is a pure-math model of
the Guide in px/frame, written without reference to the controller and with
every constant spelled out. `tests/physics/reference.test.ts` runs the real
Player and the model on the same inputs and demands the same position and
speed every frame, to 1/256 px, for 300+ frames per scenario (17 scenarios:
flat runs, jumps, slopes, rolls, landing bands, slipping, spin dash, hurt,
death, rebounds, springs, a loop and a half-pipe). The older tests named in
the matrix pin single rules.

Units: the public API is px/frame at 60 Hz; the controller integrates px/s
with the fixed delta, which is the same thing to about 1e-14 per frame.

Runtime: the engine-free TypeScript runtime casts the sensors against the
terrain's outward edges in a grid (`src/runtime/physics.ts`). Rays only hit
surfaces facing them, and edges shared by neighbouring tiles are merged
away, so the Godot workaround that re-measured an angle at an internal
polygon edge is no longer needed (the vertex re-measure for suspicious
angle steps stays). Moving terrain carries the rider at the end of each
tick, where it is drawn. Every rule and value below is unchanged, and the
reference tests still match the model to 1/256 px. The test names in the
matrix refer to the Vitest files in `tests/physics/` (`test_ground` is
`ground.test.ts`, and so on; the QA ones are `qa_*.test.ts`).

The extra moves (drop dash, charge run, shield bounce and the jump assist:
a jump pressed up to 5 frames after running off a ledge, or up to 6 frames
before landing, still counts; `COYOTE_FRAMES` and `JUMP_BUFFER_FRAMES` in
`src/player/moves.ts`) and the item-box
power-ups are additions outside this audit. They are off in Ranked and can
be turned off in Options; with them off the controller is exactly the
audited one, and the tests run that way.

## Matrix

Status: **exact** = matches the Guide rule and value; **choice** = a
documented alternative the Guide itself allows (which game, or a stated
reason); **fixed** = deviated before this audit, fixed now.

### Ground movement

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Acceleration | 0.046875 | `runInput` | test_ground: top speed after exactly 128 frames; test_reference flat run | exact |
| Deceleration (pressing against motion) | 0.5 | `runInput` | test_ground: deceleration and turnaround quirk | exact |
| Turnaround snap | crossing 0 while decelerating sets 0.5 the new way | `runInput` | test_ground; test_reference flat run (hard turnaround) | exact |
| Friction | 0.046875, only with no left/right input | `runInput` | test_ground: friction to zero; test_reference | exact |
| Top speed | 6; accelerate then clamp, never reduce a higher speed | `runInput` | test_ground; test_reference (jumps at 6, loop at 8) | exact |
| Skid | reversing at or above 4 px/f in floor mode | `runInput` (`skidding`) | test_ground: skid when reversing fast | exact (animation only) |
| Slope factor, running | gsp -= 0.125 * sin(angle), before input | `applySlopeFactor` | test_slopes: uphill/downhill; test_reference 22.5/45 | exact |
| Slope factor on ceilings | none in the ceiling range (135-225) | `applySlopeFactor` | test_reference loop (speed gained on the ceiling by acceleration only) | exact: the original's slope routine returns early for angles in the ceiling range ($60-$9F) |
| Standing still on a shallow slope | no slope factor when gsp = 0 and the factor is under 0.05078125 | `applySlopeFactor` | test_slopes: standing on gentle slope does not slip; test_reference roll uphill (30 deg: slides back after unrolling) | choice: the third game's rule (the second slides from rest) |
| Order of the ground step | spin dash, slope factor, jump, input, roll start, move, floor sensors, slip | `groundStep` | test_reference (every ground scenario) | exact (Guide main loop) |
| Movement | x += gsp cos, y -= gsp sin | `moveOnGround` | test_reference | exact; sub-stepped against the sensors (same end position on a plane) |
| Floor snapping while grounded | leave the ground when the floor is further than min(abs(speed) + 4, 14) | `groundFloorCheck` | test_slopes: sharp crests keep speed; test_reference | exact (second game window) |
| Wall sensors | E/F from the centre, push radius 10, 8 px lower on flat floor, only the one facing the motion, off on the ceiling half | `groundWallCheck` | test_ground: wall stops ground speed; no tunnelling at 16 | exact |
| Speed cap | 16 | `groundStep`, `capVelocity` | test_ground: wall at speed 16 | exact |

### Rolling

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Roll start | down held, no left/right, abs(gsp) >= 1.03125 | `groundStep` step 5 | test_ground: roll needs minimum speed; test_reference slope down into a roll | exact (second game threshold) |
| No acceleration while rolling | input only decelerates | `rollInput` | test_reference roll uphill | exact |
| Roll deceleration | 0.125, with the 0.5 turnaround snap | `rollInput` | test_ground: roll friction and unroll | exact |
| Roll friction | 0.0234375, always (input or not), after deceleration | `rollInput` | test_ground; test_reference | exact |
| Unroll | abs(gsp) < 0.5 | `rollInput` | test_ground: roll friction and unroll | exact |
| Slope factor rolling | 0.078125 uphill, 0.3125 downhill (sign of gsp vs sin) | `applySlopeFactor` | test_slopes: rolling uses up and down factors; test_reference | exact |
| Ball hitbox shift | centre moves 5 px along "down" when the hitbox changes, feet stay | `setBall` | test_player_api: respawn from a ball is exact | exact |
| Rolling jump | no air control after jumping from a roll | `jump` (`_air_locked = _ball`) | test_air; test_reference jump at 6 (no drift) | exact |
| Landing from the air | always standing (the ball ends) | `attach` | test_reference landing bands | choice: second game (the third lands rolling after a rolling jump) |
| Force roll | keeps rolling at 0.5 under a ceiling too low to stand | `rollInput`, `isForceRolling` | test_ground: no unroll under a low ceiling | addition (classic tunnels do the same) |

### Air

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Gravity | 0.21875, applied after the move | `airStep` steps 4-5 | test_air: apex height 99.84; test_reference jumps | **fixed**: was a trapezoid (half a gravity added to each move: 96.6 px apex, every arc 0.1 px/frame short) |
| Hurt gravity | 0.1875 | `airStep` | test_reference hurt arc | exact |
| Air acceleration | 0.09375, up to top speed, never reducing a higher speed | `airStep` step 2 | test_reference jumps at 3 and 6 | exact |
| Air drag | xsp -= trunc(xsp / 0.125) / 256 while -4 < ysp < 0 and abs(xsp) >= 0.125, before gravity | `airStep` step 3 | test_air: drag only while rising slowly; test_reference air drag | exact (the fixed-point original floors negatives: at most 1/256 px/f apart) |
| Variable jump | releasing jump caps upward speed at 4 | `airStep` step 1 | test_air: releasing cuts speed to 4; test_reference releases at 1/5/10 | exact |
| Angle easing in the air | 2.8125 deg per frame back to 0 | `airStep` step 6 | test_reference jump off 45 | exact |
| Jump | xsp -= 6.5 sin, ysp -= 6.5 cos, on top of gsp along the ground; no movement on the jump frame | `jump` | test_air: jump force; test_reference jump off 45 at +/-4 | exact |
| Jump clearance | no jump with a ceiling within 6 px of the head | `hasJumpClearance` | test_air: ceiling | exact |
| Landing bands | flat (<= 23 deg): gsp = xsp; slope (<= 45): gsp = ysp/2 downhill when abs(xsp) <= ysp; steep: gsp = ysp downhill | `land` | test_air: land on flat/slope/steep; test_reference landing on 0/30/60 | exact |
| Landing frame | the whole frame's motion, then the feet snap | `moveInAir`, `finishLandingFrame` | test_reference landing bands (position to 1/256) | **fixed**: a sub-step that landed dropped the rest of the frame |
| Ceiling landing | steep ceilings (91-135, 225-269) attach with gsp = ysp along them; flatter ones stop the rise | `airCeilingCheck` | test_air: ceiling stops upward speed; qa: hurt on the loop ceiling | exact |
| Top-only platforms | land only within ysp + 8 px of the top | `airFloorCheck` | test_air: top-only platform | exact (third game grace) |
| Max fall speed | 16 | `airStep` | test_air: fast fall does not tunnel | exact |

### Slipping and falling

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Slip | abs(gsp) < 2.5 on a slope at least `slip_angle` from flat: 30-frame control lock | `checkSlip` | test_slopes: standing on steep slope slips; test_reference slip on 50 | exact rule; see the angle below |
| Slip angle | 45 deg (tuning), strictly past it: a 1:1 hill is held | `src/core/physics_constants.json`, `checkSlip` | test_slopes; test_reference 45 deg running, slip on 50 | exact (second game's angle, the project baseline; the third game slips from 35 and slides) |
| Fall off | slipping on more than 69 deg from flat: leave the ground | `checkSlip` | test_slopes: very steep slope falls; test_reference wall climb | exact |
| Control lock | 30 frames, counts down on the ground, input ignored | `checkSlip`, `groundStep` | test_reference slip on 50 (sliding back locked) | exact; friction still applies while locked (the original skips it while a direction is held) |

### Spin dash

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Start | jump while crouching (down held, standing still) | `groundStep` step 1 | test_ground: spin dash tests | exact |
| Charge | +2 per press, at most 8 (+3 with the Tidebreaker skin unranked, `RelicLoadout.SPINDASH_CHARGE_PER_PRESS`; max unchanged) | `spindashStep` | test_ground: four presses; full charge is 12; test_relic_loadout: Tidebreaker | exact |
| Decay | charge -= floor(charge / 0.125) / 256 each frame, before the press | `spindashStep` | test_ground: charge decays; test_reference x1/x3/x7 with a 20-frame wait | exact |
| Release | 8 + floor(charge) / 2 the way he faces, on releasing down; rolling | `spindashStep` | test_ground; test_reference | exact |
| While charging | no slope factor, friction or movement | `groundStep` | test_reference | exact |

### Hurt, death, rebounds, springs

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Hurt knockback | xsp 2 away from the source, ysp -4, no drag, no control, 0.1875 gravity | `hurt`, `airStep` | test_hurt; test_reference hurt arc | exact |
| Landing hurt | gsp 0 | `attach` | test_hurt: no control until landing then stop | exact |
| Invincibility | 120 frames | `hurt` | test_hurt | exact |
| Death | xsp 0, ysp -7, gravity 0.21875, no collision | `kill`, `deadStep` | test_reference death arc | exact (gravity order fixed with the air step) |
| Rebound | rising or below the enemy: ysp moves 1 toward 0; falling above it: ysp = -ysp | `bounceOff` | test_hurt: bounce off; test_reference rising/falling, jump held/not | exact |
| Springs | yellow 10, red 16, set (not added), no variable jump | `launch`; `src/levels/objects/spring.ts` | test_player_api: launch is a spring; test_reference yellow/red | exact |

### Hitboxes and sensors

| Item | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Standing radii | 9 x 19 | `getRadii`, tuning | test_player_api | exact |
| Rolling radii | 7 x 14, centre 5 px lower | `getRadii`, `setBall` | test_player_api: respawn from a ball | exact |
| Push radius | 10 | tuning; `groundWallCheck`, `airWallCheck` | test_ground: wall stops | exact |
| A/B floor sensors | at centre +/- 9 (7 rolling) along the mode's "right", cast along "down" from the centre; grounded reach 19 + 14, airborne to the feet (a floor up to 19 px above the feet at a sensor still lands and pushes him out) | `groundFloorCheck`, `airFloorCheck` | test_air; test_reference | equivalent: the Guide's sensors reach 16 px below the feet, but the min(abs(gsp) + 4, 14) snap window never uses the last 2 px |
| C/D ceiling sensors | centre +/- width, cast "up" to the head | `airCeilingCheck`, `hasJumpClearance` | test_air: ceiling | exact |
| E/F wall sensors | centre, +/- 10 along "right"; +8 px down on flat floor | `groundWallCheck`, `airWallCheck` | test_ground | exact |
| Modes | floor 0-45 and 315-360, right wall 46-134, ceiling 135-225, left wall 226-314 (boundaries inclusive) | `modeForAngle` | test_loop: angle smooth round the loop | exact |
| Hitbox (Area2D) | the sensor box 3 px shorter at each end | `updateHitbox` | qa: hitbox contract | choice |

### Animation timing

| Rule | Value | Where | Pinned by | Status |
|---|---|---|---|---|
| Walk/run frame duration | max(0, 8 - floor(abs(gsp))) + 1 ticks per frame | `src/player/player_visual.ts` `frameTicks` | test_animation_timing | **fixed**: was a smooth speed scale |
| Rolling frame duration | max(0, 4 - floor(abs(gsp))) + 1 ticks | `frameTicks` | test_animation_timing | fixed |
| Walk vs run | run from 6 px/f | `wantedAnimation` | - | exact |

## Choices and deviations, in one place

1. **Gravity order (fixed).** The move used `v*dt + g*dt^2/2`; the Guide
   moves by this frame's speed and only then adds gravity. Every arc was
   0.109 px per frame short and the standing jump peaked at 96.6 px instead
   of 99.84. Fixed in `airStep` and `deadStep`. All air behaviour changes
   by that much: the recorded input runs of the levels desynchronise
   (`tests/levels/inputs/*.json`) and need re-recording with the playtest
   bot.
2. **Landing frame (fixed).** Landing inside a movement sub-step dropped the
   rest of the frame's motion; the Guide moves the full frame, then snaps.
3. **Slip angle.** 45 deg (second game's angle, the project baseline), with
   the third game's slide-and-lock behaviour. Exactly 45 deg does not slip:
   the original checks the angle strictly past the floor quadrant, and the
   zones' 1:1 hills must be holdable standing still.
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

63 rows audited: 54 exact (one of them, the floor sensor reach, equivalent
rather than identical), 4 fixed this round (gravity order, landing frame,
walk/run timing, roll timing), 3 documented choices between the games
(standing-still slope rule, rolling-jump landing, hitbox trim), 1 lead
decision applied (slip angle 45), and 1 addition (the force roll under low
ceilings).
