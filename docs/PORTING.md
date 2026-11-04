# Porting guide: GDScript to the engine-free TypeScript runtime

Temporary guide for the rewrite. The old Godot code stays in the repository
(read-only) until the cut-over; every `.gd` file gets a TypeScript port under
`src/` that behaves the same. Port behaviour faithfully: same constants, same
order of operations, same frame counts. Improve only what this guide says.

## Layout

| Godot | TypeScript |
|---|---|
| `core/*.gd` autoloads | `src/core/*.ts` singletons (`GameState`, `SceneRouter`, `Audio`, `Difficulty`, `ZoneRegistry`, `Emeralds`, `Tuning`, `Settings`) |
| `player/` | `src/player/` |
| `terrain/`, `camera/` | `src/terrain/`, `src/camera/` |
| `levels/common/` | `src/levels/common/` |
| `levels/objects/` (+ `z1..z3`) | `src/levels/objects/` (same sub-folders) |
| `levels/enemies/` (+ `z2`, `z3`) | `src/levels/enemies/` (same sub-folders) |
| `ui/` | `src/ui/` |
| `core/hub_*.gd`, `core/relic_loadout.gd` | `src/hub/` |
| `tests/**/*.gd` | `tests/**/*.test.ts` (Vitest) |

## Runtime (src/runtime)

- `Node` / `Node2D` / `CanvasLayer` (`node.ts`): children, groups, meta,
  `queueFree()`, hooks `enterTree()`, `ready()` (children first),
  `physicsProcess(dt)` (fixed 60 Hz, tree order, parents first),
  `process(dt)` (per rendered frame), `input(ev)` (menus), `draw(g)`.
  `Node2D` has `position`, `globalPosition` (get/set), `rotation`, `scale`,
  `zIndex`, `zAsRelative`, `visible`, `modulate`, `selfModulate`,
  `showBehindParent`, `topLevel`, `toLocal()`, `toGlobal()`,
  `resetPhysicsInterpolation()`. Optional `cullRect(): Rect2` (local) skips
  drawing off screen.
- Drawing: override `draw(g: Gfx)` (`gfx.ts`). Every visible node is drawn
  every frame (no `queue_redraw` needed; the method exists as a no-op).
  `g.rect`, `g.rectR`, `g.polygon`, `g.polyline`, `g.line`, `g.circle`,
  `g.arc`, `g.ellipse`, `g.texture`, `g.setTransform(pos, rot, scale)`
  (= `draw_set_transform`), `g.resetTransform()`, `g.withAlpha`, `g.ctx` (raw
  Canvas2D). Colours are `Color` (`color.ts`: `new Color(r,g,b,a)`,
  `Color.rgb8`, `.withAlpha`, `.lerp`, `.darkened`, `.lightened`).
- Text: `Fonts.small`, `Fonts.smallOutline`, `Fonts.bold`, `Fonts.boldGold`
  (`font.ts`), `font.draw(g, text, pos, color?, align?, width?)`,
  `font.measure(text)`. Screen is 424x240 game pixels.
- Vectors: immutable `Vec2` (`vec2.ts`): `add`, `sub`, `mul`, `div`, `dot`,
  `cross`, `length`, `normalized`, `orthogonal` (= Godot `orthogonal()`),
  `rotated`, `angle`, `lerp`, `moveToward`, `withX`, `withY`, `round`.
  `Rect2(x, y, w, h)` with `position`, `size`, `end`, `right`, `bottom`,
  `center`, `hasPoint`, `intersects`, `grow`, `merge`, `expand`.
- Math (`math.ts`): `signf` (0 for 0), `clamp`, `lerp`, `fposmod`, `posmod`,
  `wrapf`, `moveToward`, `degToRad`, `radToDeg`, seeded `Rng`
  (`randf`, `randfRange`, `randiRange`).
- Signals (`signal.ts`): `readonly hit = new Signal<[number]>()`,
  `.connect(fn, {owner?, once?})`, `.once(fn)`, `.emit(...)`,
  `.disconnect(fn)`. Pass `{ owner: this }` when connecting to something that
  outlives you, so a freed node is never called back.
- Physics (`physics.ts`): `StaticBody2D`, `AnimatableBody2D`, `Area2D`, all
  with `collisionLayer`, `collisionMask`, `addShape(rectShape(size, offset))`,
  `circleShape(r, offset)`, `polygonShape(points)`, `shapesChanged()` after
  editing a shape in place. Shapes are centred on `offset` (a Godot
  `CollisionShape2D` child at `position` p with a rectangle of size s becomes
  `rectShape(s, p)`). `Area2D`: `monitoring`, `monitorable`,
  `areaEntered`/`areaExited` signals, `getOverlappingAreas()`. Queries:
  `tree.physics.intersectRay(from, to, mask)` returns
  `{position, normal, collider, layer}` or null (rays only hit surfaces facing
  them, like `hit_from_inside = false`); `tree.physics.intersectPoint(p, mask)`.
  `set_deferred("monitoring", false)` becomes a plain assignment (overlaps
  update once per tick after every script ran).
