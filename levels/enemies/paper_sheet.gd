extends PlayerArea
## A sheet of paper thrown by a clerk pill: flies in an arc under gravity
## towards where Sproto stood when the throw was telegraphed, drifting a
## little, and pops on terrain, off screen or after LIFETIME frames.
## Touching it hurts Sproto unless he is attacking (jumping or rolling),
## which pops it harmlessly. Not an enemy: no score. Layer 8 (hazards),
## mask 5 (player).

const LIFETIME := 240
const GRAVITY := 0.14
const TERRAIN_MASK := Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY
const PAPER := Color(0.97, 0.97, 0.95)
const PAPER_SHADE := Color(0.78, 0.8, 0.86)
const INK := Color(0.3, 0.34, 0.5)

## Set by the clerk before it is added, px/frame.
var velocity := Vector2.ZERO

var _age := 0
var _done := false
var _spin := 0.0


func _ready() -> void:
	collision_layer = LAYER_HAZARDS
	monitorable = true
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 5.0
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
	velocity.y += GRAVITY
	var next := global_position + velocity
	var query := PhysicsRayQueryParameters2D.create(global_position, next + velocity.normalized() * 4.0, TERRAIN_MASK)
	var hit := get_world_2d().direct_space_state.intersect_ray(query)
	if _age >= LIFETIME or not hit.is_empty() or not _on_screen():
		pop()
		return
	global_position = next
	_spin += 0.15
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
	draw_set_transform(Vector2.ZERO, sin(_spin) * 0.6, Vector2.ONE)
	draw_rect(Rect2(-5.0, -6.0, 10.0, 12.0), PillArt.OUTLINE)
	draw_rect(Rect2(-4.0, -5.0, 8.0, 10.0), PAPER)
	draw_rect(Rect2(2.0, -5.0, 2.0, 10.0), PAPER_SHADE)
	for k in 3:
		draw_line(Vector2(-2.5, -2.5 + k * 2.5), Vector2(1.5, -2.5 + k * 2.5), INK, 1.0)
	draw_set_transform(Vector2.ZERO)
