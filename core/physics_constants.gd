class_name PhysicsConstants
extends Resource
## Every movement constant for Sproto, in one place for live tuning.
##
## Values are stored in the classic units from the community Physics Guide:
## pixels per frame (speeds) and pixels per frame per frame
## (accelerations), at a fixed 60 fps. Convert with speed() / accel() before
## integrating with delta, or step the controller once per 60 Hz tick.
##
## Edit res://core/physics_constants.tres (not this script) to tune. In debug
## runs the Tuning autoload reloads the .tres when it changes on disk.

const FPS := 60.0

@export_group("Ground")
@export var acceleration := 0.046875
@export var deceleration := 0.5
@export var friction := 0.046875
@export var top_speed := 6.0
## Reversing at or above this ground speed (floor mode) starts a skid.
@export var skid_min_speed := 4.0
## Pressing against the motion flips ground speed to this when it crosses zero.
@export var turnaround_speed := 0.5

@export_group("Air")
@export var air_acceleration := 0.09375
@export var gravity := 0.21875
@export var jump_force := 6.5
## On jump release, upward speed is cut to this (variable jump height).
@export var jump_release_speed := 4.0
## Classic air drag applies while -air_drag_max_up < y speed < 0.
@export var air_drag_enabled := true
@export var air_drag_max_up := 4.0
@export var air_drag_min_x := 0.125
@export var max_fall_speed := 16.0
## Degrees per frame the angle eases back to 0 while airborne.
@export var air_angle_ease := 2.8125

@export_group("Slopes")
@export var slope_factor_normal := 0.125
@export var slope_factor_roll_up := 0.078125
@export var slope_factor_roll_down := 0.3125
## Standing still, the slope factor only applies when it is at least this big.
@export var slope_stand_min := 0.05078125
## Below this ground speed on a steep slope the player slips.
@export var slip_speed := 2.5
## Slopes steeper than this (degrees from flat) can make the player slip.
@export var slip_angle := 35.0
## Slopes steeper than this make a slipping player detach and fall.
@export var fall_angle := 69.0
@export var control_lock_frames := 30

@export_group("Rolling")
@export var roll_friction := 0.0234375
@export var roll_deceleration := 0.125
## Minimum ground speed to start a roll with down.
@export var roll_min_speed := 1.03125
## A roll ends when ground speed falls below this.
@export var unroll_speed := 0.5

@export_group("Spin dash")
## Release speed = base + floor(charge) / 2.
@export var spindash_base_speed := 8.0
@export var spindash_charge_per_press := 2.0
@export var spindash_max_charge := 8.0

@export_group("Hurt")
@export var hurt_x_speed := 2.0
@export var hurt_y_speed := -4.0
@export var hurt_gravity := 0.1875
@export var invincibility_frames := 120
@export var death_y_speed := -7.0

@export_group("Hitbox")
@export var width_radius := 9.0
@export var height_radius := 19.0
@export var roll_width_radius := 7.0
@export var roll_height_radius := 14.0
@export var push_radius := 10.0

@export_group("Limits")
## Hard cap on any speed component, to keep raycasts from tunnelling.
@export var speed_cap := 16.0

@export_group("Coins")
@export var max_scattered_coins := 32
## Scattered coins can be collected again after this many frames.
@export var coin_recollect_delay_frames := 64
## Scattered coins disappear after this many frames.
@export var coin_lifetime_frames := 256
## Launch speed of the first 16 scattered coins, then the rest.
@export var coin_scatter_speed_first := 4.0
@export var coin_scatter_speed_second := 2.0
@export var coin_gravity := 0.09375
## Y speed multiplier when a scattered coin hits the floor.
@export var coin_bounce := -0.75


## Pixels per frame -> pixels per second.
static func speed(px_per_frame: float) -> float:
	return px_per_frame * FPS


## Pixels per frame² -> pixels per second².
static func accel(px_per_frame2: float) -> float:
	return px_per_frame2 * FPS * FPS


## Frames at 60 fps -> seconds.
static func frames(count: float) -> float:
	return count / FPS
