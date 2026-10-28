# QA report 01: physics @ 3aa4be3, re-checked @ 9f3303c, @ 94dcac3 and @ 4eead62

> **Final verdict (re-check #3 @ 4eead62): MERGE.**
> - Every blocker and major found in this step is fixed and guarded by a regression test: BUG-01-01 to 01-04 and 01-06 to 01-11.
> - The new sharp-V rule could not be made to misfire. It stays off on loops, quarter pipes, U-shaped valleys and layered terrain; every V and U can be left; and 32 of 32 reference trajectories match 9f3303c frame for frame.
> - Backlog (minor): BUG-01-12 (jump ignored on the lower part of a steep V side), BUG-01-13 (the centre pops 11–15 px at sharp concave corners into steep sides).
> - WONTFIX: BUG-01-05.
> - The test suite runs 155 tests in about 6 s.
>
> See "Re-check #3 @ 4eead62" at the end.

- Date: 2026-10-28
- Branch: `physics` @ `3aa4be3` (Merge main into physics), base `main` @ `560175a`
- Checklist: `qa/checklists/01-physics.md`, plus the terrain/loop items (section T below). Camera is out of scope (step 3).
- Review copy: `git archive 3aa4be3` (it already contains the QA tools from main), with the new QA tests from `qa` laid over it.
- Note: `physics` has since moved to `1c6e698` (reads the new PhysicsConstants fields). That commit is not reviewed here; see "Re-check".

## Verdict @ 3aa4be3: FIX FIRST

The controller is strong: every number in the checklist matches, nothing tunnels at 16 px/frame, loops and path switchers hold at every speed and phase tried, and 1.5 hours of fuzzed play (324 000 frames) produced no errors, NaNs or leaks. One blocker remains: `terrain/loop.tscn`, the ready-to-place loop every zone will use, lets Sproto run off its outer top, wrap under the floor and fall out of the world (BUG-01-01). Fix that, and QA re-checks it with the repro; the four minors can go to the backlog.

Open bugs: **1 blocker, 0 major, 4 minor.**

## Tool results

| Tool | Result | Notes |
|---|---|---|
| `godot --import` | PASS | no errors or warnings |
| Tests (`tests/run_tests.gd`) | 73 passed, 0 failed | 6 core, 10 contract (player contract now active, not skipped), 57 physics agent tests |
| QA regression guards (`tests/qa/test_physics_regression.gd`, new) | 41 passed, 0 failed | full suite with them: 114 passed; on `main` they skip (57 passed) |
| `tools/qa/scene_smoke.sh` | 7/7 PASS | import, 35 scripts, boot, `player.tscn`, `scattered_coin.tscn`, `loop.tscn`, `sandbox.tscn` |
| `tools/qa/originality_scan.sh` | 0 hits | files (112) and commit messages `main..3aa4be3` (8) |
| `tools/qa/playtest_bot.gd` runner, sandbox, 7 200 frames | crossed the whole sandbox | both loops, hills, quarter pipe (the end); 0 deaths, 0 NaN |
| bot fuzz, seeds 1/2/3 × 36 000 frames | PASS | 0 `ERROR`/`WARNING`, 0 NaN frames, only contract states |
| bot fuzz, seed 11 × 216 000 frames (1 h) | PASS | 0 errors, 0 NaN; nodes 143 at the end (205 peak with coins), orphans 0, static memory 24.9 → 29.6 MB (scene load), flat |
| Determinism | PASS | fuzz seed 1 replayed twice through Dev `--inputs`: identical to each other and to the original run |
| Overlay on/off | PASS | same replay with `--overlay`: identical results |
| `git diff --name-only main...3aa4be3` | owned folders only | `player/`, `terrain/`, `tests/physics/` |

Clips (recorded with `tools/lead/record_clip.sh` on the review copy): `qa01_tour` (agent's tour timeline, overlay on), `qa01_loop_top_wrap`, `qa01_pillar`, `qa01_tunnel`, `qa01_accessory` (wizard hat), `qa01_hurt` (sunglasses). Frame sheets are committed in `qa/reports/evidence/01-physics/`.

## Checklist

Evidence key: **agent** = `tests/physics/<file>.gd :: <test>`; **QA** = `tests/qa/test_physics_regression.gd :: <test>`; **probe** = one-off QA probe run on the review copy (results quoted).

### A. Constants and tuning

| ID | Result | Evidence |
|---|---|---|
| PHY-A1 | PASS | `tests/core/test_core.gd :: test_physics_constants_match_guide` |
| PHY-A2 | SKIP | Re-check after `1c6e698`. At 3aa4be3, 8 `LEAD-REQUEST` local constants were still in `player.gd`/`scattered_coin.gd` (skid 4.0, turnaround 0.5, slope_stand_min, air_angle_ease, 4 coin values). Per the lead these are being moved into PhysicsConstants. No other Director constant is hard-coded (grep clean). |
| PHY-A3 | PASS | grep finds no cached `Tuning.physics`; QA `test_tuning_is_read_every_frame` (runtime `top_speed` 8 applies at once) |
| PHY-A4 | PASS | Real-time run with the editor binary: editing `top_speed` to 9 in the `.tres` mid-run printed `[Tuning] physics constants reloaded` and the air speed rose from 6.00 to 9.00 within 30 frames. |
| PHY-A5 | PASS | agent `test_ground :: test_reaches_top_speed_after_exactly_128_frames` (127 × 0.046875, then 6.0 at frame 128) |
| PHY-A6 | PASS | `project.godot` has no `physics_ticks_per_second` override (default 60) |

### B. Ground movement

| ID | Result | Evidence |
|---|---|---|
| PHY-B1 | PASS | agent `test_reaches_top_speed_after_exactly_128_frames` |
| PHY-B2 | PASS | agent `test_friction_to_zero` (exact 0, idle) |
| PHY-B3 | PASS | agent `test_deceleration_and_turnaround_quirk` (-0.5 turnaround) |
| PHY-B4 | PASS | QA `test_skid_threshold_is_4` (3.99 no skid, 4.0 skid); agent `test_skid_when_reversing_fast` |
| PHY-B5 | PASS | QA `test_speed_above_top_is_kept_while_holding_forward` (10 kept on ground; 8 kept in air) |
| PHY-B6 | PASS | QA `test_left_and_right_together_is_no_input` (no input, friction only, no flicker) |
| PHY-B7 | PASS | QA `test_velocity_is_ground_speed_projected` (error < 0.001 on 30°) |
| PHY-B8 | PASS | QA `test_run_off_ledge_keeps_speed` |
| PHY-B9 | PASS | QA `test_steps_up_to_10px_are_climbed`. The highest step climbed at 6 px/f is 10 px; 11 px and up block, because the wall sensor sits 8 px below the centre on flat ground. Level note below. |
| PHY-B10 | SKIP | manual feel: needs a human at the controls (the tour clip looks right) |

### C. Air and jumping

| ID | Result | Evidence |
|---|---|---|
| PHY-C1 | PASS | agent `test_air :: test_jump_apex_height` (96.57 at the feet, lead decision); QA `test_full_jump_air_time` (60 frames) |
| PHY-C2 | PASS | agent `test_releasing_jump_cuts_speed_to_4`; QA `test_release_after_apex_changes_nothing` |
| PHY-C3 | PASS | QA `test_air_acceleration_and_terminal_speed`, `test_speed_above_top_is_kept_while_holding_forward` (input caps at 6) |
| PHY-C4 | PASS | agent `test_air_drag_only_while_rising_slowly` |
| PHY-C5 | PASS | QA `test_air_acceleration_and_terminal_speed` (terminal 16.0) |
| PHY-C6 | PASS | QA `test_jump_leaves_perpendicular_to_slope` (22° and 338°, error < 0.01) |
| PHY-C7 | PASS | QA `test_no_double_jump` |
| PHY-C8 | PASS | probe: pressing 1–2 frames before landing does not jump (no buffer, classic); a press on the landing frame and the frame after jumps |
| PHY-C9 | PASS | agent `test_ceiling_stops_upward_speed`, `test_loop :: test_jump_into_steep_ceiling_attaches`; QA `test_no_tunnelling_through_ceilings_at_16` |
| PHY-C10 | PASS | no jump within 6 px of a ceiling (lead decision); no clipping seen |
| PHY-C11 | PASS | QA `test_jump_against_a_wall_does_not_stick_or_jitter` (x drift < 0.01 over 80 frames) |
| PHY-C12 | SKIP | manual feel |

### D. Slopes and landing

| ID | Result | Evidence |
|---|---|---|
| PHY-D1 | PASS | agent `test_slopes :: test_running_uphill_slows_by_slope_factor`, `test_running_downhill_speeds_up` |
| PHY-D2 | PASS | agent `test_rolling_uses_up_and_down_factors` |
| PHY-D3 | PASS | agent `test_standing_on_gentle_slope_does_not_slip`. See BUG-01-05 for what happens after a tap on 22–24°. |
| PHY-D4 | PASS | agent `test_standing_on_steep_slope_slips`, `test_standing_on_very_steep_slope_falls`, `test_slow_run_up_steep_slope_slips_back` |
| PHY-D5 | PASS | agent `test_land_on_flat_keeps_x_speed`, `test_land_on_slope_halves_y_speed`, `test_land_on_slope_fast_x_keeps_x`, `test_land_on_steep_slope_full_y_speed` |
| PHY-D6 | PASS | QA `test_mirrored_slope_angle` (338.0) |
| PHY-D7 | PASS | QA `test_ramps_at_speed_stay_grounded`: 0 airborne frames at 12 px/f over 22°/45°/-45° ramps with fillets 16 and 48. The lead's note about fillets under 48 did not reproduce on these ramps. |
| PHY-D8 | PASS | probe: down -45° and -60° at 6 px/f, 0 airborne frames |

### E. Collision sensors

| ID | Result | Evidence |
|---|---|---|
| PHY-E1 | PASS | grep: no `move_and_slide`, `move_and_collide` or `CharacterBody2D` in code |
| PHY-E2 | PASS | code: every ray uses `PlayerSensors.terrain_mask()` (bits 1–4 only) |
| PHY-E3 | PASS | QA `test_balances_on_a_ledge_with_one_sensor` |
| PHY-E4 | PASS | agent `test_wall_stops_ground_speed` (flush at push radius) |
| PHY-E5 | PASS | QA `test_no_tunnelling_through_thin_walls_at_16` (1 and 8 px walls, ground and air, 6 phases each; a probe also covered 2 and 16 px across all 16 phases) |
| PHY-E6 | PASS | QA `test_no_tunnelling_through_ceilings_at_16` (1/8/16 px) |
| PHY-E7 | PASS | agent `test_player_api :: test_collision_path_selects_terrain` |
| PHY-E8 | PASS | agent `test_top_only_platform_jump_through_and_land`; QA `test_top_only_platforms` (no snap when running under; lands at 8 and 16 px/f) |
| PHY-E9 | FAIL | **BUG-01-02**: landing centred on terrain narrower than 18 px sinks into it. Edge landings on wider pillars are fine. |
| PHY-E10 | PASS | probe: pits 14–24 px wide, walked at 1–2 px/f: no wedge, 0 jitter frames |
| PHY-E11 | PASS | clip `qa01_tour` (overlay): A/B rays end on the floor line, E/F rays at centre or centre+8 |

### F. Collision modes, loops, wall running

| ID | Result | Evidence |
|---|---|---|
| PHY-F1 | PASS | agent `test_loop_at_top_speed_left_to_right` (modes 1/2/3 seen) |
| PHY-F2 | PASS | QA `test_loop_both_ways_at_8_and_16`; probe 6/8/10/12/14/16 both ways: all full, never airborne, path A after |
| PHY-F3 | PASS | agent `test_loop_right_to_left`; QA (above) |
| PHY-F4 | PASS | agent `test_too_slow_falls_off_the_loop`. Probe, coasting with no input: minimum entry speed ≈ 8.6 px/f (radius 80) and ≈ 10.2 px/f (radius 112). Below it Sproto drops cleanly onto the floor. |
| PHY-F5 | PASS | agent `test_loop_after_spindash` |
| PHY-F6 | PASS | QA `test_jump_inside_the_loop_leaves_along_the_normal` (normal component 6.50 at 90/180/270; never inside terrain) |
| PHY-F7 | PASS | QA `test_reversing_mid_loop_falls_back_cleanly` |
| PHY-F8 | PASS | QA `test_path_switchers_at_16_every_phase` (a probe ran all 32 phase/direction cases at 16 px/f, all end on path A), `test_two_loops_in_a_row_at_16` |
| PHY-F9 | PASS | QA `test_quarter_pipe` (10 px/f: straight-up launch, \|vx\| 0.000, returns running left; 4 px/f slides back) |
| PHY-F10 | PASS | agent `test_too_slow_falls_off_the_loop` (detaches past the fall angle) |
| PHY-F11 | PASS | `evidence/01-physics/tour_overlay_sheet.png`; loop frames 500–571 of `qa01_tour`: smooth rotation, no pops |

### G. Rolling

| ID | Result | Evidence |
|---|---|---|
| PHY-G1 | PASS | agent `test_roll_friction_and_unroll`, `test_roll_needs_minimum_speed` |
| PHY-G2 | PASS | QA `test_roll_decel_friction_and_no_forward_accel` |
| PHY-G3 | PASS | agent `test_roll_friction_and_unroll` |
| PHY-G4 | PASS | QA `test_feet_stay_put_on_roll_and_unroll` |
| PHY-G5 | FAIL | **BUG-01-03**: unrolling in a tunnel lower than 38 px leaves the head 6 px inside the ceiling |
| PHY-G6 | PASS | code: a jump out of a roll locks air control (`_air_locked = _ball`), the documented classic rule |
| PHY-G7 | PASS | QA `test_is_attacking_only_in_ball_states` |

### H. Spin dash

| ID | Result | Evidence |
|---|---|---|
| PHY-H1 | PASS | agent `test_spindash_zero_presses_is_base_speed`, `test_spindash_four_presses` (lead decision: 8 / 11.5 / 12) |
| PHY-H2 | PASS | agent `test_spindash_full_charge_is_12`, `test_spindash_left` |
| PHY-H3 | PASS | QA `test_spindash_jump_spam_clamps_charge` (120 frames of spam: charge ≤ 8, never jumps) |
| PHY-H4 | PASS | QA `test_spindash_release_and_jump_on_the_same_frame` (real input events on one frame: releases into a roll, no jump) |
| PHY-H5 | PASS | QA `test_spindash_uphill_on_22_degrees` (release 8 along the surface). Note: right after a tap downhill on 22–24°, a spin dash is not possible (BUG-01-05). |
| PHY-H6 | PASS | QA `test_spindash_against_a_wall` |
| PHY-H7 | PASS | probe + QA `test_hurt_from_every_state_lands_cleanly` (hurt cancels the charge; no leftover state). Cosmetic: `spindash_charge` keeps its value (overlay shows it) until the next spin dash. |
| PHY-H8 | PASS | agent `test_spindash_charge_decays` (classic formula) |

### I. States, damage, player API

| ID | Result | Evidence |
|---|---|---|
| PHY-I1 | PASS | bot fuzz `state_frames` hold only contract states; `_change_state` ignores same-state changes |
| PHY-I2 | PASS | agent `test_hurt_knocks_back_away_from_source`, `test_no_control_until_landing_then_stop` |
| PHY-I3 | PASS | agent `test_scatter_at_most_32_coins`, `test_scattered_coin_recollect_delay`, `test_scattered_coin_bounces_and_vanishes`, `test_hit_with_zero_coins_kills` |
| PHY-I4 | PASS | agent `test_invincible_for_120_frames`, `test_hits_ignored_while_invincible`; blinking seen in `qa01_hurt` |
| PHY-I5 | PASS | QA `test_hurt_and_kill_edge_cases` (kill ignores invincibility); agent `test_kill_and_died_signal` |
| PHY-I6 | PASS | QA `test_hurt_and_kill_edge_cases` (both orders: one `died`) |
| PHY-I7 | PASS | QA `test_hurt_and_kill_edge_cases` (no launch while dead); probe: kill mid-spring dies cleanly |
| PHY-I8 | PASS | QA `test_hurt_from_every_state_lands_cleanly` (7 states), `test_hurt_on_the_loop_ceiling` (mode reset, lands inside the loop) |
| PHY-I9 | PASS | agent `test_launch_is_a_spring_not_a_jump` |
| PHY-I10 | PASS | agent `test_push_ground_locks_control`; QA `test_control_locks` (jump works during the lock) |
| PHY-I11 | PASS | QA `test_control_locks` |
| PHY-I12 | PASS | agent `test_bounce_off` |
| PHY-I13 | PASS | agent `test_freeze` (speeds are reset to 0 on freeze, by design) |
| PHY-I14 | FAIL | **BUG-01-04**: `respawn_at()` lands 5 px above the target when called in the ball hitbox |
| PHY-I15 | PASS | agent `test_clamp_rect_pushes_and_crushes`; QA `test_clamp_rect_right_and_top_edges` |
| PHY-I16 | PASS | agent `test_from_area` |
| PHY-I17 | PASS | `tests/qa/test_contracts.gd :: test_player_contract` runs (not skipped) and passes |
| PHY-I18 | PASS | agent `test_accessory_follows_zone`; `evidence/01-physics/accessory_wizard_hat.png` (hat on every pose incl. ball, follows slopes); sunglasses in `qa01_hurt` |
| PHY-I19 | PASS | `qa01_hurt`: knockback, coin fan and blink read clearly (QA judgement; lead to confirm) |

### J. Input robustness

| ID | Result | Evidence |
|---|---|---|
| PHY-J1 | PASS | bot fuzz seeds 1–3 × 36 000 frames + seed 11 × 216 000: 0 errors, 0 NaN |
| PHY-J2 | PASS | replay identical (see tool results) |
| PHY-J3 | PASS | QA `test_pause_freezes_every_state_and_drops_presses` (9 states; jump pressed during pause does not fire) |
| PHY-J4 | PASS | probe with input events: run + down + jump on one frame jumps; release + jump during spin dash releases (H4); down on the landing frame rolls on the next ground frame |
| PHY-J5 | SKIP | manual (window focus loss); Dev replay now re-presses held actions |
| PHY-J6 | SKIP | manual (no gamepad on the QA machine) |

### K. Long sessions

| ID | Result | Evidence |
|---|---|---|
| PHY-K1 | PASS | bot 216 000 frames: nodes/orphans/memory flat (see tool results) |
| PHY-K2 | PASS | 324 000 fuzz frames, 0 NaN |
| PHY-K3 | PASS | QA `test_steady_motion_far_from_the_origin` (x = 50 000, error < 0.02) |

### L. Debug overlay

| ID | Result | Evidence |
|---|---|---|
| PHY-L1 | PASS | `evidence/01-physics/tour_overlay_sheet.png`: gsp, x/y speed, angle, mode, state, grounded, path, lock, charge, fps; A–F rays and hitbox drawn |
| PHY-L2 | PASS | code: the panel reads the player's properties every frame |
| PHY-L3 | PASS | replay with and without `--overlay` identical |
| PHY-L4 | PASS | readable at 3× in the clips. It sits top-left, where a HUD may go; re-check in the UI step. |

### T. Terrain and loop items

| ID | Result | Evidence |
|---|---|---|
| T-1 `loop.tscn` works out of the box at any radius | PASS | QA `test_loop_radii` (48, 80, 160, 220; both directions at 10 px/f) |
| T-2 radius set before the loop enters the tree | PASS | QA `test_loop_radius_set_before_entering_tree` |
| T-3 path switchers, both directions, high speed | PASS | QA `test_path_switchers_at_16_every_phase`, `test_two_loops_in_a_row_at_16` |
| T-4 CurveTerrain ramps and quarter pipe | PASS | QA `test_ramps_at_speed_stay_grounded`, `test_quarter_pipe` |
| T-5 outer surface of the loop | FAIL | **BUG-01-01** |
| T-6 scene smoke of `loop.tscn` and `scattered_coin.tscn` | PASS | `scene_smoke.sh` |

## Bugs

### BUG-01-01: Running off the top of a loop wraps under the floor and out of the world

- **Severity:** blocker. It is tunnelling through terrain at normal speed (3 px/f) in the shared, ready-to-place loop that the zones will instance. It happens whenever a route passes over a loop or Sproto lands on one.
- **Owner:** physics agent (`terrain/loop.gd` / `terrain/loop.tscn`; the controller side is in `player/player.gd`)
- **Checklist:** T-5, PHY-F
- **Repro:** `qa/repros/physics/BUG-01-01_loop_outer_wrap.gd` (fixed @ 9f3303c; now `tests/qa/test_physics_fixes.gd :: test_bug_01_01_off_the_loop_top_lands_on_the_floor`) (copy to `tests/qa/` in a review copy, run with `--filter=BUG-01-01`). To watch it: copy `qa/repros/physics/clips/` to `res://tests/qa_clips/`, then
  ```bash
  PROJECT_DIR=<copy> tools/lead/record_clip.sh loop_top 200 \
      --scene=res://tests/qa_clips/loop_top.tscn --inputs=res://tests/qa_clips/inputs/hold_right.json --overlay
  ```
  ```json
  {"events": [[30, "move_right", true]]}
  ```
  (Sproto starts standing on top of a radius-112 loop on a flat floor. No route in the sandbox reaches a loop top, so there is no sandbox timeline.)
- **Expected:** Sproto runs down the outside of the ring and lands on the floor beside it (feet y = 0).
- **Actual:** He stays attached to the ring's outer surface through left-wall and ceiling modes. He follows it under the floor line (the outer circle's bottom is `thickness` = 16 px below the floor), so his centre is inside the floor from frame 61. He detaches inside it, and from there every ray starts inside terrain, so he falls forever (y ≈ 2 129 after 240 frames). Path A running right and path B running left are mirror images; both fail.
- **Evidence:** `qa/reports/evidence/01-physics/BUG-01-01_loop_outer_wrap.png` (frames 24–144: angle 3° → 288° left wall → 219° ceiling under the floor → airborne inside the floor).
- **Notes:** Two possible fixes:
  - **Terrain:** give the loop a solid outside below the ring's equator down to the floor, so the outer surface ends on the floor like a hill.
  - **Controller:** while grounded in a wall or ceiling mode, also probe the head side for terrain.
  The classic games avoid this through level art; the standalone loop piece does not.

### BUG-01-02: Landing centred on terrain narrower than 18 px sinks into it

- **Severity:** minor (only for solid pieces narrower than the A/B sensor span)
- **Owner:** physics agent (`player/player.gd` / `player/sensors.gd`); or a documented rule for the level agent
- **Checklist:** PHY-E9
- **Repro:** `qa/repros/physics/BUG-01-02_narrow_terrain_sink.gd` (fixed @ 9f3303c; now `tests/qa/test_physics_fixes.gd :: test_bug_01_02_lands_on_narrow_pillars`); clip scene `qa/repros/physics/clips/pillar.tscn` (no inputs, 75 frames).
- **Expected:** lands on top of an 8 or 16 px wide pillar.
- **Actual:** the A/B rays at x ± 9 both miss the pillar, the centre enters it at frame 27, and E/F rays that start inside it see nothing. He sinks to whatever is below, which is a death pit if nothing is.
- **Evidence:** `qa/reports/evidence/01-physics/BUG-01-02_pillar_sink.png`
- **Notes:** Either add a centre floor ray when A and B both miss, or add "solid pieces at least 18 px wide" to `docs/CONTRACTS.md` (LEAD-REQUEST).

### BUG-01-03: Unrolling under a low ceiling puts the head inside it

- **Severity:** minor. No softlock: he can walk out; only jumping is refused.
- **Owner:** physics agent (`player/player.gd`, `_roll_input` unrolls without a ceiling check)
- **Checklist:** PHY-G5
- **Repro:** `qa/repros/physics/BUG-01-03_unroll_into_ceiling.gd` (fixed @ 9f3303c; now `tests/qa/test_physics_fixes.gd :: test_bug_01_03_keeps_rolling_under_a_low_ceiling`); clip: `clips/tunnel.tscn` with `clips/inputs/tunnel.json` (300 frames).
  ```json
  {"events": [[10, "move_right", true], [70, "move_right", false], [70, "move_down", true], [72, "move_down", false],
              [200, "move_right", true], [215, "move_right", false], [240, "jump", true], [250, "jump", false]]}
  ```
- **Expected:** in a tunnel lower than the standing height (38 px), Sproto keeps rolling (classic force-roll) or is kept out of the ceiling.
- **Actual:** in a 32 px tunnel he unrolls at x ≈ 183 and stands with his head at y -38, 6 px inside the ceiling at -32. Jump is refused for lack of clearance until he walks out.
- **Evidence:** `qa/reports/evidence/01-physics/BUG-01-03_unroll_in_tunnel.png` (frame 230)
- **Notes:** Either stay in the ball while the ceiling probe fails, or add the level rule "roll-only tunnels at least 40 px, or use a force-roll trigger".

### BUG-01-04: `respawn_at()` lands 5 px above the target from a ball state

- **Severity:** minor (a respawn after a death already leaves the ball hitbox, so this only shows when a level teleports a rolling or jumping player)
- **Owner:** physics agent (`player/player.gd`, `respawn_at`)
- **Checklist:** PHY-I14
- **Repro:** `qa/repros/physics/BUG-01-04_respawn_offset.gd` (fixed @ 9f3303c; now `tests/qa/test_physics_fixes.gd :: test_bug_01_04_respawn_at_is_exact_from_any_state`)
  ```gdscript
  # rolling on flat ground, then:
  player.respawn_at(Vector2(300, -19))   # global_position is (300, -24)
  ```
- **Expected:** `global_position == (300, -19)`.
- **Actual:** `(300, -24)`. `respawn_at` sets the position first and then `_set_ball(false)` shifts the centre up by 5 (19 - 14). It is the same from a jump.
- **Notes:** call `_set_ball(false)` before setting `global_position`.

### BUG-01-05: After a tap on a 22° slope Sproto creeps for 16 s and cannot spin dash

- **Severity:** minor (feel). The lead decides whether this is an accepted classic quirk.
- **Owner:** physics agent (`player/player.gd`, `_apply_slope_factor` / `_run_input`)
- **Checklist:** PHY-D3, PHY-H5
- **Repro:** `qa/repros/physics/BUG-01-05_slope_creep.gd` (on a 22° slope: tap left for one frame, wait 60 frames, then down + jump)
- **Expected:** stopped within about 60 frames, then down + jump starts a spin dash. The classic integer maths truncates the slope factor and stops in about a dozen frames.
- **Actual:** the slope factor 0.125 × sin 22° = 0.04683 nearly cancels friction 0.046875, so speed falls by about 0.00005 per frame. Sproto creeps about 0.045 px/f for 953 frames (20 px) and cannot crouch, so down + jump is a jump. Probe results:

  | Slope | Behaviour after a 1-frame downhill tap |
  |---|---|
  | 15° | stops in 3 frames |
  | 20° | stops in 11 frames |
  | 21.5° | stops in 44 frames |
  | 22° | stops after 953 frames |
  | 22.5–24° | never stops (slowly accelerates downhill) |

- **Notes:** The sandbox's gentle slopes are exactly 22°, a common level angle. Options: quantise like the original, or snap ground speed to 0 when |speed| ≤ friction and |slope factor| < `slope_stand_min`.

## Notes for the lead

- **Re-check:**
  - `1c6e698` (the constants swap, after this review) still needs QA: PHY-A2, plus the regression guards and all `tests/physics` tests against it.
  - BUG-01-01's fix gets re-checked with its repro, then the repro is promoted to `tests/qa/`.
- **Other values still hard-coded** in `player.gd`: `JUMP_CLEARANCE` 6, `FLAT_WALL_SENSOR_DROP` 8, `SNAP_BASE` 4 / `SNAP_MAX` 14, `TOP_ONLY_GRACE` 8, `BOUNCE_TRIM` 1, `DIED_SIGNAL_FRAMES` 60. They are classic structural values rather than Director constants. `BOUNCE_TRIM` and the died delay affect gameplay feel, so consider making those two tunable.
- **Death timing:** `Player.died` fires 60 frames (1 s) after `kill()`. With LevelRoot's "about 2 s" after `died` (CONTRACTS), death to respawn is about 3 s. The level agent should know, or the contract should say which one owns the delay.
- **Measured facts for the level agent** (worth adding to CONTRACTS):
  - Steps above 10 px block a run on flat ground.
  - Loop minimum speed with no input: about 8.6 px/f (radius 80) and about 10.2 px/f (radius 112). With forward held, 6 px/f completes the default loop.
  - Until BUG-01-01 is fixed, keep loop tops unreachable.
  - Keep solid pieces at least 18 px wide (BUG-01-02).
  - Roll tunnels should be at least 40 px high (BUG-01-03).
- **Sandbox (throwaway, not filed):** `--start=X` with X inside the left wall (X < 0) spawns Sproto inside terrain.
- **QA tool changes in this review:**
  - The bot runner no longer jumps off loop walls; it only acts in floor mode.
  - Bot inputs are kept in memory only with `--record`; without that, the 1-hour run measured the bot's memory, not the game's.
  - New QA files on branch `qa`:
    - `tests/qa/test_physics_regression.gd` and `tests/qa/qa_physics_lib.gd`, which skip without a player.
    - `qa/repros/physics/`.
    - `qa/reports/evidence/01-physics/`.

## Re-check @ 9f3303c

- Branch: `physics` @ `9f3303c` ("Fix QA bugs 01-01 to 01-04"). It includes `1c6e698` (constants swap) and `main` with the QA phase B work.
- Review copy: `git archive 9f3303c`, with `build/.gdignore` added before recording. The new QA guards and repros were laid over it.

### Verdict @ 9f3303c: FIX FIRST

The four fixes work, and the constants swap is clean. However, the BUG-01-03 fix introduced a softlock (BUG-01-06). More thorough loop testing turned up two majors that already existed at 3aa4be3 and that I missed in the first pass. My radius check then tried one entry phase per radius and did not measure angle steps:
- BUG-01-07: a radius-48 loop can trap Sproto forever.
- BUG-01-08: a rare ground-angle spike throws him off small loops.

Open bugs: **1 blocker (BUG-01-06), 2 major (BUG-01-07, BUG-01-08), 1 minor (BUG-01-09)**; BUG-01-05 WONTFIX.

### Status of the first-pass bugs

| Bug | Status | Evidence |
|---|---|---|
| BUG-01-01 loop outer wrap | FIXED | `tests/qa/test_physics_fixes.gd :: test_bug_01_01_off_the_loop_top_lands_on_the_floor`. All 4 direction/path combinations: never inside terrain, lands on the floor. On the matching path he rides the hill foot down with 0 airborne frames and reaches the floor at 8.8–11.2 px/f (speed kept). On the other path he drops at the equator (8–10 airborne frames) and lands at x ≈ ±152. |
| BUG-01-02 narrow terrain sink | FIXED (floors) | `test_bug_01_02_lands_on_narrow_pillars` (8 and 16 px). The ceiling side is still open: BUG-01-09. |
| BUG-01-03 unroll into a low ceiling | FIXED, but see BUG-01-06 | `test_bug_01_03_keeps_rolling_under_a_low_ceiling`: the head never enters the ceiling, and the ball creeps out of a 32 px tunnel. |
| BUG-01-04 `respawn_at` offset | FIXED | `test_bug_01_04_respawn_at_is_exact_from_any_state` (from roll and from jump) |
| BUG-01-05 22° slope creep | WONTFIX (classic behaviour, lead decision) | repro kept as documentation: `qa/repros/physics/BUG-01-05_slope_creep.gd` |

### Review of 1c6e698 (constants moved into PhysicsConstants)

PASS. The 8 values are identical to the removed local constants:

| Field | Value |
|---|---|
| `skid_min_speed` | 4.0 |
| `turnaround_speed` | 0.5 |
| `slope_stand_min` | 0.05078125 |
| `air_angle_ease` | 2.8125 |
| `coin_scatter_speed_first` | 4.0 |
| `coin_scatter_speed_second` | 2.0 |
| `coin_gravity` | 0.09375 |
| `coin_bounce` | -0.75 |

Every use reads `p` = `Tuning.physics`, fetched in the same physics tick or call. A grep finds no `LEAD-REQUEST` local left and no cached `Tuning`. The only matching literal is a drawing offset in `player_visual.gd`. Live reads are proven by `tests/qa/test_physics_fixes.gd :: test_moved_constants_are_read_live`: runtime changes to `skid_min_speed`, `turnaround_speed` and `coin_scatter_speed_first` apply at once. **PHY-A2: SKIP → PASS.**

### Tool results @ 9f3303c

| Tool | Result | Notes |
|---|---|---|
| `godot --import` | PASS | no errors or warnings |
| Tests (`tests/run_tests.gd`) | 119 passed, 0 failed | 62 physics agent tests (5 new), 41 QA physics guards, 10 contract, 6 core |
| QA guards for the fixes (`tests/qa/test_physics_fixes.gd`, new) | 9 passed | full suite with them: 128 passed; on `main` they skip (66 passed) |
| `tools/qa/scene_smoke.sh` | 11/11 PASS | includes `loop.tscn` and the QA clip scenes |
| `tools/qa/originality_scan.sh` | 0 hits | files; commit messages `3aa4be3..9f3303c` |
| bot runner, sandbox, 7 200 frames | PASS | whole sandbox crossed with the new loops, 0 deaths |
| bot fuzz seeds 1/2/3 × 36 000 | PASS | 0 errors, 0 NaN, only contract states |
| bot fuzz seed 11 × 216 000 | PASS | 0 errors, 0 NaN; nodes 155 at the end, orphans 0, memory 24.9 → 29.8 MB, flat |
| `git diff --name-only main...9f3303c` | owned folders only | `player/`, `terrain/`, `tests/physics/` |

### Loop and terrain items with the new geometry

| Check | Result | Evidence |
|---|---|---|
| Enter and exit both ways, radii 52 / 112 / 200 at 8 / 12 / 16 px/f | PASS | `test_loop_radii_52_to_200_every_speed`; the earlier guards (radii 48–220 at 10, switchers at 16 for every phase, two loops in a row) still pass |
| Radius 48 | FAIL | **BUG-01-07** (2 of 9 runs never exit) |
| Small loops 64–80: smooth angle | FAIL | **BUG-01-08** (1 of 28 runs at radius 64; also radius 80 at 3aa4be3) |
| A slow loop fails cleanly (5, 7, 8.5 px/f, both ways) | PASS | `test_loop_too_slow_fails_cleanly` |
| Top switcher sets B (CW) / A (CCW) while coming down, A after the loop | PASS | `test_loop_top_switcher_paths` |
| Running off the top, every path and direction | PASS | see BUG-01-01 above |
| Hill feet from outside: run into a foot on its own path (between it and the side switcher) | PASS | `test_loop_feet_are_hills_from_outside`. At 3 px/f he climbs part way and slides back; at 8 px/f he goes up the foot and over the loop and drops down the far side. He is never inside terrain. |
| Drops onto a foot's vertical face and curve | PASS | probe: lands and slides off, never inside terrain |

### Checklist changes @ 9f3303c

Every other item was re-run (full suite, bot, smoke) and is unchanged from the first pass.

| ID | Was | Now | Why |
|---|---|---|---|
| PHY-A2 | SKIP | PASS | constants swap reviewed above |
| PHY-D3, PHY-H5 | PASS + BUG-01-05 | PASS | BUG-01-05 WONTFIX |
| PHY-E6 | PASS | FAIL | BUG-01-09: a spring launch into a hanging column narrower than 18 px enters it (case not tried in the first pass) |
| PHY-E9 | FAIL | PASS | BUG-01-02 fixed |
| PHY-F2, T-1 | PASS | FAIL | BUG-01-07 (radius 48) and BUG-01-08 (radius 64/80). Both existed at 3aa4be3. |
| PHY-G5 | FAIL | FAIL | the head no longer enters the ceiling, but the force-roll softlocks in a low dead end (BUG-01-06) |
| PHY-I14 | FAIL | PASS | BUG-01-04 fixed |
| T-5 | FAIL | PASS | BUG-01-01 fixed |

### New bugs

#### BUG-01-06: Force-roll softlocks Sproto in a low dead end

- **Severity:** blocker. There is no way out short of restarting: he can't turn, jump or spin dash. It can be reached by rolling into any space lower than 38 px that ends in a wall, for example a roll tunnel closed by a breakable wall that he was too slow to break. It was introduced by the BUG-01-03 fix.
- **Owner:** physics agent (`player/player.gd`, `_roll_input` force-roll)
- **Checklist:** PHY-G5
- **Repro:** `qa/repros/physics/BUG-01-06_force_roll_dead_end.gd` (fixed @ 94dcac3; now `tests/qa/test_physics_fixes.gd :: test_bug_01_06_low_dead_end_can_be_left`). Clip: copy `qa/repros/physics/clips/` to `res://tests/qa_clips/`, then
  ```bash
  PROJECT_DIR=<copy> tools/lead/record_clip.sh dead_end 600 \
      --scene=res://tests/qa_clips/dead_end.tscn --inputs=res://tests/qa_clips/inputs/dead_end.json --overlay
  ```
  ```json
  {"events": [[10, "move_right", true], [100, "move_right", false], [100, "move_down", true], [102, "move_down", false],
              [330, "move_left", true], [480, "move_left", false], [500, "jump", true], [510, "jump", false],
              [520, "move_down", true], [525, "jump", true], [528, "jump", false], [540, "move_down", false]]}
  ```
- **Expected:** holding the other direction gets the ball back out of the dead end.
- **Actual:** against the end wall, ground speed is 0 every frame. The force-roll sets it to 0.5 × `facing` and the wall stops it again. The roll's turnaround branch needs a non-zero speed against the input, so holding left for 2 s leaves the ball at x 376.6 → 390.0, still `roll`, facing 1, speed 0. Jump has no clearance, and a spin dash needs a crouch. It is the same with the clip's timeline: it ends at x 390, `roll`, speed 0.
- **Evidence:** `qa/reports/evidence/01-physics/BUG-01-06_force_roll_dead_end.png` (frames 150–590: the ball against the wall in `roll` at gsp 0 through left, jump and down+jump)
- **Notes:** for example, when speed is 0 and a direction is held, creep that way (flip `facing`); or creep in the input direction rather than `facing`.

#### BUG-01-07: A radius-48 loop can trap Sproto forever

- **Severity:** major. Holding forward, he goes round and round and never exits (2 of 9 runs). He can escape only by giving up and walking back out. It also happens at 3aa4be3 (3 of 9).
- **Owner:** physics agent (`terrain/loop.gd`, top switcher placement)
- **Checklist:** PHY-F2, T-1
- **Repro:** `qa/repros/physics/BUG-01-07_small_loop_endless.gd` (fixed @ 94dcac3; now `tests/qa/test_physics_fixes.gd :: test_bug_01_07_radius_48_always_exits`) (radius 48, speeds 8/10/12, start x -400/-403/-407)
- **Expected:** every run exits on the far side on path A.
- **Actual:** the top switcher is placed at y = -2r + 28 and is 64 px tall, so for r = 48 its bottom edge is at y -36. The standing hitbox crossing the loop's bottom just reaches it. Running right, he comes down the left side on path B, and the top switcher (moving right → A) sets path A again at the bottom. He climbs the lower-right quarter again. Trace (speed 10): path B at f49 (x -13), path A by f54 climbing again, repeating every ~19 frames for the whole run.
- **Notes:** keep the top switcher's bottom edge above the floor-level crossing (at least about 40 px above the floor for the standing hitbox), or raise the minimum radius.

#### BUG-01-08: A ground-angle spike throws Sproto off small loops

- **Severity:** major. It is rare, but it happens at loop entry on the main route. In 28 runs per radius, varying entry speed and start phase:

  | Commit | Radius | Runs with a > 40° grounded angle jump |
  |---|---|---|
  | 9f3303c | 64 | 1 |
  | 9f3303c | 80 | 0 |
  | 9f3303c | 112 | 0 |
  | 3aa4be3 | 80 | 1 |

- **Owner:** physics agent (`terrain/curve_terrain.gd` collision build, or the angle handling in `player/player.gd`)
- **Checklist:** PHY-F2, T-1
- **Repro:** `qa/repros/physics/BUG-01-08_loop_angle_spike.gd` (fixed @ 94dcac3; now `tests/qa/test_physics_fixes.gd :: test_bug_01_08_small_loop_entry_has_no_angle_spike`) (radius 64, entry 10 px/f from x -400: deterministic)
- **Expected:** the ground angle changes smoothly at the loop entry, and the loop completes.
- **Actual:** at f40 the B floor ray hits the inner arc at (18.864, -2.844), within 0.0002 px of an arc vertex (17.14°), and returns a normal giving 124.9° instead of about 17°. Godot builds the concave ring polygon as convex pieces, and a ray grazing a vertex reports the normal of an internal edge. The angle jumps 6 → 125° in one frame (mode right wall), so velocity points up and backwards. He flies across the loop, attaches to the far side moving the wrong way, loses speed and falls: the loop is not completed.
- **Notes:** options:
  - build CurveTerrain collision as segments (no internal edges);
  - when grounded, reject a sensor angle that differs from the current angle by more than about 45° (use the other sensor, or keep the current angle);
  - compute the angle from the surface around the hit, not from the returned normal.

#### BUG-01-09: A spring launch centred under a column narrower than 18 px flies into it

- **Severity:** minor. It needs narrow solid terrain overhead and a centred upward launch while standing; in a ball (jump) C/D sit at ±7 and catch 16 px columns.
- **Owner:** physics agent (`player/player.gd`, ceiling checks use C/D only)
- **Checklist:** PHY-E6
- **Repro:** `qa/repros/physics/BUG-01-09_narrow_ceiling.gd` (fixed @ 94dcac3; now `tests/qa/test_physics_fixes.gd :: test_bug_01_09_spring_under_a_narrow_column`) (16 px column hanging to y -100, `launch(0, -10)` from directly below)
- **Expected:** the head stops at y -100.
- **Actual:** the C/D rays at x ± 9 miss the column. At frame 6 the head is at -102.6 and the centre goes on into the column.
- **Notes:** this is the ceiling counterpart of BUG-01-02; give the ceiling and jump-clearance `cast_pair` calls the same centre fallback ray.

### Notes for the lead (re-check)

- **Loop footprint:** a loop now takes radius + thickness + 112 px on each side of its centre (240 px for the default radius). The level agent needs that room, and two loops need about twice that between centres.
- **Spawns near loops:** don't put a checkpoint or spawn point between a loop's hill foot and its side switcher. A player starting there on the foot's own path runs up the foot and over the loop (harmless, but odd).
- **Walking into low tunnels:** walking (not rolling) into a tunnel lower than 38 px still puts the head inside the ceiling, as at 3aa4be3 (no ceiling check on the ground). Low tunnels should only be reachable while rolling, which needs BUG-01-06 fixed first.
- **New QA files on branch `qa`:**
  - `tests/qa/test_physics_fixes.gd` (9 guards, which skip on main);
  - repros for BUG-01-06 to 01-09 and a dead-end clip scene in `qa/repros/physics/`;
  - `qa/reports/evidence/01-physics/BUG-01-06_force_roll_dead_end.png`.
- **Promoted repros:** the promoted BUG-01-01 to 01-04 repros were removed from `qa/repros/physics/`; the BUG-01-01 to 01-03 clip scenes stay.

## Re-check #2 @ 94dcac3

- Branch: `physics` @ `94dcac3` ("Fix QA bugs 01-06 to 01-09"). It includes `main` and the QA re-check guards; no QA file was changed by the merge.
- Review copy: `git archive 94dcac3`, plus `build/.gdignore`. For trajectory comparisons the same probes also ran on the 9f3303c copy.

### Verdict @ 94dcac3: FIX FIRST

All four re-check bugs are fixed, and nearly everything I aimed at the changed code holds:
- force-roll with every input, in both open and dead-end tunnels;
- the new head-height wall ray at tunnel mouths, with top-only platforms, other-path terrain, step-ups and short walls;
- loops of every radius from 48 to 256;
- fuzz and soak runs.

Two problems remain:
- **BUG-01-10 (regression):** the new angle re-measure misfires at sharp crests of two 45° slopes. Sproto loses 2–5 px/frame and can stall on the peak at normal running speeds. Every other shape I compared is identical, frame for frame, to 9f3303c.
- **BUG-01-11 (pre-existing):** sharp V valleys with 50–60° sides trap Sproto. It was present at all three commits and is newly found.

Open bugs: **1 blocker (BUG-01-10), 1 major (BUG-01-11), 0 minor**; BUG-01-05 WONTFIX.

### Status of the re-check #1 bugs

| Bug | Status | Evidence |
|---|---|---|
| BUG-01-06 force-roll dead end | FIXED | `tests/qa/test_physics_fixes.gd :: test_bug_01_06_low_dead_end_can_be_left`: holding back backs out; with no input it turns back off the wall and creeps out of the entrance; down + jump spin dashes out. |
| BUG-01-07 radius-48 loop never exits | FIXED | `test_bug_01_07_radius_48_always_exits` (9/9 runs exit) |
| BUG-01-08 angle spike on small loops | FIXED | `test_bug_01_08_small_loop_entry_has_no_angle_spike` (radius 64 and 80, 3 phases); the deterministic repro passes |
| BUG-01-09 spring into a narrow column | FIXED | `test_bug_01_09_spring_under_a_narrow_column` |
| BUG-01-05 22° slope creep | WONTFIX | unchanged |

### Regression hunt in what changed

| Area | Result | Evidence |
|---|---|---|
| Force-roll in open low tunnels: no input, forward, back, spin dash | PASS | `test_force_roll_open_tunnel_every_input`. The head never enters the ceiling: forward and no input come out of the far end, back comes out of the entrance, and a spin dash leaves at speed. |
| Walkers at tunnel mouths (32 / 36 / 37 / 37.5 / 38 / 39 / 40 / 48 px) | PASS | `test_walkers_stop_at_low_tunnel_mouths_only`: 37 px or less blocks, 37.5 px or more enters (a 37.5 px mouth leaves the head 0.5 px into the ceiling, negligible). At 6/12/16 px/f he stops at the mouth, nothing ends up inside terrain, and he can still jump there. |
| Head-height ray vs top-only platform and other-path terrain at head height | PASS | `test_head_height_ray_ignores_top_only_and_other_path` (top-only and path B do not block a path-A walker; path A does) |
| Step-ups and short walls | PASS | probe: 6/10 px steps still climbed; 12/20/60 px walls stop at the push radius as before. A wall hanging down to 20 px above the floor now blocks (head ray), as intended. |
| Angle re-measure: sharp corners and ramp tops | PASS except BUG-01-10 | Frame-by-frame trajectories match 9f3303c on a sharp 60° ramp up, cliff launches off a 30° ramp, flat → wall, a 40 px block, 45° ramps with 16/48 px fillets, the sandbox hills curve, the quarter pipe, and loops of radius 80/112, at 4–14 px/f. Crests and valleys of 30/30, 60/60, 45/30 and 22.5/22.5 also match 9f3303c. Only the **45/45 crest differs: BUG-01-10.** |
| Top-only platforms and path layers | PASS | all earlier guards still pass, plus the head-ray checks above |
| Loops of every radius | PASS | sweep of radii 48/56/64/80/96/112/160/256 × 8/10/12/16 px/f × 3 phases × both directions: 0 failures. At radius 48, 6 of 24 runs show a grounded angle step above 40°; that is the A/B sensor swap on a tight curve plus the per-frame turn, and every run completes. |
| Fuzz / soak | PASS | seeds 1–3 × 36 000 frames and seed 11 × 108 000 (30 min): 0 errors, 0 NaN, only contract states; nodes 155 at the end, orphans 0, memory 24.9 → 29.9 MB, flat. The runner crosses the whole sandbox. |
| Smoke, originality, scope | PASS | 7/7; 0 hits in files and in commits `9f3303c..94dcac3`; diff only in `player/`, `terrain/`, `tests/physics/` |

### Test suite runtime

| Run | Tests | Wall-clock (headless, `--fixed-fps 60`, this Mac) |
|---|---|---|
| Full suite on 94dcac3 | 146 passed, 0 failed (with the 7 new QA guards) | **4.96 s** |
| `physics/test_loop.gd` | | 2.17 s (slowest file) |
| `qa/test_physics_fixes.gd` | | 1.39 s |
| `qa/test_physics_regression.gd` | | 1.30 s |
| `physics/test_ground.gd` | | 0.43 s |
| every other file | | about 0.25 s each (mostly Godot start-up) |

This is far under both the 8-minute flag and the 20-minute CI limit; even a 5× slower CI runner stays under 30 s. Nothing needs tagging or trimming now. The runner's per-test limit of 7 200 physics frames is the real constraint, so big sweeps must be split across test methods, as the loop sweep was.

### New bugs

#### BUG-01-10: Sharp 45° crests rob 2–5 px/frame and can stall Sproto (regression)

- **Severity:** blocker. It hits the genre's standard slope angle at normal running speeds (4–10 px/f); at 4–6 px/f he stalls on the peak. It is a regression introduced by the BUG-01-08 fix in this step, and it shapes the feel of every tile-built hill or roof. It should be a small fix.
- **Owner:** physics agent (`player/player.gd` grounded re-check, `player/sensors.gd :: surface_angle`)
- **Checklist:** PHY-D7, PHY-B9 (transitions without speed loss)
- **Repro:** `qa/repros/physics/BUG-01-10_crest_45_stall.gd` (fixed @ 4eead62; now `tests/qa/test_physics_fixes.gd :: test_bug_01_10_sharp_45_crests_and_valleys`). Polygon (100,0) → (250,-150) → (400,0) on a flat floor; run over it at 4/6/10 px/f in both directions. It passes at 9f3303c and fails at 94dcac3.
- **Expected:** as at 9f3303c, at most about 0.1 px/f lost in a frame at the crest, and he runs over it.
- **Actual:** at the crest the floor reading flips between 45° and 315°. That is more than `SUSPICIOUS_ANGLE_STEP` (45°), so the angle is re-measured. `surface_angle()` returns 314.999563° instead of 315°, which is just on the wall side of the floor / left-wall boundary (`mode_for_angle`: floor at ≥ 315). Sproto spends a frame in left-wall mode and loses speed in one frame:

  | Direction | Entry speed (px/f) | Speed after (px/f) | Result |
  |---|---|---|---|
  | right | 4 | lost 2.77 | stalls on the peak |
  | right | 6 | 4.26 → 1.66 | stalls on the peak (ends at x 277 vs 475 at 9f3303c) |
  | right | 10 | 8.06 → 2.88 | ends at x 667 vs 924 |
  | left | 10 | lost 2.14 | — |

  14 px/f is unaffected. 30/30, 60/60, 45/30 and 22.5/22.5 crests are unaffected.
- **Notes:** options:
  - when the re-measured angle agrees with the reported one within a degree or so, keep the reported angle (real corners);
  - round re-measured angles (for example to 0.01°) before choosing the mode;
  - only re-measure when the reported normal faces along the ray.

#### BUG-01-11: Sharp V valleys with 50–60° sides trap Sproto (softlock, pre-existing)

- **Severity:** major. It is a softlock, but only in a geometry no level uses yet, and level design can avoid it until it is fixed. Same result at 3aa4be3, 9f3303c and 94dcac3; found in this pass.
- **Owner:** physics agent (`player/player.gd`: wall check in wall modes, slip lock, jump clearance)
- **Checklist:** PHY-D4, PHY-E (stuck in terrain shapes)
- **Repro:** `qa/repros/physics/BUG-01-11_v_valley_trap.gd` (fixed @ 4eead62; now `tests/qa/test_physics_fixes.gd :: test_bug_01_11_sharp_v_valleys_can_be_left`). A V of two 60° slopes, 150 px deep, no fillet; run in at 6 px/f, then hold right and jump six times.
- **Expected:** Sproto gets out, or runs through.
- **Actual:**
  - He comes to rest at the bottom in a wall mode at speed 0 (x 195.8, mode left wall, `idle`).
  - The opposite side stops him as a wall every frame, and the slip rule re-locks control every 30 frames.
  - Jump is refused: the clearance ray in wall mode hits the opposite side.
  - Holding left does nothing, and a spin dash doesn't move him.

  Probe results by side angle and fillet:

  | Sides | Fillet | Result |
  |---|---|---|
  | 50°, 55°, 60° | none | stuck |
  | 55°, 60° | 8 px | stuck |
  | 55°, 60° | 16 px | sloshes at the bottom |
  | 55°, 60° | 48 px | runs through |
  | 45° | none | runs through |
  | 70° | none | runs through |

- **Notes:** until fixed, levels must not have V valleys with sides steeper than 45° unless they have a fillet of 48 px or more (CurveTerrain's default). Possible fixes:
  - let the jump-clearance test ignore surfaces that are part of the floor the player stands in;
  - stop treating the opposite slope as a wall when the player is wedged;
  - make slip detach when blocked.

### Notes for the lead (re-check #2)

- The head-height wall ray only acts on exactly flat ground (under 1°). Walking into a low mouth from a slope still lets the head clip the ceiling, as before; a rule for the level agent is to put low tunnel mouths on flat ground.
- **Changes on branch `qa`:**
  - 7 new guards in `tests/qa/test_physics_fixes.gd`. All 16 checks there pass on 94dcac3 and skip on main (main: 73 passed).
  - Repros for BUG-01-10 and 01-11 in `qa/repros/physics/`.
  - The promoted BUG-01-06 to 01-09 repros were removed.

## Re-check #3 @ 4eead62

- Branch: `physics` @ `4eead62` ("Fix QA bugs 01-10 and 01-11"). It includes `main` and the re-check #2 guards; no QA file was changed by the merge.
- Review copy: `git archive 4eead62`, plus `build/.gdignore`. Baselines: the 9f3303c and 94dcac3 copies, running the same probes.

### Verdict @ 4eead62: MERGE

Both bugs are fixed. The new sharp-V rule was attacked in every situation you listed and did not misfire; where it engages, Sproto can always get out. Only minor items remain, for the backlog.

Open: **0 blocker, 0 major, 2 minor** (BUG-01-12, BUG-01-13); BUG-01-05 WONTFIX.

### Status

| Bug | Status | Evidence |
|---|---|---|
| BUG-01-10 45° crest stall | FIXED | `tests/qa/test_physics_fixes.gd :: test_bug_01_10_sharp_45_crests_and_valleys`. 45° crests and valleys in both directions at 4/6/10/14 px/f: floor mode only, under 0.2 px/f lost per frame. The repro passes. |
| BUG-01-11 sharp V trap | FIXED | `test_bug_01_11_sharp_v_valleys_can_be_left` (50/50 and 60/60 at 150 px deep by spin dash; 70/50 and 60/60 at 64 px deep by jump); the repro passes |

### Trying to make the V rule misfire

The rule switches on when sensors A and B straddle a "\" and a "/". From a wall mode it uses a 48 px downward probe, and inside a valley the wall check is off. Every run below also watched for the centre inside terrain and for per-frame snaps, comparing against 9f3303c and 94dcac3.

| Situation | Result | Evidence |
|---|---|---|
| Loop bottoms (radius 48/64/112): at rest, slow entries at 1/2/4 px/f both ways | PASS | rule never engaged, never inside terrain, comes to rest at the bottom; `test_v_rule_stays_off_on_loops_and_quarter_pipes` |
| Loop sweep, radii 48–256 × 8/10/12/16 px/f × 3 phases × both ways (180 runs) | PASS | 0 failures, and the valley flag was never set inside a loop |
| Quarter pipe bottom at 0.5 / 2 / 5 px/f | PASS | rule never engaged |
| U valleys (fillet 16/48/96 × sides 30/45/60 × 1/4/10 px/f) | PASS | No burial, no snaps beyond 4 px. Fillets of 48 or more: runs through. 60° sides with a 16 px fillet, 150 px deep: settles flat at the bottom (rule at rest) and leaves by spin dash; a jump can't clear 150 px, as you'd expect. |
| V next to a wall (no gap and a 10 px gap, 6/12/16 px/f) | PASS | Never inside terrain. At speed he runs up the 60° side, up the wall and over it, which is classic momentum; at 6 px/f he stops at the wall. |
| V under a low ceiling (30 and 40 px above the rims, walking and rolling) | PASS | never inside the ceiling; the walker is stopped by the head-height ray at the mouth; rolling in rests at the bottom with room to stand |
| V on top-only terrain / path A / path B (player on A) | PASS | stands in the top-only and path-A V's; falls through the path-B one; `test_v_valley_layers_and_landings` |
| Landing in a 60° V while hurt, and after a spring launch | PASS | lands, hurt and spring states end, never inside terrain |
| Spin dash released in a V toward the steeper side (50/70, 70/50, 60/60, both ways) | PASS (see BUG-01-13) | The spin dash starts (before the fix it did not even start: stuck in a wall mode) and leaves the V. There is a one-frame 13.5 px pop where he enters the 70° side. |
| Deep and asymmetric V's (50/70, 70/50, 45/60, 60/80, 46/46, 89/60; 64 and 300 px deep; 2/8/16 px/f) | PASS | No burial. Every case leaves by jump from rest or by spin dash; before the fix most of these trapped him. Snaps of 11–15 px happen at mode switches (they were 16–18 px before): BUG-01-13. |
| 45° crests and valleys, both directions, 2–14 px/f | PASS | floor mode only. At 2 px/f a crest costs 0.41 px/f for one frame, identical at 3aa4be3/9f3303c/94dcac3, so not a regression (too small to file). |
| Frame identity with 9f3303c (sharp 60° ramp, cliff, wall, block, ramps with 16/48 fillets, hills, quarter pipe, loops 80/112, at 4–14 px/f) | PASS | 32 of 32 trajectories identical. Crest/valley sweep identical except the 60/60 valley, which now escapes instead of trapping. |

### Standard runs @ 4eead62

| Tool | Result |
|---|---|
| Tests | 151 passed on the agent's commit; **155 passed, 0 failed with the 4 new QA guards, in 5.83 s wall-clock** (headless, `--fixed-fps 60`). Nothing to trim. |
| Fuzz seeds 1–3 × 18 000 frames (3 × 5 min) | 0 errors, 0 NaN, only contract states; nodes 155 at the end, orphans 0, memory 24.9 → 29.9 MB |
| Bot runner (7 200 frames) | crosses the whole sandbox, 0 deaths |
| `scene_smoke.sh` | 7/7 PASS |
| Originality | 0 hits in files; 0 in commits `94dcac3..4eead62` |
| Scope | `player/`, `terrain/`, `tests/physics/` only |
| QA guards on `main` | skip cleanly (77 passed) |

### Backlog (minor)

#### BUG-01-12: Jump is ignored on the lower part of a steep V side

- **Severity:** minor. He can still get out: jump once he is back at the bottom, or spin dash.
- **Owner:** physics agent (`player/player.gd :: _has_jump_clearance` in wall modes)
- **Repro:** V of 70° (left) and 50° (right), 64 px deep. Run in at 16 px/f and hold right: he cycles between resting flat at the bottom and sliding up the 50° side (right-wall mode, slip lock). A jump pressed while he is on that side does nothing, because the clearance ray points sideways (perpendicular to the slope) and hits the 70° side within 25 px.
- **Expected:** jump works on any floor he stands on, as long as there is room above along the jump direction.
- **Notes:** an option is to measure clearance along the actual jump direction, and only as far as the head can travel in the first frames.

#### BUG-01-13: The centre pops 11–15 px at sharp concave corners into steep sides

- **Severity:** minor (visual pop, pre-existing; 4eead62 reduced it from 16–18 px)
- **Owner:** physics agent (collision mode switch at sharp corners)
- **Repro:** run at 8 px/f into a sharp V with a 70° side, or spin dash toward the steeper side of a 50/70 V. In the frame where the mode switches between floor and wall, the centre moves 11–15 px more than the speed accounts for.
- **Notes:** this is classic behaviour for sharp corners. The level rule already covers it: use fillets (CurveTerrain's default of 48 px) where floors meet steep slopes.

### Notes for the lead (re-check #3)

- **Level rules for the level agent's guide** (from all four reviews):
  - Leave radius + thickness + 112 px on each side of a loop's centre.
  - No spawns between a loop's foot and its side switcher.
  - Put low tunnel mouths on flat ground.
  - Roll tunnels: lower than 38 px means roll only.
  - Solid pieces at least 18 px wide.
  - Prefer fillets of 48 px or more where floors meet slopes steeper than 45°: V's are now safe, but a 60° U with a small fillet needs a spin dash to leave.
- **New QA files on branch `qa`:**
  - 4 new guards in `tests/qa/test_physics_fixes.gd`, which now holds 20 checks; all skip on main.
  - The BUG-01-10/11 repros were removed. `qa/repros/physics/` keeps BUG-01-05 (WONTFIX) and the clip scenes.

## Step 4: moving terrain @ f3e480c (77e8196 + f3e480c, merged with main c364fb9): MERGE

- **Scope:** `player/`, `playground/` and `tests/physics/`. The merge with main is clean.
- **Checks:** 0 import errors; 411 passed, 0 failed (QA guards included); smoke 24/24; 0 originality hits.
- **QA guards at other frame rates:** `suite_framerates.sh` passes `test_moving_terrain` plus the agent's tests (21) at 30 and 144 fps.

**QA guards reconciled with the documented design (c364fb9):**
- Sproto is carried by the body's actual motion over the last physics step, read from the server. With `sync_to_physics` the node's position also updates only after the step, so the right check is the drawn relation: at the end of each frame, his offset from the platform must not change. Comparing against this tick's `platform_delta()` was the wrong check.
- Ride platforms now start moving only once he stands on them. An earlier version moved them during spawn, which dropped him onto a platform already falling away.
- With those two changes, all 10 QA guards pass.

| Item | Result |
|---|---|
| PHY-M1 horizontal ride with reversals | PASS: drift on the platform 0.000 px, grounded throughout, `ground_speed` 0 |
| PHY-M2 vertical ride, up/down 2–3 px/f | PASS: feet error 0.000, grounded |
| PHY-M3 diagonal | PASS: drift 0.000 |
| PHY-M4 drop at 8/12 px/f | PASS: never below the surface; grounded 16 and 24 ticks after the stop (lift-off by design) |
| PHY-M5 jumping off | PASS: air x velocity 0.000 (only the jump) |
| PHY-M6 run on and off | PASS (agent tests: running and rolling keep their own speed; fuzz) |
| PHY-M7 conveyors ±2 | PASS: exactly 120 px in 60 ticks, `ground_speed` 0 |
| PHY-M8 crush from above | PASS: dies when the gap is 35 px (contract: under 38 − 1), and against a wall from the side |
| PHY-M9 no false kill | PASS: platform stopping 1 px above the head, and a side push into open space |
| PHY-M10 top-only moving platform | PASS (QA probe): passes up through without being carried, lands, then rides with 0.000 drift |
| PHY-M11 interpolation | PASS. The playground elevator ride (`ride.json`, `--start=836`), recorded at 144 Hz with interpolation on: across 569 riding frames, Sproto's offset to the platform is a constant -42 px, changing only 3 times, at landing. No 1 px jitter. |
| PHY-M12 fuzz | PASS: QA platform fuzz (3 seeds). Playground fuzz from x 700, 3 × 5 min: 0 errors, 0 NaN, 0 deaths, 0 orphans. |
| PHY-M13 telegraphed crushers | N/A until the level agent's crusher objects exist |
| PHY-M14 feel | PASS on the recorded ride (`qa/reports/evidence/01-physics/moving_terrain_playground_ride.png`): the elevator, the chevron conveyor on the tunnel block and the shuttle all read clearly at game size |

- **Frame identity (playground):**
  - Fuzz seed 5 and runner jump-every 240 are byte-identical to 57f6879.
  - Fuzz seed 9 diverges at frame 5202 at x 441, where it reaches the new shuttle platform. Expected.
- **QA lint change:** `prepare()` now takes moving terrain (anything with `platform_delta()`) out of the static rule scan, so a platform isn't judged wherever it happened to be. The playground lints with 0 errors and 0 warnings.

**For the level agent (zone platforms):**
1. **Build from `playground/demo_moving_platform.gd`:**
   - an `AnimatableBody2D` with `sync_to_physics`;
   - set `position` only in `_physics_process`;
   - `platform_delta()` returns this tick's move.
   - The node's position updates after the physics step, so read `target_position()` for "where it is going".
2. **Teleports and resets:** a jump of more than 64 px in one tick isn't carried. Call `reset_physics_interpolation()` on any reset.
3. **Descents:** a platform that drops faster than sink speed + gravity + 4 px in one tick leaves him falling, by design. Keep elevators that he should ride down at about 6 px/f or less.
4. **Clearances where crushing isn't intended:** at least 39 px vertical for standing, 29 px for rolling tunnels, and 19 px horizontal between a moving body and other terrain. Anything tighter kills.
5. **Crushers:** must telegraph at least `Difficulty.telegraph(base, local)` and never under 0.35 s before closing, including the first cycle after a respawn (PHY-M13, ZN-C).
6. **Conveyors:** set the `conveyor_speed` meta on a static terrain body, and show the direction (chevrons, as in the playground).
7. **One-way platforms:** use `Layers.TERRAIN_TOP_ONLY`; they work as jump-through, ride-after-landing platforms.
8. **No checkpoint or PlayerStart on a moving platform.** Respawn checks use static floor, and a respawn there could put him in mid-air.
