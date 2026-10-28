class_name LevelRoot
extends Node2D
## Root of every act scene and boss arena (docs/CONTRACTS.md, "Levels").
##
## Expected children: `PlayerStart` (Marker2D), `Bounds` (ReferenceRect) and
## any structure for `Terrain`, `Objects` and `Enemies`.
##
## On _ready it:
##   - spawns Sproto at the checkpoint (GameState.checkpoint_position) or at
##     PlayerStart. Both mark Sproto's centre; if that is closer than his
##     height radius to the floor below, he is lifted to stand on it, so a
##     marker dropped on the ground line works too;
##   - adds res://camera/game_camera.tscn (or fallback_camera.gd) and gives
##     it the Bounds rect as its limits;
##   - adds the HUD when its scene exists (a small debug label stands in for
##     it). The pause menu and touch controls are global (Display autoload);
##   - dresses the level in its art zone (art_zone_id): the parallax backdrop
##     from res://assets/backgrounds/<id>/ (or placeholder layers drawn in
##     code), set_art_zone(id) on every CurveTerrain, and the zone's terrain
##     TileSet (levels/common/tiles/<id>_tiles.tres) on tile layers that use
##     one of the generated terrain TileSets;
##   - plays the zone music (SceneRouter does it for zone starts; this covers
##     scenes opened directly).
##
## While playing it kills Sproto when he falls below Bounds, and after
## Player.died it stops the timer, waits RESPAWN_WAIT_FRAMES and calls
## SceneRouter.respawn() once. complete_level() runs the goal sequence:
## timer stops, Sproto brakes and freezes in his victory pose, the tally
## counts, then SceneRouter.next_stage(). Both waits run in _physics_process,
## so pausing the game pauses them too.

signal player_spawned(player: Player)
## The goal was reached (timer already stopped).
signal level_finishing
## Emitted right before SceneRouter.respawn() (or instead of it, see use_scene_router).
signal respawn_requested
## Emitted right before SceneRouter.next_stage() (or instead of it).
signal next_stage_requested

const PLAYER_SCENE := "res://player/player.tscn"
const CAMERA_SCENE := "res://camera/game_camera.tscn"
const FALLBACK_CAMERA := preload("res://levels/common/fallback_camera.gd")
const HUD_SCENE := "res://ui/hud/hud.tscn"
const TALLY_SCENE := "res://ui/tally/score_tally.tscn"
const DEBUG_HUD := preload("res://levels/common/debug_hud.gd")
const PLACEHOLDER_TALLY := preload("res://levels/common/placeholder_tally.gd")

const BACKGROUND_DIR := "res://assets/backgrounds"
const TILES_DIR := "res://levels/common/tiles"
const BACKGROUND_FILES: Array[String] = ["1_far.png", "2_distant.png", "3_mid.png", "4_near.png"]
const BACKGROUND_SCROLL: Array[float] = [0.1, 0.3, 0.6, 0.9]
## Backdrop layers sit this far behind everything else.
const BACKGROUND_Z := -100

## Death: frames between Player.died and SceneRouter.respawn() (about 1 s).
const RESPAWN_WAIT_FRAMES := 60
## Goal: frames to brake to a stop before freezing anyway.
const BRAKE_FRAMES := 45
## Goal: the brake keeps this share of the ground speed each frame.
const BRAKE_KEEP := 0.82
const BRAKE_STOP_SPEED := 0.5
## Goal: frames between freezing and the tally, and after the tally.
const POSE_FRAMES := 40
const AFTER_TALLY_FRAMES := 30
## Goal: a tally scene that never emits `finished` is given up after this.
const TALLY_TIMEOUT_FRAMES := 60 * 30
## Spawn: frames to wait for terrain collision before giving up on the floor snap.
const SPAWN_SETTLE_FRAMES := 3

const FLOOR_MASK := Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY

enum Finish { NONE, BRAKE, POSE, TALLY, AFTER_TALLY, DONE }

## Zone used when the scene is opened directly (SceneRouter.zone_id empty).
@export var zone_id := ""
## Art set for backgrounds and terrain materials (assets/backgrounds/<id>/,
## assets/terrain/<id>/, levels/common/tiles/<id>_tiles.tres). Empty = the zone id.
@export var art_zone_id := ""
## Music override; empty = the zone's music from ZoneRegistry.
@export var music := &""

@export_group("Backdrop")
## Vertical parallax = horizontal scroll scale × this (the far layer never moves vertically).
@export_range(0.0, 1.0, 0.01) var background_y_scroll := 0.25
## Height above the Bounds bottom edge where the distant, mid and near layers'
## bottoms sit when the camera is at its lowest (the horizon or ground line).
@export var horizon_height := 0.0
## Extra y offset per layer (far, distant, mid, near), in pixels, + is down.
@export var background_y_offsets := PackedFloat32Array([0.0, 0.0, 0.0, 0.0])

