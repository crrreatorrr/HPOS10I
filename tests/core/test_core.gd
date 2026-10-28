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


func test_boot_menu_lists_the_playground() -> void:
	var dev := tree.root.get_node("Dev")
	dev.args["dev"] = true
	dev._boot_taken = true
	var main: Node = add_scene("res://core/main.tscn")
	dev.args.erase("dev")
	var labels: Array = main._entries.map(func(entry): return entry.label)
	assert_true(labels.has("Physics Playground"), "boot menu entries: %s" % [labels])


func test_display_scaling_choice() -> void:
	var base := Vector2(424, 240)
	var integer := Window.CONTENT_SCALE_STRETCH_INTEGER
	var fractional := Window.CONTENT_SCALE_STRETCH_FRACTIONAL
	assert_eq(Display.choose_stretch(Vector2(1280, 720), base, false), integer, "desktop 720p")
	assert_eq(Display.choose_stretch(Vector2(1920, 1080), base, false), integer, "desktop 1080p")
	assert_eq(Display.choose_stretch(Vector2(800, 450), base, false), fractional, "small window")
	assert_eq(Display.choose_stretch(Vector2(2532, 1170), base, true), fractional, "phone")


func test_in_gameplay_is_false_in_menus() -> void:
	assert_true(SceneRouter.MENU_SCENES.has(SceneRouter.MAIN_SCENE), "main is a menu")
	assert_true(SceneRouter.MENU_SCENES.has(SceneRouter.TITLE_SCENE), "title is a menu")
