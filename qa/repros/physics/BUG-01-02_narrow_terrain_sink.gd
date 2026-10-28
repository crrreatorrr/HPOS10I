extends TestCase
## BUG-01-02 repro (fails on physics @ 3aa4be3). Solid terrain narrower than
## the A/B floor sensor span (2 x width_radius = 18 px) is missed when Sproto
## lands centred on it: he sinks into it and drops to whatever is below.
## Expected: lands on top of the 16 px pillar (feet y = 0).
## Actual: no sensor hits; the centre enters the pillar at frame 27 and keeps falling.

const L := preload("res://tests/qa/qa_physics_lib.gd")


func test_land_on_16px_pillar() -> void:
	for width in [8.0, 16.0]:
		var w := L.world(self)
		L.floor_at(w, -2000, 2000, 300)
		L.rect(w, Rect2(-width / 2.0, 0, width, 300))
		var p = await L.spawn(self, w, Vector2(0, 300))
		p.respawn_at(Vector2(0, -80))
		for i in 90:
			await physics_frames(1)
			if L.centre_in_terrain(p):
				fail("%s px pillar: centre inside the pillar at frame %d (%s)" % [width, i, p.global_position])
				break
			if p.grounded:
				break
		assert_near(L.feet_y(p), 0.0, 0.05, "%s px pillar: standing on top" % width)
