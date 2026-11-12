// Content and rules that did not exist in the Godot build, added to every act
// when it starts:
//   - item boxes, placed by rule along the route (about one every five
//     screens, alternating the high and the low route), skipped when the
//     player turned them off or in Ranked; Zone 4 gets no speed shoes;
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
import { registerZone4 } from './z4/register';
import { Vec2 } from '../runtime/vec2';
import { TerrainLoop } from '../terrain/loop';

/** Seconds before time over. */
export const TIME_LIMIT = 600;
/** Route length between item boxes (five screens). */
const BOX_SPACING = 424 * 5;
/** Nothing else this close to a box (px), except tickets. */
const CLEAR_RADIUS = 56;
/** No pit (a column with no floor under it at all) this close to a box, either way: about one bounce at running speed. */
const PIT_CLEAR = 384;
/** No up-slope this far ahead of a box (to the right, the way acts run). */
const CLIMB_CLEAR = 512;
const FLOOR_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A;
/** Offsets tried around each target x, nearest first (up to 1.5 screens either way). */
const SEARCH_OFFSETS: readonly number[] = [0, ...Array.from({ length: 20 }, (_, i) => [(i + 1) * 32, -(i + 1) * 32]).flat()];
type BoxSlot = BoxContent | null;
const BOX_CONTENTS: readonly BoxSlot[] = ['shield', 'speed_shoes', 'shield', 'invincibility', 'speed_shoes', 'shield', 'life'];
/**
 * Zone 4 is timed jumps over pits, where doubled speed and acceleration throw
 * Sproto off the platforms: its speed-shoes slots stay empty (no box there).
 */
const BOX_CONTENTS_Z4: readonly BoxSlot[] = BOX_CONTENTS.map((c) => (c === 'speed_shoes' ? null : c));

/** The box contents of a zone, in placement order (null = that spot gets no box). */
export function boxContentsFor(zoneId: string): readonly BoxSlot[] {
  return zoneId === 'z4_neon_rush_remix' ? BOX_CONTENTS_Z4 : BOX_CONTENTS;
}

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

/** Floor y near `y` at x (searching 40 px above and below), or null. */
function floorNear(x: number, y: number): number | null {
  const hit = tree.physics.intersectRay(new Vec2(x, y - 40), new Vec2(x, y + 40), FLOOR_MASK);
  return hit ? hit.position.y : null;
}

/**
 * True when the ground stays level around x: flat under the box and its
 * approach, no slope foot or downhill bottom within a few tiles, no climb
 * within 512 px ahead, and no pit within a bounce, so a box never stops a
 * runner coming down a hill, never sits where a jump over it lands on an
 * up-slope, never leaves a player who rolled through it rolling into a
 * climb, and never bounces a player who lands on it into a pit.
 */
function levelGround(x: number, y: number, bottom: number): boolean {
  for (let dx = -PIT_CLEAR; dx <= PIT_CLEAR; dx += 16) {
    const f = floorNear(x + dx, y);
    if (f === null) {
      // A gap or a ledge close by is not a good spot either.
      if (Math.abs(dx) <= 128) return false;
      // Further out a lower floor is fine, a pit is not: landing on a box
      // bounces Sproto, and the bounce must come down on floor.
      if (!tree.physics.intersectRay(new Vec2(x + dx, y - 40), new Vec2(x + dx, bottom), FLOOR_MASK | Layers.TERRAIN_TOP_ONLY)) return false;
      continue;
    }
    if (Math.abs(dx) > 256) continue;
    const limit = Math.abs(dx) <= 96 ? 1 : 8;
    if (Math.abs(f - y) > limit) return false;
  }
  // No climb within a roll's reach ahead: a player who rolls through the box
  // must not meet an up-slope before he is back on his feet.
  for (let dx = 256 + 16; dx <= CLIMB_CLEAR; dx += 16) {
    const f = floorNear(x + dx, y);
    if (f !== null && y - f > 8) return false;
  }
  return true;
}

/** Spans of x to keep clear: loops (and their run-up), springs and boosters (launch and landing zones). */
function keepOutSpans(root: LevelRoot): [number, number][] {
  const spans: [number, number][] = [];
  for (const n of root.findChildren<Node2D>((c) => c instanceof Node2D)) {
    const name = n.constructor.name;
    const x = n.globalPosition.x;
    if (n instanceof TerrainLoop) {
      const half = n.radius + n.thickness + Math.max(n.floorMargin, Math.min(n.footRadius, n.radius) + 64) + 64;
      spans.push([x - half, x + half]);
    } else if (n.isInGroup('level_hazard')) {
      spans.push([x - 128, x + 128]);
    } else if (/Spring|Booster|Launch|Bumper|Tube/.test(name)) {
      spans.push([x - 320, x + 320]);
    }
  }
  return spans;
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
  const spans = keepOutSpans(root);
  const contents = boxContentsFor(root.currentZoneId());
  let slot = 0;
  let placed = 0;
  let index = 0;
  for (let x = start + BOX_SPACING * 0.6; x < end - 424; x += BOX_SPACING, index++) {
    let done = false;
    for (const dx of SEARCH_OFFSETS) {
      const cx = Math.round((x + dx) / 16) * 16;
      if (spans.some(([a, b]) => cx >= a && cx <= b)) continue;
      const floors = floorsAt(cx, bounds.y, bounds.bottom).filter((y) => levelGround(cx, y, bounds.bottom));
      if (floors.length === 0) continue;
      // Alternate: even boxes on the highest route, odd ones on the lowest.
      const ordered = index % 2 === 0 ? floors : [...floors].reverse();
      for (const y of ordered) {
        const at = new Vec2(cx, y);
        if (blockers.some((b) => b.globalPosition.distanceTo(at) < CLEAR_RADIUS)) continue;
        const content = contents[slot++ % contents.length]!;
        done = true;
        if (content === null) break;
        const box = new ItemBox(`ItemBox${placed + 1}`);
        box.content = content;
        box.position = parent instanceof Node2D ? parent.toLocal(at) : at;
        parent.addChild(box);
        placed++;
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
  registerZone4();
  if (!LevelHooks.afterReady.includes(onLevelReady)) LevelHooks.afterReady.push(onLevelReady);
}
