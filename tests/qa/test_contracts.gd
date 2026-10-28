extends TestCase
## QA contract checks against docs/CONTRACTS.md. Owned by QA.
##
## Every check SKIPs (prints "SKIP" and passes) when the thing it checks does
## not exist yet, so this file passes on a bare main and tightens as agents
## merge. Nothing here references another agent's class names directly (that
## would be a parse error before they exist); classes are found by script
## global name or path instead.
##   godot --headless --fixed-fps 60 --path . -s res://tests/run_tests.gd -- --filter=qa

const ZONE_IDS := [
	"common", "test_zone", "z1_retro_rush_hills", "z2_wizard_academy",
	"z3_capital_mansion", "z4_neon_rush_remix",
]
const SKIP_DIRS := [".godot", ".worktrees", "build", "node_modules"]

const LEVELS_DIR := "res://levels"
## Top-level folders under levels/ that hold parts, not act scenes.
const LEVEL_PART_DIRS := ["common", "objects", "enemies"]
const BOSSES_DIR := "res://bosses"
const LEVEL_ROOT_SCRIPT := "res://levels/common/level_root.gd"

const SPRITES_DIR := "res://assets/sprites"
const BACKGROUNDS_DIR := "res://assets/backgrounds"
const SPROTO_FRAMES := "res://assets/sprites/common/sproto/sproto_frames.tres"
const SPROTO_ANIMS := ["idle", "run", "jump", "hurt"]
const SPROTO_RUN_FRAMES := 4
const SPROTO_CELL := Vector2(64, 64)
const SPROTO_ANCHORS := "res://assets/sprites/common/sproto/anchors.json"
const ACCESSORY_DIRS := [
	"res://assets/sprites/z2_wizard_academy/wizard_hat",
	"res://assets/sprites/z3_capital_mansion/sunglasses",
]
const BACKGROUND_FILES := ["1_far.png", "2_distant.png", "3_mid.png", "4_near.png"]
## Texture import compress/mode values that keep pixel art clean:
## 0 = Lossless, 2 = VRAM Compressed, 3 = VRAM Uncompressed.
const PIXEL_ART_MODES := [0, 3]
const BACKGROUND_MODES := [0, 2, 3]

const AUDIO_EXTS := [
	"wav", "mp3", "flac", "aif", "aiff", "opus", "m4a", "aac", "wma",
	"mid", "midi", "xm", "mod", "it", "s3m", "ogg",
]
## Export-excluded folders (export_presets.cfg) are not checked for audio.
const AUDIO_SCAN_SKIP := ["tests", "tools", "docs", "qa"]

const PLAYER_SCENE := "res://player/player.tscn"
const PLAYER_STATES := [
	&"idle", &"run", &"skid", &"jump", &"roll", &"spindash", &"spring", &"hurt", &"dead",
]
## name: [max required args, min total args] from the contract signatures.
const PLAYER_METHODS := {
	"is_attacking": [0, 0],
	"is_invincible": [0, 0],
	"hurt": [1, 1],
	"kill": [0, 0],
	"bounce_off": [1, 1],
	"launch": [1, 1],
	"push_ground": [1, 2],
	"set_control_lock": [1, 1],
	"set_collision_path": [1, 1],
	"freeze": [1, 1],
	"play_pose": [1, 1],
	"respawn_at": [1, 1],
}
const PLAYER_STATIC_METHODS := {"from_area": [1, 1]}
const PLAYER_PROPERTIES := {
	"ground_speed": TYPE_FLOAT,
	"velocity": TYPE_VECTOR2,
	"ground_angle": TYPE_FLOAT,
	"grounded": TYPE_BOOL,
	"collision_mode": TYPE_INT,
	"state": TYPE_STRING_NAME,
	"facing": TYPE_INT,
	"clamp_rect": TYPE_RECT2,
}
const PLAYER_SIGNALS := {"state_changed": 2, "hurt_taken": 0, "died": 0}
const PLAYER_HITBOX_LAYER := 5