## The spawned player.
var player: Player
## The camera (GameCamera, or the fallback).
var camera: Camera2D
## Turn off to keep the scene change calls from running (tests); the
## respawn_requested / next_stage_requested signals still fire.
var use_scene_router := true

var _bounds := Rect2()
var _progress_span := Vector2(NAN, NAN)  # start x, goal x
var _has_bounds := false
var _spawn := Vector2.ZERO
var _settle_frames := 0
var _respawn_wait := -1
var _respawn_sent := false
var _finish := Finish.NONE
var _finish_frames := 0
var _tally: Node
var _tally_done := false
var _next_sent := false


## The level root above `from`, or the one in the scene (null if none).
## Found through the `level_root` group rather than by class, so scripts that
## call it don't hold a reference to this one.
static func find(from: Node) -> Node2D:
	var node := from
	while node != null:
		if node.is_in_group(&"level_root"):
			return node as Node2D
		node = node.get_parent()
	if from != null and from.is_inside_tree():
		return from.get_tree().get_first_node_in_group(&"level_root") as Node2D
	return null


func _enter_tree() -> void:
	# Joined before the children's _ready, so enemies can find the root then.
	add_to_group(&"level_root")


func _ready() -> void:
	_read_bounds()
	GameState.timer_running = true
	_apply_art_zone()
	_add_backdrop()
	_spawn_player()
	_add_camera()
	_add_ui()
	_play_music()


## The zone this level belongs to: SceneRouter's, or the export for direct opens.
func current_zone_id() -> String:
	return SceneRouter.zone_id if SceneRouter.zone_id != "" else zone_id


func current_art_zone_id() -> String:
	return art_zone_id if art_zone_id != "" else current_zone_id()


## Bounds in world space (camera limits; below the bottom edge is a pit).
func get_bounds() -> Rect2:
	return _bounds


## How far along the act `x` is: 0 at PlayerStart, 1 at the goal sign
## (clamped). Without a goal sign (boss arenas) the Bounds' right edge stands
## in. Enemies feed it to Difficulty.local() for the in-act ramp. Safe to call
## from children's _ready (before this node's own _ready).
func progress_at(x: float) -> float:
	if is_nan(_progress_span.x):
		_progress_span = _find_progress_span()
	var length := _progress_span.y - _progress_span.x
	if length <= 0.0:
		return 0.0
	return clampf((x - _progress_span.x) / length, 0.0, 1.0)


func _find_progress_span() -> Vector2:
	var start := get_node_or_null(^"PlayerStart") as Node2D
	var from := start.global_position.x if start != null else global_position.x
	var to := -INF
	for node in find_children("*", "", true, false):
		if node is GoalSign:
			to = maxf(to, (node as Node2D).global_position.x)
	if to == -INF:
		var bounds := get_node_or_null(^"Bounds") as Control
		to = bounds.get_global_rect().end.x if bounds != null else from
	return Vector2(from, to)


## True once the goal was reached.
func is_finishing() -> bool:
	return _finish != Finish.NONE


## Goal reached: freeze the timer and Sproto, show the tally, then go on to
## the next stage. Only the first call counts; ignored while Sproto is dead.
func complete_level() -> void:
	if _finish != Finish.NONE or _respawn_wait >= 0 or _respawn_sent:
		return
	if player == null or player.state == &"dead":
		return
	_finish = Finish.BRAKE
	_finish_frames = 0
	GameState.complete_level()
	# Nothing can hurt (or collect for) him any more.
	player.hitbox.set_deferred(&"monitorable", false)
	level_finishing.emit()


func _physics_process(_delta: float) -> void:
	if player == null or not is_instance_valid(player):
		return
	if _settle_frames > 0:
		_settle_spawn()
	if _finish != Finish.NONE:
		_finish_step()
		return
	if _has_bounds and player.state != &"dead" \
			and player.global_position.y - player.get_radii().y > _bounds.end.y:
		player.kill()
	if _respawn_wait > 0:
		_respawn_wait -= 1
		if _respawn_wait == 0:
			_request_respawn()


# --- Spawning -------------------------------------------------------------------

func _read_bounds() -> void:
	var node := get_node_or_null(^"Bounds") as Control
	_has_bounds = node != null and node.size.x > 0.0 and node.size.y > 0.0
	if _has_bounds:
		_bounds = node.get_global_rect()
	else:
		push_warning("[LevelRoot] %s has no Bounds (ReferenceRect): no camera limits or pits" % scene_file_path)
		_bounds = Rect2(-100000.0, -100000.0, 200000.0, 200000.0)


func spawn_point() -> Vector2:
	if GameState.checkpoint_position is Vector2:
		return GameState.checkpoint_position
	var start := get_node_or_null(^"PlayerStart") as Node2D
	if start != null:
		return start.global_position
	push_warning("[LevelRoot] %s has no PlayerStart" % scene_file_path)
	return global_position


