extends RefCounted
## A pure-math model of the community Physics Guide (the classic 16-bit
## trilogy; the second game's values where the games differ), written without
## reference to player.gd so the two can be compared frame by frame. Units are
## the Guide's: pixels per frame at 60 ticks a second. Every constant is
## written out here on purpose: a drifting value in the tuning resource shows
## up as a comparison failure.
##
## Terrain is a list of surfaces: infinite lines at a Guide angle (0 = flat
## floor, positive = rising to the right) and circular arcs run on from the
## inside (loops, half-pipes). That covers the scenarios in
## tests/physics/test_reference.gd: running, rolling, jumping, landing bands,
## slipping, spin dash, hurt, death, rebounds, springs, and the speed kept
## through a loop or a half-pipe.
##
## Not modelled: walls and ceilings as obstacles, corners between two slopes,
## the sensor quirks on curves (the curve tests only compare exit speeds) and
## the valley rules.

const ACCELERATION := 0.046875
const DECELERATION := 0.5
const FRICTION := 0.046875
const TOP_SPEED := 6.0
const TURNAROUND := 0.5
const SKID_MIN := 4.0
const AIR_ACCELERATION := 0.09375
const GRAVITY := 0.21875
const JUMP_FORCE := 6.5
const JUMP_RELEASE := 4.0
const AIR_DRAG_MAX_UP := 4.0
const AIR_DRAG_MIN_X := 0.125
const AIR_ANGLE_EASE := 2.8125
const SLOPE_FACTOR := 0.125
const SLOPE_ROLL_UP := 0.078125
const SLOPE_ROLL_DOWN := 0.3125
const SLOPE_STAND_MIN := 0.05078125
const SLIP_SPEED := 2.5
const SLIP_ANGLE := 45.0
const FALL_ANGLE := 69.0
const CONTROL_LOCK := 30
const ROLL_FRICTION := 0.0234375
const ROLL_DECELERATION := 0.125
const ROLL_MIN := 1.03125
const UNROLL := 0.5
const SPINDASH_BASE := 8.0
const SPINDASH_PRESS := 2.0
const SPINDASH_MAX := 8.0
const HURT_X := 2.0
const HURT_Y := -4.0
const HURT_GRAVITY := 0.1875
const DEATH_Y := -7.0
const REBOUND_TRIM := 1.0
const SPRING_YELLOW := 10.0
const SPRING_RED := 16.0
const SPEED_CAP := 16.0
const WIDTH := 9.0
const HEIGHT := 19.0
const ROLL_WIDTH := 7.0
const ROLL_HEIGHT := 14.0
const PUSH := 10.0
## The floor-finding window while grounded: min(|speed| + 4, 14).
const SNAP_BASE := 4.0
const SNAP_MAX := 14.0
## Landing speed conversion bands (degrees from flat).
const LAND_FLAT_MAX := 23.0
const LAND_SLOPE_MAX := 45.0

enum { FLOOR, RIGHT_WALL, CEILING, LEFT_WALL }

## Centre of the hitbox.
var pos := Vector2.ZERO
var gsp := 0.0
var xsp := 0.0
var ysp := 0.0
var angle := 0.0
var grounded := false
var ball := false
var jumped := false
var air_locked := false
var control_lock := 0
var charge := 0.0
var facing := 1
var state := "idle"
## Surfaces, see add_line() / add_arc().
var surfaces: Array[Dictionary] = []

## Inputs for the current frame.
var left := false
var right := false
var down := false
var jump_held := false
var jump_pressed := false


func _init() -> void:
	add_line(0.0, Vector2.ZERO)


## An infinite line at Guide angle `a` through `point`. The first surface
## added is the flat floor through the origin; call `surfaces.clear()` first
## for a world without it.
func add_line(a: float, point: Vector2) -> void:
	surfaces.append({kind = "line", angle = a, point = point})


## The inside of a circle, run on from `from_angle` to `to_angle` (Guide
## angles at the surface, counter-clockwise, 0 to 360 for a full loop). A
## full loop works like the real one's path layers: its lower-right quarter
## is solid on the way in and its lower-left quarter on the way out (the
## switch happens while crossing the top), so a lap ends back on the floor.
func add_arc(centre: Vector2, radius: float, from_angle := 0.0, to_angle := 360.0) -> void:
	surfaces.append({kind = "arc", centre = centre, radius = radius, from_angle = from_angle,
			to_angle = to_angle, loop = from_angle == 0.0 and to_angle == 360.0, lapped = false})


