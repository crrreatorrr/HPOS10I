class_name Player
extends Node2D
## Sproto. Classic momentum physics after the community Physics Guide, with a
## custom raycast sensor system (no move_and_slide, no CharacterBody2D).
##
## Units: the public API uses classic pixels per frame. Internally speeds are
## px/s and accelerations px/s², integrated with the physics delta at the fixed
## 60 Hz tick. Rules that are inherently per frame (air drag, spin dash charge
## decay, frame counters) run once per tick with the classic formulas.
## Constants are read from Tuning.physics every tick so live tuning works.
##
## The node position is the centre of the hitbox. Ground movement follows the
## Physics Guide order (see _ground_step / _air_step).

signal state_changed(old: StringName, new: StringName)
signal hurt_taken
signal died

## Collision modes (which way is "down" for the sensors).
enum { FLOOR, RIGHT_WALL, CEILING, LEFT_WALL }

const PATH_A := 0
const PATH_B := 1

const ATTACK_STATES: Array[StringName] = [&"jump", &"roll", &"spindash"]

# Classic behaviour values that are not in PhysicsConstants.
## No jump when a ceiling is this close above the head.
const JUMP_CLEARANCE := 6.0
## Wall sensors drop this far below the centre on flat floor (catches low steps).
const FLAT_WALL_SENSOR_DROP := 8.0
## Floor snapping window: min(|speed| + SNAP_BASE, SNAP_MAX) pixels.
const SNAP_BASE := 4.0
const SNAP_MAX := 14.0
## A top-only platform is only landed on when the feet are at most
## (y speed + this) pixels below its surface, like the classic games.
const TOP_ONLY_GRACE := 8.0
## A grounded floor reading that differs from the current angle by more than
## this is re-measured from the surface around the hit.
const SUSPICIOUS_ANGLE_STEP := 45.0
## Below this ground speed (px/frame) Sproto settles flat across the bottom
## of any V, so he can come to rest (and crouch) there.
const VALLEY_REST_SPEED := 0.5
## Reach of the downward A/B probe that recognises a sharp V from a wall mode.
const VALLEY_PROBE_REACH := 48.0
## Feet within this distance of a surface count as touching it.
const CONTACT_EPSILON := 0.05
## bounce_off() trims this from the rebound speed (px/frame).
const BOUNCE_TRIM := 1.0
const DIED_SIGNAL_FRAMES := 60

# --- Public state (classic units) -------------------------------------------

## Ground speed, px/frame.
var ground_speed: float:
	get:
		return _gsp / PhysicsConstants.FPS
	set(value):
		_gsp = PhysicsConstants.speed(value)
## x/y speed, px/frame.
var velocity: Vector2:
	get:
		return _vel / PhysicsConstants.FPS
	set(value):
		_vel = value * PhysicsConstants.FPS
## Physics Guide degrees: 0 flat, counter-clockwise.
var ground_angle := 0.0
var grounded := false
var collision_mode := FLOOR
var state: StringName:
	get:
		return _state
	set(value):
		_change_state(value)
## 1 right, -1 left.
var facing := 1
## Non-empty: the player is kept inside (autoscroll). Crushed = kill().
var clamp_rect := Rect2()
## 0 = path A, 1 = path B.
var collision_path := PATH_A
## Frames left with left/right ignored on the ground.
var control_lock := 0
## Down held while standing still (entry to the spin dash).
var crouching := false
var spindash_charge := 0.0
## Pose override for the visuals (e.g. &"victory"). Cleared on state change.
var pose := &""

@onready var hitbox: Area2D = $Hitbox
@onready var _hitbox_shape: CollisionShape2D = $Hitbox/Shape

var sensors := PlayerSensors.new()

var _gsp := 0.0  # px/s
var _vel := Vector2.ZERO  # px/s
var _state := &"idle"
var _ball := false  # small hitbox: jump, roll, spin dash
var _jumped := false  # variable jump height allowed
var _air_locked := false  # no air control (roll jump, hurt)
var _skidding := false
var _hit_wall := false  # a ground wall sensor stopped Sproto this frame
var _wall_blocked := false  # ... last frame (read by the force-roll)
var _in_valley := false  # standing flat across the bottom of a V
var _invincible_frames := 0
var _death_frames := 0
var _frozen := false


## Returns the player whose hitbox is `area`, or null.
static func from_area(area: Area2D) -> Player:
	if area == null:
		return null
	var parent := area.get_parent()
	if parent is Player and (parent as Player).hitbox == area:
		return parent
	return null


