@tool
class_name LoopGuard
extends Area2D
## Keeps a loop from trapping Sproto (BUG-02-01). TerrainLoop places it at the
## loop's bottom centre and sizes it to the ring and its feet.
##
## The root cause: the lower quarters of the ring, and the feet outside them,
## are on opposite paths (right side A, left side B), so one side is always
## solid. The path switchers set the path for the way Sproto is going when he
## crosses them, which is right for a ground entry and for running on after a
## lap. But when he turns back without crossing a switcher, the path no longer
## matches his direction and the solid side is in his way: too steep to walk,
## so holding that direction rocks him on it forever. That happens
##   - inside the ring: he falls back off a climb that was too slow, jumps back
##     off the wall, or reverses after a lap (e.g. after jumping into the ring
##     from the run-up, which is how QA found it);
##   - outside, on a foot: he ran off the loop top, landed on or by the foot
##     before reaching the side switcher, and turns back towards the loop.
##
## So the guard opens the way he is going:
##   - inside the ring, once he has turned back there (on the ground): moving
##     right sets path B (the lower-right quarter lets him through), moving
##     left sets path A, on the ground and in the air. Only on the far side of
##     the bottom centre, so the quarter that becomes solid (the one behind
##     him) is never around him.
##   - on a foot's outside, on the ground, moving towards the loop: the other
##     path, so the foot and the quarter above it let him through into the ring.
## Only in the lower half. Runs that never turn back in the ring (every normal
## lap either way) never change path here, and a too-slow climb that falls
## back keeps the path it has (it already lets him back out).

## Sproto's half-width or half-height, whichever is larger, plus a margin: he
## is moved to a new path only once his centre is this far past the bottom
## centre, so no part of him overlaps the quarter on the other side. Also how
## far past a foot's outer end the foot rule reaches.
const SIDE_MARGIN := 20.0
## Slower than this (px/frame) counts as standing still.
const MIN_SPEED := 0.01

## The ring's inner radius.
@export var radius := 112.0:
	set(value):
		radius = maxf(value, 1.0)
		_update_shape()
## The ring's outer radius (inner radius plus thickness).
@export var outer_radius := 128.0:
	set(value):
		outer_radius = maxf(value, 1.0)
		_update_shape()
## How far each foot reaches out from the ring's outer edge.
@export var foot_width := 48.0:
	set(value):
		foot_width = maxf(value, 0.0)
		_update_shape()

## Player instance id -> {dir: the way he first moved in the ring (-1, 0, 1),
## open: he has turned back in the ring since}.
var _tracked := {}
var _shape: CollisionShape2D


func _ready() -> void:
	collision_layer = 0
	collision_mask = Layers.PLAYER
	monitorable = false
	_update_shape()
	if Engine.is_editor_hint():
		return
	set_physics_process(false)  # only while a player is inside
	area_entered.connect(_on_area_entered)
	area_exited.connect(_on_area_exited)


func _physics_process(_delta: float) -> void:
	if Engine.is_editor_hint():
		return
	for id in _tracked.keys():
		var player := instance_from_id(id) as Player
		if player == null:
			_tracked.erase(id)
			continue
		_check(player, _tracked[id])


## True once `player` has turned back inside the ring (the way out is open).
func is_open_for(player: Player) -> bool:
	return _tracked.get(player.get_instance_id(), {}).get(&"open", false)


func _on_area_entered(area: Area2D) -> void:
	var player := Player.from_area(area)
	if player != null:
		_tracked[player.get_instance_id()] = {dir = 0, open = false}
		set_physics_process(true)


func _on_area_exited(area: Area2D) -> void:
	var player := Player.from_area(area)
	if player != null:
		_tracked.erase(player.get_instance_id())
		set_physics_process(not _tracked.is_empty())


func _check(player: Player, state: Dictionary) -> void:
	var local := to_local(player.global_position)
	var in_ring := absf(local.x) < radius and local.y > -2.0 * radius
	if not in_ring:
		state.dir = 0  # walked out (or on top): a fresh start next time
		state.open = false
	if local.y < -radius or player.state == &"dead":
		return
	if not player.grounded:
		# In the air the way out stays open (a jump inside the ring must not
		# land him back on the quarter he could not climb).
		var vx := player.velocity.x
		if in_ring and state.open and absf(vx) >= MIN_SPEED:
			_open_way(player, local, 1 if vx > 0.0 else -1)
		return
	# Ground speed, not velocity: its sign is the way he runs along the surface
	# and only flips when he turns back (velocity.x is about 0 on the walls and
	# can flip sign there for a frame without any turn).
	var speed := player.ground_speed
	if absf(speed) < MIN_SPEED:
		return
	var direction := 1 if speed > 0.0 else -1
	if in_ring:
		if state.dir == 0:
			state.dir = direction
		elif direction != state.dir:
			state.open = true
		if state.open:
			_open_way(player, local, direction)
	elif absf(local.x) >= outer_radius and absf(local.x) <= outer_radius + foot_width + SIDE_MARGIN:
		# On a foot's outside: heading for the loop on the path that makes this
		# foot solid (right foot A, left foot B)?
		var side := 1 if local.x > 0.0 else -1
		var foot_path := Player.PATH_A if side > 0 else Player.PATH_B
		if direction == -side and player.collision_path == foot_path:
			player.set_collision_path(Player.PATH_B if side > 0 else Player.PATH_A)


## Moving right: path B, so the lower-right quarter lets him out; moving left:
## path A. Only past the bottom centre (see SIDE_MARGIN).
func _open_way(player: Player, local: Vector2, direction: int) -> void:
	if local.x * direction < SIDE_MARGIN:
		return
	var path := Player.PATH_B if direction > 0 else Player.PATH_A
	if player.collision_path != path:
		player.set_collision_path(path)


func _update_shape() -> void:
	if not is_inside_tree():
		return
	if _shape == null:
		_shape = CollisionShape2D.new()
		add_child(_shape, false, Node.INTERNAL_MODE_BACK)
	var reach := outer_radius + foot_width + SIDE_MARGIN
	var rect := RectangleShape2D.new()
	rect.size = Vector2(reach * 2.0, outer_radius * 2.0)
	_shape.shape = rect
	_shape.position = Vector2(0.0, -outer_radius)
	queue_redraw()


func _draw() -> void:
	if not Engine.is_editor_hint():
		return
	var colour := Color(1.0, 0.6, 0.2, 0.6)
	draw_arc(Vector2(0, -radius), radius, 0.0, PI, 32, colour, 1.0)
	draw_line(Vector2(0, -radius), Vector2(0, 0), colour, 1.0)
	for side in [-1.0, 1.0]:
		var foot := Rect2(Vector2(minf(side * outer_radius, side * (outer_radius + foot_width + SIDE_MARGIN)), -radius),
				Vector2(foot_width + SIDE_MARGIN, radius))
		draw_rect(foot, Color(1.0, 0.6, 0.2, 0.12))
