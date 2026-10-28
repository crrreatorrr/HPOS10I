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
## Checkpoints include the one at the start of the finale and, in the act
## before a boss, the one right before the arena.
const TARGETS := {
	0: {screens = 20, par_seconds = 60, enemies_per_screen = 0.2, tiers = {1: 100}, direction = 1, checkpoints = 2, tickets_per_screen = 6.0},
	1: {screens = 45, par_seconds = 150, enemies_per_screen = 0.4, tiers = {1: 100}, direction = 1, checkpoints = 3, tickets_per_screen = 5.0},
	2: {screens = 55, par_seconds = 195, enemies_per_screen = 0.6, tiers = {1: 75, 2: 25}, direction = 2, checkpoints = 4, tickets_per_screen = 4.5},
	3: {screens = 55, par_seconds = 210, enemies_per_screen = 0.8, tiers = {1: 45, 2: 40, 3: 15}, direction = 3, checkpoints = 4, tickets_per_screen = 4.0},
	4: {screens = 65, par_seconds = 255, enemies_per_screen = 1.0, tiers = {1: 25, 2: 45, 3: 30}, direction = 4, checkpoints = 5, tickets_per_screen = 4.0},
	5: {screens = 65, par_seconds = 255, enemies_per_screen = 1.1, tiers = {2: 50, 3: 40, 4: 10}, direction = 4, checkpoints = 5, tickets_per_screen = 3.5},
	6: {screens = 75, par_seconds = 300, enemies_per_screen = 1.2, tiers = {2: 35, 3: 45, 4: 20}, direction = 4, checkpoints = 6, tickets_per_screen = 3.5},
	7: {screens = 75, par_seconds = 300, enemies_per_screen = 1.3, tiers = {2: 30, 3: 40, 4: 30}, direction = 5, checkpoints = 6, tickets_per_screen = 3.0},
	8: {screens = 85, par_seconds = 345, enemies_per_screen = 1.4, tiers = {3: 50, 4: 50}, direction = 5, checkpoints = 7, tickets_per_screen = 3.0},
}

## Boss difficulty per zone (docs/LEVELS.md "Bosses"). All bosses keep the
## director's rules: 8 hits, 1-2 s invincibility after a hit, faster after hits
## 4 and 6, camera locked, a telegraph before every attack. The LAST TWO
## bosses are deliberately very difficult (director): short weak-point
## windows, long attack chains, arena hazards, a desperation phase and almost
## no ticket refills.
##   d                 difficulty fed to the multipliers below
##   weak_window       seconds the weak point stays hittable per opening
##   attacks_per_cycle attacks chained before each opening
##   telegraph         base telegraph seconds (Difficulty.telegraph() floor 0.35)
##   escalation        speed multiplier applied after hit 4 and again after hit 6
##   desperation       extra phase from hit 7: fastest, combined attacks
##   ticket_refills    small ticket bursts the arena hands out in the whole fight
const BOSSES := {
	"z1_retro_rush_hills": {d = 2.5, weak_window = 2.0, attacks_per_cycle = 1, telegraph = 0.8, escalation = 1.15, desperation = false, ticket_refills = 3},
	"z2_wizard_academy": {d = 4.5, weak_window = 1.7, attacks_per_cycle = 2, telegraph = 0.7, escalation = 1.15, desperation = false, ticket_refills = 2},
	"z3_capital_mansion": {d = 8.0, weak_window = 1.1, attacks_per_cycle = 3, telegraph = 0.5, escalation = 1.25, desperation = true, ticket_refills = 1},
	"z4_neon_rush_remix": {d = 10.0, weak_window = 0.9, attacks_per_cycle = 4, telegraph = 0.45, escalation = 1.3, desperation = true, ticket_refills = 1},
}

## Difficulty also rises WITHIN every act (director: harder towards the end
## of each level, peaking before the boss). Progress runs 0..1 from the start
## to the goal. Opening: easier, ramping to the act's own D. Middle: the
## act's D. Finale: ramps up to FINALE_BONUS (or PRE_BOSS_BONUS in the act
## right before a boss arena) above it.
const OPENING_END := 0.25
const FINALE_START := 0.75
const OPENING_BONUS := -0.5
const FINALE_BONUS := 0.75
const PRE_BOSS_BONUS := 1.5
## Enemy density and the highest allowed tier, relative to the act's row.
const SECTION_DENSITY := {opening = 0.7, middle = 1.0, finale = 1.4}
const FINALE_TIER_BONUS := 1


## D for a zone's stage: its act's value, or the boss's own value for the
## arena stage (acts + 1).
static func for_stage(zone_id: String, stage: int) -> float:
	var acts: Array = ZONE_ACTS.get(zone_id, [])
	if acts.is_empty():
		return DEFAULT
	if stage > acts.size() and BOSSES.has(zone_id):
		return BOSSES[zone_id].d
	return acts[clampi(stage - 1, 0, acts.size() - 1)]


## D for whatever is running now.
static func current() -> float:
	return for_stage(SceneRouter.zone_id, SceneRouter.stage)


## The boss tuning for a zone (see BOSSES); empty if the zone has no boss.
static func boss(zone_id: String) -> Dictionary:
	return BOSSES.get(zone_id, {})


## True for the last act of a zone that has a boss arena after it.
static func is_pre_boss_act(zone_id: String, stage: int) -> bool:
	var zone := ZoneRegistry.get_zone(zone_id)
	return not zone.is_empty() and zone.boss != "" and stage == zone.acts.size()


## Extra difficulty at a point along an act (progress 0..1).
static func ramp(progress: float, pre_boss: bool) -> float:
	var p := clampf(progress, 0.0, 1.0)
	if p < OPENING_END:
		return lerpf(OPENING_BONUS, 0.0, p / OPENING_END)
	if p <= FINALE_START:
		return 0.0
	var top := PRE_BOSS_BONUS if pre_boss else FINALE_BONUS
	return lerpf(0.0, top, (p - FINALE_START) / (1.0 - FINALE_START))


## Effective difficulty at a point along the current act. Enemies pass their
## progress (LevelRoot.progress_at(x)) to the multipliers below.
static func local(progress: float) -> float:
	var zone_id: String = SceneRouter.zone_id
	var stage: int = SceneRouter.stage
	return maxf(0.0, for_stage(zone_id, stage) + ramp(progress, is_pre_boss_act(zone_id, stage)))


static func targets(d: float) -> Dictionary:
	return TARGETS.get(clampi(int(d), 0, MAX), TARGETS[DEFAULT])


## Enemy movement speed multiplier: +6% per step above D1. Pass a local
## difficulty (Difficulty.local(progress)) for the in-act ramp.
static func speed_mult(d := -1.0) -> float:
	return 1.0 + 0.06 * _steps(d)


## Time between enemy attacks: -5% per step above D1, never below 40%.
static func interval_mult(d := -1.0) -> float:
	return maxf(0.4, 1.0 - 0.05 * _steps(d))


## Scales a telegraph duration: -4% per step above D1, never below 0.35 s.
static func telegraph(seconds: float, d := -1.0) -> float:
	return maxf(MIN_TELEGRAPH, seconds * (1.0 - 0.04 * _steps(d)))


static func _steps(d: float) -> float:
	return maxf((current() if d < 0.0 else d) - 1.0, 0.0)
