extends TestCase
## Zone 3, Capital Mansion: both acts are registered and built from the
## zone's pieces (doors and switches, security beams, conveyors, rooftops
## in Act 1, shafts and the leftward bunker exit in Act 2), keep their
## enemies on the Zone 3 roster (T2-T4, no T1) and the in-act ramp, keep
## every respawn a screen clear of enemies and off moving terrain, Act 2's
## exit is reached by travelling left on a belt with the gate checkpoint
## beside it, each act's recorded run replays through Dev to the goal, and
## QA's bot clears both acts. Difficulty rows and lint are QA's (tests/qa).

const B := preload("res://levels/common/level_builder.gd")
const ZONE := "z3_capital_mansion"
const ACTS := {
	1: "res://levels/z3_capital_mansion/act1.tscn",
	2: "res://levels/z3_capital_mansion/act2.tscn",
}
const RUNS := {
	1: "res://tests/levels/inputs/z3_act1_run.json",
	2: "res://tests/levels/inputs/z3_act2_run.json",
}
const SCREEN := 424.0
const BOT := "res://tools/qa/playtest_bot.gd"

## Pieces every act must use, by scene: [act 1, act 2].
const REQUIRED := {
	B.DOOR: [3, 4],
	B.FLOOR_SWITCH: [3, 4],
	B.SECURITY_BEAM: [9, 10],
	B.CONVEYOR: [4, 4],
	B.BOOSTER: [2, 0],
	B.BOOKSHELF: [1, 5],
	B.CHECKPOINT: [5, 6],
	B.GOAL_SIGN: [1, 1],
}
const ROSTER := [B.CHASER, B.DRONE, B.DRONE_DIVER, B.CLERK, B.BOUNCER, B.SECURITY_PILL, B.CHANDELIER, B.CAMERA]


func _load(stage: int) -> Node:
	return (load(ACTS[stage]) as PackedScene).instantiate()


func _counts(root: Node) -> Dictionary:
	var counts := {}
	for node in root.find_children("*", "", true, false):
		if node.scene_file_path != "":
			counts[node.scene_file_path] = int(counts.get(node.scene_file_path, 0)) + 1
	return counts


func _progress(root: Node, x: float) -> float:
	var start := (root.get_node(^"PlayerStart") as Node2D).position.x
	var goal := (root.get_node(^"Objects/GoalSign") as Node2D).position.x
	return clampf((x - start) / (goal - start), 0.0, 1.0)


func _spawns(root: Node) -> Array[Vector2]:
	var out: Array[Vector2] = [(root.get_node(^"PlayerStart") as Node2D).position]
	for node in root.find_children("*", "", true, false):
		if node.scene_file_path == B.CHECKPOINT:
			out.append((node as Node2D).position)
	return out


func test_acts_are_registered_and_use_the_zone_pieces() -> void:
	for stage: int in ACTS:
		assert_eq(ZoneRegistry.stage_path(ZONE, stage), ACTS[stage], "act %d registered" % stage)
		var root := _load(stage)
		assert_true(root is LevelRoot, "act %d: a LevelRoot" % stage)
		assert_eq((root as LevelRoot).zone_id, ZONE, "act %d: zone id" % stage)
		assert_eq((root as LevelRoot).art_zone_id, ZONE, "act %d: Zone 3 art" % stage)
		var tiles := root.find_children("*", "TileMapLayer", true, false)
		assert_true(not tiles.is_empty() and (tiles[0] as TileMapLayer).tile_set.resource_path.contains(ZONE), "act %d: Zone 3 tiles" % stage)
		var counts := _counts(root)
		for path: String in REQUIRED:
			var need: int = REQUIRED[path][stage - 1]
			assert_true(int(counts.get(path, 0)) >= need, "act %d uses %s (%d of %d)" % [stage, path.get_file(), counts.get(path, 0), need])
		# Every switch opens at least one door that exists.
		for node in root.find_children("*", "", true, false):
			if node.scene_file_path == B.FLOOR_SWITCH:
				var doors: Array = node.get(&"doors")
				assert_true(not doors.is_empty() and node.get_node_or_null(doors[0]) != null, "%s opens a door" % node.name)
		root.free()


func test_enemies_follow_the_roster_and_the_in_act_ramp() -> void:
	for stage: int in ACTS:
		var root := _load(stage)
		var tiers := {}
		for node in root.find_children("*", "", true, false):
			if not node is Enemy:
				continue
			var enemy := node as Enemy
			assert_true(enemy.scene_file_path in ROSTER, "act %d: %s is on the Zone 3 roster" % [stage, enemy.name])
			assert_true(enemy.tier >= 2, "act %d: %s is T2 or above (no T1 in the row)" % [stage, enemy.name])
			if _progress(root, enemy.position.x) < Difficulty.OPENING_END:
				assert_true(enemy.tier <= 3, "act %d: %s (T%d) in the opening" % [stage, enemy.name, enemy.tier])
			tiers[enemy.tier] = int(tiers.get(enemy.tier, 0)) + 1
		for tier in [2, 3, 4]:
			assert_true(int(tiers.get(tier, 0)) > 0, "act %d meets T%d enemies %s" % [stage, tier, tiers])
		# Divers hang at least 120 px above the floor beneath them (BUG-Z2-01).
		for node in root.find_children("*", "", true, false):
			if node.scene_file_path == B.DRONE_DIVER:
				assert_true(float(node.get(&"min_dive_drop")) >= 120.0, "%s keeps the dive floor" % node.name)
		root.free()


