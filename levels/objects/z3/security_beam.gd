extends Node2D
## A security beam (Capital Mansion hazard): an emitter on the ceiling that
## fires a laser straight down to the floor on a timer. Before the beam
## comes on, the emitter blinks red and a dotted aiming line appears, with
## the telegraph sound, for Difficulty.telegraph(telegraph_seconds, local),
## never under 0.35 s. While the beam is on, touching it hurts, jumping or
## rolling included; the rest of the time it is harmless. The off time
## scales with interval_mult. The origin is the emitter, on the ceiling.

signal telegraphed

enum Phase { OFF, WARNING, ON }

const EMITTER := Color(0.3, 0.32, 0.4)
const EMITTER_DARK := Color(0.14, 0.15, 0.2)
const LENS := Color(0.9, 0.2, 0.2)
const LENS_OFF := Color(0.4, 0.1, 0.1)
const BEAM := Color(1.0, 0.25, 0.3)
const BEAM_CORE := Color(1.0, 0.85, 0.85)
const OUTLINE := Color(0.08, 0.08, 0.12)

## How far down the beam reaches (to the floor).
@export var length := 160.0
## Frames off at difficulty 1 (scaled by interval_mult), and on.
@export var off_frames := 150
@export var on_frames := 60
@export var telegraph_seconds := 0.5
## Extra frames before the first cycle (to stagger several).
@export var first_delay := 0

var phase := Phase.OFF
var _timer := 0
var _beam: PlayerArea
var _d := NAN


func _ready() -> void:
	_beam = PlayerArea.new()
	_beam.name = "Beam"
	_beam.collision_layer = Layers.HAZARDS
	_beam.monitorable = true
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(6.0, length)
	shape.shape = rect
	shape.position = Vector2(0.0, length / 2.0)
	_beam.add_child(shape)
	add_child(_beam)
	_timer = -first_delay


func _physics_process(_delta: float) -> void:
	_timer += 1
	match phase:
		Phase.OFF:
			if _timer >= quiet() - warning():
				phase = Phase.WARNING
				_timer = 0
				telegraphed.emit()
				LevelFx.play_telegraph()
		Phase.WARNING:
			if _timer >= warning():
				phase = Phase.ON
				_timer = 0
		Phase.ON:
			for player in _beam.players_inside():
				if player.state != &"dead":
					player.hurt(Vector2(global_position.x, player.global_position.y))
			if _timer >= on_frames:
				phase = Phase.OFF
				_timer = 0
	queue_redraw()


func is_telegraphing() -> bool:
	return phase == Phase.WARNING


func is_on() -> bool:
	return phase == Phase.ON


func local_difficulty() -> float:
	if is_nan(_d):
		_d = LevelDifficulty.at(self)
	return _d


## Frames off between beams, the warning included.
func quiet() -> int:
	return maxi(LevelDifficulty.interval_frames(off_frames, local_difficulty()), warning() + 1)


func warning() -> int:
	return LevelDifficulty.telegraph_frames(telegraph_seconds, local_difficulty())


func _draw() -> void:
	# The emitter housing, hanging from the ceiling.
	draw_rect(Rect2(-9.0, -1.0, 18.0, 12.0), OUTLINE)
	draw_rect(Rect2(-8.0, 0.0, 16.0, 10.0), EMITTER)
	draw_rect(Rect2(-8.0, 7.0, 16.0, 3.0), EMITTER_DARK)
	var blink := phase == Phase.WARNING and (_timer / 3) % 2 == 0
	draw_circle(Vector2(0.0, 10.0), 3.5, OUTLINE)
	draw_circle(Vector2(0.0, 10.0), 2.5, LENS if (blink or phase == Phase.ON) else LENS_OFF)
	match phase:
		Phase.WARNING:
			var y := 14.0
			while y < length:
				draw_rect(Rect2(-1.0, y + float((_timer * 2) % 8), 2.0, 3.0), BEAM if blink else Color(BEAM, 0.5))
				y += 8.0
		Phase.ON:
			var w := 3.0 + float((_timer / 2) % 2)
			draw_rect(Rect2(-w, 12.0, w * 2.0, length - 12.0), Color(BEAM, 0.55))
			draw_rect(Rect2(-1.0, 12.0, 2.0, length - 12.0), BEAM_CORE)
			draw_circle(Vector2(0.0, length), 4.0, Color(BEAM, 0.7))
