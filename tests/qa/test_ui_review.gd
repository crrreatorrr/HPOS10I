extends TestCase
## QA ui-audio review probes (qa/reports/07-ui.md, checklist 07). They use the
## real playground and the global overlays that Display adds (not fresh
## copies), so the wiring between Display, the pause menu, the touch controls,
## Audio and the player is what gets tested. Autoloads and UI classes added
## after the qa branch point are looked up at runtime, so this file parses on
## any branch. Skips until the pause menu and touch controls exist.

const PAUSE_SCENE := "res://ui/pause/pause_menu.tscn"
const TOUCH_SCRIPT := "res://ui/touch_controls/touch_controls.gd"
const HUD_SCENE := "res://ui/hud/hud.tscn"
const PLAYGROUND := "res://playground/physics_playground.tscn"
const GAME_ACTIONS: Array[StringName] = [&"move_left", &"move_right", &"move_up", &"move_down", &"jump", &"pause"]

var _saved_lives := 0


func _skip() -> bool:
	if ResourceLoader.exists(PAUSE_SCENE) and ResourceLoader.exists(TOUCH_SCRIPT) \
			and tree.root.has_node("Display"):
		return false
	print("  SKIP qa/test_ui_review.gd: no pause menu / touch controls / Display yet")
	return true


func before_each() -> void:
	_saved_lives = GameState.lives


func after_each() -> void:
	tree.paused = false
	var menu := _menu()
	if menu != null and bool(menu.call(&"is_open")):
		menu.call(&"_close")
	for action in GAME_ACTIONS:
		Input.action_release(action)
	var display := tree.root.get_node_or_null("Display")
	if display != null:
		display.call(&"_set_touch_mode", false)
	tree.current_scene = null
	GameState.lives = _saved_lives
	Engine.time_scale = 1.0


func _menu() -> Node:
	return tree.get_first_node_in_group(&"pause_menu")


func _touch_controls() -> Node:
	# The global instance (Display adds it), not a test copy.
	for node in tree.get_nodes_in_group(&"touch_controls"):
		if node.process_mode != Node.PROCESS_MODE_DISABLED:
			return node
	return null


func _open_playground() -> Node:
	var scene := add_scene(PLAYGROUND)
	tree.current_scene = scene
	await physics_frames(30)
	return scene


func _act(action: StringName, pressed: bool) -> void:
	var event := InputEventAction.new()
	event.action = action
	event.pressed = pressed
	event.strength = 1.0 if pressed else 0.0
	Input.parse_input_event(event)
	Input.flush_buffered_events()


