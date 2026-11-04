// Content and rules that did not exist in the Godot build, added to every act
// when it starts:
//   - item boxes, placed by rule along the route (about one every five
//     screens, alternating the high and the low route), skipped when the
//     player turned them off or in Ranked;
//   - the classic 10:00 time limit per act (time over costs a life);
//   - impact feel: a short hit-stop and camera shake when an enemy pops or
//     Sproto is hit (Options: screen shake).
// Also registers the new level types (item boxes) and, when they exist,
// Zone 4 and the boss arenas.

import { GameCamera } from '../camera/game_camera';
import { GameState } from '../core/game_state';
import { Layers } from '../core/layers';
import { SceneRouter } from '../core/scene_router';
import { Settings } from '../core/settings';
import { Enemy } from './enemies/enemy_base';
import { LevelTypes } from './common/level_loader';
import { LevelHooks, LevelRoot } from './common/level_root';
import { boxesEnabled, ItemBox, type BoxContent } from './objects/item_box';
import { LevelTicket } from './objects/ticket';
import { Node, Node2D } from '../runtime/node';
import { tree } from '../runtime/tree';
import { Vec2 } from '../runtime/vec2';

/** Seconds before time over. */
export const TIME_LIMIT = 600;
/** Route length between item boxes (five screens). */
const BOX_SPACING = 424 * 5;
/** Nothing else this close to a box (px), except tickets. */
const CLEAR_RADIUS = 56;
const FLOOR_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A;
const BOX_CONTENTS: readonly BoxContent[] = ['shield', 'speed_shoes', 'shield', 'invincibility', 'speed_shoes', 'shield', 'life'];

/** Ends the act with a time over at 10:00, like the classic games. */
class TimeLimit extends Node {
  constructor(private readonly root: LevelRoot) {
    super('TimeLimit');
  }

  override physicsProcess(): void {
    const player = this.root.player;
    if (!player || player.state === 'dead' || this.root.isFinishing() || !GameState.timerRunning) return;
    if (GameState.levelTime >= TIME_LIMIT) {
      GameState.levelTime = TIME_LIMIT;
      player.kill();
    }
  }
}

/** Floors at x from the top of the level down: [y, ...] (only nearly flat, open floors). */
export function floorsAt(x: number, top: number, bottom: number): number[] {
  const out: number[] = [];
  let from = top;
  for (let guard = 0; guard < 12 && from < bottom; guard++) {
    const hit = tree.physics.intersectRay(new Vec2(x, from), new Vec2(x, bottom), FLOOR_MASK);
    if (!hit) break;
    const y = hit.position.y;
    from = y + 1;
    // Flat under the whole box, and room for it and Sproto above.
    const left = tree.physics.intersectRay(new Vec2(x - 14, y - 6), new Vec2(x - 14, y + 6), FLOOR_MASK);
    const right = tree.physics.intersectRay(new Vec2(x + 14, y - 6), new Vec2(x + 14, y + 6), FLOOR_MASK);
    if (!left || !right || Math.abs(left.position.y - y) > 1 || Math.abs(right.position.y - y) > 1) continue;
    const head = tree.physics.intersectRay(new Vec2(x, y - 1), new Vec2(x, y - 72), Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_PATH_B);
    if (head) continue;
    if (tree.physics.intersectPoint(new Vec2(x, y - 14), FLOOR_MASK | Layers.TERRAIN_PATH_B | Layers.TERRAIN_TOP_ONLY, 1).length) continue;
    out.push(y);
  }
  return out;
}

/** Places item boxes along an act. Returns how many were placed. */
export function placeItemBoxes(root: LevelRoot): number {
  const bounds = root.getBounds();
  if (!bounds.hasArea() || bounds.w > 1e6) return 0;
  const start = root.getNodeOrNull<Node2D>('PlayerStart')?.globalPosition.x ?? bounds.x;
  const goal = root.findChildren((n) => n.isInGroup('goal_sign'))[0] as Node2D | undefined;
  const end = goal ? goal.globalPosition.x : bounds.right;
  const blockers = root.findChildren<Node2D>((n) => n instanceof Node2D && n.parent !== null && !(n instanceof LevelTicket) && isLevelThing(n));
  const parent = root.getNodeOrNull('Objects') ?? root;
  let placed = 0;
  let index = 0;
  for (let x = start + BOX_SPACING * 0.6; x < end - 424; x += BOX_SPACING, index++) {
    let done = false;
    for (const dx of [0, 64, -64, 128, -128, 192, -192, 256]) {
      const cx = Math.round((x + dx) / 16) * 16;
      const floors = floorsAt(cx, bounds.y, bounds.bottom);
      if (floors.length === 0) continue;
      // Alternate: even boxes on the highest route, odd ones on the lowest.
      const ordered = index % 2 === 0 ? floors : [...floors].reverse();
      for (const y of ordered) {
        const at = new Vec2(cx, y);
        if (blockers.some((b) => b.globalPosition.distanceTo(at) < CLEAR_RADIUS)) continue;
        const box = new ItemBox(`ItemBox${placed + 1}`);
        box.content = BOX_CONTENTS[placed % BOX_CONTENTS.length]!;
        box.position = parent instanceof Node2D ? parent.toLocal(at) : at;
        parent.addChild(box);
        placed++;
        done = true;
        break;
      }
      if (done) break;
    }
  }
  return placed;
}

function isLevelThing(n: Node): boolean {
  const name = n.constructor.name;
  return n instanceof Enemy || n.isInGroup('goal_sign') || n.isInGroup('item_box') || /Checkpoint|Spring|Booster|Spikes|Wall|Door|Switch|Beam|Candle|Book|Shelf|Stair|Conveyor/.test(name);
}

function addFeel(root: LevelRoot): void {
  const player = root.player;
  if (!player) return;
  player.hurtTaken.connect(
    () => {
      if (!Settings.data.screenShake) return;
      tree.hitStop(4);
      GameCamera.current()?.shake(3, 0.2);
    },
    { owner: root },
  );
  for (const enemy of root.findChildren<Enemy>((n) => n instanceof Enemy)) {
    enemy.destroyed.connect(
      () => {
        if (!Settings.data.screenShake) return;
        tree.hitStop(2);
        GameCamera.current()?.shake(1.5, 0.1);
      },
      { owner: root },
    );
  }
}

function onLevelReady(root: LevelRoot): void {
  // Real acts only (not boss arenas: they bring their own rules).
  const zone = SceneRouter.currentZone();
  const isAct = !zone || SceneRouter.stage <= zone.acts.length;
  if (isAct) root.addChild(new TimeLimit(root));
  if (isAct && boxesEnabled()) placeItemBoxes(root);
  addFeel(root);
}

export function registerNewContent(): void {
  LevelTypes.register('hpos://objects/item_box', () => new ItemBox());
  if (!LevelHooks.afterReady.includes(onLevelReady)) LevelHooks.afterReady.push(onLevelReady);
}
