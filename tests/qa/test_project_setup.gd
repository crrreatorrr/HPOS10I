extends TestCase
## QA full-QA guards (qa/reports/00-full-qa.md): input bindings, display and
## pixel settings, and the web export preset. Cheap checks that must stay true.

const GAMEPLAY_ACTIONS := [&"move_left", &"move_right", &"move_up", &"move_down", &"jump", &"pause"]


func test_keys_are_physical_so_layouts_keep_positions() -> void:
	for action in InputMap.get_actions():
		if str(action).begins_with("ui_"):
			continue
		for event in InputMap.action_get_events(action):
			if event is InputEventKey:
				var key := event as InputEventKey
				assert_true(key.physical_keycode != KEY_NONE and key.keycode == KEY_NONE,
						"%s: key %s should be bound by physical position" % [action, key.as_text()])


func test_every_gameplay_action_has_keyboard_and_gamepad() -> void:
	for action in GAMEPLAY_ACTIONS:
		assert_true(InputMap.has_action(action), "missing action %s" % action)
		if not InputMap.has_action(action):
			continue
		var keys := 0
		var pads := 0
		for event in InputMap.action_get_events(action):
			if event is InputEventKey:
				keys += 1
			elif event is InputEventJoypadButton or event is InputEventJoypadMotion:
				pads += 1
		assert_true(keys > 0, "%s has no key" % action)
		assert_true(pads > 0, "%s has no gamepad binding" % action)
		var deadzone := InputMap.action_get_deadzone(action)
		assert_true(deadzone >= 0.2 and deadzone <= 0.8, "%s deadzone %.2f outside 0.2..0.8" % [action, deadzone])


func test_pixel_art_display_settings() -> void:
	assert_eq(int(ProjectSettings.get_setting("display/window/size/viewport_width")), 424, "viewport width")
	assert_eq(int(ProjectSettings.get_setting("display/window/size/viewport_height")), 240, "viewport height")
	assert_eq(str(ProjectSettings.get_setting("display/window/stretch/mode")), "viewport", "stretch mode")
	assert_eq(int(ProjectSettings.get_setting("rendering/textures/canvas_textures/default_texture_filter")), 0, "nearest filter")
	assert_true(bool(ProjectSettings.get_setting("rendering/2d/snap/snap_2d_transforms_to_pixel")), "pixel snap (transforms)")


func test_physics_tick_matches_the_frame_units() -> void:
	var constants_script := "res://core/physics_constants.gd"
	if not ResourceLoader.exists(constants_script):
		print("  SKIP qa/test_project_setup.gd: no core/physics_constants.gd")
		return
	var fps = load(constants_script).get(&"FPS")
	if fps == null:
		fps = (load(constants_script) as GDScript).get_script_constant_map().get("FPS")
	assert_true(fps != null, "PhysicsConstants.FPS exists")
	if fps != null:
		assert_eq(Engine.physics_ticks_per_second, int(fps), "physics ticks per second")


func test_web_export_preset() -> void:
	var config := ConfigFile.new()
	if config.load("res://export_presets.cfg") != OK:
		print("  SKIP qa/test_project_setup.gd: no export_presets.cfg")
		return
	var section := ""
	for s in config.get_sections():
		if s.ends_with(".options") or config.get_value(s, "platform", "") != "Web":
			continue
		section = s
	assert_true(section != "", "a Web export preset exists")
	if section == "":
		return
	var options := section + ".options"
	var exclude := str(config.get_value(section, "exclude_filter", ""))
	for folder in ["tests/*", "tools/*", "docs/*", "qa/*"]:
		assert_true(exclude.contains(folder), "web export excludes %s" % folder)
	assert_eq(config.get_value(options, "variant/thread_support", true), false, "single-threaded web build (no COOP/COEP on Pages)")
	assert_eq(config.get_value(options, "html/focus_canvas_on_start", false), true, "canvas focused on start")
	assert_eq(int(config.get_value(options, "html/canvas_resize_policy", -1)), 2, "adaptive canvas resize")
