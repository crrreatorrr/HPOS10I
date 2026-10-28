class_name LevelDifficulty
extends RefCounted
## Local difficulty for anything placed in a level (docs/CONTRACTS.md,
## "Difficulty"): Difficulty.local(level root's progress_at(x)) at a node's
## x, so the same enemy or hazard is livelier near the end of an act; just
## Difficulty.current() when there is no level root (playgrounds, tests).
## Use the result with Difficulty.speed_mult / interval_mult / telegraph.


## The local difficulty at `node`'s position.
static func at(node: Node2D) -> float:
	var root := level_root(node)
	if root != null:
		return Difficulty.local(root.call(&"progress_at", node.global_position.x))
	return Difficulty.current()


## The level root above `node` (found by group and method, not by class, so
## callers don't depend on level_root.gd).
static func level_root(node: Node) -> Node:
	var parent := node.get_parent() if node != null else null
	while parent != null:
		if parent.is_in_group(&"level_root") and parent.has_method(&"progress_at"):
			return parent
		parent = parent.get_parent()
	return null


## Frames between attacks or cycles at difficulty `d`.
static func interval_frames(base_frames: float, d: float) -> int:
	return maxi(1, roundi(base_frames * Difficulty.interval_mult(d)))


## A telegraph in frames at difficulty `d` (never under 0.35 s).
static func telegraph_frames(base_seconds: float, d: float) -> int:
	return maxi(1, roundi(Difficulty.telegraph(base_seconds, d) * PhysicsConstants.FPS))
