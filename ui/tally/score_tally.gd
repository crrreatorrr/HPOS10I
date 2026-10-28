class_name ScoreTally
extends CanvasLayer
## The act-clear tally (LevelRoot adds it after the goal). Shows the zone and
## act, the time and ticket bonuses, counts them into the score with
## `tally_tick`, then emits `finished` once. Pauses with the game.
##
## The emerald moment: when GameState.emerald_just_won, the big spinning
## emerald arrives in the middle with its name and "N / 8" (sfx
## `emerald_get`). If this act's emerald was won before, a quiet small icon
## and "N / 8" instead. Nothing for the test zone or boss arenas.
##
## Jump (any device) or a tap/click skips the count; once counted, it
## continues. Timing runs on seconds, so any frame rate gives the same tally.
## The panel sits below the HUD counters (y 44+) so it never covers them.

signal finished

## Same bonus rules as levels/common/placeholder_tally.gd:
## [under this many seconds, bonus]. Slower than the last entry: no bonus.
const TIME_BONUS := [[30, 8000], [45, 5000], [60, 3000], [90, 2000], [120, 1000], [180, 500], [300, 100]]
const TICKET_BONUS := 100
## Points per second moved into the score while counting (100 a frame at 60).
const COUNT_RATE := 6000.0
const TICK_INTERVAL := 1.0 / 15.0
const START_DELAY := 0.75
## With an emerald: when it arrives, and when counting starts.
const EMERALD_AT := 0.4
const EMERALD_COUNT_AT := 2.2
## How fast the emerald spins as it arrives, settling to its normal speed.
const ARRIVAL_SPIN := 5.0
const ARRIVAL_SECONDS := 0.9
const HOLD_SECONDS := 2.0
## Presses this soon after the tally appears are ignored (a held jump from
## the goal run shouldn't skip it).
const INPUT_GRACE := 0.4

## Zone shown in the heading. LevelRoot may set it; defaults to GameState's.
var zone_id := ""
var act := 0
var time_bonus := 0
var ticket_bonus := 0

var _clock := 0.0
var _phase_clock := 0.0
var _state := &"intro"
var _count_budget := 0.0
var _tick_clock := 0.0
var _emerald_shown := false
var _sparkled := false
var _done := false

@onready var _emerald_box: Control = %EmeraldBox
@onready var _emerald: EmeraldIcon = %Emerald
@onready var _emerald_name: Label = %EmeraldName
@onready var _emerald_count: Label = %EmeraldCount
@onready var _quiet_box: Control = %QuietBox
@onready var _quiet_count: Label = %QuietCount
@onready var _continue: Label = %Continue


static func time_bonus_for(seconds: float) -> int:
	for entry in TIME_BONUS:
		if seconds < entry[0]:
			return entry[1]
	return 0


## What the emerald part shows for an act: &"won" (just now), &"earlier"
## (won on an earlier clear) or &"none" (test zone, boss arena, no zone).
static func emerald_mode(for_zone_id: String, for_act: int) -> StringName:
	if not Emeralds.is_emerald_act(for_zone_id, for_act):
		return &"none"
	if GameState.emerald_just_won:
		return &"won"
	if GameState.has_emerald(for_zone_id, for_act):
		return &"earlier"
	return &"none"


func _ready() -> void:
	if zone_id == "":
		zone_id = GameState.zone_id
	if act <= 0:
		act = GameState.act
	time_bonus = time_bonus_for(GameState.level_time)
	ticket_bonus = GameState.tickets * TICKET_BONUS
	_fill_heading()
	var count_text := "%d / %d" % [GameState.emerald_count(), Emeralds.total()]
	_emerald_name.text = Emeralds.NAME.to_upper()
	_emerald_count.text = count_text
	_quiet_count.text = count_text
	var mode := emerald_mode(zone_id, act)
	_emerald_box.visible = mode == &"won"
	_emerald_name.visible = mode == &"won"
	_emerald_count.visible = mode == &"won"
	_quiet_box.visible = mode == &"earlier"
	# The big icon waits (hidden) for its moment; the box keeps its space.
	_emerald.visible = false
	_emerald_name.modulate.a = 0.0
	_emerald_count.modulate.a = 0.0
	_emerald_box.resized.connect(_center_emerald)
	_center_emerald()
	# Alpha, not visibility, so the panel never changes size.
	_continue.modulate.a = 0.0
	_refresh()


func has_emerald_moment() -> bool:
	return _emerald_box.visible


func is_counting_done() -> bool:
	return _state == &"hold" or _done