## Physics Guide ranges, boundaries inclusive: floor 0-45 and 315-360, right
## wall 46-134, ceiling 135-225, left wall 226-314. The angle is rounded to
## 0.001 deg first so float noise never lands a boundary angle on the wrong side.
static func mode_for_angle(angle: float) -> int:
	angle = fposmod(snappedf(angle, 0.001), 360.0)
	if angle <= 45.0 or angle >= 315.0:
		return FLOOR
	if angle < 135.0:
		return RIGHT_WALL
	if angle <= 225.0:
		return CEILING
	return LEFT_WALL


## "Down" for the sensors in a collision mode.
static func mode_down(mode: int) -> Vector2:
	match mode:
		RIGHT_WALL:
			return Vector2.RIGHT
		CEILING:
			return Vector2.UP
		LEFT_WALL:
			return Vector2.LEFT
	return Vector2.DOWN


## Direction of positive ground speed in a collision mode.
static func mode_right(mode: int) -> Vector2:
	match mode:
		RIGHT_WALL:
			return Vector2.UP
		CEILING:
			return Vector2.LEFT
		LEFT_WALL:
			return Vector2.DOWN
	return Vector2.RIGHT


## Degrees away from flat floor (0..180).
static func angle_from_flat(angle: float) -> float:
	return minf(angle, 360.0 - angle)


func _ready() -> void:
	add_to_group(&"player")
	_update_hitbox()


# --- Public API (docs/CONTRACTS.md) -----------------------------------------

func is_attacking() -> bool:
	return _state in ATTACK_STATES


func is_invincible() -> bool:
	return _invincible_frames > 0


## Coins can be picked up unless knocked back or dead.
func can_collect_coins() -> bool:
	return _state != &"hurt" and _state != &"dead"


## Current hitbox radii (width, height) in pixels.
func get_radii() -> Vector2:
	var p := Tuning.physics
	if _ball:
		return Vector2(p.roll_width_radius, p.roll_height_radius)
	return Vector2(p.width_radius, p.height_radius)


func hurt(source_position: Vector2) -> void:
	if _state == &"dead" or _state == &"hurt" or is_invincible():
		return
	var p := Tuning.physics
	var lost := GameState.lose_coins()
	if lost <= 0:
		kill()
		return
	ScatteredCoin.scatter(get_parent(), global_position, mini(lost, p.max_scattered_coins))
	var away := signf(global_position.x - source_position.x)
	if away == 0.0:
		away = -facing
	_leave_ground()
	_set_ball(false)
	_vel = Vector2(PhysicsConstants.speed(p.hurt_x_speed) * away, PhysicsConstants.speed(p.hurt_y_speed))
	_jumped = false
	_air_locked = true
	_invincible_frames = p.invincibility_frames
	_change_state(&"hurt")
	Audio.play_sfx(&"hurt")
	Audio.play_sfx(&"coin_loss")
	hurt_taken.emit()


func kill() -> void:
	if _state == &"dead":
		return
	_frozen = false
	_leave_ground()
	_set_ball(false)
	ground_angle = 0.0
	_gsp = 0.0
	_vel = Vector2(0.0, PhysicsConstants.speed(Tuning.physics.death_y_speed))
	_invincible_frames = 0
	_death_frames = 0
	z_index = 100
	hitbox.set_deferred(&"monitorable", false)
	_change_state(&"dead")
	Audio.play_sfx(&"death")


## Rebound after destroying an enemy or hitting a boss. `reverse_x` also
## reverses horizontal speed (boss hits).
func bounce_off(target_y: float, reverse_x := false) -> void:
	if _state == &"dead":
		return
	if grounded:
		if reverse_x:
			_gsp = -_gsp
		return
	if global_position.y > target_y or _vel.y < 0.0:
		_vel.y -= signf(_vel.y) * PhysicsConstants.speed(BOUNCE_TRIM)
	else:
		_vel.y = -_vel.y
	if reverse_x:
		_vel.x = -_vel.x


## Airborne launch (springs). Not attacking, no variable jump.
func launch(velocity_pf: Vector2) -> void:
	if _state == &"dead":
		return
	_leave_ground()
	_set_ball(false)
	_vel = velocity_pf * PhysicsConstants.FPS
	_cap_velocity(Tuning.physics)
	if velocity_pf.x != 0.0:
		facing = int(signf(velocity_pf.x))
	_jumped = false
	_air_locked = false
	_change_state(&"spring")


## Horizontal springs and boosters.
func push_ground(speed_pf: float, lock_frames := 16) -> void:
	if _state == &"dead":
		return
	if speed_pf != 0.0:
		facing = int(signf(speed_pf))
	if grounded:
		_gsp = PhysicsConstants.speed(speed_pf)
		crouching = false
		if _state == &"spindash":
			_change_state(&"roll")
		elif not _ball:
			_change_state(&"run")
	else:
		_vel.x = PhysicsConstants.speed(speed_pf)
	control_lock = lock_frames


