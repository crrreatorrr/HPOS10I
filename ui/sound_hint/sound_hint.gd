class_name SoundHint
extends CanvasLayer
## Web only: a small line at the bottom of the screen while audio is still
## locked and the player is on a gamepad (browsers only unlock audio on a
## key, click or tap). The Audio autoload adds it on the web; it frees itself
## once audio unlocks. Sits bottom-centre, clear of the HUD corners, and under
## the pause menu.


func _ready() -> void:
	visible = Audio.needs_unlock_hint()
	Audio.unlock_hint_changed.connect(_on_unlock_hint_changed)


func _on_unlock_hint_changed(show: bool) -> void:
	visible = show
	if not show and not Audio.is_locked():
		queue_free()
