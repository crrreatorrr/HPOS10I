extends Node
## Moves between title, zone select, acts and boss arenas.
## Missing scenes fall back to the dev menu so nothing hard-crashes while
## agents are still building their parts.

const MAIN_SCENE := "res://core/main.tscn"
const TITLE_SCENE := "res://ui/title/title_screen.tscn"
const ZONE_SELECT_SCENE := "res://ui/zone_select/zone_select.tscn"
const GAME_OVER_SCENE := "res://ui/game_over/game_over.tscn"
const ENDING_SCENE := "res://ui/ending/ending.tscn"

signal stage_started(zone_id: String, stage: int)

var zone_id := ""
## 1-based. Acts are 1..n, the boss arena is n + 1.
var stage := 1


func go_title() -> void:
	_change_to(TITLE_SCENE if ResourceLoader.exists(TITLE_SCENE) else MAIN_SCENE)


func go_zone_select() -> void:
	_change_to(ZONE_SELECT_SCENE if ResourceLoader.exists(ZONE_SELECT_SCENE) else MAIN_SCENE)


## Starts a zone at the given stage (1 = act 1). Resets coins and checkpoint.
func start_zone(new_zone_id: String, new_stage := 1) -> void:
	zone_id = new_zone_id
	stage = new_stage
	GameState.start_level(zone_id, stage)
	_load_stage()


## Advances act 1 -> act 2 -> boss -> next zone (or ending).
func next_stage() -> void:
	var next_path := ZoneRegistry.stage_path(zone_id, stage + 1)
	if next_path != "":
		start_zone(zone_id, stage + 1)
		return
	var next_zone := ZoneRegistry.next_zone_id(zone_id)
	if next_zone != "":
		start_zone(next_zone, 1)
	elif ResourceLoader.exists(ENDING_SCENE):
		_change_to(ENDING_SCENE)
	else:
		go_title()


## Reloads the current stage after a death, keeping the checkpoint.
func respawn() -> void:
	if GameState.lives <= 0:
		if ResourceLoader.exists(GAME_OVER_SCENE):
			_change_to(GAME_OVER_SCENE)
		else:
			GameState.reset_game()
			go_title()
		return
	GameState.restart_from_checkpoint()
	_load_stage()


## Opens any scene directly (dev menu, tests). Not tied to a zone.
func open_scene(path: String) -> void:
	zone_id = ""
	stage = 1
	GameState.start_level("", 1)
	_change_to(path)


func current_zone() -> Dictionary:
	return ZoneRegistry.get_zone(zone_id)


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


func _change_to(path: String) -> void:
	get_tree().paused = false
	Engine.time_scale = 1.0
	get_tree().change_scene_to_file.call_deferred(path)
