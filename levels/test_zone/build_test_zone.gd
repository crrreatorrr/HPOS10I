extends SceneTree
## Builds levels/test_zone/test_zone.tscn from the layout below. Dev tool:
##
##   godot --headless --path . -s res://levels/test_zone/build_test_zone.gd
##
## Re-running overwrites the scene, so make layout changes here, not in the
## editor (or stop using this script once the scene is hand-edited).
##
## The route, left to right (ground line y = 0, up is negative), about 20
## screens at difficulty D0 (docs/LEVELS.md): T1 enemies only (4, 0.2 per
## screen), one checkpoint near halfway, about 6 tickets per screen, R1
## (straight; the high and low routes rejoin within a few screens). No enemy
## within 2 screens after a spring landing, a loop exit or the checkpoint.
##   start flats (side spring at the wall) -> a stump to jump, with a walker
##      pill behind it (jump on it)
##   -> gentle (1:2) and steep (1:1) hills; a walker patrols the valley
##   -> up spring against a 128 px cliff onto the mesa
##   -> 45 degree descent -> hopper pill at its foot -> the spring gate: a
##      40 px passage (too low to jump in, so nobody skips the spring) and a
##      diagonal spring just past it that throws Sproto onto a plank bridge
##      high above two death pits (the safe way); the low way jumps the pits
##      and a row of spikes
##   -> checkpoint -> a terrace: walkers jump up its face, rollers break the
##      cracked wall at its foot and race through the ticket tunnel under it
##   -> speed booster -> loop -> quarter pipe up to the last stretch
##   -> gentle slope down -> walker pill at its foot -> goal sign.
## Enemy spots also suit the QA playtest bot (hold right, jump when blocked):
## behind the stump its standing jump lands on the walker, and at the foot of
## a slope a knockback lands it on the slope, where it keeps moving and runs
## through while still invincible instead of jumping back onto the enemy.

const OUT := "res://levels/test_zone/test_zone.tscn"
const TILESET := "res://levels/common/tiles/z1_retro_rush_hills_tiles.tres"
const LEVEL_ROOT := "res://levels/common/level_root.gd"
const LOOP := "res://terrain/loop.tscn"

const TICKET := "res://levels/objects/ticket.tscn"
const SPRING_UP := "res://levels/objects/spring_up.tscn"
const SPRING_DIAGONAL := "res://levels/objects/spring_diagonal.tscn"
const SPRING_SIDE := "res://levels/objects/spring_side.tscn"
const BOOSTER := "res://levels/objects/speed_booster.tscn"
const BREAKABLE_WALL := "res://levels/objects/breakable_wall.tscn"
const CHECKPOINT := "res://levels/objects/checkpoint.tscn"
const GOAL_SIGN := "res://levels/objects/goal_sign.tscn"
const SPIKES := "res://levels/objects/spikes.tscn"
const WALKER := "res://levels/enemies/walker.tscn"
const HOPPER := "res://levels/enemies/hopper.tscn"

const TOP := -480
const BOTTOM := 64
const RIGHT := 8480
## Sproto's centre stands this far above the floor.
const STAND := 19.0
## Tickets float this far above the floor (they overlap both the standing and the ball hitbox).
const TICKET_UP := 16.0

## Placeholder colours for CurveTerrain pieces, matching the placeholder tiles.
const SOIL := Color(0.75, 0.44, 0.2)
const GRASS := Color(0.36, 0.82, 0.24)
const CAVE := Color(0.33, 0.17, 0.09)

# Landmarks (px).
const STUMP := Rect2i(480, -32, 32, 32)
const HILLS_X := 768
const MESA_X := 1856
const MESA_Y := -128
const MESA_END := 2752
const GATE := Rect2i(3200, TOP, 96, -40 - TOP)
const PIT_1 := Vector2i(3456, 3552)
const PIT_2 := Vector2i(3712, 3808)
const BRIDGE := Vector3i(3584, 4160, -160)  # x0, x1, surface y
const CHECKPOINT_X := 4352
const TERRACE := Vector3i(4544, 4992, -64)  # x0, x1, top y
const TUNNEL_TOP := -48
const BOOSTER_X := 5248
const LOOP_X := 5568
const PIPE_X := 5936
const PIPE_RADIUS := 64.0
const UPPER := Vector3i(6016, 7104, -64)  # x0, x1, y
const GOAL_X := 8256

