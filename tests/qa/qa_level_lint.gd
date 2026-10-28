extends RefCounted
## QA level-design lint: checks a level's geometry against the rules in the
## level agent's brief (from QA review 01). Owned by QA. Used by
## tests/qa/test_level_rules.gd and tools/qa/level_lint.gd.
##
## Call prepare() to put a scene in the tree with its root script stripped
## (so LevelRoot spawns nothing) and let the terrain build its collision, then
## lint() for a list of findings: {severity = "error"|"warn"|"info", rule, at, detail}.
##
## Rules (numbers from the physics review):
##   loop.overlap      error  two loop footprints overlap
##   loop.intrusion    error  other solid terrain inside a loop's footprint
##   loop.exit_gap     warn   no floor just beyond a loop's footprint
##   loop.runup        warn   less than 384 px of run-up on both sides (6 px/f top speed)
##   spawn.ground      error  PlayerStart / checkpoint not over floor within 64 px, or inside terrain
##   spawn.bounds      error  PlayerStart / checkpoint outside Bounds
##   spawn.loop_zone   error  PlayerStart / checkpoint between a loop's ring and its side switcher
##   spawn.headroom    error  PlayerStart / checkpoint under a ceiling lower than 38 px
##   tunnel.mouth      error  roll-only gap (28-38 px) whose mouth is not on flat ground
##   tunnel.tight      warn   gap of 38-40 px (stands with < 2 px headroom: make it < 38 or >= 40)
##   solid.narrow      warn   floor top narrower than 18 px with drops on both sides
##   step.height       warn   vertical riser of 10.5-24 px between flat floors (steps must be <= 10 px)
##   corner.fillet     warn   floor meets a slope of 60 deg or more with a fillet under 48 px
##                            (also sharp V valleys)

const SOLID := 1
const PATH_A := 2
const PATH_B := 4
const TOP_ONLY := 8
const FLOOR_MASK := SOLID | PATH_A | PATH_B | TOP_ONLY
const CEIL_MASK := SOLID | PATH_A | PATH_B

const STANDING_HEIGHT := 38.0
const BALL_HEIGHT := 28.0
const COMFORT_HEIGHT := 40.0
const MAX_STEP := 10.0
const MIN_SOLID_WIDTH := 18.0
const MIN_FILLET := 48.0
const STEEP := 60.0
const RUNUP := 384.0  # 6^2 / (2 * 0.046875): distance to reach top speed from rest
const SCAN_STEP := 2.0


## Instances `path` under `parent` with the root script removed, waits for the
## terrain to build and register. Returns the root, or null.
static func prepare(test_or_tree: Object, parent: Node, path: String) -> Node:
	var packed := load(path) as PackedScene
	if packed == null:
		return null
	var root := packed.instantiate()
	root.set_script(null)
	parent.add_child(root)
	var tree: SceneTree = test_or_tree if test_or_tree is SceneTree else test_or_tree.get(&"tree")
	for i in 3:
		await tree.physics_frame
	return root


## Every LevelRoot scene: act scenes under levels/ (not common/objects/enemies),
## boss arenas, and the stage paths in ZoneRegistry.
static func level_scenes() -> PackedStringArray:
	var found := PackedStringArray()
	var candidates := PackedStringArray()
	_collect_scenes("res://levels", candidates)
	var bosses := DirAccess.open("res://bosses")
	if bosses != null:
		for sub in bosses.get_directories():
			candidates.append("res://bosses/%s/arena.tscn" % sub)
	for zone in ZoneRegistry.all_zones(true):
		for path in zone.acts + [zone.boss]:
			if path != "" and not path in candidates:
				candidates.append(path)
	for path in candidates:
		if ResourceLoader.exists(path) and is_level_root(path) and not path in found:
			found.append(path)
	return found


static func _collect_scenes(dir_path: String, out: PackedStringArray) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null or FileAccess.file_exists(dir_path.path_join(".gdignore")):
		return
	for sub in dir.get_directories():
		if sub.begins_with(".") or (dir_path == "res://levels" and sub in ["common", "objects", "enemies"]):
			continue
		_collect_scenes(dir_path.path_join(sub), out)
	for file in dir.get_files():
		if file.ends_with(".tscn"):
			out.append(dir_path.path_join(file))


