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
# Wizard Academy (Zone 2).
const SHIFTING_STAIRCASE := "res://levels/objects/z2/shifting_staircase.tscn"
const BOOKSHELF := "res://levels/objects/z2/moving_bookshelf.tscn"
const CANDLE := "res://levels/objects/z2/candle.tscn"
const FALLING_BOOK := "res://levels/objects/z2/falling_book.tscn"
const AUTOSCROLL := "res://levels/objects/z2/autoscroll_section.tscn"
const SPELLBOOK := "res://levels/enemies/z2/spellbook_pill.tscn"
const SPELLBOOK_DIVER := "res://levels/enemies/z2/spellbook_diver.tscn"
const KNIGHT := "res://levels/enemies/z2/knight_pill.tscn"
const LANTERN := "res://levels/enemies/z2/lantern_pill.tscn"
# Capital Mansion (Zone 3).
const CONVEYOR := "res://levels/objects/z3/conveyor.tscn"
const SECURITY_BEAM := "res://levels/objects/z3/security_beam.tscn"
const DOOR := "res://levels/objects/z3/door.tscn"
const FLOOR_SWITCH := "res://levels/objects/z3/floor_switch.tscn"
const DRONE := "res://levels/enemies/z3/drone_pill.tscn"
const DRONE_DIVER := "res://levels/enemies/z3/drone_diver.tscn"
const CLERK := "res://levels/enemies/z3/clerk_pill.tscn"
const BOUNCER := "res://levels/enemies/z3/bouncer_pill.tscn"
const SECURITY_PILL := "res://levels/enemies/z3/security_pill.tscn"
const CHANDELIER := "res://levels/enemies/z3/chandelier_pill.tscn"
const CAMERA := "res://levels/enemies/z3/camera_pill.tscn"

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
## Colour of back walls (caves, halls).
var cave := CAVE
## Spacing of the tickets past a guard()'s enemy, and whether one lies before it.
var guard_ticket_step := 40
var guard_lead_ticket := true

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
## with tickets over it and an optional enemy `enemy_gap` px past its foot
## (returned). A gap over 60 px adds a low ticket trail to the enemy: a cue
## to roll through it (docs/LEVELS.md: an enemy on a fast route is visible
## 1 s ahead or can be rolled through).
func hill(rise: int, plateau: int, steep := false, enemy_path := "", props := {}, run_after := 160,
		enemy_y := 0.0, enemy_gap := 30) -> Node2D:
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
		var settings := props.duplicate()
		if enemy_path in [WALKER, CHASER, SPIKE_PILL] and not settings.has("patrol_distance"):
			settings.patrol_distance = 40.0  # stays by the slope it guards
		node = enemy(enemy_path, Vector2(foot + enemy_gap, base + enemy_y), settings)
		arc(foot + enemy_gap, base, 3, 64, 40)
		if enemy_gap > 60:
			row(foot + 8, base, maxi(1, (enemy_gap - 40) / 32), 32)  # a low trail: roll through
	paint.flat(run_after)
	if x0 >= 0 and enemy_path == "":
		arc(x0 + (foot - x0) / 2, base - rise, 3, 64, 24)
	return node


## A 32 px stump to jump with a walker behind it, where a blocked bot's
## standing jump comes down.
func stump(enemy_path := WALKER, props := {}, after := 256) -> Node2D:
	paint.flat(96)
	var s := x
	paint.flat(32)
	paint.floor_at(s, s + 32, ground - 32)
	var node := enemy(enemy_path, Vector2(s + 32 + 78, ground), props.merged({patrol_distance = 8.0}))
	for t in [[s - 8, -64], [s + 24, -76], [s + 56, -72], [s + 88, -56]]:
		ticket(t[0], ground + t[1] + TICKET_UP)
	paint.flat(after)
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


## A terrace: walkers jump its 64 px face; rollers race through the 48 px
## ticket tunnel under it. With `breakable`, a cracked wall closes the
## tunnel (the secret: roll or spin dash into it). `inside` enemies patrol
## the tunnel (rolling through destroys them).
func terrace_tunnel(length := 448, breakable := true, inside: Array = []) -> void:
	paint.flat(192)
	var t0 := x
	var base := ground
	paint.cliff(base - 64).flat(length)
	paint.cliff(base)
	paint.carve(Rect2i(t0, base - 48, length, 48))
	paint.floor_at(t0, t0 + length, base)
	backwall(Rect2(t0, base - 48, length, 48))
	if breakable:
		place(BREAKABLE_WALL, "BreakableWall%d" % _next("wall"), Vector2(t0 + 12, base), {size = Vector2(24, 48)})
	row(t0 + 64, base, length / 64, 48)
	row(t0 + 128, base - 64, 3, 64)
	for i in inside.size():
		enemy(inside[i], Vector2(t0 + (i + 1) * length / (inside.size() + 1), base), {patrol_distance = 32.0})