## Every respawn is a screen clear of enemies and off moving terrain (lifts, doors).
func test_spawns_are_fair_and_on_solid_ground() -> void:
	for stage: int in ACTS:
		var root := _load(stage)
		var spawns := _spawns(root)
		var movers: Array[Rect2] = []
		for node in root.find_children("*", "", true, false):
			if node.scene_file_path in [B.BOOKSHELF, B.DOOR]:
				var size: Vector2 = node.get(&"size")
				var at := (node as Node2D).position
				var rect := Rect2(at, size) if node.scene_file_path == B.BOOKSHELF else Rect2(at - Vector2(0, size.y), size)
				movers.append(rect.grow(48.0))
		for spot in spawns:
			for rect in movers:
				assert_true(not rect.has_point(spot), "act %d: spawn %s clear of moving terrain %s" % [stage, spot, rect])
		for node in root.find_children("*", "", true, false):
			if not node is Enemy:
				continue
			var at := (node as Node2D).position
			for spot in spawns:
				# A screen away along the route, or on another level out of the respawn's view.
				assert_true(absf(at.x - spot.x) > SCREEN or absf(at.y - spot.y) > 200.0,
						"act %d: %s %.0f px from a respawn at x %.0f" % [stage, node.name, at.x - spot.x, spot.x])
		root.free()


func test_act_2_exit_is_reached_travelling_left_past_the_gate_checkpoint() -> void:
	var root := _load(2)
	var goal := (root.get_node(^"Objects/GoalSign") as Node2D).position
	var marker := root.get_node_or_null(^"LeftwardBunkerExit") as ReferenceRect
	assert_true(marker != null and marker.size.x >= SCREEN, "a leftward stretch at least a screen wide")
	var belt := root.get_node_or_null(^"Terrain/ExitConveyor")
	assert_true(belt != null and float(belt.get(&"speed")) < 0.0, "the exit belt carries left")
	assert_true(belt != null and (belt as Node2D).position.x > goal.x and (belt as Node2D).position.x - goal.x < 2.0 * SCREEN,
			"the goal is at the belt's left end")
	var last := Vector2(-INF, 0)
	for p in _spawns(root):
		if p.x > last.x:
			last = p
	var gate := Vector2(INF, 0)
	for p in _spawns(root):
		if absf(p.y - (goal.y - 19.0)) < 1.0 and p.x < gate.x:
			gate = p
	assert_true(gate.x < INF and absf(gate.x - goal.x) <= 2.25 * SCREEN, "a checkpoint beside the arena gate (%.0f px)" % absf(gate.x - goal.x))
	var tickets := 0
	for node in root.find_children("*", "", true, false):
		if node is Node2D and absf((node as Node2D).position.y - goal.y) < 40.0 and (node as Node2D).position.x > goal.x \
				and (node as Node2D).position.x < goal.x + 2.0 * SCREEN:
			assert_true(not node is Enemy, "no enemy in the exit corridor (%s)" % node.name)
			tickets += 1 if node.scene_file_path == B.TICKET else 0
	assert_true(tickets >= 3 and tickets <= 12, "a few tickets in the corridor (%d)" % tickets)
	root.free()


func test_act_1_recorded_run_reaches_the_goal_then_act_2() -> void:
	var result := _run_bot(["--zone=" + ZONE, "--stage=1", "--policy=none", "--inputs=" + RUNS[1], "--frames=10800"])
	if result.is_empty():
		return
	_check_run(result, 1)
	var scenes: Array = result.get("scenes", []).map(func(s: Dictionary) -> String: return s.path)
	assert_true(ACTS[2] in scenes, "act 1's goal leads to act 2 (%s)" % [scenes])


func test_act_2_recorded_run_reaches_the_goal() -> void:
	var result := _run_bot(["--zone=" + ZONE, "--stage=2", "--policy=none", "--inputs=" + RUNS[2], "--frames=13200"])
	if result.is_empty():
		return
	_check_run(result, 2)


## QA's playtest bot (hold right, jump when blocked) clears both acts.
func test_playtest_bot_clears_both_acts() -> void:
	for stage: int in ACTS:
		var result := _run_bot(["--zone=" + ZONE, "--stage=%d" % stage, "--frames=18000", "--jump-every=90"])
		if result.is_empty():
			return
		assert_true(result.get("level_completed", false), "act %d: the bot reached the goal" % stage)
		assert_eq(int(result.get("nan_frames", -1)), 0, "act %d: no NaN" % stage)


func _check_run(result: Dictionary, stage: int) -> void:
	assert_true(result.get("level_completed", false), "act %d: the recorded run reached the goal" % stage)
	assert_eq(int(result.get("deaths", -1)), 0, "act %d: no deaths" % stage)
	assert_eq(int(result.get("nan_frames", -1)), 0, "act %d: no NaN" % stage)
	var done := int(result.get("level_completed_frame", -1))
	for period: Dictionary in result.get("stuck_periods", []):
		assert_true(int(period.start) >= done, "act %d: never stuck before the goal (%s)" % [stage, period])


func _run_bot(args: Array) -> Dictionary:
	if not ResourceLoader.exists(BOT):
		print("  SKIP levels/test_z3_acts.gd: no %s" % BOT)
		return {}
	var output: Array = []
	var command := PackedStringArray(["--headless", "--fixed-fps", "60", "--path",
			ProjectSettings.globalize_path("res://"), "-s", BOT, "--"])
	command.append_array(PackedStringArray(args))
	OS.execute(OS.get_executable_path(), command, output, true)
	var text := "\n".join(output)
	var at := text.find("PLAYTEST_RESULT ")
	if at < 0:
		fail("no bot result: %s" % text.right(400))
		return {}
	var json: Variant = JSON.parse_string(text.substr(at + 16).get_slice("\n", 0))
	if not json is Dictionary:
		fail("unreadable bot result")
		return {}
	return json
