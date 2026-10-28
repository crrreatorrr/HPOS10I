extends TestCase
## The spinning emerald icon: whole-pixel widths that never reach 0, the
## darkened mirrored back face past edge-on, the edge strip, one turn a
## second, and the placeholder gem while the art is missing.

const SCENE := "res://ui/emerald/emerald_icon.tscn"


func test_width_is_whole_even_pixels_and_never_zero() -> void:
	for size in [EmeraldIcon.BIG_SIZE, EmeraldIcon.SMALL_SIZE]:
		var widths := {}
		for i in 2000:
			var angle := TAU * i / 2000.0
			var w := EmeraldIcon.width_for(angle, size)
			widths[w] = true
			if w <= 0 or w > size or w % 2 != 0:
				fail("size %d at %.3f rad: width %d" % [size, angle, w])
				break
		assert_true(widths.has(size), "%d px: reaches full width face-on" % size)
		assert_true(widths.has(EmeraldIcon.EDGE_WIDTH), "%d px: narrows to the edge strip" % size)


func test_back_face_shows_when_cos_is_negative() -> void:
	var icon: EmeraldIcon = add_scene(SCENE)
	icon.spin_speed = 0.0
	for angle in [0.0, 0.3, PI * 0.49, PI * 1.51, TAU - 0.1]:
		icon.phase = angle
		assert_true(not icon.is_back_face(), "front at %.2f rad" % angle)
	for angle in [PI * 0.51, PI, PI * 1.25, PI * 1.49]:
		icon.phase = angle
		assert_true(icon.is_back_face(), "back at %.2f rad" % angle)
	icon.phase = PI * 0.5
	assert_true(icon.is_edge_on(), "edge-on at a quarter turn")
	assert_eq(icon.face_width(), EmeraldIcon.EDGE_WIDTH, "edge strip is 2 px, never 0")


func test_one_turn_per_second_at_any_frame_rate() -> void:
	for fps in [30, 60, 144]:
		var icon: EmeraldIcon = add_scene(SCENE)
		icon.phase = 0.0
		var turned := 0.0
		for i in fps:
			var before := icon.phase
			icon._process(1.0 / fps)
			turned += fposmod(icon.phase - before, TAU)
		assert_near(turned, TAU, 0.001, "%d fps: one full turn in a second" % fps)
		icon.spin_speed = 2.5
		var before := icon.phase
		icon._process(0.1)
		assert_near(fposmod(icon.phase - before, TAU), TAU * 0.25, 0.001, "spin_speed is turns per second")


func test_placeholder_gem_until_the_art_exists() -> void:
	var big: EmeraldIcon = add_scene(SCENE)
	var small: EmeraldIcon = add_scene(SCENE)
	small.small = true
	assert_eq(big.face_texture().get_size(), Vector2(48, 48), "48 px face")
	assert_eq(small.face_texture().get_size(), Vector2(16, 16), "16 px slot face")
	if Emeralds.icon() == null:
		assert_eq(big.face_texture(), EmeraldIcon.placeholder_texture(48), "placeholder while the art is missing")
		var image := EmeraldIcon.placeholder_texture(48).get_image()
		assert_true(image.get_pixel(24, 24).g > image.get_pixel(24, 24).r, "the placeholder is green")
		assert_eq(image.get_pixel(0, 0).a, 0.0, "round, with transparent corners")


func test_draws_in_every_state_without_errors() -> void:
	var icon: EmeraldIcon = add_scene(SCENE)
	icon.position = Vector2(212, 120)
	icon.sparkle()
	for angle in [0.0, PI * 0.5, PI, PI * 1.2]:
		icon.phase = angle
		icon.queue_redraw()
		await tree.process_frame
	icon.empty = true
	icon.queue_redraw()
	await tree.process_frame
	assert_true(icon.is_inside_tree(), "still alive")
