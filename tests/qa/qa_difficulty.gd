extends RefCounted
## QA difficulty lint: measures a LevelRoot act against its row of the curve in
## docs/LEVELS.md (`Difficulty.targets(D)` in core/difficulty.gd) and checks
## that each act is not easier than the one before it. Owned by QA. Used by
## tests/qa/test_level_difficulty.gd and tools/qa/level_lint.gd.
##
## Measures (static, from the scene with its root script stripped):
##   screens            walkable width / 424 px: scan columns (every 2 px) that
##                      have a floor or a loop; stacked floors count once
##   enemies, density   Enemy nodes (class Enemy, or levels/enemies/enemy_base.gd)
##                      and enemies per screen; tier mix from `Enemy.tier`
##   checkpoints        count, and the largest gap (start, checkpoints, goal by x)
##   tickets, density   ticket instances (scene/script/name "ticket") per screen
##   vertical_screens   spread of floor heights (5th-95th percentile) / 240 px
##   routes             per third of the route: 75th percentile of separate
##                      floors per column (rollable, 64 px apart)
##   dead_ends          a floor run that ends at a wall it can't jump (> 96 px)
##                      with no spring nearby, away from the route's ends
##   leftward_screens   goal left of the start, plus nodes named or instanced
##                      "leftward"/"reverse" (their width; 1 screen if unknown)
##   forced             autoscroll / reverse-run sections (name or scene)
##   doors_switches     doors and switches (not PathSwitchers)
##   direction          R1..R5 score from the above (see _direction())
##
## Findings (severity, rule):
##   error difficulty.screens          length off the row by more than 25 %
##   error difficulty.enemy_density    enemies per screen off by more than 25 %
##   error difficulty.ticket_density   tickets per screen off by more than 25 %
##   error difficulty.tier_ceiling     an enemy above the row's highest tier
##   error difficulty.tier_missing     an enemy without a `tier`
##   warn  difficulty.tier_mix         a tier's share off by more than 25 points
##   error difficulty.checkpoints      2 or more checkpoints off (warn when 1 off)
##   warn  difficulty.checkpoint_gap   a gap over 1.75x the even spacing
##   error difficulty.direction        score 2 or more below the row (warn when 1)
##   error difficulty.order            easier than the act before it: lower enemy
##                                     density (> 10 %), lower tier ceiling or
##                                     lower direction score
##   warn  difficulty.order            more tickets per screen than the act before
##                                     it (> 10 %). Checkpoints per screen are left
##                                     to the rows: the curve itself raises them.

const Lint := preload("res://tests/qa/qa_level_lint.gd")

const DIFFICULTY_SCRIPT := "res://core/difficulty.gd"
const ENEMY_BASE := "res://levels/enemies/enemy_base.gd"
const SCREEN_W := 424.0
const SCREEN_H := 240.0
const TOLERANCE := 0.25
const TIER_POINTS := 25.0
const ORDER_TOLERANCE := 0.10
const ROUTE_GAP := 64.0
const JUMP_UP := 96.0
const END_MARGIN := 128.0
const SPRING_REACH := 160.0


static func available() -> bool:
	return ResourceLoader.exists(DIFFICULTY_SCRIPT)


## Targets row for D (core/difficulty.gd), or {} when the curve isn't there.
static func targets(d: int) -> Dictionary:
	if not available():
		return {}
	return load(DIFFICULTY_SCRIPT).call(&"targets", d)


## {zone, stage, d} when `path` is an act in ZoneRegistry; {} for bosses and
## anything else.
static func act_of(path: String) -> Dictionary:
	if not available():
		return {}
	var script: GDScript = load(DIFFICULTY_SCRIPT)
	for zone in ZoneRegistry.all_zones(true):
		var acts: Array = zone.acts
		var i := acts.find(path)
		if i >= 0:
			var d: int = script.call(&"for_stage", zone.id, i + 1)
			return {zone = zone.id, stage = i + 1, d = d}
	return {}


