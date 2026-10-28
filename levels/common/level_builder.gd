class_name LevelBuilder
extends RefCounted
## Builds act scenes from reusable sections, left to right. An act's build
## script (e.g. levels/z1_retro_rush_hills/build_act1.gd) creates a builder,
## calls sections in route order and saves the scene. Re-running a build
## script rewrites its scene, so layouts are edited in the script.
##
## Coordinates: px, y down; the ground line of the start is y = 0. `x` and
## `level` (from the TilePainter) are the current end of the route; every
## section starts there and moves them on.
##
## Fairness bookkeeping (docs/LEVELS.md): spring landings, loop exits and
## checkpoints are recorded, and enemy() warns when an enemy lands within
## SAFE_AFTER px after one of them (no enemy within 2 screens below D5).
##
## Bot-friendly enemy spots (the QA playtest bot holds right and jumps when
## blocked): at the foot of a slope (a knockback lands it on the slope, so it
## keeps moving through while invincible) or behind a stump (its standing jump
## lands on the walker). hill() and stump() place enemies like that.

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
const WATERFALL := "res://levels/objects/z1/waterfall.tscn"

const WALKER := "res://levels/enemies/walker.tscn"
const HOPPER := "res://levels/enemies/hopper.tscn"
const CHASER := "res://levels/enemies/chaser.tscn"
const FLOATER := "res://levels/enemies/floater.tscn"
const PELLET_PILL := "res://levels/enemies/pellet_pill.tscn"
const SPIKE_PILL := "res://levels/enemies/spike_pill.tscn"

const SCREEN := 424
## Sproto's centre stands this far above the floor.
const STAND := 19.0
## Tickets float this far above the floor.
const TICKET_UP := 16.0
## No enemy this far after a spring landing, a loop exit or a checkpoint.
const SAFE_AFTER := 2 * SCREEN
const FILL_BOTTOM := 80
const CAVE := Color(0.33, 0.17, 0.09)

var level: Node2D
var terrain: Node2D
var objects: Node2D
var pickups: Node2D
var enemies: Node2D
var decor: Node2D
var tiles: TileMapLayer
var paint: TilePainter
var top := -480
var bottom := 64
## Fill colours for CurveTerrain pieces until materials land (match the tiles).
var soil := Color(0.75, 0.44, 0.2)
var grass := Color(0.36, 0.82, 0.24)

## [x, what] of every spring landing, loop exit and checkpoint so far.
var safe_marks: Array = []
var warnings := PackedStringArray()
var _counts := {}


func _init(root_name: String, zone_id: String, art_zone_id: String, tileset: String, top_y := -480) -> void:
	top = top_y
	level = Node2D.new()
	level.set_script(load(LEVEL_ROOT))
	level.name = root_name
	level.set(&"zone_id", zone_id)
	level.set(&"art_zone_id", art_zone_id)
	level.set(&"horizon_height", float(bottom))
	level.set(&"background_y_offsets", PackedFloat32Array([0.0, 12.0, 20.0, 28.0]))
	terrain = group(level, "Terrain")
	decor = group(terrain, "Decor")
	decor.z_index = -10
	objects = group(level, "Objects")
	# Not "Tickets": an older QA lint counted a node named so as one ticket.
	pickups = group(objects, "Pickups")
	enemies = group(level, "Enemies")
	tiles = TileMapLayer.new()
	tiles.name = "Tiles"
	tiles.tile_set = load(tileset)
	own(terrain, tiles)
	paint = TilePainter.new(tiles, 0, 0, FILL_BOTTOM)


## Current end of the route.
var x: int:
	get:
		return paint.x
var ground: int:
	get:
		return paint.level


# --- Sections ---------------------------------------------------------------------

## Flat start with PlayerStart 96 px in and a wall behind it.
func start(width: int) -> void:
	var marker := Marker2D.new()
	marker.name = "PlayerStart"
	marker.position = Vector2(x + 96, ground - STAND)
	own(level, marker)
	paint.solid(Rect2i(x - 48, top, 48, FILL_BOTTOM - top))
	flat(width, 160)


