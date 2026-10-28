extends Node
## Audio API used by every system. Starter stub from the lead; the UI/audio
## agent owns this file and fills it in. Keep the public API stable:
##   Audio.play_sfx(&"jump")            one-shot sound effect
##   Audio.play_music(&"z1")            looping track (no-op if already playing)
##   Audio.stop_music()
## Missing files are silently skipped so gameplay never waits on audio.

const SFX_DIR := "res://audio/sfx/"
const MUSIC_DIR := "res://audio/music/"

var _music: AudioStreamPlayer
var _current_music := &""


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_music = AudioStreamPlayer.new()
	add_child(_music)


func play_sfx(sfx_name: StringName) -> void:
	var path := SFX_DIR + String(sfx_name) + ".ogg"
	if not ResourceLoader.exists(path):
		return
	var player := AudioStreamPlayer.new()
	player.stream = load(path)
	add_child(player)
	player.finished.connect(player.queue_free)
	player.play()


func play_music(music_name: StringName) -> void:
	if music_name == _current_music and _music.playing:
		return
	var path := MUSIC_DIR + String(music_name) + ".ogg"
	if not ResourceLoader.exists(path):
		return
	_current_music = music_name
	_music.stream = load(path)
	_music.play()


func stop_music() -> void:
	_current_music = &""
	_music.stop()
