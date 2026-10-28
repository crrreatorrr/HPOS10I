class_name TitleScreen
extends Control
## Title screen (boot goes here; `-- --dev` still shows the boot menu).
## The logo, Sproto, a blinking "press jump or tap" prompt and the one-line
## disclaimer from docs/CONTRACTS.md. Jump, accept, Start, a tap or a click
## goes to the zone select (once). Music: `title`.

const DISCLAIMER := "A free, non-commercial fan parody. All characters and art are original."
const PLAYER_SCENE := "res://player/player.tscn"
## Sproto is drawn at 2x, standing on the backdrop's ground line.
const SPROTO_SCALE := 2.0
const SPROTO_X := 212.0
## Presses this soon after the screen appears are ignored (a key still held
## from the previous screen).
const INPUT_GRACE := 0.25
const BLINK_PERIOD := 1.0

var _clock := 0.0
var _leaving := false

@onready var _prompt: Label = %Prompt
@onready var _backdrop: MenuBackdrop = %Backdrop


func _ready() -> void:
	(%Disclaimer as Label).text = DISCLAIMER
	Audio.play_music(&"title")
	_add_sproto()


func _process(delta: float) -> void:
	_clock += delta
	_prompt.modulate.a = 1.0 if fmod(_clock, BLINK_PERIOD) < BLINK_PERIOD * 0.65 else 0.0


func _unhandled_input(event: InputEvent) -> void:
	if _leaving or _clock < INPUT_GRACE:
		return
	var go: bool = event.is_action_pressed(&"jump") or event.is_action_pressed(&"ui_accept") \
			or event.is_action_pressed(&"pause") \
			or (event is InputEventScreenTouch and event.pressed) \
			or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT)
	if go:
		get_viewport().set_input_as_handled()
		start()


## Goes to the zone select. Only the first call counts.
func start() -> void:
	if _leaving:
		return
	_leaving = true
	Audio.play_sfx(&"menu_select")
	SceneRouter.go_zone_select()


func is_leaving() -> bool:
	return _leaving


## Sproto himself (the player scene, frozen in his victory pose), so the art
## agent's sprites show up here as soon as they exist.
func _add_sproto() -> void:
	if not ResourceLoader.exists(PLAYER_SCENE):
		return
	var sproto := (load(PLAYER_SCENE) as PackedScene).instantiate() as Node2D
	sproto.name = "Sproto"
	sproto.scale = Vector2.ONE * SPROTO_SCALE
	%SprotoSpot.add_child(sproto)
	if sproto.has_method(&"freeze"):
		sproto.call(&"freeze", true)
	if sproto.has_method(&"play_pose"):
		sproto.call(&"play_pose", &"victory")
	var feet := float(Tuning.physics.get(&"height_radius")) if Tuning.physics != null else 19.0
	sproto.position = Vector2(SPROTO_X, _backdrop.ground_y - feet * SPROTO_SCALE).round()
