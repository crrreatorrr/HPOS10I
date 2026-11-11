// Clerk pill (Capital Mansion, tier 2): the Pellet pill behaviour in the zone
// costume, throwing sheets of paper in an arc instead of rolling pellets.
// The throw is aimed at where Sproto stood when the telegraph started (the
// fairness rule for aimed attacks): a sheet flies a parabola to that spot,
// so moving after the flash avoids it. Paper stacks shake while it winds up.
// Port of levels/enemies/z3/clerk_pill.gd (+ .tscn: tier 2, a 20x28 hurtbox
// 14 px up).

import { drawPillSprite, PillSprite } from '../pill_sprite';
import type { Gfx } from '../../../runtime/gfx';
import type { Node2D } from '../../../runtime/node';
import { Vec2 } from '../../../runtime/vec2';
import { LevelFx } from '../../common/level_fx';
import { PaperSheet } from '../paper_sheet';
import { PelletPill } from '../pellet_pill';
import { PillArt } from '../pill_art';
import { MansionArt } from './mansion_art';

export class ClerkPill extends PelletPill {
  /** Frames the sheet takes to reach the spot (at difficulty 1; quicker later). */
  static readonly FLIGHT = 60.0;

  constructor(name = 'ClerkPill') {
    super(name, new Vec2(20, 28), new Vec2(0, -14));
    this.tier = 2;
  }

  override fire(): Node2D | null {
    const parent = this.parent;
    if (!parent) return null;
    const sheet = new PaperSheet();
    const from = this.globalPosition.add(new Vec2(this.facing * (PelletPill.HALF_LENGTH + 4), PelletPill.BODY_Y - 10));
    // moveSpeed(1) = Difficulty.speedMult(local difficulty).
    const frames = Math.max(ClerkPill.FLIGHT / Math.sqrt(this.moveSpeed(1)), 20);
    const gravity = PaperSheet.GRAVITY;
    const d = this.aim.sub(from);
    sheet.velocity = new Vec2(d.x / frames, d.y / frames - 0.5 * gravity * frames);
    sheet.position = from;
    parent.addChild(sheet);
    sheet.resetPhysicsInterpolation();
    this.recoil = 6;
    return sheet;
  }

  override pop(): void {
    LevelFx.pillPop(
      this.parent,
      this.globalPosition.add(new Vec2(0, PelletPill.BODY_Y)),
      Vec2.UP,
      PelletPill.HALF_LENGTH,
      PelletPill.RADIUS,
      PillArt.WHITE,
      PillArt.NAVY,
      PillArt.OUTLINE,
    );
  }

  override draw(g: Gfx): void {
    if (drawPillSprite(g, PillSprite.clerk, 0, this.facing, this.isTelegraphing())) return;
    const HL = PelletPill.HALF_LENGTH;
    const BODY_Y = PelletPill.BODY_Y;
    const telegraphing = this.isTelegraphing();
    const glow = this.glowing();
    g.rect(-9, -3, 18, 3, PillArt.OUTLINE);
    g.rect(-8, -2, 16, 1, PillArt.METAL_DARK);
    g.setTransform(Vec2.ZERO, 0, new Vec2(this.facing, 1));
    MansionArt.drawPaperStacks(g, telegraphing ? (this.timer % 2) - 0.5 : 0);
    g.resetTransform();
    g.setTransform(new Vec2(0, BODY_Y), -Math.PI * 0.5);
    PillArt.drawCapsule(g, HL, PelletPill.RADIUS, 1, PillArt.MANSION);
    g.resetTransform();
    PillArt.drawVisor(g, new Vec2(this.facing * 1.5, BODY_Y - HL - 1), 8, 2, false, glow);
    // A raised arm holding the next sheet, lit while winding up.
    const hand = new Vec2(this.facing * 9, BODY_Y - 12 - this.recoil);
    g.line(new Vec2(this.facing * 4, BODY_Y - 4), hand, PillArt.OUTLINE, 2);
    g.rect(hand.x - 3, hand.y - 8, 6, 8, glow ? PillArt.FLASH : MansionArt.PAPER);
  }
}
