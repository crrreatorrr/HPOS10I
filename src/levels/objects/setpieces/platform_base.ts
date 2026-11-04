// Base for the set-piece platforms (vanishing, timed, crumbling). A
// jump-through slab (TERRAIN_TOP_ONLY by default) of `size`, its origin at
// the top-left corner, moved only through MovingBody (docs/CONTRACTS.md,
// "Moving terrain"). setSolid(false) takes it out of the world (collision
// layer 0) so a standing Sproto falls; setSolid(true) only brings it back
// while no player overlaps it (a platform never materialises inside him),
// and reports whether it did.

import { Layers } from '../../../core/layers';
import { Player } from '../../../player/player';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { MovingBody } from '../../common/moving_body';
import type { Props } from '../../common/props';
import { resolveArtZone, styleFor, type SetPieceStyle } from './style';

export class SetPiecePlatform extends MovingBody {
  size = new Vec2(96, 12);
  artZone = '';
  protected style: SetPieceStyle | null = null;
  private solid = true;
  private shapeBuilt = false;

  constructor(name: string) {
    super(name);
    this.topOnly = true;
  }

  /** Reads size, top_only and art_zone (subclasses call it first). */
  applyCommon(p: Props): void {
    this.size = p.vec('size', this.size);
    this.topOnly = p.bool('top_only', this.topOnly);
    this.artZone = p.str('art_zone', this.artZone);
  }

  override enterTree(): void {
    if (!this.shapeBuilt) {
      this.shapeBuilt = true;
      this.addBox(this.size);
    }
    super.enterTree();
    if (!this.solid) this.collisionLayer = 0;
  }

  override ready(): void {
    super.ready();
    this.style = styleFor(resolveArtZone(this, this.artZone));
  }

  get isSolid(): boolean {
    return this.solid;
  }

  /** Turns collision on or off; returns whether it is solid afterwards. */
  setSolid(on: boolean): boolean {
    if (on && !this.solid && this.playerOverlapping()) return false;
    this.solid = on;
    this.collisionLayer = on ? (this.topOnly ? Layers.TERRAIN_TOP_ONLY : Layers.TERRAIN_SOLID) : 0;
    return on;
  }

  /** The platform's rectangle in world space. */
  worldRect(): Rect2 {
    const at = this.globalPosition;
    return new Rect2(at.x, at.y, this.size.x, this.size.y);
  }

  /** Live players in the tree. */
  players(): Player[] {
    return tree.getNodesInGroup<Player>('player').filter((p) => p instanceof Player && p.isInsideTree() && p.state !== 'dead');
  }

  /** True when a player's body overlaps the slab (plus a 2 px margin). */
  playerOverlapping(): boolean {
    const rect = this.worldRect().grow(2);
    for (const p of this.players()) {
      const r = p.getRadii();
      const body = new Rect2(p.globalPosition.x - r.x, p.globalPosition.y - r.y, r.x * 2, r.y * 2);
      if (rect.intersects(body)) return true;
    }
    return false;
  }

  /** Players standing on this platform right now. */
  playersStanding(): Player[] {
    return this.players().filter((p) => p.grounded && p.support === this);
  }

  cullRect(): Rect2 {
    return new Rect2(-8, -8, this.size.x + 16, this.size.y + 16);
  }

  protected styleNow(): SetPieceStyle {
    return this.style ?? styleFor(this.artZone);
  }
}