const CAMERA_SCENE := "res://camera/game_camera.tscn"
const CAMERA_METHODS := {
	"set_level_bounds": [1, 1],
	"lock_to": [1, 2],
	"unlock": [0, 1],
	"start_autoscroll": [1, 1],
	"stop_autoscroll": [0, 0],
	"shake": [2, 2],
}
const CAMERA_STATIC_METHODS := {"current": [0, 0]}

const BOSS_BASE := "res://bosses/boss_base.gd"
const BOSS_SIGNALS := {"hit_taken": 1, "phase_changed": 1, "defeated": 0}

## Script path: [global class name, native base it must extend].
const CONTRACT_SCRIPTS := {
	"res://levels/common/level_root.gd": ["LevelRoot", "Node"],
	"res://levels/enemies/enemy_base.gd": ["Enemy", "Node"],
	"res://bosses/boss_base.gd": ["Boss", "Node2D"],
}
## Contract scenes that must at least load and instantiate when present.
const CONTRACT_SCENES := [
	"res://player/scattered_coin.tscn",
	"res://terrain/loop.tscn",
	"res://levels/objects/coin.tscn",
	"res://ui/title/title_screen.tscn",
	"res://ui/zone_select/zone_select.tscn",
	"res://ui/hud/hud.tscn",
	"res://ui/pause/pause_menu.tscn",
	"res://ui/touch_controls/touch_controls.tscn",
	"res://ui/tally/score_tally.tscn",
	"res://ui/game_over/game_over.tscn",
	"res://ui/ending/ending.tscn",
]


# ---------------------------------------------------------------------------
# Levels and boss arenas


func test_levels_use_level_root() -> void:
	var scenes := PackedStringArray()
	var levels := DirAccess.open(LEVELS_DIR)
	if levels != null:
		for sub in levels.get_directories():
			if sub in LEVEL_PART_DIRS or sub.begins_with("."):
				continue
			_collect(LEVELS_DIR.path_join(sub), ".tscn", scenes)
		for file in levels.get_files():
			if file.ends_with(".tscn"):
				scenes.append(LEVELS_DIR.path_join(file))
	var bosses := DirAccess.open(BOSSES_DIR)
	if bosses != null:
		for sub in bosses.get_directories():
			var arena := BOSSES_DIR.path_join(sub).path_join("arena.tscn")
			if ResourceLoader.exists(arena):
				scenes.append(arena)
	for zone in ZoneRegistry.all_zones(true):
		var stage_paths: Array = zone.acts.duplicate()
		stage_paths.append(zone.boss)
		for path in stage_paths:
			if path != "" and ResourceLoader.exists(path) and not path in scenes:
				scenes.append(path)
	if scenes.is_empty():
		_skip("no level or arena scenes yet")
		return
	var checked := 0
	for path in scenes:
		if _check_level_scene(path):
			checked += 1
	if checked == 0:
		_skip("%d scene(s) under levels/ or bosses/, none with a root script" % scenes.size())


## Returns true if the scene has a root script and was checked.
func _check_level_scene(path: String) -> bool:
	var packed := load(path) as PackedScene
	if packed == null:
		fail("%s: does not load as a PackedScene" % path)
		return false
	var declares_script := _root_declares_script(packed.get_state())
	var root := packed.instantiate()
	if root == null:
		fail("%s: cannot instantiate" % path)
		return false
	var script := root.get_script() as Script
	if script == null:
		if declares_script:
			fail("%s: root script failed to load" % path)
		root.free()
		return declares_script
	if not script.can_instantiate() and not script.is_abstract():
		fail("%s: root script %s is broken (parse error?)" % [path, script.resource_path])
	elif not _inherits(script, &"LevelRoot", LEVEL_ROOT_SCRIPT):
		fail("%s: root script %s does not extend LevelRoot" % [path, script.resource_path])
	var start := root.get_node_or_null("PlayerStart")
	if not start is Marker2D:
		fail("%s: needs a PlayerStart (Marker2D) child" % path)
	var bounds := root.get_node_or_null("Bounds")
	if not bounds is ReferenceRect:
		fail("%s: needs a Bounds (ReferenceRect) child" % path)
	elif (bounds as ReferenceRect).size.x <= 0.0 or (bounds as ReferenceRect).size.y <= 0.0:
		fail("%s: Bounds has zero size" % path)
	root.free()
	return true