var level: Node2D
var objects: Node2D
var tickets: Node2D
var enemies: Node2D


func _initialize() -> void:
	# Build after the first frame: LevelRoot uses autoloads, which are not
	# registered while this script itself is being set up.
	_build.call_deferred()


func _build() -> void:
	level = Node2D.new()
	level.set_script(load(LEVEL_ROOT))
	level.name = "TestZone"
	level.set(&"zone_id", "test_zone")
	level.set(&"art_zone_id", "z1_retro_rush_hills")
	level.set(&"horizon_height", float(BOTTOM))
	level.set(&"background_y_offsets", PackedFloat32Array([0.0, 12.0, 20.0, 28.0]))

	var start := Marker2D.new()
	start.name = "PlayerStart"
	start.position = Vector2(96, -STAND)
	_own(level, start)

	var bounds := ReferenceRect.new()
	bounds.name = "Bounds"
	bounds.position = Vector2(0, TOP)
	bounds.size = Vector2(RIGHT, BOTTOM - TOP)
	bounds.border_color = Color(1.0, 0.3, 0.3)
	_own(level, bounds)

	var terrain := _group(level, "Terrain")
	objects = _group(level, "Objects")
	tickets = _group(objects, "Tickets")
	enemies = _group(level, "Enemies")

	_build_terrain(terrain)
	_build_objects()
	_build_tickets()

	var packed := PackedScene.new()
	var err := packed.pack(level)
	if err == OK:
		err = ResourceSaver.save(packed, OUT)
	print("build_test_zone: %s (%s)" % [OUT, error_string(err)])
	level.free()
	quit(0 if err == OK else 1)


# --- Terrain --------------------------------------------------------------------

func _build_terrain(terrain: Node2D) -> void:
	var tiles := TileMapLayer.new()
	tiles.name = "Tiles"
	tiles.tile_set = load(TILESET)
	_own(terrain, tiles)

	var p := TilePainter.new(tiles, 0, 0, 80)
	p.flat(HILLS_X)                    # start
	p.floor_at(STUMP.position.x, STUMP.end.x, STUMP.position.y)  # stump to jump
	p.gentle_up(64).flat(96)           # gentle hill
	p.steep_down(64).flat(96)          # steep side into the valley
	p.steep_up(64).gentle_down(64)
	p.flat(MESA_X - p.x)               # up spring against the cliff
	p.cliff(MESA_Y).flat(MESA_END - MESA_X)  # the mesa
	p.steep_down(-MESA_Y)              # 45 degree descent
	p.flat(PIT_1.x - p.x)              # hopper, spring gate
	p.skip(PIT_1.y - PIT_1.x)          # death pit 1
	p.flat(PIT_2.x - p.x)              # island
	p.skip(PIT_2.y - PIT_2.x)          # death pit 2
	p.flat(TERRACE.x - p.x)            # checkpoint
	p.cliff(TERRACE.z).flat(TERRACE.y - TERRACE.x)
	p.cliff(0).flat(LOOP_X - 240 - p.x)  # booster run
	p.skip(480)                        # the loop brings its own floor
	p.flat(PIPE_X - p.x)
	p.skip(int(PIPE_RADIUS) + 16)      # the quarter pipe
	p.cliff(UPPER.z).flat(UPPER.y - p.x)  # last stretch, up top
	p.gentle_down(-UPPER.z)            # back down to the ground line
	p.flat(RIGHT - p.x)

	# Walls at both ends, the spring gate's rock column (a 40 px passage:
	# too low to jump in, so nobody skips the diagonal spring at its exit),
	# the plank bridge over the pits, and the tunnel under the terrace.
	p.solid(Rect2i(-48, TOP, 48, 80 - TOP))
	p.solid(Rect2i(RIGHT, TOP, 48, 80 - TOP))
	p.solid(Rect2i(GATE.position.x, TOP, GATE.size.x, -48 - TOP))
	p.solid(Rect2i(GATE.position.x, -48, GATE.size.x, 16), &"ceil_half")
	p.planks(BRIDGE.x, BRIDGE.y, BRIDGE.z)
	p.carve(Rect2i(TERRACE.x, TUNNEL_TOP, TERRACE.y - TERRACE.x, -TUNNEL_TOP))
	p.floor_at(TERRACE.x, TERRACE.y, 0)

	# Dark back walls, so the tunnel and the gate passage read as holes in the
	# rock instead of floating slabs.
	var shade := _group(terrain, "BackWalls")
	shade.z_index = -10
	for rect in [Rect2(TERRACE.x, TUNNEL_TOP, TERRACE.y - TERRACE.x, -TUNNEL_TOP),
			Rect2(GATE.position.x, -40, GATE.size.x, 40)]:
		var wall := ColorRect.new()
		wall.position = rect.position
		wall.size = rect.size
		wall.color = CAVE
		wall.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_own(shade, wall)

	var loop: Node2D = (load(LOOP) as PackedScene).instantiate()
	loop.name = "Loop"
	loop.position = Vector2(LOOP_X, 0)
	_own(terrain, loop)
	# Placeholder colours to match the tiles (art materials replace them).
	level.set_editable_instance(loop, true)
	for piece in loop.get_children():
		if piece is CurveTerrain:
			piece.fill_color = SOIL
			piece.edge_color = GRASS

	var pipe := CurveTerrain.new()
	pipe.name = "QuarterPipe"
	pipe.shape = CurveTerrain.Shape.QUARTER_PIPE
	pipe.radius = PIPE_RADIUS
	pipe.thickness = 16.0
	pipe.depth = 80.0
	pipe.fill_color = SOIL
	pipe.edge_color = GRASS
	pipe.position = Vector2(PIPE_X, 0)
	_own(terrain, pipe)


