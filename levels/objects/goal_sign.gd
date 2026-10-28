class_name GoalSign
extends PlayerArea
## The goal sign at the end of an act. When a live player passes it (running
## at any speed, or flying over it: the trigger reaches high above), it plays
## `goal_sign`, spins from the ticket face to Sproto's face, and calls
## LevelRoot.complete_level() once. The origin is the base of the post, on
## the floor. Layer 7 (objects), mask 5 (player).

signal passed

const POST_HEIGHT := 36.0
const PANEL_RADIUS := 13.0
const TRIGGER := Vector2(32.0, 480.0)
## Spin: full turns and how long they take to slow down.
const SPIN_TURNS := 6.0
const SPIN_FRAMES := 150

const OUTLINE := Color(0.12, 0.1, 0.18)
const POST := Color(0.6, 0.62, 0.7)
const POST_DARK := Color(0.38, 0.4, 0.5)
const RIM := Color(0.95, 0.95, 1.0)
const GOLD := Color(1.0, 0.8, 0.16)
const BLUE := Color(0.22, 0.52, 1.0)
const YELLOW := Color(1.0, 0.84, 0.2)
const RED := Color(0.93, 0.18, 0.2)

var _triggered := false
var _spin_frames := 0


func _ready() -> void:
	collision_layer = LAYER_OBJECTS
	monitorable = false
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = TRIGGER
	shape.shape = rect
	shape.position = Vector2(0.0, -TRIGGER.y / 2.0)
	add_child(shape)


func is_triggered() -> bool:
	return _triggered


func _physics_process(_delta: float) -> void:
	if _triggered:
		if _spin_frames < SPIN_FRAMES:
			_spin_frames += 1
			queue_redraw()
		return
	for player in players_inside():
		if player.state != &"dead":
			trigger()
			return


func trigger() -> void:
	if _triggered:
		return
	_triggered = true
	_spin_frames = 0
	Audio.play_sfx(&"goal_sign")
	passed.emit()
	# Found by group, not by class name: other scripts naming LevelRoot can make
	# Godot keep its script alive at exit (leak warnings in the smoke test).
	var root := get_tree().get_first_node_in_group(&"level_root") if is_inside_tree() else null
	if root != null and root.has_method(&"complete_level"):
		root.call(&"complete_level")


## Spin angle: fast at first, easing out to land on Sproto's face.
func _angle() -> float:
	if not _triggered:
		return 0.0
	var t := minf(float(_spin_frames) / SPIN_FRAMES, 1.0)
	var eased := 1.0 - pow(1.0 - t, 3.0)
	return (SPIN_TURNS + 0.5) * TAU * eased


func _draw() -> void:
	draw_rect(Rect2(-2.5, -POST_HEIGHT, 5, POST_HEIGHT), OUTLINE)
	draw_rect(Rect2(-1.5, -POST_HEIGHT, 3, POST_HEIGHT), POST)
	draw_rect(Rect2(0.5, -POST_HEIGHT, 1, POST_HEIGHT), POST_DARK)
	var angle := _angle()
	var width := cos(angle)
	var centre := Vector2(0.0, -POST_HEIGHT - PANEL_RADIUS + 2.0)
	var squash := maxf(absf(width), 0.08)
	draw_set_transform(centre, 0.0, Vector2(squash, 1.0))
	draw_circle(Vector2.ZERO, PANEL_RADIUS + 1.5, OUTLINE)
	draw_circle(Vector2.ZERO, PANEL_RADIUS, RIM)
	# Front (ticket) before the pass; the back face shows Sproto.
	var front := width >= 0.0
	if _triggered and _spin_frames >= SPIN_FRAMES:
		front = false
	if front:
		_draw_ticket_emblem(1.7)
	else:
		_draw_sproto_face()
	draw_set_transform(Vector2.ZERO)


## The golden ticket, like ScatteredTicket.draw_ticket() but drawn within the
## current transform (that helper resets it), `size` times bigger.
func _draw_ticket_emblem(size: float) -> void:
	var w := ScatteredTicket.TICKET_SIZE.x / 2.0 * size
	var h := ScatteredTicket.TICKET_SIZE.y / 2.0 * size
	var notch := 1.4 * size
	var cut := 1.6 * size
	var outline := PackedVector2Array([Vector2(-w, -h), Vector2(w, -h), Vector2(w, -h + cut),
			Vector2(w - notch, 0.0), Vector2(w, h - cut), Vector2(w, h), Vector2(-w, h),
			Vector2(-w, h - cut), Vector2(-w + notch, 0.0), Vector2(-w, -h + cut)])
	draw_colored_polygon(outline, ScatteredTicket.COLOR_FILL)
	draw_polyline(outline + PackedVector2Array([outline[0]]), ScatteredTicket.COLOR_RIM, 1.0)
	draw_line(Vector2(-w + 2.0, -h + 1.5), Vector2(w - 3.0, -h + 1.5), ScatteredTicket.COLOR_SHINE, 1.0)
	var star := PackedVector2Array()
	for i in 10:
		var r := (1.8 if i % 2 == 0 else 0.8) * size
		star.append(Vector2.from_angle(-PI * 0.5 + PI * i / 5.0) * r)
	draw_colored_polygon(star, ScatteredTicket.COLOR_RIM)


## A simple emblem of Sproto: blue and yellow halves, eyes, red nose.
func _draw_sproto_face() -> void:
	var r := PANEL_RADIUS - 2.0
	var left := PackedVector2Array([Vector2(0, -r)])
	var right := PackedVector2Array([Vector2(0, -r)])
	for k in 13:
		var a := -PI * 0.5 - PI * k / 12.0
		left.append(Vector2(cos(a), sin(a)) * r)
		right.append(Vector2(-cos(a), sin(a)) * r)
	draw_colored_polygon(left, BLUE)
	draw_colored_polygon(right, YELLOW)
	for x in [-4.0, 4.0]:
		draw_circle(Vector2(x, -2.5), 3.0, Color.WHITE)
		draw_circle(Vector2(x + 0.8, -2.0), 1.4, OUTLINE)
	draw_circle(Vector2(0, 2.0), 2.2, RED)
	draw_arc(Vector2(0, 3.0), 5.0, 0.3, PI - 0.3, 8, RED, 1.5)