func radii() -> Vector2:
	return Vector2(ROLL_WIDTH, ROLL_HEIGHT) if ball else Vector2(WIDTH, HEIGHT)


static func mode_for(a: float) -> int:
	a = fposmod(snappedf(a, 0.001), 360.0)
	if a <= 45.0 or a >= 315.0:
		return FLOOR
	if a < 135.0:
		return RIGHT_WALL
	if a <= 225.0:
		return CEILING
	return LEFT_WALL


static func mode_down(mode: int) -> Vector2:
	return [Vector2.DOWN, Vector2.RIGHT, Vector2.UP, Vector2.LEFT][mode]


static func mode_right(mode: int) -> Vector2:
	return [Vector2.RIGHT, Vector2.UP, Vector2.LEFT, Vector2.DOWN][mode]


static func from_flat(a: float) -> float:
	a = fposmod(a, 360.0)
	return minf(a, 360.0 - a)


static func angle_from_normal(n: Vector2) -> float:
	var a := fposmod(rad_to_deg(atan2(-n.x, -n.y)), 360.0)
	return 0.0 if a >= 359.9999 else a


## Puts the player standing on surface `index` with the centre over `x`.
func stand_at(x: float, index := 0) -> void:
	ball = false
	grounded = true
	angle = surfaces[index].angle
	state = "idle"
	pos = Vector2(x, surfaces[index].point.y)
	_snap()


## Puts the player in the air at `at` (centre) with the given speeds.
func airborne_at(at: Vector2, vx: float, vy: float) -> void:
	grounded = false
	pos = at
	xsp = vx
	ysp = vy
	angle = 0.0
	state = "jump" if ball else "fall"


func set_input(l: bool, r: bool, d: bool, j_held: bool, j_pressed: bool) -> void:
	left = l
	right = r
	down = d
	jump_held = j_held
	jump_pressed = j_pressed


func dir() -> int:
	return int(right) - int(left)


# --- One frame ------------------------------------------------------------------

func step() -> void:
	if state == "dead":
		pos += Vector2(xsp, ysp)
		ysp = minf(ysp + GRAVITY, SPEED_CAP)
		return
	if grounded:
		_ground_step()
	else:
		_air_step()


func _ground_step() -> void:
	var d := dir() if control_lock == 0 else 0
	if state == "spindash":
		_spindash_step()
		return
	var crouching := not ball and gsp == 0.0 and down and d == 0
	if jump_pressed and crouching:
		_set_ball(true)
		state = "spindash"
		charge = 0.0
		return
	_slope_factor()
	if jump_pressed:
		_jump()
		return
	if ball:
		_roll_input(d)
	else:
		_run_input(d)
	if not ball and down and d == 0 and absf(gsp) >= ROLL_MIN:
		_set_ball(true)
	gsp = clampf(gsp, -SPEED_CAP, SPEED_CAP)
	var a := deg_to_rad(angle)
	xsp = gsp * cos(a)
	ysp = -gsp * sin(a)
	pos += Vector2(xsp, ysp)
	if not _snap():
		grounded = false
		state = "roll" if ball else "fall"
		return
	_slip()
	if grounded:
		state = "roll" if ball else ("idle" if gsp == 0.0 else "run")


func _spindash_step() -> void:
	if not down:
		gsp = (SPINDASH_BASE + floorf(charge) / 2.0) * facing
		charge = 0.0
		state = "roll"
		return
	charge -= floorf(charge / 0.125) / 256.0
	if jump_pressed:
		charge = minf(charge + SPINDASH_PRESS, SPINDASH_MAX)


func _slope_factor() -> void:
	if mode_for(angle) == CEILING:
		return
	var s := sin(deg_to_rad(angle))
	var factor := SLOPE_FACTOR
	if ball:
		var uphill := gsp != 0.0 and signf(gsp) == signf(s)
		factor = SLOPE_ROLL_UP if uphill else SLOPE_ROLL_DOWN
	var amount := factor * s
	if gsp == 0.0 and absf(amount) < SLOPE_STAND_MIN:
		return
	gsp -= amount