# --- Objects and enemies ---------------------------------------------------------

func _build_objects() -> void:
	_place(SPRING_SIDE, "SpringSide", Vector2(40, 0), {facing = 1})
	_place(SPRING_UP, "SpringUp", Vector2(MESA_X - 16, 0))
	# Its trigger starts 18 px past the passage: where Sproto's head sensors
	# clear the ceiling, so the launch is free and a jump can't come first.
	_place(SPRING_DIAGONAL, "SpringDiagonal", Vector2(GATE.end.x + 32, 0), {facing = 1})
	_place(SPIKES, "Spikes", Vector2(3936, 0), {width = 32.0})
	_place(CHECKPOINT, "Checkpoint", Vector2(CHECKPOINT_X, -STAND))
	_place(BREAKABLE_WALL, "BreakableWall", Vector2(TERRACE.x + 12, 0), {size = Vector2(24, -TUNNEL_TOP)})
	_place(BOOSTER, "SpeedBooster", Vector2(BOOSTER_X, 0), {facing = 1})
	_place(GOAL_SIGN, "GoalSign", Vector2(GOAL_X, 0))

	_place(WALKER, "Walker", Vector2(STUMP.end.x + 78, 0), {patrol_distance = 8.0}, enemies)
	_place(WALKER, "ValleyWalker", Vector2(HILLS_X + 336, 0), {patrol_distance = 24.0, direction = 1}, enemies)
	_place(HOPPER, "Hopper", Vector2(2936, 0), {}, enemies)
	_place(WALKER, "LastWalker", Vector2(UPPER.y + 152, 0), {patrol_distance = 16.0}, enemies)


