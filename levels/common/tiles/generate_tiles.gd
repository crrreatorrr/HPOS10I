extends SceneTree
## Builds each zone's terrain atlas PNG and TileSet (layout and collision from
## TerrainTiles). One command, from the project folder:
##
##   godot --headless --path . -s res://levels/common/tiles/generate_tiles.gd
##
## It writes levels/common/tiles/<zone>_tiles.png, imports it (runs
## `godot --import` as a child process) and writes <zone>_tiles.tres next to
## it. Options after `--`: --zone=<id> builds one zone only;
## --materials=<dir> reads fill.png / top.png from <dir>/<zone>/ instead of
## res://assets/terrain/ (for trying art before it lands).
##
## Art per zone:
##   - With assets/terrain/<zone>/fill.png and top.png (CONTRACTS.md, Art):
##     fill textures every solid pixel; the top lip (top.png, its top row on
##     the walkable surface) runs along each floor tile's top edge, following
##     slopes; under ceilings the fill is shaded. Both are sampled in world
##     phase (see TerrainTiles), so they line up with CurveTerrain fills.
##     top.png should be 64 or 128 px wide (any width dividing 128).
##   - Otherwise a placeholder in the zone palette: a grass lip with a
##     highlight row and hanging tufts over a warm argyle soil (diamonds lit
##     from the top left, darkening with depth), and wooden planks.

const DIR := "res://levels/common/tiles"
const TERRAIN_DIR := "res://assets/terrain"
## Period of the world-aligned art (TerrainTiles.PHASES tiles).
const PERIOD := TerrainTiles.PHASES * TerrainTiles.TILE

const PALETTES := {
	"z1_retro_rush_hills": {
		grass_light = Color(0.82, 0.98, 0.45),
		grass = Color(0.36, 0.82, 0.24),
		grass_mid = Color(0.22, 0.62, 0.2),
		grass_dark = Color(0.12, 0.4, 0.16),
		soil_light = Color(0.95, 0.66, 0.34),
		soil_a = Color(0.84, 0.5, 0.22),
		soil_b = Color(0.66, 0.36, 0.16),
		soil_dark = Color(0.46, 0.22, 0.1),
		soil_deep = Color(0.36, 0.17, 0.09),
		rim = Color(0.27, 0.13, 0.07),
		plank_light = Color(0.98, 0.8, 0.5),
		plank = Color(0.84, 0.58, 0.3),
		plank_dark = Color(0.45, 0.25, 0.1),
	},
	# Wizard Academy: castle stone in a running bond under a purple carpet
	# runner with a gold edge (no tufts); dark wooden planks.
	"z2_wizard_academy": {
		style = "bricks",
		grass_light = Color(0.98, 0.82, 0.36),
		grass = Color(0.66, 0.42, 0.9),
		grass_mid = Color(0.5, 0.28, 0.74),
		grass_dark = Color(0.34, 0.17, 0.52),
		soil_light = Color(0.72, 0.7, 0.8),
		soil_a = Color(0.56, 0.54, 0.66),
		soil_b = Color(0.5, 0.48, 0.6),
		soil_dark = Color(0.3, 0.27, 0.38),
		soil_deep = Color(0.2, 0.17, 0.27),
		rim = Color(0.16, 0.12, 0.22),
		plank_light = Color(0.66, 0.46, 0.3),
		plank = Color(0.5, 0.32, 0.2),
		plank_dark = Color(0.26, 0.15, 0.1),
	},
	# Capital Mansion: white marble blocks under a crimson carpet runner with
	# a gold edge; pale wooden planks.
	"z3_capital_mansion": {
		style = "bricks",
		grass_light = Color(0.98, 0.84, 0.4),
		grass = Color(0.78, 0.16, 0.22),
		grass_mid = Color(0.6, 0.1, 0.16),
		grass_dark = Color(0.4, 0.06, 0.1),
		soil_light = Color(0.98, 0.98, 1.0),
		soil_a = Color(0.88, 0.88, 0.92),
		soil_b = Color(0.8, 0.8, 0.86),
		soil_dark = Color(0.56, 0.56, 0.66),
		soil_deep = Color(0.42, 0.42, 0.52),
		rim = Color(0.3, 0.3, 0.4),
		plank_light = Color(0.96, 0.86, 0.7),
		plank = Color(0.82, 0.68, 0.5),
		plank_dark = Color(0.5, 0.36, 0.24),
	},
}
## Hanging grass tuft length (px) by world x within a 32 px repeat.
const TUFTS := [0, 0, 1, 2, 1, 0, 0, 0, 0, 1, 0, 0, 0, 2, 3, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0]
const LIP_DEPTH := 5.0
## Placeholder soil darkens over this depth below the surface.
const SHADE_DEPTH := 32.0


