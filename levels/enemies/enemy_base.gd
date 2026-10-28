class_name Enemy
extends PlayerArea
## Base for every standard enemy (docs/CONTRACTS.md, "Levels" and
## "Difficulty"; the roster is in docs/LEVELS.md). The enemy node itself is
## the hurtbox: an Area2D on layer 6 (enemies) with mask 5 (player). On
## contact with a live player:
##   - player.is_attacking() (and the enemy is open to it): the enemy is hit;
##     by default it is destroyed: +100 score, `enemy_pop`,
##     player.bounce_off(global_position.y) and its pop burst;
##   - otherwise player.hurt(global_position) (ignored by the player while
##     he is invincible).
## Contact is re-checked every physics frame while touching, so an enemy
## still overlapping when invincibility ends, or when the player curls up,
## resolves then. Several enemies destroyed in one frame each score, but the
## player only bounces once.
##
## Difficulty: never hard-code a speed, interval or telegraph. Use
## move_speed(px_per_frame), interval_frames(frames) and
## telegraph_frames(seconds); they apply Difficulty.speed_mult(),
## interval_mult() and telegraph() at this enemy's local difficulty:
## Difficulty.local(level root's progress_at(x)) from where it was placed, so
## the same enemy is livelier near the end of an act (Difficulty.current()
## without a level root, e.g. in playgrounds).
##
## Writing a new behaviour (T2-T4 roster): extend this script, set `tier`,
## move in _enemy_physics(delta), draw in _draw(), and override as needed:
##   is_open_to(player)  false = an attack bounces off harmlessly (armored front)
##   is_harmful(player)  true = hurts even an attacking player (spikes out)
##   on_hit(player)      what an accepted hit does (default: destroy; a splitter splits)
##   _pop()              the defeat burst
## Helpers: gravity_step(), floor_below(), wall_ahead(), nearest_player().
## The origin is the enemy's feet, on the floor.

signal destroyed
## Emitted with every attack telegraph (the sound plays at the same time).
signal telegraphed

const SCORE := 100
const TERRAIN_MASK := Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY
const WALL_MASK := Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A
const GRAVITY := 0.21875  # px/frame², like Sproto
const MAX_FALL := 16.0

## Player metadata: physics frame of his last bounce off an enemy. (Kept on
## the player, not in a static var: static vars in scripts that reference
## Player keep scripts alive at exit and fail the smoke test's leak check.)
const BOUNCE_META := &"enemy_bounce_frame"
const TELEGRAPH_SFX := &"enemy_telegraph"
const TELEGRAPH_SFX_PATH := "res://audio/sfx/enemy_telegraph.ogg"

## Roster tier, 1-4 (docs/LEVELS.md). QA's lint reads it for each act's tier mix.
@export_range(1, 4) var tier := 1

var alive := true
var _local_d := NAN
## Vertical speed while airborne, px/frame (gravity_step()).
var fall_speed := 0.0
var grounded := false


func _notification(what: int) -> void:
	if what == NOTIFICATION_READY:
		collision_layer = LAYER_ENEMIES
		monitorable = true
		add_to_group(&"enemies")


func _physics_process(delta: float) -> void:
	if not alive:
		return
	_enemy_physics(delta)
	for player in players_inside():
		touch(player)
		if not alive:
			return


## Movement and behaviour, overridden by each enemy.
func _enemy_physics(_delta: float) -> void:
	pass


# --- Contact ----------------------------------------------------------------------

## Resolves contact with `player`.
func touch(player: Player) -> void:
	if not alive or player == null or player.state == &"dead":
		return
	if player.is_attacking() and not is_harmful(player):
		if is_open_to(player):
			on_hit(player)
		else:
			_bounce(player)
	else:
		player.hurt(global_position)


## False when this enemy can't be hurt by `player` right now (a shield in the way).
func is_open_to(_player: Player) -> bool:
	return true


## True when touching hurts even an attacking player (spikes out).
func is_harmful(_player: Player) -> bool:
	return false


## An accepted hit. Default: destroyed.
func on_hit(player: Player) -> void:
	destroy(player)


## Destroys the enemy; `by` (optional) bounces off it.
func destroy(by: Player = null) -> void:
	if not alive:
		return
	alive = false
	GameState.add_score(SCORE)
	Audio.play_sfx(&"enemy_pop")
	if by != null:
		_bounce(by)
	_pop()
	set_deferred(&"monitoring", false)
	set_deferred(&"monitorable", false)
	destroyed.emit()
	hide()
	queue_free()


## The defeat burst (subclasses draw their own pieces).
func _pop() -> void:
	pass