func _root_declares_script(state: SceneState) -> bool:
	if state.get_node_count() == 0:
		return false
	for i in state.get_node_property_count(0):
		if state.get_node_property_name(0, i) == &"script":
			return true
	return false


# ---------------------------------------------------------------------------
# Art


func test_sprite_frames_have_contract_animations() -> void:
	var files := PackedStringArray()
	_collect(SPRITES_DIR, ".tres", files)
	var checked := 0
	for path in files:
		var frames := ResourceLoader.load(path) as SpriteFrames
		if frames == null:
			continue
		checked += 1
		var names := frames.get_animation_names()
		if names.is_empty():
			fail("%s: SpriteFrames has no animations" % path)
		for anim in names:
			var count := frames.get_frame_count(anim)
			if count == 0:
				fail("%s: animation '%s' has no frames" % [path, anim])
			for i in count:
				if frames.get_frame_texture(anim, i) == null:
					fail("%s: animation '%s' frame %d has no texture" % [path, anim, i])
		if path == SPROTO_FRAMES or path.get_file() == "sproto_frames.tres":
			_check_sproto(path, frames)
	if checked == 0:
		_skip("no SpriteFrames under %s yet" % SPRITES_DIR)


func _check_sproto(path: String, frames: SpriteFrames) -> void:
	for anim in SPROTO_ANIMS:
		if not frames.has_animation(anim):
			fail("%s: missing contract animation '%s'" % [path, anim])
	if frames.has_animation("run") and frames.get_frame_count("run") < SPROTO_RUN_FRAMES:
		fail("%s: 'run' has %d frames, contract says %d" % [path, frames.get_frame_count("run"), SPROTO_RUN_FRAMES])
	for anim in frames.get_animation_names():
		for i in frames.get_frame_count(anim):
			var texture := frames.get_frame_texture(anim, i)
			if texture != null and texture.get_size() != SPROTO_CELL:
				fail("%s: '%s' frame %d is %s, cells must be %s" % [path, anim, i, texture.get_size(), SPROTO_CELL])


func test_accessories_have_head_anchors() -> void:
	var present := ACCESSORY_DIRS.filter(func(dir: String) -> bool: return DirAccess.dir_exists_absolute(dir))
	if present.is_empty():
		_skip("no accessory sprites yet")
		return
	if not FileAccess.file_exists(SPROTO_ANCHORS):
		fail("accessories exist (%s) but %s is missing" % [present, SPROTO_ANCHORS])
		return
	var text := FileAccess.get_file_as_string(SPROTO_ANCHORS)
	if JSON.parse_string(text) == null:
		fail("%s: not valid JSON" % SPROTO_ANCHORS)
	elif not text.contains("\"head\""):
		fail("%s: no 'head' points for the accessories" % SPROTO_ANCHORS)


func test_asset_folders_use_zone_ids() -> void:
	var checked := 0
	for base in [SPRITES_DIR, BACKGROUNDS_DIR]:
		var dir := DirAccess.open(base)
		if dir == null:
			continue
		for sub in dir.get_directories():
			if sub.begins_with(".") or sub.begins_with("_"):
				continue
			checked += 1
			if not sub in ZONE_IDS:
				fail("%s/%s: folder is not a zone id %s" % [base, sub, ZONE_IDS])
	var backgrounds := DirAccess.open(BACKGROUNDS_DIR)
	if backgrounds != null:
		for zone in backgrounds.get_directories():
			var zone_dir := BACKGROUNDS_DIR.path_join(zone)
			if _ignored(zone_dir):
				continue
			for file in DirAccess.get_files_at(zone_dir):
				if file.ends_with(".png") and not file in BACKGROUND_FILES:
					fail("%s/%s: background layers must be named %s" % [zone_dir, file, BACKGROUND_FILES])
	if checked == 0:
		_skip("no asset folders yet")


