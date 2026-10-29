extends Node2D
## Duelist cape, drawn behind Sproto, and the Nobu suit ears drawn in front.
## `marks` selects the front pass. Both follow RelicLoadout.resolve(); the
## cape stays visible in Ranked, and the ears only while the Nobu skin is equipped.

const CAPE := Color(0.42, 0.18, 0.62)
const CAPE_DARK := Color(0.24, 0.08, 0.4)
const TRIM := Color(0.93, 0.74, 0.28)
const EAR := Color(0.95, 0.86, 0.72)
const EAR_INNER := Color(0.86, 0.55, 0.58)
const OUTLINE := Color(0.1, 0.11, 0.2)

@export var marks := false


func _process(_delta: float) -> void:
	var state := RelicLoadout.resolve()
	var show := bool(state.get("skin", "") == "nobu") if marks else bool(state.get("cape", false))
	visible = show
	if show:
		queue_redraw()


func _draw() -> void:
	if marks:
		_draw_ears()
	else:
		_draw_cape()


func _draw_cape() -> void:
	var visual := get_parent()
	if visual == null or not visual.has_method(&"head_point"):
		return
	var anchor: Vector2 = visual.call(&"head_point") + Vector2(-1.0, 8.0)
	var player := visual.get_parent() as Player
	var ball := player != null and player.is_attacking()
	var sway := sin(Time.get_ticks_msec() / 160.0) * (2.2 if not ball else 1.2)
	var speed := 0.0
	if player != null:
		speed = player.ground_speed if player.grounded else player.velocity.x
	sway += clampf(speed * 0.15, -3.0, 3.0)
	var drop := 14.0 if not ball else 8.0
	var tail := anchor + Vector2(-8.0 + sway, drop)
	var hem := PackedVector2Array([
		anchor + Vector2(-3.5, -1.0),
		anchor + Vector2(2.5, 0.5),
		tail + Vector2(3.0, 0.0),
		tail + Vector2(-1.5, 2.0),
	])
	draw_colored_polygon(hem, CAPE_DARK)
	draw_colored_polygon(PackedVector2Array([
		anchor + Vector2(-2.5, -0.5),
		anchor + Vector2(1.5, 0.2),
		tail,
	]), CAPE)
	draw_line(anchor + Vector2(-2.5, -0.5), tail, TRIM, 1.0)
	draw_line(anchor + Vector2(-3.2, 0.4), anchor + Vector2(2.2, 0.6), TRIM, 1.2)


func _draw_ears() -> void:
	var visual := get_parent()
	if visual == null or not visual.has_method(&"head_point"):
		return
	var head: Vector2 = visual.call(&"head_point")
	for ear: Vector2 in [Vector2(-5.5, -6.5), Vector2(-1.5, -8.0)]:
		var tip := head + ear + Vector2(0.0, -6.0)
		var base := head + ear
		draw_colored_polygon(PackedVector2Array([
			base + Vector2(-2.2, 1.0),
			tip,
			base + Vector2(2.2, 1.0),
		]), OUTLINE)
		draw_colored_polygon(PackedVector2Array([
			base + Vector2(-1.4, 0.6),
			tip + Vector2(0.0, 1.2),
			base + Vector2(1.4, 0.6),
		]), EAR)
		draw_colored_polygon(PackedVector2Array([
			base + Vector2(-0.6, 0.2),
			tip + Vector2(0.0, 2.4),
			base + Vector2(0.6, 0.2),
		]), EAR_INNER)
