extends StaticBody2D
## A minimal conveyor for the physics playground and tests (docs/CONTRACTS.md,
## "Moving terrain"): solid terrain with the meta `conveyor_speed` (px/frame,
## + = right). The origin is the top-left corner.

@export var size := Vector2(160.0, 8.0)
## px/frame, + = right.
@export var speed := 2.0:
	set(value):
		speed = value
		set_meta(&"conveyor_speed", value)
@export var color := Color(0.35, 0.38, 0.45)

const STRIPE := 12.0

var _scroll := 0.0


func _ready() -> void:
	set_meta(&"conveyor_speed", speed)
	collision_layer = Layers.TERRAIN_SOLID
	collision_mask = 0
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	shape.position = size / 2.0
	add_child(shape)


func _process(delta: float) -> void:
	_scroll = fposmod(_scroll + speed * delta * PhysicsConstants.FPS, STRIPE)
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), color)
	# Chevrons pointing the way it carries, scrolling at its speed.
	var dir := 1.0 if speed >= 0.0 else -1.0
	var x := _scroll - STRIPE
	while x < size.x:
		var tip := x + dir * 3.0
		if x >= 0.0 and tip <= size.x and tip >= 0.0:
			draw_polyline(PackedVector2Array([Vector2(x, 1.5), Vector2(tip, size.y / 2.0),
					Vector2(x, size.y - 1.5)]), color.lightened(0.45), 1.0)
		x += STRIPE
