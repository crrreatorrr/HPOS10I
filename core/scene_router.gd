extends Node
## Moves between title, zone select, acts and boss arenas.
## Missing scenes fall back to the dev menu so nothing hard-crashes while
## agents are still building their parts.
##
## Only the first scene change requested in a frame takes effect, so a goal
## and a death landing on the same frame can't both fire.

const MAIN_SCENE := "res://core/main.tscn"
const TITLE_SCENE := "res://ui/title/title_screen.tscn"
const ZONE_SELECT_SCENE := "res://ui/zone_select/zone_select.tscn"
const GAME_OVER_SCENE := "res://ui/game_over/game_over.tscn"
const ENDING_SCENE := "res://ui/ending/ending.tscn"

const MENU_SCENES := [MAIN_SCENE, TITLE_SCENE, ZONE_SELECT_SCENE, GAME_OVER_SCENE, ENDING_SCENE]

signal stage_started(zone_id: String, stage: int)

var zone_id := ""
## 1-based. Acts are 1..n, the boss arena is n + 1.
var stage := 1

## Scene opened directly (dev menu, sandboxes); respawn reloads it.
var _free_scene := ""
var _change_frame := -1


func go_title() -> void:
	if _claim("go_title"):
		_change_to(_title_or_main())


func go_zone_select() -> void:
	if _claim("go_zone_select"):
		_change_to(ZONE_SELECT_SCENE if ResourceLoader.exists(ZONE_SELECT_SCENE) else MAIN_SCENE)


## Starts a zone at the given stage (1 = act 1). Resets tickets and checkpoint.
func start_zone(new_zone_id: String, new_stage := 1) -> void:
	if _claim("start_zone"):
		_start_zone(new_zone_id, new_stage)


## Advances act 1 -> act 2 -> boss -> next zone (or ending).
func next_stage() -> void:
	if not _claim("next_stage"):
		return
	if ZoneRegistry.stage_path(zone_id, stage + 1) != "":
		_start_zone(zone_id, stage + 1)
		return
	var next_zone := ZoneRegistry.next_zone_id(zone_id)
	if next_zone != "":
		_start_zone(next_zone, 1)
	elif ResourceLoader.exists(ENDING_SCENE):
		_change_to(ENDING_SCENE)
	else:
		_change_to(_title_or_main())


## Call once after the player dies: takes a life (not in sandboxes), then
## reloads the stage from the checkpoint, or goes to game over.
func respawn() -> void:
	if not _claim("respawn"):
		return
	if _free_scene == "":
		GameState.lose_life()
	if GameState.lives <= 0:
		if ResourceLoader.exists(GAME_OVER_SCENE):
			_change_to(GAME_OVER_SCENE)
		else:
			GameState.reset_game()
			_change_to(_title_or_main())
		return
	GameState.restart_from_checkpoint()
	if _free_scene != "":
		_change_to(_free_scene)
	else:
		_load_stage()


## Opens any scene directly (dev menu, sandboxes). Not tied to a zone.
func open_scene(path: String) -> void:
	if not _claim("open_scene"):
		return
	zone_id = ""
	stage = 1
	_free_scene = path
	GameState.start_level("", 1)
	_change_to(path)


## True while a level, boss arena or playground is running (not in menus).
## The pause menu and touch controls use this.
func in_gameplay() -> bool:
	var scene := get_tree().current_scene
	if scene == null:
		return false
	return not scene.scene_file_path in MENU_SCENES


func current_zone() -> Dictionary:
	return ZoneRegistry.get_zone(zone_id)


func _start_zone(new_zone_id: String, new_stage: int) -> void:
	zone_id = new_zone_id
	stage = new_stage
	_free_scene = ""
	GameState.start_level(zone_id, stage)
	_load_stage()


func _load_stage() -> void:
	var path := ZoneRegistry.stage_path(zone_id, stage)
	if path == "" or not ResourceLoader.exists(path):
		push_warning("[SceneRouter] stage not built yet: %s stage %d" % [zone_id, stage])
		_change_to(MAIN_SCENE)
		return
	stage_started.emit(zone_id, stage)
	var zone := current_zone()
	if zone.has("music"):
		Audio.play_music(zone.music)
	_change_to(path)


func _title_or_main() -> String:
	return TITLE_SCENE if ResourceLoader.exists(TITLE_SCENE) else MAIN_SCENE


## True for the first scene-change request this frame, false for the rest.
func _claim(request: String) -> bool:
	var frame := Engine.get_process_frames()
	if frame == _change_frame:
		print("[SceneRouter] ignored %s: a scene change is already pending this frame" % request)
		return false
	_change_frame = frame
	return true


func _change_to(path: String) -> void:
	get_tree().paused = false
	Engine.time_scale = 1.0
	get_tree().change_scene_to_file.call_deferred(path)
