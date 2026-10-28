extends TestCase
## Pause menu: toggles only in gameplay, releases held inputs, never leaves a
## jump buffered, stays consistent under spam, and its actions (restart, quit
## to menu) work from a playground and leave the tree unpaused.

const H := preload("res://tests/ui/ui_test_helpers.gd")
const PLAYGROUND := "res://playground/physics_playground.tscn"


## Counts fresh jump presses seen by gameplay (a pausable node).
class JumpProbe extends Node:
	var fresh_jumps := 0
	var frames := 0

	func _physics_process(_delta: float) -> void:
		frames += 1
		if Input.is_action_just_pressed(&"jump"):
			fresh_jumps += 1


var menu: PauseMenu
var _saved_free_scene := ""


func before_each() -> void:
	menu = H.pause_menu(tree)
	_saved_free_scene = SceneRouter.get(&"_free_scene")


func after_each() -> void:
	H.reset_pause(tree)
	SceneRouter.set(&"_free_scene", _saved_free_scene)
	tree.current_scene = null


func test_display_added_one_global_pause_menu() -> void:
	assert_true(menu != null, "Display added the pause menu")
	assert_eq(tree.get_nodes_in_group(&"pause_menu").size(), 1, "exactly one pause menu")
	assert_eq(menu.process_mode, Node.PROCESS_MODE_ALWAYS, "runs while paused")
	assert_true(not menu.visible, "hidden until paused")


func test_pause_does_nothing_outside_gameplay() -> void:
	H.tap_pause()
	await physics_frames(2)
	assert_true(not tree.paused, "no current scene: no pause")
	assert_true(not menu.is_open(), "no current scene: menu closed")
	H.enter_menu(self)
	H.tap_pause()
	await physics_frames(2)
	assert_true(not tree.paused, "boot menu: no pause")
	assert_true(not menu.visible, "boot menu: menu hidden")


func test_pause_toggles_in_gameplay() -> void:
	H.enter_gameplay(self)
	H.tap_pause()
	assert_true(tree.paused, "paused at once")
	assert_true(menu.is_open() and menu.visible, "menu shown")
	await physics_frames(3)
	assert_true(tree.paused, "stays paused")
	H.tap_pause()
	await _wait_unpaused()
	assert_true(not tree.paused, "pause again resumes")
	assert_true(not menu.visible, "menu hidden after resume")


func test_keyboard_and_gamepad_pause_keys() -> void:
	H.enter_gameplay(self)
	for key in [KEY_P, KEY_ENTER, KEY_ESCAPE]:
		H.send_key(key, true)
		H.send_key(key, false)
		assert_true(tree.paused, "key %s pauses" % OS.get_keycode_string(key))
		H.reset_pause(tree)
		await physics_frames(2)
	var start := InputEventJoypadButton.new()
	start.button_index = JOY_BUTTON_START
	start.pressed = true
	Input.parse_input_event(start)
	Input.flush_buffered_events()
	start = start.duplicate()
	start.pressed = false
	Input.parse_input_event(start)
	Input.flush_buffered_events()
	assert_true(tree.paused, "gamepad Start pauses")


func test_pausing_releases_held_inputs() -> void:
	H.enter_gameplay(self)
	press(&"move_right")
	press(&"jump")
	H.send_key(KEY_LEFT, true)  # a real key still held down
	assert_true(Input.is_action_pressed(&"move_left"), "key press registered")
	H.tap_pause()
	for action in [&"move_left", &"move_right", &"jump"]:
		assert_true(not Input.is_action_pressed(action), "%s released on pause" % action)
	H.tap_pause()
	await _wait_unpaused()
	assert_true(not tree.paused, "resumed")
	assert_true(not Input.is_action_pressed(&"move_left"), "still released after resume")
	H.send_key(KEY_LEFT, false)


func test_resume_with_a_jump_key_never_buffers_a_jump() -> void:
	H.enter_gameplay(self)
	var probe := JumpProbe.new()
	add_node(probe)
	await physics_frames(2)
	H.tap_pause()
	await physics_frames(3)
	var frames_before := probe.frames
	# Z is a jump key and also "choose" in the menu (RESUME has focus).
	H.send_key(KEY_Z, true)
	var waited := 0
	while tree.paused and waited < 10:
		await physics_frames(1)
		waited += 1
	assert_true(not tree.paused, "the jump key chose RESUME")
	await physics_frames(5)
	H.send_key(KEY_Z, false)
	assert_true(probe.frames > frames_before, "gameplay runs again")
	assert_eq(probe.fresh_jumps, 0, "gameplay never saw a fresh jump press")


func test_resume_with_accept_and_mouse() -> void:
	H.enter_gameplay(self)
	H.tap_pause()
	assert_true(menu.get_viewport().gui_get_focus_owner() == menu.get_node("%Resume"), "RESUME focused")
	H.send_key(KEY_ENTER, true)
	H.send_key(KEY_ENTER, false)  # buttons fire on release
	await _wait_unpaused()
	assert_true(not tree.paused, "Enter on RESUME resumes")
	H.tap_pause()
	(menu.get_node("%Resume") as Button).pressed.emit()  # a click or a tap
	await _wait_unpaused()
	assert_true(not tree.paused, "clicking RESUME resumes")