func set_control_lock(frames: int) -> void:
	control_lock = maxi(frames, 0)


func set_collision_path(path: int) -> void:
	collision_path = PATH_B if path == PATH_B else PATH_A


func freeze(frozen: bool) -> void:
	_frozen = frozen
	if frozen:
		_gsp = 0.0
		_vel = Vector2.ZERO
		crouching = false
		_skidding = false
		if grounded and _state != &"dead":
			_set_ball(false)
			_change_state(&"idle")
	else:
		pose = &""


func play_pose(new_pose: StringName) -> void:
	pose = new_pose


func respawn_at(new_position: Vector2) -> void:
	# Leave the ball hitbox first: _set_ball() shifts the centre to keep the feet.
	_leave_ground()
	_set_ball(false)
	global_position = new_position
	ground_angle = 0.0
	_gsp = 0.0
	_vel = Vector2.ZERO
	_jumped = false
	_air_locked = false
	_skidding = false
	crouching = false
	spindash_charge = 0.0
	control_lock = 0
	_invincible_frames = 0
	_death_frames = 0
	_frozen = false
	pose = &""
	z_index = 0
	collision_path = PATH_A
	hitbox.set_deferred(&"monitorable", true)
	_change_state(&"idle")
	_update_hitbox()


# --- Main loop ----------------------------------------------------------------

func _physics_process(delta: float) -> void:
	if _frozen:
		return
	var p := Tuning.physics
	sensors.begin_frame(get_world_2d().direct_space_state)
	if _invincible_frames > 0:
		_invincible_frames -= 1
	if _state == &"dead":
		_dead_step(p, delta)
		return
	if grounded:
		_ground_step(p, delta)
	else:
		_air_step(p, delta)
	_apply_clamp_rect(p)
	_update_hitbox()


func _input_dir() -> int:
	return int(Input.is_action_pressed(&"move_right")) - int(Input.is_action_pressed(&"move_left"))


# --- Ground ---------------------------------------------------------------------

func _ground_step(p: PhysicsConstants, dt: float) -> void:
	_wall_blocked = _hit_wall
	_hit_wall = false
	var dir := _input_dir() if control_lock == 0 else 0
	var down_held := Input.is_action_pressed(&"move_down")
	var jump_pressed := Input.is_action_just_pressed(&"jump")

	# 1. Spin dash and crouch. Charging and the release frame skip the rest of
	#    the step (no slope factor, friction or movement), like the classic games.
	if _state == &"spindash":
		_spindash_step(p, down_held, jump_pressed)
		_stick_to_ground(p)
		return
	if jump_pressed and (crouching or _is_force_rolling(p) and down_held):
		crouching = false
		spindash_charge = 0.0
		_set_ball(true)
		_change_state(&"spindash")
		Audio.play_sfx(&"spindash_charge")
		_stick_to_ground(p)
		return

	# 2. Slope factor.
	_apply_slope_factor(p, dt)

	# 3. Jump (no movement on the jump frame).
	if jump_pressed and _has_jump_clearance():
		_jump(p)
		return

	# 4. Input, acceleration and friction.
	if _ball:
		_roll_input(p, dt, dir)
	else:
		_run_input(p, dt, dir)

	# 5. Start a roll, or crouch.
	if not _ball and down_held and dir == 0 \
			and absf(_gsp) >= PhysicsConstants.speed(p.roll_min_speed):
		_set_ball(true)
		Audio.play_sfx(&"roll")
	crouching = not _ball and down_held and dir == 0 and _gsp == 0.0

	var cap := PhysicsConstants.speed(p.speed_cap)
	_gsp = clampf(_gsp, -cap, cap)

	# 6-8. Move, wall sensors E/F, floor sensors A/B.
	_move_on_ground(p, dt)
	if not grounded:
		if _state == &"skid":
			_change_state(&"run")
		return

	# 9. Slipping on steep slopes.
	_check_slip(p)
	if grounded:
		_update_ground_state()


func _spindash_step(p: PhysicsConstants, down_held: bool, jump_pressed: bool) -> void:
	if not down_held:
		_gsp = PhysicsConstants.speed(p.spindash_base_speed + floorf(spindash_charge) / 2.0) * facing
		spindash_charge = 0.0
		_change_state(&"roll")
		Audio.play_sfx(&"spindash_release")
		return
	# Classic per-frame decay first, then a press adds charge.
	spindash_charge -= floorf(spindash_charge / 0.125) / 256.0
	if jump_pressed:
		spindash_charge = minf(spindash_charge + p.spindash_charge_per_press, p.spindash_max_charge)
		Audio.play_sfx(&"spindash_charge")