## Flat ground with an optional row of tickets every `ticket_step` px.
func flat(width: int, ticket_from := -1, ticket_step := 40) -> void:
	var x0 := x
	paint.flat(width)
	if ticket_from >= 0:
		row(x0 + ticket_from, ground, maxi(0, (width - ticket_from - 48) / ticket_step + 1), ticket_step)


## A hill: gentle (1:2) or steep (1:1) up `rise`, a plateau, and down again,
## with tickets over it and an optional enemy at its foot (returned).
func hill(rise: int, plateau: int, steep := false, enemy_path := "", props := {}, run_after := 160) -> Node2D:
	var base := ground
	var x0 := x
	if steep:
		paint.steep_up(rise)
	else:
		paint.gentle_up(rise)
	var up_end := x
	paint.flat(plateau)
	row(up_end + 16, base - rise, maxi(1, plateau / 40), 40)
	if steep:
		paint.steep_down(rise)
	else:
		paint.gentle_down(rise)
	var foot := x
	var node: Node2D = null
	if enemy_path != "":
		node = enemy(enemy_path, Vector2(foot + 30, base), props)
		arc(foot + 30, base, 3, 64, 40)
	paint.flat(run_after)
	if x0 >= 0 and enemy_path == "":
		arc(x0 + (foot - x0) / 2, base - rise, 3, 64, 24)
	return node


## A 32 px stump to jump with a walker behind it, where a blocked bot's
## standing jump comes down.
func stump(enemy_path := WALKER, props := {}) -> Node2D:
	paint.flat(96)
	var s := x
	paint.flat(32)
	paint.floor_at(s, s + 32, ground - 32)
	var node := enemy(enemy_path, Vector2(s + 32 + 78, ground), props.merged({patrol_distance = 8.0}))
	for t in [[s - 8, -64], [s + 24, -76], [s + 56, -72], [s + 88, -56]]:
		ticket(t[0], ground + t[1] + TICKET_UP)
	paint.flat(256)
	return node


## A loop (radius 112) with a run-up, an optional booster and room after it.
func loop(booster := true, runup := 320) -> void:
	paint.flat(runup)
	if booster:
		place(BOOSTER, "SpeedBooster", Vector2(x - 72, ground), {facing = 1})
	row(x - runup + 48, ground, 3, 32)
	var centre := x + 240
	if ground != 0:
		paint.solid(Rect2i(x, ground + 64, 480, FILL_BOTTOM - ground - 64))
	paint.skip(480)
	var node: Node2D = (load(LOOP) as PackedScene).instantiate()
	node.name = "Loop%d" % _next("loop")
	node.position = Vector2(centre, ground)
	own(terrain, node)
	level.set_editable_instance(node, true)
	for piece in node.get_children():
		if piece is CurveTerrain:
			piece.fill_color = soil
			piece.edge_color = grass
	for a in [60.0, 120.0, 180.0, 240.0, 300.0]:
		var r := 112.0 - STAND
		ticket_at(Vector2(centre + sin(deg_to_rad(a)) * r, ground - 112.0 + cos(deg_to_rad(a)) * r))
	mark(x, "loop exit")
	paint.flat(64)


## An up spring against a cliff of `height` (<= 160) onto higher ground.
func up_spring(height: int, runup := 192) -> void:
	paint.flat(runup)
	place(SPRING_UP, "SpringUp", Vector2(x - 16, ground))
	for y in [-64, -112, -160]:
		ticket_at(Vector2(x - 16, ground + y))
	paint.cliff(ground - height)
	mark(x + 160, "spring landing")


## A vertical drop of `height` (falls to lower ground).
func drop(height: int) -> void:
	paint.cliff(ground + height)


## A 45 degree slope down `height`.
func descent(height: int) -> void:
	var x0 := x
	var y0 := ground
	paint.steep_down(height)
	for i in 3:
		ticket(x0 + 32 + i * 32, y0 + 32 + i * 32)


