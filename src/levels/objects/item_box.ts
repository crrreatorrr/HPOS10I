// Item box: a sturdy crate with a screen that shows what's inside. Solid
// (Sproto can stand on it and is stopped by it) until he hits it while
// attacking - a jump or a roll, from the side, from above or from below. It
// then bursts, +10 score, and gives its power-up: a shield (absorbs one hit),
// speed shoes, invincibility or an extra life. Item boxes never give tickets.
// Landing on one from above bounces him like an enemy.
//
// Like the breakable wall, the check runs before the player moves and looks
// one frame ahead, so a roll breaks it without losing speed. Item boxes are
// off in Ranked and when the player turns them off in Options (the level
// removes them when it starts). The origin is the middle of the base.

import { drawPropSprite, PropSprite } from './prop_sprite';
import { Audio } from '../../core/audio';
import { GameState } from '../../core/game_state';
import { Layers } from '../../core/layers';
import { Settings } from '../../core/settings';
import { RelicLoadout } from '../../hub/relic_loadout';
import { Effects } from '../../player/effects';
import type { PowerUp } from '../../player/moves';
import type { Player } from '../../player/player';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Node2D } from '../../runtime/node';
import { rectShape, StaticBody2D } from '../../runtime/physics';
import { tree } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import { PlayerArea } from '../common/player_area';
import type { Configurable, Props } from '../common/props';
import { GameCamera } from '../../camera/game_camera';

export type BoxContent = PowerUp | 'life';

export const ITEM_BOX_CONTENTS: readonly BoxContent[] = ['shield', 'speed_shoes', 'invincibility', 'life'];
const SIZE = 28;
const SCORE = 10;
const REACH = 4;
const DETECT_MARGIN = 24;

const OUTLINE = Color.rgb8(24, 20, 48);
const FRAME = Color.rgb8(196, 200, 214);
const FRAME_DARK = Color.rgb8(120, 124, 146);
const FRAME_LIGHT = Color.rgb8(236, 238, 246);
const SCREEN = Color.rgb8(30, 34, 64);
const SCREEN_GLARE = Color.rgb8(70, 84, 140);

export function boxesEnabled(): boolean {
  return Settings.data.itemBoxes && RelicLoadout.resolve().extras_allowed;
}

/** Draws the icon of a box's content centred on the origin (also used by the HUD look-alikes). */
const CONTENT_SPRITE: Record<BoxContent, number> = {
  shield: PropSprite.shield, speed_shoes: PropSprite.shoe, invincibility: PropSprite.invincible, life: PropSprite.life,
};

export function drawContentIcon(g: Gfx, content: BoxContent, at: Vec2, t: number): void {
  const pulse = content === 'invincibility' ? 0.85 + 0.15 * Math.sin(t * 0.16) : 0.9;
  if (drawPropSprite(g, CONTENT_SPRITE[content], at, new Vec2(pulse, pulse))) return;
  switch (content) {
    case 'shield': {
      g.circle(at, 7, Color.rgb8(90, 190, 255, 200));
      g.circle(at, 5, Color.rgb8(170, 230, 255, 220));
      g.rect(at.x - 3, at.y - 4, 2, 2, Color.WHITE);
      break;
    }
    case 'speed_shoes': {
      g.rect(at.x - 6, at.y - 1, 9, 5, Color.rgb8(232, 44, 52));
      g.rect(at.x - 6, at.y + 3, 11, 2, Color.WHITE);
      g.rect(at.x - 6, at.y - 4, 4, 4, Color.rgb8(232, 44, 52));
      g.rect(at.x + 3, at.y - 2, 3, 1, Color.rgb8(255, 216, 56));
      break;
    }
    case 'invincibility': {
      const pts: Vec2[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 7 : 3;
        pts.push(at.add(Vec2.fromAngle(-Math.PI / 2 + (Math.PI * i) / 5 + t * 0.05).mul(r)));
      }
      g.polygon(pts, Color.hsv((t * 0.02) % 1, 0.6, 1));
      break;
    }
    case 'life': {
      g.circle(at, 6, Color.rgb8(44, 104, 236));
      g.rect(at.x, at.y - 6, 6, 12, Color.rgb8(255, 216, 56));
      g.circle(at.add(new Vec2(-2, -1)), 1.5, Color.WHITE);
      g.circle(at.add(new Vec2(3, -1)), 1.5, Color.WHITE);
      g.circle(at.add(new Vec2(1, 2)), 1.5, Color.rgb8(232, 44, 52));
      break;
    }
  }
}

/** The icon rising out of a burst box. */
class RisingIcon extends Node2D {
  private age = 0;
  constructor(private readonly content: BoxContent) {
    super('ItemIcon');
  }
  override physicsProcess(): void {
    this.age++;
    if (this.age < 24) this.position = this.position.add(new Vec2(0, -1.5));
    if (this.age > 60) this.queueFree();
  }
  override draw(g: Gfx): void {
    if (this.age > 44 && this.age % 4 < 2) return;
    drawContentIcon(g, this.content, Vec2.ZERO, this.age);
  }
}

