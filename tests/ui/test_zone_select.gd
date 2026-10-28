extends TestCase
## Zone select: 4 zones x 2 acts from ZoneRegistry, unbuilt acts locked,
## 8 emerald slots (filled / empty), wrapping navigation that skips locked
## acts, start_zone() exactly once, back to the title, zone_select music.

const H := preload("res://tests/ui/ui_test_helpers.gd")
const SCENE := "res://ui/zone_select/zone_select.tscn"



func before_each() -> void:
	H.clear_scene(tree)
	await tree.process_frame

func after_each() -> void:
	H.clear_scene(tree)


func _open() -> ZoneSelect:
	var select: ZoneSelect = add_scene(SCENE)
	tree.current_scene = select
	return select


func test_lists_every_zone_and_act_and_locks_unbuilt_ones() -> void:
	var select := _open()
	var listed := {}
	for entry in select.act_buttons():
		listed[Emeralds.key(entry[0], entry[1])] = entry[2]
	assert_eq(listed.size(), 8, "4 zones x 2 acts")
	for zone in ZoneRegistry.all_zones(false):
		for act in range(1, zone.acts.size() + 1):
			var button: Button = listed.get(Emeralds.key(zone.id, act))
			assert_true(button != null, "%s act %d listed" % [zone.id, act])
			if button == null:
				continue
			var built := ResourceLoader.exists(ZoneRegistry.stage_path(zone.id, act))
			assert_eq(button.disabled, not built, "%s act %d locked unless built" % [zone.id, act])
			assert_eq(button.focus_mode == Control.FOCUS_NONE, not built, "locked acts take no focus")
	assert_eq(Audio.current_music(), &"zone_select", "zone_select music")


func test_eight_emerald_slots_filled_or_empty() -> void:
	GameState.emeralds[Emeralds.key("z1_retro_rush_hills", 2)] = true
	GameState.emeralds[Emeralds.key("z4_neon_rush_remix", 1)] = true
	var select := _open()
	var slots := select.emerald_slots()
	assert_eq(slots.size(), Emeralds.total(), "8 slots")
	var keys := Emeralds.all_keys()
	var filled := 0
	for i in slots.size():
		var parts := keys[i].split(":")
		assert_true(slots[i].small, "small icons")
		assert_eq(slots[i].empty, not GameState.has_emerald(parts[0], int(parts[1])), "%s slot" % keys[i])
		filled += 0 if slots[i].empty else 1
	assert_eq(filled, 2, "two filled")
	var count := select.get_node("%Count") as Label
	assert_eq(count.text, "%s  2 / %d" % [Emeralds.NAME.to_upper(), Emeralds.total()], "name and count")


func test_navigation_wraps_and_skips_locked_acts() -> void:
	var select := _open()
	await physics_frames(1)
	var first := select.first_button()
	assert_true(first.has_focus() and not first.disabled, "focus starts on a playable act")
	var seen := {}
	var button := first
	for i in 12:  # down, down, ... wraps back to the start
		var links: Dictionary = button.get_meta(&"links")
		for direction in links:
			var target: Button = links[direction]
			assert_true(not target.disabled, "%s from %s never lands on a locked act" % [direction, button.text])
		seen[button] = true
		button = links[&"down"]
	assert_true(seen.has(select.get_node("%Back")), "BACK is reachable")
	# WASD moves focus too (arrows/D-pad go through the GUI's ui_* links).
	await _game_seconds(select, ZoneSelect.INPUT_GRACE + 0.05)
	H.send_key(KEY_S, true)
	H.send_key(KEY_S, false)
	assert_true(not first.has_focus(), "S moved the focus")
	H.send_key(KEY_W, true)
	H.send_key(KEY_W, false)
	assert_true(first.has_focus(), "W moved it back")


