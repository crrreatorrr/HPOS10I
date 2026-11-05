// Static enemy test dummy (layer 6, mask 5). Follows the enemy contract: an
// attacking player bounces off it, anyone else gets hurt. It never dies, so
// hurt and ticket scatter can be tested again and again.

import { Audio } from '../../../core/audio';
import { Layers } from '../../../core/layers';
import { Player } from '../../../player/player';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { Area2D, rectShape } from '../../../runtime/physics';
import { Rect2, Vec2 } from '../../../runtime/vec2';

const SIZE = new Vec2(24, 28);
const BODY = new Color(0.86, 0.2, 0.2);
const DARK = new Color(0.4, 0.05, 0.08);
const CULL = new Rect2(-SIZE.x / 2, -SIZE.y, SIZE.x, SIZE.y);

export class DummyEnemy extends Area2D {
  private flash = 0;

  constructor(name = 'DummyEnemy') {
    super(name);
    this.collisionLayer = Layers.ENEMIES;
    this.collisionMask = Layers.PLAYER;
    this.monitorable = true;
    this.addShape(rectShape(SIZE, new Vec2(0, -SIZE.y / 2)));
    this.areaEntered.connect((area) => this.onAreaEntered(area));
  }

  override ready(): void {
    this.collisionLayer = Layers.ENEMIES;
    this.collisionMask = Layers.PLAYER;
    this.monitorable = true;
  }

  private onAreaEntered(area: Area2D): void {
    const player = Player.fromArea(area);
    if (!player || player.state === 'dead') return;
    if (player.isAttacking()) {
      player.bounceOff(this.globalPosition.y - SIZE.y / 2);
      Audio.playSfx('enemy_pop');
      this.flash = 12;
    } else {
      player.hurt(this.globalPosition);
    }
  }

  override physicsProcess(): void {
    if (this.flash > 0) this.flash -= 1;
  }

  cullRect(): Rect2 {
    return CULL;
  }

  override draw(g: Gfx): void {
    const color = this.flash % 4 >= 2 ? Color.WHITE : BODY;
    g.rect(-SIZE.x / 2, -SIZE.y, SIZE.x, SIZE.y, DARK);
    g.rect(-SIZE.x / 2 + 1, -SIZE.y + 1, SIZE.x - 2, SIZE.y - 2, color);
    g.line(new Vec2(-8, -21), new Vec2(-3, -18), DARK, 2);
    g.line(new Vec2(8, -21), new Vec2(3, -18), DARK, 2);
    g.circle(new Vec2(-5, -15), 2, DARK);
    g.circle(new Vec2(5, -15), 2, DARK);
    g.line(new Vec2(-6, -7), new Vec2(6, -7), DARK, 2);
  }
}