func _apply_slope_factor(p: PhysicsConstants, dt: float) -> void:
	# The classic games skip the slope factor on ceilings.
	if collision_mode == CEILING:
		return
	var s := sin(deg_to_rad(ground_angle))
	var factor := p.slope_factor_normal
	if _ball:
		var uphill := _gsp != 0.0 and signf(_gsp) == signf(s)
		factor = p.slope_factor_roll_up if uphill else p.slope_factor_roll_down
	var amount := factor * s
	if _gsp == 0.0 and absf(amount) < p.slope_stand_min:
		return
	_gsp -= PhysicsConstants.accel(amount) * dt


func _has_jump_clearance() -> bool:
	var r := get_radii()
	var up := -mode_down(collision_mode)
	var hit := sensors.cast_pair(PackedStringArray(["C", "D", "CD"]), global_position,
			mode_right(collision_mode), up, r.x, r.y + JUMP_CLEARANCE, _terrain_mask(false))
	return hit == null


## Rolling at creep speed under a ceiling too low to stand up in.
func _is_force_rolling(p: PhysicsConstants) -> bool:
	return _ball and _state == &"roll" \
			and absf(_gsp) <= PhysicsConstants.speed(p.unroll_speed) + 0.001 \
			and not _has_standing_headroom(p)


## True when the standing hitbox would fit above the feet (checked from the ball).
func _has_standing_headroom(p: PhysicsConstants) -> bool:
	var reach := p.height_radius * 2.0 - p.roll_height_radius
	var hit := sensors.cast_pair(PackedStringArray(["C", "D", "CD"]), global_position,
			mode_right(collision_mode), -mode_down(collision_mode), p.width_radius, reach,
			_terrain_mask(false))
	return hit == null


func _jump(p: PhysicsConstants) -> void:
	var a := deg_to_rad(ground_angle)
	var force := PhysicsConstants.speed(p.jump_force)
	_vel = Vector2(_gsp * cos(a), -_gsp * sin(a))
	_vel.x -= force * sin(a)
	_vel.y -= force * cos(a)
	_air_locked = _ball  # jumping out of a roll locks air control
	_set_ball(true)
	_leave_ground()
	_jumped = true
	crouching = false
	_change_state(&"jump")
	Audio.play_sfx(&"jump")


func _run_input(p: PhysicsConstants, dt: float, dir: int) -> void:
	var acc := PhysicsConstants.accel(p.acceleration) * dt
	var dec := PhysicsConstants.accel(p.deceleration) * dt
	var top := PhysicsConstants.speed(p.top_speed)
	_skidding = false
	if dir == 0:
		_gsp = move_toward(_gsp, 0.0, PhysicsConstants.accel(p.friction) * dt)
		return
	if _gsp * dir < 0.0:
		# Pressing against the motion: decelerate, turning around at 0.5.
		if absf(_gsp) >= PhysicsConstants.speed(p.skid_min_speed) and collision_mode == FLOOR:
			_skidding = true
		elif _state == &"skid":
			_skidding = true
		_gsp += dec * dir
		if _gsp * dir >= 0.0:
			_gsp = PhysicsConstants.speed(p.turnaround_speed) * dir
			_skidding = false
			facing = dir
	else:
		# Accelerating: up to top speed, never reducing a higher speed.
		if _gsp * dir < top:
			_gsp += acc * dir
			if _gsp * dir > top:
				_gsp = top * dir
		facing = dir


func _roll_input(p: PhysicsConstants, dt: float, dir: int) -> void:
	_skidding = false
	if dir != 0 and _gsp * dir < 0.0:
		_gsp += PhysicsConstants.accel(p.roll_deceleration) * dt * dir
		if _gsp * dir >= 0.0:
			_gsp = PhysicsConstants.speed(p.turnaround_speed) * dir
	_gsp = move_toward(_gsp, 0.0, PhysicsConstants.accel(p.roll_friction) * dt)
	if _gsp != 0.0:
		facing = int(signf(_gsp))
	if absf(_gsp) < PhysicsConstants.speed(p.unroll_speed):
		if _has_standing_headroom(p):
			_set_ball(false)
		else:
			# Too low to stand up: keep rolling out, like the classic force-roll.
			# The creep goes the held way, and turns back off a wall, so a low
			# dead end can always be left.
			if dir != 0:
				facing = dir
			elif _wall_blocked:
				facing = -facing
			_gsp = PhysicsConstants.speed(p.unroll_speed) * facing


