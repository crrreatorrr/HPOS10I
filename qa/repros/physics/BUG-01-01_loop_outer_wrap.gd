extends TestCase
## BUG-01-01 repro (fails on physics @ 3aa4be3). Running off the outer top of
## terrain/loop.tscn wraps Sproto around the ring's outside, under the floor
## line and out of the world. Run: copy to tests/qa/ in a review copy, then
##   godot --headless --fixed-fps 60 --path <copy> -s res://tests/run_tests.gd -- --filter=BUG-01-01
## Expected: Sproto runs off the loop top and lands on the floor (feet y = 0).
## Actual (path A, running right): centre inside the floor from frame ~61,
## ends near y = 2100 (fell out of the world). Mirrored on path B running left.

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_run_off_loop_top() -> void:
	for case in [[1, 0], [-1, 1]]:  # [direction, collision path]
		var w := L.world(self)
		L.floor_at(w, -4000, 4000)
		var lp := L.loop(w, Vector2.ZERO, 112.0)
		var p = await L.spawn(self, w, Vector2(-500, 0))
		p.respawn_at(Vector2(0, -2.0 * lp.radius - lp.thickness - 60.0))
		p.set_collision_path(case[1])
		for i in 60:
			await physics_frames(1)
			if p.grounded:
				break
		p.ground_speed = 3.0 * case[0]
		var action := &"move_right" if case[0] > 0 else &"move_left"
		press(action)
		var buried := -1
		for i in 240:
			await physics_frames(1)
			if buried < 0 and L.centre_in_terrain(p):
				buried = i
		release(action)
		assert_true(buried < 0, "dir %d path %d: centre inside the floor from frame %d" % [case[0], case[1], buried])
		assert_true(p.grounded and absf(L.feet_y(p)) < 0.05,
				"dir %d path %d: should end on the floor, ends at %s" % [case[0], case[1], p.global_position])