## A switchback climb of 320 px: a left-facing diagonal spring at the foot
## of a cliff throws Sproto up-left onto a plank ledge 160 px up, where a
## right-facing one (right where he comes down holding right) throws him
## up-right onto the top of the cliff. The flight left is marked for the lint.
## (Node names avoid "switch": the lint counts those as doors and switches.)
func switchback(approach := 800) -> void:
	flat(approach, 64, 64)
	var s := x - 16
	var base := ground
	place(SPRING_DIAGONAL, "ZigzagSpringLeft", Vector2(s, base), {facing = -1})
	paint.planks(s - 736, s - 320, base - 160)
	place(SPRING_DIAGONAL, "ZigzagSpringRight", Vector2(s - 372, base - 160), {facing = 1})
	for t in [[-100, -96], [-200, -160], [-290, -206]]:
		ticket_at(Vector2(s + t[0], base + t[1]))
	for t in [[-200, -260], [-100, -330], [0, -370], [100, -380]]:
		ticket_at(Vector2(s + t[0], base + t[1]))
	row(s - 700, base - 160, 6, 48)
	leftward_marker(Rect2(s - 576, base - 220, 576, 40))
	paint.cliff(base - 320)
	mark(s + 200, "spring landing")


## A calm stretch with a few tickets (before an arena gate).
func corridor(length := 848, tickets := 5) -> void:
	var x0 := x
	paint.flat(length)
	row(x0 + 64, ground, tickets, (length - 128) / maxi(tickets, 1))


## A decorative waterfall (behind the terrain) from (x0, y0), `w` x `h`.
func waterfall(x0: float, y0: float, w := 48.0, h := 128.0) -> void:
	var node := place(WATERFALL, "Waterfall%d" % _next("waterfall"), Vector2(x0, y0), {size = Vector2(w, h)}, decor)
	node.z_index = 0


# --- Wizard Academy sections ---------------------------------------------------------

## A stone staircase up: `steps` risers of `rise` px (too tall to walk: hop
## each one), each with a `tread` px landing and a ticket over it, then a
## `landing` px flat with tickets at the top (keep enemies off it).
func stairs_up(steps: int, rise := 32, tread := 64, landing := 128) -> void:
	paint.flat(32)  # the first riser stands clear of whatever was just placed
	for i in steps:
		paint.cliff(ground - rise)
		ticket(x + tread / 2, ground)
		paint.flat(tread)
	flat(landing, 32, 64)


## A stair hump: `steps` risers up and `steps` drops back down to this level
## (the castle's landings between halls).
func stair_hump(steps := 3) -> void:
	stairs_up(steps, 32, 64, 64)
	stairs_down(steps)


## A stone staircase down: `steps` drops of `drop` px with `tread` px landings.
func stairs_down(steps: int, drop := 32, tread := 64) -> void:
	for i in steps:
		paint.cliff(ground + drop)
		paint.flat(tread)
	ticket(x - tread / 2, ground)


## A hall: `length` px of floor under a stone ceiling slab `height` px up
## (its top is a floor too), with a back wall and a row of tickets.
func hall(length: int, height := 176, ticket_step := 96) -> void:
	var x0 := x
	var floor_y := ground
	paint.solid(Rect2i(x0, floor_y - height - 32, length, 32))
	backwall(Rect2(x0, floor_y - height, length, height))
	flat(length, 48, ticket_step)


## A shifting staircase (levels/objects/z2) from here up to a ledge
## (steps - 1) * 32 px higher, after a `runup`: pillar steps that fold flat
## into the floor and rise again on a timer. Arriving while it is flat, wait
## at the ledge's foot: the top step lifts you up.
func shifting_flight(steps := 5, runup := 192, props := {}) -> Node2D:
	flat(maxi(runup, 192), 32, 64)  # where you may wait: tickets, no enemy
	var x0 := x
	var base := ground
	var settings := {steps = steps, pillars = true, step_size = Vector2(48, 16), rise = Vector2(48, -32),
			fold = Vector2(0, 32)}
	settings.merge(props, true)
	var stairs := place(SHIFTING_STAIRCASE, "ShiftingStaircase%d" % _next("staircase"), Vector2(x0, base), settings)
	stairs.z_index = -1
	paint.flat(steps * 48)
	for i in steps:
		ticket_at(Vector2(x0 + i * 48 + 24, base - 32 * i - 40))
	paint.cliff(base - 32 * (steps - 1))
	return stairs


