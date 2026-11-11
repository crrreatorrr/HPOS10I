import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { Node2D } from '../../../runtime/node';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { MovingBody } from '../../common/moving_body';
import type { Configurable, Props } from '../../common/props';
import { drawHazardFrame, HazardArt } from './hazard_art';
import { HazardCycle } from './hazard_cycle';

const metal = Color.hex('#3b3f57');
const light = Color.hex('#b4a1b6');
const warning = Color.hex('#ffbd59');

/** Anchored to the ceiling or floor, even while the parent ram interpolates. */
class RamFixture extends Node2D {
  constructor(private readonly ram: CeilingRam, private readonly isMount: boolean) {
    super(isMount ? 'Mount' : 'WarningPlate');
  }

  cullRect(): Rect2 {
    const half = this.ram.width / 2 + 4;
    return new Rect2(-half, -12, 2 * half, 12);
  }

  override draw(g: Gfx): void {
    const lit = this.ram.warningLit();
    const half = this.ram.width / 2 + 4;
    const h = this.isMount ? 12 : 5;
    const rect = new Rect2(-half, -h, 2 * half, h);
    const row = this.isMount ? HazardArt.mount : HazardArt.outlet;
    if (!drawHazardFrame(g, row, lit ? 1 : 0, rect)) g.rectR(rect, lit ? warning : metal);
  }
}

export class CeilingRam extends MovingBody implements Configurable {
  width = 52;
  height = 26;
  travel = 96;
  /** Distance from the resting ram to the underside of its mount. */
  suspension = 0;
  /**
   * Optional approach radius. A cycle begins (from the start of its rest) only
   * while a player is this near the lane, and a ram at rest stops counting
   * when the player leaves, so the timing depends on the player's approach,
   * never on the clock. 0: the ram cycles on a fixed timer.
   */
  wakeRadius = 0;
  private armed = false;
  readonly cycle = new HazardCycle();
  private readonly mount = new RamFixture(this, true);
  private readonly plate = new RamFixture(this, false);
  private home = Vec2.ZERO;

  constructor(name = 'CeilingRam') {
    super(name);
    // Move before player sensors so the body and platform delta agree.
    this.processPriority = -1;
    this.cycle.warning = 1;
    this.addToGroup('level_hazard');
    this.addChild(this.mount);
    this.addChild(this.plate);
  }

  applyProps(p: Props): void {
    this.width = Math.max(24, p.num('width', this.width));
    this.height = Math.max(16, p.num('height', this.height));
    this.travel = Math.max(1, p.num('travel', this.travel));
    this.suspension = Math.max(0, p.num('suspension', this.suspension));
    this.wakeRadius = Math.max(0, p.num('wake_radius', this.wakeRadius));
    this.cycle.applyProps(p);
    // A stationary player needs time to accelerate out of a crushing lane.
    this.cycle.warning = Math.max(1, this.cycle.warning);
  }

  override ready(): void {
    super.ready();
    this.home = this.position;
    this.addBox(new Vec2(this.width, this.height), new Vec2(-this.width / 2, 0));
    this.cycle.reset();
    this.armed = this.wakeRadius === 0;
    this.positionFixtures(0);
  }

  override physicsProcess(): void {
    if (this.wakeRadius > 0 && (!this.armed || this.cycle.phase === 'rest')) {
      const floor = this.plate.globalPosition;
      const near = tree.getNodesInGroup<Node2D>('player').some((p) => {
        const at = p.globalPosition;
        return Math.abs(at.x - floor.x) <= this.wakeRadius && Math.abs(at.y - floor.y) < 80;
      });
      if (!near) {
        // Nobody near while at rest: wait, and count the rest again from its start.
        if (this.armed) this.cycle.reset();
        this.armed = false;
        return;
      }
      this.armed = true;
    }
    this.cycle.step(this, this.travel);
    const offset = this.cycle.amount * this.travel;
    this.moveTo(this.home.add(new Vec2(0, offset)));
    this.positionFixtures(offset);
  }

  private positionFixtures(offset: number): void {
    // Parent and child deltas cancel out in the renderer. The floor plate
    // marks the lane and shows the warning even when the ceiling is offscreen.
    this.mount.position = new Vec2(0, -this.suspension - offset);
    this.plate.position = new Vec2(0, this.travel + this.height - offset);
  }

  warningLit(): boolean {
    return this.cycle.phase === 'warning' && this.cycle.elapsed % 8 < 4;
  }

  cullRect(): Rect2 {
    return new Rect2(-this.width / 2 - 6, this.mount.position.y - 4, this.width + 12, this.height - this.mount.position.y + 4);
  }

  override draw(g: Gfx): void {
    const top = this.mount.position.y;
    const w = this.width;
    const shaft = new Rect2(-6, top - 4, 12, -top + 14);
    if (!drawHazardFrame(g, HazardArt.shaft, Math.min(3, Math.floor(this.cycle.amount * 4)), shaft)) {
      g.rectR(shaft, metal);
      g.rect(-2, shaft.y, 3, shaft.h, light);
    }
    const block = new Rect2(-w / 2, 0, w, this.height);
    const flash = this.warningLit();
    if (!drawHazardFrame(g, HazardArt.ram, flash ? 1 : this.cycle.amount === 1 ? 2 : 0, block)) {
      g.rectR(block, metal);
      g.rect(block.x + 2, 2, w - 4, 4, light);
      for (let x = block.x + 3; x < block.right - 3; x += 8) g.rect(x, this.height - 6, 4, 4, flash ? light : warning);
    }
  }
}