func _build_tickets() -> void:
	_row(176, 0, 5, 32)                                    # start
	_row(352, 0, 3, 32)
	for t in [[488, -64], [520, -76], [552, -72], [584, -56]]:  # over the stump onto the walker
		_ticket(t[0], t[1])
	for x in [800, 832, 864]:                              # up the gentle slope
		_ticket(x, -(x - HILLS_X) / 2.0)
	for t in [[912, -80], [944, -88], [976, -80]]:         # over the hilltop
		_ticket(t[0], t[1])
	for t in [[1072, -40], [1104, -56], [1136, -40]]:      # a jump over the valley walker
		_ticket(t[0], t[1])
	for x in [1168, 1184, 1200]:                           # up the steep side
		_ticket(x, -(x - 1152))
	for x in [1248, 1280, 1312]:                           # down the gentle side
		_ticket(x, -64 + (x - 1216) / 2.0)
	_row(1408, 0, 6, 32)                                   # run-up to the spring
	for y in [-64, -112, -160]:                            # up spring column
		_ticket(MESA_X - 16, y)
	_row(1984, MESA_Y, 6, 32)                              # mesa
	_row(2272, MESA_Y, 6, 32)
	_row(2560, MESA_Y, 5, 32)
	for x in [2784, 2816, 2848]:                           # down the 45 degree slope
		_ticket(x, MESA_Y + (x - MESA_END))
	for t in [[2904, -56], [2936, -72], [2968, -56]]:      # over the hopper
		_ticket(t[0], t[1])
	_row(3040, 0, 4, 32)                                   # into the gate
	for t in [[3392, -112], [3456, -168], [3520, -208]]:   # diagonal spring flight
		_ticket(t[0], t[1])
	_row(3872, BRIDGE.z, 8, 32)                            # plank bridge
	for base in [PIT_1.x, PIT_2.x]:                        # arcs over the pits
		for t in [[16, -32], [48, -48], [80, -32]]:
			_ticket(base + t[0], t[1])
	_row(3600, 0, 3, 32)                                   # island
	for t in [[3920, -48], [3952, -48]]:                   # over the spikes
		_ticket(t[0], t[1])
	_row(4192, 0, 4, 32)                                   # after the merge
	_row(4416, 0, 3, 32)                                   # after the checkpoint
	_row(TERRACE.x + 64, 0, 9, 40)                         # tunnel (the shortcut's reward)
	_row(TERRACE.x + 128, TERRACE.z, 5, 48)                # terrace top
	_row(BOOSTER_X - 128, 0, 3, 32)                        # booster run
	for a in [60.0, 120.0, 180.0, 240.0, 300.0]:           # inside the loop
		var r := 112.0 - STAND
		_ticket_at(Vector2(LOOP_X + sin(deg_to_rad(a)) * r, -112.0 + cos(deg_to_rad(a)) * r))
	for y in [-100, -150, -200]:                           # quarter pipe launch
		_ticket_at(Vector2(PIPE_X + PIPE_RADIUS - STAND, y))
	_row(6464, UPPER.z, 5, 32)                             # last stretch, up top
	_row(6784, UPPER.z, 5, 32)
	for x in [7136, 7168, 7200]:                           # down the gentle slope
		_ticket(x, UPPER.z + (x - UPPER.y) / 2.0)
	for t in [[7224, -56], [7256, -72], [7288, -56]]:      # a jump over the last walker
		_ticket(t[0], t[1])
	_row(7424, 0, 4, 32)
	_row(7936, 0, 5, 32)                                   # before the goal


## `count` tickets from x0, `step` apart, above a floor at `floor_y`.
func _row(x0: int, floor_y: float, count: int, step: int) -> void:
	for i in count:
		_ticket(x0 + i * step, floor_y)


func _ticket(x: float, floor_y: float) -> void:
	_ticket_at(Vector2(x, floor_y - TICKET_UP))


func _ticket_at(at: Vector2) -> void:
	_place(TICKET, "Ticket%d" % (tickets.get_child_count() + 1), at.round(), {}, tickets)


# --- Helpers ---------------------------------------------------------------------

func _place(path: String, node_name: String, at: Vector2, props := {}, parent: Node = null) -> Node2D:
	var node: Node2D = (load(path) as PackedScene).instantiate()
	node.name = node_name
	node.position = at
	for key: String in props:
		node.set(key, props[key])
	_own(parent if parent != null else objects, node)
	return node


func _group(parent: Node, node_name: String) -> Node2D:
	var node := Node2D.new()
	node.name = node_name
	_own(parent, node)
	return node


func _own(parent: Node, node: Node) -> void:
	parent.add_child(node)
	node.owner = level
