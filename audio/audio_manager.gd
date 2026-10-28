extends Node
## Audio API used by every system (autoload `Audio`). Public API:
##   Audio.play_sfx(&"jump")            one-shot sound effect
##   Audio.play_music(&"z1")            looping track (no-op if already playing)
##   Audio.stop_music()
## Files: audio/sfx/<name>.ogg and audio/music/<name>.ogg. Missing files are
## silent, so gameplay never waits on audio.
##
## - SFX play through a fixed pool of MAX_SFX_VOICES players on the "SFX"
##   bus; when all are busy the oldest one is reused. The same effect twice in
##   one frame plays once (32 scattered tickets do not stack 32 voices).
## - Music plays on the "Music" bus, looped (the act_clear and game_over
##   jingles play once), and ducks while the game is paused.
## - Buses "SFX" and "Music" are created at runtime if the project has no bus
##   layout with them.
## - Web: browsers keep audio locked until the first user gesture: a key,
##   click or tap (gamepad presses don't count for browsers). Until then sound
##   effects are skipped and the requested music waits; it starts on that
##   gesture. Each gamepad press while still locked shows a short toast
##   (ui/sound_hint) asking for a click or a key press.
##   `-- --sound_hint` previews this on desktop: audio starts locked, as on
##   the web, and the toast shows at once.

## show = true: a gamepad was used while locked (show or re-show the hint);
## false: audio unlocked (the hint can go).
signal unlock_hint_changed(show: bool)

const SFX_DIR := "res://audio/sfx/"
const UNLOCK_HINT_SCENE := "res://ui/sound_hint/sound_hint.tscn"
## A moving stick sends many events; it re-shows the hint at most this often
## (in frames). Button presses always do.
const HINT_REPEAT_FRAMES := 15
const MUSIC_DIR := "res://audio/music/"

## Every name from docs/CONTRACTS.md.
const SFX_NAMES: Array[StringName] = [
	&"jump", &"roll", &"spindash_charge", &"spindash_release", &"skid",
	&"ticket", &"ticket_loss", &"hurt", &"death", &"spring", &"booster",
	&"break_wall", &"enemy_pop", &"checkpoint", &"goal_sign", &"boss_hit",
	&"boss_explode", &"boss_telegraph", &"enemy_telegraph", &"one_up", &"menu_move", &"menu_select",
	&"pause", &"tally_tick",
]
const MUSIC_NAMES: Array[StringName] = [
	&"title", &"zone_select", &"z1", &"z2", &"z3", &"z4", &"boss",
	&"act_clear", &"game_over",
]
## Short tracks that play once instead of looping.
const JINGLES: Array[StringName] = [&"act_clear", &"game_over"]

const MAX_SFX_VOICES := 8
const SFX_BUS := &"SFX"
const MUSIC_BUS := &"Music"
## Music sits a little under the effects; quieter still while paused.
const MUSIC_DB := -4.0
const PAUSED_MUSIC_DB := -14.0
## How long quitting waits for the mixer after stopping every player.
const EXIT_DRAIN_MS := 150

var _music: AudioStreamPlayer
var _current_music := &""
var _voices: Array[AudioStreamPlayer] = []
## Start order of each voice (higher = newer), to steal the oldest.
var _voice_started: Array[int] = []
var _start_counter := 0
## sfx name -> process frame it last started on.
var _last_started := {}
## path -> AudioStream, or null when the file does not exist.
var _streams := {}
var _locked := false
## A gamepad was used while audio was still locked (the hint is showing).
var _gamepad_while_locked := false
var _last_hint_frame := -HINT_REPEAT_FRAMES
var _ducked := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_ensure_bus(SFX_BUS)
	_ensure_bus(MUSIC_BUS)
	_music = AudioStreamPlayer.new()
	_music.name = "Music"
	_music.bus = MUSIC_BUS
	_music.volume_db = MUSIC_DB
	add_child(_music)
	for i in MAX_SFX_VOICES:
		var voice := AudioStreamPlayer.new()
		voice.name = "Sfx%d" % i
		voice.bus = SFX_BUS
		add_child(voice)
		_voices.append(voice)
		_voice_started.append(0)
	# Load the small effects up front so the first play never hitches.
	for sfx in SFX_NAMES:
		_stream(SFX_DIR + String(sfx) + ".ogg")
	# Read the flag directly: the Dev autoload is set up after this one.
	var preview := "--sound_hint" in OS.get_cmdline_user_args()
	set_locked(OS.has_feature("web") or preview)
	if _locked and ResourceLoader.exists(UNLOCK_HINT_SCENE):
		add_child(load(UNLOCK_HINT_SCENE).instantiate())
	if preview:
		_gamepad_used_while_locked.call_deferred()