## Measures a prepared level (see Lint.prepare). `is_enemy` overrides enemy
## detection (fixtures); default: class Enemy or the enemy base script.
static func measure(root: Node2D, is_enemy := Callable()) -> Dictionary:
	var space := root.get_world_2d().direct_space_state
	var bounds_node := root.get_node_or_null("Bounds") as Control
	var bounds: Rect2 = Rect2(bounds_node.global_position, bounds_node.size) \
			if bounds_node != null else Lint._terrain_extent(root)
	var loops: Array = Lint._find_loops(root)
	var columns: Array = Lint._scan(space, bounds, loops)

	var start := root.get_node_or_null("PlayerStart") as Node2D
	var goal := _first(root, func(n: Node) -> bool: return _named(n, ["goal"]))
	var start_x: float = start.global_position.x if start != null else bounds.position.x
	var goal_x: float = (goal as Node2D).global_position.x if goal is Node2D else bounds.end.x
	var lo := minf(start_x, goal_x)
	var hi := maxf(start_x, goal_x)
	if hi - lo < SCREEN_W:
		lo = bounds.position.x
		hi = bounds.end.x

	# Length, heights, routes per third.
	var walk := 0
	var heights: Array[float] = []
	var thirds: Array = [[], [], []]
	for c in columns:
		var floors: Array = c.floors
		if c.skipped or not floors.is_empty():
			walk += 1
		var routes := 0
		var last_y := -INF
		for f in floors:
			heights.append(f.y)
			if f.clearance >= Lint.BALL_HEIGHT and f.y - last_y >= ROUTE_GAP:
				routes += 1
				last_y = f.y
		if c.x >= lo and c.x <= hi and (routes > 0 or c.skipped):
			var third := clampi(int(3.0 * (c.x - lo) / maxf(hi - lo, 1.0)), 0, 2)
			thirds[third].append(maxi(routes, 1))
	var walk_px := walk * Lint.SCAN_STEP
	var screens := walk_px / SCREEN_W
	heights.sort()
	var vertical := 0.0
	if heights.size() > 10:
		vertical = (heights[int(heights.size() * 0.95)] - heights[int(heights.size() * 0.05)]) / SCREEN_H
	var routes_per_third: Array[int] = []
	for t in thirds:
		var counts: Array = t
		counts.sort()
		routes_per_third.append(counts[int(counts.size() * 0.75)] if not counts.is_empty() else 0)

	# Enemies and tiers.
	var enemy_test := is_enemy
	if not enemy_test.is_valid():
		enemy_test = func(n: Node) -> bool: return _is_enemy(n)
	var enemies := _all(root, enemy_test)
	var tiers := {}
	var missing := 0
	var tier_max := 0
	for e in enemies:
		var tier = e.get(&"tier")
		if tier == null:
			missing += 1
			continue
		tiers[int(tier)] = tiers.get(int(tier), 0) + 1
		tier_max = maxi(tier_max, int(tier))
	var tier_pct := {}
	var tiered := enemies.size() - missing
	for t in tiers:
		tier_pct[t] = 100.0 * tiers[t] / maxf(tiered, 1.0)

	# Checkpoints and their spacing.
	var checkpoint_xs: Array[float] = []
	for node in _top_level(root, Lint._find_checkpoints(root)):
		checkpoint_xs.append((node as Node2D).global_position.x)
	checkpoint_xs.sort()
	var marks: Array[float] = [lo]
	marks.append_array(checkpoint_xs)
	marks.append(hi)
	var max_gap := 0.0
	for i in range(1, marks.size()):
		max_gap = maxf(max_gap, marks[i] - marks[i - 1])

	var tickets := _all(root, func(n: Node) -> bool:
		return _named(n, ["ticket"]) and not _named(n, ["scattered"]))
	var springs: Array[Vector2] = []
	for s in _all(root, func(n: Node) -> bool: return n is Node2D and _named(n, ["spring"])):
		springs.append((s as Node2D).global_position)

	var leftward_px := maxf(0.0, start_x - goal_x)
	for n in _all(root, func(n: Node) -> bool: return _named(n, ["leftward", "reverse"])):
		leftward_px += _width(n)
	var forced := _all(root, func(n: Node) -> bool: return _named(n, ["autoscroll", "reverse"])).size()
	var doors := _all(root, func(n: Node) -> bool:
		return _named(n, ["door", "switch"]) and not _named(n, ["pathswitch", "path_switch"])).size()
	var dead_ends := _dead_ends(space, columns, lo + END_MARGIN, hi - END_MARGIN, springs)

	var m := {
		screens = screens, walk_px = walk_px, route = Vector2(lo, hi),
		enemies = enemies.size(), density = enemies.size() / maxf(screens, 0.01),
		tiers = tiers, tier_pct = tier_pct, tier_max = tier_max, tier_missing = missing,
		checkpoints = checkpoint_xs.size(), checkpoint_xs = checkpoint_xs,
		max_gap_screens = max_gap / SCREEN_W,
		tickets = tickets.size(), ticket_density = tickets.size() / maxf(screens, 0.01),
		vertical_screens = vertical, routes = routes_per_third, dead_ends = dead_ends,
		leftward_screens = leftward_px / SCREEN_W, forced = forced, doors_switches = doors,
	}
	m.direction = _direction(m)
	return m