func test_png_imports_are_pixel_art_safe() -> void:
	var files := PackedStringArray()
	_collect("res://assets", ".png", files)
	if files.is_empty():
		_skip("no PNGs under assets/ yet")
		return
	for path in files:
		var import_path := path + ".import"
		if not FileAccess.file_exists(import_path):
			fail("%s: no .import file (commit it)" % path)
			continue
		var cfg := ConfigFile.new()
		if cfg.load(import_path) != OK:
			fail("%s: unreadable" % import_path)
			continue
		var importer := str(cfg.get_value("remap", "importer", ""))
		if importer != "texture":
			continue  # atlas, image or keep-file imports carry no texture settings
		var mode := int(cfg.get_value("params", "compress/mode", 0))
		var allowed: Array = BACKGROUND_MODES if path.begins_with(BACKGROUNDS_DIR) else PIXEL_ART_MODES
		if not mode in allowed:
			fail("%s: compress/mode=%d; pixel art needs one of %s (0 lossless, 2 VRAM, 3 VRAM uncompressed)" % [import_path, mode, allowed])
		if bool(cfg.get_value("params", "mipmaps/generate", false)):
			fail("%s: mipmaps/generate=true; pixel art must not use mipmaps" % import_path)


# ---------------------------------------------------------------------------
# Audio


func test_audio_is_ogg() -> void:
	var all_files := PackedStringArray()
	_collect("res://", "", all_files, AUDIO_SCAN_SKIP)
	var audio := Array(all_files).filter(func(path: String) -> bool:
		return path.get_extension().to_lower() in AUDIO_EXTS)
	if audio.is_empty():
		_skip("no audio files yet")
		return
	for path in audio:
		if path.get_extension().to_lower() != "ogg":
			fail("%s: audio must be .ogg (Ogg Vorbis)" % path)


# ---------------------------------------------------------------------------
# Player


func test_player_contract() -> void:
	if not ResourceLoader.exists(PLAYER_SCENE):
		_skip("no %s yet" % PLAYER_SCENE)
		return
	var packed := load(PLAYER_SCENE) as PackedScene
	if packed == null:
		fail("%s: does not load" % PLAYER_SCENE)
		return
	var player := packed.instantiate()
	if not player is Node2D:
		fail("%s: root must extend Node2D, got %s" % [PLAYER_SCENE, player.get_class()])
		player.free()
		return
	var script := player.get_script() as Script
	if script == null:
		fail("%s: root has no script" % PLAYER_SCENE)
		player.free()
		return
	if script.get_global_name() != &"Player":
		fail("%s: root script class_name must be Player, got '%s'" % [PLAYER_SCENE, script.get_global_name()])
	add_node(player)
	await physics_frames(2)
	if not is_instance_valid(player):
		fail("player freed itself when added to the tree")
		return
	assert_true(player.is_in_group(&"player"), "player must be in group 'player'")
	_check_methods(player, "Player", PLAYER_METHODS)
	_check_static_methods(script, "Player", PLAYER_STATIC_METHODS)
	_check_properties(player, "Player", PLAYER_PROPERTIES)
	_check_signals(player, "Player", PLAYER_SIGNALS)

	var state = player.get(&"state")
	if state != null and not StringName(str(state)) in PLAYER_STATES:
		fail("Player.state is '%s', not a contract state %s" % [state, PLAYER_STATES])
	var facing = player.get(&"facing")
	if facing != null and not int(facing) in [1, -1]:
		fail("Player.facing is %s, must be 1 or -1" % facing)
	var mode = player.get(&"collision_mode")
	if mode != null and (int(mode) < 0 or int(mode) > 3):
		fail("Player.collision_mode is %s, must be 0..3" % mode)

	var hitboxes := _find_hitboxes(player)
	if hitboxes.is_empty():
		fail("Player needs an Area2D hitbox on collision layer %d" % PLAYER_HITBOX_LAYER)
	elif _has_static(script, "from_area"):
		var found = script.call(&"from_area", hitboxes[0])
		assert_true(found == player, "Player.from_area(own hitbox) must return the player")
		var stranger := Area2D.new()
		add_node(stranger)
		assert_true(script.call(&"from_area", stranger) == null, "Player.from_area(other area) must return null")


