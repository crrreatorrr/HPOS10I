extends Enemy
## Walker pill robot (tier 1): a mint/white capsule lying on its side on two
## wheels. It rolls along the floor (following gentle slopes) and turns
## around at walls, at ledges (it never drives off one) and, if set, at the
## ends of its patrol range. Spawned in the air, it drops to the floor first.
## Its speed scales with the act's difficulty.

const HALF_LENGTH := 7.0
const RADIUS := 7.0
const WHEEL := 3.0
const BODY_Y := -13.0
## Half the body length, for wall and ledge probes.
const HALF_WIDTH := 14.0

## Patrol speed at difficulty 1, px/frame.
@export var speed := 0.75
## Turns this far (px) either side of its start point; 0 = only at walls and ledges.
@export var patrol_distance := 0.0
@export_enum("Left:-1", "Right:1") var direction := -1

var _home_x := 0.0
var _roll := 0.0


func _ready() -> void:
	_home_x = global_position.x
	direction = -1 if direction < 0 else 1


func _enemy_physics(_delta: float) -> void:
	queue_redraw()
	if not grounded:
		gravity_step()
		return
	var step := move_speed(speed) * direction
	if _blocked(step):
		direction = -direction
		step = -step
		if _blocked(step):
			return  # boxed in: wait
	global_position.x += step
	_roll += step
	var floor_y := floor_below(0.0, 8.0, 12.0)
	if floor_y == INF:
		grounded = false
	else:
		global_position.y = floor_y


func _blocked(step: float) -> bool:
	var dir := int(signf(step))
	if wall_ahead(dir, HALF_WIDTH + absf(step) + 1.0, 6.0):
		return true
	if floor_below(dir * (HALF_WIDTH - 2.0) + step, 8.0, 20.0) == INF:
		return true  # ledge ahead
	return patrol_distance > 0.0 and (global_position.x + step - _home_x) * dir > patrol_distance


func _pop() -> void:
	LevelFx.pill_pop(get_parent(), global_position + Vector2(0.0, BODY_Y), Vector2.RIGHT,
			HALF_LENGTH, RADIUS, PillArt.WHITE if direction > 0 else PillArt.MINT,
			PillArt.MINT if direction > 0 else PillArt.WHITE, PillArt.OUTLINE)


func _draw() -> void:
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(direction, 1.0))
	# Wheels with spokes that turn as it rolls.
	for x in [-HALF_LENGTH, HALF_LENGTH]:
		var hub := Vector2(x, -WHEEL)
		draw_circle(hub, WHEEL + 1.0, PillArt.OUTLINE)
		draw_circle(hub, WHEEL, PillArt.METAL_DARK)
		var spoke := Vector2.from_angle(_roll / WHEEL * direction) * (WHEEL - 0.5)
		draw_line(hub - spoke, hub + spoke, PillArt.METAL, 1.0)
	# Body, facing its direction of travel (mint half in front).
	draw_set_transform(Vector2(0.0, BODY_Y), 0.0, Vector2(direction, 1.0))
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1)
	PillArt.draw_visor(self, Vector2(HALF_LENGTH + 2.0, -1.5), 6.0, 2)
	PillArt.draw_antenna(self, Vector2(-HALF_LENGTH + 1.0, -RADIUS - 1.0), 5.0, sin(_roll * 0.3) * 1.5)
	draw_set_transform(Vector2.ZERO)
