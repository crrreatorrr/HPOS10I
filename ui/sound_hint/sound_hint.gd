class_name SoundHint
extends CanvasLayer
## Web only: a short toast while audio is still locked and the player is on a
## gamepad (browsers only unlock audio on a key, click or tap). Each gamepad
## press shows it for SHOW_SECONDS, then it fades; it frees itself once audio
## unlocks. The Audio autoload adds it on the web (and with `-- --sound_hint`).
##
## Placed top-centre, right of the HUD counters and left of the corner
## widgets (the playground's ticket count, the touch pause button), in a band
## that is empty in every gameplay scene; under the pause menu.

const SHOW_SECONDS := 4.0
const FADE_SECONDS := 0.6

var _time_left := 0.0

@onready var _root: Control = $Root


func _ready() -> void:
	visible = false
	Audio.unlock_hint_changed.connect(_on_unlock_hint_changed)
	if Audio.needs_unlock_hint():
		show_hint()


func show_hint() -> void:
	_time_left = SHOW_SECONDS
	_root.modulate.a = 1.0
	visible = true


func _process(delta: float) -> void:
	if not visible:
		return
	_time_left -= delta
	if _time_left <= 0.0:
		visible = false
	else:
		_root.modulate.a = clampf(_time_left / FADE_SECONDS, 0.0, 1.0)


func _on_unlock_hint_changed(show: bool) -> void:
	if show:
		show_hint()
	elif not Audio.is_locked():
		queue_free()