func test_menu_navigation_wraps() -> void:
	H.enter_gameplay(self)
	H.tap_pause()
	var resume: Button = menu.get_node("%Resume")
	var quit: Button = menu.get_node("%Quit")
	H.send_key(KEY_W, true)  # move_up from the top wraps to the bottom
	H.send_key(KEY_W, false)
	assert_true(quit.has_focus(), "W from RESUME wraps to QUIT")
	H.send_key(KEY_S, true)
	H.send_key(KEY_S, false)
	assert_true(resume.has_focus(), "S from QUIT wraps to RESUME")


func test_pause_spam_stays_consistent() -> void:
	H.enter_gameplay(self)
	for i in 600:
		H.tap_pause()
		await physics_frames(1)
		assert_eq(menu.visible, menu.is_open(), "frame %d: visibility matches state" % i)
		if menu.is_open() != tree.paused:
			fail("frame %d: menu open=%s but paused=%s" % [i, menu.is_open(), tree.paused])
			break
	await physics_frames(5)
	assert_eq(tree.paused, menu.is_open(), "settles consistent")
	assert_eq(Engine.time_scale, 1.0, "time scale untouched")


func test_menu_closes_when_something_else_unpauses() -> void:
	H.enter_gameplay(self)
	H.tap_pause()
	tree.paused = false  # e.g. SceneRouter changing scene
	await physics_frames(2)
	assert_true(not menu.visible and not menu.is_open(), "menu follows the tree")


func test_controls_list_offers_p_not_esc() -> void:
	var texts := PackedStringArray()
	for label in menu.find_children("*", "Label", true, false):
		texts.append((label as Label).text)
	var all := " | ".join(texts)
	assert_true(all.contains("P / ENTER"), "pause keys shown as P / ENTER: %s" % all)
	assert_true(not all.contains("ESC"), "Esc is never offered (browsers keep it)")
	assert_true(all.contains("ARROWS / "), "movement keys listed")
	assert_true(all.contains("START") and all.contains("II BUTTON"), "gamepad and touch pause listed")


func test_restart_and_quit_from_the_playground() -> void:
	if not ResourceLoader.exists(PLAYGROUND):
		print("  SKIP ui/test_pause_menu.gd: no playground")
		return
	SceneRouter.open_scene(PLAYGROUND)
	assert_true(await _wait_for_scene(PLAYGROUND), "playground opened")
	var first := tree.current_scene
	var lives := GameState.lives
	await physics_frames(5)
	H.tap_pause()
	assert_true(tree.paused, "paused in the playground")
	(menu.get_node("%Restart") as Button).pressed.emit()
	assert_true(not tree.paused, "restart unpauses")
	assert_eq(Engine.time_scale, 1.0, "restart leaves time scale 1")
	var waited := 0
	while (tree.current_scene == first or tree.current_scene == null) and waited < 30:
		await physics_frames(1)
		waited += 1
	assert_true(tree.current_scene != first and tree.current_scene != null, "a fresh playground")
	assert_eq(tree.current_scene.scene_file_path, PLAYGROUND, "same playground")
	assert_eq(GameState.lives, lives, "no life lost")
	await physics_frames(5)
	H.tap_pause()
	(menu.get_node("%Quit") as Button).pressed.emit()
	assert_true(not tree.paused, "quit unpauses")
	assert_true(await _wait_for_scene(SceneRouter.MAIN_SCENE), "back at the boot menu")
	assert_true(not SceneRouter.in_gameplay(), "menus are not gameplay")
	assert_true(not menu.visible, "pause menu hidden in the menu")
	tree.current_scene.queue_free()
	await physics_frames(2)


func test_restart_in_a_zone_keeps_the_checkpoint() -> void:
	# A zone stage that is not built yet falls back to the boot menu, but the
	# checkpoint must survive the restart either way (respawn-style restart).
	H.enter_gameplay(self)
	SceneRouter.zone_id = "test_zone"
	SceneRouter.stage = 1
	GameState.set_checkpoint(Vector2(640, -32))
	GameState.level_time = 50.0
	var lives := GameState.lives
	menu.restart_stage()
	assert_eq(GameState.checkpoint_position, Vector2(640, -32), "checkpoint kept")
	assert_eq(GameState.lives, lives, "no life lost")
	await physics_frames(3)
	if tree.current_scene != null and tree.current_scene.scene_file_path == SceneRouter.MAIN_SCENE:
		tree.current_scene.queue_free()
		await physics_frames(2)


func _wait_unpaused() -> void:
	for i in 10:
		if not tree.paused:
			return
		await physics_frames(1)


func _wait_for_scene(path: String) -> bool:
	for i in 60:
		if tree.current_scene != null and tree.current_scene.scene_file_path == path:
			return true
		await physics_frames(1)
	return false