func _process(delta: float) -> void:
	if _done:
		return
	_clock += delta
	_phase_clock += delta
	match _state:
		&"intro":
			if has_emerald_moment():
				_update_emerald_arrival()
				if _phase_clock >= EMERALD_COUNT_AT:
					_set_state(&"count")
			elif _phase_clock >= START_DELAY:
				_set_state(&"count")
		&"count":
			_update_emerald_arrival()
			_count(delta)
		&"hold":
			_continue.modulate.a = 1.0 if fmod(_phase_clock, 0.8) < 0.55 else 0.0
			if _phase_clock >= HOLD_SECONDS:
				_finish()


func _unhandled_input(event: InputEvent) -> void:
	if _done or _clock < INPUT_GRACE:
		return
	var pressed: bool = event.is_action_pressed(&"jump") \
			or (event is InputEventScreenTouch and event.pressed) \
			or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT)
	if not pressed:
		return
	get_viewport().set_input_as_handled()
	skip()


## Jump/tap: finish the count at once, or continue if it is already counted.
func skip() -> void:
	if _done:
		return
	if _state == &"hold":
		_finish()
		return
	_show_emerald_now()
	GameState.add_score(time_bonus + ticket_bonus)
	time_bonus = 0
	ticket_bonus = 0
	_refresh()
	_set_state(&"hold")


func _set_state(state: StringName) -> void:
	_state = state
	_phase_clock = 0.0
	if state == &"hold":
		_continue.modulate.a = 1.0


func _count(delta: float) -> void:
	if time_bonus <= 0 and ticket_bonus <= 0:
		_set_state(&"hold")
		return
	_count_budget += COUNT_RATE * delta
	var step := int(_count_budget)
	if step <= 0:
		return
	_count_budget -= step
	var from_time := mini(time_bonus, step)
	var from_tickets := mini(ticket_bonus, step)
	time_bonus -= from_time
	ticket_bonus -= from_tickets
	GameState.add_score(from_time + from_tickets)
	_tick_clock += delta
	if _tick_clock >= TICK_INTERVAL:
		_tick_clock = 0.0
		Audio.play_sfx(&"tally_tick")
	_refresh()


## The emerald spins in fast, fades up and settles to its normal spin.
func _update_emerald_arrival() -> void:
	if not has_emerald_moment():
		return
	var t := _clock - EMERALD_AT
	if t < 0.0:
		return
	if not _emerald_shown:
		_emerald_shown = true
		_emerald.visible = true
		Audio.play_sfx(&"emerald_get")
	var k := clampf(t / ARRIVAL_SECONDS, 0.0, 1.0)
	_emerald.spin_speed = lerpf(ARRIVAL_SPIN, 1.0, k * k * (3.0 - 2.0 * k))
	_emerald.modulate.a = clampf(t / 0.3, 0.0, 1.0)
	var text_alpha := clampf((t - 0.5) / 0.3, 0.0, 1.0)
	_emerald_name.modulate.a = text_alpha
	_emerald_count.modulate.a = text_alpha
	if k >= 1.0 and not _sparkled:
		_settle_emerald()


func _settle_emerald() -> void:
	_emerald.spin_speed = 1.0
	_emerald.modulate.a = 1.0
	_emerald_name.modulate.a = 1.0
	_emerald_count.modulate.a = 1.0
	if not _sparkled:
		_sparkled = true
		_emerald.sparkle()


func _show_emerald_now() -> void:
	if not has_emerald_moment():
		return
	if not _emerald_shown:
		_emerald_shown = true
		_emerald.visible = true
		Audio.play_sfx(&"emerald_get")
	_settle_emerald()


func _finish() -> void:
	if _done:
		return
	_done = true
	_continue.modulate.a = 0.0
	finished.emit()


func _center_emerald() -> void:
	_emerald.position = (_emerald_box.size * 0.5).round()


func _fill_heading() -> void:
	var zone := ZoneRegistry.get_zone(zone_id)
	var zone_name := String(zone.get("name", ""))
	var acts: int = zone.get("acts", []).size()
	(%ZoneName as Label).text = zone_name.to_upper()
	var title := "STAGE CLEAR!"
	if acts > 0:
		title = "BOSS DEFEATED!" if act > acts else "ACT %d CLEAR!" % act
	(%Title as Label).text = title


func _refresh() -> void:
	(%TimeValue as Label).text = str(time_bonus)
	(%TicketValue as Label).text = str(ticket_bonus)
	(%ScoreValue as Label).text = str(GameState.score)
