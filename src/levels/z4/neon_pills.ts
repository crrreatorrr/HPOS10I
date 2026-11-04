// Neon Rush Remix pill robots (docs/DESIGN.md: the Zone 1 pills redone in
// neon, dark bodies with glowing magenta and cyan outlines; docs/LEVELS.md:
// neon pills are the T3/T4 versions). Same behaviour as the base enemies
// (tiers, difficulty scaling, telegraphs): only the palette changes, and a
// soft cyan glow is drawn behind the body. The floater and pellet pill keep
// their base look (their art has no palette hook). Keys: 'hpos://z4/<name>'.

import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';
import { LevelTypes } from '../common/level_loader';
import { Armored } from '../enemies/armored';
import { Chaser } from '../enemies/chaser';
import { Diver } from '../enemies/diver';
import { Dropper } from '../enemies/dropper';
import type { PillPalette } from '../enemies/pill_art';
import { Sniper } from '../enemies/sniper';
import { SpikePill } from '../enemies/spike_pill';

export const NEON_PILL: PillPalette = [
  new Color(1.0, 0.26, 0.76),
  new Color(0.64, 0.1, 0.5),
  new Color(0.16, 0.1, 0.3),
  new Color(0.08, 0.05, 0.18),
];
const GLOW = new Color(0.18, 0.92, 1.0);

function glow(g: Gfx, at: Vec2, r: number): void {
  g.additive(() => {
    g.circle(at, r + 6, GLOW.withAlpha(0.08));
    g.circle(at, r + 3, GLOW.withAlpha(0.12));
  });
}

export class NeonChaser extends Chaser {
  constructor() {
    super('NeonChaser');
  }
  override palette(): PillPalette {
    return NEON_PILL;
  }
  override draw(g: Gfx): void {
    glow(g, new Vec2(0, -10), 12);
    super.draw(g);
  }
}

export class NeonArmored extends Armored {
  constructor() {
    super('NeonArmored');
  }
  override palette(): PillPalette {
    return NEON_PILL;
  }
  override draw(g: Gfx): void {
    glow(g, new Vec2(0, -12), 14);
    super.draw(g);
  }
}

export class NeonSpikePill extends SpikePill {
  constructor() {
    super('NeonSpikePill');
  }
  override palette(): PillPalette {
    return NEON_PILL;
  }
  override draw(g: Gfx): void {
    glow(g, new Vec2(0, -12), 14);
    super.draw(g);
  }
}

export class NeonDiver extends Diver {
  constructor() {
    super('NeonDiver');
  }
  override palette(): PillPalette {
    return NEON_PILL;
  }
  override draw(g: Gfx): void {
    glow(g, Vec2.ZERO, 12);
    super.draw(g);
  }
}

export class NeonSniper extends Sniper {
  constructor() {
    super('NeonSniper');
  }
  override palette(): PillPalette {
    return NEON_PILL;
  }
  override draw(g: Gfx): void {
    glow(g, new Vec2(0, -14), 12);
    super.draw(g);
  }
}

export class NeonDropper extends Dropper {
  constructor() {
    super('NeonDropper');
  }
  override palette(): PillPalette {
    return NEON_PILL;
  }
  override draw(g: Gfx): void {
    glow(g, Vec2.ZERO, 12);
    super.draw(g);
  }
}

export const NEON_ENEMY = {
  CHASER: 'hpos://z4/neon_chaser',
  ARMORED: 'hpos://z4/neon_armored',
  SPIKE_PILL: 'hpos://z4/neon_spike_pill',
  DIVER: 'hpos://z4/neon_diver',
  SNIPER: 'hpos://z4/neon_sniper',
  DROPPER: 'hpos://z4/neon_dropper',
} as const;

export function registerNeonPills(): void {
  LevelTypes.register(NEON_ENEMY.CHASER, () => new NeonChaser());
  LevelTypes.register(NEON_ENEMY.ARMORED, () => new NeonArmored());
  LevelTypes.register(NEON_ENEMY.SPIKE_PILL, () => new NeonSpikePill());
  LevelTypes.register(NEON_ENEMY.DIVER, () => new NeonDiver());
  LevelTypes.register(NEON_ENEMY.SNIPER, () => new NeonSniper());
  LevelTypes.register(NEON_ENEMY.DROPPER, () => new NeonDropper());
}