## Moves along the ground in sub-steps no longer than the smallest sensor
## reach, so nothing can tunnel through walls or floors even at 16 px/frame.
func _move_on_ground(p: PhysicsConstants, dt: float) -> void:
	var steps := maxi(1, ceili(absf(_gsp) * dt / _max_step(p)))
	for i in steps:
		var a := deg_to_rad(ground_angle)
		_vel = Vector2(cos(a), -sin(a)) * _gsp
		global_position += _vel * dt / steps
		if _gsp != 0.0:
			_ground_wall_check(p)
		if not _ground_floor_check(p):
			_leave_ground()
			var remaining := steps - i - 1
			if remaining > 0:
				_move_in_air(p, _vel * dt * remaining / steps)
			return
	var final_a := deg_to_rad(ground_angle)
	_vel = Vector2(cos(final_a), -sin(final_a)) * _gsp


## Wall sensors E/F on the ground: only the one facing the motion, rotated
## with the collision mode, disabled on the ceiling half (like the classic games).
func _ground_wall_check(p: PhysicsConstants) -> void:
	if ground_angle > 90.0 and ground_angle < 270.0:
		return
	if _in_valley:
		return  # both sides of the V are floor, handled by the floor sensors
	var side := signf(_gsp)
	var dir := mode_right(collision_mode) * side
	var label := "F" if side > 0.0 else "E"
	var mask := _terrain_mask(false)
	var origin := global_position
	var flat := collision_mode == FLOOR and angle_from_flat(ground_angle) < 1.0
	if flat:
		origin += Vector2(0.0, FLAT_WALL_SENSOR_DROP)
	var hit := sensors.cast(label, origin, dir, p.push_radius, mask)
	if flat and not _ball:
		# Standing on flat ground, a ceiling lower than the head (a tunnel too
		# low to walk into) blocks like a wall. Roll to get in.
		var head := global_position + Vector2(0.0, 1.0 - p.height_radius)
		var top := sensors.cast(label, head, dir, p.push_radius, mask)
		if top != null and (hit == null or top.distance < hit.distance):
			hit = top
	if hit == null:
		return
	if dir.y > 0.5 and _is_opposite_steep_slope(hit.angle) and _steep_valley_below():
		# Running down a steep side of a V, the "wall" ahead is the other side:
		# this is the valley floor. Go on in floor mode (see _ground_floor_check).
		collision_mode = FLOOR
		return
	global_position -= dir * (p.push_radius - hit.distance)
	_gsp = 0.0
	_vel = Vector2.ZERO
	_hit_wall = true


## Floor sensors A/B: snap to the nearer hit or report that the ground is gone.
## `tolerance` < 0 uses the classic min(|speed| + 4, 14) window.
func _ground_floor_check(p: PhysicsConstants, tolerance := -1.0) -> bool:
	var r := get_radii()
	# At the bottom of a sharp V the wall-mode offset would put the centre into
	# the other side: switch to floor mode as soon as A/B straddle it. The two
	# modes place the centre far apart there, so allow the whole sensor reach.
	if (collision_mode == RIGHT_WALL or collision_mode == LEFT_WALL) \
			and angle_from_flat(ground_angle) < 90.0 and _steep_valley_below():
		collision_mode = FLOOR
		tolerance = maxf(tolerance, VALLEY_PROBE_REACH)
	var down := mode_down(collision_mode)
	var hit := sensors.cast_pair(PackedStringArray(["A", "B", "AB"]), global_position,
			mode_right(collision_mode), down, r.x, r.y + SNAP_MAX,
			_terrain_mask(collision_mode == FLOOR))
	if hit == null:
		return false
	# A on a "\" slope and B on a "/" one: straddling the bottom of a V. Stand
	# there as if on flat ground, like the classic games: always when both sides
	# are steeper than 45 deg (no wall mode fits there), and on gentler V's only
	# when nearly at rest, so crossing them at speed is unchanged.
	var pair := sensors.last_pair
	var at_rest := absf(_gsp) <= PhysicsConstants.speed(VALLEY_REST_SPEED)
	var valley := collision_mode == FLOOR and pair[0] != null and pair[1] != null \
			and _is_valley(pair[0].angle, pair[1].angle, not at_rest)
	var gap := hit.distance - r.y
	# A reading far from the current angle is checked against the surface
	# around the hit: real corners agree, polygon-vertex artefacts do not.
	if not valley and grounded \
			and absf(wrapf(hit.angle - ground_angle, -180.0, 180.0)) > SUSPICIOUS_ANGLE_STEP:
		hit.angle = sensors.surface_angle(hit)
	if tolerance < 0.0:
		var along := absf(_vel.x if collision_mode == FLOOR or collision_mode == CEILING else _vel.y)
		tolerance = minf(along / PhysicsConstants.FPS + SNAP_BASE, SNAP_MAX)
	if gap > tolerance:
		return false
	global_position += down * gap
	if valley and at_rest:
		# Come to rest where both sensors touch: steady, so he can stay, crouch
		# and jump there.
		var rest := _valley_rest_position(pair[0], pair[1])
		if rest.is_finite() and rest.distance_to(global_position) < r.y:
			global_position = rest
	_in_valley = valley
	ground_angle = 0.0 if valley else hit.angle
	collision_mode = mode_for_angle(ground_angle)
	return true


