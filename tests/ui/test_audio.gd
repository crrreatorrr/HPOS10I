extends TestCase
## Audio: every contract SFX has a file, music loops, the SFX voice pool never
## exceeds its cap (and steals the oldest voice), missing music is silent,
## buses exist, and the web unlock starts waiting music on the first input.

## Copied from docs/CONTRACTS.md (Audio section) on purpose: if either list
## changes, this test makes someone look at both.
const CONTRACT_SFX := [
	"jump", "roll", "spindash_charge", "spindash_release", "skid",
	"ticket", "ticket_loss", "hurt", "death", "spring", "booster", "break_wall",
	"enemy_pop", "checkpoint", "goal_sign", "boss_hit", "boss_explode",
	"boss_telegraph", "one_up", "menu_move", "menu_select", "pause", "tally_tick",
]
const CONTRACT_MUSIC := ["title", "zone_select", "z1", "z2", "z3", "z4", "boss", "act_clear", "game_over"]
const BUILT_MUSIC := ["z1", "title"]
## Total audio budget for the web build.
const MAX_TOTAL_BYTES := 2 * 1024 * 1024

var audio: Node


func before_each() -> void:
	audio = tree.root.get_node("Audio")
	_stop_all()


func after_each() -> void:
	audio.set_locked(false)
	_stop_all()


func _stop_all() -> void:
	audio.stop_music()
	for voice in audio.get(&"_voices"):
		(voice as AudioStreamPlayer).stop()


func _players() -> Array:
	return audio.get_children().filter(func(n: Node) -> bool: return n is AudioStreamPlayer)


func _voices() -> Array:
	return audio.get(&"_voices")


func test_every_contract_sfx_has_a_file() -> void:
	var missing := []
	for sfx in CONTRACT_SFX:
		var path := "res://audio/sfx/%s.ogg" % sfx
		if not ResourceLoader.exists(path):
			missing.append(sfx)
		elif not load(path) is AudioStreamOggVorbis:
			fail("%s is not Ogg Vorbis" % path)
	assert_eq(missing, [], "missing SFX files")
	assert_eq(Array(audio.SFX_NAMES).map(func(n: StringName) -> String: return String(n)), CONTRACT_SFX,
			"Audio.SFX_NAMES matches the contract")
	assert_eq(Array(audio.MUSIC_NAMES).map(func(n: StringName) -> String: return String(n)), CONTRACT_MUSIC,
			"Audio.MUSIC_NAMES matches the contract")


func test_music_files_loop_and_fit_the_budget() -> void:
	for track in BUILT_MUSIC:
		var stream := load("res://audio/music/%s.ogg" % track) as AudioStreamOggVorbis
		assert_true(stream != null, "%s.ogg exists" % track)
		if stream == null:
			continue
		assert_true(stream.loop, "%s loops (import setting)" % track)
		assert_true(stream.get_length() >= 15.0 and stream.get_length() <= 32.0,
				"%s is a short loop (%.1f s)" % [track, stream.get_length()])
	var total := 0
	for dir in ["res://audio/sfx", "res://audio/music"]:
		for file in DirAccess.get_files_at(dir):
			if file.ends_with(".ogg"):
				total += FileAccess.get_file_as_bytes(dir.path_join(file)).size()
	assert_true(total < MAX_TOTAL_BYTES, "all audio is %d bytes" % total)


func test_buses_exist_and_players_use_them() -> void:
	assert_true(AudioServer.get_bus_index(&"SFX") != -1, "SFX bus")
	assert_true(AudioServer.get_bus_index(&"Music") != -1, "Music bus")
	for voice in _voices():
		assert_eq((voice as AudioStreamPlayer).bus, &"SFX", "voice on the SFX bus")
	assert_eq((audio.get(&"_music") as AudioStreamPlayer).bus, &"Music", "music on the Music bus")


func test_pool_never_exceeds_the_cap() -> void:
	var cap: int = audio.MAX_SFX_VOICES
	var start := _players().size()
	assert_eq(start, cap + 1, "%d voices + 1 music player" % cap)
	for frame in 90:
		for sfx in CONTRACT_SFX:
			audio.play_sfx(StringName(sfx))
			audio.play_sfx(StringName(sfx))
		if _players().size() != start:
			fail("frame %d: %d players" % [frame, _players().size()])
			break
		var playing := _voices().filter(func(v: AudioStreamPlayer) -> bool: return v.playing).size()
		if playing > cap:
			fail("frame %d: %d voices playing" % [frame, playing])
			break
		await tree.process_frame


func test_same_effect_twice_in_a_frame_plays_once() -> void:
	for i in 32:
		audio.play_sfx(&"ticket")  # 32 scattered tickets grabbed on one frame
	var ticket := load("res://audio/sfx/ticket.ogg")
	var used := _voices().filter(func(v: AudioStreamPlayer) -> bool: return v.playing and v.stream == ticket)
	assert_eq(used.size(), 1, "one voice for 32 identical requests")
	await tree.process_frame
	audio.play_sfx(&"ticket")
	used = _voices().filter(func(v: AudioStreamPlayer) -> bool: return v.playing and v.stream == ticket)
	assert_eq(used.size(), 2, "next frame plays again")


