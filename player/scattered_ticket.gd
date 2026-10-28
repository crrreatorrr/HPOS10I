class_name ScatteredTicket
extends Area2D
## A ticket knocked loose when Sproto is hurt, with the classic scatter
## behaviour: a fan of up to 32 tickets, gravity, bouncing off floors, a short
## delay before they can be collected again, then blinking out of existence.

const SCENE_PATH := "res://player/scattered_ticket.tscn"

# Scatter speeds, gravity and bounce come from Tuning.physics (ticket_*).
## The first 16 tickets form the outer ring, the rest the inner one.
const RING_SIZE := 16
const SCATTER_START_ANGLE := 101.25
const SCATTER_ANGLE_STEP := 22.5
const RADIUS := 6.0
## Drawn size of the ticket card (pixels).
const TICKET_SIZE := Vector2(10.0, 6.0)
## Tickets blink during their last frames.
const BLINK_FRAMES := 64

const COLOR_FILL := Color(1.0, 0.8, 0.15)
const COLOR_RIM := Color(0.7, 0.45, 0.05)
const COLOR_SHINE := Color(1.0, 0.97, 0.75)

## Speed in pixels per frame (classic units).
var velocity: Vector2:
	get:
		return _vel / PhysicsConstants.FPS
	set(value):
		_vel = value * PhysicsConstants.FPS

var _vel := Vector2.ZERO  # px/s
var _age := 0
var _query := PhysicsRayQueryParameters2D.new()


## Spawns `count` tickets around `origin` (global) in the classic two-ring fan.
## Tickets are added deferred, so this is safe inside physics callbacks.
static func scatter(parent: Node, origin: Vector2, count: int) -> Array[ScatteredTicket]:
	var tickets: Array[ScatteredTicket] = []
	if parent == null or count <= 0:
		return tickets
	var p := Tuning.physics
	var scene: PackedScene = load(SCENE_PATH)
	var angle := SCATTER_START_ANGLE
	var speed := p.ticket_scatter_speed_first
	var flip := false
	for i in count:
		if i == RING_SIZE:
			speed = p.ticket_scatter_speed_second
			angle = SCATTER_START_ANGLE
		var ticket: ScatteredTicket = scene.instantiate()
		var v := Vector2(cos(deg_to_rad(angle)), -sin(deg_to_rad(angle))) * speed
		if flip:
			v.x = -v.x
			angle += SCATTER_ANGLE_STEP
		flip = not flip
		ticket.velocity = v
		ticket.position = (parent as Node2D).to_local(origin) if parent is Node2D else origin
		parent.add_child.call_deferred(ticket)
		tickets.append(ticket)
	return tickets


func _ready() -> void:
	add_to_group(&"scattered_ticket")
	collision_layer = 1 << 6  # objects
	collision_mask = 1 << 4  # player hitbox
	monitorable = false
	_query.collide_with_areas = false


func _physics_process(delta: float) -> void:
	var p := Tuning.physics
	_age += 1
	if _age >= p.ticket_lifetime_frames:
		queue_free()
		return

	var fall := PhysicsConstants.accel(p.ticket_gravity)
	var cap := PhysicsConstants.speed(p.speed_cap)
	var from := global_position
	global_position += _vel * delta + Vector2(0.0, 0.5 * fall * delta * delta)
	_vel.y = minf(_vel.y + fall * delta, cap)

	# Bounce off floors only while falling (sweep from last position: no tunnelling).
	if _vel.y > 0.0:
		_query.from = from
		_query.to = global_position + Vector2(0.0, RADIUS)
		_query.collision_mask = PlayerSensors.BIT_SOLID | PlayerSensors.BIT_PATH_A \
				| PlayerSensors.BIT_PATH_B | PlayerSensors.BIT_TOP_ONLY
		var hit := get_world_2d().direct_space_state.intersect_ray(_query)
		if not hit.is_empty():
			global_position.y = hit.position.y - RADIUS
			_vel.y *= p.ticket_bounce

	if _age >= p.ticket_recollect_delay_frames:
		for area in get_overlapping_areas():
			var player := Player.from_area(area)
			if player != null and player.can_collect_tickets():
				_collect()
				return

	visible = _age < p.ticket_lifetime_frames - BLINK_FRAMES or posmod(_age, 8) < 4
	queue_redraw()


func _collect() -> void:
	Effects.ticket_sparkle(global_position, get_parent())
	GameState.add_tickets(1)
	Audio.play_sfx(&"ticket")
	queue_free()


func _draw() -> void:
	draw_ticket(self, maxf(absf(cos(_age * 0.25)), 0.2))


## Draws a golden ticket centred on `canvas`'s origin: a 10x6 gold card with
## notched ends, a darker gold border and a small star. `squash` (0..1) scales
## it horizontally for the spinning flip.
static func draw_ticket(canvas: CanvasItem, squash: float) -> void:
	canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2(squash, 1.0))
	var w := TICKET_SIZE.x / 2.0
	var h := TICKET_SIZE.y / 2.0
	var notch := 1.4
	var outline := PackedVector2Array([Vector2(-w, -h), Vector2(w, -h), Vector2(w, -h + 1.6),
			Vector2(w - notch, 0.0), Vector2(w, h - 1.6), Vector2(w, h), Vector2(-w, h),
			Vector2(-w, h - 1.6), Vector2(-w + notch, 0.0), Vector2(-w, -h + 1.6)])
	canvas.draw_colored_polygon(outline, COLOR_FILL)
	canvas.draw_polyline(outline + PackedVector2Array([outline[0]]), COLOR_RIM, 1.0)
	canvas.draw_line(Vector2(-w + 1.5, -h + 1.0), Vector2(w - 2.5, -h + 1.0), COLOR_SHINE, 1.0)
	var star := PackedVector2Array()
	for i in 10:
		var r := 1.8 if i % 2 == 0 else 0.8
		star.append(Vector2.from_angle(-PI * 0.5 + PI * i / 5.0) * r + Vector2(0.0, 0.4))
	canvas.draw_colored_polygon(star, COLOR_RIM)
