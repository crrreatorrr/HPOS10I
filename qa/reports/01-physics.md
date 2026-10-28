# QA report 01: physics @ 3aa4be3, re-checked @ 9f3303c

> **Final verdict (re-check @ 9f3303c): FIX FIRST.** BUG-01-01 to 01-04 are fixed and BUG-01-05 is WONTFIX.
> The force-roll added for BUG-01-03 creates a softlock in low dead ends (**BUG-01-06, blocker**).
> Two majors on small loops predate the fixes and were missed in the first pass: **BUG-01-07** (a radius-48 loop never exits) and **BUG-01-08** (a ground-angle spike throws Sproto off).
> One new minor: BUG-01-09. See "Re-check @ 9f3303c" at the end.

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
- **Repro:** `qa/repros/physics/BUG-01-06_force_roll_dead_end.gd`. Clip: copy `qa/repros/physics/clips/` to `res://tests/qa_clips/`, then
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
- **Repro:** `qa/repros/physics/BUG-01-07_small_loop_endless.gd` (radius 48, speeds 8/10/12, start x -400/-403/-407)
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
- **Repro:** `qa/repros/physics/BUG-01-08_loop_angle_spike.gd` (radius 64, entry 10 px/f from x -400: deterministic)
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
- **Repro:** `qa/repros/physics/BUG-01-09_narrow_ceiling.gd` (16 px column hanging to y -100, `launch(0, -10)` from directly below)
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
