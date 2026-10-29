extends "res://core/hub_bridge.gd"
## Stand-in for window.hubSdk. Records every hub call and leaves the promise
## unfinished until the test replies, so a case can lose a response, fail the
## transport, or return a chosen payload. Not a test itself (the runner only
## loads test_*.gd).


## Each entry is {method, args, done}. args are the SDK arguments in order.
var sdk_calls: Array = []
## _read_session() result. A re-init resends pending writes only when this is set.
var session_on := true


func _ready() -> void:
	_save.load_all()
	if not GameState.level_started.is_connected(_on_level_started):
		GameState.level_started.connect(_on_level_started)
	if not GameState.level_completed.is_connected(_on_level_completed):
		GameState.level_completed.connect(_on_level_completed)


func _read_session() -> bool:
	return session_on


## Replaces the JavaScriptBridge path. The call is stored; nothing is credited
## until the test invokes `done`.
func _invoke(method: String, args: Array, done: Callable) -> void:
	sdk_calls.append({
		"method": method,
		"args": args.duplicate(true),
		"done": done,
	})
