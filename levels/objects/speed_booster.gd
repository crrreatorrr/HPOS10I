class_name SpeedBooster
extends PlayerArea
## A pad on the floor that shoots Sproto along in its facing direction:
## player.push_ground(facing * speed, LOCK_FRAMES), at SPEED px/frame or the
## speed he already had in that direction, whichever is higher. Plays
## `booster`. It only acts on a grounded player (jumping over it does
## nothing; landing on it counts). Running into it from the wrong side turns
## him around at SPEED. Fires once per visit: he has to leave the pad before
## it can fire again. The origin is the middle of the pad, on the floor.
## Layer 7 (objects), mask 5 (player).

const SPEED := 12.0
const LOCK_FRAMES := 16
const WIDTH := 32.0

const OUTLINE := Color(0.1, 0.1, 0.16)
const PLATE := Color(0.24, 0.27, 0.38)
const PLATE_LIGHT := Color(0.4, 0.44, 0.58)
const ARROW := Color(1.0, 0.86, 0.18)
const ARROW_DIM := Color(0.62, 0.48, 0.1)

## 1 boosts right, -1 left.
@export_enum("Left:-1", "Right:1") var facing := 1:
	set(value):
		facing = -1 if value < 0 else 1
		queue_redraw()

var _boosted := {}  # player instance id -> true while still on the pad


func _ready() -> void:
	collision_layer = LAYER_OBJECTS
	monitorable = false
	player_exited.connect(func(player: Player) -> void: _boosted.erase(player.get_instance_id()))


func _physics_process(_delta: float) -> void:
	queue_redraw()
	for player in players_inside():
		var id := player.get_instance_id()
		if _boosted.has(id) or not player.grounded or player.state == &"dead":
			continue
		_boosted[id] = true
		boost(player)


func boost(player: Player) -> void:
	var speed := maxf(SPEED, player.ground_speed * facing)
	player.push_ground(facing * speed, LOCK_FRAMES)
	Audio.play_sfx(&"booster")


func _draw() -> void:
	var half := WIDTH / 2.0
	draw_rect(Rect2(-half, -6, WIDTH, 6), OUTLINE)
	draw_rect(Rect2(-half + 1, -5, WIDTH - 2, 4), PLATE)
	draw_rect(Rect2(-half + 1, -5, WIDTH - 2, 1), PLATE_LIGHT)
	# Three chevrons; the lit one runs in the boost direction.
	var lit := int(Engine.get_physics_frames() / 6) % 3
	for i in 3:
		var x := (-8.0 + i * 8.0) * facing
		var color := ARROW if (i if facing > 0 else 2 - i) == lit else ARROW_DIM
		var tip := Vector2(x + 3.0 * facing, -3.5)
		draw_line(Vector2(x - 2.0 * facing, -6.5), tip, color, 2.0)
		draw_line(tip, Vector2(x - 2.0 * facing, -0.5), color, 2.0)
