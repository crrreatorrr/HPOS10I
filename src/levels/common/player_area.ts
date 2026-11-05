// An Area2D that keeps track of the player hitboxes touching it (mask bit 5).
// Objects and enemies extend it and read playersInside() every tick, so a
// touch that starts while the player can't use the object (hurt, invincible,
// airborne...) still counts once he can.

import { Layers } from '../../core/layers';
import { Player } from '../../player/player';
import { Area2D } from '../../runtime/physics';
import { Signal } from '../../runtime/signal';

export class PlayerArea extends Area2D {
  static readonly LAYER_PLAYER = Layers.PLAYER;
  static readonly LAYER_ENEMIES = Layers.ENEMIES;
  static readonly LAYER_OBJECTS = Layers.OBJECTS;
  static readonly LAYER_HAZARDS = Layers.HAZARDS;

  readonly playerEntered = new Signal<[Player]>();
  readonly playerExited = new Signal<[Player]>();
  private inside = new Set<Player>();

  constructor(name?: string) {
    super(name);
    this.collisionMask = Layers.PLAYER;
    this.monitoring = true;
    this.areaEntered.connect((a) => {
      const p = Player.fromArea(a);
      if (!p) return;
      this.inside.add(p);
      this.playerEntered.emit(p);
    });
    this.areaExited.connect((a) => {
      const p = Player.fromArea(a);
      if (!p) return;
      this.inside.delete(p);
      this.playerExited.emit(p);
    });
  }

  /** Players overlapping this area right now. */
  playersInside(): Player[] {
    const out: Player[] = [];
    for (const p of this.inside) {
      if (p.isFreed() || !p.isInsideTree()) {
        this.inside.delete(p);
        continue;
      }
      out.push(p);
    }
    return out;
  }
}