## A gentle (1:2) slope up or down by `dy` (negative = up).
func slope(dy: int) -> void:
	if dy < 0:
		paint.gentle_up(-dy)
	else:
		paint.gentle_down(dy)


## A quarter pipe up onto ground `radius` px higher, after a flat run-up.
func quarter_pipe(radius := 64, runup := 320) -> void:
	flat(runup, 48, 48)
	var pipe := CurveTerrain.new()
	pipe.name = "QuarterPipe%d" % _next("pipe")
	pipe.shape = CurveTerrain.Shape.QUARTER_PIPE
	pipe.radius = radius
	pipe.thickness = 16.0
	pipe.depth = float(FILL_BOTTOM - ground)
	pipe.fill_color = soil
	pipe.edge_color = grass
	pipe.position = Vector2(x, ground)
	own(terrain, pipe)
	for y in [-100, -150, -200]:
		ticket_at(Vector2(x + radius - STAND, ground + y))
	paint.skip(radius + 16)
	paint.cliff(ground - radius)
	mark(x + 320, "quarter pipe landing")


## The spring gate: a rock column with a 40 px passage (too low to jump in),
## a diagonal spring just past it that throws Sproto onto a plank bridge
## `bridge_y` px above, over two death pits; the low route jumps the pits.
func spring_gate(bridge_len := 576) -> void:
	paint.flat(256)
	var g := x
	paint.flat(96)
	paint.solid(Rect2i(g, top, 96, ground - 48 - top))
	paint.solid(Rect2i(g, ground - 48, 96, 16), &"ceil_half")
	backwall(Rect2(g, ground - 40, 96, 40))
	row(g - 160, ground, 3, 32)
	place(SPRING_DIAGONAL, "SpringDiagonal", Vector2(g + 96 + 32, ground), {facing = 1})
	for t in [[192, -112], [256, -168], [320, -208]]:
		ticket_at(Vector2(g + 96 + t[0], ground + t[1]))
	paint.flat(160)
	var pits_from := x
	paint.skip(96)
	flat(160, 48, 32)
	paint.skip(96)
	var after := x
	paint.flat(352)
	place(SPIKES, "Spikes", Vector2(after + 128, ground), {width = 32.0})
	for base in [pits_from, pits_from + 256]:
		for t in [[16, -32], [48, -48], [80, -32]]:
			ticket(base + t[0], ground + t[1])
	var bridge_y := ground - 160
	var b0 := g + 96 + 288
	paint.planks(b0, b0 + bridge_len, bridge_y)
	row(b0 + 288, bridge_y, 6, 40)
	mark(b0 + 160, "spring landing")
	mark(b0 + bridge_len, "bridge drop")


## A terrace: walkers jump its 64 px face; rollers break the cracked wall at
## its foot and roll through the ticket tunnel under it.
func terrace_tunnel(length := 448) -> void:
	paint.flat(192)
	var t0 := x
	var base := ground
	paint.cliff(base - 64).flat(length)
	paint.cliff(base)
	paint.carve(Rect2i(t0, base - 48, length, 48))
	paint.floor_at(t0, t0 + length, base)
	backwall(Rect2(t0, base - 48, length, 48))
	place(BREAKABLE_WALL, "BreakableWall", Vector2(t0 + 12, base), {size = Vector2(24, 48)})
	row(t0 + 64, base, length / 64, 48)
	row(t0 + 128, base - 64, 3, 64)


## A decorative waterfall (behind the terrain) from (x0, y0), `w` x `h`.
func waterfall(x0: float, y0: float, w := 48.0, h := 128.0) -> void:
	var node := place(WATERFALL, "Waterfall%d" % _next("waterfall"), Vector2(x0, y0), {size = Vector2(w, h)}, decor)
	node.z_index = 0


## A checkpoint post at x (Sproto's centre height above the ground there).
func checkpoint(at_x := -1) -> Node2D:
	var cx := x if at_x < 0 else at_x
	var node := place(CHECKPOINT, "Checkpoint%d" % _next("checkpoint"), Vector2(cx, ground - STAND))
	mark(cx, "checkpoint")
	return node