## A bookshelf lift (levels/objects/z2): a shelf `64` px tall standing at the
## foot of a cliff rises `travel` px to the ledge on a telegraphed timer,
## waits there, and sinks back. Its body reaches into the floor, so nothing
## can get under it. Hop on, ride up, step off.
func bookshelf_lift(travel := 96, runup := 192, props := {}) -> Node2D:
	flat(maxi(runup, 192), 32, 64)  # where you may wait: tickets, no enemy
	var x0 := x
	var settings := {size = Vector2(64, 64 + travel), travel = Vector2(0, -travel), close_speed = 2.0,
			open_speed = 1.5, rest_frames = 120, out_frames = 100, telegraph_seconds = 0.6}
	settings.merge(props, true)
	var shelf := place(BOOKSHELF, "BookshelfLift%d" % _next("lift"), Vector2(x0, ground - 64), settings)
	shelf.z_index = -1
	paint.flat(64)
	for y in [-96, -96 - travel / 2, -96 - travel]:
		ticket_at(Vector2(x0 + 32, ground + y))
	paint.cliff(ground - 64 - travel)
	return shelf


## A shelf gate: a bookshelf flush with the floor that rises `height` px out of
## it on a telegraphed timer, blocking the hall, then sinks again. Standing on
## it just gives a ride (no ceiling above it).
func shelf_gate(height := 96, runup := 192, props := {}) -> Node2D:
	flat(maxi(runup, 192), 32, 64)  # where you may wait: tickets, no enemy
	var settings := {size = Vector2(48, height), travel = Vector2(0, -height), close_speed = 2.0,
			open_speed = 1.5, rest_frames = 150, out_frames = 60, telegraph_seconds = 0.6}
	settings.merge(props, true)
	var shelf := place(BOOKSHELF, "ShelfGate%d" % _next("gate"), Vector2(x, ground), settings)
	shelf.z_index = -1
	flat(48 + 96)
	return shelf


## `count` candles along a flat, `spacing` px apart, flaring out of step,
## after a short run with tickets.
func candles(count: int, spacing := 128, props := {}) -> void:
	flat(192, 32, 64)  # tickets first: never meet a flare straight after a hit
	for i in count:
		var settings := {first_delay = (i * 37) % 90}
		settings.merge(props, true)
		place(CANDLE, "Candle%d" % _next("candle"), Vector2(x, ground), settings)
		paint.flat(spacing)
		if i < count - 1:
			arc(x - spacing / 2, ground, 3, 48, 48)


## A flat of `length` px with `count` falling books hanging `height` px up.
func book_hall(length: int, count: int, height := 176) -> void:
	var x0 := x
	var floor_y := ground
	hall(length, height + 24)
	for i in count:
		var bx := x0 + (i + 1) * length / (count + 1)
		place(FALLING_BOOK, "FallingBook%d" % _next("book"), Vector2(bx, floor_y - height))


## A flat of `width` px with an enemy `at` px in (feet on the floor, or
## `up` px above it for flyers). Two tickets always lie right past the enemy
## (the flat is widened to fit them), then more every `ticket_step` px, so a
## Sproto who takes the hit runs through it (invincible) and picks some back
## up before the next enemy; one lies before it as well.
func guard(enemy_path: String, width := 320, at := 192, up := 0.0, props := {}, ticket_step := 0) -> Node2D:
	if ticket_step <= 0:
		ticket_step = guard_ticket_step
	var x0 := x
	var floor_y := ground
	width = maxi(width, (at + 120 + 15) / 16 * 16)  # tiles are 16 px
	paint.flat(width)
	if at >= 96 and guard_lead_ticket:
		ticket(x0 + 32, floor_y)
	ticket(x0 + at + 40, floor_y)
	ticket(x0 + at + 88, floor_y)
	var tx := x0 + at + 88 + ticket_step
	while tx <= x0 + width + 16:
		ticket(tx, floor_y)
		tx += ticket_step
	return enemy(enemy_path, Vector2(x0 + at, floor_y - up), props)


