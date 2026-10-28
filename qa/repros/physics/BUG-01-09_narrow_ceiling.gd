extends TestCase
## BUG-01-09 repro (fails on physics @ 9f3303c). The ceiling counterpart of
## BUG-01-02: C/D sit at x +/- width radius (9 when standing, e.g. after a
## spring), so a hanging column narrower than 18 px, centred above, is missed
## and Sproto flies into it. The 01-02 fix added a centre ray to floor checks
## only. Expected: the head stops at the column's bottom (y -100).

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_spring_under_16px_column() -> void:
	var w := L.world(self)
	L.floor_at(w)
	L.rect(w, Rect2(-8, -400, 16, 300))  # column hanging down to y = -100
	var p = await L.spawn(self, w, Vector2.ZERO)
	p.launch(Vector2(0, -10))
	for i in 60:
		await physics_frames(1)
		var head: float = p.global_position.y - p.get_radii().y
		if head < -100.5 or L.centre_in_terrain(p):
			fail("frame %d: head at %.1f, above the column's bottom (-100)" % [i, head])
			return