func play_sfx(sfx_name: StringName) -> void:
	if _locked:
		return
	var stream := _stream(SFX_DIR + String(sfx_name) + ".ogg")
	if stream == null:
		return
	var frame := Engine.get_process_frames()
	if _last_started.get(sfx_name, -1) == frame:
		return
	_last_started[sfx_name] = frame
	var index := _free_voice()
	var voice := _voices[index]
	voice.stop()
	voice.stream = stream
	voice.play()
	_start_counter += 1
	_voice_started[index] = _start_counter


func play_music(music_name: StringName) -> void:
	if music_name == _current_music and (_music.playing or _locked):
		return
	_current_music = music_name
	var stream := _stream(MUSIC_DIR + String(music_name) + ".ogg")
	if stream == null:
		_music.stop()  # missing track: silence, not the previous song
		return
	if &"loop" in stream:
		stream.set(&"loop", not music_name in JINGLES)
	_music.stream = stream
	if not _locked:
		_music.play()


func stop_music() -> void:
	_current_music = &""
	_music.stop()


## Name of the requested music track (also while waiting for the web unlock).
func current_music() -> StringName:
	return _current_music


func is_locked() -> bool:
	return _locked


## True while the "enable sound" hint should show: still locked, and the
## player is on a gamepad (which browsers don't accept as a gesture).
func needs_unlock_hint() -> bool:
	return _locked and _gamepad_while_locked


## While locked (web, before the first user gesture) effects are skipped and
## music waits. Unlocking starts the music that should be playing.
func set_locked(locked: bool) -> void:
	_locked = locked
	set_process_input(locked)
	if not locked and _gamepad_while_locked:
		_gamepad_while_locked = false
		unlock_hint_changed.emit(false)
	if not locked and _current_music != &"" and _music.stream != null and not _music.playing:
		_music.play()


func _input(event: InputEvent) -> void:
	if not _locked:
		return
	# Only what browsers accept as a user gesture unlocks audio.
	var gesture := (event is InputEventKey or event is InputEventMouseButton \
			or event is InputEventScreenTouch) and event.is_pressed()
	if gesture:
		set_locked(false)
		return
	var gamepad := (event is InputEventJoypadButton and event.is_pressed()) \
			or (event is InputEventJoypadMotion and absf(event.axis_value) > 0.5)
	if gamepad:
		_gamepad_used_while_locked(event is InputEventJoypadMotion)


func _gamepad_used_while_locked(throttled := false) -> void:
	var frame := Engine.get_process_frames()
	if throttled and _gamepad_while_locked and frame - _last_hint_frame < HINT_REPEAT_FRAMES:
		return
	_gamepad_while_locked = true
	_last_hint_frame = frame
	unlock_hint_changed.emit(true)


func _process(_delta: float) -> void:
	var paused := get_tree().paused
	if paused != _ducked:
		_ducked = paused
		_music.volume_db = PAUSED_MUSIC_DB if paused else MUSIC_DB


## On quit the players stop as they leave the tree, but the mixer drops their
## playbacks a few mix steps later; a sound still playing at exit is otherwise
## reported as leaked resources (and fails the headless scene smoke test).
## Only waits if anything ever played.
func _exit_tree() -> void:
	_music.stop()
	for voice in _voices:
		voice.stop()
	if _start_counter > 0 or _music.stream != null:
		OS.delay_msec(EXIT_DRAIN_MS)


## An idle voice, or the one that started longest ago.
func _free_voice() -> int:
	var oldest := 0
	for i in _voices.size():
		if not _voices[i].playing:
			return i
		if _voice_started[i] < _voice_started[oldest]:
			oldest = i
	return oldest


func _stream(path: String) -> AudioStream:
	if not _streams.has(path):
		_streams[path] = load(path) if ResourceLoader.exists(path) else null
	return _streams[path]


static func _ensure_bus(bus_name: StringName) -> void:
	if AudioServer.get_bus_index(bus_name) != -1:
		return
	AudioServer.add_bus()
	var index := AudioServer.bus_count - 1
	AudioServer.set_bus_name(index, bus_name)
	AudioServer.set_bus_send(index, &"Master")