func _initialize() -> void:
	var only := ""
	var materials_dir := TERRAIN_DIR
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--zone="):
			only = arg.get_slice("=", 1)
		elif arg.begins_with("--materials="):
			materials_dir = arg.get_slice("=", 1)
	var zones: Array[String] = []
	for zone: String in PALETTES:
		zones.append(zone)
	for zone in ZoneRegistry.all_zones(true):
		if not zone.id in zones and _has_materials(materials_dir, zone.id):
			zones.append(zone.id)
	var written: Array[String] = []
	for zone in zones:
		if only != "" and zone != only:
			continue
		var art := TileArt.new(zone, PALETTES.get(zone, PALETTES.z1_retro_rush_hills), materials_dir)
		var png := "%s/%s_tiles.png" % [DIR, zone]
		var err := draw_atlas(art).save_png(ProjectSettings.globalize_path(png))
		print("generate_tiles: %s: %s atlas -> %s (%s)" % [zone, art.describe(), png, error_string(err)])
		written.append(zone)
	if written.is_empty():
		print("generate_tiles: nothing to build")
		quit(1)
		return
	_import()
	for zone in written:
		var png := "%s/%s_tiles.png" % [DIR, zone]
		var texture := ResourceLoader.load(png, "Texture2D", ResourceLoader.CACHE_MODE_IGNORE) as Texture2D
		if texture == null:
			printerr("generate_tiles: %s did not import" % png)
			quit(1)
			return
		var tres := "%s/%s_tiles.tres" % [DIR, zone]
		var err := ResourceSaver.save(TerrainTiles.build_tileset(texture), tres)
		print("generate_tiles: %s: TileSet -> %s (%s)" % [zone, tres, error_string(err)])
	quit()


static func _has_materials(dir: String, zone: String) -> bool:
	return FileAccess.file_exists("%s/%s/fill.png" % [dir, zone]) and FileAccess.file_exists("%s/%s/top.png" % [dir, zone])


## Runs `godot --import` on this project so the new PNGs get .import files.
func _import() -> void:
	var output: Array = []
	var args := PackedStringArray(["--headless", "--path", ProjectSettings.globalize_path("res://"), "--import"])
	var code := OS.execute(OS.get_executable_path(), args, output, true)
	if code != 0:
		printerr("generate_tiles: import exited %d" % code)


static func draw_atlas(art: TileArt) -> Image:
	var t := TerrainTiles.TILE
	var size := TerrainTiles.atlas_cells() * t
	var image := Image.create(size.x, size.y, false, Image.FORMAT_RGBA8)
	image.fill(Color(0, 0, 0, 0))
	var all := TerrainTiles.blocks()
	for index in all.size():
		var tile_name: StringName = all[index][0]
		var level: int = all[index][1]
		var polygon := TerrainTiles.polygon(tile_name, level)
		var origin := TerrainTiles.block_origin(index) * t
		# Which pixels are solid is the same in every phase.
		var mask: Array[Vector2i] = []
		for py in t:
			for px in t:
				if Geometry2D.is_point_in_polygon(Vector2(px + 0.5 - 8.0, py + 0.5 - 8.0), polygon):
					mask.append(Vector2i(px, py))
		for phase_y in TerrainTiles.PHASES:
			for phase_x in TerrainTiles.PHASES:
				var cell := origin + Vector2i(phase_x, phase_y) * t
				for pixel in mask:
					var world := Vector2i(phase_x, phase_y) * t + pixel
					image.set_pixelv(cell + pixel, art.pixel(tile_name, level, pixel, world))
	return image


