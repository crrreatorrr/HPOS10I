extends "res://levels/enemies/walker.gd"
## Spike pill robot (tier 3, docs/LEVELS.md): a slow walker whose spikes pop
## out on a timer. Before they come out the tips peek and shake for a
## telegraph. While the spikes are out, touching it hurts even a rolling or
## jumping Sproto; hit it while they are in. The cycle and the telegraph
## scale with the local difficulty.

enum Phase { SAFE, WARNING, SPIKED }

const TELEGRAPH := 0.5
const SPIKE_LENGTH := 6.0
const SPIKE_COUNT := 8

## Frames with the spikes in, and out, at difficulty 1.
@export var safe_frames := 120
@export var spiked_frames := 90
## Frames before the first cycle starts (to stagger several).
@export var first_delay := 0

var phase := Phase.SAFE
var _timer := 0


func _ready() -> void:
	super()
	_timer = -first_delay


func _enemy_physics(delta: float) -> void:
	super(delta)
	_timer += 1
	match phase:
		Phase.SAFE:
			if _timer >= interval_frames(safe_frames) - telegraph_frames(TELEGRAPH):
				phase = Phase.WARNING
				if on_screen(32.0):
					play_telegraph()
		Phase.WARNING:
			if _timer >= interval_frames(safe_frames):
				phase = Phase.SPIKED
				_timer = 0
		Phase.SPIKED:
			if _timer >= spiked_frames:
				phase = Phase.SAFE
				_timer = 0


func spikes_out() -> bool:
	return phase == Phase.SPIKED


func is_telegraphing() -> bool:
	return phase == Phase.WARNING


func is_harmful(_player: Player) -> bool:
	return spikes_out()


func _visor_flash() -> bool:
	return phase == Phase.WARNING and (_timer / 4) % 2 == 0


func _draw_behind_body() -> void:
	if phase == Phase.SAFE:
		return
	var length := SPIKE_LENGTH if phase == Phase.SPIKED else 2.0
	var shake := (float(_timer % 2) - 0.5) if phase == Phase.WARNING else 0.0
	for i in SPIKE_COUNT:
		var a := TAU * (i + 0.5) / SPIKE_COUNT
		var dir := Vector2(cos(a) * 1.6, sin(a))
		var base := Vector2(cos(a) * (HALF_LENGTH + RADIUS - 1.0), sin(a) * (RADIUS - 1.0)) + Vector2(shake, 0.0)
		var side := dir.orthogonal().normalized() * 2.5
		var tip := base + dir.normalized() * length
		draw_colored_polygon(PackedVector2Array([base - side, tip, base + side]),
				PillArt.FLASH if phase == Phase.WARNING else PillArt.SPIKE)
		draw_polyline(PackedVector2Array([base - side, tip, base + side]), PillArt.SPIKE_DARK, 1.0)
