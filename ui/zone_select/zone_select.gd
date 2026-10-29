class_name ZoneSelect
extends Control
## Zone select: the 4 zones x 2 acts from ZoneRegistry, each act with its
## emerald slot (filled once won). Acts whose scene isn't built yet, and
## every act of an unreleased zone, are greyed out and skipped by navigation. Choosing an act calls
## SceneRouter.start_zone(); BACK (Pause, Esc or the button) returns to the
## title. Arrows / WASD / D-pad / stick move (wrapping), Enter, Space or any
## jump button chooses; mouse and touch click. Music: `zone_select`. Keys
## and pads only count while it is the current scene.

const INPUT_GRACE := 0.25
const NAME_WIDTH := 132.0
const BUTTON_SIZE := Vector2(58, 22)
const NAME_COLOR := Color(1, 0.86, 0.34)
const LOCKED_COLOR := Color(0.5, 0.52, 0.62)
## Bottom hint for keys/gamepad, and for touch (follows Display's touch mode).
const HINT_KEYS := "JUMP: START     PAUSE: BACK TO TITLE"
const HINT_TOUCH := "TAP AN ACT TO START     TAP BACK FOR THE TITLE"

## Rows of act buttons (null where an act can't be played), then [Back].
var _grid: Array = []
## Every emerald slot icon, in play order.
var _slots: Array[EmeraldIcon] = []
var _acts := {}  # Button -> [zone_id, act]
var _clock := 0.0
var _busy := false
var _quiet_focus := false
var _exchange_button: Button
var _exchange: ExchangePanel

@onready var _rows: VBoxContainer = %Rows
@onready var _back: Button = %Back


func _ready() -> void:
	Audio.play_music(&"zone_select")
	_build_rows()
	_grid.append([_back])
	_add_exchange_button()
	_back.pressed.connect(back)
	_back.mouse_entered.connect(_hover.bind(_back))
	_back.focus_entered.connect(_on_focus)
	_link_focus()
	_wire_exchange_focus()
	_update_hint(Display.is_touch)
	Display.touch_mode_changed.connect(_update_hint)
	(%Count as Label).text = "%s  %d / %d" % [Emeralds.NAME.to_upper(), GameState.emerald_count(), Emeralds.total()]
	_quiet_focus = true
	first_button().grab_focus()
	_quiet_focus = false


func _process(delta: float) -> void:
	_clock += delta


func _unhandled_input(event: InputEvent) -> void:
	if _exchange_open():
		return
	if _busy or _clock < INPUT_GRACE or get_tree().current_scene != self:
		return
	if event.is_action_pressed(&"ui_cancel") \
			or (event.is_action_pressed(&"pause") and not event.is_action(&"ui_accept")):
		back()
	elif event.is_action_pressed(&"move_up", true):
		_step(&"up")
	elif event.is_action_pressed(&"move_down", true):
		_step(&"down")
	elif event.is_action_pressed(&"move_left", true):
		_step(&"left")
	elif event.is_action_pressed(&"move_right", true):
		_step(&"right")
	elif event.is_action_pressed(&"jump") and not event.is_action(&"ui_accept"):
		var focused := get_viewport().gui_get_focus_owner() as Button
		if focused != null and not focused.disabled:
			focused.pressed.emit()
	else:
		return
	get_viewport().set_input_as_handled()


## The act buttons (and BACK), for tests: [[zone_id, act, Button], ...].
func act_buttons() -> Array:
	var out := []
	for button in _acts:
		out.append([_acts[button][0], _acts[button][1], button])
	return out


func emerald_slots() -> Array[EmeraldIcon]:
	return _slots


func first_button() -> Button:
	for row in _grid:
		for button in row:
			if button != null:
				return button
	return _back


## Starts an act (only the first choice counts).
func choose(zone_id: String, act: int) -> void:
	if _busy:
		return
	_busy = true
	Audio.play_sfx(&"menu_select")
	SceneRouter.start_zone(zone_id, act)


func back() -> void:
	if _busy:
		return
	_busy = true
	Audio.play_sfx(&"menu_select")
	SceneRouter.go_title()


func is_busy() -> bool:
	return _busy


func _exchange_open() -> bool:
	return _exchange != null and _exchange.visible


func _add_exchange_button() -> void:
	_exchange_button = Button.new()
	_exchange_button.name = "Exchange"
	_exchange_button.text = "EXCHANGE"
	_exchange_button.custom_minimum_size = Vector2(86, 22)
	var footer := %Back.get_parent()
	footer.add_child(_exchange_button)
	footer.move_child(_exchange_button, 0)
	_exchange_button.pressed.connect(_open_exchange)
	_exchange_button.mouse_entered.connect(_hover.bind(_exchange_button))
	_exchange_button.focus_entered.connect(_on_focus)


func _wire_exchange_focus() -> void:
	var back_links: Dictionary = _back.get_meta(&"links")
	back_links[&"left"] = _exchange_button
	back_links[&"right"] = _exchange_button
	_back.set_meta(&"links", back_links)
	_back.focus_neighbor_left = _back.get_path_to(_exchange_button)
	_back.focus_neighbor_right = _back.get_path_to(_exchange_button)
	var exchange_links := {
		&"left": _back,
		&"right": _back,
		&"up": back_links[&"up"],
		&"down": back_links[&"down"],
	}
	_exchange_button.set_meta(&"links", exchange_links)
	_exchange_button.focus_neighbor_left = _exchange_button.get_path_to(_back)
	_exchange_button.focus_neighbor_right = _exchange_button.get_path_to(_back)
	_exchange_button.focus_neighbor_top = _exchange_button.get_path_to(exchange_links[&"up"])
	_exchange_button.focus_neighbor_bottom = _exchange_button.get_path_to(exchange_links[&"down"])


