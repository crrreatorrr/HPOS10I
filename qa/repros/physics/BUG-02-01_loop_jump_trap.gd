extends TestCase
## Repro for BUG-02-01 (qa/reports/02-test-level.md): jumping on the run-up
## into a loop lands Sproto inside the ring on path B. He can't walk back out
## to the left; holding right only rocks him up the ring (6 px/f is too slow
## for a full turn), and only a spin dash or roll gets out.
## Run: copy to tests/qa/test_bug_02_01.gd (the runner loads test_*.gd) and filter with `-- --filter=bug_02_01`.
## FAILS while the bug exists (that's the point); not part of the suite.

const LOOP_X := 2400.0  # the playground's radius-112 loop


func test_jumping_into_the_loop_can_be_walked_out_of() -> void:
	var z := add_scene("res://playground/physics_playground.tscn")
	tree.current_scene = z
	await physics_frames(10)
	var p: Node2D = z.get(&"player")
	# Jump about 290 px before the loop centre at run speed (6 px/f).
	p.respawn_at(Vector2(LOOP_X - 293.0 - 200.0, -19.0))
	await physics_frames(2)
	p.ground_speed = 6.0
	press(&"move_right")
	await physics_frames(33)
	press(&"jump")
	await physics_frames(8)
	release(&"jump")
	await physics_frames(150)
	release(&"move_right")
	var inside: bool = absf(p.global_position.x - LOOP_X) < 112.0
	print("  INFO after the jump: (%.0f, %.0f) path %d inside the ring: %s" % [p.global_position.x, p.global_position.y, p.collision_path, inside])
	# Walking back out to the left must work (as from a too-slow ground entry).
	press(&"move_left")
	var min_x: float = p.global_position.x
	for i in 300:
		await physics_frames(1)
		min_x = minf(min_x, p.global_position.x)
	release(&"move_left")
	assert_true(not inside or min_x < LOOP_X - 240.0,
			"from inside the ring, 5 s of holding left leaves the loop (min x %.0f, footprint starts %.0f)" % [min_x, LOOP_X - 240.0])
