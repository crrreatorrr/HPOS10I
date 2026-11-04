// A door (Capital Mansion): a solid panel across a hall that slides up out of
// the way when its switch is pressed (open()), and stays open. It is moving
// terrain while it slides (docs/CONTRACTS.md), but it only ever moves up,
// away from anyone standing in the doorway, so it never crushes. The origin is
// the door's bottom-left corner on the floor. Node names should contain
// "door" (QA's lint counts doors and switches for R4).

import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { Signal } from '../../../runtime/signal';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { MovingBody } from '../../common/moving_body';
import type { Configurable, Props } from '../../common/props';

const PANEL = new Color(0.52, 0.34, 0.2);
const PANEL_LIGHT = new Color(0.68, 0.48, 0.3);
const PANEL_DARK = new Color(0.32, 0.2, 0.12);
const BRASS = new Color(0.95, 0.8, 0.4);
const OUTLINE = new Color(0.1, 0.07, 0.05);

export class Door extends MovingBody implements Configurable {
  readonly opened = new Signal();

  size = new Vec2(32, 96);
  /** Slide speed, px/frame. */
  openSpeed = 4.0;

  isOpen = false;
  private opening = false;
  private home = Vec2.ZERO;
  private lift = 0;

  constructor(name = 'Door') {
    super(name);
  }

  applyProps(p: Props): void {
    this.topOnly = p.bool('top_only', this.topOnly);
    this.size = p.vec('size', this.size);
    this.openSpeed = p.num('open_speed', this.openSpeed);
  }

  override enterTree(): void {
    super.enterTree();
    if (this.isOpen) this.collisionLayer = 0;
  }

  override ready(): void {
    super.ready();
    this.home = this.position;
    this.addBox(this.size, new Vec2(0, -this.size.y));
  }

  override physicsProcess(): void {
    if (this.opening && this.lift < this.size.y) {
      this.lift = Math.min(this.lift + this.openSpeed, this.size.y);
      if (this.lift >= this.size.y) {
        this.opening = false;
        this.isOpen = true;
        this.collisionLayer = 0; // fully open: out of the way for good
        this.opened.emit();
      }
    }
    this.moveTo(this.home.add(new Vec2(0, -this.lift)));
  }

  /** Starts sliding up (idempotent). */
  open(): void {
    if (!this.isOpen) this.opening = true;
  }

  isOpening(): boolean {
    return this.opening;
  }

  cullRect(): Rect2 {
    return new Rect2(-1, -this.size.y - 1, this.size.x + 2, this.size.y + 2);
  }

  override draw(g: Gfx): void {
    const size = this.size;
    const r = new Rect2(0, -size.y, size.x, size.y);
    g.rectR(r.grow(1), OUTLINE);
    g.rectR(r, PANEL);
    g.rect(r.x, r.y, size.x, 3, PANEL_LIGHT);
    g.rect(r.x, r.y + size.y - 4, size.x, 4, PANEL_DARK);
    // Two raised panels and a brass knob.
    for (let k = 0; k < 2; k++) {
      const py = r.y + 8 + k * (size.y / 2 - 4);
      g.rect(6, py, size.x - 12, size.y / 2 - 16, PANEL_DARK, false, 1);
      g.rect(7, py + 1, size.x - 14, 2, PANEL_LIGHT);
    }
    g.circle(new Vec2(size.x - 8, -size.y / 2), 2.5, OUTLINE);
    g.circle(new Vec2(size.x - 8, -size.y / 2), 1.5, BRASS);
  }
}
