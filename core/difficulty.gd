class_name Difficulty
## Act difficulty D and the numeric targets from docs/LEVELS.md.
## D is 0 for the test zone and 1..8 from Zone 1 Act 1 to Zone 4 Act 2;
## a boss arena uses its zone's Act 2 value. Enemies and bosses scale their
## speed, attack intervals and telegraphs with the multipliers below. QA's
## level lint checks every built act against TARGETS.

const MAX := 8
## Telegraphs never get shorter than this, however hard the act.
const MIN_TELEGRAPH := 0.35
## Scenes opened directly (playgrounds) play at this difficulty.
const DEFAULT := 1

## zone_id -> D for each act, in order.
const ZONE_ACTS := {
	"test_zone": [0],
	"z1_retro_rush_hills": [1, 2],
	"z2_wizard_academy": [3, 4],
	"z3_capital_mansion": [5, 6],
	"z4_neon_rush_remix": [7, 8],
}

## Per-D targets. Screens are 424 px of route length; tiers are percentages
## of the act's enemies; direction is the R1..R5 scale in docs/LEVELS.md.
const TARGETS := {
	0: {screens = 20, par_seconds = 60, enemies_per_screen = 0.2, tiers = {1: 100}, direction = 1, checkpoints = 1, tickets_per_screen = 6.0},
	1: {screens = 30, par_seconds = 105, enemies_per_screen = 0.4, tiers = {1: 100}, direction = 1, checkpoints = 2, tickets_per_screen = 5.0},
	2: {screens = 35, par_seconds = 135, enemies_per_screen = 0.6, tiers = {1: 75, 2: 25}, direction = 2, checkpoints = 3, tickets_per_screen = 4.5},
	3: {screens = 35, par_seconds = 150, enemies_per_screen = 0.8, tiers = {1: 45, 2: 40, 3: 15}, direction = 3, checkpoints = 3, tickets_per_screen = 4.0},
	4: {screens = 40, par_seconds = 180, enemies_per_screen = 1.0, tiers = {1: 25, 2: 45, 3: 30}, direction = 4, checkpoints = 4, tickets_per_screen = 4.0},
	5: {screens = 40, par_seconds = 180, enemies_per_screen = 1.1, tiers = {2: 50, 3: 40, 4: 10}, direction = 4, checkpoints = 4, tickets_per_screen = 3.5},
	6: {screens = 45, par_seconds = 210, enemies_per_screen = 1.2, tiers = {2: 35, 3: 45, 4: 20}, direction = 4, checkpoints = 4, tickets_per_screen = 3.5},
	7: {screens = 45, par_seconds = 210, enemies_per_screen = 1.3, tiers = {2: 30, 3: 40, 4: 30}, direction = 5, checkpoints = 4, tickets_per_screen = 3.0},
	8: {screens = 50, par_seconds = 240, enemies_per_screen = 1.4, tiers = {3: 50, 4: 50}, direction = 5, checkpoints = 5, tickets_per_screen = 3.0},
}


static func for_stage(zone_id: String, stage: int) -> int:
	var acts: Array = ZONE_ACTS.get(zone_id, [])
	if acts.is_empty():
		return DEFAULT
	return acts[clampi(stage - 1, 0, acts.size() - 1)]


## D for whatever is running now.
static func current() -> int:
	return for_stage(SceneRouter.zone_id, SceneRouter.stage)


static func targets(d: int) -> Dictionary:
	return TARGETS.get(clampi(d, 0, MAX), TARGETS[DEFAULT])


## Enemy movement speed multiplier: +6% per step above D1 (up to +42%).
static func speed_mult(d := -1) -> float:
	return 1.0 + 0.06 * _steps(d)


## Time between enemy attacks: -5% per step above D1 (down to -35%).
static func interval_mult(d := -1) -> float:
	return 1.0 - 0.05 * _steps(d)


## Scales a telegraph duration: -4% per step above D1, never below 0.35 s.
static func telegraph(seconds: float, d := -1) -> float:
	return maxf(MIN_TELEGRAPH, seconds * (1.0 - 0.04 * _steps(d)))


static func _steps(d: int) -> int:
	return maxi((current() if d < 0 else d) - 1, 0)