## True when the scene's root script is (or extends) LevelRoot.
static func is_level_root(path: String) -> bool:
	var packed := load(path) as PackedScene
	if packed == null:
		return false
	var root := packed.instantiate()
	var script := root.get_script() as Script
	var result := false
	while script != null:
		if script.get_global_name() == &"LevelRoot" or script.resource_path == "res://levels/common/level_root.gd":
			result = true
			break
		script = script.get_base_script()
	root.free()
	return result


static func lint(root: Node) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var space := (root as Node2D).get_world_2d().direct_space_state if root is Node2D else null
	if space == null:
		_add(out, "error", "scene", Vector2.ZERO, "root is not a Node2D")
		return out
	var bounds_node := root.get_node_or_null("Bounds") as Control
	var bounds := Rect2()
	if bounds_node != null:
		bounds = Rect2(bounds_node.global_position, bounds_node.size)
	else:
		bounds = _terrain_extent(root)
		_add(out, "info", "scene", Vector2.ZERO, "no Bounds; scanning the terrain extent %s" % bounds)

	var loops := _find_loops(root)
	for lp in loops:
		_add(out, "info", "loop", lp.at, "loop radius %.0f, footprint x %.0f..%.0f" % [lp.radius, lp.at.x - lp.half, lp.at.x + lp.half])
	_check_loops(out, loops, space)

	var spots: Array = []
	var start := root.get_node_or_null("PlayerStart") as Node2D
	if start != null:
		spots.append(["PlayerStart", start.global_position])
	for node in _find_checkpoints(root):
		spots.append([String(node.name), (node as Node2D).global_position])
	for spot in spots:
		_check_spot(out, spot[0], spot[1], bounds, loops, space)

	var columns := _scan(space, bounds, loops)
	_check_tunnels(out, columns)
	_check_floors(out, columns)
	return out


static func _add(out: Array[Dictionary], severity: String, rule: String, at: Vector2, detail: String) -> void:
	out.append({severity = severity, rule = rule, at = at, detail = detail})


# --- Loops ------------------------------------------------------------------------

static func _find_loops(root: Node) -> Array:
	var loops: Array = []
	for node in root.find_children("*", "Node2D", true, false):
		if node.get(&"radius") == null or node.get(&"floor_margin") == null or node.get(&"thickness") == null:
			continue
		var script := node.get_script() as Script
		if script == null or script.get_global_name() != &"TerrainLoop":
			continue
		var radius: float = node.radius
		var thickness: float = node.thickness
		var foot: float = minf(float(node.get(&"foot_radius") if node.get(&"foot_radius") != null else 0.0), radius)
		var margin: float = maxf(float(node.floor_margin), foot + 64.0)
		var rids: Array[RID] = []
		for body in node.find_children("*", "CollisionObject2D", true, false):
			rids.append((body as CollisionObject2D).get_rid())
		loops.append({node = node, at = (node as Node2D).global_position, radius = radius,
				outer = radius + thickness, half = radius + thickness + margin, rids = rids})
	return loops


