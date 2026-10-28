extends Node
## Holds the live PhysicsConstants. Read Tuning.physics every frame instead of
## caching it, so edits to the .tres show up while the game runs.

const PATH := "res://core/physics_constants.tres"
const POLL_SECONDS := 0.5

signal physics_reloaded

var physics: PhysicsConstants

var _mtime := 0
var _poll := 0.0


func _ready() -> void:
	physics = load(PATH)
	_mtime = FileAccess.get_modified_time(PATH)
	# Exported builds read from the .pck, so there is nothing to watch.
	set_process(OS.is_debug_build() and OS.has_feature("editor"))


func _process(delta: float) -> void:
	_poll += delta
	if _poll < POLL_SECONDS:
		return
	_poll = 0.0
	var mtime := FileAccess.get_modified_time(PATH)
	if mtime != _mtime:
		_mtime = mtime
		var reloaded = ResourceLoader.load(PATH, "", ResourceLoader.CACHE_MODE_IGNORE)
		if reloaded is PhysicsConstants:
			physics = reloaded
			physics_reloaded.emit()
			print("[Tuning] physics constants reloaded")
		else:
			# Mid-save or broken file: keep playing with the previous values.
			push_warning("[Tuning] reload failed, keeping previous constants")
