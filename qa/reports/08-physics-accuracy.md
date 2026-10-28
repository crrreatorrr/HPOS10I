# QA report 08: physics accuracy against the community Physics Guide

- **Date:** 2026-10-28
- **Reviewed:** `physics` @ 85bb0dc (78070f8 player fixes, f005347 reference model + comparison tests, a903fdc animation timing, 85bb0dc `docs/PHYSICS.md`), merged with main 96714ea (`slip_angle` 45). Baseline: main 96714ea.
- **Method:** `tests/qa/test_physics_accuracy.gd`, 19 checks written straight from the Guide's rules as closed forms and one-frame deltas, measured on the real Player in `tests/physics/physics_world.gd`, tolerance 1/256 px (or px/frame). Nothing from the physics agent's reference simulator is reused. Run at `--fixed-fps` 30, 60 and 144.
- **Director's bar:** a blocker is any Guide rule off by more than 1/256 px/frame, or any order-of-operations mismatch.

## Verdict: FIX FIRST (one test-level item), the physics itself is MERGE

- **Every Guide rule I measure is exact on `physics`:** 19 of 19 checks pass at 30, 60 and 144 fps, including the four rules the matrix marks "fixed". The order of operations matches the Guide in every trap I set. No blocker in the controller.
- **FIX FIRST:** on the merged tree (physics + main's `slip_angle` 45) the physics agent's own `tests/physics/test_reference.gd :: test_running_up_and_down_slopes` fails at exactly 45°, because its reference model slips at 45° while the controller doesn't (details under "Slip angle"). The gate won't pass until the model and controller agree on the boundary. One line either way; see the recommendation.
- The three (here five) recorded-run failures in `tests/levels` are the expected re-recordings.

## Measurements: main (baseline) vs physics

| Rule (Guide) | Guide value | main 96714ea | physics 85bb0dc |
|---|---|---|---|
| Rest to top speed, 0.046875 per frame | 128 frames, gsp = k·0.046875 every frame, clamps to exactly 6 | exact | exact |
| Accelerate, then clamp; never slow a higher speed | 5.9921875 → 6.0; 9 stays 9 | exact | exact |
| Friction stop from 6 | 128 frames, 381.0 px | exact | exact |
| Deceleration 0.5 from 6 | 6 − 0.5k, turnaround to 0.5 on frame 12 | exact | exact |
| Jump frame | no movement, then −6.5 on the first air frame | 0, then **−6.390625** | 0, then −6.5 |
| Full jump apex (position, then gravity) | 99.84375 px | **96.5625** (trapezoid) | 99.84375 |
| Variable jump | the release frame moves −4, then ysp = −3.78125 | **−3.890625** | exact |
| Gravity order (launch at ysp −6.5) | move −6.5, then ysp −6.28125 | **−6.390625** | exact |
| Air drag | xsp −= trunc(xsp/0.125)/256 when −4 < ysp < 0 and |xsp| ≥ 0.125; five cases incl. both bounds | exact | exact |
| Air drag after air accel, before gravity | 2 + 0.09375, then drag on that | exact | exact |
| Spin dash release, 0..7 presses | 8 + floor(charge)/2 → 8, 8.5, 9.5, 10.5, 11, 11.5, 11.5, 11.5 (with decay between presses) | exact | exact |
| Spin dash decay | charge −= floor(charge/0.125)/256 each frame; 60 frames from 2 | worst error 0.000000 | 0.000000 |
| Slip threshold | slips below 2.5, not at 2.5 (after the frame's slope factor and friction); 50° slope | exact | exact |
| Control lock | 30 frames | 30 | 30 |
| No slip under the slip angle; fall past 69° | 42°: no lock; 75°: stands, slips, falls | exact | exact |
| Roll start / unroll | ≥ 1.03125 rolls (after friction), < 0.5 unrolls (after roll friction) | exact | exact |
| Landing bands (flat / 23 / 30 / 46 / 60°) | flat: gsp = xsp; ≤ 45: ysp/2 downhill; steeper: ysp downhill, using the ysp after that frame's gravity | exact | exact |
| Hurt arc | xsp 2, ysp −4, gravity 0.1875, no drag; lands on frame 44, 88 px | **43 frames, 86 px** | 44, 88 |
| Death | ysp −7, first frame moves −7 | **−6.890625** | −7 |
| Springs and caps | 16 / 10; 16 cap on xsp, ysp and gsp; fall ≤ 16 | exact | exact |
| Hitbox radii | 9×19 standing, 7×14 rolling | exact | exact |
| Wall sensors | reach 10 from the centre, 8 px lower on flat ground | exact | exact |
| Loop at 8 px/f, right held | the Guide rules replayed on the game's own angle trace | worst 0.000000 px/f; exit 8.648 | same |
| Animation frame time (placeholder) | walk/run: max(0, 8 − gsp) per the Guide text; the original's countdown reads as +1 | no tick counter | 8/6/4/2 ticks at gsp 1/3/5/7 (= Guide + 1) |

- **Baseline main:** the one real deviation was the trapezoid air step (half a gravity added to every move). It shows up as 5 of my 19 checks: first air frame, apex (−3.28 px), variable-jump release frame, hurt arc (one frame and 2 px short), death launch (0.109 px/frame). 78070f8 fixes all of them; nothing else moved.
- **Landing bands:** the Guide air step is move → gravity → sensors, so the band uses the ysp *after* that frame's gravity. Both main and physics do that. (My first draft, and the brief, said "pre-gravity": that was wrong, not the code.)
- **Spin dash order:** the charge is 2.0000 right after the first press, so the per-frame decay runs before the press (decay of 0 is 0). The matrix says the same. Press-then-decay would give 1.9375; the Guide text doesn't settle it, and it only changes a release at an integer boundary of the charge.

## Order-of-operations traps (all pass on physics)

1. The jump frame moves nothing; the first air frame moves by the full −6.5 (position += ysp, then ysp += gravity).
2. Top speed clamps after the acceleration step (5.9921875 + 0.046875 lands on 6.0 exactly).
3. Gravity is added after the move (launch at −6.5 moves −6.5; death at −7 moves −7).
4. Air drag applies after air acceleration and before gravity.
5. Slope factor, then friction, then the slip check (verified by the exact 2.5 threshold).
6. Roll start reads the speed after friction; unroll after roll friction.

## Cross-checks on the matrix

- **"Fixed" rows:** gravity order, the whole landing frame, the walk/run and roll frame timing: confirmed above (apex 99.84, death 7, hurt 44/88, landing values exact).
- **Floor sensor reach (14 vs the Guide's 16):** the matrix lists "grounded reach 19 + 14" as exact. The Guide draws A/B 16 px below the feet, but it snaps only within min(|gsp| + 4, 14) px, so a floor 15–16 px down is found and then not snapped to. Behaviourally the two are identical in every grounded and landing case I can construct; the 2 px are a drawing length. **Not a deviation; a documentation note** (label it "equivalent", not "exact").
- **Slope factor on the ceiling (135–225°):** the controller skips it there, and on the game's own angle trace through the loop it follows that rule to 0.000000 px/f. If the Guide text applies the slope factor on ceilings too, the loop exit would be 0.56 px/f lower. The matrix calls the skip Guide behaviour; I can't confirm the wording from memory, so I list it as an open check for the lead, not a finding.
- **Loop exit 8 → 8.648 (the agent says 8.68):** the controller follows the per-frame rules on the geometry it measures. The absolute number is geometry: the loop is a 72-sided polygon with feet, so the measured angle jumps about 12° where sensor modes change and the lap takes fewer frames than an ideal ring (an ideal ring of r 112 would exit at 9.16). The model agreeing with the controller on the same polygon doesn't test the Guide; the per-frame replay does, and it passes.
- **Documented choices:** (1) the 0.05078125 standing-still slope rule is a Guide rule (second game) and measures exact; (2) the top-only landing grace (ysp + 8) matches the Guide's jump-through rule; (3) landing from a rolling jump stands up: a second-game choice, stated; (4) the Area2D hitbox trimmed 3 px: a choice with no physics effect. All four are correctly labelled.
- **Addition:** the force-roll under low ceilings (creep at 0.5) is the QA-requested behaviour from report 01, unchanged.

## Slip angle at exactly 45°

- main 96714ea sets `slip_angle` 45 (second game). The controller slips only when the slope is **steeper than** 45°; the physics agent's reference model slips **at** 45° and up. On the merged tree their `test_running_up_and_down_slopes` therefore fails at 45° by 2 × 0.046875 (the model locks input; the controller doesn't).
- Which is the Guide? The second game compares the hex angle against 0x20 (= 45°), and the Guide's prose says "over 45°". The two readings differ only at exactly 45°.
- **Recommendation:** keep the controller's reading (45° does not slip) and fix the model's comparison. The test zone, Zone 1 and Zone 2 all have 1:1 (45°) hills that a standing Sproto must be able to stand on; QA's momentum rule and the recorded runs assume it.
- My audit checks the slip angle from `Tuning.physics.slip_angle` (slips at +5°, never at −3°), so it passes with 35 or 45.

## Animation timing

The placeholder's walk/run frames now step on physics ticks: 8, 6, 4 and 2 ticks per frame at gsp 1, 3, 5 and 7. That is max(0, 8 − |gsp|) + 1, the original's countdown read as "set to N, advance when it reaches 0". The Guide's text says the frame lasts max(0, 8 − |gsp|) frames; the +1 is a documented reading, one tick per animation frame, and not a movement rule. Not a blocker. The roll formula couldn't be measured through the ball spin counter in this pass.

## Suite results on the merged tree

- 557 passed, 6 failed: the 5 recorded-run tests in `tests/levels` (expected) and `test_reference :: test_running_up_and_down_slopes` (the 45° boundary above). Smoke 52/52. Originality 0 hits.
- QA audit: 19/19 at 30, 60 and 144 fps.
- The audit test skips on main until 78070f8 is merged (it keys on the new landing helper), so `qa` stays green.
