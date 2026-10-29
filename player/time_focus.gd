extends Node
## Duelist cape Time Focus. 0.5 time scale for 3 seconds of real time, once
## per level. Paused time does not count. Restored when the window ends, on
## death, and on scene change. The use refills on level start only
## (GameState.level_started), not on checkpoint respawn.
##
## Runs while the tree is paused so a pause freezes the window and puts
## Engine.time_scale back to 1 until the game resumes.


const SCALE := 0.5
const DURATION_MSEC := 3000
const USES_PER_LEVEL := 1

var _uses_left := USES_PER_LEVEL
var _active := false
var _deadline_msec := 0
var _paused_at := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not GameState.level_started.is_connected(_on_level_started):
		GameState.level_started.connect(_on_level_started)


func try_start() -> bool:
	if _active or _uses_left <= 0:
		return false
	if get_tree().paused or not SceneRouter.in_gameplay():
		return false
	if not bool(RelicLoadout.resolve().get("time_focus", false)):
		return false
	_uses_left -= 1
	_active = true
	_paused_at = 0
	_deadline_msec = Time.get_ticks_msec() + DURATION_MSEC
	# Record the request. Pause uses get_tree().paused, so the scale is applied here.
	HubBridge.begin_time_focus(SCALE, DURATION_MSEC / 1000.0)
	Engine.time_scale = SCALE
	return true


## Ends slow motion and restores time scale. Does not refill the use.
func restore() -> void:
	var was := _active
	_active = false
	_paused_at = 0
	if was:
		Engine.time_scale = 1.0


func _on_level_started(_zone_id: String, _act: int) -> void:
	_uses_left = USES_PER_LEVEL
	restore()


func _process(_delta: float) -> void:
	if not _active:
		return
	if not SceneRouter.in_gameplay():
		restore()
		return
	if get_tree().paused:
		if _paused_at == 0:
			_paused_at = Time.get_ticks_msec()
		if Engine.time_scale != 1.0:
			Engine.time_scale = 1.0
		return
	if _paused_at != 0:
		_deadline_msec += Time.get_ticks_msec() - _paused_at
		_paused_at = 0
	if Time.get_ticks_msec() >= _deadline_msec:
		restore()
		return
	if not is_equal_approx(Engine.time_scale, SCALE):
		Engine.time_scale = SCALE
