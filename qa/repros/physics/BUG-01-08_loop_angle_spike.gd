extends TestCase
## BUG-01-08 repro (fails on physics @ 9f3303c; the same kind of failure
## happens at 3aa4be3 on a radius-80 loop). A floor ray that grazes a vertex of
## the loop polygon (here the B ray at x 18.864, the arc vertex at 17.14 deg)
## sometimes returns the normal of an internal edge of the convex
## decomposition: the ground angle jumps 6 -> 125 deg in one frame, Sproto is
## thrown up and backwards across the loop and fails it.
## Expected: the angle changes smoothly at the loop entry and the loop completes.

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_radius_64_entry_at_10() -> void:
	var w := L.world(self)
	L.floor_at(w, -5000, 5000)
	var lp := L.loop(w, Vector2.ZERO, 64.0)
	var p = await L.spawn(self, w, Vector2(-400.0, 0))
	p.ground_speed = 10.0
	press(&"move_right")
	var last: float = p.ground_angle
	var was_grounded := true
	var worst := 0.0
	var exit_x: float = lp.radius + lp.thickness + lp.floor_margin + 40.0
	for i in 300:
		await physics_frames(1)
		if p.grounded and was_grounded:
			worst = maxf(worst, absf(wrapf(p.ground_angle - last, -180.0, 180.0)))
		last = p.ground_angle
		was_grounded = p.grounded
		if p.global_position.x > exit_x:
			break
	release(&"move_right")
	assert_true(worst < 40.0, "largest grounded angle step %.1f deg" % worst)
	assert_true(p.global_position.x > exit_x, "completed the loop (x %.0f)" % p.global_position.x)