- The tree (`tree.ts`): `tree.physicsFrames` (= `Engine.get_physics_frames()`),
  `tree.paused`, `tree.timeScale`, `tree.callDeferred(fn)`,
  `tree.getNodesInGroup(g)`, `tree.getFirstNodeInGroup(g)`, `tree.currentScene`,
  `tree.camera` (the active `GameCamera`, a `ViewProvider`). `VIEW_W = 424`,
  `VIEW_H = 240`.
- Input (`input.ts`): `Input.isActionPressed('jump')`,
  `isActionJustPressed`, `isActionJustReleased` (per physics tick inside
  `physicsProcess`, per frame inside `process`/`input`), `Input.actionPress`
  / `actionRelease` (touch, timelines). Actions: `move_left`, `move_right`,
  `move_up`, `move_down`, `jump`, `pause`, `debug_overlay`, `focus`,
  `ui_accept`, `ui_cancel`, `ui_up`, `ui_down`, `ui_left`, `ui_right`. Menu
  code gets `InputEvent`s in `input(ev)`: `ev.isActionPressed('ui_accept')`,
  `ev.isAction(...)`, `ev.echo`, `ev.handled = true` to consume.
- Images: `assetImage('assets/sprites/...png')` (null until loaded; draw the
  placeholder meanwhile), `assetExists(path)`.
- Audio: `Audio.playSfx('jump')`, `Audio.playMusic('z1')`, `Audio.stopMusic()`.

## Game API

- Player (`src/player/player.ts`): `Player.fromArea(area)`, `groundSpeed`,
  `velocity` (px/frame), `groundAngle`, `grounded`, `collisionMode`, `state`,
  `facing`, `stateChanged`, `hurtTaken`, `died`, `isAttacking()`,
  `isInvincible()`, `hurt(src)`, `kill()`, `bounceOff(y, reverseX)`,
  `launch(v)`, `pushGround(speed, lock)`, `setControlLock(n)`,
  `setCollisionPath(p)`, `freeze(b)`, `playPose(p)`, `respawnAt(pos)`,
  `clampRect`, `collisionPath`, `controlLock`, `crouching`,
  `spindashCharge`, `getRadii()`, `canCollectTickets()`, `invincibleFramesLeft()`,
  `hitbox`, `moves` (power-ups). Snake_case Godot names become camelCase.
- Level objects and enemies extend `PlayerArea`
  (`src/levels/common/player_area.ts`: `playersInside()`, `playerEntered`,
  `playerExited`), `Enemy` (`src/levels/enemies/enemy_base.ts`) or
  `MovingBody` (`src/levels/common/moving_body.ts`).
- Exported properties: implement `applyProps(p: Props)`
  (`src/levels/common/props.ts`) and read each export with `p.num('speed',
  this.speed)`, `p.int`, `p.bool`, `p.str`, `p.vec`, `p.color`, `p.vecs`,
  `p.nums`. The level loader calls it before the node enters the tree, after
  setting position/z_index/visible/scale/rotation/collision_layer/mask.
  Build children and shapes in the constructor (from the `.tscn` scene file);
  adjust them in `applyProps`/`ready()`.
- Registering a type: `LevelTypes.register('res://levels/enemies/walker.tscn',
  () => new Walker())` (`src/levels/common/level_loader.ts`). Use the original
  `.tscn` path when the level files instance a scene, else the `.gd` path.
- `LevelRoot.find(node)`, `root.progressAt(x)`, `root.completeLevel()`,
  `root.getBounds()`. `LevelDifficulty.at(node)`, `LevelFx.pillPop(...)`,
  `LevelFx.debris(...)`, `LevelFx.playTelegraph()`, `Effects.dust(...)`,
  `Effects.ticketSparkle(at, parent)`.
- `GameCamera.current()` with `shake`, `lockTo`, `unlock`,
  `startAutoscroll`, `stopAutoscroll`, `viewRect()`.

## Conventions

- Strict TypeScript, no `any`. Two-space indent, single quotes, semicolons.
- Keep the original comments' intent (shortened). Document the class at the top.
- Keep every name, character and look original (docs/DESIGN.md). Never write
  the name of an existing game franchise or its characters anywhere.
- Never hard-code a per-zone speed: use the `Enemy` difficulty helpers.
- Missing art never crashes: draw the placeholder.
