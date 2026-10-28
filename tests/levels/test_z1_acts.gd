extends TestCase
## Zone 1, Retro Rush Hills: both acts are registered and built from the
## zone's pieces (loops, springs, boosters, waterfalls, the breakable-wall
## secret and the switchback in Act 2), their enemies follow the roster and
## the fair-spawn rules, Act 2 ends in a calm corridor by a checkpoint, each
## act's recorded human-like run (tests/levels/inputs/record_act_run.gd)
## replays through Dev to the goal and on to the next stage, and QA's bot
## clears both acts. Difficulty rows and lint are checked by QA (tests/qa).

const B := preload("res://levels/common/level_builder.gd")
const ZONE := "z1_retro_rush_hills"
const ACTS := {
	1: "res://levels/z1_retro_rush_hills/act1.tscn",
	2: "res://levels/z1_retro_rush_hills/act2.tscn",
}
const RUNS := {
	1: "res://tests/levels/inputs/z1_act1_run.json",
	2: "res://tests/levels/inputs/z1_act2_run.json",
}
const SCREEN := 424.0
const BOT := "res://tools/qa/playtest_bot.gd"

## Pieces every act must use, by scene: [act 1, act 2].
const REQUIRED := {
	B.LOOP: [2, 2],
	B.SPRING_UP: [2, 1],
	B.SPRING_DIAGONAL: [1, 3],
	B.BOOSTER: [2, 2],
	B.WATERFALL: [2, 2],
	B.CHECKPOINT: [3, 4],
	B.GOAL_SIGN: [1, 1],
	B.BREAKABLE_WALL: [0, 1],
}
## The Zone 1 roster: T1 plus the new T2s, and the T3 spike pill for Act 2's finale.
const ROSTER := [B.WALKER, B.HOPPER, B.CHASER, B.FLOATER, B.PELLET_PILL, B.SPIKE_PILL]


func _load(stage: int) -> Node:
	return (load(ACTS[stage]) as PackedScene).instantiate()


func _counts(root: Node) -> Dictionary:
	var counts := {}
	for node in root.find_children("*", "", true, false):
		if node.scene_file_path != "":
			counts[node.scene_file_path] = int(counts.get(node.scene_file_path, 0)) + 1
	return counts


## Progress 0..1 of `x` between PlayerStart and the goal sign (as LevelRoot.progress_at).
func _progress(root: Node, x: float) -> float:
	var start := (root.get_node(^"PlayerStart") as Node2D).position.x
	var goal := (root.get_node(^"Objects/GoalSign") as Node2D).position.x
	return clampf((x - start) / (goal - start), 0.0, 1.0)


func test_acts_are_registered_and_use_the_zone_pieces() -> void:
	for stage: int in ACTS:
		assert_eq(ZoneRegistry.stage_path(ZONE, stage), ACTS[stage], "act %d registered" % stage)
		var root := _load(stage)
		assert_true(root is LevelRoot, "act %d: a LevelRoot" % stage)
		var level := root as LevelRoot
		assert_eq(level.zone_id, ZONE, "act %d: zone id" % stage)
		assert_eq(level.art_zone_id, ZONE, "act %d: Zone 1 art" % stage)
		assert_true(root.get_node_or_null(^"PlayerStart") is Marker2D, "act %d: PlayerStart" % stage)
		var bounds := root.get_node_or_null(^"Bounds") as ReferenceRect
		assert_true(bounds != null and bounds.size.x > 40.0 * SCREEN, "act %d: a long act" % stage)
		assert_true(root.find_children("*", "TileMapLayer", true, false).size() > 0, "act %d: built from tiles" % stage)
		var counts := _counts(root)
		for path: String in REQUIRED:
			var need: int = REQUIRED[path][stage - 1]
			assert_true(int(counts.get(path, 0)) >= need, "act %d uses %s (%d of %d)" % [stage, path.get_file(), counts.get(path, 0), need])
		assert_true(int(counts.get(B.TICKET, 0)) > 4 * bounds.size.x / SCREEN, "act %d: plenty of tickets" % stage)
		for waterfall in root.find_children("Waterfall*", "", true, false):
			assert_true(waterfall.find_children("*", "CollisionObject2D", true, false).is_empty()
					and not waterfall is CollisionObject2D, "%s is decoration (no collision)" % waterfall.name)
		root.free()


func test_act_2_has_the_secret_and_the_switchback() -> void:
	var root := _load(2)
	var wall := root.find_children("*", "", true, false).filter(func(n: Node) -> bool:
		return n.scene_file_path == B.BREAKABLE_WALL)
	assert_eq(wall.size(), 1, "one breakable wall")
	var marker := root.get_node_or_null(^"LeftwardZigzag") as ReferenceRect
	assert_true(marker != null and marker.size.x >= SCREEN, "a leftward stretch at least a screen wide")
	var left := root.get_node_or_null(^"Objects/ZigzagSpringLeft") as Node2D
	var right := root.get_node_or_null(^"Objects/ZigzagSpringRight") as Node2D
	assert_true(left != null and int(left.get(&"facing")) == -1, "a spring sends Sproto back left")
	assert_true(right != null and int(right.get(&"facing")) == 1 and right.position.y < left.position.y,
			"and one higher up sends him right again")
	root.free()


