class_name GameHud
extends CanvasLayer
## In-level HUD, added by LevelRoot: SCORE, TIME and TICKETS top-left in the
## classic chunky gold labels, lives bottom-left with Sproto's head.
##
## Data comes only from GameState: its tickets/score/lives signals, and
## GameState.level_time for the clock (it has no signal; read every frame).
## At 0 tickets the TICKETS counter flashes red: the next hit costs a life.
## In touch mode the lives box moves under the counters so the on-screen pad
## does not cover it (and back when the player switches to keys/gamepad).

## Seconds per on/off cycle of the 0-ticket warning flash.
const FLASH_PERIOD := 0.5
const WARNING_COLOR := Color(1.0, 0.24, 0.2)
const MAX_SCORE_SHOWN := 9_999_999
const MAX_LIVES_SHOWN := 99
## Where the lives box goes when the touch pad sits in the bottom-left corner.
const TOUCH_LIVES_POSITION := Vector2(3, 44)

@onready var _score_value: Label = %ScoreValue
@onready var _time_value: Label = %TimeValue
@onready var _tickets_label: Label = %TicketsLabel
@onready var _tickets_value: Label = %TicketsValue
@onready var _ticket_icon: TextureRect = %TicketIcon
@onready var _lives_value: Label = %LivesValue
@onready var _lives_box: Control = %Lives

var _desktop_lives_position := Vector2.ZERO
var _shown_seconds := -1
var _flash_clock := 0.0


func _ready() -> void:
	_ticket_icon.texture = PixelArt.ticket()
	(%Head as TextureRect).texture = PixelArt.sproto_head()
	_desktop_lives_position = _lives_box.position
	_place_lives_box(TouchControls.is_enabled())
	Display.touch_mode_changed.connect(_place_lives_box)
	GameState.tickets_changed.connect(_on_tickets_changed)
	GameState.score_changed.connect(_on_score_changed)
	GameState.lives_changed.connect(_on_lives_changed)
	_on_tickets_changed(GameState.tickets)
	_on_score_changed(GameState.score)
	_on_lives_changed(GameState.lives)
	_update_time()


func _process(delta: float) -> void:
	_update_time()
	_flash_clock = fmod(_flash_clock + delta, FLASH_PERIOD)
	_update_warning()


## "m:ss". Minutes keep counting past 9 (10:00, 11:30, ...).
static func format_time(seconds: float) -> String:
	var total := maxi(0, floori(seconds))
	return "%d:%02d" % [floori(total / 60.0), total % 60]


static func format_score(score: int) -> String:
	return str(clampi(score, 0, MAX_SCORE_SHOWN))


static func format_lives(lives: int) -> String:
	return "x %d" % clampi(lives, 0, MAX_LIVES_SHOWN)


## True while the TICKETS counter is drawn in the warning colour.
func is_warning_lit() -> bool:
	return _tickets_label.modulate == WARNING_COLOR


func _place_lives_box(touch: bool) -> void:
	_lives_box.position = TOUCH_LIVES_POSITION if touch else _desktop_lives_position


func _update_time() -> void:
	var seconds := floori(GameState.level_time)
	if seconds != _shown_seconds:
		_shown_seconds = seconds
		_time_value.text = format_time(GameState.level_time)


func _update_warning() -> void:
	var lit := GameState.tickets == 0 and _flash_clock < FLASH_PERIOD * 0.5
	var color := WARNING_COLOR if lit else Color.WHITE
	_tickets_label.modulate = color
	_tickets_value.modulate = color


func _on_tickets_changed(value: int) -> void:
	_tickets_value.text = str(value)
	if value == 0:
		_flash_clock = 0.0  # light up at once, then blink
	_update_warning()


func _on_score_changed(value: int) -> void:
	_score_value.text = format_score(value)


func _on_lives_changed(value: int) -> void:
	_lives_value.text = format_lives(value)
