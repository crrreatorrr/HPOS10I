extends Node2D
## Physics playground. Flat ground with a tunnel and a top-only platform,
## gentle and steep slopes, two loops, a curve run and a quarter pipe, plus a
## test dummy and coins for hurt / coin scatter. Respawns Sproto after death.
## Run with `-- --trace` (or `--trace=N`) to print the player's state every 15 (N) frames.

const HINT := "Arrows/WASD run   Z/X/C/Space jump   Down: roll   Down+Jump: spin dash   F1: overlay"
const RESPAWN_FRAMES := 120

@onready var player: Player = $Player
@onready var start: Marker2D = $PlayerStart

var _label: Label
var _respawn_in := -1
var _frame := 0


func _ready() -> void:
	player.respawn_at(start.global_position)
	player.died.connect(func() -> void: _respawn_in = RESPAWN_FRAMES)
	var layer := CanvasLayer.new()
	add_child(layer)
	_label = Label.new()
	_label.add_theme_font_size_override(&"font_size", 8)
	_label.add_theme_color_override(&"font_outline_color", Color.BLACK)
	_label.add_theme_constant_override(&"outline_size", 3)
	_label.position = Vector2(4, 226)
	layer.add_child(_label)


func _physics_process(_delta: float) -> void:
	_frame += 1
	_label.text = "%s     Coins %d" % [HINT, GameState.coins]
	if _respawn_in > 0:
		_respawn_in -= 1
		if _respawn_in == 0:
			player.respawn_at(start.global_position)
	if Dev.args.has("trace") and _frame % _trace_interval() == 0:
		print("[trace] f%d x=%.0f y=%.0f gsp=%.2f v=(%.2f, %.2f) a=%.0f mode=%d %s %s path=%d coins=%d" % [
			_frame, player.global_position.x, player.global_position.y, player.ground_speed,
			player.velocity.x, player.velocity.y, player.ground_angle, player.collision_mode,
			player.state, "G" if player.grounded else "air", player.collision_path, GameState.coins])


func _trace_interval() -> int:
	var value = Dev.args.get("trace", true)
	return maxi(int(value), 1) if value is String else 15