func _find_hitboxes(node: Node) -> Array[Area2D]:
	var result: Array[Area2D] = []
	for child in node.find_children("*", "Area2D", true, false):
		var area := child as Area2D
		if area.get_collision_layer_value(PLAYER_HITBOX_LAYER):
			result.append(area)
	return result


# ---------------------------------------------------------------------------
# Camera


func test_camera_contract() -> void:
	if not ResourceLoader.exists(CAMERA_SCENE):
		_skip("no %s yet" % CAMERA_SCENE)
		return
	var packed := load(CAMERA_SCENE) as PackedScene
	if packed == null:
		fail("%s: does not load" % CAMERA_SCENE)
		return
	var camera := packed.instantiate()
	if not camera is Camera2D:
		fail("%s: root must extend Camera2D, got %s" % [CAMERA_SCENE, camera.get_class()])
		camera.free()
		return
	var script := camera.get_script() as Script
	if script == null:
		fail("%s: root has no script" % CAMERA_SCENE)
		camera.free()
		return
	if script.get_global_name() != &"GameCamera":
		fail("%s: root script class_name must be GameCamera, got '%s'" % [CAMERA_SCENE, script.get_global_name()])
	add_node(camera)
	await physics_frames(2)
	if not is_instance_valid(camera):
		fail("camera freed itself when added to the tree")
		return
	assert_true(camera.is_in_group(&"game_camera"), "camera must be in group 'game_camera'")
	_check_methods(camera, "GameCamera", CAMERA_METHODS)
	_check_static_methods(script, "GameCamera", CAMERA_STATIC_METHODS)
	if _has_static(script, "current"):
		assert_true(script.call(&"current") == camera, "GameCamera.current() must return the live camera")


# ---------------------------------------------------------------------------
# Base classes and other contract scenes


func test_contract_base_scripts() -> void:
	var checked := 0
	for path in CONTRACT_SCRIPTS:
		if not ResourceLoader.exists(path):
			continue
		checked += 1
		var script := load(path) as Script
		if script == null:
			fail("%s: does not load" % path)
			continue
		var expected: Array = CONTRACT_SCRIPTS[path]
		if script.get_global_name() != StringName(expected[0]):
			fail("%s: class_name must be %s, got '%s'" % [path, expected[0], script.get_global_name()])
		var base := script.get_instance_base_type()
		if base != StringName(expected[1]) and not ClassDB.is_parent_class(base, expected[1]):
			fail("%s: must extend %s, extends %s" % [path, expected[1], base])
	if ResourceLoader.exists(BOSS_BASE):
		var boss := load(BOSS_BASE) as Script
		if boss != null:
			var signals := {}
			for info in boss.get_script_signal_list():
				signals[info.name] = info.args.size()
			for signal_name in BOSS_SIGNALS:
				if not signals.has(signal_name):
					fail("Boss: missing signal %s" % signal_name)
				elif signals[signal_name] != BOSS_SIGNALS[signal_name]:
					fail("Boss: signal %s has %d args, contract %d" % [signal_name, signals[signal_name], BOSS_SIGNALS[signal_name]])
	if checked == 0:
		_skip("no LevelRoot / Enemy / Boss base scripts yet")


func test_contract_scenes_load() -> void:
	var checked := 0
	for path in CONTRACT_SCENES:
		if not ResourceLoader.exists(path):
			continue
		checked += 1
		var packed := load(path) as PackedScene
		if packed == null:
			fail("%s: does not load as a PackedScene" % path)
			continue
		var root := packed.instantiate()
		if root == null:
			fail("%s: cannot instantiate" % path)
			continue
		match path.get_file():
			"hud.tscn":
				assert_true(root is CanvasLayer, "%s: root must be a CanvasLayer" % path)
			"pause_menu.tscn":
				assert_eq(root.process_mode, Node.PROCESS_MODE_ALWAYS, "%s: process_mode must be ALWAYS;" % path)
			"score_tally.tscn":
				assert_true(root.has_signal(&"finished"), "%s: needs signal 'finished'" % path)
		root.free()
	if checked == 0:
		_skip("no other contract scenes yet")


