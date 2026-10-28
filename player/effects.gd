class_name Effects
extends RefCounted
## Small feel effects drawn as simple pixel shapes (sprite frames can replace
## them later): dust puffs and ticket sparkles. Purely visual: they never
## read input or touch physics. Anyone may call the helpers, for example a
## placed ticket: `Effects.ticket_sparkle(global_position, get_parent())`.

## Master switch (tests compare trajectories with effects on and off).
static var enabled := true

const DUST := Color(0.94, 0.9, 0.82)
const DUST_SHADE := Color(0.72, 0.66, 0.58)
const SPARKLE := Color(1.0, 0.95, 0.55)
const SPARKLE_CORE := Color(1, 1, 1)


## A few dust puffs at `at` (world), drifting along `direction` (-1, 0 or 1).
static func dust(parent: Node, at: Vector2, direction := 0.0, count := 3, size := 1.0) -> void:
	if not enabled:
		return
	for i in count:
		var puff := Puff.new()
		var spread := (float(i) - (count - 1) / 2.0)
		puff.velocity = Vector2(direction * (0.6 + 0.3 * i) + spread * 0.35, -0.25 - 0.1 * i)
		puff.radius = (1.5 + 0.5 * (i % 2)) * size
		_spawn(parent, puff, at + Vector2(spread * 3.0, 0.0))


## A burst of sparkles where a ticket was collected (world position).
static func ticket_sparkle(at: Vector2, parent: Node = null) -> void:
	if not enabled:
		return
	_spawn(parent, Sparkle.new(), at)


static func _spawn(parent: Node, node: Node2D, at: Vector2) -> void:
	if parent == null:
		var tree := Engine.get_main_loop() as SceneTree
		if tree == null:
			return
		parent = tree.current_scene if tree.current_scene != null else tree.root
	node.top_level = true
	node.position = at
	node.z_index = 5
	parent.add_child.call_deferred(node)


## A dust puff: grows, drifts and fades out.
class Puff:
	extends Node2D
	const LIFE := 18
	var velocity := Vector2.ZERO
	var radius := 2.0
	var _age := 0

	func _physics_process(_delta: float) -> void:
		_age += 1
		position += velocity
		velocity *= 0.9
		if _age >= LIFE:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var t := float(_age) / LIFE
		var r := radius * (1.0 + t * 1.5)
		var alpha := 1.0 - t
		draw_circle(Vector2(0.5, 0.5), r, Color(DUST_SHADE, alpha * 0.8))
		draw_circle(Vector2(-0.5, -0.5), r * 0.75, Color(DUST, alpha))


## A ticket sparkle: a twinkling star with four flying glints.
class Sparkle:
	extends Node2D
	const LIFE := 20
	var _age := 0

	func _physics_process(_delta: float) -> void:
		_age += 1
		if _age >= LIFE:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var t := float(_age) / LIFE
		var arm := 6.0 * sin(t * PI)
		draw_line(Vector2(-arm, 0), Vector2(arm, 0), SPARKLE, 1.0)
		draw_line(Vector2(0, -arm), Vector2(0, arm), SPARKLE, 1.0)
		draw_rect(Rect2(-1, -1, 2, 2), SPARKLE_CORE)
		var reach := 3.0 + t * 10.0
		for i in 4:
			var dir := Vector2.from_angle(PI / 4.0 + i * PI / 2.0)
			draw_rect(Rect2((dir * reach).round() - Vector2(0.5, 0.5), Vector2(1.5, 1.5)), Color(SPARKLE, 1.0 - t))