func _spawn_player() -> void:
	if not ResourceLoader.exists(PLAYER_SCENE):
		push_warning("[LevelRoot] no player scene at %s" % PLAYER_SCENE)
		return
	player = (load(PLAYER_SCENE) as PackedScene).instantiate() as Player
	player.name = "Player"
	add_child(player)
	_spawn = spawn_point()
	player.respawn_at(_spawn)
	# Terrain collision (tile maps especially) registers on the first physics
	# frames: hold him still until the floor under the marker can be found.
	player.freeze(true)
	_settle_frames = SPAWN_SETTLE_FRAMES
	player.died.connect(_on_player_died)
	player_spawned.emit(player)


func _settle_spawn() -> void:
	_settle_frames -= 1
	var space := get_world_2d().direct_space_state
	var radius := Tuning.physics.height_radius
	var query := PhysicsRayQueryParameters2D.create(_spawn + Vector2(0.0, -8.0),
			_spawn + Vector2(0.0, radius + 64.0), FLOOR_MASK)
	var hit := space.intersect_ray(query)
	if hit.is_empty() and _settle_frames > 0:
		return  # not registered yet: try again next frame
	_settle_frames = 0
	var at := _spawn
	if not hit.is_empty() and hit.position.y < _spawn.y + radius:
		at.y = hit.position.y - radius
	player.respawn_at(at)


func _on_player_died() -> void:
	if _finish != Finish.NONE or _respawn_wait >= 0 or _respawn_sent:
		return
	GameState.timer_running = false
	_respawn_wait = RESPAWN_WAIT_FRAMES


func _request_respawn() -> void:
	if _respawn_sent:
		return
	_respawn_sent = true
	respawn_requested.emit()
	if use_scene_router:
		SceneRouter.respawn()


# --- Goal -----------------------------------------------------------------------

func _finish_step() -> void:
	_finish_frames += 1
	match _finish:
		Finish.BRAKE:
			var speed := player.ground_speed if player.grounded else player.velocity.x
			if absf(speed) <= BRAKE_STOP_SPEED or _finish_frames >= BRAKE_FRAMES:
				if player.grounded or _finish_frames >= BRAKE_FRAMES * 2:
					player.freeze(true)
					player.play_pose(&"victory")
					_set_finish(Finish.POSE)
			elif player.grounded:
				player.push_ground(speed * BRAKE_KEEP, 2)
		Finish.POSE:
			if _finish_frames >= POSE_FRAMES:
				_show_tally()
				_set_finish(Finish.TALLY)
		Finish.TALLY:
			if _tally_done or _finish_frames >= TALLY_TIMEOUT_FRAMES:
				_set_finish(Finish.AFTER_TALLY)
		Finish.AFTER_TALLY:
			if _finish_frames >= AFTER_TALLY_FRAMES:
				_set_finish(Finish.DONE)
				_request_next_stage()


func _set_finish(phase: Finish) -> void:
	_finish = phase
	_finish_frames = 0


func _show_tally() -> void:
	Audio.play_music(&"act_clear")
	if ResourceLoader.exists(TALLY_SCENE):
		_tally = (load(TALLY_SCENE) as PackedScene).instantiate()
	else:
		_tally = PLACEHOLDER_TALLY.new()
		_tally.set(&"zone_id", current_zone_id())
	if _tally.has_signal(&"finished"):
		_tally.connect(&"finished", func() -> void: _tally_done = true, CONNECT_ONE_SHOT)
	else:
		_tally_done = true
	add_child(_tally)


func _request_next_stage() -> void:
	if _next_sent:
		return
	_next_sent = true
	next_stage_requested.emit()
	if use_scene_router:
		SceneRouter.next_stage()


# --- Camera, UI, music ---------------------------------------------------------

func _add_camera() -> void:
	if ResourceLoader.exists(CAMERA_SCENE):
		camera = (load(CAMERA_SCENE) as PackedScene).instantiate() as Camera2D
	if camera == null:
		camera = FALLBACK_CAMERA.new()
	camera.name = "Camera"
	add_child(camera)
	if camera.has_method(&"set_level_bounds"):
		camera.call(&"set_level_bounds", _bounds)
	if player != null:
		camera.global_position = player.global_position
		camera.reset_smoothing()
	camera.make_current()


func _add_ui() -> void:
	var hud_added := _add_optional(HUD_SCENE)
	if not hud_added:
		var hud := DEBUG_HUD.new()
		hud.name = "DebugHud"
		add_child(hud)


func _add_optional(path: String) -> bool:
	if not ResourceLoader.exists(path):
		return false
	var packed := load(path) as PackedScene
	if packed == null:
		return false
	add_child(packed.instantiate())
	return true


