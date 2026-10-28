extends TestCase
## BUG-01-03 repro (fails on physics @ 3aa4be3). Rolling into a tunnel lower
## than the standing hitbox (2 x 19 = 38 px) and slowing below 0.5 unrolls
## with no ceiling check: the standing hitbox sticks 6 px into the ceiling and
## jump is refused (no clearance) until Sproto walks out.
## Expected: stays rolling (or is forced to keep rolling) while the ceiling is too low.
## Actual: unrolls at x ~183 with the head at y -38 (ceiling at -32).

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_unroll_in_32px_tunnel() -> void:
	var w := L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(100, -332, 400, 300))  # ceiling bottom at y = -32
	var p = await L.spawn(self, w, Vector2.ZERO)
	p.ground_speed = 3.0
	press(&"move_down")
	await physics_frames(1)
	release(&"move_down")
	for i in 200:
		await physics_frames(1)
		var head: float = p.global_position.y - p.get_radii().y
		if p.global_position.x > 100 and p.global_position.x < 500 and head < -32.01:
			fail("frame %d: %s with the head at %.1f inside the ceiling (-32)" % [i, p.state, head])
			return
