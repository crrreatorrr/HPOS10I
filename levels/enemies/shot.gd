extends PlayerArea
## A sniper's shot: a bolt flying in a straight line at `velocity`
## (px/frame, set before it is added). It pops on terrain, off screen or
## after LIFETIME frames. Touching it hurts Sproto unless he is attacking
## (jumping or rolling), which pops it harmlessly. Not an enemy: no score.
## Layer 8 (hazards), mask 5 (player).

const LIFETIME := 180
const TERRAIN_MASK := Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY

var velocity := Vector2.RIGHT * 4.0

var _age := 0
var _done := false


func _ready() -> void:
	collision_layer = LAYER_HAZARDS
	monitorable = true
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 3.0
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
	var next := global_position + velocity
	var query := PhysicsRayQueryParameters2D.create(global_position, next + velocity.normalized() * 3.0, TERRAIN_MASK)
	var hit := get_world_2d().direct_space_state.intersect_ray(query)
	if _age >= LIFETIME or not hit.is_empty() or not _on_screen():
		pop()
		return
	global_position = next
	queue_redraw()


func pop() -> void:
	if _done:
		return
	_done = true
	set_deferred(&"monitoring", false)
	set_deferred(&"monitorable", false)
	queue_free()


func _on_screen() -> bool:
	var viewport := get_viewport()
	if viewport.get_camera_2d() == null:
		return true
	var view := viewport.get_canvas_transform().affine_inverse() * viewport.get_visible_rect()
	return view.grow(32.0).has_point(global_position)


func _draw() -> void:
	var dir := velocity.normalized()
	draw_line(-dir * 8.0, dir * 3.0, PillArt.OUTLINE, 4.0)
	draw_line(-dir * 7.0, dir * 2.0, PillArt.SPIKE, 2.0)
	draw_circle(dir * 2.0, 2.0, PillArt.FLASH)
