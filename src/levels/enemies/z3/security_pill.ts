// Security pill (Capital Mansion, tier 3): the Spike pill behaviour in the
// zone costume: a navy and white capsule whose spikes are chrome. Port of
// levels/enemies/z3/security_pill.gd (+ .tscn: tier 3, speed 0.5, a 34x20
// hurtbox 13 px up). Like the original, only the body palette changes.

import { PillSprite } from '../pill_sprite';
import { PillArt, type PillPalette } from '../pill_art';
import { SpikePill } from '../spike_pill';

export class SecurityPill extends SpikePill {
  protected override readonly spriteRow: number = PillSprite.security;

  constructor(name = 'SecurityPill') {
    super(name);
    this.tier = 3;
    this.speed = 0.5;
  }

  override palette(): PillPalette {
    return PillArt.MANSION;
  }
}
