extends TestCase
## QA probes for the act-clear tally (qa/reports/06-ui-emerald.md): the
## placeholder's contract (bonus maths, `finished` exactly once), a jump held
## from the goal run never skipping it, every device skipping it after the
## grace, and the emerald moment only when GameState.emerald_just_won.
## Skips until ui/tally/score_tally.tscn exists. Owned by QA.

const TALLY := "res://ui/tally/score_tally.tscn"
const PLACEHOLDER := "res://levels/common/placeholder_tally.gd"

var _saved := {}


func before_each() -> void:
	_saved = {score = GameState.score, tickets = GameState.tickets, level_time = GameState.level_time,
			zone_id = GameState.zone_id, act = GameState.act, just = GameState.get(&"emerald_just_won")}


func after_each() -> void:
	for k in _saved:
		if k == "just":
			if _saved.just != null:
				GameState.set(&"emerald_just_won", _saved.just)
		else:
			GameState.set(k, _saved[k])
	Input.action_release(&"jump")


func _skip() -> bool:
	if not ResourceLoader.exists(TALLY):
		print("  SKIP qa/test_tally_review.gd: no score tally yet")
		return true
	return false


func _open(seconds: float, tickets: int, zone := "z1_retro_rush_hills", act := 1, just_won := false) -> Node:
	GameState.level_time = seconds
	GameState.tickets = tickets
	GameState.zone_id = zone
	GameState.act = act
	if GameState.get(&"emerald_just_won") != null:
		GameState.set(&"emerald_just_won", just_won)
	var t := add_scene(TALLY)
	t.set_meta(&"qa_finished", 0)
	t.connect(&"finished", func() -> void: t.set_meta(&"qa_finished", int(t.get_meta(&"qa_finished")) + 1))
	return t


func test_bonus_maths_match_the_placeholder() -> void:
	if _skip() or not ResourceLoader.exists(PLACEHOLDER):
		return
	var placeholder: GDScript = load(PLACEHOLDER)
	var tally_script: GDScript = (load(TALLY) as PackedScene).instantiate().get_script()
	var p_table = placeholder.get_script_constant_map().get("TIME_BONUS")
	var t_table = tally_script.get_script_constant_map().get("TIME_BONUS")
	assert_eq(str(t_table), str(p_table), "same time-bonus table")
	assert_eq(tally_script.get_script_constant_map().get("TICKET_BONUS"), placeholder.get_script_constant_map().get("TICKET_BONUS"), "same ticket bonus")


func test_score_adds_up_and_finished_fires_once() -> void:
	if _skip():
		return
	GameState.score = 1000
	var t := _open(50.0, 20)  # 3000 time bonus (under 60 s) + 20 x 100
	for i in 60 * 12:
		await physics_frames(1)
	assert_eq(GameState.score, 1000 + 3000 + 2000, "score = before + time bonus + ticket bonus")
	assert_eq(int(t.get_meta(&"qa_finished")), 1, "finished exactly once")


func test_a_jump_held_from_the_goal_never_skips() -> void:
	if _skip():
		return
	Input.action_press(&"jump")  # held from the goal run, through the grace
	var t := _open(50.0, 20)
	await physics_frames(60)
	assert_true(not bool(t.call(&"is_counting_done")), "a held jump doesn't skip the count")
	Input.action_release(&"jump")


func _device_events() -> Array:
	var key := InputEventKey.new()
	key.physical_keycode = KEY_Z
	key.keycode = KEY_Z
	key.pressed = true
	var pad := InputEventJoypadButton.new()
	pad.button_index = JOY_BUTTON_A
	pad.pressed = true
	var touch := InputEventScreenTouch.new()
	touch.position = Vector2(212, 120)
	touch.pressed = true
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.position = Vector2(212, 120)
	click.pressed = true
	return [["keyboard Z", key], ["gamepad A", pad], ["touch", touch], ["mouse click", click]]


func test_every_device_skips_after_the_grace() -> void:
	if _skip():
		return
	for dev in _device_events():
		GameState.score = 0
		var t := _open(50.0, 20)
		await physics_frames(40)  # past the 0.4 s grace
		var ev: InputEvent = dev[1]
		Input.parse_input_event(ev)
		Input.flush_buffered_events()
		var release := ev.duplicate()
		release.set(&"pressed", false)
		Input.parse_input_event(release)
		Input.flush_buffered_events()
		await physics_frames(2)
		assert_true(bool(t.call(&"is_counting_done")), "%s skips the count" % dev[0])
		assert_eq(GameState.score, 5000, "%s: the skipped count still adds the whole bonus" % dev[0])
		t.queue_free()
		await physics_frames(2)


func test_emerald_moment_only_when_just_won() -> void:
	if _skip() or GameState.get(&"emerald_just_won") == null:
		return
	var won := _open(50.0, 0, "z1_retro_rush_hills", 1, true)
	await physics_frames(2)
	var won_moment := bool(won.call(&"has_emerald_moment"))
	won.queue_free()
	var not_won := _open(50.0, 0, "z1_retro_rush_hills", 1, false)
	await physics_frames(2)
	var plain_moment := bool(not_won.call(&"has_emerald_moment"))
	not_won.queue_free()
	var test_zone := _open(50.0, 0, "test_zone", 1, true)
	await physics_frames(2)
	var tz_moment := bool(test_zone.call(&"has_emerald_moment"))
	test_zone.queue_free()
	assert_true(won_moment, "the emerald moment shows when it was just won")
	assert_true(not plain_moment, "no emerald moment when it wasn't just won")
	assert_true(not tz_moment, "never in the test zone")
