extends Node2D
## A shifting staircase (Wizard Academy, docs/DESIGN.md): a flight of
## floating stone steps that shifts between two layouts on a timer.
##   Layout A: step i sits at i * rise (a staircase).
##   Layout B: step i sits at i * (rise + fold). With the defaults the flight
##   folds flat into a bridge, then rises again.
## Each step is a MovingBody (docs/CONTRACTS.md "Moving terrain"): Sproto
## rides it up and down. Every shift is eased and never faster than
## `max_speed` px/frame (the contract allows at most 6 px/frame down for a
## ridden platform). Before each shift the runes on the steps glow and the
## telegraph sound plays for Difficulty.telegraph(telegraph_seconds, local),
## never under 0.35 s. The hold between shifts scales with interval_mult.
## Steps never overlap or pinch each other: they move in step, in their own
## columns. Keep 39 px of headroom above the highest layout (the crush rule).
## With `pillars`, each step is a stone pillar reaching down to the first
## step's level (sunk into the floor in the lower layout), so nothing can get
## under a step and be pinned when it comes down; draw it behind the terrain
## (z_index -1) so the sunk part is hidden.
## The origin is the top-left corner of the first step.

signal telegraphed
signal shift_started

enum Phase { HOLD_A, WARN_B, TO_B, HOLD_B, WARN_A, TO_A }

const RUNE := Color(0.62, 0.42, 0.9)
const RUNE_GLOW := Color(1.0, 0.86, 0.4)
const STONE := Color(0.62, 0.6, 0.7)
const STONE_LIGHT := Color(0.8, 0.79, 0.88)
const STONE_DARK := Color(0.36, 0.33, 0.46)
const OUTLINE := Color(0.14, 0.11, 0.22)

@export_range(1, 16) var steps := 5
@export var step_size := Vector2(48.0, 16.0)
## Offset from one step to the next in layout A (y < 0 rises).
@export var rise := Vector2(48.0, -32.0)
## Extra offset per step in layout B.
@export var fold := Vector2(0.0, 32.0)
## Frames each layout holds at difficulty 1 (scaled by interval_mult).
@export var hold_frames := 150
## Frames a shift takes (raised when needed to respect max_speed).
@export var shift_frames := 60
## Fastest any step moves, px/frame.
@export_range(0.5, 6.0) var max_speed := 4.0
@export var telegraph_seconds := 0.5
## Extra frames before the first cycle (to stagger several).
@export var first_delay := 0
## Steps are pillars down to the first step's level (see above).
@export var pillars := false

var phase := Phase.HOLD_A
var _timer := 0
var _blend := 0.0
var _bodies: Array[MovingBody] = []
var _d := NAN


func _ready() -> void:
	for i in steps:
		var step := Step.new()
		step.name = "Step%d" % (i + 1)
		step.size = Vector2(step_size.x, step_size.y + (absf(rise.y) * i if pillars else 0.0))
		step.position = _step_position(i, 0.0)
		step.add_box(step.size)
		add_child(step)
		_bodies.append(step)
	_timer = -first_delay


func _physics_process(_delta: float) -> void:
	_timer += 1
	match phase:
		Phase.HOLD_A, Phase.HOLD_B:
			if _timer >= hold() - warning():
				_set_phase(Phase.WARN_B if phase == Phase.HOLD_A else Phase.WARN_A)
				telegraphed.emit()
				LevelFx.play_telegraph()
		Phase.WARN_B, Phase.WARN_A:
			if _timer >= warning():
				_set_phase(Phase.TO_B if phase == Phase.WARN_B else Phase.TO_A)
				shift_started.emit()
		Phase.TO_B, Phase.TO_A:
			var t := clampf(float(_timer) / float(shift()), 0.0, 1.0)
			var eased := (1.0 - cos(PI * t)) / 2.0
			_blend = eased if phase == Phase.TO_B else 1.0 - eased
			if _timer >= shift():
				_set_phase(Phase.HOLD_B if phase == Phase.TO_B else Phase.HOLD_A)
	var glow := is_telegraphing()
	for i in _bodies.size():
		var step := _bodies[i] as Step
		step.move_to(_step_position(i, _blend))
		if step.glow != glow:
			step.glow = glow
			step.queue_redraw()


func _set_phase(new_phase: Phase) -> void:
	phase = new_phase
	_timer = 0


## Step i's local position, blended between layout A (0) and B (1).
func _step_position(i: int, blend: float) -> Vector2:
	return rise * i + fold * i * blend


## 0 in layout A, 1 in layout B.
func blend() -> float:
	return _blend


func is_telegraphing() -> bool:
	return phase == Phase.WARN_A or phase == Phase.WARN_B


func is_shifting() -> bool:
	return phase == Phase.TO_A or phase == Phase.TO_B


func step_bodies() -> Array[MovingBody]:
	return _bodies


func local_difficulty() -> float:
	if is_nan(_d):
		_d = LevelDifficulty.at(self)
	return _d


## Frames each layout holds, warning included.
func hold() -> int:
	return maxi(LevelDifficulty.interval_frames(hold_frames, local_difficulty()), warning() + 1)


func warning() -> int:
	return LevelDifficulty.telegraph_frames(telegraph_seconds, local_difficulty())


## Frames per shift: at least shift_frames, and slow enough that the eased
## peak speed (pi / 2 * distance / frames) stays within max_speed.
func shift() -> int:
	var longest := (fold * float(steps - 1)).length()
	return maxi(shift_frames, ceili(PI / 2.0 * longest / max_speed))


## One floating stone step: a slab with a rune line that glows before a shift.
class Step:
	extends MovingBody
	var size := Vector2(48.0, 16.0)
	var glow := false

	func _draw() -> void:
		draw_rect(Rect2(Vector2(-1.0, -1.0), size + Vector2(2.0, 2.0)), OUTLINE)
		draw_rect(Rect2(Vector2.ZERO, size), STONE_DARK)
		# The step's top slab, then a pillar of stone courses below it.
		draw_rect(Rect2(0.0, 0.0, size.x, minf(16.0, size.y)), STONE)
		draw_rect(Rect2(0.0, 0.0, size.x, 2.0), STONE_LIGHT)
		var y := 16.0
		var course := 0
		while y < size.y:
			draw_line(Vector2(0.0, y), Vector2(size.x, y), OUTLINE, 1.0)
			var joint := size.x / 2.0 + (12.0 if course % 2 == 0 else -12.0)
			draw_line(Vector2(joint, y), Vector2(joint, minf(y + 8.0, size.y)), OUTLINE, 1.0)
			y += 8.0
			course += 1
		var rune := RUNE_GLOW if glow else RUNE
		draw_line(Vector2(6.0, 8.0), Vector2(size.x - 6.0, 8.0), rune, 1.0)
		for x in [size.x * 0.25, size.x * 0.5, size.x * 0.75]:
			draw_rect(Rect2(x - 1.5, 6.5, 3.0, 3.0), rune)
		if glow:
			draw_rect(Rect2(Vector2(-2.0, -2.0), Vector2(size.x + 4.0, minf(size.y, 16.0) + 4.0)), Color(RUNE_GLOW, 0.5), false, 1.0)
