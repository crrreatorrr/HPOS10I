class_name ScatteredCoin
extends Area2D
## A coin knocked loose when Sproto is hurt, with the classic scatter
## behaviour: a fan of up to 32 coins, gravity, bouncing off floors, a short
## delay before they can be collected again, then blinking out of existence.

const SCENE_PATH := "res://player/scattered_coin.tscn"

# Classic scatter values (pixels per frame, degrees). Not in PhysicsConstants.
const SCATTER_SPEED_FIRST := 4.0  # LEAD-REQUEST: coin_scatter_speed_first
const SCATTER_SPEED_SECOND := 2.0  # LEAD-REQUEST: coin_scatter_speed_second
const COIN_GRAVITY := 0.09375  # LEAD-REQUEST: coin_gravity
const COIN_BOUNCE := -0.75  # LEAD-REQUEST: coin_bounce
## The first 16 coins form the outer ring, the rest the inner one.
const RING_SIZE := 16
const SCATTER_START_ANGLE := 101.25
const SCATTER_ANGLE_STEP := 22.5
const RADIUS := 6.0
## Coins blink during their last frames.
const BLINK_FRAMES := 64

const COLOR_FILL := Color(1.0, 0.8, 0.15)
const COLOR_RIM := Color(0.7, 0.45, 0.05)
const COLOR_SHINE := Color(1.0, 0.97, 0.75)

## Speed in pixels per frame (classic units).
var velocity: Vector2:
	get:
		return _vel / PhysicsConstants.FPS
	set(value):
		_vel = value * PhysicsConstants.FPS

var _vel := Vector2.ZERO  # px/s
var _age := 0
var _query := PhysicsRayQueryParameters2D.new()


## Spawns `count` coins around `origin` (global) in the classic two-ring fan.
## Coins are added deferred, so this is safe inside physics callbacks.
static func scatter(parent: Node, origin: Vector2, count: int) -> Array[ScatteredCoin]:
	var coins: Array[ScatteredCoin] = []
	if parent == null or count <= 0:
		return coins
	var scene: PackedScene = load(SCENE_PATH)
	var angle := SCATTER_START_ANGLE
	var speed := SCATTER_SPEED_FIRST
	var flip := false
	for i in count:
		if i == RING_SIZE:
			speed = SCATTER_SPEED_SECOND
			angle = SCATTER_START_ANGLE
		var coin: ScatteredCoin = scene.instantiate()
		var v := Vector2(cos(deg_to_rad(angle)), -sin(deg_to_rad(angle))) * speed
		if flip:
			v.x = -v.x
			angle += SCATTER_ANGLE_STEP
		flip = not flip
		coin.velocity = v
		coin.position = (parent as Node2D).to_local(origin) if parent is Node2D else origin
		parent.add_child.call_deferred(coin)
		coins.append(coin)
	return coins


func _ready() -> void:
	add_to_group(&"scattered_coin")
	collision_layer = 1 << 6  # objects
	collision_mask = 1 << 4  # player hitbox
	monitorable = false
	_query.collide_with_areas = false


func _physics_process(delta: float) -> void:
	var p := Tuning.physics
	_age += 1
	if _age >= p.coin_lifetime_frames:
		queue_free()
		return

	var gravity := PhysicsConstants.accel(COIN_GRAVITY)
	var cap := PhysicsConstants.speed(p.speed_cap)
	var from := global_position
	global_position += _vel * delta + Vector2(0.0, 0.5 * gravity * delta * delta)
	_vel.y = minf(_vel.y + gravity * delta, cap)

	# Bounce off floors only while falling (sweep from last position: no tunnelling).
	if _vel.y > 0.0:
		_query.from = from
		_query.to = global_position + Vector2(0.0, RADIUS)
		_query.collision_mask = PlayerSensors.BIT_SOLID | PlayerSensors.BIT_PATH_A \
				| PlayerSensors.BIT_PATH_B | PlayerSensors.BIT_TOP_ONLY
		var hit := get_world_2d().direct_space_state.intersect_ray(_query)
		if not hit.is_empty():
			global_position.y = hit.position.y - RADIUS
			_vel.y *= COIN_BOUNCE

	if _age >= p.coin_recollect_delay_frames:
		for area in get_overlapping_areas():
			var player := Player.from_area(area)
			if player != null and player.can_collect_coins():
				_collect()
				return

	visible = _age < p.coin_lifetime_frames - BLINK_FRAMES or (_age / 4) % 2 == 0
	queue_redraw()


func _collect() -> void:
	GameState.add_coins(1)
	Audio.play_sfx(&"coin")
	queue_free()


func _draw() -> void:
	# Spinning coin: squash horizontally over time.
	var squash := maxf(absf(cos(_age * 0.25)), 0.2)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(squash, 1.0))
	draw_circle(Vector2.ZERO, RADIUS, COLOR_RIM)
	draw_circle(Vector2.ZERO, RADIUS - 1.5, COLOR_FILL)
	draw_circle(Vector2(-1.5, -1.5), 1.5, COLOR_SHINE)
