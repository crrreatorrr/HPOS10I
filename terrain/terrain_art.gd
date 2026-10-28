@tool
class_name TerrainArt
extends RefCounted
## Terrain materials (docs/CONTRACTS.md, Art): `assets/terrain/<zone>/` holds
## `fill.png` (tiled in world space, so neighbouring pieces line up),
## `top.png` (a lip strip along top-facing surfaces; its top row sits on the
## walkable surface and it hangs down into the fill) and an optional
## `side.png` (a band along steep sides, tiled in world space). Missing files
## fall back to flat colours with a simple 2-tone lip. Purely visual.

## Draw order inside a terrain piece (all behind the player at z 0).
const FILL_Z := -3
const SIDE_Z := -2
const LIP_Z := -1
## Edges whose outward normal is within this angle of straight up get the lip.
const LIP_MAX_ANGLE := 60.0
## Width of the side band (px).
const SIDE_BAND := 16.0
## Fallback lip: bright and dark green rows (px).
const FALLBACK_LIP_LIGHT := 3
const FALLBACK_LIP_DARK := 5
const FALLBACK_LIGHT := Color(0.56, 0.9, 0.36)
const FALLBACK_DARK := Color(0.24, 0.62, 0.26)

## Where the zone folders live. Tools and dev runs may point it elsewhere.
static var material_root := "res://assets/terrain"

static var _cache := {}
static var _fallback_lip: Texture2D


## {fill, top, side} textures for a zone (null where the file is missing).
## Cached per root and zone.
static func materials(zone: String) -> Dictionary:
	var key := material_root + "/" + zone
	if _cache.has(key):
		return _cache[key]
	var found := {fill = null, top = null, side = null}
	if zone != "":
		for part in ["fill", "top", "side"]:
			found[part] = load_texture("%s/%s.png" % [key, part])
	_cache[key] = found
	return found


## Forgets cached materials (after new files arrive or the root changes).
static func clear_cache() -> void:
	_cache.clear()


## Loads an imported texture, or a plain PNG on disk (dev and test folders
## that Godot does not import). Null when missing.
static func load_texture(path: String) -> Texture2D:
	if ResourceLoader.exists(path):
		return load(path) as Texture2D
	if not FileAccess.file_exists(path):
		return null
	var image := Image.load_from_file(path)
	return ImageTexture.create_from_image(image) if image != null else null


## The placeholder lip: a bright row band over a darker one, then transparent.
static func fallback_lip() -> Texture2D:
	if _fallback_lip == null:
		var height := FALLBACK_LIP_LIGHT + FALLBACK_LIP_DARK
		var image := Image.create(4, height, false, Image.FORMAT_RGBA8)
		for y in height:
			for x in 4:
				image.set_pixel(x, y, FALLBACK_LIGHT if y < FALLBACK_LIP_LIGHT else FALLBACK_DARK)
		_fallback_lip = ImageTexture.create_from_image(image)
	return _fallback_lip


## The outline with every edge longer than `part` cut into equal pieces.
static func subdivide(polygon: PackedVector2Array, part: float) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in polygon.size():
		var a := polygon[i]
		var b := polygon[(i + 1) % polygon.size()]
		var pieces := maxi(1, ceili(a.distance_to(b) / part))
		for k in pieces:
			out.append(a.lerp(b, float(k) / pieces))
	return out


## Outward normal of every outline edge (edge i runs from point i to i + 1).
static func outward_normals(polygon: PackedVector2Array) -> PackedVector2Array:
	var area := 0.0
	for i in polygon.size():
		area += polygon[i].cross(polygon[(i + 1) % polygon.size()])
	var normals := PackedVector2Array()
	for i in polygon.size():
		var d := polygon[(i + 1) % polygon.size()] - polygon[i]
		var n := Vector2(d.y, -d.x) if area > 0.0 else Vector2(-d.y, d.x)
		normals.append(n.normalized())
	return normals


## True when an outward normal is within LIP_MAX_ANGLE of up.
static func is_top_facing(normal: Vector2) -> bool:
	return -normal.y >= cos(deg_to_rad(LIP_MAX_ANGLE)) - 0.0001


## True for steep or vertical sides (neither top- nor bottom-facing).
static func is_side_facing(normal: Vector2) -> bool:
	return absf(normal.y) < cos(deg_to_rad(LIP_MAX_ANGLE)) - 0.0001


## Runs of consecutive selected outline edges, as [points, outward normals]
## pairs (the outline wraps around).
static func edge_chains(polygon: PackedVector2Array, normals: PackedVector2Array,
		selected: Array[bool]) -> Array:
	var count := polygon.size()
	var chains := []
	if count < 2 or not selected.has(true):
		return chains
	# Start just after an unselected edge so wrapping runs stay whole.
	var start := 0
	if selected.has(false):
		while selected[start]:
			start += 1
		start = (start + 1) % count
	var points := PackedVector2Array()
	var edge_normals := PackedVector2Array()
	for k in count:
		var i := (start + k) % count
		if selected[i]:
			if points.is_empty():
				points.append(polygon[i])
			points.append(polygon[(i + 1) % count])
			edge_normals.append(normals[i])
		elif not points.is_empty():
			chains.append([points, edge_normals])
			points = PackedVector2Array()
			edge_normals = PackedVector2Array()
	if not points.is_empty():
		chains.append([points, edge_normals])
	return chains


## A strip `depth` px deep running inward from a chain of surface points.
## Texture coordinates: along the chain from `u_start` px (so flat pieces side
## by side line up when it is their world x), and 0..1 across; or, with
## `world_uv`, the world position over `texture_size` (tiled in world space).
static func strip_mesh(points: PackedVector2Array, normals: PackedVector2Array, depth: float,
		texture_size: Vector2, u_start: float, to_world: Transform2D, world_uv := false) -> ArrayMesh:
	var vertices := PackedVector2Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var along := u_start
	for i in points.size():
		var before := normals[maxi(i - 1, 0)]
		var after := normals[mini(i, normals.size() - 1)]
		var inward := -(before + after).normalized()
		if inward == Vector2.ZERO:
			inward = -after
		var miter := 1.0 / maxf(inward.dot(-after), 0.5)
		var top := points[i]
		var bottom := top + inward * depth * miter
		if i > 0:
			along += points[i].distance_to(points[i - 1])
		vertices.append(top)
		vertices.append(bottom)
		if world_uv:
			uvs.append(to_world * top / texture_size)
			uvs.append(to_world * bottom / texture_size)
		else:
			uvs.append(Vector2(along / texture_size.x, 0.0))
			uvs.append(Vector2(along / texture_size.x, 1.0))
		if i > 0:
			var a := (i - 1) * 2
			indices.append_array(PackedInt32Array([a, a + 2, a + 3, a, a + 3, a + 1]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh
