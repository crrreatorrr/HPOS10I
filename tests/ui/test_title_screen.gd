extends TestCase
## Title screen: the logo, Sproto, the exact disclaimer from CONTRACTS, title
## music, and jump / accept / Start / tap / click going to the zone select
## exactly once. Boot goes here unless --dev.

const H := preload("res://tests/ui/ui_test_helpers.gd")
const SCENE := "res://ui/title/title_screen.tscn"



func before_each() -> void:
	H.clear_scene(tree)
	await tree.process_frame

func after_each() -> void:
	H.set_touch_mode(false)
	H.clear_scene(tree)


func _open() -> TitleScreen:
	var title: TitleScreen = add_scene(SCENE)
	tree.current_scene = title
	return title


func _texts(node: Node) -> PackedStringArray:
	var out := PackedStringArray()
	for label in node.find_children("*", "Label", true, false):
		out.append((label as Label).text)
	return out


func test_shows_logo_sproto_and_the_contract_disclaimer() -> void:
	var title := _open()
	var contracts := FileAccess.get_file_as_string("res://docs/CONTRACTS.md")
	assert_true(contracts.contains('"%s"' % TitleScreen.DISCLAIMER), "the disclaimer is the CONTRACTS line, word for word")
	var texts := _texts(title)
	assert_true(texts.has(TitleScreen.DISCLAIMER), "the disclaimer is shown")
	assert_true(texts.has("HPOS10I"), "the logo")
	assert_true(title.find_child("Sproto", true, false) != null, "Sproto is there")
	assert_eq(Audio.current_music(), &"title", "title music")
	var disclaimer := title.get_node("%Disclaimer") as Label
	var width := disclaimer.get_theme_font(&"font").get_string_size(disclaimer.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 8).x
	assert_true(width <= 420.0, "the disclaimer fits on one line at 424 px (%s)" % width)


func test_jump_goes_to_the_zone_select_once() -> void:
	var title := _open()
	H.send_action(&"jump", true)
	H.send_action(&"jump", false)
	assert_true(not title.is_leaving(), "a key held from the previous screen is ignored")
	await _game_seconds(title, TitleScreen.INPUT_GRACE + 0.05)
	var changes := [0]
	var count := func() -> void: changes[0] += 1
	tree.node_added.connect(func(node: Node) -> void:
		if node.scene_file_path == SceneRouter.ZONE_SELECT_SCENE:
			count.call())
	# Mash for a few frames (less than the zone select's own input grace,
	# which then keeps the mashing from also starting an act).
	var started := false
	for i in 8:
		H.send_action(&"jump", true)
		H.send_action(&"jump", false)
		started = started or (is_instance_valid(title) and title.is_leaving())
		await tree.process_frame
	assert_true(started, "jump starts")
	await physics_frames(3)
	assert_eq(changes[0], 1, "exactly one zone select opened")
	assert_true(tree.current_scene != null and tree.current_scene.scene_file_path == SceneRouter.ZONE_SELECT_SCENE,
			"the zone select is on screen")


func test_start_tap_and_click_also_start() -> void:
	var events := []
	var start := InputEventJoypadButton.new()
	start.button_index = JOY_BUTTON_START
	start.pressed = true
	events.append(start)
	var tap := InputEventScreenTouch.new()
	tap.pressed = true
	events.append(tap)
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	events.append(click)
	for event in events:
		var title := _open()
		await _game_seconds(title, TitleScreen.INPUT_GRACE + 0.05)
		tree.root.push_input(event, true)
		assert_true(title.is_leaving(), "%s starts" % event.get_class())
		await physics_frames(3)
		H.clear_scene(tree)
		await physics_frames(1)


func test_a_stray_copy_ignores_input() -> void:
	var title: TitleScreen = add_scene(SCENE)  # not the current scene
	await _game_seconds(title, TitleScreen.INPUT_GRACE + 0.05)
	H.send_action(&"jump", true)
	H.send_action(&"jump", false)
	assert_true(not title.is_leaving(), "only the current scene reacts")


func test_boot_goes_to_the_title_unless_dev() -> void:
	var dev := tree.root.get_node("Dev")
	var saved: Dictionary = dev.args.duplicate()
	dev.args.erase("dev")
	dev._boot_taken = true
	add_scene("res://core/main.tscn")
	await physics_frames(3)
	dev.args = saved
	assert_true(tree.current_scene != null and tree.current_scene.scene_file_path == SceneRouter.TITLE_SCENE,
			"boot shows the title")


func _game_seconds(node: Node, seconds: float) -> void:
	var elapsed := 0.0
	while elapsed < seconds:
		await tree.process_frame
		elapsed += node.get_process_delta_time()