func test_enemies_follow_the_roster_and_the_in_act_ramp() -> void:
	for stage: int in ACTS:
		var root := _load(stage)
		var ceiling := 1 if stage == 1 else 2
		var t2 := 0
		for node in root.find_children("*", "", true, false):
			if not node is Enemy:
				continue
			var enemy := node as Enemy
			assert_true(enemy.scene_file_path in ROSTER, "act %d: %s is on the Zone 1 roster" % [stage, enemy.name])
			var finale := _progress(root, enemy.position.x) >= Difficulty.FINALE_START
			var allowed := ceiling + (1 if finale else 0)
			assert_true(enemy.tier <= allowed, "act %d: %s (T%d) within T%d" % [stage, enemy.name, enemy.tier, allowed])
			t2 += 1 if enemy.tier == 2 else 0
		assert_true(t2 > 0, "act %d meets the new T2s" % stage)
		root.free()


## Fair spawns (checklist ZN-J11): nothing within 2 screens after a
## checkpoint, and nothing within 1 screen of a respawn point, so no enemy is
## active next to Sproto when he (re)spawns.
func test_spawns_are_fair() -> void:
	for stage: int in ACTS:
		var root := _load(stage)
		var spawns: Array[float] = [(root.get_node(^"PlayerStart") as Node2D).position.x]
		for node in root.find_children("*", "", true, false):
			if node.scene_file_path == B.CHECKPOINT:
				spawns.append((node as Node2D).position.x)
		for node in root.find_children("*", "", true, false):
			if not node is Enemy:
				continue
			var x := (node as Node2D).position.x
			for at in spawns:
				assert_true(absf(x - at) > SCREEN, "act %d: %s %.0f px from a respawn at x %.0f" % [stage, node.name, x - at, at])
				assert_true(x <= at or x - at > 2.0 * SCREEN, "act %d: %s %.0f px after a respawn at x %.0f" % [stage, node.name, x - at, at])
		root.free()


func test_act_2_ends_in_a_calm_corridor_by_a_checkpoint() -> void:
	var root := _load(2)
	var goal := (root.get_node(^"Objects/GoalSign") as Node2D).position.x
	var last_checkpoint := -INF
	for node in root.find_children("*", "", true, false):
		if node.scene_file_path == B.CHECKPOINT:
			last_checkpoint = maxf(last_checkpoint, (node as Node2D).position.x)
	assert_true(goal - last_checkpoint <= 2.25 * SCREEN, "a checkpoint %.0f px before the goal (<= 2.25 screens)" % (goal - last_checkpoint))
	var corridor := Vector2(last_checkpoint - 2.0 * SCREEN, goal)
	var tickets := 0
	for node in root.find_children("*", "", true, false):
		var x := (node as Node2D).position.x if node is Node2D else -INF
		if x < corridor.x or x > corridor.y:
			continue
		assert_true(not node is Enemy, "no enemy in the last corridor (%s)" % node.name)
		tickets += 1 if node.scene_file_path == B.TICKET else 0
	assert_true(tickets >= 3 and tickets <= 12, "a few tickets in the corridor (%d)" % tickets)
	root.free()


func test_act_1_recorded_run_reaches_the_goal_then_act_2() -> void:
	var result := _run_bot(["--zone=" + ZONE, "--stage=1", "--policy=none", "--inputs=" + RUNS[1], "--frames=6000"])
	if result.is_empty():
		return
	_check_run(result, 1)
	var scenes: Array = result.get("scenes", []).map(func(s: Dictionary) -> String: return s.path)
	assert_true(ACTS[2] in scenes, "act 1's goal leads to act 2 (%s)" % [scenes])


func test_act_2_recorded_run_takes_the_secret_and_reaches_the_goal() -> void:
	var result := _run_bot(["--zone=" + ZONE, "--stage=2", "--policy=none", "--inputs=" + RUNS[2], "--frames=7800"])
	if result.is_empty():
		return
	_check_run(result, 2)
	assert_true(int(result.get("state_frames", {}).get("roll", 0)) > 0, "act 2: the run rolls (the breakable wall)")
	var scenes: Array = result.get("scenes", []).map(func(s: Dictionary) -> String: return s.path)
	assert_true(scenes.size() >= 3 and scenes[-1] != ACTS[2], "act 2's goal moves on (no arena yet: the menu) %s" % [scenes])


## QA's playtest bot (hold right, jump when blocked) clears both acts.
func test_playtest_bot_clears_both_acts() -> void:
	for stage: int in ACTS:
		var result := _run_bot(["--zone=" + ZONE, "--stage=%d" % stage, "--frames=12000"])
		if result.is_empty():
			return
		assert_true(result.get("level_completed", false), "act %d: the bot reached the goal" % stage)
		assert_eq(int(result.get("nan_frames", -1)), 0, "act %d: no NaN" % stage)


## The recorded run, replayed the way Dev replays it (boot with --zone/--stage
## and --inputs), reaches the goal with no deaths, using springs and loops.
func _check_run(result: Dictionary, stage: int) -> void:
	assert_true(result.get("level_completed", false), "act %d: the recorded run reached the goal" % stage)
	assert_eq(int(result.get("deaths", -1)), 0, "act %d: no deaths" % stage)
	assert_eq(int(result.get("nan_frames", -1)), 0, "act %d: no NaN" % stage)
	assert_true(int(result.get("state_frames", {}).get("spring", 0)) > 0, "act %d: the run takes springs" % stage)
	var done := int(result.get("level_completed_frame", -1))
	assert_true(done > 0 and done < 60 * 120, "act %d: a brisk run (goal at frame %d)" % [stage, done])
	for period: Dictionary in result.get("stuck_periods", []):
		assert_true(int(period.start) >= done, "act %d: never stuck before the goal (%s)" % [stage, period])


## Runs the playtest bot in a child Godot and returns its JSON summary ({} = skipped).
func _run_bot(args: Array) -> Dictionary:
	if not ResourceLoader.exists(BOT):
		print("  SKIP levels/test_z1_acts.gd: no %s" % BOT)
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
