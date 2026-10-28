extends TestCase
## HUD: updates on the same frame as GameState signals, formats time, score
## and lives, flashes the tickets counter red at 0, and moves the lives box
## out of the touch pad's way.

const H := preload("res://tests/ui/ui_test_helpers.gd")
const SCENE := "res://ui/hud/hud.tscn"

var _saved_args := {}


func before_each() -> void:
	_saved_args = Dev.args.duplicate()


func after_each() -> void:
	Dev.args = _saved_args
	H.set_touch_mode(false)


func _hud() -> GameHud:
	var hud: GameHud = add_scene(SCENE)
	return hud


func _text(hud: Node, unique: String) -> String:
	return (hud.get_node("%" + unique) as Label).text


func test_root_is_a_canvas_layer_with_the_theme() -> void:
	var hud := _hud()
	assert_true(hud is CanvasLayer, "HUD root is a CanvasLayer")
	assert_true((hud.get_node("Root") as Control).theme != null, "uses the game theme")
	for control in hud.find_children("*", "Control", true, false):
		assert_eq((control as Control).mouse_filter, Control.MOUSE_FILTER_IGNORE,
				"%s lets touches through" % control.name)


func test_shows_current_values_on_ready() -> void:
	GameState.add_score(4200)
	GameState.add_tickets(12)
	var hud := _hud()
	assert_eq(_text(hud, "ScoreValue"), "4200", "score")
	assert_eq(_text(hud, "TicketsValue"), "12", "tickets")
	assert_eq(_text(hud, "LivesValue"), "x %d" % GameState.lives, "lives")


func test_updates_on_the_same_frame_as_game_state_signals() -> void:
	var hud := _hud()
	GameState.add_tickets(7)
	assert_eq(_text(hud, "TicketsValue"), "7", "tickets, same frame")
	GameState.add_score(1230)
	assert_eq(_text(hud, "ScoreValue"), "1230", "score, same frame")
	GameState.lose_life()
	assert_eq(_text(hud, "LivesValue"), "x %d" % GameState.lives, "lives, same frame")
	GameState.lose_tickets()
	assert_eq(_text(hud, "TicketsValue"), "0", "tickets lost, same frame")


func test_clock_follows_game_state_level_time() -> void:
	var hud := _hud()
	GameState.timer_running = false
	GameState.level_time = 65.4
	await tree.process_frame
	assert_eq(_text(hud, "TimeValue"), "1:05", "1:05")
	GameState.level_time = 600.0
	await tree.process_frame
	assert_eq(_text(hud, "TimeValue"), "10:00", "past 9:59")


func test_time_format() -> void:
	var cases := {0.0: "0:00", 0.99: "0:00", 9.5: "0:09", 59.99: "0:59", 60.0: "1:00",
			125.0: "2:05", 599.99: "9:59", 600.0: "10:00", 3725.0: "62:05", -3.0: "0:00"}
	for seconds in cases:
		assert_eq(GameHud.format_time(seconds), cases[seconds], "%s s" % seconds)


func test_score_and_lives_never_overflow() -> void:
	assert_eq(GameHud.format_score(999_999), "999999", "six digits")
	assert_eq(GameHud.format_score(123_456_789), "9999999", "capped")
	assert_eq(GameHud.format_lives(3), "x 3", "lives")
	assert_eq(GameHud.format_lives(12), "x 12", "two-digit lives")
	assert_eq(GameHud.format_lives(150), "x 99", "capped lives")
	var hud := _hud()
	GameState.add_score(123_456_789)
	var score := hud.get_node("%ScoreValue") as Label
	var font := score.get_theme_font(&"font")
	var width := font.get_string_size(score.text, HORIZONTAL_ALIGNMENT_LEFT, -1, score.get_theme_font_size(&"font_size")).x
	# The value column in hud.tscn spans x 74..136.
	assert_true(width <= 62.0, "widest score fits its column (%s px)" % width)


func test_zero_tickets_flash_red() -> void:
	var hud := _hud()
	GameState.lose_tickets()
	await tree.process_frame
	# Measured in game seconds (frame deltas), so any frame rate works.
	var lit := 0.0
	var dark := 0.0
	var elapsed := 0.0
	while elapsed < 1.0:
		await tree.process_frame
		var delta := hud.get_process_delta_time()
		elapsed += delta
		if hud.is_warning_lit():
			lit += delta
		else:
			dark += delta
	assert_true(lit > 0.3 and dark > 0.3, "blinks at 0 tickets (lit %.2f s, dark %.2f s)" % [lit, dark])
	GameState.add_tickets(1)
	assert_true(not hud.is_warning_lit(), "steady once a ticket is held")
	elapsed = 0.0
	while elapsed < 0.7:
		await tree.process_frame
		elapsed += hud.get_process_delta_time()
		if hud.is_warning_lit():
			fail("lit with tickets in hand")
			break


func test_lives_box_moves_for_touch_controls() -> void:
	var hud := _hud()
	var lives := hud.get_node("%Lives") as Control
	var bottom := lives.position
	assert_true(bottom.y > 200, "lives bottom-left on desktop")
	H.set_touch_mode(true)
	assert_eq(lives.position, GameHud.TOUCH_LIVES_POSITION, "moved out of the touch pad's way")
	var fresh := _hud()
	assert_eq((fresh.get_node("%Lives") as Control).position, GameHud.TOUCH_LIVES_POSITION,
			"a HUD made in touch mode starts there")
	H.set_touch_mode(false)
	assert_eq(lives.position, bottom, "back bottom-left with keys/gamepad")


func test_icons_are_drawn() -> void:
	var hud := _hud()
	assert_true((hud.get_node("%TicketIcon") as TextureRect).texture != null, "ticket icon")
	var head := (hud.get_node("%Head") as TextureRect).texture
	assert_true(head != null and head.get_size() == Vector2(16, 16), "16x16 Sproto head")
