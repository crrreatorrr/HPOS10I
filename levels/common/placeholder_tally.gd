extends CanvasLayer
## Stand-in act-clear tally (LevelRoot uses it while
## res://ui/tally/score_tally.tscn does not exist). Shows the time bonus and
## the ticket bonus, counts both into the score with `tally_tick`, then emits
## `finished`. Pauses with the game.

signal finished

## [under this many seconds, bonus]. Slower than the last entry: no bonus.
const TIME_BONUS := [[30, 8000], [45, 5000], [60, 3000], [90, 2000], [120, 1000], [180, 500], [300, 100]]
const TICKET_BONUS := 100
## Points moved into the score per frame while counting.
const COUNT_STEP := 100
const START_DELAY_FRAMES := 45
const HOLD_FRAMES := 120
const TICK_EVERY := 4

## Zone shown in the heading (set by LevelRoot before adding the tally).
var zone_id := ""
var time_bonus := 0
var ticket_bonus := 0

var _frames := 0
var _counting := false
var _done := false
var _labels: Array[Label] = []


static func time_bonus_for(seconds: float) -> int:
	for entry in TIME_BONUS:
		if seconds < entry[0]:
			return entry[1]
	return 0


func _ready() -> void:
	layer = 20
	time_bonus = time_bonus_for(GameState.level_time)
	ticket_bonus = GameState.tickets * TICKET_BONUS
	var shade := ColorRect.new()
	shade.color = Color(0.05, 0.04, 0.12, 0.55)
	shade.position = Vector2(92, 52)
	shade.size = Vector2(240, 120)
	add_child(shade)
	var zone := ZoneRegistry.get_zone(zone_id)
	var zone_name: String = zone.get("name", "Act")
	_add_label(String(zone_name).to_upper() + " CLEAR!", 60, Color(1.0, 0.85, 0.25))
	for i in 3:
		_add_label("", 92 + i * 18, Color(1.0, 0.97, 0.88))
	_refresh()


func _process(_delta: float) -> void:
	if _done:
		return
	_frames += 1
	if not _counting:
		if _frames >= START_DELAY_FRAMES:
			_counting = true
			_frames = 0
		return
	if time_bonus > 0 or ticket_bonus > 0:
		var moved := mini(time_bonus, COUNT_STEP) + mini(ticket_bonus, COUNT_STEP)
		time_bonus -= mini(time_bonus, COUNT_STEP)
		ticket_bonus -= mini(ticket_bonus, COUNT_STEP)
		GameState.add_score(moved)
		if _frames % TICK_EVERY == 0:
			Audio.play_sfx(&"tally_tick")
		_frames = 0
		_refresh()
	elif _frames >= HOLD_FRAMES:
		_done = true
		finished.emit()


func _refresh() -> void:
	_labels[1].text = "TIME BONUS    %6d" % time_bonus
	_labels[2].text = "TICKET BONUS  %6d" % ticket_bonus
	_labels[3].text = "SCORE         %6d" % GameState.score


func _add_label(text: String, y: float, color: Color) -> void:
	var label := Label.new()
	label.text = text
	label.position = Vector2(92, y)
	label.size = Vector2(240, 16)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override(&"font_size", 11)
	label.add_theme_color_override(&"font_color", color)
	label.add_theme_color_override(&"font_outline_color", Color(0.06, 0.04, 0.12))
	label.add_theme_constant_override(&"outline_size", 4)
	add_child(label)
	_labels.append(label)