## Centre position at the bottom of a V where A and B touch the two sides at
## the same height. INF when the sides are parallel.
func _valley_rest_position(left: PlayerSensors.Hit, right: PlayerSensors.Hit) -> Vector2:
	var r := get_radii()
	var dl := Vector2(cos(deg_to_rad(left.angle)), -sin(deg_to_rad(left.angle)))
	var dr := Vector2(cos(deg_to_rad(right.angle)), -sin(deg_to_rad(right.angle)))
	var denom := dl.cross(dr)
	if absf(denom) < 0.000001:
		return Vector2.INF
	var vertex := left.position + dl * ((right.position - left.position).cross(dr) / denom)
	var tl := tan(deg_to_rad(angle_from_flat(left.angle)))
	var tr := tan(deg_to_rad(angle_from_flat(right.angle)))
	var u := r.x * (tl - tr) / (tl + tr)
	return Vector2(vertex.x + u, vertex.y - (r.x - u) * tl - r.y)


## True for a steep (> 45 deg) slope leaning the other way from the current ground.
func _is_opposite_steep_slope(angle: float) -> bool:
	if collision_mode != RIGHT_WALL and collision_mode != LEFT_WALL:
		return false
	return angle_from_flat(angle) > 45.0 and angle_from_flat(angle) < 90.0 \
			and signf(sin(deg_to_rad(angle))) != signf(sin(deg_to_rad(ground_angle)))


## Casts A/B straight down from the centre: true when they stand on opposite
## slopes steeper than 45 deg (the bottom of a sharp V, where a wall mode's
## sideways offset would put the centre into the other side).
func _steep_valley_below() -> bool:
	var r := get_radii()
	sensors.cast_pair(PackedStringArray(["A", "B"]), global_position, Vector2.RIGHT, Vector2.DOWN,
			r.x, VALLEY_PROBE_REACH, _terrain_mask(true))
	var pair := sensors.last_pair
	return pair[0] != null and pair[1] != null and _is_valley(pair[0].angle, pair[1].angle, true)


## A (left) on a slope descending to the right and B (right) on one rising:
## the sensors straddle the bottom of a V. With `steep_only`, both sides must
## be steeper than 45 deg.
static func _is_valley(left_angle: float, right_angle: float, steep_only: bool) -> bool:
	var left := angle_from_flat(left_angle)
	var right := angle_from_flat(right_angle)
	if left < 1.0 or right < 1.0 or left >= 90.0 or right >= 90.0:
		return false
	if left_angle < 180.0 or right_angle > 180.0:
		return false
	return not steep_only or (left > 45.0 and right > 45.0)


## Keeps a standing-still player (spin dash) on the ground. The full snap window
## is allowed: switching to the ball hitbox can lift the feet off a V's sides.
func _stick_to_ground(p: PhysicsConstants) -> void:
	if not _ground_floor_check(p, SNAP_MAX):
		_leave_ground()
	var a := deg_to_rad(ground_angle)
	_vel = Vector2(cos(a), -sin(a)) * _gsp


func _check_slip(p: PhysicsConstants) -> void:
	if control_lock > 0:
		control_lock -= 1
		return
	var steepness := angle_from_flat(ground_angle)
	if absf(_gsp) >= PhysicsConstants.speed(p.slip_speed) or steepness <= p.slip_angle:
		return
	control_lock = p.control_lock_frames
	if steepness > p.fall_angle:
		_leave_ground()
	# Otherwise the slope factor slides the player down while input is locked.


func _update_ground_state() -> void:
	if _ball:
		_change_state(&"roll")
	elif _skidding:
		if _state != &"skid":
			Audio.play_sfx(&"skid")
		_change_state(&"skid")
	elif _gsp == 0.0:
		_change_state(&"idle")
	else:
		_change_state(&"run")


