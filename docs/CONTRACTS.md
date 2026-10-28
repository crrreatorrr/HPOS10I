# System contracts

How the parts of HPOS10I talk to each other. Every agent builds against this
file. Owned by the lead; agents request changes in their report.

## Ownership

Each agent works on its own branch and only touches its own folders.

| Owner | Branch | Folders |
|---|---|---|
| Lead | `main` | `project.godot`, `export_presets.cfg`, `.github/`, `core/`, `docs/`, `README.md`, `icon.svg`, `tools/lead/`, `tests/core/`, `tests/inputs/`, `tests/test_case.gd`, `tests/run_tests.gd` |
| Physics agent | `physics` | `player/`, `camera/`, `terrain/`, `playground/`, `tests/physics/` |
| Level agent | `levels` | `levels/`, `tests/levels/` |
| Boss agent | `bosses` | `bosses/`, `tests/bosses/` |
| Art agent | `art` | `assets/`, `tools/art/`, `prompts.md` |
| UI/audio agent | `ui-audio` | `ui/`, `audio/`, `tests/ui/` |
| QA agent | `qa` | `qa/`, `tools/qa/`, `tests/qa/` |

Other agents' folders are **read-only** to you. The QA agent reads
everything and changes nothing outside its folders: bugs go back to the
owning agent. If you need a shared-file
change (a physics constant, input action, autoload, collision layer, a change
to this file), do not edit it. Use a local fallback marked `# LEAD-REQUEST`
and list the request in your final report.

## Conventions

- **Godot 4.7.2**, GDScript, static typing where practical, tabs.
- **Resolution:** 424×240 viewport, 1 unit = 1 pixel, y points down.
  Nearest-neighbour filtering everywhere.
- **Physics tick:** fixed 60 Hz (`_physics_process`). Gameplay speeds in public
  APIs are **pixels per frame** (classic units). Convert with
  `PhysicsConstants.speed()` / `accel()` / `frames()`.
- **Physics constants:** read `Tuning.physics` (a `PhysicsConstants`) every
  frame; never cache values. Never hard-code a value that belongs there.
- **Missing pieces never crash.** Check `ResourceLoader.exists()` before
  loading another agent's scene or asset, and fall back to a placeholder.
