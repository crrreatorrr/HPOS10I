extends TestCase
## The rest of the Player contract: springs, boosters, control lock, paths,
## freeze, poses, respawn, clamp_rect and the hitbox.

const W := preload("res://tests/physics/physics_world.gd")

var world: Node2D
var player: Player


func _flat() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	player = W.spawn_player(world, Vector2.ZERO)
	await W.settle(self, player, Vector2.ZERO)


func test_from_area() -> void:
	await _flat()
	assert_eq(Player.from_area(player.hitbox), player, "hitbox maps to the player")
	var other := Area2D.new()
	world.add_child(other)
	assert_eq(Player.from_area(other), null, "other areas map to null")
	assert_eq(Player.from_area(null), null, "null is safe")
	assert_eq(player.hitbox.collision_layer, 1 << 4, "hitbox on layer 5")
	assert_true(player.is_in_group(&"player"), "in group player")


func test_state_changed_signal() -> void:
	await _flat()
	var changes: Array = []
	player.state_changed.connect(func(old: StringName, new: StringName) -> void: changes.append([old, new]))
	press(&"move_right")
	await physics_frames(2)
	assert_eq(changes.size(), 1, "one change")
	assert_eq(changes[0], [&"idle", &"run"], "idle -> run")


func test_launch_is_a_spring_not_a_jump() -> void:
	await _flat()
	player.launch(Vector2(0.0, -10.0))
	assert_eq(player.state, &"spring", "spring state")
	assert_true(not player.is_attacking(), "springs do not attack")
	await physics_frames(1)
	assert_near(player.velocity.y, -10.0 + 0.21875, 1e-6, "no jump-release cut (jump not held)")
	for i in 200:
		await physics_frames(1)
		if player.grounded:
			break
	assert_true(player.grounded, "landed")
	assert_eq(player.state, &"idle", "spring state ends on landing")


func test_push_ground_locks_control() -> void:
	await _flat()
	player.push_ground(10.0, 16)
	assert_near(player.ground_speed, 10.0, 1e-6, "pushed")
	assert_eq(player.control_lock, 16, "locked")
	press(&"move_left")
	await physics_frames(10)
	assert_near(player.ground_speed, 10.0 - 10 * 0.046875, 1e-6, "input ignored (friction only)")
	await physics_frames(10)
	assert_true(player.ground_speed < 10.0 - 20 * 0.046875 - 1.0, "control back after the lock")


func test_collision_path_selects_terrain() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	W.add_rect(world, Rect2(100, -100, 40, 100), W.PATH_A)
	W.add_rect(world, Rect2(300, -100, 40, 100), W.PATH_B)
	player = W.spawn_player(world, Vector2.ZERO)
	await W.settle(self, player, Vector2.ZERO)
	player.ground_speed = 4.0
	await physics_frames(60)
	assert_near(player.global_position.x, 90.0, 0.01, "path A wall blocks on path A")
	player.set_collision_path(Player.PATH_B)
	player.ground_speed = 6.0
	await physics_frames(120)
	assert_near(player.global_position.x, 290.0, 0.01, "passed the A wall, stopped by the B wall")


func test_freeze() -> void:
	await _flat()
	player.ground_speed = 5.0
	player.freeze(true)
	var x := player.global_position.x
	press(&"move_right")
	await physics_frames(20)
	assert_eq(player.global_position.x, x, "frozen in place")
	player.play_pose(&"victory")
	assert_eq(player.pose, &"victory", "pose shown")
	player.freeze(false)
	await physics_frames(5)
	assert_true(player.global_position.x > x, "moves again")


func test_respawn_at_resets() -> void:
	await _flat()
	player.kill()
	player.respawn_at(Vector2(50, -19))
	assert_eq(player.state, &"idle", "idle")
	assert_true(not player.is_invincible(), "not invincible")
	await physics_frames(2)
	assert_true(player.grounded, "on the floor")
	assert_near(player.global_position.x, 50.0, 0.01, "at the new spot")


func test_clamp_rect_pushes_and_crushes() -> void:
	world = W.new_world(self)
	W.add_floor(world)
	W.add_rect(world, Rect2(200, -100, 40, 100))
	player = W.spawn_player(world, Vector2(100, 0))
	await W.settle(self, player, Vector2(100, 0))
	player.clamp_rect = Rect2(120, -300, 400, 400)
	await physics_frames(1)
	assert_near(player.global_position.x, 120.0 + Tuning.physics.width_radius, 0.01, "pushed by the left edge")
	assert_true(player.state != &"dead", "alive")
	for i in 100:
		player.clamp_rect.position.x += 2.0
		await physics_frames(1)
		if player.state == &"dead":
			break
	assert_eq(player.state, &"dead", "crushed against the wall")


func test_kill_and_died_signal() -> void:
	await _flat()
	var died := [0]
	player.died.connect(func() -> void: died[0] += 1)
	player.kill()
	assert_eq(player.state, &"dead", "dead")
	await physics_frames(70)
	assert_eq(died[0], 1, "died once")
	player.kill()
	assert_eq(died[0], 1, "kill while dead does nothing")


func test_accessory_follows_zone() -> void:
	var old_zone := SceneRouter.zone_id
	SceneRouter.zone_id = "z2_wizard_academy"
	await _flat()
	var accessory := player.get_node("Visual/Accessory")
	assert_eq(accessory.accessory, "wizard_hat", "wizard hat in the wizard zone")
	SceneRouter.zone_id = "z3_capital_mansion"
	accessory.refresh()
	assert_eq(accessory.accessory, "sunglasses", "sunglasses in the mansion zone")
	SceneRouter.zone_id = old_zone
	accessory.refresh()
	assert_eq(accessory.accessory, "", "none elsewhere")
	assert_true(not accessory.visible, "hidden when there is no accessory")
