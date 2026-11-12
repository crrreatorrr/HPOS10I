// A short afterimage trail behind Sproto above top running speed (7.5 px/frame:
// any roll down a hill, a spin dash or a booster). Draws fading
// copies of the current look in world space: the sprite frame when a sprite
// sheet exists, else simple silhouettes. Purely visual; off when the speed
// effects option is off.

import { Settings } from '../core/settings';
import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { Node2D } from '../runtime/node';
import { Vec2 } from '../runtime/vec2';
import { Effects } from './effects';
import type { Player } from './player';
import { isBallState, PlayerVisual } from './player_visual';

/** Above this speed (px/frame) the trail shows. */
export const MIN_SPEED = 7.5;
export const COPIES = 4;
/** A copy every this many frames. */
export const SPACING_FRAMES = 2;
const COLOR = new Color(0.35, 0.6, 1.0);
const ALPHA = 0.4;

interface Copy {
  position: Vec2;
  rotation: number;
  facing: number;
  ball: boolean;
  age: number;
}

export class Afterimage extends Node2D {
  private visual: PlayerVisual | null = null;
  private copies: Copy[] = [];
  private frame = 0;

  constructor(private readonly player: Player) {
    super('Afterimage');
    this.topLevel = true;
    this.zIndex = -1;
  }

  override ready(): void {
    this.visual = this.player.getNodeOrNull<PlayerVisual>('Visual');
    this.position = Vec2.ZERO;
  }

  /** Copies on show (tests). */
  copyCount(): number {
    return this.copies.length;
  }

  override physicsProcess(): void {
    const p = this.player;
    this.frame += 1;
    for (const c of this.copies) c.age += 1;
    this.copies = this.copies.filter((c) => c.age < COPIES * SPACING_FRAMES);
    const speed = p.grounded ? Math.abs(p.groundSpeed) : p.velocity.length();
    const visual = this.visual;
    if (
      Effects.enabled &&
      Settings.data.speedEffects &&
      speed > MIN_SPEED &&
      p.state !== 'dead' &&
      this.frame % SPACING_FRAMES === 0 &&
      visual !== null &&
      visual.visible
    ) {
      this.copies.unshift({
        position: p.globalPosition.round(),
        rotation: visual.rotation,
        facing: p.facing,
        ball: isBallState(p.state),
        age: 0,
      });
    }
  }

  override draw(g: Gfx): void {
    const visual = this.visual;
    if (!visual) return;
    const sprite = visual.drawsPlaceholder() ? null : visual.sprite;
    const frame = sprite?.current() ?? null;
    const radii = this.player.getRadii();
    for (const c of this.copies) {
      const fade = ALPHA * (1 - c.age / (COPIES * SPACING_FRAMES));
      g.setTransform(c.position, c.rotation, new Vec2(c.facing, 1));
      if (sprite && frame) {
        const at = sprite.position.sub(frame.region.size.div(2)).round();
        g.texture(frame.tex, at, { region: frame.region, modulate: new Color(1, 1, 1, fade) });
        continue;
      }
      const color = COLOR.withAlpha(fade);
      if (c.ball) {
        g.circle(Vec2.ZERO, radii.y - 1, color);
      } else {
        g.circle(new Vec2(1, radii.y - 23), 8.5, color);
        g.circle(new Vec2(0, radii.y - 9), 5.5, color);
      }
    }
    g.resetTransform();
  }
}