export class ItemBox extends StaticBody2D implements Configurable {
  content: BoxContent = 'shield';
  private broken = false;
  private frame = 0;
  private readonly detector = new PlayerArea('Detector');

  constructor(name = 'ItemBox') {
    super(name);
    this.collisionLayer = Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    this.processPriority = -10; // before the player moves
    this.addToGroup('item_box');
    this.addShape(rectShape(new Vec2(SIZE, SIZE), new Vec2(0, -SIZE / 2)));
    this.detector.collisionLayer = Layers.OBJECTS;
    this.detector.monitorable = false;
    this.detector.addShape(rectShape(new Vec2(SIZE + DETECT_MARGIN * 2, SIZE + DETECT_MARGIN * 2), new Vec2(0, -SIZE / 2)));
    this.addChild(this.detector);
  }

  applyProps(p: Props): void {
    const c = p.str('content', this.content);
    if ((ITEM_BOX_CONTENTS as readonly string[]).includes(c)) this.content = c as BoxContent;
  }

  isBroken(): boolean {
    return this.broken;
  }

  cullRect(): Rect2 {
    return new Rect2(-SIZE / 2 - 2, -SIZE - 2, SIZE + 4, SIZE + 4);
  }

  private boxRect(): Rect2 {
    const at = this.globalPosition;
    return new Rect2(at.x - SIZE / 2, at.y - SIZE, SIZE, SIZE);
  }

  override physicsProcess(): void {
    this.frame++;
    if (this.broken) return;
    for (const player of this.detector.playersInside()) {
      if (player.state === 'dead' || !player.isAttacking()) continue;
      if (this.reaches(player)) {
        this.burst(player);
        return;
      }
    }
  }

  private reaches(player: Player): boolean {
    const r = player.getRadii();
    const v = player.velocity;
    const rx = Math.abs(v.x) + REACH;
    const ry = Math.abs(v.y) + REACH;
    const at = player.globalPosition;
    return new Rect2(at.x - r.x, at.y - r.y, r.x * 2, r.y * 2).growIndividual(rx, ry, rx, ry).intersects(this.boxRect());
  }

  /** Bursts the box and gives its content to `player`. */
  burst(player: Player | null): void {
    if (this.broken) return;
    this.broken = true;
    this.collisionLayer = 0;
    this.clearShapes();
    this.detector.monitoring = false;
    GameState.addScore(SCORE);
    Audio.playSfx('item_box');
    Audio.playSfx('break_wall');
    const rect = this.boxRect();
    LevelFx.debris(this.parent, rect, FRAME, OUTLINE, 6);
    GameCamera.current()?.shake(2, 0.12);
    if (player) {
      // Landing on it from above (falling): bounce like off an enemy.
      if (!player.grounded && player.velocity.y > 0 && player.globalPosition.y < rect.y) player.bounceOff(rect.y);
      if (this.content === 'life') GameState.addLife();
      else player.moves.give(this.content);
    }
    const icon = new RisingIcon(this.content);
    Effects.spawn(this.parent, icon, rect.center, 30);
    tree.callDeferred(() => {
      this.visible = false;
    });
  }

  override draw(g: Gfx): void {
    if (this.broken) return;
    if (drawPropSprite(g, PropSprite.itemBox, new Vec2(0, -SIZE / 2), new Vec2(0.84, 1))) {
      if (this.frame % 40 < 37) drawContentIcon(g, this.content, new Vec2(0, -SIZE / 2 - 3), this.frame);
      return;
    }
    const x = -SIZE / 2;
    const y = -SIZE;
    g.rect(x, y, SIZE, SIZE, OUTLINE);
    g.rect(x + 1, y + 1, SIZE - 2, SIZE - 2, FRAME);
    g.rect(x + 1, y + 1, SIZE - 2, 2, FRAME_LIGHT);
    g.rect(x + 1, y + SIZE - 4, SIZE - 2, 3, FRAME_DARK);
    // Rivets.
    for (const [rx, ry] of [
      [x + 3, y + 3],
      [x + SIZE - 5, y + 3],
    ] as const) {
      g.rect(rx, ry, 2, 2, FRAME_DARK);
    }
    // Screen with the content, flickering like an old monitor.
    g.rect(x + 4, y + 6, SIZE - 8, SIZE - 12, OUTLINE);
    g.rect(x + 5, y + 7, SIZE - 10, SIZE - 14, SCREEN);
    if (this.frame % 40 < 37) drawContentIcon(g, this.content, new Vec2(0, y + SIZE / 2), this.frame);
    g.rect(x + 5, y + 7, SIZE - 10, 2, SCREEN_GLARE.withAlpha(0.7));
    // Feet.
    g.rect(x + 2, -2, 6, 2, OUTLINE);
    g.rect(x + SIZE - 8, -2, 6, 2, OUTLINE);
  }
}
