extends TestCase
## The test zone: structure and D0 targets, spawning on solid ground, the
## recorded human-like run (it must use both springs, the booster, the loop
## and the breakable wall) and the QA playtest bot clearing it.

const W := preload("res://tests/levels/level_world.gd")
const SCENE := "res://levels/test_zone/test_zone.tscn"
const RUN := "res://tests/levels/inputs/test_zone_run.json"
const BOT := "res://tools/qa/playtest_bot.gd"

## Every object the route needs, by scene.
const REQUIRED := {
	"res://terrain/loop.tscn": 1,
	"res://levels/objects/spring_up.tscn": 1,
	"res://levels/objects/spring_diagonal.tscn": 1,
	"res://levels/objects/speed_booster.tscn": 1,
	"res://levels/objects/breakable_wall.tscn": 1,
	"res://levels/objects/checkpoint.tscn": 1,
	"res://levels/objects/goal_sign.tscn": 1,
	"res://levels/enemies/walker.tscn": 1,
	"res://levels/enemies/hopper.tscn": 1,
	"res://levels/objects/ticket.tscn": 60,
}


func test_structure_and_d0_targets() -> void:
	assert_eq(ZoneRegistry.stage_path("test_zone", 1), SCENE, "registered as the test zone's act")
	var root := (load(SCENE) as PackedScene).instantiate()
	assert_true(root is LevelRoot, "root is a LevelRoot")
	assert_eq((root as LevelRoot).zone_id, "test_zone", "zone id")
	assert_eq((root as LevelRoot).art_zone_id, "z1_retro_rush_hills", "shows Zone 1 art")
	assert_true(root.get_node_or_null(^"PlayerStart") is Marker2D, "PlayerStart")
	var bounds := root.get_node_or_null(^"Bounds") as ReferenceRect
	assert_true(bounds != null and bounds.size.x > 424.0 and bounds.size.y >= 240.0, "Bounds bigger than the screen")
	var counts := {}
	for node in root.find_children("*", "", true, false):
		if node.scene_file_path != "":
			counts[node.scene_file_path] = int(counts.get(node.scene_file_path, 0)) + 1
	for path: String in REQUIRED:
		assert_true(int(counts.get(path, 0)) >= REQUIRED[path], "uses %s (%d)" % [path.get_file(), counts.get(path, 0)])
	assert_true(root.find_children("*", "TileMapLayer", true, false).size() > 0, "built mostly from tiles")
	assert_true(root.find_children("*", "StaticBody2D", true, false).any(func(n: Node) -> bool:
		return n is CurveTerrain and n.shape == CurveTerrain.Shape.QUARTER_PIPE), "a quarter pipe")
	# D0 row of docs/LEVELS.md: ~20 screens, 0.2 T1 enemies per screen, 1 checkpoint, ~6 tickets per screen.
	var targets := Difficulty.targets(0)
	var screens := bounds.size.x / 424.0
	var enemies := root.find_children("*", "", true, false).filter(func(n: Node) -> bool: return n is Enemy)
	assert_near(screens, targets.screens, 2.0, "length in screens")
	assert_near(enemies.size() / screens, targets.enemies_per_screen, 0.05, "enemies per screen")
	for enemy in enemies:
		assert_eq((enemy as Enemy).tier, 1, "%s is T1" % enemy.name)
	assert_eq(int(counts.get("res://levels/objects/checkpoint.tscn", 0)), targets.checkpoints, "checkpoints")
	var tickets := int(counts.get("res://levels/objects/ticket.tscn", 0))
	assert_near(tickets / screens, targets.tickets_per_screen, targets.tickets_per_screen * 0.25, "tickets per screen")
	root.free()


func test_player_start_is_on_solid_ground() -> void:
	var level := await W.test_zone(self)
	await physics_frames(120)
	assert_true(level.player.grounded, "standing after 120 frames with no input")
	assert_true(level.player.state != &"dead", "alive")
	assert_near(level.player.global_position.x, level.get_node(^"PlayerStart").global_position.x, 0.5, "where it started")


