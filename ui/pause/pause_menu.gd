class_name PauseMenu
extends CanvasLayer
## Global pause menu. The Display autoload adds it once, above every scene;
## process_mode is ALWAYS so it keeps running while the tree is paused.
##
## The `pause` action (Enter, Esc, P, gamepad Start, the touch pause button)
## toggles it, but only while SceneRouter.in_gameplay(). Options:
##   RESUME        back to the game
##   RESTART       reload the stage from its checkpoint (or the playground),
##                 without losing a life
##   EXIT TO HUB   HubBridge.exit_to_hub() — hubSdk.exit() and the configured hub URL
##   QUIT TO MENU  SceneRouter.go_title()
## time_focus (M3) must not use this menu or get_tree().paused.
## HubBridge.begin_time_focus() is the time-scale hook for that.
## Arrows/WASD/D-pad move, Enter/Space/any jump button/A choose, mouse and
## touch click. The panel also lists the controls for every device; key names
## come from the player's keyboard layout (InputHints), and Esc is never
## offered for pause (browsers keep it for leaving fullscreen).
##
## Pausing releases every held game input. Resuming waits for two physics
## frames without a fresh jump press, so the key that closed the menu never
## makes Sproto jump. On the web (and mobile), losing focus (tab switch, phone
## call) pauses the game.

signal opened
signal closed

## Released on pause and on resume so nothing stays held across the menu.
const GAME_ACTIONS: Array[StringName] = [&"move_left", &"move_right", &"move_up", &"move_down", &"jump"]
const DEVICE_COLUMNS := {"keyboard": 1, "gamepad": 2, "touch": 3}
const HEADER_ACTIVE := Color(1, 0.86, 0.34)
const HEADER_IDLE := Color(0.62, 0.66, 0.82)
const QUIET_FRAMES_TO_RESUME := 2

## Losing focus (tab switch, phone call) pauses the game: on the web and
## mobile only, never on a desktop build, where Movie Maker recordings (even
## with `--touch`) can lose window focus mid-take.
var pause_on_focus_loss := OS.has_feature("web") or OS.has_feature("mobile")

var _open := false
var _resume_pending := false
var _quiet_frames := 0
var _last_device := "keyboard"
var _quiet_focus := false

@onready var _buttons: Array[Button] = [%Resume, %Restart, %Quit]
@onready var _grid: GridContainer = %Grid


func _ready() -> void:
	add_to_group(&"pause_menu")
	# Run before gameplay nodes each physics frame, so an unpause takes effect
	# for the whole frame.
	process_physics_priority = -100
	visible = false
	if TouchControls.is_enabled():
		_last_device = "touch"
	var exit_hub := Button.new()
	exit_hub.name = "ExitHub"
	exit_hub.text = "EXIT TO HUB"
	exit_hub.custom_minimum_size = Vector2(150, 24)
	var box := %Quit.get_parent()
	box.add_child(exit_hub)
	box.move_child(exit_hub, %Quit.get_index())
	# Quit stays last so focus still wraps from RESUME to QUIT TO MENU.
	_buttons = [%Resume, %Restart, exit_hub, %Quit]
	%Resume.pressed.connect(_on_resume_pressed)
	%Restart.pressed.connect(_on_restart_pressed)
	exit_hub.pressed.connect(_on_exit_hub_pressed)
	%Quit.pressed.connect(_on_quit_pressed)
	for i in _buttons.size():
		var button := _buttons[i]
		# Wrap around at both ends.
		button.focus_neighbor_top = button.get_path_to(_buttons[i - 1])
		button.focus_neighbor_bottom = button.get_path_to(_buttons[(i + 1) % _buttons.size()])
		button.mouse_entered.connect(_on_button_hovered.bind(button))
		button.focus_entered.connect(_on_button_focused)
	_refresh_key_hints()


func is_open() -> bool:
	return _open


func _process(_delta: float) -> void:
	if not _open:
		return
	if not SceneRouter.in_gameplay():
		_close()
		get_tree().paused = false
	elif not get_tree().paused:
		# Someone else unpaused (a scene change, a test reset): just hide.
		_close()


func _physics_process(_delta: float) -> void:
	if not _resume_pending:
		return
	# A jump pressed this frame would reach the player the moment it unpauses,
	# and a press that lands mid-frame only counts from the next frame, so
	# wait for two quiet physics frames in a row (about 33 ms).
	if Input.is_action_just_pressed(&"jump"):
		_quiet_frames = 0
	else:
		_quiet_frames += 1
	if _quiet_frames >= QUIET_FRAMES_TO_RESUME:
		_resume_pending = false
		_close()
		get_tree().paused = false