func test_choosing_an_act_starts_it_exactly_once() -> void:
	var select := _open()
	await _game_seconds(select, ZoneSelect.INPUT_GRACE + 0.05)
	var target: Button = select.first_button()
	var expected: Array = []
	for entry in select.act_buttons():
		if entry[2] == target:
			expected = [entry[0], entry[1]]
	var starts := [0]
	SceneRouter.stage_started.connect(func(_z: String, _s: int) -> void: starts[0] += 1)
	var chosen := false
	for i in 20:  # mash a jump key (Z: jump but not ui_accept)
		H.send_key(KEY_Z, true)
		H.send_key(KEY_Z, false)
		chosen = chosen or (is_instance_valid(select) and select.is_busy())
		await tree.process_frame
	assert_true(chosen, "chosen")
	assert_eq(starts[0], 1, "start_zone ran once")
	assert_eq([SceneRouter.zone_id, SceneRouter.stage], expected, "the focused act started")
	await physics_frames(3)


func test_click_or_tap_chooses_and_back_returns_to_the_title() -> void:
	var select := _open()
	await _game_seconds(select, ZoneSelect.INPUT_GRACE + 0.05)
	select.get_node("%Back").pressed.emit()  # a click or tap on BACK
	assert_true(select.is_busy(), "back pressed")
	await physics_frames(3)
	assert_true(tree.current_scene != null and tree.current_scene.scene_file_path == SceneRouter.TITLE_SCENE,
			"back at the title")


func test_pause_goes_back_but_enter_chooses() -> void:
	var select := _open()
	await _game_seconds(select, ZoneSelect.INPUT_GRACE + 0.05)
	H.send_key(KEY_ENTER, true)  # pause AND accept: the focused act takes it
	assert_true(not select.is_busy() or SceneRouter.zone_id != "", "Enter never means back")
	H.send_key(KEY_ENTER, false)
	assert_true(select.is_busy() and SceneRouter.zone_id != "", "Enter chose the focused act")
	await physics_frames(2)
	H.clear_scene(tree)
	await physics_frames(1)
	var other := _open()
	await _game_seconds(other, ZoneSelect.INPUT_GRACE + 0.05)
	H.send_key(KEY_P, true)
	H.send_key(KEY_P, false)
	assert_true(other.is_busy(), "P (pause) goes back")


func test_unreleased_zones_are_locked_but_keep_their_slots() -> void:
	# A zone whose acts exist but that isn't released yet locks like an
	# unbuilt one, and still shows its emerald slots.
	assert_true(ZoneSelect.is_zone_released(ZoneRegistry.get_zone("z1_retro_rush_hills")), "zone 1 is released")
	var registry_has_it := false
	for method in (load("res://core/zone_registry.gd") as GDScript).get_script_method_list():
		registry_has_it = registry_has_it or method.name == "is_released"
	if not registry_has_it:
		var zone := ZoneRegistry.get_zone("z1_retro_rush_hills").duplicate()
		zone["released"] = false
		assert_true(not ZoneSelect.is_zone_released(zone), "a released = false zone is locked (fallback)")
	var select := _open()
	assert_eq(select.emerald_slots().size(), Emeralds.total(), "every slot shown, released or not")
	for entry in select.act_buttons():
		if not ZoneSelect.is_zone_released(ZoneRegistry.get_zone(entry[0])):
			var button: Button = entry[2]
			assert_true(button.disabled and button.focus_mode == Control.FOCUS_NONE,
					"%s act %d locked (unreleased)" % [entry[0], entry[1]])


func test_hint_follows_touch_mode() -> void:
	var select := _open()
	var hint := select.get_node("%Hint") as Label
	assert_eq(hint.text, ZoneSelect.HINT_KEYS, "keys/gamepad wording")
	H.set_touch_mode(true)
	assert_eq(hint.text, ZoneSelect.HINT_TOUCH, "touch wording once touch mode starts")
	var width := hint.get_theme_font(&"font").get_string_size(hint.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 8).x
	assert_true(width <= 420.0, "touch hint fits on one line (%s px)" % width)
	H.set_touch_mode(false)
	assert_eq(hint.text, ZoneSelect.HINT_KEYS, "back to keys on the first key press")
	H.set_touch_mode(true)
	var fresh := _open()
	assert_eq((fresh.get_node("%Hint") as Label).text, ZoneSelect.HINT_TOUCH, "opened in touch mode")
	H.set_touch_mode(false)


func _game_seconds(node: Node, seconds: float) -> void:
	var elapsed := 0.0
	while elapsed < seconds:
		await tree.process_frame
		elapsed += node.get_process_delta_time()