## R1..R5 from the measures (docs/LEVELS.md, "Direction difficulty"):
##   R2 switchback  leftward >= 1 screen, or floors spread >= 1 screen high
##   R3 vertical    floors spread >= 2 screens high
##   R4 maze        a dead end, door or switch, plus leftward >= 1 or spread >= 2
##   R5 gauntlet    a forced-direction section and 3+ routes in some third
static func _direction(m: Dictionary) -> int:
	var r := 1
	if m.leftward_screens >= 1.0 or m.vertical_screens >= 1.0:
		r = 2
	if m.vertical_screens >= 2.0:
		r = 3
	if (m.dead_ends >= 1 or m.doors_switches >= 1) and (m.leftward_screens >= 1.0 or m.vertical_screens >= 2.0):
		r = 4
	var max_routes := 0
	for n in m.routes:
		max_routes = maxi(max_routes, n)
	if m.forced >= 1 and max_routes >= 3:
		r = 5
	return r


## Findings for one act measured as `m` against row `t` (Difficulty.targets(D)).
static func check(m: Dictionary, d: int, t: Dictionary) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var at := Vector2(m.route.x, 0.0)
	_ratio(out, "difficulty.screens", at, m.screens, float(t.screens), "screens")
	_ratio(out, "difficulty.enemy_density", at, m.density, float(t.enemies_per_screen), "enemies per screen")
	_ratio(out, "difficulty.ticket_density", at, m.ticket_density, float(t.tickets_per_screen), "tickets per screen")
	var ceiling := 0
	for tier in t.tiers:
		ceiling = maxi(ceiling, int(tier))
	if m.tier_missing > 0:
		_add(out, "error", "difficulty.tier_missing", at, "%d enemies have no `tier`" % m.tier_missing)
	if m.tier_max > ceiling:
		_add(out, "error", "difficulty.tier_ceiling", at,
				"T%d enemies in a D%d act (highest allowed T%d)" % [m.tier_max, d, ceiling])
	if m.enemies > 0:
		var all_tiers := {}
		for k in t.tiers:
			all_tiers[int(k)] = true
		for k in m.tier_pct:
			all_tiers[int(k)] = true
		for k in all_tiers:
			var want := float(t.tiers.get(k, 0))
			var got := float(m.tier_pct.get(k, 0.0))
			if absf(got - want) > TIER_POINTS:
				_add(out, "warn", "difficulty.tier_mix", at, "T%d is %.0f %% of enemies (row: %.0f %%)" % [k, got, want])
	var cp_off := absi(int(m.checkpoints) - int(t.checkpoints))
	if cp_off >= 1:
		_add(out, "error" if cp_off >= 2 else "warn", "difficulty.checkpoints", at,
				"%d checkpoints (row: %d)" % [m.checkpoints, t.checkpoints])
	var even: float = (m.route.y - m.route.x) / SCREEN_W / (int(m.checkpoints) + 1)
	if m.max_gap_screens > 1.75 * even and m.max_gap_screens > 3.0:
		_add(out, "warn", "difficulty.checkpoint_gap", at,
				"largest gap between start, checkpoints and goal is %.1f screens (even spacing %.1f)" % [m.max_gap_screens, even])
	var below := int(t.direction) - int(m.direction)
	if below >= 1:
		_add(out, "error" if below >= 2 else "warn", "difficulty.direction", at,
				"direction R%d, row R%d (vertical %.1f screens, leftward %.1f, routes %s, dead ends %d, doors/switches %d, forced %d)" % [
				m.direction, t.direction, m.vertical_screens, m.leftward_screens, str(m.routes),
				m.dead_ends, m.doors_switches, m.forced])
	return out


## Order findings over acts [{path, d, m}] (any order): each act with D >= 1
## against the act with the next lower D.
static func check_order(acts: Array) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var sorted := acts.filter(func(a: Dictionary) -> bool: return int(a.d) >= 1)
	sorted.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.d) < int(b.d))
	for i in range(1, sorted.size()):
		var prev: Dictionary = sorted[i - 1]
		var cur: Dictionary = sorted[i]
		if int(cur.d) == int(prev.d):
			continue
		var name := "%s (D%d) vs %s (D%d)" % [str(cur.path).get_file(), cur.d, str(prev.path).get_file(), prev.d]
		var a: Dictionary = cur.m
		var b: Dictionary = prev.m
		if a.density < b.density * (1.0 - ORDER_TOLERANCE):
			_add(out, "error", "difficulty.order", Vector2.ZERO, "%s: fewer enemies per screen (%.2f < %.2f)" % [name, a.density, b.density])
		if a.tier_max < b.tier_max:
			_add(out, "error", "difficulty.order", Vector2.ZERO, "%s: lower tier ceiling (T%d < T%d)" % [name, a.tier_max, b.tier_max])
		if a.direction < b.direction:
			_add(out, "error", "difficulty.order", Vector2.ZERO, "%s: lower direction score (R%d < R%d)" % [name, a.direction, b.direction])
		if a.ticket_density > b.ticket_density * (1.0 + ORDER_TOLERANCE):
			_add(out, "warn", "difficulty.order", Vector2.ZERO, "%s: more tickets per screen (%.1f > %.1f)" % [name, a.ticket_density, b.ticket_density])
	return out