func test_full_pool_steals_the_oldest_voice() -> void:
	var long_ones := ["boss_explode", "goal_sign", "one_up", "death", "checkpoint", "break_wall", "booster", "spring"]
	for sfx in long_ones:
		audio.play_sfx(StringName(sfx))
	var busy := _voices().filter(func(v: AudioStreamPlayer) -> bool: return v.playing).size()
	if busy < long_ones.size():
		print("  SKIP ui/test_audio.gd steal: this audio driver finished sounds early")
		return
	var oldest := load("res://audio/sfx/boss_explode.ogg")
	var oldest_voice: AudioStreamPlayer = null
	for voice in _voices():
		if voice.stream == oldest:
			oldest_voice = voice
	audio.play_sfx(&"boss_hit")
	assert_true(oldest_voice != null and oldest_voice.stream == load("res://audio/sfx/boss_hit.ogg"),
			"the oldest voice was reused")
	assert_eq(_players().size(), audio.MAX_SFX_VOICES + 1, "no new players")


func test_missing_sounds_are_silent() -> void:
	audio.play_sfx(&"no_such_sound")
	assert_eq(_voices().filter(func(v: AudioStreamPlayer) -> bool: return v.playing).size(), 0, "nothing plays")
	audio.play_music(&"z1")
	var music: AudioStreamPlayer = audio.get(&"_music")
	assert_true(music.playing, "z1 plays")
	audio.play_music(&"z1")
	assert_true(music.playing, "asking again keeps it playing")
	audio.play_music(&"z2")  # not composed yet
	assert_true(not music.playing, "a missing track is silence, not the old song")
	assert_eq(audio.current_music(), &"z2", "remembers the request")


func test_web_unlock_starts_waiting_music_on_first_input() -> void:
	var music: AudioStreamPlayer = audio.get(&"_music")
	audio.set_locked(true)
	audio.play_music(&"title")
	audio.play_sfx(&"jump")
	assert_true(not music.playing, "music waits while locked")
	assert_eq(_voices().filter(func(v: AudioStreamPlayer) -> bool: return v.playing).size(), 0, "effects skipped while locked")
	var motion := InputEventMouseMotion.new()
	tree.root.push_input(motion, true)
	assert_true(audio.is_locked(), "mouse motion is not a gesture")
	var tap := InputEventScreenTouch.new()
	tap.pressed = true
	tree.root.push_input(tap, true)
	assert_true(not audio.is_locked(), "a tap unlocks")
	assert_true(music.playing, "the waiting music starts on the first tap")
	assert_eq(music.stream, load("res://audio/music/title.ogg"), "the right track")


func test_music_ducks_while_paused() -> void:
	var music: AudioStreamPlayer = audio.get(&"_music")
	audio.play_music(&"z1")
	await tree.process_frame
	var normal := music.volume_db
	tree.paused = true
	await tree.process_frame
	assert_true(music.volume_db < normal, "quieter while paused")
	tree.paused = false
	await tree.process_frame
	assert_eq(music.volume_db, normal, "back after unpause")


func test_gamepad_does_not_unlock_but_shows_the_hint() -> void:
	var music: AudioStreamPlayer = audio.get(&"_music")
	var hint: SoundHint = add_scene("res://ui/sound_hint/sound_hint.tscn")
	audio.set_locked(true)
	audio.play_music(&"title")
	assert_true(not hint.visible, "no hint before any input")
	var button := InputEventJoypadButton.new()
	button.button_index = JOY_BUTTON_A
	button.pressed = true
	tree.root.push_input(button, true)
	assert_true(audio.is_locked(), "browsers don't count a gamepad press as a gesture")
	assert_true(not music.playing, "music still waiting")
	assert_true(audio.needs_unlock_hint() and hint.visible, "the enable-sound hint shows")
	var key := InputEventKey.new()
	key.physical_keycode = KEY_X
	key.keycode = KEY_X
	key.pressed = true
	tree.root.push_input(key, true)
	assert_true(not audio.is_locked(), "a key press unlocks")
	assert_true(music.playing, "the waiting music starts")
	assert_true(not audio.needs_unlock_hint(), "hint no longer wanted")
	assert_true(not is_instance_valid(hint) or hint.is_queued_for_deletion(), "hint goes away")


func test_gamepad_never_shows_the_hint_once_unlocked() -> void:
	var hint: SoundHint = add_scene("res://ui/sound_hint/sound_hint.tscn")
	var button := InputEventJoypadButton.new()
	button.button_index = JOY_BUTTON_A
	button.pressed = true
	tree.root.push_input(button, true)
	assert_true(not audio.is_locked() and not audio.needs_unlock_hint(), "off the web nothing changes")
	assert_true(not hint.visible, "no hint")


func test_hint_stays_clear_of_the_hud() -> void:
	var hint: SoundHint = add_scene("res://ui/sound_hint/sound_hint.tscn")
	var hud: Node = add_scene("res://ui/hud/hud.tscn")
	await tree.process_frame
	var label := hint.get_node("Root/Label") as Label
	var font := label.get_theme_font(&"font")
	var text_width := font.get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 8).x
	assert_true(text_width <= label.size.x, "text fits its box (%s px)" % text_width)
	var rect := label.get_global_rect()
	for name in ["Counters", "Lives"]:
		var other := hud.find_child(name, true, false) as Control
		assert_true(not rect.intersects(other.get_global_rect()), "clear of the HUD %s" % name)
