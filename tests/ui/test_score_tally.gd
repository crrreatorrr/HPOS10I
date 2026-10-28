extends TestCase
## The act-clear tally: the bonus maths, `finished` exactly once with and
## without an emerald, the emerald moment only when GameState.emerald_just_won,
## the quiet line for an emerald won earlier, nothing for the test zone or a
## boss arena, and jump / tap to skip and continue.

const H := preload("res://tests/ui/ui_test_helpers.gd")
const SCENE := "res://ui/tally/score_tally.tscn"
const Z1 := "z1_retro_rush_hills"

var _finished := 0



func before_each() -> void:
	H.clear_scene(tree)
	await tree.process_frame

func after_each() -> void:
	H.set_touch_mode(false)


func _clear(zone_id: String, act: int, tickets := 12, seconds := 52.0) -> ScoreTally:
	GameState.zone_id = zone_id
	GameState.act = act
	GameState.add_tickets(tickets)
	GameState.level_time = seconds
	GameState.complete_level()
	var tally: ScoreTally = add_scene(SCENE)
	tally.finished.connect(func() -> void: _finished += 1)
	return tally


## Waits up to `seconds` of game time for `finished`.
func _wait_finished(tally: Node, seconds := 12.0) -> void:
	var elapsed := 0.0
	while _finished == 0 and elapsed < seconds:
		await tree.process_frame
		elapsed += tally.get_process_delta_time()


func test_root_is_a_canvas_layer_with_a_finished_signal() -> void:
	var tally: Node = add_scene(SCENE)
	assert_true(tally is CanvasLayer, "CanvasLayer root")
	assert_true(tally.has_signal(&"finished"), "finished signal")
	assert_true("zone_id" in tally, "zone_id property (LevelRoot contract)")


func test_time_bonus_table_matches_the_placeholder() -> void:
	var placeholder := load("res://levels/common/placeholder_tally.gd")
	for seconds in [0.0, 29.9, 30.0, 44.0, 59.0, 89.0, 119.0, 179.0, 299.0, 300.0, 1000.0]:
		assert_eq(ScoreTally.time_bonus_for(seconds), placeholder.time_bonus_for(seconds), "%s s" % seconds)


func test_emerald_moment_counts_and_finishes_once() -> void:
	var tally := _clear(Z1, 1, 12, 52.0)
	assert_true(GameState.emerald_just_won, "act 1 of a real zone wins an emerald")
	assert_true(tally.has_emerald_moment(), "the emerald moment shows")
	assert_true(not tally.get_node("%QuietBox").visible, "no quiet line")
	assert_eq((tally.get_node("%EmeraldName") as Label).text, Emeralds.NAME.to_upper(), "the emerald's name")
	assert_eq((tally.get_node("%EmeraldCount") as Label).text, "1 / %d" % Emeralds.total(), "N / 8")
	var score := GameState.score
	await _wait_finished(tally)
	assert_eq(_finished, 1, "finished once")
	assert_eq(GameState.score, score + 3000 + 12 * 100, "time and ticket bonuses counted in")
	assert_true((tally.get_node("%Emerald") as Node2D).visible, "the emerald arrived")
	await physics_frames(30)
	assert_eq(_finished, 1, "never twice")


func test_no_emerald_in_the_test_zone() -> void:
	var tally := _clear("test_zone", 1)
	assert_true(not GameState.emerald_just_won, "the test zone gives none")
	assert_true(not tally.has_emerald_moment(), "no emerald moment")
	assert_true(not tally.get_node("%QuietBox").visible, "no quiet line")
	await _wait_finished(tally)
	assert_eq(_finished, 1, "finished without an emerald")


func test_no_emerald_after_a_boss() -> void:
	var tally := _clear(Z1, 3)
	assert_true(not tally.has_emerald_moment() and not tally.get_node("%QuietBox").visible, "boss arenas give none")
	assert_eq((tally.get_node("%Title") as Label).text, "BOSS DEFEATED!", "boss title")


