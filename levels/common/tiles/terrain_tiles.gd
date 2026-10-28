class_name TerrainTiles
extends RefCounted
## The 16x16 terrain tile catalogue shared by every zone's TileSet: atlas
## layout, collision polygons and the surface each tile draws.
## generate_tiles.gd turns it into an atlas PNG and a TileSet per zone; level
## builders paint tiles by name with paint().
##
## Collision: TileSet physics layer 0 is bit 1 (terrain_solid), layer 1 is
## bit 4 (terrain_top_only). Polygons are in tile-local pixels around the tile
## centre (-8..8), y down. Neighbouring slope tiles share their edge points
## exactly, so a run of slope tiles is one straight line for the sensors.
##
## World-aligned art: terrain materials (assets/terrain/<zone>/fill.png 64 or
## 128 px, top.png) repeat every 128 px at most, so each tile is drawn in
## PHASES x PHASES variants, one per 16 px step of that period. paint() picks
## the variant from the cell's position, so the pattern runs on seamlessly
## from tile to tile and lines up with CurveTerrain fills. The layout is the
## same for every zone and every material size: swapping art never needs the
## level to be repainted.
##
## Lip levels: the grass lip (top.png) can be up to 24 px tall, deeper than
## one tile. Floor tiles therefore come in three lip levels: 0 is the tile with
## the surface in it, 1 and 2 are the solid tiles one and two rows below it,
## drawn with the rest of that surface's lip. Paint plain `fill` further down.

const TILE := 16
## Variants per axis: 8 x 16 px = 128 px, the largest material period.
const PHASES := 8
const LIP_LEVELS := 3
## Blocks of PHASES x PHASES cells per atlas row.
const BLOCK_COLUMNS := 6
const SOURCE_ID := 0
## TileSet physics layer indices.
const PHYSICS_SOLID := 0
const PHYSICS_TOP_ONLY := 1
## Collision layer values for those physics layers (CONTRACTS.md bits 1 and 4).
const LAYER_SOLID := Layers.TERRAIN_SOLID
const LAYER_TOP_ONLY := Layers.TERRAIN_TOP_ONLY

enum Kind { FLOOR, FILL, CEILING, TOP_ONLY }

## name: [kind, surface left y, surface right y] (tile-local, -8 top .. 8 bottom).
## FLOOR: the surface is the top edge; CEILING: the bottom edge.
const TILES := {
	&"full": [Kind.FLOOR, -8.0, -8.0],
	&"half": [Kind.FLOOR, 0.0, 0.0],
	&"up_gentle_low": [Kind.FLOOR, 8.0, 0.0],
	&"up_gentle_high": [Kind.FLOOR, 0.0, -8.0],
	&"down_gentle_high": [Kind.FLOOR, -8.0, 0.0],
	&"down_gentle_low": [Kind.FLOOR, 0.0, 8.0],
	&"up_steep": [Kind.FLOOR, 8.0, -8.0],
	&"down_steep": [Kind.FLOOR, -8.0, 8.0],
	&"fill": [Kind.FILL, -8.0, -8.0],
	# Ceilings: the floor tile of the same shape flipped upside down.
	&"ceil_half": [Kind.CEILING, 0.0, 0.0],
	&"ceil_gentle_low_a": [Kind.CEILING, -8.0, 0.0],
	&"ceil_gentle_high_a": [Kind.CEILING, 0.0, 8.0],
	&"ceil_gentle_high_b": [Kind.CEILING, 8.0, 0.0],
	&"ceil_gentle_low_b": [Kind.CEILING, 0.0, -8.0],
	&"ceil_steep_a": [Kind.CEILING, -8.0, 8.0],
	&"ceil_steep_b": [Kind.CEILING, 8.0, -8.0],
	# Top-only planks: solid only from above.
	&"plank_left": [Kind.TOP_ONLY, -8.0, -8.0],
	&"plank": [Kind.TOP_ONLY, -8.0, -8.0],
	&"plank_right": [Kind.TOP_ONLY, -8.0, -8.0],
}
## Thickness of the top-only planks (collision and art).
const PLANK_THICKNESS := 6.0

## [tile name, lip level] for every block in the atlas, in order. (Built on
## each call: no static cache, which would outlive the scene tree at exit.)
static func blocks() -> Array:
	var out: Array = []
	for tile_name: StringName in TILES:
		var levels := LIP_LEVELS if kind(tile_name) == Kind.FLOOR else 1
		for level in levels:
			out.append([tile_name, level])
	return out


static func block_count() -> int:
	return blocks().size()


