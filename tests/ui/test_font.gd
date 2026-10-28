extends TestCase
## The Sproto Pixel fonts: every required glyph is in each glyph sheet and
## each pre-built FontFile, lowercase falls back to capitals, the fonts need
## no import step, and the theme uses them.

const REQUIRED := "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-.!?/x'"
const FONTS := ["sproto_small", "sproto_small_outline", "sproto_bold", "sproto_bold_gold"]
const DIR := "res://ui/font/"
## Generator output (BMFont sheets); .gdignore'd, read straight from disk.
const SRC := "res://ui/font/src/"


func test_every_font_file_has_the_required_glyphs() -> void:
	for name in FONTS:
		var font := load(DIR + name + ".res") as FontFile
		assert_true(font != null, "%s.res loads as a FontFile" % name)
		if font == null:
			continue
		for i in REQUIRED.length():
			var c := REQUIRED.unicode_at(i)
			if not font.has_char(c):
				fail("%s: missing %s" % [name, REQUIRED[i]])
			elif font.get_char_size(c, 8).x <= 0:
				fail("%s: empty %s" % [name, REQUIRED[i]])
		assert_true(font.has_char("a".unicode_at(0)) and font.has_char(" ".unicode_at(0)), "%s: lowercase and space" % name)


func test_every_glyph_sheet_has_ink_for_each_required_glyph() -> void:
	for name in FONTS:
		var image := Image.load_from_file(ProjectSettings.globalize_path(SRC + name + ".png"))
		assert_true(image != null and not image.is_empty(), "%s.png loads" % name)
		if image == null or image.is_empty():
			continue
		var rects := _parse_fnt(SRC + name + ".fnt")
		for i in REQUIRED.length():
			var c := REQUIRED.unicode_at(i)
			if not rects.has(c):
				fail("%s.fnt: no entry for %s" % [name, REQUIRED[i]])
				continue
			if not _has_ink(image, rects[c]):
				fail("%s.png: glyph %s is blank" % [name, REQUIRED[i]])


func test_glyphs_are_distinct() -> void:
	# Hand-drawn glyphs: no two required characters share a bitmap.
	var image := Image.load_from_file(ProjectSettings.globalize_path(SRC + "sproto_bold.png"))
	var rects := _parse_fnt(SRC + "sproto_bold.fnt")
	var seen := {}
	for i in REQUIRED.length():
		var rect: Rect2i = rects[REQUIRED.unicode_at(i)]
		var key := image.get_region(rect).get_data().hex_encode()
		if seen.has(key):
			fail("%s and %s look the same" % [seen[key], REQUIRED[i]])
		seen[key] = REQUIRED[i]


func test_theme_uses_the_pixel_fonts() -> void:
	var theme := load("res://ui/theme/game_theme.tres") as Theme
	assert_true(theme != null, "game_theme.tres loads")
	assert_eq(theme.default_font.resource_path, DIR + "sproto_small.res", "default font")
	assert_eq(theme.default_font_size, 8, "native size")
	for variation in ["HudLabel", "HudValue", "TitleLabel", "OutlineLabel", "HeaderLabel"]:
		assert_true(theme.get_type_variation_list(&"Label").has(StringName(variation)), "variation %s" % variation)
	assert_eq(theme.get_font(&"font", &"HudLabel").resource_path, DIR + "sproto_bold_gold.res", "HUD labels in gold")


func test_fonts_need_no_import_step() -> void:
	# A fresh checkout's first import loads the project theme before anything
	# is imported, so the fonts must be plain resources.
	for name in FONTS:
		assert_true(FileAccess.file_exists(DIR + name + ".res"), "%s.res is committed" % name)
		assert_true(not FileAccess.file_exists(DIR + name + ".res.import"), "%s.res is not imported" % name)
		var font := load(DIR + name + ".res") as FontFile
		if font != null:
			assert_eq(font.fixed_size, 8, "%s: 8 px bitmap font" % name)
			assert_eq(font.fixed_size_scale_mode, TextServer.FIXED_SIZE_SCALE_INTEGER_ONLY, "%s: integer scaling" % name)
			assert_eq(font.antialiasing, TextServer.FONT_ANTIALIASING_NONE, "%s: no antialiasing" % name)
	assert_true(FileAccess.file_exists(SRC + ".gdignore"), "generator sources are never imported")


func _parse_fnt(path: String) -> Dictionary:
	var rects := {}
	for line in FileAccess.get_file_as_string(path).split("\n"):
		if not line.begins_with("char "):
			continue
		var keys := {}
		for part in line.split(" ", false):
			var kv := part.split("=")
			if kv.size() == 2:
				keys[kv[0]] = int(kv[1])
		rects[keys.id] = Rect2i(keys.x, keys.y, keys.width, keys.height)
	return rects


func _has_ink(image: Image, rect: Rect2i) -> bool:
	for y in range(rect.position.y, rect.end.y):
		for x in range(rect.position.x, rect.end.x):
			if image.get_pixel(x, y).a > 0.5:
				return true
	return false