static func _check_loops(out: Array[Dictionary], loops: Array, space: PhysicsDirectSpaceState2D) -> void:
	for i in loops.size():
		var a: Dictionary = loops[i]
		for j in range(i + 1, loops.size()):
			var b: Dictionary = loops[j]
			if absf(a.at.x - b.at.x) < a.half + b.half and absf(a.at.y - b.at.y) < 2.0 * maxf(a.outer, b.outer):
				_add(out, "error", "loop.overlap", a.at, "footprints of the loops at x %.0f and x %.0f overlap (need %.0f px between centres)" % [a.at.x, b.at.x, a.half + b.half])
		# Other terrain inside the footprint, from the floor up to above the ring.
		var q := PhysicsPointQueryParameters2D.new()
		q.collision_mask = FLOOR_MASK
		q.exclude = a.rids
		var top: float = a.at.y - 2.0 * a.radius - (a.outer - a.radius) - 40.0
		var found := false
		var x: float = a.at.x - a.half
		while x <= a.at.x + a.half and not found:
			var y: float = a.at.y - 4.0
			while y >= top:
				q.position = Vector2(x, y)
				if not space.intersect_point(q, 1).is_empty():
					_add(out, "error", "loop.intrusion", q.position, "terrain inside the footprint of the loop at x %.0f" % a.at.x)
					found = true
					break
				y -= 8.0
			x += 8.0
		# Floor continues beyond the footprint on both sides.
		for side in [-1.0, 1.0]:
			var probe := Vector2(a.at.x + side * (a.half + 8.0), a.at.y - 64.0)
			if _ray(space, probe, probe + Vector2(0, 104), FLOOR_MASK).is_empty():
				_add(out, "warn", "loop.exit_gap", probe, "no floor right after the %s end of the loop at x %.0f" % ["right" if side > 0 else "left", a.at.x])
		# Run-up: flat or downhill floor leading in, on either side.
		var best := 0.0
		for side in [-1.0, 1.0]:
			best = maxf(best, _runup(space, a, side))
		if best < RUNUP:
			_add(out, "warn", "loop.runup", a.at, "longest run-up into the loop at x %.0f is %.0f px (< %.0f px to reach 6 px/f; coasting needs ~8.6 px/f at r 80, ~10.2 at r 112)" % [a.at.x, best, RUNUP])


static func _runup(space: PhysicsDirectSpaceState2D, lp: Dictionary, side: float) -> float:
	var x: float = lp.at.x + side * lp.half
	var last_y: float = lp.at.y
	var dist := 0.0
	while dist < RUNUP * 2.0:
		x += side * 8.0
		var hit := _ray(space, Vector2(x, last_y - 24.0), Vector2(x, last_y + 24.0), FLOOR_MASK)
		if hit.is_empty() or hit.position.y > last_y + 6.0 or hit.position.y < last_y - 12.0:
			break
		last_y = hit.position.y
		dist += 8.0
	return dist


# --- Spawns and checkpoints ----------------------------------------------------------

static func _find_checkpoints(root: Node) -> Array[Node]:
	var found: Array[Node] = []
	for node in root.find_children("*", "Node2D", true, false):
		var script := node.get_script() as Script
		var by_name := String(node.name).to_lower().contains("checkpoint")
		var by_script := script != null and String(script.get_global_name()).to_lower().contains("checkpoint")
		var by_scene := node.scene_file_path.to_lower().contains("checkpoint")
		if by_name or by_script or by_scene:
			found.append(node)
	return found


static func _check_spot(out: Array[Dictionary], label: String, at: Vector2, bounds: Rect2,
		loops: Array, space: PhysicsDirectSpaceState2D) -> void:
	if bounds.has_area() and not bounds.has_point(at):
		_add(out, "error", "spawn.bounds", at, "%s is outside Bounds %s" % [label, bounds])
	var q := PhysicsPointQueryParameters2D.new()
	q.position = at
	q.collision_mask = CEIL_MASK
	if not space.intersect_point(q, 1).is_empty():
		_add(out, "error", "spawn.ground", at, "%s is inside terrain" % label)
		return
	var floor_hit := _ray(space, at - Vector2(0, 2), at + Vector2(0, 64), FLOOR_MASK)
	if floor_hit.is_empty():
		_add(out, "error", "spawn.ground", at, "%s has no floor within 64 px below" % label)
	else:
		var fy: float = floor_hit.position.y
		var ceil := _ray(space, Vector2(at.x, fy - 0.5), Vector2(at.x, fy - 64.0), CEIL_MASK)
		if not ceil.is_empty() and fy - ceil.position.y < STANDING_HEIGHT:
			_add(out, "error", "spawn.headroom", at, "%s stands under a %.0f px ceiling (< 38)" % [label, fy - ceil.position.y])
	for lp in loops:
		var dx := absf(at.x - lp.at.x)
		if dx > lp.outer and dx < lp.half and at.y > lp.at.y - 2.0 * lp.outer - 64.0 and at.y < lp.at.y + 8.0:
			_add(out, "error", "spawn.loop_zone", at, "%s is between the ring and the side switcher of the loop at x %.0f" % [label, lp.at.x])