## Atlas size in cells.
static func atlas_cells() -> Vector2i:
	var rows := ceili(float(block_count()) / BLOCK_COLUMNS)
	return Vector2i(BLOCK_COLUMNS, rows) * PHASES


## Top-left atlas cell of a block.
static func block_origin(index: int) -> Vector2i:
	return Vector2i(index % BLOCK_COLUMNS, index / BLOCK_COLUMNS) * PHASES


static func block_of(tile_name: StringName, lip_level := 0) -> int:
	var all := blocks()
	var fallback := -1
	for index in all.size():
		if all[index][0] == tile_name:
			if all[index][1] == lip_level:
				return index
			if all[index][1] == 0:
				fallback = index
	assert(fallback >= 0, "unknown tile %s" % tile_name)
	return fallback


## Atlas coords of `tile_name` painted at `cell` (world-aligned variant).
static func coords(tile_name: StringName, cell: Vector2i, lip_level := 0) -> Vector2i:
	return block_origin(block_of(tile_name, lip_level)) \
			+ Vector2i(posmod(cell.x, PHASES), posmod(cell.y, PHASES))


## Paints `tile_name` at `cell` on `layer`.
static func paint(layer: TileMapLayer, cell: Vector2i, tile_name: StringName, lip_level := 0) -> void:
	layer.set_cell(cell, SOURCE_ID, coords(tile_name, cell, lip_level))


static func kind(tile_name: StringName) -> int:
	return TILES[tile_name][0]


## Surface height (tile-local y) at tile-local x for floor and ceiling tiles.
static func surface_y(tile_name: StringName, x: float) -> float:
	var info: Array = TILES[tile_name]
	return lerpf(info[1], info[2], (x + 8.0) / 16.0)


## Collision polygon (tile-local). Lip levels below the surface are full squares.
static func polygon(tile_name: StringName, lip_level := 0) -> PackedVector2Array:
	var info: Array = TILES[tile_name]
	var left: float = info[1]
	var right: float = info[2]
	if lip_level > 0:
		left = -8.0
		right = -8.0
	match int(info[0]):
		Kind.FLOOR, Kind.FILL:
			return _without_duplicates([Vector2(-8, left), Vector2(8, right), Vector2(8, 8), Vector2(-8, 8)])
		Kind.CEILING:
			return _without_duplicates([Vector2(-8, -8), Vector2(8, -8), Vector2(8, right), Vector2(-8, left)])
		Kind.TOP_ONLY:
			return PackedVector2Array([Vector2(-8, -8), Vector2(8, -8),
					Vector2(8, -8 + PLANK_THICKNESS), Vector2(-8, -8 + PLANK_THICKNESS)])
	return PackedVector2Array()


static func physics_layer(tile_name: StringName) -> int:
	return PHYSICS_TOP_ONLY if kind(tile_name) == Kind.TOP_ONLY else PHYSICS_SOLID


## Drops corners that coincide (triangles written as quads).
static func _without_duplicates(points: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p: Vector2 in points:
		if out.is_empty() or not out[out.size() - 1].is_equal_approx(p):
			out.append(p)
	if out.size() > 1 and out[0].is_equal_approx(out[out.size() - 1]):
		out.remove_at(out.size() - 1)
	return out


## Builds a TileSet for an atlas `texture` laid out by this catalogue.
static func build_tileset(texture: Texture2D) -> TileSet:
	var tile_set := TileSet.new()
	tile_set.tile_size = Vector2i(TILE, TILE)
	tile_set.add_physics_layer()
	tile_set.set_physics_layer_collision_layer(PHYSICS_SOLID, LAYER_SOLID)
	tile_set.set_physics_layer_collision_mask(PHYSICS_SOLID, 0)
	tile_set.add_physics_layer()
	tile_set.set_physics_layer_collision_layer(PHYSICS_TOP_ONLY, LAYER_TOP_ONLY)
	tile_set.set_physics_layer_collision_mask(PHYSICS_TOP_ONLY, 0)
	var source := TileSetAtlasSource.new()
	source.texture = texture
	source.texture_region_size = Vector2i(TILE, TILE)
	tile_set.add_source(source, SOURCE_ID)
	var all := blocks()
	for index in all.size():
		var tile_name: StringName = all[index][0]
		var level: int = all[index][1]
		var shape := polygon(tile_name, level)
		var layer := physics_layer(tile_name)
		var origin := block_origin(index)
		for py in PHASES:
			for px in PHASES:
				var cell := origin + Vector2i(px, py)
				source.create_tile(cell)
				var data := source.get_tile_data(cell, 0)
				data.add_collision_polygon(layer)
				data.set_collision_polygon_points(layer, 0, shape)
	return tile_set
