extends PlayerArea
## A pellet fired by a pellet pill: rolls slowly along the ground in a
## straight line, following the floor, and pops at walls, ledges or after
## LIFETIME frames. Touching it hurts Sproto, unless he is attacking (jumping
## or rolling), which pops it harmlessly. Not an enemy: no score.
## Layer 8 (hazards), mask 5 (player).

const LIFETIME := 300
const RADIUS := 4.0
## Floats this far above the floor.
const HEIGHT := 6.0
const TERRAIN_MASK := Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY

## -1 left, 1 right; px/frame (set by the pill, already difficulty-scaled).
var direction := -1
var speed := 2.0

var _age := 0
var _done := false


func _ready() -> void:
	collision_layer = LAYER_HAZARDS
	monitorable = true
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = RADIUS
	shape.shape = circle
	add_child(shape)
	add_to_group(&"pellets")


func _physics_process(_delta: float) -> void:
	if _done:
		return
	_age += 1
	for player in players_inside():
		if player.state == &"dead":
			continue
		if not player.is_attacking():
			player.hurt(global_position)
		pop()
		return
	var step := direction * speed
	var wall := _ray(global_position, global_position + Vector2(signf(step) * (RADIUS + absf(step)), 0.0))
	var floor_hit := _ray(global_position + Vector2(step, -8.0), global_position + Vector2(step, HEIGHT + 12.0))
	if _age >= LIFETIME or not wall.is_empty() or floor_hit.is_empty():
		pop()
		return
	global_position = Vector2(global_position.x + step, floor_hit.position.y - HEIGHT)
	queue_redraw()


func pop() -> void:
	if _done:
		return
	_done = true
	set_deferred(&"monitoring", false)
	set_deferred(&"monitorable", false)
	queue_free()


func _ray(from: Vector2, to: Vector2) -> Dictionary:
	var query := PhysicsRayQueryParameters2D.create(from, to, TERRAIN_MASK)
	query.hit_from_inside = false
	return get_world_2d().direct_space_state.intersect_ray(query)


func _draw() -> void:
	draw_circle(Vector2.ZERO, RADIUS + 1.0, PillArt.OUTLINE)
	draw_circle(Vector2.ZERO, RADIUS, PillArt.SPIKE)
	draw_circle(Vector2(-1.0, -1.0), 1.5, PillArt.FLASH)
