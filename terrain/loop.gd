@tool
class_name TerrainLoop
extends Node2D
## A full loop that works out of the box. Place the origin on the floor line
## at the loop's bottom centre and set `radius`.
##
## Path switching, as in the classic games:
##   - the right half of the ring is solid on path A, the left half on path B,
##     and the halves overlap by `overlap` degrees at the top
##   - running right: the entry switcher sets A (the left half is passed
##     through), the top switcher sets B while crossing the top leftwards
##     (upside down), and the exit switcher sets A again
##   - running left: the exit switcher sets B, the top switcher sets A while
##     crossing rightwards, and the entry switcher restores A
## The floor underneath is solid on both paths.

@export var radius := 112.0:
	set(value):
		radius = maxf(value, 48.0)
		_layout()
@export var thickness := 16.0:
	set(value):
		thickness = maxf(value, 4.0)
		_layout()
## How far (degrees) each half continues past the top.
@export var overlap := 20.0:
	set(value):
		overlap = clampf(value, 5.0, 60.0)
		_layout()
## Solid floor beyond the ring on each side.
@export var floor_margin := 48.0:
	set(value):
		floor_margin = maxf(value, 24.0)
		_layout()
@export var floor_depth := 32.0:
	set(value):
		floor_depth = maxf(value, 8.0)
		_layout()


func _ready() -> void:
	_layout()


func _layout() -> void:
	if not is_inside_tree():
		return
	var right := $RightHalf as CurveTerrain
	var left := $LeftHalf as CurveTerrain
	var ground := $Floor as CurveTerrain
	var entry := $EntrySwitcher as PathSwitcher
	var exit := $ExitSwitcher as PathSwitcher
	var top := $TopSwitcher as PathSwitcher
	var outer := radius + thickness
	var half_width := outer + floor_margin

	for half in [right, left]:
		half.shape = CurveTerrain.Shape.LOOP
		half.radius = radius
		half.thickness = thickness
	right.path_layer = CurveTerrain.PathLayer.A
	right.arc_start = 0.0
	right.arc_end = 180.0 + overlap
	left.path_layer = CurveTerrain.PathLayer.B
	left.arc_start = 180.0 - overlap
	left.arc_end = 360.0

	ground.shape = CurveTerrain.Shape.BLOCK
	ground.path_layer = CurveTerrain.PathLayer.BOTH
	ground.position = Vector2(-half_width, 0.0)
	ground.size = Vector2(half_width * 2.0, floor_depth)

	var side_size := Vector2(16.0, outer * 2.0)
	entry.position = Vector2(-(outer + floor_margin * 0.5), -outer)
	entry.size = side_size
	entry.path_moving_right = PathSwitcher.Path.A
	entry.path_moving_left = PathSwitcher.Path.A
	exit.position = Vector2(outer + floor_margin * 0.5, -outer)
	exit.size = side_size
	exit.path_moving_right = PathSwitcher.Path.A
	exit.path_moving_left = PathSwitcher.Path.B
	# Covers a player running along the inside of the top, not one on the outside.
	top.position = Vector2(0.0, -radius * 2.0 + 28.0)
	top.size = Vector2(16.0, 64.0)
	top.path_moving_right = PathSwitcher.Path.A
	top.path_moving_left = PathSwitcher.Path.B
	top.grounded_only = true