## The flying-broom chase: an autoscroll section (levels/objects/z2) over a
## `length` px hall. `obstacles` adds low hurdles, candles and books inside.
func broom_chase(length := 2560, speed := 90.0, obstacles := true) -> Node2D:
	var x0 := x
	var floor_y := ground
	var section := place(AUTOSCROLL, "AutoscrollBroomChase", Vector2(x0, floor_y), {length = float(length), speed = speed})
	backwall(Rect2(x0, floor_y - 240, length + SCREEN, 240))
	var done := 0
	var k := 0
	while done < length:
		var piece := mini(320, length - done)
		if obstacles and k % 4 == 1 and piece == 320:
			paint.flat(160)
			var hall_floor := ground
			paint.cliff(hall_floor - 32)  # a low hurdle
			paint.flat(32)
			paint.cliff(hall_floor)
			paint.flat(128)
			arc(x - 144, floor_y, 3, 64, 56)
		elif obstacles and k % 4 == 3 and piece == 320:
			paint.flat(160)
			place(CANDLE, "Candle%d" % _next("candle"), Vector2(x, ground), {low_frames = 120, first_delay = (k * 41) % 100})
			paint.flat(160)
		else:
			flat(piece, 32, 64)
		done += piece
		k += 1
	return section


# --- Capital Mansion sections --------------------------------------------------------

## A conveyor belt set into the floor: `length` px carrying `speed` px/frame
## (+ right, - left; a belt against the way slows a runner, never stops him).
func conveyor(length := 256, speed := -3.0) -> Node2D:
	var x0 := x
	var floor_y := ground
	paint.skip(length)
	paint.solid(Rect2i(x0, floor_y + 48, length, FILL_BOTTOM - floor_y - 48))
	var belt := place(CONVEYOR, "Conveyor%d" % _next("conveyor"), Vector2(x0, floor_y),
			{size = Vector2(length, 48), speed = speed}, terrain)
	row(x0 + 48, floor_y, maxi(1, (length - 96) / 96), 96)
	return belt


## A hall of `length` px under a ceiling `height` px up, with `count`
## security beams from the ceiling to the floor, firing out of step.
func beam_hall(length: int, count: int, height := 160, props := {}) -> void:
	var x0 := x
	var floor_y := ground
	hall(length, height)
	for i in count:
		var bx := x0 + (i + 1) * length / (count + 1)
		var settings := {length = float(height), first_delay = (i * 53) % 120}
		settings.merge(props, true)
		place(SECURITY_BEAM, "SecurityBeam%d" % _next("beam"), Vector2(bx, floor_y - height), settings)


## A locked hall: a floor switch, then `gap` px on a door across the hall
## that the switch opens (pressed in passing, the door slides into the
## ceiling slab above it before Sproto reaches it at a run).
func switch_door(gap := 320, height := 96) -> void:
	var x0 := x
	var floor_y := ground
	paint.flat(96)
	var pad := place(FLOOR_SWITCH, "FloorSwitch%d" % _next("switch"), Vector2(x0 + 48, floor_y))
	flat(gap - 96, 32, 64)
	paint.solid(Rect2i(x - 32, floor_y - height - 32 - height, 96, height + 32))  # the slab the door slides into
	backwall(Rect2(x - 32, floor_y - height, 96, height))
	var door := place(DOOR, "HallDoor%d" % _next("door"), Vector2(x, floor_y), {size = Vector2(32.0, float(height))})
	pad.set(&"doors", [pad.get_path_to(door)] as Array[NodePath])
	paint.flat(32)
	flat(96)


## A ballroom: a tall hall of `length` px (ceiling `height` up) with a
## chandelier pill (T4) hanging over its middle and a row of tickets.
func ballroom(length := 512, height := 192) -> Node2D:
	var x0 := x
	var floor_y := ground
	hall(length, height)
	return enemy(CHANDELIER, Vector2(x0 + length / 2, floor_y - height + 24))


## A camera post: a camera pill (T4 sniper) on top of a 64 px terrace with a
## roll tunnel under it, covering the `approach` px of hall in front. Its line
## of fire to a target on the floor passes over a runner's head, so running
## at it is safe; standing in its sight is not.
func camera_post(approach := 384, length := 192) -> Node2D:
	var base := ground
	flat(approach, 32, 64)
	var t0 := x
	paint.cliff(base - 64).flat(length)
	paint.cliff(base)
	paint.carve(Rect2i(t0, base - 48, length, 48))
	paint.floor_at(t0, t0 + length, base)
	backwall(Rect2(t0, base - 48, length, 48))
	row(t0 + 48, base, length / 64, 48)
	row(t0 + 24, base - 64, 3, 40)  # a bot that lands on top has tickets before the camera
	var cam := enemy(CAMERA, Vector2(t0 + length - 24, base - 64))
	paint.flat(96)
	return cam