## player.bounce_off(), at most once per physics frame however many enemies he hits.
func _bounce(player: Player) -> void:
	var frame := Engine.get_physics_frames()
	if int(player.get_meta(BOUNCE_META, -1)) != frame:
		player.set_meta(BOUNCE_META, frame)
		player.bounce_off(global_position.y)


# --- Difficulty -------------------------------------------------------------------

## This enemy's difficulty, worked out once from where it starts.
func local_difficulty() -> float:
	if is_nan(_local_d):
		var root := _level_root()
		_local_d = Difficulty.local(root.call(&"progress_at", global_position.x)) \
				if root != null else Difficulty.current()
	return _local_d


## A movement speed (px/frame) scaled for the local difficulty.
func move_speed(base_px_per_frame: float) -> float:
	return base_px_per_frame * Difficulty.speed_mult(local_difficulty())


## Frames between attacks, hops or shots, scaled for the local difficulty.
func interval_frames(base_frames: float) -> int:
	return maxi(1, roundi(base_frames * Difficulty.interval_mult(local_difficulty())))


## A telegraph (warning) in frames, scaled for the local difficulty (never under 0.35 s).
func telegraph_frames(base_seconds: float) -> int:
	return maxi(1, roundi(Difficulty.telegraph(base_seconds, local_difficulty()) * PhysicsConstants.FPS))


## The telegraph sound: `enemy_telegraph` once that file exists, else the
## contract's `boss_telegraph`.
# LEAD-REQUEST: add `enemy_telegraph` to the CONTRACTS.md SFX list (and an
# audio/sfx/enemy_telegraph.ogg); until then T2+ enemies borrow boss_telegraph.
func play_telegraph() -> void:
	telegraphed.emit()
	Audio.play_sfx(TELEGRAPH_SFX if ResourceLoader.exists(TELEGRAPH_SFX_PATH) else &"boss_telegraph")


## True when `at` (default: this enemy) is inside the camera's view, grown by
## `margin`. With no 2D camera (tests, tools) everything counts as on screen.
func on_screen(margin := 0.0, at := Vector2.INF) -> bool:
	var viewport := get_viewport()
	if viewport == null or viewport.get_camera_2d() == null:
		return true
	var view := viewport.get_canvas_transform().affine_inverse() * viewport.get_visible_rect()
	return view.grow(margin).has_point(global_position if at == Vector2.INF else at)


## The level root above this enemy (found by group and method, not by class,
## so this script doesn't depend on level_root.gd).
func _level_root() -> Node:
	var node := get_parent()
	while node != null:
		if node.is_in_group(&"level_root") and node.has_method(&"progress_at"):
			return node
		node = node.get_parent()
	return null


# --- Movement and terrain ---------------------------------------------------------

## Falls under gravity until it lands on a floor (sets `grounded`).
func gravity_step() -> void:
	fall_speed = minf(fall_speed + GRAVITY, MAX_FALL)
	if fall_speed > 0.0:
		var floor_y := floor_below(0.0, 2.0, fall_speed + 2.0)
		if floor_y != INF and floor_y <= global_position.y + fall_speed + 0.01:
			global_position.y = floor_y
			fall_speed = 0.0
			grounded = true
			return
	global_position.y += fall_speed
	grounded = false


## The floor y under local point `x_offset` (searching from `up` px above the
## feet to `down` px below), or INF when there is none.
func floor_below(x_offset := 0.0, up := 8.0, down := 16.0) -> float:
	var from := global_position + Vector2(x_offset, -up)
	var hit := _ray(from, from + Vector2(0.0, up + down))
	return INF if hit.is_empty() else hit.position.y


## True when there is a wall within `reach` px in direction `dir` (-1/1), at
## `height` px above the feet.
func wall_ahead(dir: int, reach: float, height := 8.0) -> bool:
	var from := global_position + Vector2(0.0, -height)
	return not _ray(from, from + Vector2(dir * reach, 0.0), WALL_MASK).is_empty()


## The closest live player within `reach` px, or null (chasers, snipers).
func nearest_player(reach := INF) -> Player:
	var best: Player = null
	var best_d := reach
	for node in get_tree().get_nodes_in_group(&"player"):
		var player := node as Player
		if player == null or player.state == &"dead":
			continue
		var d := global_position.distance_to(player.global_position)
		if d < best_d:
			best_d = d
			best = player
	return best


func _ray(from: Vector2, to: Vector2, mask := TERRAIN_MASK) -> Dictionary:
	var query := PhysicsRayQueryParameters2D.create(from, to, mask)
	query.hit_from_inside = false
	return get_world_2d().direct_space_state.intersect_ray(query)