func _key(physical: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = physical
	event.keycode = physical
	event.key_label = physical
	event.pressed = pressed
	Input.parse_input_event(event)
	Input.flush_buffered_events()


func _touch(index: int, pos: Vector2, pressed := true) -> void:
	var event := InputEventScreenTouch.new()
	event.index = index
	event.position = pos
	event.pressed = pressed
	tree.root.push_input(event, true)
	Input.flush_buffered_events()


func _held() -> Array:
	var out := []
	for action in GAME_ACTIONS:
		if Input.is_action_pressed(action):
			out.append(String(action))
	return out


func test_pause_only_in_gameplay() -> void:
	if _skip():
		return
	# A stand-in menu scene: the real core/main.tscn now goes on to the title
	# screen with a deferred scene change, which would free this test's nodes.
	var menu_scene := Node2D.new()
	menu_scene.name = "QAFakeMenu"
	menu_scene.scene_file_path = SceneRouter.MAIN_SCENE
	add_node(menu_scene)
	tree.current_scene = menu_scene
	await physics_frames(3)
	_act(&"pause", true)
	_act(&"pause", false)
	await physics_frames(3)
	assert_eq(tree.paused, false, "pause does nothing in the boot menu")
	menu_scene.queue_free()
	await _open_playground()
	_act(&"pause", true)
	_act(&"pause", false)
	await physics_frames(2)
	assert_eq(tree.paused, true, "pause works in the playground")
	assert_true(bool(_menu().call(&"is_open")), "menu shown")


func test_resume_with_a_held_jump_never_jumps() -> void:
	if _skip():
		return
	var scene: Node = await _open_playground()
	var player: Node2D = scene.get(&"player")
	_act(&"pause", true)
	_act(&"pause", false)
	await physics_frames(3)
	# Choose RESUME with a jump key and keep holding it through the resume.
	_act(&"jump", true)
	await physics_frames(10)
	var y0 := player.global_position.y
	var left_ground := false
	for i in 60:
		await physics_frames(1)
		if not bool(player.get(&"grounded")) or str(player.get(&"state")) == "jump":
			left_ground = true
	_act(&"jump", false)
	assert_eq(tree.paused, false, "resumed")
	assert_true(not left_ground, "no jump from the key that chose RESUME")
	assert_near(player.global_position.y, y0, 0.5, "still on the floor")


func test_keyboard_press_leaves_touch_mode_and_releases_the_pad() -> void:
	if _skip():
		return
	var touch_script: GDScript = load(TOUCH_SCRIPT)
	var pad_center: Vector2 = touch_script.get(&"PAD_CENTER")
	await _open_playground()
	var display := tree.root.get_node("Display")
	display.call(&"_set_touch_mode", true)
	await physics_frames(2)
	var controls := _touch_controls()
	assert_true(controls != null and bool(controls.get(&"visible")), "touch controls shown in touch mode")
	_touch(0, pad_center + Vector2(30, 0))
	await physics_frames(2)
	assert_eq(_held(), ["move_right"], "finger on the pad runs right")
	# A key that is not a game key (F2) switches to keyboard mode.
	_key(KEY_F2, true)
	_key(KEY_F2, false)
	await physics_frames(2)
	assert_eq(bool(display.get(&"is_touch")), false, "keyboard mode after a key press")
	assert_eq(_held(), [], "nothing stays held when touch mode ends")
	assert_eq(bool(controls.get(&"visible")), false, "touch controls hidden")
	_touch(0, pad_center + Vector2(30, 0), false)
	_touch(1, Vector2(200, 60))
	_touch(1, Vector2(200, 60), false)
	await physics_frames(2)
	assert_eq(bool(display.get(&"is_touch")), true, "a touch switches back")
	assert_eq(bool(controls.get(&"visible")), true, "touch controls shown again")


func test_keyboard_pause_releases_touch_inputs_and_resume_is_clean() -> void:
	if _skip():
		return
	var touch_script: GDScript = load(TOUCH_SCRIPT)
	var pad_center: Vector2 = touch_script.get(&"PAD_CENTER")
	var jump_center: Vector2 = touch_script.get(&"JUMP_CENTER")
	var scene: Node = await _open_playground()
	var player: Node2D = scene.get(&"player")
	var display := tree.root.get_node("Display")
	display.call(&"_set_touch_mode", true)
	await physics_frames(2)
	_touch(0, pad_center + Vector2(30, 0))
	await physics_frames(20)
	_touch(1, jump_center)
	await physics_frames(2)
	assert_true(_held().has("move_right") and _held().has("jump"), "pad and jump held: %s" % [_held()])
	# Pause from a gamepad Start / keyboard P while both fingers stay down.
	_act(&"pause", true)
	_act(&"pause", false)
	await physics_frames(3)
	assert_eq(tree.paused, true, "paused")
	assert_eq(_held(), [], "pausing releases every touch-held action")
	assert_eq(_touch_controls().call(&"held_actions"), [], "touch controls hold nothing")
	# Fingers lift while paused, then resume.
	_touch(0, pad_center + Vector2(30, 0), false)
	_touch(1, jump_center, false)
	_act(&"pause", true)
	_act(&"pause", false)
	await physics_frames(5)
	assert_eq(tree.paused, false, "resumed")
	await physics_frames(30)
	assert_eq(_held(), [], "nothing held after resume")
	assert_true(absf(float(player.get(&"ground_speed"))) < 6.0 or bool(player.get(&"grounded")),
			"no runaway input after resume")


func test_audio_pool_stays_capped_under_spam() -> void:
	if _skip():
		return
	var names: Array = Audio.get(&"SFX_NAMES") if Audio.get(&"SFX_NAMES") != null else []
	if names.is_empty():
		print("  SKIP qa/test_ui_review.gd: Audio has no SFX_NAMES")
		return
	var players_before := Audio.find_children("*", "AudioStreamPlayer", true, false).size()
	var max_playing := 0
	for frame in 60:
		for n in names:
			for k in 3:
				Audio.call(&"play_sfx", n)
		await physics_frames(1)
		var playing := 0
		for p in Audio.find_children("*", "AudioStreamPlayer", true, false):
			if p.name != "Music" and (p as AudioStreamPlayer).playing:
				playing += 1
		max_playing = maxi(max_playing, playing)
	var players_after := Audio.find_children("*", "AudioStreamPlayer", true, false).size()
	print("  INFO audio: %d players before, %d after 60 frames of %d sfx calls/frame; at most %d playing" % [
			players_before, players_after, names.size() * 3, max_playing])
	assert_eq(players_after, players_before, "no players created by spam")
	var cap = Audio.get(&"MAX_SFX_VOICES")
	assert_true(max_playing <= (int(cap) if cap != null else 8), "voices capped")


func test_hud_counters_fit_at_extremes() -> void:
	if _skip() or not ResourceLoader.exists(HUD_SCENE):
		return
	var hud := add_scene(HUD_SCENE)
	GameState.score = 999999
	GameState.lives = 12
	GameState.tickets = 999
	GameState.level_time = 10.0 * 60.0 + 5.0
	GameState.score_changed.emit(GameState.score)
	GameState.lives_changed.emit(GameState.lives)
	GameState.tickets_changed.emit(GameState.tickets)
	await physics_frames(3)
	var view := Rect2(Vector2.ZERO, Vector2(424, 240))
	var texts := PackedStringArray()
	for label in hud.find_children("*", "Label", true, false):
		var l := label as Label
		if not l.is_visible_in_tree() or l.text == "":
			continue
		texts.append(l.text)
		var r := l.get_global_rect()
		assert_true(view.encloses(r), "HUD label '%s' inside the screen (%s)" % [l.text, r])
		var font := l.get_theme_font(&"font")
		var size := l.get_theme_font_size(&"font_size")
		var width := font.get_string_size(l.text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		assert_true(width <= r.size.x + 1.0 or l.autowrap_mode != TextServer.AUTOWRAP_OFF or l.clip_text == false,
				"label '%s' text fits its box" % l.text)
	print("  INFO HUD at extremes: %s" % ", ".join(texts))
	var joined := " ".join(texts)
	assert_true(joined.contains("999999"), "score 999999 shown")
	assert_true(joined.contains("12"), "lives above 9 shown")


func test_pause_controls_table_uses_layout_labels_and_no_esc() -> void:
	if _skip():
		return
	await _open_playground()
	_act(&"pause", true)
	_act(&"pause", false)
	await physics_frames(2)
	var grid := _menu().find_child("Grid", true, false) as GridContainer
	assert_true(grid != null, "controls table")
	if grid == null:
		return
	var cells := PackedStringArray()
	for child in grid.get_children():
		if child is Label:
			cells.append((child as Label).text)
	var all := " | ".join(cells)
	print("  INFO pause controls table: " + all)
	assert_true(not all.to_lower().contains("esc"), "Esc not offered for pause")
	var labels_script := "res://core/input_labels.gd"
	if ResourceLoader.exists(labels_script):
		var p_label := str(load(labels_script).call(&"for_physical", KEY_P))
		assert_true(all.contains(p_label), "pause key named by InputLabels (%s)" % p_label)


func test_menu_and_touch_cycles_do_not_grow_the_tree() -> void:
	if _skip():
		return
	var touch_script: GDScript = load(TOUCH_SCRIPT)
	var pad_center: Vector2 = touch_script.get(&"PAD_CENTER")
	await _open_playground()
	var display := tree.root.get_node("Display")
	display.call(&"_set_touch_mode", true)
	await physics_frames(2)
	var before := int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
	for cycle in 20:
		_touch(0, pad_center + Vector2(30, 0))
		await physics_frames(3)
		_act(&"pause", true)
		_act(&"pause", false)
		await physics_frames(2)
		_touch(0, pad_center + Vector2(30, 0), false)
		_act(&"pause", true)
		_act(&"pause", false)
		await physics_frames(4)
	await physics_frames(30)
	var after := int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
	print("  INFO nodes before %d, after 20 pause/touch cycles %d" % [before, after])
	assert_eq(tree.paused, false, "ends unpaused")
	assert_eq(_held(), [], "ends with nothing held")
	assert_true(after - before <= 4, "no node growth beyond transient effects")