## The goal sign `lead_in` px ahead, a runout and the end wall; finishes the route.
func goal(lead_in := 256, runout := 320) -> Node2D:
	flat(lead_in, 32, 40)
	var node := place(GOAL_SIGN, "GoalSign", Vector2(x, ground))
	paint.flat(runout)
	paint.solid(Rect2i(x, top, 48, FILL_BOTTOM - top))
	return node


# --- Placement ----------------------------------------------------------------------

func enemy(path: String, at: Vector2, props := {}) -> Node2D:
	for mark_at in safe_marks:
		var dx: float = at.x - float(mark_at[0])
		if dx >= 0.0 and dx < SAFE_AFTER:
			warnings.append("%s at x %.0f is %.0f px after a %s" % [path.get_file(), at.x, dx, mark_at[1]])
	var base := path.get_file().get_basename().capitalize().replace(" ", "")
	return place(path, "%s%d" % [base, _next(base)], at, props, enemies)


func ticket(x0: float, floor_y: float) -> void:
	ticket_at(Vector2(x0, floor_y - TICKET_UP))


func ticket_at(at: Vector2) -> void:
	place(TICKET, "Ticket%d" % _next("ticket"), at.round(), {}, pickups)


func row(x0: int, floor_y: float, count: int, step: int) -> void:
	for i in count:
		ticket(x0 + i * step, floor_y)


## `count` tickets in an arc `width` px wide and `height` px high, centred on cx.
func arc(cx: int, floor_y: float, count: int, width: int, height: int) -> void:
	for i in count:
		var t := float(i) / maxf(count - 1, 1)
		ticket(cx - width / 2.0 + t * width, floor_y - sin(t * PI) * height)


func place(path: String, node_name: String, at: Vector2, props := {}, parent: Node = null) -> Node2D:
	var node: Node2D = (load(path) as PackedScene).instantiate()
	node.name = node_name
	node.position = at
	for key: String in props:
		node.set(key, props[key])
	own(parent if parent != null else objects, node)
	return node


func backwall(rect: Rect2) -> void:
	var wall := ColorRect.new()
	wall.name = "BackWall%d" % _next("backwall")
	wall.position = rect.position
	wall.size = rect.size
	wall.color = CAVE
	wall.mouse_filter = Control.MOUSE_FILTER_IGNORE
	own(decor, wall)


## A marker the QA lint reads as a leftward stretch (its width).
func leftward_marker(rect: Rect2, label := "LeftwardSwitchback") -> void:
	var marker := ReferenceRect.new()
	marker.name = label
	marker.position = rect.position
	marker.size = rect.size
	marker.border_color = Color(0.3, 0.6, 1.0)
	own(level, marker)


func mark(at_x: int, what: String) -> void:
	safe_marks.append([at_x, what])


func group(parent: Node, node_name: String) -> Node2D:
	var node := Node2D.new()
	node.name = node_name
	if parent == level:
		own(parent, node)
	else:
		parent.add_child(node)
		node.owner = level
	return node


func own(parent: Node, node: Node) -> void:
	parent.add_child(node)
	node.owner = level


# --- Finish ---------------------------------------------------------------------------

## Adds Bounds over the built route and saves the scene. Prints warnings.
func save(path: String) -> Error:
	var bounds := ReferenceRect.new()
	bounds.name = "Bounds"
	bounds.position = Vector2(0, top)
	bounds.size = Vector2(x, bottom - top)
	bounds.border_color = Color(1.0, 0.3, 0.3)
	own(level, bounds)
	for w in warnings:
		print("LevelBuilder WARN: ", w)
	var packed := PackedScene.new()
	var err := packed.pack(level)
	if err == OK:
		err = ResourceSaver.save(packed, path)
	print("LevelBuilder: %s, %d screens, %d enemies, %d tickets (%s)" % [path, x / SCREEN,
			enemies.get_child_count(), pickups.get_child_count(), error_string(err)])
	return err


func free_level() -> void:
	level.free()


func _next(kind: String) -> int:
	_counts[kind] = int(_counts.get(kind, 0)) + 1
	return _counts[kind]
