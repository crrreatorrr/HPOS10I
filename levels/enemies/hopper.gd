extends Enemy
## Hopper pill robot (tier 1): a mint/white capsule standing upright on a
## coiled spring foot. It hops straight up in place on a timer. Before each
## hop it crouches for a telegraph, and it squashes when it lands. The hop
## interval and the telegraph scale with the act's difficulty.

const HALF_LENGTH := 5.0
const RADIUS := 7.0
## Spring foot length at rest, crouched and stretched.
const SPRING_REST := 7.0
const SPRING_CROUCH := 4.0
const SPRING_STRETCH := 11.0
const LAND_FRAMES := 8
## Crouch before a hop (seconds at difficulty 1).
const TELEGRAPH := 0.4

## Frames on the floor between hops, at difficulty 1.
@export var hop_interval := 80
## Take-off speed, px/frame (4.5 hops about 46 px high).
@export var hop_speed := 4.5
## Frames before the first hop (to stagger several hoppers).
@export var first_hop_delay := 40

var _timer := 0
var _landed := LAND_FRAMES


func _ready() -> void:
	_timer = interval_frames(hop_interval) - first_hop_delay


func _enemy_physics(_delta: float) -> void:
	queue_redraw()
	if not grounded:
		gravity_step()
		if grounded:
			_landed = 0
		return
	_landed += 1
	_timer += 1
	if _timer >= interval_frames(hop_interval):
		_timer = 0
		fall_speed = -hop_speed
		grounded = false
		global_position.y += fall_speed


## True while crouching before a hop.
func is_telegraphing() -> bool:
	return grounded and _timer > interval_frames(hop_interval) - telegraph_frames(TELEGRAPH)


func _spring_length() -> float:
	if not grounded:
		return SPRING_STRETCH if fall_speed < 0.0 else lerpf(SPRING_STRETCH, SPRING_REST, clampf(fall_speed / 3.0, 0.0, 1.0))
	if _landed < LAND_FRAMES or is_telegraphing():
		return SPRING_CROUCH
	return SPRING_REST


func _body_centre() -> Vector2:
	return Vector2(0.0, -_spring_length() - HALF_LENGTH - RADIUS)


func _pop() -> void:
	LevelFx.pill_pop(get_parent(), global_position + _body_centre(), Vector2.UP,
			HALF_LENGTH, RADIUS, PillArt.WHITE, PillArt.MINT, PillArt.OUTLINE)


func _draw() -> void:
	var length := _spring_length()
	# Coiled spring foot on a small base plate.
	draw_rect(Rect2(-6, -2, 12, 2), PillArt.OUTLINE)
	var coils := 3
	for k in coils:
		var y0 := -2.0 - (length - 2.0) * k / coils
		var y1 := -2.0 - (length - 2.0) * (k + 1) / coils
		draw_line(Vector2(-4, y0), Vector2(4, (y0 + y1) / 2.0), PillArt.METAL_DARK, 2.0)
		draw_line(Vector2(4, (y0 + y1) / 2.0), Vector2(-4, y1), PillArt.METAL, 2.0)
	# Upright capsule: mint half on top.
	var centre := _body_centre()
	draw_set_transform(centre, -PI * 0.5, Vector2.ONE)
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1)
	draw_set_transform(Vector2.ZERO)
	var blink := not is_telegraphing() and (Engine.get_physics_frames() / 7) % 23 == 0
	PillArt.draw_visor(self, centre + Vector2(0.0, -HALF_LENGTH - 1.0), 9.0, 2, blink)
	PillArt.draw_antenna(self, centre + Vector2(0.0, -HALF_LENGTH - RADIUS - 1.0), 4.0)