func _input(event: InputEvent) -> void:
	if event is InputEventKey:
		_last_device = "keyboard"
	elif event is InputEventJoypadButton \
			or (event is InputEventJoypadMotion and absf(event.axis_value) > 0.5):
		_last_device = "gamepad"
	elif event is InputEventScreenTouch:
		_last_device = "touch"


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"pause"):
		if _open and event.is_action(&"ui_accept"):
			# Enter is pause and accept: in the menu it chooses the focused
			# item (the button fires on release), it doesn't close the menu.
			get_viewport().set_input_as_handled()
			return
		if _open:
			request_resume()
			get_viewport().set_input_as_handled()
		elif SceneRouter.in_gameplay() and not get_tree().paused:
			open_menu()
			get_viewport().set_input_as_handled()
		return
	if not _open or _resume_pending:
		return
	# Arrow keys and the D-pad already move focus as ui_up/ui_down; this adds
	# WASD, and every jump key/button as "choose".
	if event.is_action_pressed(&"move_down"):
		_step_focus(1)
	elif event.is_action_pressed(&"move_up"):
		_step_focus(-1)
	elif event.is_action_pressed(&"jump") and not event.is_action(&"ui_accept"):
		# Space and pad A are ui_accept too: the focused button handles those.
		_focused_button().pressed.emit()
	else:
		return
	get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and pause_on_focus_loss:
		if not _open and SceneRouter.in_gameplay() and not get_tree().paused:
			open_menu()


## Pauses the game and shows the menu.
func open_menu() -> void:
	if _open:
		return
	_open = true
	_resume_pending = false
	get_tree().paused = true
	release_game_inputs()
	_refresh_key_hints()
	_refresh_device_columns()
	visible = true
	_quiet_focus = true
	_buttons[0].grab_focus()
	_quiet_focus = false
	Audio.play_sfx(&"pause")
	opened.emit()


## Closes the menu and unpauses once two physics frames in a row had no
## fresh jump press (see _physics_process).
func request_resume() -> void:
	if not _open or _resume_pending:
		return
	_resume_pending = true
	_quiet_frames = 0
	release_game_inputs()


static func release_game_inputs() -> void:
	for action in GAME_ACTIONS:
		Input.action_release(action)


func _close() -> void:
	_open = false
	_resume_pending = false
	visible = false
	if is_inside_tree():
		get_viewport().gui_release_focus()
	closed.emit()


func _on_resume_pressed() -> void:
	Audio.play_sfx(&"menu_select")
	request_resume()


func _on_restart_pressed() -> void:
	if not _open:
		return
	Audio.play_sfx(&"menu_select")
	release_game_inputs()
	_close()
	restart_stage()
	get_tree().paused = false
	Engine.time_scale = 1.0


func _on_quit_pressed() -> void:
	if not _open:
		return
	Audio.play_sfx(&"menu_select")
	release_game_inputs()
	_close()
	SceneRouter.go_title()
	get_tree().paused = false
	Engine.time_scale = 1.0


func _on_exit_hub_pressed() -> void:
	if not _open:
		return
	Audio.play_sfx(&"menu_select")
	release_game_inputs()
	_close()
	get_tree().paused = false
	Engine.time_scale = 1.0
	HubBridge.exit_to_hub()


## Restarts the current stage from its checkpoint without taking a life;
## playgrounds reload (SceneRouter.restart()).
func restart_stage() -> void:
	SceneRouter.restart()


func _focused_button() -> Button:
	var focused := get_viewport().gui_get_focus_owner() as Button
	return focused if focused != null and focused in _buttons else _buttons[0]


func _step_focus(step: int) -> void:
	var index := _buttons.find(_focused_button())
	_buttons[(index + step + _buttons.size()) % _buttons.size()].grab_focus()


func _on_button_hovered(button: Button) -> void:
	if _open and not button.has_focus():
		button.grab_focus()


func _on_button_focused() -> void:
	if _open and not _quiet_focus:
		Audio.play_sfx(&"menu_move")


## Keyboard column of the controls table, named for the current layout.
func _refresh_key_hints() -> void:
	_grid_cell(1, 1).text = InputHints.move_keys()
	_grid_cell(2, 1).text = InputHints.action_keys(&"jump")
	_grid_cell(3, 1).text = InputHints.action_keys(&"pause", " / ")


func _grid_cell(row: int, column: int) -> Label:
	return _grid.get_child(row * _grid.columns + column) as Label


## Highlights the controls column for the device the player last used.
func _refresh_device_columns() -> void:
	var active: int = DEVICE_COLUMNS.get(_last_device, 1)
	for column in range(1, _grid.columns):
		var header := _grid_cell(0, column)
		header.add_theme_color_override(&"font_color", HEADER_ACTIVE if column == active else HEADER_IDLE)
