extends TestCase
## Zone 2, Wizard Academy: both acts are registered and built from the zone's
## pieces (shifting staircases, bookshelf lifts and gates, candles, falling
## books, the flying-broom autoscroll chase and a breakable-wall secret in
## Act 2), climb more than two screens, keep their enemies on the Zone 2
## roster and the in-act ramp, follow the fair-spawn rules (and never put a
## spawn on moving terrain), Act 2 ends in a calm corridor by the gate
## checkpoint, each act's recorded human-like run replays through Dev to the
## goal, and QA's bot clears both acts. Difficulty rows and lint are QA's
## (tests/qa).

const B := preload("res://levels/common/level_builder.gd")
const ZONE := "z2_wizard_academy"
const ACTS := {
	1: "res://levels/z2_wizard_academy/act1.tscn",
	2: "res://levels/z2_wizard_academy/act2.tscn",
}
const RUNS := {
	1: "res://tests/levels/inputs/z2_act1_run.json",
	2: "res://tests/levels/inputs/z2_act2_run.json",
}
const SCREEN := 424.0
const BOT := "res://tools/qa/playtest_bot.gd"

## Pieces every act must use, by scene: [act 1, act 2].
const REQUIRED := {
	B.SHIFTING_STAIRCASE: [3, 2],
	B.BOOKSHELF: [3, 4],
	B.CANDLE: [6, 6],
	B.FALLING_BOOK: [4, 4],
	B.AUTOSCROLL: [0, 1],
	B.BREAKABLE_WALL: [0, 1],
	B.CHECKPOINT: [4, 5],
	B.GOAL_SIGN: [1, 1],
}
## The Zone 2 roster: the Zone 1 pills, the spellbook pills (Floater, Diver),
## the knight pill (Armored) and, in the finales, the lantern pill (Dropper).
const ROSTER := [B.WALKER, B.HOPPER, B.CHASER, B.PELLET_PILL, B.SPELLBOOK, B.SPELLBOOK_DIVER, B.KNIGHT, B.LANTERN]


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
		assert_eq((root as LevelRoot).art_zone_id, ZONE, "act %d: Zone 2 art" % stage)
		var tiles := root.find_children("*", "TileMapLayer", true, false)
		assert_true(not tiles.is_empty() and (tiles[0] as TileMapLayer).tile_set.resource_path.contains(ZONE),
				"act %d: built from the Zone 2 tiles" % stage)
		var counts := _counts(root)
		for path: String in REQUIRED:
			var need: int = REQUIRED[path][stage - 1]
			assert_true(int(counts.get(path, 0)) >= need, "act %d uses %s (%d of %d)" % [stage, path.get_file(), counts.get(path, 0), need])
		root.free()


func test_acts_climb_more_than_two_screens() -> void:
	for stage: int in ACTS:
		var root := _load(stage)
		var spawns := _spawns(root)
		var ys: Array[float] = []
		for p in spawns:
			ys.append(p.y)
		ys.sort()
		assert_true(ys[-1] - ys[0] >= 2.0 * 240.0 - 64.0, "act %d: spawn points %.0f px apart in height" % [stage, ys[-1] - ys[0]])
		root.free()


func test_enemies_follow_the_roster_and_the_in_act_ramp() -> void:
	for stage: int in ACTS:
		var root := _load(stage)
		var tiers := {}
		for node in root.find_children("*", "", true, false):
			if not node is Enemy:
				continue
			var enemy := node as Enemy
			assert_true(enemy.scene_file_path in ROSTER, "act %d: %s is on the Zone 2 roster" % [stage, enemy.name])
			var at := _progress(root, enemy.position.x)
			if enemy.tier == 4:
				assert_true(at >= Difficulty.FINALE_START, "act %d: %s (T4) only in the finale" % [stage, enemy.name])
			if at < Difficulty.OPENING_END:
				assert_true(enemy.tier <= 2, "act %d: %s (T%d) in the opening" % [stage, enemy.name, enemy.tier])
			tiers[enemy.tier] = int(tiers.get(enemy.tier, 0)) + 1
		for tier in [1, 2, 3, 4]:
			assert_true(int(tiers.get(tier, 0)) > 0, "act %d meets T%d enemies %s" % [stage, tier, tiers])
		root.free()