func _play_music() -> void:
	var track := music
	if track == &"":
		var zone := ZoneRegistry.get_zone(current_zone_id())
		track = zone.get("music", &"")
	if track != &"":
		Audio.play_music(track)


# --- Art zone -------------------------------------------------------------------

## Terrain materials for the art zone: CurveTerrain reads assets/terrain/<id>/
## itself; tile layers get that zone's generated TileSet (same layout and
## collision as every other zone's).
func _apply_art_zone() -> void:
	var id := current_art_zone_id()
	if id == "":
		return
	var tiles_path := "%s/%s_tiles.tres" % [TILES_DIR, id]
	var zone_tiles: TileSet = null
	for node in find_children("*", "", true, false):
		if node.has_method(&"set_art_zone") and node is CurveTerrain:
			node.call(&"set_art_zone", id)
		elif node is TileMapLayer:
			var layer := node as TileMapLayer
			var current := layer.tile_set
			if current == null or current.resource_path == tiles_path \
					or not current.resource_path.begins_with(TILES_DIR + "/") \
					or not current.resource_path.ends_with("_tiles.tres"):
				continue
			if zone_tiles == null and ResourceLoader.exists(tiles_path):
				zone_tiles = load(tiles_path) as TileSet
			if zone_tiles != null:
				layer.tile_set = zone_tiles


# --- Backdrop -------------------------------------------------------------------

func _add_backdrop() -> void:
	var id := current_art_zone_id()
	var textures: Array[Texture2D] = []
	var any_file := false
	for i in BACKGROUND_FILES.size():
		var path := "%s/%s/%s" % [BACKGROUND_DIR, id, BACKGROUND_FILES[i]]
		var texture: Texture2D = null
		if id != "" and ResourceLoader.exists(path):
			texture = load(path) as Texture2D
			any_file = any_file or texture != null
		textures.append(texture)
	if not any_file:
		for i in BACKGROUND_FILES.size():
			textures[i] = PlaceholderBackdrop.layer_texture(id, i)
	var holder := Node2D.new()
	holder.name = "Backdrop"
	holder.z_index = BACKGROUND_Z
	holder.z_as_relative = false
	add_child(holder)
	move_child(holder, 0)
	for i in textures.size():
		if textures[i] != null:
			holder.add_child(_backdrop_layer(i, textures[i]))


## One Parallax2D layer. On screen a layer sits at scroll_offset - camera
## top-left × scroll_scale, so the offsets below place the far layer at the
## top of the screen (it never moves vertically) and the bottoms of the other
## layers on the horizon line when the camera is at its lowest.
func _backdrop_layer(index: int, texture: Texture2D) -> Parallax2D:
	var view := get_viewport_rect().size
	var size := texture.get_size()
	var scale_x: float = BACKGROUND_SCROLL[index]
	var scale_y := 0.0 if index == 0 else scale_x * background_y_scroll
	var y_offset: float = background_y_offsets[index] if index < background_y_offsets.size() else 0.0
	var layer := Parallax2D.new()
	layer.name = BACKGROUND_FILES[index].get_basename().capitalize().replace(" ", "")
	layer.scroll_scale = Vector2(scale_x, scale_y)
	layer.repeat_size = Vector2(size.x, 0.0)
	layer.repeat_times = maxi(1, ceili(view.x / size.x) + 1)
	if index == 0:
		layer.scroll_offset = Vector2(0.0, y_offset)
		if size.y < view.y:
			layer.add_child(_backdrop_fill(texture, size, view.y - size.y + 1.0))
	else:
		var lowest_top := _bounds.end.y - view.y
		var horizon := _bounds.end.y - horizon_height
		layer.scroll_offset = Vector2(0.0, horizon - lowest_top + y_offset - size.y + lowest_top * scale_y)
		# Below a layer, continue its bottom colour, so the sky never shows
		# through between it and the ground when the camera climbs.
		layer.add_child(_backdrop_fill(texture, size, view.y * 2.0))
	var sprite := Sprite2D.new()
	sprite.texture = texture
	sprite.centered = false
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	layer.add_child(sprite)
	return layer


## A strip under a layer in its bottom row's colour (nothing if that is transparent).
func _backdrop_fill(texture: Texture2D, size: Vector2, height: float) -> Node:
	var fill := ColorRect.new()
	fill.position = Vector2(0.0, size.y)
	fill.size = Vector2(size.x, height)
	fill.color = Color(0, 0, 0, 0)
	var image := texture.get_image()
	if image != null and not image.is_empty():
		if image.is_compressed():
			image.decompress()
		var bottom := image.get_pixel(image.get_width() / 2, image.get_height() - 1)
		if bottom.a > 0.9:
			fill.color = bottom
	if fill.color.a == 0.0:
		fill.visible = false
	return fill
