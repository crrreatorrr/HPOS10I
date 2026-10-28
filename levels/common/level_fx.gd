class_name LevelFx
extends RefCounted
## Short-lived visual effects for level objects, drawn in code: the ticket
## sparkle, rock debris and the pill-robot pop (two capsule halves and a puff).
## They never collide with anything. Spawned deferred, so callers may use them
## from physics callbacks.

const PHYSICS_EFFECTS := "res://player/effects.gd"


## Golden sparkle where a ticket was picked up. Uses the physics agent's
## shared sparkle helper (player/effects.gd) when it has one this can call.
static func ticket_sparkle(parent: Node, at: Vector2) -> void:
	if parent == null:
		return
	if _shared_sparkle(parent, at):
		return
	_add(parent, Sparkle.new(), at)


## Bits of a broken wall flying apart from `rect` (global).
static func debris(parent: Node, rect: Rect2, color: Color, dark: Color, count := 8) -> void:
	if parent == null:
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(rect.position)
	for i in count:
		var piece := Debris.new()
		piece.color = color if i % 2 == 0 else color.lerp(dark, 0.4)
		piece.outline = dark
		piece.size = Vector2(rng.randf_range(5.0, 9.0), rng.randf_range(4.0, 8.0))
		var side := -1.0 if i % 2 == 0 else 1.0
		piece.velocity = Vector2(side * rng.randf_range(1.0, 3.5), rng.randf_range(-5.0, -2.0))
		piece.spin = rng.randf_range(-0.3, 0.3)
		var at := rect.position + Vector2(rng.randf() * rect.size.x, rng.randf() * rect.size.y)
		_add(parent, piece, at)


## A pill robot popping open: two capsule halves flying apart and a puff.
## `axis` is the capsule's long axis (global, unit length).
static func pill_pop(parent: Node, at: Vector2, axis: Vector2, half_length: float, radius: float,
		color_a: Color, color_b: Color, outline: Color) -> void:
	if parent == null:
		return
	var pop := PillPop.new()
	pop.axis = axis
	pop.half_length = half_length
	pop.radius = radius
	pop.color_a = color_a
	pop.color_b = color_b
	pop.outline = outline
	_add(parent, pop, at)


static func _add(parent: Node, node: Node2D, at: Vector2) -> void:
	node.top_level = true
	node.z_index = 20
	node.position = at
	parent.add_child.call_deferred(node)


static func _shared_sparkle(parent: Node, at: Vector2) -> bool:
	if not ResourceLoader.exists(PHYSICS_EFFECTS):
		return false
	var script := load(PHYSICS_EFFECTS) as Script
	if script == null or not script.can_instantiate():
		return false
	for method in script.get_script_method_list():
		if not String(method.name).contains("sparkle") or not (int(method.flags) & METHOD_FLAG_STATIC):
			continue
		var args: Array = method.args
		var required: int = args.size() - method.default_args.size()
		# (parent: Node, position: Vector2, ...) or (position: Vector2, ...).
		if required <= 2 and args.size() >= 2 and int(args[0].type) == TYPE_OBJECT and int(args[1].type) == TYPE_VECTOR2:
			script.callv(method.name, [parent, at])
			return true
		if required <= 1 and args.size() >= 1 and int(args[0].type) == TYPE_VECTOR2:
			script.callv(method.name, [at])
			return true
	return false


## Four-pointed golden twinkle that grows and fades.
class Sparkle:
	extends Node2D
	const FRAMES := 18
	var _age := 0

	func _physics_process(_delta: float) -> void:
		_age += 1
		if _age >= FRAMES:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var t := float(_age) / FRAMES
		var r := 3.0 + 7.0 * t
		var color := Color(1.0, 0.95, 0.6, 1.0 - t)
		var core := Color(1.0, 1.0, 1.0, 1.0 - t)
		for dir in [Vector2.UP, Vector2.RIGHT, Vector2.DOWN, Vector2.LEFT]:
			draw_line(dir * 1.5, dir * r, color, 1.0)
		for dir in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			draw_line(dir * 1.5, dir * r * 0.45, color, 1.0)
		draw_rect(Rect2(-1, -1, 2, 2), core)


## One rock chip: falls with gravity, spins, fades out.
class Debris:
	extends Node2D
	const FRAMES := 48
	const GRAVITY := 0.21875
	var velocity := Vector2.ZERO  # px/frame
	var spin := 0.0
	var size := Vector2(6, 5)
	var color := Color.BROWN
	var outline := Color.BLACK
	var _age := 0

	func _physics_process(_delta: float) -> void:
		_age += 1
		velocity.y += GRAVITY
		position += velocity
		rotation += spin
		modulate.a = clampf(2.0 - 2.0 * _age / FRAMES, 0.0, 1.0)
		if _age >= FRAMES:
			queue_free()

	func _draw() -> void:
		var rect := Rect2(-size / 2.0, size)
		draw_rect(rect, outline)
		draw_rect(rect.grow(-1.0), color)


## Two capsule halves spinning apart plus a white puff.
class PillPop:
	extends Node2D
	const FRAMES := 40
	const GRAVITY := 0.18
	var axis := Vector2.RIGHT
	var half_length := 8.0
	var radius := 6.0
	var color_a := Color.WHITE
	var color_b := Color.WHITE
	var outline := Color.BLACK
	var _age := 0
	var _offset := [Vector2.ZERO, Vector2.ZERO]
	var _vel := [Vector2.ZERO, Vector2.ZERO]
	var _angle := [0.0, 0.0]

	func _ready() -> void:
		var side := axis.orthogonal()
		_vel[0] = -axis * 1.6 + Vector2(0, -3.2) + side * 0.2
		_vel[1] = axis * 1.6 + Vector2(0, -3.6) - side * 0.2

	func _physics_process(_delta: float) -> void:
		_age += 1
		for i in 2:
			_vel[i].y += GRAVITY
			_offset[i] += _vel[i]
			_angle[i] += (-0.18 if i == 0 else 0.18)
		if _age >= FRAMES:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var t := float(_age) / FRAMES
		# Puff: a few white circles growing and fading.
		var puff := Color(1, 1, 1, maxf(0.0, 0.9 - t * 2.2))
		if puff.a > 0.0:
			for k in 5:
				var dir := Vector2.from_angle(TAU * k / 5.0 + 0.3)
				draw_circle(dir * (3.0 + 10.0 * t), 3.0 + 4.0 * t, puff)
		var fade := clampf(2.0 - 2.0 * t, 0.0, 1.0)
		for i in 2:
			var color: Color = color_a if i == 0 else color_b
			var dir: Vector2 = (-axis if i == 0 else axis)
			draw_set_transform(_offset[i] + dir * half_length * 0.5, _angle[i] + axis.angle(), Vector2.ONE)
			_half_capsule(dir.x < 0.0 or dir.y < 0.0, color, fade)
		draw_set_transform(Vector2.ZERO)

	## One half of the capsule along local x, open end at x = 0.
	func _half_capsule(left: bool, color: Color, fade: float) -> void:
		var s := -1.0 if left else 1.0
		var points := PackedVector2Array()
		points.append(Vector2(-s * half_length * 0.5, -radius))
		for k in 9:
			var a := -PI * 0.5 + PI * k / 8.0
			points.append(Vector2(s * half_length * 0.5, 0.0) + Vector2(s * cos(a), sin(a)) * radius)
		points.append(Vector2(-s * half_length * 0.5, radius))
		var line := Color(outline, fade)
		draw_colored_polygon(points, Color(color, fade))
		draw_polyline(points + PackedVector2Array([points[0]]), line, 1.5)