# ---------------------------------------------------------------------------
# Helpers


func _skip(reason: String) -> void:
	print("  SKIP qa/test_contracts.gd: ", reason)


func _check_methods(object: Object, label: String, spec: Dictionary) -> void:
	var methods := {}
	for info in object.get_method_list():
		methods[info.name] = info
	for method_name in spec:
		if not methods.has(method_name):
			fail("%s: missing method %s()" % [label, method_name])
			continue
		_check_arity(label, method_name, methods[method_name], spec[method_name])


func _check_static_methods(script: Script, label: String, spec: Dictionary) -> void:
	for method_name in spec:
		var info := _script_method(script, method_name)
		if info.is_empty():
			fail("%s: missing static method %s()" % [label, method_name])
		elif not (int(info.flags) & METHOD_FLAG_STATIC):
			fail("%s: %s() must be static" % [label, method_name])
		else:
			_check_arity(label, method_name, info, spec[method_name])


func _check_arity(label: String, method_name: String, info: Dictionary, expected: Array) -> void:
	var total: int = info.args.size()
	var required: int = total - info.default_args.size()
	if required > expected[0] or total < expected[1]:
		fail("%s.%s() takes %d-%d args, contract needs %d-%d" % [label, method_name, required, total, expected[0], expected[1]])


func _check_properties(object: Object, label: String, spec: Dictionary) -> void:
	var props := {}
	for info in object.get_property_list():
		props[info.name] = info
	for prop_name in spec:
		if not props.has(prop_name):
			fail("%s: missing property %s" % [label, prop_name])
			continue
		var actual: int = props[prop_name].type
		var expected: int = spec[prop_name]
		if actual == expected or actual == TYPE_NIL:
			continue  # TYPE_NIL = untyped var; the value checks above still apply
		if expected == TYPE_STRING_NAME and actual == TYPE_STRING:
			print("  NOTE %s.%s is String; contract says StringName" % [label, prop_name])
			continue
		fail("%s.%s is %s, contract says %s" % [label, prop_name, type_string(actual), type_string(expected)])


func _check_signals(object: Object, label: String, spec: Dictionary) -> void:
	var signals := {}
	for info in object.get_signal_list():
		signals[info.name] = info.args.size()
	for signal_name in spec:
		if not signals.has(signal_name):
			fail("%s: missing signal %s" % [label, signal_name])
		elif signals[signal_name] != spec[signal_name]:
			fail("%s: signal %s has %d args, contract %d" % [label, signal_name, signals[signal_name], spec[signal_name]])


func _script_method(script: Script, method_name: String) -> Dictionary:
	var current := script
	while current != null:
		for info in current.get_script_method_list():
			if info.name == method_name:
				return info
		current = current.get_base_script()
	return {}


func _has_static(script: Script, method_name: String) -> bool:
	var info := _script_method(script, method_name)
	return not info.is_empty() and (int(info.flags) & METHOD_FLAG_STATIC) != 0


func _inherits(script: Script, global_name: StringName, path: String) -> bool:
	var current := script
	while current != null:
		if current.get_global_name() == global_name or current.resource_path == path:
			return true
		current = current.get_base_script()
	return false


func _ignored(dir_path: String) -> bool:
	return FileAccess.file_exists(dir_path.path_join(".gdignore"))


## Collects files with the given suffix under dir_path, skipping hidden,
## ignored (.gdignore) and build folders, plus any top-level folder in skip.
func _collect(dir_path: String, suffix: String, out: PackedStringArray, skip: Array = []) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null or _ignored(dir_path):
		return
	for sub in dir.get_directories():
		if sub.begins_with(".") or sub in SKIP_DIRS:
			continue
		if dir_path == "res://" and sub in skip:
			continue
		_collect(dir_path.path_join(sub), suffix, out, skip)
	for file in dir.get_files():
		if file.to_lower().ends_with(suffix):
			out.append(dir_path.path_join(file))
