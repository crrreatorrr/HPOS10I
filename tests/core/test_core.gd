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
	assert_eq(Display.choose_stretch(Vector2(1366, 768), base, false), integer, "laptop 3x fills 94%")
	assert_eq(Display.choose_stretch(Vector2(1920, 940), base, false), fractional,
			"1080p browser window under 960 px tall would drop to 3x and fill half the window")
	assert_eq(Display.choose_stretch(Vector2(2532, 1170), base, true), fractional, "phone")


func test_in_gameplay_is_false_in_menus() -> void:
	assert_true(SceneRouter.MENU_SCENES.has(SceneRouter.MAIN_SCENE), "main is a menu")
	assert_true(SceneRouter.MENU_SCENES.has(SceneRouter.TITLE_SCENE), "title is a menu")


func test_difficulty_rises_through_the_game() -> void:
	var order := [["test_zone", 1], ["z1_retro_rush_hills", 1], ["z1_retro_rush_hills", 2],
		["z2_wizard_academy", 1], ["z2_wizard_academy", 2], ["z3_capital_mansion", 1],
		["z3_capital_mansion", 2], ["z4_neon_rush_remix", 1], ["z4_neon_rush_remix", 2]]
	var previous := -1
	for entry in order:
		var d := Difficulty.for_stage(entry[0], entry[1])
		assert_true(d > previous, "%s act %d should be harder than the act before" % entry)
		previous = d
	assert_eq(Difficulty.for_stage("z2_wizard_academy", 3), 4, "boss uses act 2's difficulty")
	assert_eq(Difficulty.for_stage("", 1), Difficulty.DEFAULT, "playgrounds use the default")


func test_difficulty_targets_never_get_easier() -> void:
	for d in range(1, Difficulty.MAX + 1):
		var a: Dictionary = Difficulty.targets(d - 1)
		var b: Dictionary = Difficulty.targets(d)
		assert_true(b.enemies_per_screen >= a.enemies_per_screen, "enemy density at D%d" % d)
		assert_true(b.direction >= a.direction, "direction difficulty at D%d" % d)
		assert_true(b.screens >= a.screens, "length at D%d" % d)
		assert_true(b.tickets_per_screen <= a.tickets_per_screen, "ticket generosity at D%d" % d)
		var total := 0
		for tier in b.tiers:
			total += b.tiers[tier]
		assert_eq(total, 100, "tier mix at D%d adds to 100" % d)


func test_difficulty_multipliers() -> void:
	assert_eq(Difficulty.speed_mult(1), 1.0, "D1 speed")
	assert_near(Difficulty.speed_mult(8), 1.42, 0.001, "D8 speed")
	assert_near(Difficulty.interval_mult(8), 0.65, 0.001, "D8 interval")
	assert_eq(Difficulty.speed_mult(0), 1.0, "test zone is not easier than D1 for enemies")
	assert_eq(Difficulty.telegraph(0.4, 8), Difficulty.MIN_TELEGRAPH, "telegraph floor")
	assert_near(Difficulty.telegraph(1.0, 8), 0.72, 0.001, "D8 telegraph")


func test_input_labels_come_from_the_input_map() -> void:
	assert_true(InputLabels.for_action(&"jump") != "", "jump has keyboard labels")
	assert_eq(InputLabels.for_action(&"jump", 1).split("/").size(), 1, "max_keys limits the list")
	assert_true(InputLabels.for_physical(KEY_W) != "", "physical W has a label")


func test_layers_match_project_layer_names() -> void:
	var expected := {
		Layers.TERRAIN_SOLID: "terrain_solid", Layers.TERRAIN_PATH_A: "terrain_path_a",
		Layers.TERRAIN_PATH_B: "terrain_path_b", Layers.TERRAIN_TOP_ONLY: "terrain_top_only",
		Layers.PLAYER: "player", Layers.ENEMIES: "enemies", Layers.OBJECTS: "objects",
		Layers.HAZARDS: "hazards", Layers.BOSS: "boss",
	}
	for bit in expected:
		var index := int(round(log(float(bit)) / log(2.0))) + 1
		assert_eq(ProjectSettings.get_setting("layer_names/2d_physics/layer_%d" % index), expected[bit],
				"layer %d" % index)


func test_stick_diagonals_read_as_horizontal() -> void:
	assert_true(InputMap.action_get_deadzone(&"move_down") > 0.71, "45-degree push must not press down")
	assert_true(InputMap.action_get_deadzone(&"move_up") > 0.71, "45-degree push must not press up")
	assert_true(InputMap.action_get_deadzone(&"move_right") < 0.71, "45-degree push still runs")


func test_bad_timeline_events_are_skipped() -> void:
	expect_errors(1)
	var path := "user://bad_timeline.json"
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string('{"events": [[0, "jump", true], ["oops"], [5, "jump", false]]}')
	file.close()
	var events := Dev.load_timeline(path)
	assert_eq(events.size(), 2, "the malformed event is skipped")
	assert_eq(events[1][0], 5)
	DirAccess.remove_absolute(path)


func test_open_scene_rejects_missing_scenes() -> void:
	expect_errors(1)
	var before := tree.current_scene
	SceneRouter.open_scene("res://does/not/exist.tscn")
	await tree.process_frame
	assert_eq(tree.current_scene, before, "no scene change")
