extends Enemy
## Floater pill robot (tier 2, docs/LEVELS.md): a capsule held up by a little
## propeller, hovering on a sine path: bobbing up and down and drifting side
## to side around where it was placed. The node origin is the middle of its
## path (not a floor point). Beat it by jumping to its height. Its drift speed
## and bob period scale with the local difficulty.

const HALF_LENGTH := 6.0
const RADIUS := 7.0

## Bob height (px each way) and the time of one bob at difficulty 1 (frames).
@export var bob_height := 16.0
@export var bob_period := 120
## Side-to-side drift (px each way) and its speed at difficulty 1 (px/frame).
@export var drift := 32.0
@export var drift_speed := 0.5
## Starting phase, 0..1 (to stagger several).
@export_range(0.0, 1.0) var phase := 0.0

var _home := Vector2.ZERO
var _bob := 0.0
var _drift := 0.0
var _facing := -1
var _spin := 0.0


func _ready() -> void:
	_home = global_position
	_bob = phase * TAU
	_drift = phase * TAU


func _enemy_physics(_delta: float) -> void:
	queue_redraw()
	_bob += TAU / maxf(interval_frames(bob_period), 1.0)
	if drift > 0.0:
		_drift += move_speed(drift_speed) / drift
	var offset := Vector2(sin(_drift) * drift, sin(_bob) * bob_height)
	var previous := global_position
	global_position = _home + offset
	if absf(global_position.x - previous.x) > 0.01:
		_facing = 1 if global_position.x > previous.x else -1
	_spin += 0.6


func _pop() -> void:
	LevelFx.pill_pop(get_parent(), global_position, Vector2.RIGHT, HALF_LENGTH, RADIUS,
			PillArt.WHITE if _facing > 0 else PillArt.MINT, PillArt.MINT if _facing > 0 else PillArt.WHITE, PillArt.OUTLINE)


func _draw() -> void:
	# Propeller mast and blades (the blades squash as they spin).
	draw_line(Vector2(0, -RADIUS - 1.0), Vector2(0, -RADIUS - 5.0), PillArt.OUTLINE, 2.0)
	var blade := absf(cos(_spin)) * 9.0 + 2.0
	draw_rect(Rect2(-blade, -RADIUS - 7.0, blade * 2.0, 2.0), PillArt.OUTLINE)
	draw_rect(Rect2(-blade + 1.0, -RADIUS - 6.5, blade * 2.0 - 2.0, 1.0), PillArt.METAL)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(_facing, 1.0))
	PillArt.draw_capsule(self, HALF_LENGTH, RADIUS, 1)
	PillArt.draw_visor(self, Vector2(HALF_LENGTH + 1.0, -1.0), 6.0, 1)
	draw_set_transform(Vector2.ZERO)
