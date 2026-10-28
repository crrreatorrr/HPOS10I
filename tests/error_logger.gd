class_name TestErrorLogger
extends Logger
## Collects engine and script errors raised while a test runs, so a test that
## crashes (for example a method call on null) fails instead of passing.
## Logger callbacks can arrive from any thread, so access is mutex-guarded.
## Owned by the lead.

var _mutex := Mutex.new()
var _errors := PackedStringArray()


func _log_error(_function: String, file: String, line: int, code: String, rationale: String,
		_editor_notify: bool, error_type: int, _script_backtraces: Array[ScriptBacktrace]) -> void:
	if error_type == ERROR_TYPE_WARNING:
		return
	var what := rationale if rationale != "" else code
	_mutex.lock()
	_errors.append("%s:%d %s" % [file.get_file(), line, what])
	_mutex.unlock()


func _log_message(_message: String, _error: bool) -> void:
	pass


## Returns the errors collected so far and starts a fresh list.
func take() -> PackedStringArray:
	_mutex.lock()
	var collected := _errors
	_errors = PackedStringArray()
	_mutex.unlock()
	return collected