- **What ships:** `playground/` holds playable demo scenes that ship in the
  web build and show up in the boot menu. `tests/`, `tools/`, `qa/` and
  `docs/` never ship (CI's web check fails the build if they do).
- **Placeholders:** until art is approved, draw simple shapes (`Polygon2D`,
  `_draw()`, `ColorRect`). Keep them readable: player white, enemies red,
  hazards orange, springs yellow, tickets gold.

## Collision layers

| Bit | Name | Used for |
|---|---|---|
| 1 | `terrain_solid` | Ground/walls/ceilings on both paths |
| 2 | `terrain_path_a` | Solid only while the player is on path A |
| 3 | `terrain_path_b` | Solid only while the player is on path B |
| 4 | `terrain_top_only` | One-way platforms (land from above only) |
| 5 | `player` | Player hitbox `Area2D` |
| 6 | `enemies` | Enemy hurtboxes |
| 7 | `objects` | Tickets, springs, boosters, checkpoints, goal sign |
| 8 | `hazards` | Spikes, projectiles, crushers |
| 9 | `boss` | Boss body and weak point |

Terrain is static geometry (TileMapLayer collision polygons or
`StaticBody2D` + `CollisionPolygon2D`). The player never uses
`move_and_slide`; it raycasts against bits 1–4.

Objects, enemies, hazards and bosses **detect the player** with their own
`Area2D` (mask bit 5) and call the player API below.

## Player (physics agent: `player/`)

Scene `res://player/player.tscn`, root `Player` (`class_name Player`,
extends `Node2D`), in group `player`. Its hitbox is an `Area2D` on layer 5.

```gdscript
static func from_area(area: Area2D) -> Player  # null if area isn't the player's hitbox

# Read-only state (pixels per frame, degrees)
var ground_speed: float
var velocity: Vector2           # x/y speed
var ground_angle: float         # 0 = flat floor, Physics Guide convention
var grounded: bool
var collision_mode: int         # FLOOR, RIGHT_WALL, CEILING, LEFT_WALL
var state: StringName           # &"idle", &"run", &"skid", &"jump", &"roll", &"spindash", &"spring", &"hurt", &"dead"
var facing: int                 # 1 right, -1 left

signal state_changed(old: StringName, new: StringName)
signal hurt_taken
signal died

func is_attacking() -> bool     # jump/roll/spindash: touching an enemy destroys it
func is_invincible() -> bool
func hurt(source_position: Vector2) -> void   # knockback, scatter tickets, or die at 0 tickets
func kill() -> void                           # instant death (pits, crush)
func bounce_off(target_y: float, reverse_x := false) -> void  # rebound off an enemy; bosses pass reverse_x = true
func launch(velocity_pf: Vector2) -> void     # airborne launch (springs). Not attacking.
func push_ground(speed_pf: float, lock_frames := 16) -> void  # horizontal springs, boosters
func set_control_lock(frames: int) -> void
func set_collision_path(path: int) -> void    # 0 = A, 1 = B
func freeze(frozen: bool) -> void             # cutscenes, goal, boss defeat
func play_pose(pose: StringName) -> void      # e.g. &"victory"
func respawn_at(position: Vector2) -> void
var clamp_rect: Rect2           # non-empty: player is kept inside (autoscroll). Crushed against a wall = kill().

# Also available (read-only helpers)
var collision_path: int         # 0 = A, 1 = B
var control_lock: int           # frames left
var crouching: bool
var spindash_charge: float
func get_radii() -> Vector2     # current width/height radius
func can_collect_tickets() -> bool
```

The player reads `SceneRouter.current_zone().accessory` (`""`,
`"wizard_hat"`, `"sunglasses"`) and draws the accessory overlay.

Scattered tickets (`player/scattered_ticket.tscn`) belong to the physics agent.
Placed level tickets (`levels/objects/ticket.tscn`) belong to the level agent.
Both call `GameState.add_tickets(1)` and `Audio.play_sfx(&"ticket")`.

## Terrain helpers (physics agent: `terrain/`)

- `CurveTerrain` (`@tool`, `StaticBody2D`): builds collision + placeholder
  visuals for curves: loop, quarter pipe, ramp, or a free `Curve2D`.
  Exports: which path layer (both / A / B), top-only.
- `PathSwitcher` (`Area2D`): sets the player's path when crossed.
- `terrain/loop.tscn`: a ready-to-place full loop with its path switchers.
  Levels only instance it and set the radius.

## Camera (physics agent: `camera/`)

Scene `res://camera/game_camera.tscn`, `class_name GameCamera` (extends
`Camera2D`), in group `game_camera`. Follows the `player` group automatically.

```gdscript
static func current() -> GameCamera
func set_level_bounds(rect: Rect2) -> void
func lock_to(rect: Rect2, transition_seconds := 0.5) -> void   # boss arenas
func unlock(transition_seconds := 0.5) -> void
func start_autoscroll(speed_px_per_s: Vector2) -> void         # broom chase
func stop_autoscroll() -> void
func shake(strength_px: float, seconds: float) -> void
```

## Levels (level agent: `levels/`)

Every act scene's root uses `LevelRoot` (`levels/common/level_root.gd`).
Boss arenas use it too (read-only for the boss agent). Expected children:

- `PlayerStart` (`Marker2D`)
- `Bounds` (`ReferenceRect`): camera limits; below its bottom edge = death pit
- `Terrain`, `Objects`, `Enemies` (any structure)

`LevelRoot` spawns the player (at the checkpoint if `GameState` has one) and
the camera. It also adds these when they exist:

- `res://ui/hud/hud.tscn`
- `res://ui/pause/pause_menu.tscn`
- `res://ui/touch_controls/touch_controls.tscn`
- parallax layers from `res://assets/backgrounds/<zone_id>/`

`Player.died` fires about 1 s after `kill()` (the fall-off animation). On
it, LevelRoot stops `GameState.timer_running`, waits about 1 s more, then
calls `SceneRouter.respawn()` once (about 2 s from death to respawn). `respawn()` takes the
life; nothing else calls `GameState.lose_life()`. Scenes opened directly
(sandboxes) respawn without losing lives.
After the goal sign or a boss it shows the tally (`res://ui/tally/score_tally.tscn`,
signal `finished`), then calls `SceneRouter.next_stage()`.

Parallax: `Parallax2D` layers, files loaded in order, scroll scales
0.1 / 0.3 / 0.6 / 0.9:
`1_far.png`, `2_distant.png`, `3_mid.png`, `4_near.png`.

Enemy base: `levels/enemies/enemy_base.gd` (`class_name Enemy`). On contact,
if `player.is_attacking()`, the enemy dies (+100 score, `enemy_pop`) and calls
`player.bounce_off(global_position.y)`. Otherwise it calls `player.hurt(global_position)`.

## Bosses (boss agent: `bosses/`)

`bosses/boss_base.gd` (`class_name Boss`, extends `Node2D`):
8 hits, phases, hit flash, 1–2 s invincibility after each hit, speed-up after
hits 4 and 6, telegraph before every attack, defeat sequence.
Weak-point `Area2D` in group `boss_weak_point`; harmful body `Area2D` in group
`boss_body`. Hitting the weak point while `player.is_attacking()` counts as a
hit and calls `player.bounce_off()`.

```gdscript
signal hit_taken(hits_left: int)
signal phase_changed(phase: int)
signal defeated
```

Each boss lives in `bosses/<boss_id>/` with `arena.tscn` (uses `LevelRoot`
and `bosses/arena.gd`). On entering, the arena locks the camera. On defeat it
plays explosions, opens the gate and shows the tally, then goes to the next stage.

## Art (art agent: `assets/`)

- Sprites: `assets/sprites/<zone_id>/<name>/`, where `<zone_id>` is `common`
  for things used in every zone.
  - `<name>_sheet.png`: the assembled sheet, nearest filter, lossless
  - `<name>_frames.tres`: a `SpriteFrames` resource
  - `anchors.json`: optional per-frame points (for example `head` for accessories)
- Sproto: `assets/sprites/common/sproto/sproto_frames.tres`.
  - Animations: `idle`, `run` (4 frames), `jump` (ball), `hurt`.
  - Code derives the rest when missing: `walk` from `run` played slower,
    `roll`/`spindash` from `jump`, `dead` from `hurt`.
  - Frame cells are 64×64. The feet's centre sits at (32, 60) in each cell.
- Accessories:
  - `assets/sprites/z2_wizard_academy/wizard_hat/`
  - `assets/sprites/z3_capital_mansion/sunglasses/`
  - Each is positioned using Sproto's `anchors.json` `head` points.
- Backgrounds: `assets/backgrounds/<zone_id>/1_far.png` … `4_near.png`.
  Near layers have transparency. Edges are pre-processed to tile seamlessly.
- Terrain materials: `assets/terrain/<zone_id>/`, all nearest-filtered pixel
  art in the zone palette:
  - `fill.png`: patterned dirt or stone, tileable in both directions
    (64×64 or 128×128).
  - `top.png`: a grass/edge lip strip, tileable horizontally, transparent
    below the lip, 16–24 px tall. Its top row sits on the walkable surface.
  - `side.png` (optional): a cliff/rock face for steep or vertical sides.

  `CurveTerrain` (physics agent) and the level TileSet (level agent) both
  read these. `LevelRoot.art_zone_id` (defaults to the zone id) chooses
  the folder for terrain and backgrounds, and LevelRoot calls
  `CurveTerrain.set_art_zone(id)` on every CurveTerrain in the level. When
  files are missing, the simple placeholder look stays.
- Raw generations go in `_raw/` folders. These are git-ignored and contain a
  `.gdignore` file.

Zone ids: `test_zone`, `z1_retro_rush_hills`, `z2_wizard_academy`,
`z3_capital_mansion`, `z4_neon_rush_remix`, `common`.

## Audio (UI/audio agent: `audio/`)

`Audio.play_sfx(&"name")`, `Audio.play_music(&"name")`, `Audio.stop_music()`.
Files: `audio/sfx/<name>.ogg`, `audio/music/<name>.ogg`. Missing = silent.

- **SFX:** `jump`, `roll`, `spindash_charge`, `spindash_release`, `skid`,
  `ticket`, `ticket_loss`, `hurt`, `death`, `spring`, `booster`, `break_wall`,
  `enemy_pop`, `checkpoint`, `goal_sign`, `boss_hit`, `boss_explode`,
  `boss_telegraph`, `one_up`, `menu_move`, `menu_select`, `pause`, `tally_tick`
- **Music:** `title`, `zone_select`, `z1`, `z2`, `z3`, `z4`, `boss`,
  `act_clear`, `game_over`

## UI (UI/audio agent: `ui/`)

| Scene | Purpose |
|---|---|
| `ui/title/title_screen.tscn` | Boot goes here once it exists |
| `ui/zone_select/zone_select.tscn` | Uses `ZoneRegistry` + `SceneRouter.start_zone()` |
| `ui/hud/hud.tscn` | `CanvasLayer`; listens to `GameState` signals |
| `ui/pause/pause_menu.tscn` | `process_mode = ALWAYS`; toggles `get_tree().paused` on `pause` |
| `ui/touch_controls/touch_controls.tscn` | Shown only when `DisplayServer.is_touchscreen_available()` |
| `ui/tally/score_tally.tscn` | Emits `finished` |
| `ui/game_over/game_over.tscn`, `ui/ending/ending.tscn` | |

## Merge gate

1. The agent finishes and reports.
2. The QA agent reviews the branch against `qa/checklists/` and writes
   `qa/reports/<NN>-<branch>.md` with a verdict and bugs by severity:
   - **blocker:** must fix before merge
   - **major:** fix this step
   - **minor:** backlog
3. The owner fixes blockers. QA re-checks them.
4. The lead runs the game, records a clip, merges with `--no-ff` and pushes. CI deploys.

## Before you report back

1. `godot --headless --path <your worktree> --import` shows no script errors.
2. `godot --headless --fixed-fps 60 --path <your worktree> -s res://tests/run_tests.gd` passes.
3. `git diff --name-only main...HEAD` lists only your folders.
4. Commit in small steps with clear messages on your branch.
5. Report:
   - what you built
   - how to run it
   - what to check by hand
   - known gaps
   - any `LEAD-REQUEST`s