func _jump() -> void:
	var a := deg_to_rad(angle)
	xsp = gsp * cos(a) - JUMP_FORCE * sin(a)
	ysp = -gsp * sin(a) - JUMP_FORCE * cos(a)
	air_locked = ball
	_set_ball(true)
	grounded = false
	jumped = true
	state = "jump"


func _run_input(d: int) -> void:
	if d == 0:
		gsp = move_toward(gsp, 0.0, FRICTION)
		return
	if gsp * d < 0.0:
		gsp += DECELERATION * d
		if gsp * d >= 0.0:
			gsp = TURNAROUND * d
			facing = d
	else:
		if gsp * d < TOP_SPEED:
			gsp += ACCELERATION * d
			if gsp * d > TOP_SPEED:
				gsp = TOP_SPEED * d
		facing = d


func _roll_input(d: int) -> void:
	if d != 0 and gsp * d < 0.0:
		gsp += ROLL_DECELERATION * d
		if gsp * d >= 0.0:
			gsp = TURNAROUND * d
	gsp = move_toward(gsp, 0.0, ROLL_FRICTION)
	if gsp != 0.0:
		facing = int(signf(gsp))
	if absf(gsp) < UNROLL:
		_set_ball(false)


## Keeps the feet in place when the hitbox changes.
func _set_ball(on: bool) -> void:
	if on == ball:
		return
	var shift := HEIGHT - ROLL_HEIGHT
	pos += mode_down(mode_for(angle)) * (shift if on else -shift)
	ball = on


func _slip() -> void:
	if control_lock > 0:
		control_lock -= 1
		return
	var steep := from_flat(angle)
	# Strictly past 45: a 1:1 hill is still held (the original checks the
	# angle past the floor quadrant, not at its edge).
	if absf(gsp) >= SLIP_SPEED or steep <= SLIP_ANGLE:
		return
	control_lock = CONTROL_LOCK
	if steep > FALL_ANGLE:
		grounded = false
		state = "fall"


func _air_step() -> void:
	var d := 0 if state == "hurt" else dir()
	if jumped and not jump_held and ysp < -JUMP_RELEASE:
		ysp = -JUMP_RELEASE
	if d != 0:
		if not air_locked:
			if xsp * d < TOP_SPEED:
				xsp += AIR_ACCELERATION * d
				if xsp * d > TOP_SPEED:
					xsp = TOP_SPEED * d
		facing = d
	if state != "hurt" and ysp < 0.0 and ysp > -AIR_DRAG_MAX_UP and absf(xsp) >= AIR_DRAG_MIN_X:
		xsp -= float(int(xsp / 0.125)) / 256.0
	pos += Vector2(xsp, ysp)
	ysp = minf(ysp + (HURT_GRAVITY if state == "hurt" else GRAVITY), SPEED_CAP)
	xsp = clampf(xsp, -SPEED_CAP, SPEED_CAP)
	if angle != 0.0:
		if angle < 180.0:
			angle = maxf(angle - AIR_ANGLE_EASE, 0.0)
		else:
			angle += AIR_ANGLE_EASE
			if angle >= 360.0:
				angle = 0.0
	if ysp >= 0.0:
		_try_land()


## Lands when a floor sensor (x +/- width, cast down from the centre) finds
## a surface at or above the feet.
func _try_land() -> void:
	var r := radii()
	var hit := _nearest(Vector2.RIGHT, Vector2.DOWN, r.x, r.y + 0.05)
	if hit.is_empty():
		return
	var land_angle: float = hit.angle
	var steep := from_flat(land_angle)
	var downhill := -signf(sin(deg_to_rad(land_angle)))
	var speed := xsp
	if steep > LAND_FLAT_MAX and absf(xsp) <= ysp:
		speed = ysp * downhill * (0.5 if steep <= LAND_SLOPE_MAX else 1.0)
	_set_ball(false)
	angle = land_angle
	grounded = true
	jumped = false
	air_locked = false
	gsp = 0.0 if state == "hurt" else speed
	_snap()
	state = "idle" if gsp == 0.0 else "run"


