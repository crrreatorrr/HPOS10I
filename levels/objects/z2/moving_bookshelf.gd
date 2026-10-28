extends MovingBody
## A moving bookshelf (Wizard Academy, docs/DESIGN.md): a tall solid shelf of
## books that slides out of its alcove by `travel`, holds, and slides back,
## on a timer. It is moving terrain (docs/CONTRACTS.md "Moving terrain"): it
## pushes Sproto out of its way, he can ride its top, and pinned against a
## wall by it he is crushed (the player's crush rule). So every close is
## telegraphed: the books rattle, the shelf glows and the telegraph sound
## plays for Difficulty.telegraph(telegraph_seconds, local), never under
## 0.35 s, before it starts to move, including its first cycle after a
## (re)spawn or a pause (the cycle starts at rest). The rest between cycles
## scales with interval_mult.
## The origin is the shelf's top-left corner at rest.

signal telegraphed
signal closing_started

enum Phase { OPEN, WARNING, CLOSING, CLOSED, OPENING }

const WOOD := Color(0.5, 0.3, 0.18)
const WOOD_LIGHT := Color(0.68, 0.45, 0.26)
const WOOD_DARK := Color(0.3, 0.17, 0.1)
const OUTLINE := Color(0.14, 0.08, 0.06)
const GLOW := Color(1.0, 0.86, 0.4)
const SPINES := [Color(0.6, 0.38, 0.86), Color(0.98, 0.93, 0.8), Color(0.42, 0.24, 0.66),
		Color(0.85, 0.36, 0.3), Color(0.36, 0.56, 0.78), Color(0.98, 0.8, 0.3)]

@export var size := Vector2(64.0, 96.0)
## How far it slides out (the closing move).
@export var travel := Vector2(96.0, 0.0)
## Closing and opening speeds, px/frame (closing is linear, opening eased).
@export_range(0.5, 8.0) var close_speed := 3.0
@export_range(0.5, 8.0) var open_speed := 1.5
## Frames at rest between cycles at difficulty 1 (scaled by interval_mult).
@export var rest_frames := 150
## Frames it stays out.
@export var out_frames := 45
@export var telegraph_seconds := 0.6
## Extra frames before the first cycle (to stagger several).
@export var first_delay := 0

var phase := Phase.OPEN
var _timer := 0
var _home := Vector2.ZERO
var _offset := Vector2.ZERO
var _d := NAN


func _ready() -> void:
	_home = position
	add_box(size)
	_timer = -first_delay


func _physics_process(_delta: float) -> void:
	_timer += 1
	var length := travel.length()
	match phase:
		Phase.OPEN:
			if _timer >= rest() - warning():
				_set_phase(Phase.WARNING)
				telegraphed.emit()
				LevelFx.play_telegraph()
		Phase.WARNING:
			if _timer >= warning():
				_set_phase(Phase.CLOSING)
				closing_started.emit()
		Phase.CLOSING:
			var done := minf(close_speed * _timer, length)
			_offset = travel * (done / maxf(length, 0.001))
			if done >= length:
				_set_phase(Phase.CLOSED)
		Phase.CLOSED:
			if _timer >= out_frames:
				_set_phase(Phase.OPENING)
		Phase.OPENING:
			var frames := opening_frames()
			var t := clampf(float(_timer) / frames, 0.0, 1.0)
			_offset = travel * (1.0 - (1.0 - cos(PI * t)) / 2.0)
			if _timer >= frames:
				_offset = Vector2.ZERO
				_set_phase(Phase.OPEN)
	move_to(_home + _offset)
	queue_redraw()


func _set_phase(new_phase: Phase) -> void:
	phase = new_phase
	_timer = 0


func is_telegraphing() -> bool:
	return phase == Phase.WARNING


func is_closing() -> bool:
	return phase == Phase.CLOSING


## How far it is out of its alcove (0 at rest).
func offset() -> Vector2:
	return _offset


func local_difficulty() -> float:
	if is_nan(_d):
		_d = LevelDifficulty.at(self)
	return _d


## Frames at rest, the warning included.
func rest() -> int:
	return maxi(LevelDifficulty.interval_frames(rest_frames, local_difficulty()), warning() + 1)


func warning() -> int:
	return LevelDifficulty.telegraph_frames(telegraph_seconds, local_difficulty())


## Eased opening: peak speed pi / 2 * travel / frames = open_speed.
func opening_frames() -> int:
	return maxi(1, ceili(PI / 2.0 * travel.length() / open_speed))


func _draw() -> void:
	var rattle := Vector2(float(_timer % 2) - 0.5, 0.0) if phase == Phase.WARNING else Vector2.ZERO
	draw_rect(Rect2(Vector2(-1.0, -1.0), size + Vector2(2.0, 2.0)), OUTLINE)
	draw_rect(Rect2(Vector2.ZERO, size), WOOD)
	draw_rect(Rect2(0.0, 0.0, size.x, 3.0), WOOD_LIGHT)
	draw_rect(Rect2(0.0, 0.0, 3.0, size.y), WOOD_DARK)
	draw_rect(Rect2(size.x - 3.0, 0.0, 3.0, size.y), WOOD_DARK)
	# Shelves of plain book spines (no lettering).
	var shelf_h := 24.0
	var rows := maxi(1, int((size.y - 4.0) / shelf_h))
	for r in rows:
		var y0 := 3.0 + r * shelf_h
		var x := 5.0
		var k := r * 3
		while x < size.x - 8.0:
			var w := 5.0 + float((k * 7) % 4)
			var h := shelf_h - 6.0 - float((k * 5) % 5)
			var color: Color = SPINES[k % SPINES.size()]
			var at := Vector2(x, y0 + shelf_h - 3.0 - h) + (rattle if k % 2 == 0 else -rattle)
			draw_rect(Rect2(at - Vector2(0.5, 0.5), Vector2(w + 1.0, h + 1.0)), OUTLINE)
			draw_rect(Rect2(at, Vector2(w, h)), color)
			draw_rect(Rect2(at + Vector2(1.0, 2.0), Vector2(w - 2.0, 1.0)), color.lightened(0.35))
			x += w + 1.0
			k += 1
		draw_rect(Rect2(3.0, y0 + shelf_h - 3.0, size.x - 6.0, 3.0), WOOD_DARK)
	if phase == Phase.WARNING and (_timer / 4) % 2 == 0:
		draw_rect(Rect2(Vector2(-3.0, -3.0), size + Vector2(6.0, 6.0)), GLOW, false, 2.0)
