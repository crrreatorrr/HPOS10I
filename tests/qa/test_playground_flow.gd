extends TestCase
## QA full-QA guards for the shipped playground (qa/reports/00-full-qa.md):
## death and respawn without losing a life, the --accessory preview and the
## F1 overlay toggle. Skips until the playground exists.

const SCENE := "res://playground/physics_playground.tscn"

var _saved_args := {}


func before_each() -> void:
	_saved_args = Dev.args.duplicate()


func after_each() -> void:
	Dev.args = _saved_args
	Dev.send_action(&"debug_overlay", false)


func _open() -> Node:
	if not ResourceLoader.exists(SCENE):
		print("  SKIP qa/test_playground_flow.gd: no playground yet")
		return null
	var scene := add_scene(SCENE)
	await physics_frames(5)
	return scene


func test_death_respawns_at_the_start_without_losing_a_life() -> void:
	var scene: Node = await _open()
	if scene == null:
		return
	var player: Node2D = scene.get(&"player")
	var start: Node2D = scene.get(&"start")
	var lives: int = GameState.lives
	player.global_position.x += 300.0
	await physics_frames(2)
	player.call(&"kill")
	var dead_frames := 0
	while str(player.get(&"state")) == "dead" and dead_frames < 600:
		await physics_frames(1)
		dead_frames += 1
	print("  INFO playground respawn after %d frames (contract: about 2 s)" % dead_frames)
	assert_true(dead_frames < 600, "respawned")
	assert_eq(GameState.lives, lives, "no life lost in the playground")
	assert_true(player.global_position.distance_to(start.global_position) < 2.0,
			"back at PlayerStart (at %s)" % player.global_position)
	await physics_frames(30)
	assert_true(bool(player.get(&"grounded")), "standing on the floor after respawn")


func test_accessory_flag_previews_the_accessory() -> void:
	if not ResourceLoader.exists(SCENE):
		print("  SKIP qa/test_playground_flow.gd: no playground yet")
		return
	for id in ["wizard_hat", "sunglasses"]:
		Dev.args = _saved_args.duplicate()
		Dev.args["accessory"] = id
		var scene: Node = await _open()
		var accessory := scene.find_child("Accessory", true, false)
		assert_true(accessory != null, "player has an Accessory node")
		if accessory != null:
			assert_eq(str(accessory.get(&"accessory")), id, "accessory shown")
		scene.queue_free()
		await physics_frames(2)


func test_f1_overlay_is_off_by_default_and_toggles() -> void:
	Dev.args.erase("overlay")
	var scene: Node = await _open()
	if scene == null:
		return
	var overlay: Node = null
	for node in scene.find_children("*", "", true, false):
		if node.has_method(&"set_overlay_visible"):
			overlay = node
	assert_true(overlay != null, "player has the debug overlay")
	if overlay == null:
		return
	assert_eq(overlay.get(&"visible"), false, "overlay hidden by default")
	Dev.send_action(&"debug_overlay", true)
	await physics_frames(2)
	Dev.send_action(&"debug_overlay", false)
	await physics_frames(2)
	assert_eq(overlay.get(&"visible"), true, "overlay shown after the debug_overlay action")