## A rooftop run: a booster, then `count` roof gaps of `gap` px between
## `roof` px roofs, each roof `step` px lower than the last, so a run at
## speed clears every gap (jumping clears them with room to spare).
func rooftops(count := 3, roof := 256, gap := 48, step := 24, runup := 192) -> void:
	paint.flat(runup)
	place(BOOSTER, "SpeedBooster%d" % _next("booster"), Vector2(x - 48, ground), {facing = 1})
	for i in count:
		flat(roof, 48, 64)
		paint.skip(gap)
		paint.cliff(ground + step)
	flat(roof, 48, 64)


## A bunker shaft: a drop of `depth` px (2 screens or more) down a walled
## shaft to a lower level, with tickets down the wall.
func shaft_down(depth := 480, width := 96) -> void:
	var x0 := x
	var top_y := ground
	paint.cliff(top_y + depth)
	paint.flat(width)
	# The shaft's far wall, from high up down to 48 px above the lower floor
	# (the way on is under it), so the drop reads as a shaft.
	paint.solid(Rect2i(x0 + width, top - 200, 16, (top_y + depth - 64) - (top - 200)))
	backwall(Rect2(x0, top_y - 64, width, depth + 64))
	for k in range(64, depth - 32, 96):
		ticket_at(Vector2(x0 + width / 2, top_y + k))


## A lift shaft up: a bookshelf-style lift (levels/objects/z2) of `travel`
## px, dressed as a service lift, up a walled shaft onto the level above.
func lift_up(travel := 192, runup := 192) -> Node2D:
	return bookshelf_lift(travel, runup, {rest_frames = 180, out_frames = 120, close_speed = 2.5})


## The bunker exit: at the end of the route a shaft drops Sproto into a
## lower corridor that runs LEFT on a conveyor to the arena gate: the
## checkpoint and the goal are at its left end (the exit reached by
## travelling left, docs/LEVELS.md R4). The route's end wall stands right of
## the shaft. Returns nothing; the goal is placed here.
func leftward_exit(corridor_len := 640, depth := 240) -> void:
	var x0 := x
	var top_y := ground
	var low_y := top_y + depth
	# The corridor below the ground already painted: carve it, floor it with a leftward belt.
	paint.flat(96)
	var shaft_x := x
	paint.cliff(low_y)
	paint.flat(96)
	paint.solid(Rect2i(x, top - 200, 48, FILL_BOTTOM - top + 200))  # the end wall
	var left := shaft_x - corridor_len
	paint.carve(Rect2i(left, low_y - 128, corridor_len, 128))
	paint.solid(Rect2i(left - 48, low_y - 200, 48, 200 + 64))  # the corridor's left wall
	paint.solid(Rect2i(left, low_y, corridor_len, FILL_BOTTOM - low_y))
	backwall(Rect2(left, low_y - 128, corridor_len + 96, 128))
	var belt := place(CONVEYOR, "ExitConveyor", Vector2(left + 128, low_y), {size = Vector2(corridor_len - 128, 48), speed = -9.0}, terrain)
	belt.z_index = 1
	paint.carve(Rect2i(left + 128, low_y, corridor_len - 128, 48))
	leftward_marker(Rect2(left, low_y - 160, corridor_len, 32), "LeftwardBunkerExit")
	for k in range(0, corridor_len - 128, 96):
		ticket_at(Vector2(left + 192 + k, low_y))
	var cp := place(CHECKPOINT, "Checkpoint%d" % _next("checkpoint"), Vector2(left + 112, low_y - STAND))
	mark(left + 112, "checkpoint")
	place(GOAL_SIGN, "GoalSign", Vector2(left + 48, low_y))


## A checkpoint post at x (Sproto's centre height above the ground there).
func checkpoint(at_x := -1) -> Node2D:
	var cx := x if at_x < 0 else at_x
	for e in enemies.get_children():
		var dx: float = cx - (e as Node2D).position.x
		if dx >= 0.0 and dx < SCREEN:
			warnings.append("%s at x %.0f is %.0f px before a checkpoint (respawns next to it)" % [e.name, (e as Node2D).position.x, dx])
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
	wall.color = cave
	wall.mouse_filter = Control.MOUSE_FILTER_IGNORE
	own(decor, wall)


## A marker the QA lint reads as a leftward stretch (its width).
func leftward_marker(rect: Rect2, label := "LeftwardZigzag") -> void:
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
