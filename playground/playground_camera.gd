extends Camera2D
## Temporary follow camera for the physics sandbox (the real GameCamera is a
## separate task). Follows the first node in group `player` with a little
## look-ahead in the direction of motion.

const LOOK_AHEAD := 0.12  # seconds of horizontal motion
const LOOK_AHEAD_MAX := 64.0

var _target: Node2D


func _ready() -> void:
	position_smoothing_enabled = true
	position_smoothing_speed = 8.0
	make_current()


func _physics_process(_delta: float) -> void:
	if _target == null or not is_instance_valid(_target):
		_target = get_tree().get_first_node_in_group(&"player") as Node2D
		if _target == null:
			return
		global_position = _target.global_position
		reset_smoothing()
	var ahead := 0.0
	if _target is Player and (_target as Player).state != &"dead":
		var vx := (_target as Player).velocity.x * PhysicsConstants.FPS
		ahead = clampf(vx * LOOK_AHEAD, -LOOK_AHEAD_MAX, LOOK_AHEAD_MAX)
	global_position = _target.global_position + Vector2(ahead, -16.0)