## One line for reports.
static func summary(m: Dictionary) -> String:
	return ("%.1f screens, %d enemies (%.2f/screen, tiers %s, max T%d), %d checkpoints (gap %.1f screens), " +
			"%d tickets (%.1f/screen), vertical %.1f screens, routes %s, dead ends %d, leftward %.1f screens, " +
			"doors/switches %d, forced %d -> R%d") % [
			m.screens, m.enemies, m.density, str(m.tier_pct), m.tier_max, m.checkpoints, m.max_gap_screens,
			m.tickets, m.ticket_density, m.vertical_screens, str(m.routes), m.dead_ends, m.leftward_screens,
			m.doors_switches, m.forced, m.direction]


# --- Helpers -------------------------------------------------------------------------

static func _ratio(out: Array[Dictionary], rule: String, at: Vector2, got: float, want: float, what: String) -> void:
	if want <= 0.0:
		return
	var off := got / want - 1.0
	if absf(off) > TOLERANCE:
		_add(out, "error", rule, at, "%.2f %s, row %.2f (%+.0f %%, allowed ±25 %%)" % [got, what, want, off * 100.0])


static func _add(out: Array[Dictionary], severity: String, rule: String, at: Vector2, detail: String) -> void:
	out.append({severity = severity, rule = rule, at = at, detail = detail})


static func _is_enemy(node: Node) -> bool:
	var script := node.get_script() as Script
	while script != null:
		if script.get_global_name() == &"Enemy" or script.resource_path == ENEMY_BASE:
			return true
		script = script.get_base_script()
	return false


## Case-insensitive match of any word in the node's name, scene file or script.
static func _named(node: Node, words: Array) -> bool:
	var script := node.get_script() as Script
	var text := ("%s %s %s %s" % [node.name, node.scene_file_path,
			script.resource_path if script != null else "",
			script.get_global_name() if script != null else ""]).to_lower()
	for w in words:
		if text.contains(w):
			return true
	return false


## Nodes under root matching `test`, skipping anything inside a match (one
## instance counts once, not its children).
static func _all(root: Node, test: Callable) -> Array[Node]:
	var out: Array[Node] = []
	for child in root.get_children():
		_collect(child, test, out)
	return out


static func _collect(node: Node, test: Callable, out: Array[Node]) -> void:
	if test.call(node):
		out.append(node)
		return
	for child in node.get_children():
		_collect(child, test, out)


static func _first(root: Node, test: Callable) -> Node:
	var found := _all(root, test)
	return found[0] if not found.is_empty() else null


## Drops nodes that sit inside another node of the list.
static func _top_level(root: Node, nodes: Array[Node]) -> Array[Node]:
	var out: Array[Node] = []
	for n in nodes:
		var inside := false
		for other in nodes:
			if other != n and other.is_ancestor_of(n):
				inside = true
		if not inside:
			out.append(n)
	return out


static func _width(node: Node) -> float:
	if node is Control:
		return (node as Control).size.x
	for shape_node in node.find_children("*", "CollisionShape2D", true, false):
		var rect := (shape_node as CollisionShape2D).shape as RectangleShape2D
		if rect != null:
			return rect.size.x
	return SCREEN_W


## Floor runs that end at a wall too tall to jump (> 96 px), with no spring
## within 160 px, between x0 and x1. Both directions; one per 32 px cell.
static func _dead_ends(space: PhysicsDirectSpaceState2D, columns: Array, x0: float, x1: float,
		springs: Array[Vector2]) -> int:
	var seen := {}
	for i in range(1, columns.size() - 1):
		var c: Dictionary = columns[i]
		if c.skipped or c.x < x0 or c.x > x1:
			continue
		for f in c.floors:
			for dir in [-1, 1]:
				var next: Dictionary = columns[i + dir]
				if next.skipped or not Lint._near(next, f.y, 24.0).is_empty():
					continue
				var head := Vector2(c.x, f.y - 20.0)
				if Lint._ray(space, head, head + Vector2(12.0 * dir, 0.0), Lint.CEIL_MASK).is_empty():
					continue  # a drop or a gap, not a wall
				var climbable := false
				for k in range(1, 9):
					var j: int = i + dir * k
					if j < 0 or j >= columns.size():
						break
					for g in columns[j].floors:
						if g.y >= f.y - JUMP_UP and g.y < f.y - 4.0:
							climbable = true
				if climbable:
					continue
				var spot := Vector2(c.x, f.y)
				var near_spring := false
				for s in springs:
					if s.distance_to(spot) < SPRING_REACH:
						near_spring = true
				if near_spring:
					continue
				seen[Vector2i(int(c.x / 32.0), int(f.y / 32.0))] = true
	return seen.size()
