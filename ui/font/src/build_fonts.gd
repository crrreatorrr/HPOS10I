extends SceneTree
## Converts the BMFont sources in this folder (written by ../make_font.py)
## into ready-made FontFile resources: res://ui/font/<name>.res. Those load
## without an import step, so a fresh checkout's first `godot --import` (and
## the theme loaded while it runs) never sees a missing font.
## Run by make_font.py:
##   godot --headless --path <project> -s res://ui/font/src/build_fonts.gd
## This folder has a .gdignore: nothing here is imported or exported.

const SRC := "res://ui/font/src/"
const OUT := "res://ui/font/"


func _initialize() -> void:
	var failed := false
	for file in DirAccess.get_files_at(SRC):
		if not file.ends_with(".fnt"):
			continue
		# The same settings Godot's BMFont importer uses, with integer-only
		# scaling so 2x/3x text stays crisp.
		var font := FontFile.new()
		font.antialiasing = TextServer.FONT_ANTIALIASING_NONE
		font.generate_mipmaps = false
		font.multichannel_signed_distance_field = false
		font.force_autohinter = false
		font.hinting = TextServer.HINTING_NONE
		font.oversampling = 1.0
		var err := font.load_bitmap_font(SRC + file)
		font.allow_system_fallback = false
		font.fixed_size_scale_mode = TextServer.FIXED_SIZE_SCALE_INTEGER_ONLY
		var out := OUT + file.get_basename() + ".res"
		if err == OK:
			err = ResourceSaver.save(font, out, ResourceSaver.FLAG_COMPRESS)
		print("build_fonts: %s -> %s (%s)" % [file, out, error_string(err)])
		failed = failed or err != OK
	quit(1 if failed else 0)