## Fair spawns (checklist ZN-J11) and moving terrain (CONTRACTS.md: never a
## checkpoint or PlayerStart on a moving platform).
func test_spawns_are_fair_and_on_solid_ground() -> void:
	for stage: int in ACTS:
		var root := _load(stage)
		var spawns := _spawns(root)
		var movers: Array[Rect2] = []
		for node in root.find_children("*", "", true, false):
			if node.scene_file_path in [B.SHIFTING_STAIRCASE, B.BOOKSHELF]:
				var at := (node as Node2D).position
				var size: Vector2 = node.get(&"size") if node.scene_file_path == B.BOOKSHELF else \
						Vector2(48.0 * int(node.get(&"steps")), 32.0 * int(node.get(&"steps")))
				var rect := Rect2(at, size) if node.scene_file_path == B.BOOKSHELF else Rect2(at - Vector2(0, size.y), size)
				movers.append(rect.grow(48.0))
		for spot in spawns:
			for rect in movers:
				assert_true(not rect.has_point(spot), "act %d: spawn at %s is clear of moving terrain %s" % [stage, spot, rect])
		for node in root.find_children("*", "", true, false):
			if not node is Enemy:
				continue
			var x := (node as Node2D).position.x
			for spot in spawns:
				assert_true(absf(x - spot.x) > SCREEN, "act %d: %s %.0f px from a respawn at x %.0f" % [stage, node.name, x - spot.x, spot.x])
				assert_true(x <= spot.x or x - spot.x > 2.0 * SCREEN, "act %d: %s %.0f px after a respawn" % [stage, node.name, x - spot.x])
		root.free()


func test_act_2_has_the_broom_chase_after_a_checkpoint_and_a_calm_end() -> void:
	var root := _load(2)
	var chase := root.find_children("*", "", true, false).filter(func(n: Node) -> bool: return n.scene_file_path == B.AUTOSCROLL)
	assert_eq(chase.size(), 1, "one broom chase")
	var start := (chase[0] as Node2D).position.x
	var before := _spawns(root).filter(func(p: Vector2) -> bool: return p.x < start)
	assert_true(not before.is_empty() and start - (before[-1] as Vector2).x <= 3.0 * SCREEN,
			"a checkpoint shortly before the chase (a death restarts it)")
	var goal := (root.get_node(^"Objects/GoalSign") as Node2D).position.x
	var last := -INF
	for p in _spawns(root):
		last = maxf(last, p.x)
	assert_true(goal - last <= 2.25 * SCREEN, "a checkpoint %.0f px before the arena gate" % (goal - last))
	var tickets := 0
	for node in root.find_children("*", "", true, false):
		var x := (node as Node2D).position.x if node is Node2D else -INF
		if x < last - 2.0 * SCREEN or x > goal:
			continue
		assert_true(not node is Enemy, "no enemy in the last corridor (%s)" % node.name)
		tickets += 1 if node.scene_file_path == B.TICKET else 0
	assert_true(tickets >= 3 and tickets <= 12, "a few tickets in the corridor (%d)" % tickets)
	root.free()


func test_act_1_recorded_run_reaches_the_goal_then_act_2() -> void:
	var result := _run_bot(["--zone=" + ZONE, "--stage=1", "--policy=none", "--inputs=" + RUNS[1], "--frames=8400"])
	if result.is_empty():
		return
	_check_run(result, 1)
	var scenes: Array = result.get("scenes", []).map(func(s: Dictionary) -> String: return s.path)
	assert_true(ACTS[2] in scenes, "act 1's goal leads to act 2 (%s)" % [scenes])


func test_act_2_recorded_run_takes_the_secret_and_reaches_the_goal() -> void:
	var result := _run_bot(["--zone=" + ZONE, "--stage=2", "--policy=none", "--inputs=" + RUNS[2], "--frames=11400"])
	if result.is_empty():
		return
	_check_run(result, 2)
	assert_true(int(result.get("state_frames", {}).get("roll", 0)) > 0, "act 2: the run rolls (the cracked wall)")


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


## Runs the playtest bot in a child Godot and returns its JSON summary ({} = skipped).
func _run_bot(args: Array) -> Dictionary:
	if not ResourceLoader.exists(BOT):
		print("  SKIP levels/test_z2_acts.gd: no %s" % BOT)
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
