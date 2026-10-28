extends TestCase
## Sanity checks for the lead-owned core files.


func test_physics_constants_match_guide() -> void:
	var p: PhysicsConstants = load("res://core/physics_constants.tres")
	assert_eq(p.acceleration, 0.046875, "acceleration")
	assert_eq(p.deceleration, 0.5, "deceleration")
	assert_eq(p.friction, 0.046875, "friction")
	assert_eq(p.top_speed, 6.0, "top speed")
	assert_eq(p.air_acceleration, 0.09375, "air acceleration")
	assert_eq(p.gravity, 0.21875, "gravity")
	assert_eq(p.jump_force, 6.5, "jump force")
	assert_eq(p.jump_release_speed, 4.0, "jump release")
	assert_eq(p.slope_factor_normal, 0.125, "slope factor")
	assert_eq(p.slope_factor_roll_up, 0.078125, "roll uphill")
	assert_eq(p.slope_factor_roll_down, 0.3125, "roll downhill")
	assert_eq(p.roll_friction, 0.0234375, "roll friction")
	assert_eq(p.roll_deceleration, 0.125, "roll deceleration")


func test_unit_conversion() -> void:
	assert_eq(PhysicsConstants.speed(6.0), 360.0, "top speed px/s")
	assert_eq(PhysicsConstants.accel(0.21875), 787.5, "gravity px/s²")
	assert_eq(PhysicsConstants.frames(120), 2.0, "120 frames")


func test_tuning_autoload_loaded() -> void:
	var tuning := tree.root.get_node("Tuning")
	assert_true(tuning.physics is PhysicsConstants, "Tuning.physics loaded")


func test_zone_stage_order() -> void:
	var id := "z1_retro_rush_hills"
	assert_eq(ZoneRegistry.stage_path(id, 1), "res://levels/z1_retro_rush_hills/act1.tscn")
	assert_eq(ZoneRegistry.stage_path(id, 3), "res://bosses/rug_pull/arena.tscn")
	assert_eq(ZoneRegistry.stage_path(id, 4), "")
	assert_eq(ZoneRegistry.next_zone_id(id), "z2_wizard_academy")
	assert_eq(ZoneRegistry.next_zone_id("z4_neon_rush_remix"), "")
	assert_eq(ZoneRegistry.get_zone("z2_wizard_academy").accessory, "wizard_hat")
	assert_eq(ZoneRegistry.get_zone("z3_capital_mansion").accessory, "sunglasses")


func test_input_map_has_game_actions() -> void:
	for action in ["move_left", "move_right", "move_up", "move_down", "jump", "pause", "debug_overlay"]:
		assert_true(InputMap.has_action(action), "missing input action " + action)


func test_input_timeline_parses() -> void:
	var events := Dev.load_timeline("res://tests/inputs/run_right.json")
	assert_true(events.size() >= 2, "timeline has events")
	assert_eq(events[0][1], "move_right")
