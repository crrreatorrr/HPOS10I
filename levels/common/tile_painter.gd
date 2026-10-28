class_name TilePainter
extends RefCounted
## Paints terrain into a TileMapLayer from a left-to-right description of the
## ground line, the way a level is read: flat runs, gentle (1:2) and steep
## (1:1) slopes, cliffs and pits. Each column gets its surface tile, the two
## lip-level tiles below it and plain fill down to `bottom_y`.
## Overhangs, tunnels and blocks are added afterwards with solid() / carve() /
## floor_at(). Used by level builder scripts (see build_test_zone.gd).
##
## Units are pixels, y down. Ground levels are multiples of 8 (16 for steep
## slopes); x positions are multiples of 16.

const TILE := 16

var layer: TileMapLayer
## Fill reaches down to this y.
var bottom_y := 80
## Current position of the ground line.
var x := 0
var level := 0


func _init(target: TileMapLayer, start_x := 0, start_level := 0, fill_to := 80) -> void:
	layer = target
	x = start_x
	level = start_level
	bottom_y = fill_to


func flat(width: int) -> TilePainter:
	for i in _columns(width):
		var tile := &"full" if posmod(level, TILE) == 0 else &"half"
		_column(_cell_x(), _row_of(level, tile), tile)
		x += TILE
	return self


## Rises `rise` px over 2 x rise px (26.6 degrees).
func gentle_up(rise: int) -> TilePainter:
	assert(rise % 8 == 0, "gentle slopes rise in steps of 8 px")
	for i in rise / 8:
		var top := level - 8
		var row := floori(top / float(TILE))
		var left := level - (row * TILE + 8)
		_column(_cell_x(), row, &"up_gentle_low" if left == 8 else &"up_gentle_high")
		level = top
		x += TILE
	return self


func gentle_down(drop: int) -> TilePainter:
	assert(drop % 8 == 0, "gentle slopes drop in steps of 8 px")
	for i in drop / 8:
		var row := floori(level / float(TILE))
		var left := level - (row * TILE + 8)
		_column(_cell_x(), row, &"down_gentle_high" if left == -8 else &"down_gentle_low")
		level += 8
		x += TILE
	return self


## Rises `rise` px over rise px (45 degrees).
func steep_up(rise: int) -> TilePainter:
	assert(rise % TILE == 0 and posmod(level, TILE) == 0, "steep slopes need 16 px aligned levels")
	for i in rise / TILE:
		_column(_cell_x(), level / TILE - 1, &"up_steep")
		level -= TILE
		x += TILE
	return self


func steep_down(drop: int) -> TilePainter:
	assert(drop % TILE == 0 and posmod(level, TILE) == 0, "steep slopes need 16 px aligned levels")
	for i in drop / TILE:
		_column(_cell_x(), level / TILE, &"down_steep")
		level += TILE
		x += TILE
	return self


## A vertical cliff (or step) to `new_level` at the current x.
func cliff(new_level: int) -> TilePainter:
	level = new_level
	return self


## Leaves `width` px empty (a pit, or room for another terrain piece).
func skip(width: int) -> TilePainter:
	x += width
	return self


## Fills a block of solid fill tiles (overhangs, walls, pillars).
func solid(rect: Rect2i, tile := &"fill") -> TilePainter:
	for cy in range(rect.position.y / TILE, rect.end.y / TILE):
		for cx in range(rect.position.x / TILE, rect.end.x / TILE):
			TerrainTiles.paint(layer, Vector2i(cx, cy), tile)
	return self


## Removes the tiles in a block (tunnels, caves).
func carve(rect: Rect2i) -> TilePainter:
	for cy in range(rect.position.y / TILE, rect.end.y / TILE):
		for cx in range(rect.position.x / TILE, rect.end.x / TILE):
			layer.erase_cell(Vector2i(cx, cy))
	return self


## Repaints a flat floor surface at `floor_level` from x0 to x1 (e.g. the
## floor of a carved tunnel), with its lip levels and fill below.
func floor_at(x0: int, x1: int, floor_level: int) -> TilePainter:
	var tile := &"full" if posmod(floor_level, TILE) == 0 else &"half"
	for cx in range(x0 / TILE, x1 / TILE):
		_column(cx, _row_of(floor_level, tile), tile)
	return self


## A row of top-only planks with their surface at `top` from x0 to x1.
func planks(x0: int, x1: int, top: int) -> TilePainter:
	var row := top / TILE
	var first := x0 / TILE
	var last := x1 / TILE - 1
	for cx in range(first, last + 1):
		var tile := &"plank_left" if cx == first else (&"plank_right" if cx == last else &"plank")
		TerrainTiles.paint(layer, Vector2i(cx, row), tile)
	return self


func _columns(width: int) -> int:
	assert(width % TILE == 0, "widths are multiples of 16 px")
	return width / TILE


func _cell_x() -> int:
	return floori(x / float(TILE))


func _row_of(surface: int, tile: StringName) -> int:
	return floori(surface / float(TILE)) if tile == &"full" else floori((surface - 8) / float(TILE))


## Surface tile at (cx, row), two lip-level tiles under it, fill down to bottom_y.
func _column(cx: int, row: int, tile: StringName) -> void:
	TerrainTiles.paint(layer, Vector2i(cx, row), tile, 0)
	var last_row := ceili(bottom_y / float(TILE)) - 1
	for cy in range(row + 1, last_row + 1):
		var depth := cy - row
		if depth < TerrainTiles.LIP_LEVELS:
			TerrainTiles.paint(layer, Vector2i(cx, cy), tile, depth)
		else:
			TerrainTiles.paint(layer, Vector2i(cx, cy), &"fill")
