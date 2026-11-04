// The void under a high pit: falling into it is a lost life, like falling
// below the level's Bounds, without the long fall from a rooftop down to the
// bottom of the level. A live player whose hitbox touches it is killed.
// Put it well below the pit's lips (the builder uses 160 px), so the pit
// reads as bottomless and only a real fall reaches it. The origin is the
// top-left corner; `size` is its extent. Drawn as a faint glow fading down
// into the dark (neon) or nothing (other zones). Layer 8 (hazards), mask 5.

import type { Gfx } from '../../../runtime/gfx';
import { rectShape } from '../../../runtime/physics';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { PlayerArea } from '../../common/player_area';
import type { Configurable, Props } from '../../common/props';
import { resolveArtZone, styleFor, type SetPieceStyle } from './style';

export class VoidZone extends PlayerArea implements Configurable {
  size = new Vec2(128, 64);
  artZone = '';
  private style: SetPieceStyle | null = null;

  constructor(name = 'VoidZone') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_HAZARDS;
    this.monitorable = false;
    this.rebuildShape();
  }

  applyProps(p: Props): void {
    this.size = p.vec('size', this.size);
    this.artZone = p.str('art_zone', this.artZone);
    this.rebuildShape();
  }

  private rebuildShape(): void {
    this.clearShapes();
    this.addShape(rectShape(this.size, this.size.div(2)));
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_HAZARDS;
    this.monitorable = false;
    this.style = styleFor(resolveArtZone(this, this.artZone));
  }

  override physicsProcess(): void {
    for (const player of this.playersInside()) {
      if (player.state !== 'dead') player.kill();
    }
  }

  cullRect(): Rect2 {
    return new Rect2(0, -48, this.size.x, 48);
  }

  override draw(g: Gfx): void {
    const style = this.style;
    if (!style || !style.neon) return;
    for (let i = 0; i < 6; i++) g.rect(0, -48 + i * 8, this.size.x, 8, style.edge.withAlpha(0.02 + i * 0.015));
  }
}