## Snaps the centre so the nearer floor sensor rests on the ground (cast along
## the mode's "down" from the centre +/- width along the mode's "right") and
## takes the ground angle there. False when no surface is in the snap window.
func _snap(up_reach := 0.0) -> bool:
	var r := radii()
	var mode := mode_for(angle)
	var down := mode_down(mode)
	var tolerance := minf(absf(gsp) + SNAP_BASE, SNAP_MAX) if grounded else SNAP_MAX
	var hit := _nearest(mode_right(mode), down, r.x, up_reach + r.y + tolerance, -down * up_reach)
	if hit.is_empty():
		return false
	pos += down * (hit.distance - up_reach - r.y)
	angle = hit.angle
	return true


## The nearest hit of the two sensors (left first, like A before B) on any
## surface within `reach`: {distance, angle} or {}. Crossing the top of a
## full loop switches it to its "way out" quarter.
func _nearest(right: Vector2, down: Vector2, half_width: float, reach: float,
		offset := Vector2.ZERO) -> Dictionary:
	var best := {}
	var best_surface := -1
	for i in surfaces.size():
		for side in [-1.0, 1.0]:
			var hit := _cast(pos + offset + right * side * half_width, down, surfaces[i])
			if hit.is_empty() or hit.distance > reach:
				continue
			if best.is_empty() or hit.distance < best.distance:
				best = hit
				best_surface = i
	if best_surface >= 0 and surfaces[best_surface].kind == "arc" and surfaces[best_surface].loop \
			and best.angle > 135.0 and best.angle < 225.0:
		surfaces[best_surface].lapped = true
	return best


## One ray against one surface: {distance, angle} or {} when it misses.
func _cast(origin: Vector2, direction: Vector2, surface: Dictionary) -> Dictionary:
	if surface.kind == "line":
		var a := deg_to_rad(surface.angle)
		var tangent := Vector2(cos(a), -sin(a))
		var denom := direction.cross(tangent)
		if absf(denom) < 1e-9:
			return {}
		var t: float = (surface.point - origin).cross(tangent) / denom
		return {distance = t, angle = surface.angle} if t >= 0.0 else {}
	# Inside a circle: the far intersection along the ray.
	var to_centre: Vector2 = surface.centre - origin
	var radius: float = surface.radius
	var b := to_centre.dot(direction)
	var c := to_centre.length_squared() - radius * radius
	var disc := b * b - c
	if disc < 0.0 or c > 0.0:
		return {}
	var t := b + sqrt(disc)
	if t < 0.0:
		return {}
	var hit := origin + direction * t
	var a := angle_from_normal((surface.centre - hit).normalized())
	if not _in_arc(a, surface.from_angle, surface.to_angle):
		return {}
	if surface.loop and a < 90.0 and surface.lapped:
		return {}  # the way-in quarter is the other path now
	if surface.loop and a > 270.0 and not surface.lapped:
		return {}  # the way-out quarter is the other path until the top
	return {distance = t, angle = a}


static func _in_arc(a: float, from_angle: float, to_angle: float) -> bool:
	if to_angle - from_angle >= 360.0:
		return true
	return a >= from_angle - 0.001 and a <= to_angle + 0.001


# --- Events ---------------------------------------------------------------------

func hurt(from_x: float) -> void:
	var away := signf(pos.x - from_x)
	if away == 0.0:
		away = -facing
	_set_ball(false)
	grounded = false
	xsp = HURT_X * away
	ysp = HURT_Y
	jumped = false
	air_locked = true
	state = "hurt"


func die() -> void:
	_set_ball(false)
	grounded = false
	xsp = 0.0
	ysp = DEATH_Y
	state = "dead"


## Rebound off an enemy whose centre is at `enemy_y`.
func rebound(enemy_y: float) -> void:
	if grounded:
		return
	if pos.y > enemy_y or ysp < 0.0:
		ysp -= signf(ysp) * REBOUND_TRIM
	else:
		ysp = -ysp


func spring(velocity: Vector2) -> void:
	_set_ball(false)
	grounded = false
	xsp = clampf(velocity.x, -SPEED_CAP, SPEED_CAP)
	ysp = clampf(velocity.y, -SPEED_CAP, SPEED_CAP)
	jumped = false
	air_locked = false
	state = "spring"
