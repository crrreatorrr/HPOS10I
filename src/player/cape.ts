// Duelist cape, drawn behind Sproto, and the Nobu suit ears drawn in front.
// `marks` selects the front pass. Both follow RelicLoadout.resolve(); the
// cape stays visible in Ranked, and the ears only while the Nobu skin is equipped.

import { RelicLoadout } from '../hub/relic_loadout';
import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { Node2D } from '../runtime/node';
import { Vec2 } from '../runtime/vec2';
import type { PlayerVisual } from './player_visual';

const CAPE = new Color(0.42, 0.18, 0.62);
const CAPE_DARK = new Color(0.24, 0.08, 0.4);
const TRIM = new Color(0.93, 0.74, 0.28);
const EAR = new Color(0.95, 0.86, 0.72);
const EAR_INNER = new Color(0.86, 0.55, 0.58);
const OUTLINE = new Color(0.1, 0.11, 0.2);
const EARS = [new Vec2(-5.5, -6.5), new Vec2(-1.5, -8.0)];

export class Cape extends Node2D {
  /**
   * @param visual the PlayerVisual this hangs from (its parent).
   * @param marks true for the front pass (Nobu ears, "SkinMarks", z 1);
   *   false for the cape behind the body.
   */
  constructor(
    private readonly visual: PlayerVisual,
    readonly marks = false,
  ) {
    super(marks ? 'SkinMarks' : 'Cape');
    if (marks) this.zIndex = 1;
    else this.showBehindParent = true;
  }

  override process(): void {
    const state = RelicLoadout.resolve();
    this.visible = this.marks ? state.skin === 'nobu' : state.cape;
  }

  override draw(g: Gfx): void {
    if (this.marks) this.drawEars(g);
    else this.drawCape(g);
  }

  private drawCape(g: Gfx): void {
    const anchor = this.visual.headPoint().add(new Vec2(-1, 8));
    const player = this.visual.player;
    const ball = this.visual.isBall();
    let sway = Math.sin(performance.now() / 160) * (ball ? 1.2 : 2.2);
    const speed = player.grounded ? player.groundSpeed : player.velocity.x;
    sway += Math.min(Math.max(speed * 0.15, -3), 3);
    const drop = ball ? 8 : 14;
    const tail = anchor.add(new Vec2(-8 + sway, drop));
    g.polygon(
      [anchor.add(new Vec2(-3.5, -1.0)), anchor.add(new Vec2(2.5, 0.5)), tail.add(new Vec2(3, 0)), tail.add(new Vec2(-1.5, 2))],
      CAPE_DARK,
    );
    g.polygon([anchor.add(new Vec2(-2.5, -0.5)), anchor.add(new Vec2(1.5, 0.2)), tail], CAPE);
    g.line(anchor.add(new Vec2(-2.5, -0.5)), tail, TRIM, 1);
    g.line(anchor.add(new Vec2(-3.2, 0.4)), anchor.add(new Vec2(2.2, 0.6)), TRIM, 1.2);
  }

  private drawEars(g: Gfx): void {
    const head = this.visual.headPoint();
    for (const ear of EARS) {
      const base = head.add(ear);
      const tip = base.add(new Vec2(0, -6));
      g.polygon([base.add(new Vec2(-2.2, 1.0)), tip, base.add(new Vec2(2.2, 1.0))], OUTLINE);
      g.polygon([base.add(new Vec2(-1.4, 0.6)), tip.add(new Vec2(0, 1.2)), base.add(new Vec2(1.4, 0.6))], EAR);
      g.polygon([base.add(new Vec2(-0.6, 0.2)), tip.add(new Vec2(0, 2.4)), base.add(new Vec2(0.6, 0.2))], EAR_INNER);
    }
  }
}
