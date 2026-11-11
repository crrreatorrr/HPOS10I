import { Layers } from '../../../core/layers';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { rectShape } from '../../../runtime/physics';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { PlayerArea } from '../../common/player_area';
import type { Configurable, Props } from '../../common/props';
import { drawHazardFrame, HazardArt } from './hazard_art';

export class FluidWell extends PlayerArea implements Configurable {
  width = 96;
  depth = 32;
  poison = false;

  constructor(name = 'FluidWell') {
    super(name);
    this.collisionLayer = Layers.HAZARDS;
    this.addToGroup('level_hazard');
  }

  applyProps(p: Props): void {
    this.width = Math.max(16, p.num('width', this.width));
    this.depth = Math.max(12, p.num('depth', this.depth));
    this.poison = p.str('fluid', 'lava') === 'poison';
  }

  override ready(): void {
    this.addShape(rectShape(new Vec2(this.width, this.depth), new Vec2(0, this.depth / 2)));
  }

  override physicsProcess(): void {
    for (const player of this.playersInside()) {
      player.hurt(this.globalPosition);
    }
  }

  cullRect(): Rect2 {
    return new Rect2(-this.width / 2, -10, this.width, this.depth + 10);
  }

  override draw(g: Gfx): void {
    const cells = Math.max(1, Math.round(this.width / 32));
    const w = this.width / cells;
    const dark = this.poison ? Color.hex('#243f3b') : Color.hex('#612735');
    const body = this.poison ? Color.hex('#438d32') : Color.hex('#cf411f');
    const foam = this.poison ? Color.hex('#c2ec55') : Color.hex('#ffb943');
    const frame = Math.floor(tree.physicsFrames / 8) % 4;
    g.rect(-this.width / 2, 0, this.width, this.depth, dark);
    for (let i = 0; i < cells; i++) {
      const x = -this.width / 2 + i * w;
      const f = (frame + i) % 4;
      const surface = new Rect2(x, -8, w, this.depth + 8);
      if (drawHazardFrame(g, this.poison ? HazardArt.poison : HazardArt.lava, f, surface)) continue;
      g.rect(x, 0, w, this.depth - 3, body);
      g.rect(x, 0, w, 3, foam);
      g.rect(x + w / 3, 2 - 2 * f, 3 + (f % 2) * 2, 3 + (f % 2) * 2, foam);
      g.rect(x + w * 0.7, 8 + (3 - f) * 3, 5, 2, foam);
    }
  }
}