func _open_exchange() -> void:
	if _busy:
		return
	if _exchange == null:
		_exchange = ExchangePanel.new()
		_exchange.name = "ExchangePanel"
		add_child(_exchange)
		_exchange.closed.connect(_on_exchange_closed)
	Audio.play_sfx(&"menu_select")
	_exchange.open_panel()


func _on_exchange_closed() -> void:
	if _exchange_button != null:
		_exchange_button.grab_focus()


func _update_hint(touch: bool) -> void:
	(%Hint as Label).text = HINT_TOUCH if touch else HINT_KEYS


func _build_rows() -> void:
	for zone in ZoneRegistry.all_zones(false):
		var row := HBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_theme_constant_override(&"separation", 4)
		_rows.add_child(row)
		var title := Label.new()
		title.text = String(zone.name).to_upper()
		title.theme_type_variation = &"HudLabel"
		title.custom_minimum_size = Vector2(NAME_WIDTH, 0)
		title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		row.add_child(title)
		var buttons := []
		var any_open := false
		var released := is_zone_released(zone)
		for act in range(1, zone.acts.size() + 1):
			var path := ZoneRegistry.stage_path(zone.id, act)
			var open := released and path != "" and ResourceLoader.exists(path)
			any_open = any_open or open
			var button := Button.new()
			button.text = "ACT %d" % act
			button.custom_minimum_size = BUTTON_SIZE
			button.disabled = not open
			button.focus_mode = Control.FOCUS_ALL if open else Control.FOCUS_NONE
			button.tooltip_text = "" if open else "Coming soon"
			row.add_child(button)
			_acts[button] = [zone.id, act]
			if open:
				button.pressed.connect(choose.bind(zone.id, act))
				button.mouse_entered.connect(_hover.bind(button))
				button.focus_entered.connect(_on_focus)
				buttons.append(button)
			else:
				buttons.append(null)
			row.add_child(_slot(zone.id, act))
		if not any_open:
			title.theme_type_variation = &"HudValue"
			title.add_theme_color_override(&"font_color", LOCKED_COLOR)
		_grid.append(buttons)


## An unreleased zone (acts built but not tuned yet) is locked like an
## unbuilt one.
static func is_zone_released(zone: Dictionary) -> bool:
	return ZoneRegistry.is_released(zone.id)


func _slot(zone_id: String, act: int) -> Control:
	var holder := Control.new()
	holder.custom_minimum_size = Vector2(18, 18)
	holder.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var icon := (load("res://ui/emerald/emerald_icon.tscn") as PackedScene).instantiate() as EmeraldIcon
	icon.small = true
	icon.empty = not GameState.has_emerald(zone_id, act)
	icon.spin_speed = 0.5
	icon.bob = false
	icon.position = Vector2(9, 9)
	icon.phase = act * 0.7  # not all in step
	holder.add_child(icon)
	_slots.append(icon)
	return holder


## Focus neighbours on the grid, skipping locked acts and wrapping around.
func _link_focus() -> void:
	for r in _grid.size():
		var row: Array = _grid[r]
		for c in row.size():
			var button: Button = row[c]
			if button == null:
				continue
			var links := {
				&"left": _in_row(r, c, -1), &"right": _in_row(r, c, 1),
				&"up": _in_column(r, c, -1), &"down": _in_column(r, c, 1),
			}
			button.focus_neighbor_left = button.get_path_to(links.left)
			button.focus_neighbor_right = button.get_path_to(links.right)
			button.focus_neighbor_top = button.get_path_to(links.up)
			button.focus_neighbor_bottom = button.get_path_to(links.down)
			button.focus_next = button.get_path_to(links.right if links.right != button else links.down)
			button.focus_previous = button.get_path_to(links.left if links.left != button else links.up)
			button.set_meta(&"links", links)


func _in_row(r: int, c: int, step: int) -> Button:
	var row: Array = _grid[r]
	for i in range(1, row.size() + 1):
		var other = row[posmod(c + step * i, row.size())]
		if other != null:
			return other
	return row[c]


func _in_column(r: int, c: int, step: int) -> Button:
	for i in range(1, _grid.size() + 1):
		var row: Array = _grid[posmod(r + step * i, _grid.size())]
		var same = row[mini(c, row.size() - 1)]
		if same != null:
			return same
		for other in row:
			if other != null:
				return other
	return _grid[r][c]


func _step(direction: StringName) -> void:
	var focused := get_viewport().gui_get_focus_owner() as Button
	if focused == null or not focused.has_meta(&"links"):
		first_button().grab_focus()
		return
	(focused.get_meta(&"links")[direction] as Button).grab_focus()


func _hover(button: Button) -> void:
	if not _busy and not button.has_focus():
		button.grab_focus()


func _on_focus() -> void:
	if not _quiet_focus:
		Audio.play_sfx(&"menu_move")
