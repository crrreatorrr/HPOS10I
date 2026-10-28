extends Node2D
## A candle (Wizard Academy hazard, docs/DESIGN.md "candle-lit halls"): a
## tall candle in a holder whose flame flares up on a timer. Before a flare
## the flame sputters and flickers (and the telegraph sound plays) for
## Difficulty.telegraph(telegraph_seconds, local), never under 0.35 s. While
## it flares, touching the flame hurts, rolling or jumping included; the
## rest of the time the candle is harmless decoration (no collision), so it
## can be jumped while low. The quiet time scales with interval_mult.
## The origin is the middle of the holder's base, on the floor.

signal telegraphed

enum Phase { LOW, WARNING, FLARE }

const CANDLE_HEIGHT := 22.0
const FLAME_WIDTH := 14.0
const WAX := Color(0.98, 0.93, 0.8)
const WAX_SHADE := Color(0.84, 0.76, 0.6)
const HOLDER := Color(0.6, 0.38, 0.86)
const HOLDER_DARK := Color(0.32, 0.16, 0.5)
const GOLD := Color(0.98, 0.8, 0.3)
const OUTLINE := Color(0.14, 0.1, 0.2)
const FLAME := Color(1.0, 0.62, 0.16)
const FLAME_CORE := Color(1.0, 0.93, 0.55)
const FLAME_HOT := Color(1.0, 0.4, 0.12)

## Frames with the flame low at difficulty 1 (scaled by interval_mult).
@export var low_frames := 150
## Frames the flame stays up.
@export var flare_frames := 60
@export var telegraph_seconds := 0.5
## How tall the flare is above the wick, px.
@export var flare_height := 40.0
## Extra frames before the first cycle (to stagger several).
@export var first_delay := 0

var phase := Phase.LOW
var _timer := 0
var _flame: PlayerArea
var _d := NAN


func _ready() -> void:
	_flame = PlayerArea.new()
	_flame.name = "Flame"
	_flame.collision_layer = Layers.HAZARDS
	_flame.monitorable = true
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(FLAME_WIDTH, flare_height)
	shape.shape = rect
	shape.position = Vector2(0.0, -CANDLE_HEIGHT - flare_height / 2.0)
	_flame.add_child(shape)
	add_child(_flame)
	_timer = -first_delay


func _physics_process(_delta: float) -> void:
	_timer += 1
	match phase:
		Phase.LOW:
			if _timer >= quiet() - warning():
				phase = Phase.WARNING
				_timer = 0
				telegraphed.emit()
				LevelFx.play_telegraph()
		Phase.WARNING:
			if _timer >= warning():
				phase = Phase.FLARE
				_timer = 0
		Phase.FLARE:
			for player in _flame.players_inside():
				if player.state != &"dead":
					player.hurt(global_position + Vector2(0.0, -CANDLE_HEIGHT))
			if _timer >= flare_frames:
				phase = Phase.LOW
				_timer = 0
	queue_redraw()


func is_telegraphing() -> bool:
	return phase == Phase.WARNING


func is_flaring() -> bool:
	return phase == Phase.FLARE


func local_difficulty() -> float:
	if is_nan(_d):
		_d = LevelDifficulty.at(self)
	return _d


## Frames between flares, the warning included.
func quiet() -> int:
	return maxi(LevelDifficulty.interval_frames(low_frames, local_difficulty()), warning() + 1)


func warning() -> int:
	return LevelDifficulty.telegraph_frames(telegraph_seconds, local_difficulty())


func _draw() -> void:
	# Holder: a purple dish with a gold rim.
	draw_rect(Rect2(-10.0, -5.0, 20.0, 5.0), OUTLINE)
	draw_rect(Rect2(-9.0, -4.0, 18.0, 3.0), HOLDER)
	draw_rect(Rect2(-9.0, -2.0, 18.0, 1.0), HOLDER_DARK)
	draw_rect(Rect2(-9.0, -5.0, 18.0, 1.0), GOLD)
	# Wax with a drip.
	draw_rect(Rect2(-5.0, -CANDLE_HEIGHT - 1.0, 10.0, CANDLE_HEIGHT - 3.0), OUTLINE)
	draw_rect(Rect2(-4.0, -CANDLE_HEIGHT, 8.0, CANDLE_HEIGHT - 5.0), WAX)
	draw_rect(Rect2(2.0, -CANDLE_HEIGHT, 2.0, CANDLE_HEIGHT - 5.0), WAX_SHADE)
	draw_rect(Rect2(-4.0, -CANDLE_HEIGHT + 1.0, 2.0, 5.0), WAX)
	draw_line(Vector2(0.0, -CANDLE_HEIGHT), Vector2(0.0, -CANDLE_HEIGHT - 3.0), OUTLINE, 1.0)
	var wick := Vector2(0.0, -CANDLE_HEIGHT - 3.0)
	match phase:
		Phase.LOW:
			_draw_flame(wick, 4.0, 7.0 + float((_timer / 6) % 2), FLAME, FLAME_CORE)
		Phase.WARNING:
			# Sputtering: the flame jumps between small and tall and flashes.
			var tall := 8.0 + float((_timer * 7) % 11)
			_draw_flame(wick + Vector2(float(_timer % 3) - 1.0, 0.0), 5.0, tall,
					FLAME_HOT if (_timer / 3) % 2 == 0 else FLAME, FLAME_CORE)
		Phase.FLARE:
			var sway := sin(_timer * 0.4) * 1.5
			_draw_flame(wick + Vector2(sway, 0.0), FLAME_WIDTH / 2.0, flare_height, FLAME_HOT, FLAME)
			_draw_flame(wick + Vector2(sway * 0.5, 0.0), FLAME_WIDTH / 4.0, flare_height * 0.6, FLAME_CORE, FLAME_CORE)


## A teardrop flame standing on `base`, `half_width` wide and `height` tall.
func _draw_flame(base: Vector2, half_width: float, height: float, color: Color, core: Color) -> void:
	var points := PackedVector2Array()
	for k in 9:
		var a := PI * k / 8.0
		points.append(base + Vector2(cos(a) * half_width, sin(a) * half_width * 0.6 - half_width * 0.6))
	points.append(base + Vector2(0.0, -height))
	draw_colored_polygon(points, color)
	draw_polyline(points + PackedVector2Array([points[0]]), OUTLINE, 1.0)
	draw_circle(base + Vector2(0.0, -height * 0.25), half_width * 0.45, core)
