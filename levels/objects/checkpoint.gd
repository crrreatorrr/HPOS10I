class_name Checkpoint
extends PlayerArea
## A checkpoint post. The node origin is where Sproto respawns: his centre,
## 19 px above the floor (the post's base reaches down to the floor; LevelRoot
## also lifts a respawn point that is too low onto the floor).
## The first touch by a live player calls GameState.set_checkpoint(global_position)
## once, plays `checkpoint` and lights the lamp. A checkpoint to the left of
## the current respawn point never moves it back. A tall trigger catches runs
## at 16 px/frame and jumps over the post. Layer 7 (objects), mask 5 (player).

const FEET := 19.0
const POST_HEIGHT := 40.0
const TRIGGER := Vector2(32.0, 160.0)

const OUTLINE := Color(0.12, 0.1, 0.18)
const POST := Color(0.3, 0.36, 0.62)
const POST_LIGHT := Color(0.46, 0.54, 0.84)
const LAMP_OFF := Color(0.42, 0.48, 0.66)
const LAMP_ON := Color(1.0, 0.82, 0.2)
const LAMP_GLOW := Color(1.0, 0.95, 0.65)

var _active := false
var _lit_frames := 0


func _ready() -> void:
	collision_layer = LAYER_OBJECTS
	monitorable = false
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = TRIGGER
	shape.shape = rect
	shape.position = Vector2(0.0, FEET - TRIGGER.y / 2.0)
	add_child(shape)
	# Already passed (respawned here or further on): show it lit.
	var current = GameState.checkpoint_position
	if current is Vector2 and current.x >= global_position.x - 1.0:
		_active = true
		_lit_frames = 1000


func is_active() -> bool:
	return _active


func _physics_process(_delta: float) -> void:
	if _active:
		_lit_frames += 1
		queue_redraw()
		return
	for player in players_inside():
		if player.state != &"dead":
			activate()
			return


func activate() -> void:
	if _active:
		return
	_active = true
	_lit_frames = 0
	var current = GameState.checkpoint_position
	if current is Vector2 and current.x > global_position.x + 1.0:
		return  # an earlier post: keep the later respawn point
	GameState.set_checkpoint(global_position)
	Audio.play_sfx(&"checkpoint")


func _draw() -> void:
	var base := FEET
	var top := FEET - POST_HEIGHT
	draw_rect(Rect2(-6, base - 3, 12, 3), OUTLINE)
	draw_rect(Rect2(-2.5, top + 6, 5, POST_HEIGHT - 8), OUTLINE)
	draw_rect(Rect2(-1.5, top + 6, 3, POST_HEIGHT - 8), POST)
	draw_rect(Rect2(-1.5, top + 6, 1, POST_HEIGHT - 8), POST_LIGHT)
	var lamp := Vector2(0.0, top + 2.0)
	if _active:
		# The lit lamp spins for a moment, then glows.
		var squash := absf(cos(_lit_frames * 0.35)) if _lit_frames < 40 else 1.0
		draw_circle(lamp, 6.5, OUTLINE)
		draw_set_transform(lamp, 0.0, Vector2(maxf(squash, 0.25), 1.0))
		draw_circle(Vector2.ZERO, 5.0, LAMP_ON)
		draw_circle(Vector2(-1.5, -1.5), 2.0, LAMP_GLOW)
		draw_set_transform(Vector2.ZERO)
	else:
		draw_circle(lamp, 6.5, OUTLINE)
		draw_circle(lamp, 5.0, LAMP_OFF)
		draw_circle(lamp + Vector2(-1.5, -1.5), 1.5, POST_LIGHT)