# --- Column scan -----------------------------------------------------------------------

## Floor points per x column: [{x, y, angle (deg from flat, signed: + rises right), clearance}].
static func _scan(space: PhysicsDirectSpaceState2D, bounds: Rect2, loops: Array) -> Array:
	var columns: Array = []
	var q := PhysicsPointQueryParameters2D.new()
	q.collision_mask = FLOOR_MASK
	var x := bounds.position.x + 1.0
	while x < bounds.end.x:
		var skip := false
		for lp in loops:
			if absf(x - lp.at.x) < lp.half:
				skip = true
		var column: Array = []
		if not skip:
			var y := bounds.position.y
			var guard := 0
			while y < bounds.end.y and guard < 64:
				guard += 1
				q.position = Vector2(x, y)
				while y < bounds.end.y and not space.intersect_point(q, 1).is_empty():
					y += 2.0
					q.position = Vector2(x, y)
				if y >= bounds.end.y:
					break
				var hit := _ray(space, Vector2(x, y), Vector2(x, bounds.end.y), FLOOR_MASK)
				if hit.is_empty():
					break
				var n: Vector2 = hit.normal
				var hy: float = hit.position.y
				if n.y < -0.25:
					var ceil := _ray(space, Vector2(x, hy - 0.5), Vector2(x, hy - 64.0), CEIL_MASK)
					var clearance: float = INF if ceil.is_empty() else hy - ceil.position.y
					column.append({x = x, y = hy, angle = rad_to_deg(atan2(-n.x, -n.y)), clearance = clearance})
				y = hy + 1.0
		columns.append({x = x, floors = column, skipped = skip})
		x += SCAN_STEP
	return columns


## The floor point in `column` nearest to height `y` (within `reach`), or {}.
static func _near(column: Dictionary, y: float, reach: float) -> Dictionary:
	var best := {}
	var best_d := reach
	for f in column.floors:
		var d := absf(f.y - y)
		if d <= best_d:
			best_d = d
			best = f
	return best


static func _check_tunnels(out: Array[Dictionary], columns: Array) -> void:
	var reported := {}
	for i in range(1, columns.size()):
		for f in columns[i].floors:
			var c: float = f.clearance
			if c < BALL_HEIGHT or c >= COMFORT_HEIGHT:
				continue
			var key := "%d:%d" % [int(f.x / 256.0), int(f.y / 64.0)]
			if c >= STANDING_HEIGHT:
				if not reported.has("t" + key):
					reported["t" + key] = true
					_add(out, "warn", "tunnel.tight", Vector2(f.x, f.y), "%.1f px under a ceiling: stands with < 2 px headroom (make it < 38 or >= 40)" % c)
				continue
			# Roll-only gap: check its mouths (neighbouring columns with more room).
			for j in [i - 1, i + 1]:
				if j < 0 or j >= columns.size() or columns[j].skipped:
					continue
				var g := _near(columns[j], f.y, 6.0)
				if g.is_empty() or g.clearance < STANDING_HEIGHT:
					continue
				if absf(g.angle) >= 1.0 or absf(f.angle) >= 1.0:
					if not reported.has("m" + key):
						reported["m" + key] = true
						_add(out, "error", "tunnel.mouth", Vector2(f.x, f.y), "roll-only gap (%.1f px) with its mouth on a %.1f deg slope: walkers can clip in; put mouths on flat ground" % [c, maxf(absf(g.angle), absf(f.angle))])