## Replays the recorded run in-process, booted the way Dev replays it
## (SceneRouter.open_scene, frames counted from that call), and checks the
## route features it is meant to show off.
func test_recorded_run_uses_every_feature_and_reaches_the_goal() -> void:
	var events := Dev.load_timeline(RUN)
	assert_true(events.size() > 5, "timeline loaded")
	var seen := {spring_up = false, spring_diagonal = false, booster = false, loop = false, goal = false}
	GameState.level_completed.connect(func() -> void: seen.goal = true)
	SceneRouter.open_scene(SCENE)
	var level: LevelRoot = null
	var player: Player = null
	var enemies_at_start := 0
	var frame := 0
	while frame < 2000 and not seen.goal:
		await physics_frames(1)
		frame += 1
		while not events.is_empty() and events[0][0] <= frame:
			var event: Array = events.pop_front()
			if event[2]:
				press(StringName(event[1]))
			else:
				release(StringName(event[1]))
		if level == null:
			level = tree.current_scene as LevelRoot
			if level == null:
				continue
			level.use_scene_router = false
			enemies_at_start = tree.get_nodes_in_group(&"enemies").size()
		if player == null:
			player = level.player
			player.state_changed.connect(func(_old: StringName, new: StringName) -> void:
				if new == &"spring":
					var v := player.velocity
					if absf(v.y + 10.0) < 0.01 and absf(v.x) < 9.0:
						seen.spring_up = true
					if absf(v.x - 10.0) < 0.01 and absf(v.y + 10.0) < 0.01:
						seen.spring_diagonal = true)
			continue
		if player.state == &"dead":
			fail("died at x %.0f (frame %d)" % [player.global_position.x, frame])
			break
		if player.grounded and player.ground_speed >= 11.9 and player.control_lock > 0:
			seen.booster = true
		if player.grounded and player.collision_mode == Player.CEILING:
			seen.loop = true
	for key: String in seen:
		assert_true(seen[key], "the run used: %s" % key)
	if level != null:
		var wall := level.get_node(^"Objects/BreakableWall") as BreakableWall
		assert_true(wall.is_broken(), "the run broke the wall")
		assert_eq(tree.get_nodes_in_group(&"enemies").filter(func(e: Node) -> bool: return (e as Enemy).alive).size(), 0,
				"the run beat all %d enemies" % enemies_at_start)
		assert_true(frame < 1800, "a quick run (goal at frame %d)" % frame)
	tree.unload_current_scene()


## The lead's recording path: Dev replays the timeline from boot.
func test_recorded_run_replays_through_dev() -> void:
	var result := _run_bot(["--scene=" + SCENE, "--policy=none", "--inputs=" + RUN, "--frames=1700"])
	if result.is_empty():
		return
	assert_true(result.get("level_completed", false), "reached the goal")
	assert_eq(int(result.get("deaths", -1)), 0, "no deaths")


## QA's playtest bot (hold right, jump when blocked) clears the zone.
func test_playtest_bot_clears_the_test_zone() -> void:
	var result := _run_bot(["--scene=" + SCENE, "--frames=5400"])
	if result.is_empty():
		return
	assert_true(result.get("level_completed", false), "the bot reached the goal")
	assert_eq(int(result.get("deaths", -1)), 0, "no deaths")
	assert_eq(int(result.get("nan_frames", -1)), 0, "no NaN")
	var done := int(result.get("level_completed_frame", -1))
	for period: Dictionary in result.get("stuck_periods", []):
		assert_true(int(period.start) >= done, "never stuck before the goal (%s)" % period)


## Runs the playtest bot in a child Godot and returns its JSON summary ({} = skipped).
func _run_bot(args: Array) -> Dictionary:
	if not ResourceLoader.exists(BOT):
		print("  SKIP levels/test_test_zone.gd: no %s" % BOT)
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