func test_emerald_won_earlier_shows_the_quiet_line() -> void:
	GameState.emeralds[Emeralds.key(Z1, 2)] = true
	var tally := _clear(Z1, 2)
	assert_true(not GameState.emerald_just_won, "already won")
	assert_true(not tally.has_emerald_moment(), "no big moment")
	assert_true(tally.get_node("%QuietBox").visible, "quiet small icon and count")
	assert_eq((tally.get_node("%QuietCount") as Label).text, "1 / %d" % Emeralds.total(), "N / 8")


func test_zone_and_act_default_to_game_state() -> void:
	var tally := _clear(Z1, 2)
	assert_eq(tally.zone_id, Z1, "zone from GameState")
	assert_eq((tally.get_node("%ZoneName") as Label).text, "RETRO RUSH HILLS", "zone heading")
	assert_eq((tally.get_node("%Title") as Label).text, "ACT 2 CLEAR!", "act title")


func test_jump_skips_the_count_then_continues() -> void:
	var tally := _clear(Z1, 1, 30, 40.0)
	var score := GameState.score
	await physics_frames(2)
	H.send_action(&"jump", true)  # within the grace time: ignored
	H.send_action(&"jump", false)
	assert_true(not tally.is_counting_done(), "a held jump from the goal run doesn't skip")
	await _wait_game_time(tally, ScoreTally.INPUT_GRACE)
	H.send_action(&"jump", true)
	H.send_action(&"jump", false)
	assert_true(tally.is_counting_done(), "jump finishes the count at once")
	assert_eq(GameState.score, score + 5000 + 30 * 100, "all bonuses counted")
	assert_true((tally.get_node("%Emerald") as Node2D).visible, "the emerald is shown when skipping")
	assert_eq(_finished, 0, "not finished yet")
	H.send_action(&"jump", true)
	H.send_action(&"jump", false)
	assert_eq(_finished, 1, "the next jump continues")


func test_tap_continues() -> void:
	var tally := _clear("test_zone", 1)
	await _wait_game_time(tally, ScoreTally.INPUT_GRACE)
	for i in 2:
		var tap := InputEventScreenTouch.new()
		tap.pressed = true
		tap.position = Vector2(212, 120)
		tree.root.push_input(tap, true)
		tap = tap.duplicate()
		tap.pressed = false
		tree.root.push_input(tap, true)
	assert_eq(_finished, 1, "two taps: skip, then continue")


func _wait_game_time(node: Node, seconds: float) -> void:
	var elapsed := 0.0
	while elapsed < seconds + 0.05:
		await tree.process_frame
		elapsed += node.get_process_delta_time()


## The panel stays clear of the HUD counters and of the playground's bottom
## control-hint line, in every mode, at 424x240.
func test_panel_clears_the_hud_and_the_hint_line() -> void:
	var playground: Node = add_scene("res://playground/physics_playground.tscn")
	var hud: Node = add_scene("res://ui/hud/hud.tscn")
	await physics_frames(3)
	var hint: Label = null
	for node in playground.find_children("*", "Label", true, false):
		if (node as Label).position.y > 200:
			hint = node
	assert_true(hint != null, "found the playground's bottom hint line")
	var counters := (hud.find_child("Counters", true, false) as Control).get_global_rect()
	for setup in [[Z1, 1, false], [Z1, 2, true], ["test_zone", 1, false]]:
		GameState.reset_game()
		if setup[2]:
			GameState.emeralds[Emeralds.key(setup[0], setup[1])] = true
		var tally := _clear(setup[0], setup[1])
		await physics_frames(2)
		var panel := (tally.get_node("Root/Panel") as Control).get_global_rect()
		var label := "%s act %d" % [setup[0], setup[1]]
		assert_true(panel.end.y <= ScoreTally.PANEL_BOTTOM, "%s: panel ends at %d" % [label, panel.end.y])
		assert_true(panel.position.x >= 0 and panel.end.x <= 424 and panel.position.y >= 0, "%s: on screen" % label)
		assert_true(not panel.intersects(counters), "%s: clear of the HUD counters" % label)
		if hint != null:
			assert_true(not panel.intersects(hint.get_global_rect()), "%s: clear of the hint line %s" % [label, hint.get_global_rect()])
		tally.queue_free()
		await physics_frames(1)
