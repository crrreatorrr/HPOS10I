@tool
class_name TerrainLoop
extends Node2D
## A full loop that works out of the box. Place the origin on the floor line
## at the loop's bottom centre and set `radius`.
##
## The ring is split by path, as in the classic games:
##   - lower-right quarter: path A; lower-left quarter: path B
##   - upper half: solid on both paths (the floor-level entry and exit only
##     ever pass through the lower quarters)
## Path switching:
##   - running right: the entry switcher sets A (the lower-left quarter is
##     passed through), the top switcher sets B while crossing the top
##     leftwards (upside down), and the exit switcher sets A again
##   - running left: the exit switcher sets B, the top switcher sets A while
##     crossing rightwards, and the entry switcher restores A
## The Guard (LoopGuard) opens the way he is going when Sproto turns back in
## the ring or on a foot, so no entry can trap him (BUG-02-01).
## Outside, each side has a hill foot below the equator (same path as that
## side's lower quarter): a vertical face from the equator that curves out
## onto the floor, so running off the top of the loop takes Sproto down the
## outside and onto the floor instead of around the underside of the ring.
## The floor underneath is solid on both paths.

## Smallest loop the top switcher can serve (see _layout).
const MIN_RADIUS := 48.0
## How far below the inner top the top switcher reaches.
const TOP_SWITCHER_REACH := 40.0

@export_range(48.0, 512.0, 1.0, "or_greater") var radius := 112.0:
	set(value):
		radius = maxf(value, MIN_RADIUS)
		_layout()
@export var thickness := 16.0:
	set(value):
		thickness = maxf(value, 4.0)
		_layout()
## Radius of the curve where each outside foot meets the floor (capped at `radius`).
@export var foot_radius := 48.0:
	set(value):
		foot_radius = maxf(value, 8.0)
		_layout()
## Solid floor beyond the ring on each side (at least the foot plus 64 px).
@export var floor_margin := 112.0:
	set(value):
		floor_margin = maxf(value, 24.0)
		_layout()
@export var floor_depth := 64.0:
	set(value):
		floor_depth = maxf(value, 8.0)
		_layout()


func _ready() -> void:
	_layout()


func _layout() -> void:
	if not is_inside_tree():
		return
	var outer := radius + thickness
	var foot := minf(foot_radius, radius)
	# The side switchers must sit beyond the feet so the path is right before
	# Sproto reaches them.
	var margin := maxf(floor_margin, foot + 64.0)
	var half_width := outer + margin

	var arcs := {
		$LowerRight: [0.0, 90.0, CurveTerrain.PathLayer.A],
		$Upper: [90.0, 270.0, CurveTerrain.PathLayer.BOTH],
		$LowerLeft: [270.0, 360.0, CurveTerrain.PathLayer.B],
	}
	for piece: CurveTerrain in arcs:
		piece.shape = CurveTerrain.Shape.LOOP
		piece.radius = radius
		piece.thickness = thickness
		piece.arc_start = arcs[piece][0]
		piece.arc_end = arcs[piece][1]
		piece.path_layer = arcs[piece][2]

	for side: float in [1.0, -1.0]:
		var piece := ($RightFoot if side > 0.0 else $LeftFoot) as CurveTerrain
		piece.shape = CurveTerrain.Shape.QUARTER_PIPE
		piece.path_layer = CurveTerrain.PathLayer.A if side > 0.0 else CurveTerrain.PathLayer.B
		piece.rises_to_right = side < 0.0
		piece.radius = foot
		piece.wall_height = radius - foot
		piece.thickness = thickness
		piece.depth = floor_depth
		piece.position = Vector2((outer + foot) * side, 0.0)

	var ground := $Floor as CurveTerrain
	ground.shape = CurveTerrain.Shape.BLOCK
	ground.path_layer = CurveTerrain.PathLayer.BOTH
	ground.position = Vector2(-half_width, 0.0)
	ground.size = Vector2(half_width * 2.0, floor_depth)

	var entry := $EntrySwitcher as PathSwitcher
	var exit := $ExitSwitcher as PathSwitcher
	var top := $TopSwitcher as PathSwitcher
	var side_size := Vector2(16.0, outer * 2.0)
	entry.position = Vector2(-(half_width - 24.0), -outer)
	entry.size = side_size
	entry.path_moving_right = PathSwitcher.Path.A
	entry.path_moving_left = PathSwitcher.Path.A
	exit.position = Vector2(half_width - 24.0, -outer)
	exit.size = side_size
	exit.path_moving_right = PathSwitcher.Path.A
	exit.path_moving_left = PathSwitcher.Path.B
	# Covers the centre of a player running along the inside of the top (19 px
	# below the surface), never one on the outside (above the ring) and never
	# one crossing the bottom (its hitbox reaches about 40 px up): the span is
	# 4 px above the inner top down to 40 px below it, i.e. at least 56 px
	# above the floor at the minimum radius of 48.
	var top_span := Vector2(-radius * 2.0 - 4.0, -radius * 2.0 + TOP_SWITCHER_REACH)
	top.position = Vector2(0.0, (top_span.x + top_span.y) / 2.0)
	top.size = Vector2(16.0, top_span.y - top_span.x)
	top.path_moving_right = PathSwitcher.Path.A
	top.path_moving_left = PathSwitcher.Path.B
	top.grounded_only = true
	var guard := $Guard as LoopGuard
	guard.radius = radius
	guard.outer_radius = outer
	guard.foot_width = foot