# --- Air ------------------------------------------------------------------------

func _air_step(p: PhysicsConstants, dt: float) -> void:
	var fps := PhysicsConstants.FPS
	var dir := 0 if _state == &"hurt" else _input_dir()

	# 1. Variable jump height (real jumps only).
	var release := PhysicsConstants.speed(p.jump_release_speed)
	if _jumped and not Input.is_action_pressed(&"jump") and _vel.y < -release:
		_vel.y = -release

	# 2. Air acceleration, never reducing a speed above top speed.
	if dir != 0:
		if not _air_locked:
			var top := PhysicsConstants.speed(p.top_speed)
			if _vel.x * dir < top:
				_vel.x += PhysicsConstants.accel(p.air_acceleration) * dt * dir
				if _vel.x * dir > top:
					_vel.x = top * dir
		facing = dir

	# 3. Air drag: the classic per-frame formula with truncating division.
	#    The hurt knockback has no drag, like the classic games.
	var ysp := _vel.y / fps
	var xsp := _vel.x / fps
	if p.air_drag_enabled and _state != &"hurt" and ysp < 0.0 and ysp > -p.air_drag_max_up and absf(xsp) >= p.air_drag_min_x:
		xsp -= float(int(xsp / 0.125)) / 256.0
		_vel.x = xsp * fps

	# 4-5. Move and apply gravity. Integrating the constant gravity exactly
	#      (trapezoid) keeps the jump arc on the continuous curve.
	var g := PhysicsConstants.accel(p.hurt_gravity if _state == &"hurt" else p.gravity)
	var displacement := _vel * dt + Vector2(0.0, 0.5 * g * dt * dt)
	_vel.y = minf(_vel.y + g * dt, PhysicsConstants.speed(p.max_fall_speed))
	_cap_velocity(p)

	# 6. Ease the angle back to flat.
	if ground_angle != 0.0:
		if ground_angle < 180.0:
			ground_angle = maxf(ground_angle - p.air_angle_ease, 0.0)
		else:
			ground_angle = ground_angle + p.air_angle_ease
			if ground_angle >= 360.0:
				ground_angle = 0.0

	# 7. Sensors.
	_move_in_air(p, displacement)


## Moves through the air in sub-steps, running the sensors after each:
## walls always, ceiling when moving up, floor when moving down.
func _move_in_air(p: PhysicsConstants, displacement: Vector2) -> void:
	var steps := maxi(1, ceili(displacement.length() / _max_step(p)))
	var step := displacement / steps
	for i in steps:
		global_position += step
		_air_wall_check(p)
		if _vel.y < 0.0:
			_air_ceiling_check(p)
		elif _air_floor_check(p):
			return
		if grounded:
			return


func _air_wall_check(p: PhysicsConstants) -> void:
	var mask := _terrain_mask(false)
	for side: float in [-1.0, 1.0]:
		var hit := sensors.cast("E" if side < 0.0 else "F", global_position,
				Vector2(side, 0.0), p.push_radius, mask)
		if hit == null:
			continue
		global_position.x -= side * (p.push_radius - hit.distance)
		if _vel.x * side > 0.0:
			_vel.x = 0.0


func _air_ceiling_check(p: PhysicsConstants) -> void:
	var r := get_radii()
	var hit := sensors.cast_pair(PackedStringArray(["C", "D", "CD"]), global_position, Vector2.RIGHT,
			Vector2.UP, r.x, r.y, _terrain_mask(false))
	if hit == null:
		return
	global_position.y += r.y - hit.distance
	var a := hit.angle
	if (a > 90.0 and a <= 135.0) or (a >= 225.0 and a < 270.0):
		# Steep ceiling: land on it, carrying the upward speed along it.
		if _attach(p, a, _vel.y * -signf(sin(deg_to_rad(a)))):
			return
	_vel.y = maxf(_vel.y, 0.0)


func _air_floor_check(p: PhysicsConstants) -> bool:
	var r := get_radii()
	var hit := sensors.cast_pair(PackedStringArray(["A", "B", "AB"]), global_position, Vector2.RIGHT,
			Vector2.DOWN, r.x, r.y + CONTACT_EPSILON, _terrain_mask(true))
	if hit == null:
		return false
	var depth := r.y - hit.distance
	if hit.top_only and depth > _vel.y / PhysicsConstants.FPS + TOP_ONLY_GRACE:
		return false
	# Landing across the bottom of a sharp V: as if on flat ground.
	var pair := sensors.last_pair
	if pair[0] != null and pair[1] != null and _is_valley(pair[0].angle, pair[1].angle, true):
		return _land(p, 0.0)
	return _land(p, hit.angle)


