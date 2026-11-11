import { Layers } from '../../../core/layers';
import type { Player } from '../../../player/player';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { PlayerArea } from '../../common/player_area';
import type { Configurable, Props } from '../../common/props';
import { Enemy } from '../../enemies/enemy_base';
import { drawHazardFrame, HazardArt } from './hazard_art';
import { HazardCycle } from './hazard_cycle';

const dark = Color.hex('#422a47');
const hot = Color.hex('#ed5628');
const flash = Color.hex('#ffcd61');
const green = Color.hex('#99cf52');

function drawOutlet(g: Gfx, width: number, warning: boolean): void {
  const rect = new Rect2(-width / 2 - 4, -6, width + 8, 8);
  if (!drawHazardFrame(g, HazardArt.outlet, warning ? 1 : 0, rect)) {
    g.rectR(rect, dark);
    g.rect(-width / 2, -5, width, 3, warning ? flash : hot);
  }
}

type LiveRect = { kind: 'rect'; size: Vec2; offset: Vec2; disabled: boolean };

function updateShape(area: PlayerArea, shape: LiveRect, width: number, top: number, bottom: number): void {
  const height = Math.max(0, bottom - top);
  const disabled = height < 2;
  const y = top + height / 2;
  if (shape.size.x === width && shape.size.y === height && shape.offset.y === y && shape.disabled === disabled) return;
  shape.disabled = disabled;
  shape.size = new Vec2(width, height);
  shape.offset = new Vec2(0, y);
  area.shapesChanged();
}

function liveRect(): LiveRect {
  return { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO, disabled: true };
}

export class LavaVent extends PlayerArea implements Configurable {
  width = 30;
  height = 64;
  readonly cycle = new HazardCycle();
  private readonly jet = liveRect();
  private readonly base = liveRect();

  constructor(name = 'LavaVent') {
    super(name);
    this.collisionLayer = Layers.HAZARDS;
    this.addShape(this.jet);
    this.addShape(this.base);
    this.addToGroup('level_hazard');
  }

  applyProps(p: Props): void {
    this.width = Math.max(16, p.num('width', this.width));
    this.height = Math.max(16, p.num('height', this.height));
    this.cycle.applyProps(p);
  }

  override ready(): void {
    this.cycle.reset();
  }

  get rise(): number { return Math.round(this.height * this.cycle.amount); }

  override physicsProcess(): void {
    // Area overlaps reflect the last completed tick. Resolve them against
    // that tick's shape before changing its bounds for the next physics step.
    if (!this.jet.disabled || !this.base.disabled) {
      for (const player of this.playersInside()) player.hurt(this.globalPosition);
    }
    this.cycle.step(this, this.height);
    // The top of the flame is much narrower than the lava at the outlet.
    updateShape(this, this.jet, Math.round(this.width * 0.4), -this.rise + 3, 0);
    updateShape(this, this.base, this.width - 8, -Math.min(8, this.rise), 0);
  }

  cullRect(): Rect2 {
    return new Rect2(-this.width / 2 - 6, -this.height - 6, this.width + 12, this.height + 10);
  }

  override draw(g: Gfx): void {
    const t = this.cycle.elapsed;
    const warning = this.cycle.phase === 'warning';
    const h = this.rise;
    if (h >= 2 && !drawHazardFrame(g, HazardArt.eruption, Math.floor(t / 5) % 4, new Rect2(-this.width / 2, -h, this.width, h))) {
      g.rect(-this.width / 2, -h + 2, this.width, h - 2, hot);
      g.rect(-this.width / 4, -h + 4, this.width / 2, Math.max(0, h - 4), flash);
    }
    if (warning && t % 10 < 6) {
      const spark = new Rect2(-5, -14 - (t % 10), 10, 10);
      if (!drawHazardFrame(g, HazardArt.eruption, Math.floor(t / 10) % 4, spark)) {
        g.rect(-4, -12 - (t % 10), 3, 4, hot);
        g.rect(3, -9 - (t % 10), 3, 4, flash);
      }
    }
    drawOutlet(g, this.width, warning && t % 8 < 4);
  }
}

export class Burrower extends Enemy {
  override tier = 3;
  static readonly WIDTH = 24;
  static readonly HEIGHT = 30;
  height = 54;
  readonly cycle = new HazardCycle();
  private readonly body = liveRect();

  constructor(name = 'Burrower') {
    super(name);
    this.cycle.extend = 22;
    this.cycle.hold = 54;
    this.addShape(this.body);
    this.addToGroup('level_hazard');
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.height = Math.max(Burrower.HEIGHT, p.num('height', this.height));
    this.cycle.applyProps(p);
  }

  override ready(): void {
    this.cycle.reset();
  }

  get rise(): number { return Math.round(this.height * this.cycle.amount); }

  override physicsProcess(): void {
    // Resolve contact against the visible portion from the last tick.
    if (!this.body.disabled) for (const player of this.playersInside()) {
      this.touch(player);
      if (!this.alive) return;
    }
    this.cycle.step(this, this.height);
    updateShape(this, this.body, Burrower.WIDTH - 4, -this.rise + 1, Math.min(0, Burrower.HEIGHT - this.rise));
  }

  override bounce(player: Player): void {
    // Bounce relative to the exposed enemy, not the hatch in the floor.
    if (player.getMeta<number>(Enemy.BOUNCE_META, -1) === tree.physicsFrames) return;
    player.setMeta(Enemy.BOUNCE_META, tree.physicsFrames);
    player.bounceOff(this.globalPosition.y - this.rise + Math.min(this.rise, Burrower.HEIGHT) / 2);
  }

  cullRect(): Rect2 {
    return new Rect2(-20, -this.height - 4, 40, this.height + 8);
  }

  override draw(g: Gfx): void {
    const warning = this.cycle.phase === 'warning' && this.cycle.elapsed % 8 < 4;
    const h = this.rise;
    if (h > 0) {
      const w = Burrower.WIDTH;
      const rect = new Rect2(-w / 2, -h, w, Burrower.HEIGHT);
      g.clipped(new Rect2(-w / 2, -h, w, h), () => {
        const frame = this.cycle.phase === 'extend' ? 0 : this.cycle.phase === 'retract' ? 3 : 1 + Math.floor(this.cycle.elapsed / 9) % 2;
        if (drawHazardFrame(g, HazardArt.burrower, frame, rect)) return;
        g.rectR(rect, dark);
        g.rect(rect.x + 2, rect.y + 2, w - 4, 20, green);
        g.rect(-7, rect.y + 8, 4, 4, dark);
        g.rect(3, rect.y + 8, 4, 4, dark);
      });
    }
    drawOutlet(g, Burrower.WIDTH, warning);
  }
}