## Colours one tile pixel: from the zone's materials, or the placeholder palette.
class TileArt:
	var zone: String
	var pal: Dictionary
	var fill: Image
	var top: Image

	func _init(zone_id: String, palette: Dictionary, materials_dir: String) -> void:
		zone = zone_id
		pal = palette
		var fill_path := "%s/%s/fill.png" % [materials_dir, zone_id]
		var top_path := "%s/%s/top.png" % [materials_dir, zone_id]
		if FileAccess.file_exists(fill_path) and FileAccess.file_exists(top_path):
			fill = Image.load_from_file(fill_path)
			top = Image.load_from_file(top_path)
			for image in [fill, top]:
				if image.is_compressed():
					image.decompress()
				image.convert(Image.FORMAT_RGBA8)

	func describe() -> String:
		if fill == null:
			return "placeholder"
		return "material (fill %dx%d, top %dx%d)" % [fill.get_width(), fill.get_height(), top.get_width(), top.get_height()]

	## `pixel`: position in the tile (0..15); `world`: position within the
	## 128 px world period.
	func pixel(tile_name: StringName, level: int, pixel: Vector2i, world: Vector2i) -> Color:
		var local := Vector2(pixel) + Vector2(0.5 - 8.0, 0.5 - 8.0)
		match TerrainTiles.kind(tile_name):
			TerrainTiles.Kind.FLOOR:
				var depth := local.y - (TerrainTiles.surface_y(tile_name, local.x) - TerrainTiles.TILE * level)
				return _over(_fill(world, depth), _lip(world.x, depth))
			TerrainTiles.Kind.CEILING:
				var height := TerrainTiles.surface_y(tile_name, local.x) - local.y
				var base := _fill(world, INF)
				return base.darkened(0.45) if height < 1.0 else (base.darkened(0.25) if height < 2.0 else base)
			TerrainTiles.Kind.TOP_ONLY:
				return _plank(tile_name, pixel)
		return _fill(world, INF)

	func _fill(world: Vector2i, depth: float) -> Color:
		if fill != null:
			return fill.get_pixel(posmod(world.x, fill.get_width()), posmod(world.y, fill.get_height()))
		if pal.get("style", "argyle") == "bricks":
			return _bricks(world, depth)
		return _argyle(world, depth)

	## The lip colour `depth` px below the surface (transparent = none).
	func _lip(x: int, depth: float) -> Color:
		if depth < 0.0:
			return Color(0, 0, 0, 0)
		if top != null:
			var row := floori(depth)
			if row >= top.get_height():
				return Color(0, 0, 0, 0)
			return top.get_pixel(posmod(x, top.get_width()), row)
		var tuft: int = TUFTS[posmod(x, TUFTS.size())] if pal.get("style", "argyle") == "argyle" else 0
		var lip := LIP_DEPTH + tuft
		if depth >= lip + 1.0:
			return Color(0, 0, 0, 0)
		if depth >= lip:
			return Color(pal.soil_deep, 0.55)  # soft shadow under the grass
		if depth < 1.0:
			return pal.grass_light
		if depth < 3.0:
			return pal.grass
		if depth < LIP_DEPTH:
			return pal.grass_mid
		return pal.grass_dark

	## Placeholder soil: argyle diamonds (period 16) lit from the top left,
	## with dashed light diagonals, darkening with depth below the surface.
	func _argyle(world: Vector2i, depth: float) -> Color:
		var px := posmod(world.x, 16)
		var py := posmod(world.y, 16)
		var cx := px - 7.5
		var cy := py - 7.5
		var inside := absf(cx) + absf(cy) < 8.0
		var color: Color = pal.soil_a if inside else pal.soil_b
		# Diamond edges: light on the upper left, dark on the lower right.
		var edge := absf(absf(cx) + absf(cy) - 8.0) < 1.0
		if edge and cx < 0.0 and cy < 0.0:
			color = pal.soil_light
		elif edge and cx > 0.0 and cy > 0.0:
			color = pal.soil_dark
		elif (px + py) % 16 == 15 and px % 4 < 2:
			color = pal.soil_light.lerp(color, 0.35)
		var shade := clampf((depth - LIP_DEPTH) / SHADE_DEPTH, 0.0, 1.0) if depth != INF else 1.0
		return color.lerp(pal.soil_deep, shade * 0.35)

	## Placeholder castle stone: 16x8 blocks in a running bond with dark
	## mortar, each block lit on its top-left edges, a few chipped speckles,
	## darkening with depth below the surface.
	func _bricks(world: Vector2i, depth: float) -> Color:
		var row := floori(world.y / 8.0)
		var px := posmod(world.x + (8 if row % 2 != 0 else 0), 16)
		var py := posmod(world.y, 8)
		var block := Vector2i(floori((world.x + (8 if row % 2 != 0 else 0)) / 16.0), row)
		var color: Color = pal.soil_a if (block.x + block.y) % 3 != 0 else pal.soil_b
		if px == 15 or py == 7:
			color = pal.soil_dark
		elif px == 0 or py == 0:
			color = pal.soil_light
		elif (px * 7 + py * 5 + block.x * 3) % 23 == 0:
			color = pal.soil_dark.lerp(color, 0.5)
		var shade := clampf((depth - LIP_DEPTH) / SHADE_DEPTH, 0.0, 1.0) if depth != INF else 1.0
		return color.lerp(pal.soil_deep, shade * 0.35)

	func _plank(tile_name: StringName, pixel: Vector2i) -> Color:
		var row := pixel.y
		var left_cap := tile_name == &"plank_left" and pixel.x == 0
		var right_cap := tile_name == &"plank_right" and pixel.x == 15
		if left_cap or right_cap or row == int(TerrainTiles.PLANK_THICKNESS) - 1:
			return pal.plank_dark
		if row == 0:
			return pal.plank_light
		if pixel.x == 7 or (row == 2 and (pixel.x == 2 or pixel.x == 12)):
			return pal.plank_dark
		return pal.plank

	static func _over(base: Color, top_color: Color) -> Color:
		if top_color.a <= 0.0:
			return base
		return Color(base.lerp(top_color, top_color.a), 1.0)