## Converts air speed to ground speed by the landing angle, then attaches.
func _land(p: PhysicsConstants, angle: float) -> bool:
	var xsp := _vel.x
	var ysp := _vel.y
	var steepness := angle_from_flat(angle)
	var downhill := -signf(sin(deg_to_rad(angle)))
	var speed := xsp
	if steepness > 23.0 and absf(xsp) <= ysp:
		speed = ysp * downhill * (0.5 if steepness <= 45.0 else 1.0)
	return _attach(p, angle, speed)


## Puts the player on the ground at `angle` with ground speed `speed` (px/s).
func _attach(p: PhysicsConstants, angle: float, speed: float) -> bool:
	var was_ball := _ball
	_set_ball(false)
	ground_angle = angle
	collision_mode = mode_for_angle(angle)
	if not _ground_floor_check(p, SNAP_MAX):
		collision_mode = FLOOR
		_set_ball(was_ball)
		return false
	grounded = true
	_jumped = false
	_air_locked = false
	_gsp = speed
	if _state == &"hurt":
		_gsp = 0.0
	var a := deg_to_rad(ground_angle)
	_vel = Vector2(cos(a), -sin(a)) * _gsp
	_update_ground_state()
	return true


func _leave_ground() -> void:
	grounded = false
	_in_valley = false
	collision_mode = FLOOR
	crouching = false
	_skidding = false


func _dead_step(p: PhysicsConstants, dt: float) -> void:
	var g := PhysicsConstants.accel(p.gravity)
	global_position += _vel * dt + Vector2(0.0, 0.5 * g * dt * dt)
	_vel.y = minf(_vel.y + g * dt, PhysicsConstants.speed(p.max_fall_speed))
	_death_frames += 1
	if _death_frames == DIED_SIGNAL_FRAMES:
		died.emit()


# --- Helpers --------------------------------------------------------------------

## Switches between the standing and the ball hitbox, keeping the feet in place.
func _set_ball(on: bool) -> void:
	if on == _ball:
		return
	var p := Tuning.physics
	var shift := p.height_radius - p.roll_height_radius
	global_position += mode_down(collision_mode) * (shift if on else -shift)
	_ball = on


func _terrain_mask(include_top_only: bool) -> int:
	return PlayerSensors.terrain_mask(collision_path, include_top_only)


## Longest sub-step: shorter than every sensor reach.
func _max_step(p: PhysicsConstants) -> float:
	var step := maxf(2.0, minf(p.push_radius, p.roll_height_radius) - 2.0)
	# Across a V a horizontal step must stay short enough for the floor sensors
	# to follow a side up to 70 deg.
	return step * 0.5 if _in_valley else step


func _cap_velocity(p: PhysicsConstants) -> void:
	var cap := PhysicsConstants.speed(p.speed_cap)
	_vel = _vel.clamp(Vector2(-cap, -cap), Vector2(cap, cap))


func _apply_clamp_rect(p: PhysicsConstants) -> void:
	if not clamp_rect.has_area() or _state == &"dead":
		return
	var r := get_radii()
	var left := clamp_rect.position.x + r.x
	var right := clamp_rect.end.x - r.x
	var top := clamp_rect.position.y + r.y
	if global_position.x < left:
		global_position.x = left
		_stop_horizontal(-1)
		# Pushed by the left edge into a wall: crushed.
		var mask := _terrain_mask(false)
		var wall := sensors.cast("F", global_position, Vector2.RIGHT, p.push_radius - 1.0, mask)
		if wall != null or sensors.point_in_terrain(global_position, mask):
			kill()
			return
	elif global_position.x > right:
		global_position.x = right
		_stop_horizontal(1)
	if global_position.y < top:
		global_position.y = top
		if not grounded:
			_vel.y = maxf(_vel.y, 0.0)


## Cancels speed heading towards `side` (-1 left, 1 right).
func _stop_horizontal(side: int) -> void:
	if grounded:
		if _vel.x * side > 0.0:
			_gsp = 0.0
			_vel = Vector2.ZERO
	elif _vel.x * side > 0.0:
		_vel.x = 0.0


func _update_hitbox() -> void:
	if _hitbox_shape == null:
		return
	var r := get_radii()
	var rect := _hitbox_shape.shape as RectangleShape2D
	var size := Vector2(r.x * 2.0, maxf(r.y - 3.0, 1.0) * 2.0)
	if rect.size != size:
		rect.size = size


func _change_state(new_state: StringName) -> void:
	if new_state == _state:
		return
	var old := _state
	_state = new_state
	pose = &""
	state_changed.emit(old, new_state)