static func _check_floors(out: Array[Dictionary], columns: Array) -> void:
	var reported := {}
	for i in range(1, columns.size() - 1):
		if columns[i - 1].skipped or columns[i + 1].skipped:
			continue  # next to a loop footprint: not scanned there
		for f in columns[i].floors:
			var key := "%d:%d" % [int(f.x / 32.0), int(f.y / 32.0)]
			var prev := _near(columns[i - 1], f.y, 30.0)
			# Steps: a riser between two flat floors.
			if not prev.is_empty() and absf(f.angle) < 5.0 and absf(prev.angle) < 5.0:
				var rise := absf(prev.y - f.y)
				if rise > MAX_STEP + 0.5 and rise <= 24.0 and not reported.has("s" + key):
					reported["s" + key] = true
					_add(out, "warn", "step.height", Vector2(f.x, minf(f.y, prev.y)), "%.0f px step between flat floors (steps must be <= 10 px)" % rise)
			# Narrow tops: a flat run under 18 px wide with drops of more than 19 px on both sides.
			if absf(f.angle) < 30.0 and not reported.has("n" + key) \
					and _near(columns[i - 1], f.y, 3.0).is_empty() and _clear(columns[i - 1], f.y - 3.0, f.y + 19.0):
				var width := SCAN_STEP
				var k := i + 1
				while k < columns.size() and not columns[k].skipped and not _near(columns[k], f.y, 3.0).is_empty():
					width += SCAN_STEP
					k += 1
				if k < columns.size() and not columns[k].skipped and _clear(columns[k], f.y - 3.0, f.y + 19.0) and width < MIN_SOLID_WIDTH:
					reported["n" + key] = true
					_add(out, "warn", "solid.narrow", Vector2(f.x, f.y), "floor top only %.0f px wide (solids must be >= 18 px)" % width)
			# Fillets: a steep (>= 60 deg) floor reached from flat floor (< 5 deg) or from the opposite steep side within 41 px.
			var corner_key := "f%d:%d" % [int(f.x / 128.0), int(f.y / 128.0)]
			if absf(f.angle) >= STEEP and not reported.has(corner_key):
				# A 48 px fillet takes 48 * (sin(angle) - sin(5 deg)) px to flatten out
				# from this angle; allow 4 px for sampling.
				var limit := MIN_FILLET * (sin(deg_to_rad(absf(f.angle))) - sin(deg_to_rad(5.0))) - 4.0
				var descending: bool = f.angle < 0.0  # surface rises to the left: the low side is to the right
				var dir := 1 if descending else -1
				var k := i
				var y_ref: float = f.y
				var span := 0.0
				while span <= limit:
					k += dir
					if k < 0 or k >= columns.size() or columns[k].skipped:
						break
					var g := _near(columns[k], y_ref, 12.0)
					if g.is_empty():
						break
					y_ref = g.y
					span += SCAN_STEP
					var flat: bool = absf(g.angle) < 5.0
					var opposite: bool = absf(g.angle) >= STEEP and signf(g.angle) != signf(f.angle)
					if flat or opposite:
						reported[corner_key] = true
						_add(out, "warn", "corner.fillet", Vector2(f.x, f.y), "%s meets a %.0f deg slope within %.0f px (fillet < 48 px; use >= 48)" % ["a sharp V side" if opposite else "flat floor", absf(f.angle), span])
						break


# --- Helpers ---------------------------------------------------------------------------

## True when `column` has no floor point with y in [y0, y1].
static func _clear(column: Dictionary, y0: float, y1: float) -> bool:
	for f in column.floors:
		if f.y >= y0 and f.y <= y1:
			return false
	return true


static func _ray(space: PhysicsDirectSpaceState2D, from: Vector2, to: Vector2, mask: int) -> Dictionary:
	var q := PhysicsRayQueryParameters2D.create(from, to, mask)
	q.hit_from_inside = false
	return space.intersect_ray(q)


static func _terrain_extent(root: Node) -> Rect2:
	var rect := Rect2()
	var first := true
	for node in root.find_children("*", "CollisionPolygon2D", true, false):
		var poly := node as CollisionPolygon2D
		for p in poly.polygon:
			var g := poly.global_transform * p
			if first:
				rect = Rect2(g, Vector2.ZERO)
				first = false
			else:
				rect = rect.expand(g)
	return rect.grow(64.0)
