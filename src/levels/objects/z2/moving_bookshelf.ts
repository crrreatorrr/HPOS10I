// A moving bookshelf (Wizard Academy, docs/DESIGN.md): a tall solid shelf of
// books that slides out of its alcove by `travel`, holds, and slides back, on
// a timer. It is moving terrain (docs/CONTRACTS.md "Moving terrain"): it
// pushes Sproto out of its way, he can ride its top, and pinned against a
// wall by it he is crushed (the player's crush rule). So every close is
// telegraphed: the books rattle, the shelf glows and the telegraph sound
// plays for Difficulty.telegraph(telegraphSeconds, local), never under
// 0.35 s, before it starts to move, including its first cycle after a
// (re)spawn or a pause (the cycle starts at rest). The rest between cycles
// scales with interval_mult. The origin is the shelf's top-left corner at rest.

import { drawPropSprite, PropSprite } from '../prop_sprite';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { clamp } from '../../../runtime/math';
import { Signal } from '../../../runtime/signal';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { LevelDifficulty } from '../../common/level_difficulty';
import { LevelFx } from '../../common/level_fx';
import { MovingBody } from '../../common/moving_body';
import type { Configurable, Props } from '../../common/props';

export enum ShelfPhase {
  OPEN,
  WARNING,
  CLOSING,
  CLOSED,
  OPENING,
}

const WOOD = new Color(0.5, 0.3, 0.18);
const WOOD_LIGHT = new Color(0.68, 0.45, 0.26);
const WOOD_DARK = new Color(0.3, 0.17, 0.1);
const OUTLINE = new Color(0.14, 0.08, 0.06);
const GLOW = new Color(1.0, 0.86, 0.4);
const SPINES = [
  new Color(0.6, 0.38, 0.86),
  new Color(0.98, 0.93, 0.8),
  new Color(0.42, 0.24, 0.66),
  new Color(0.85, 0.36, 0.3),
  new Color(0.36, 0.56, 0.78),
  new Color(0.98, 0.8, 0.3),
];
const SPINES_LIGHT = SPINES.map((c) => c.lightened(0.35));

export class MovingBookshelf extends MovingBody implements Configurable {
  readonly telegraphed = new Signal();
  readonly closingStarted = new Signal();

  size = new Vec2(64, 96);
  /** How far it slides out (the closing move). */
  travel = new Vec2(96, 0);
  /** Closing and opening speeds, px/frame (closing is linear, opening eased). */
  closeSpeed = 3.0;
  openSpeed = 1.5;
  /** Frames at rest between cycles at difficulty 1 (scaled by interval_mult). */
  restFrames = 150;
  /** Frames it stays out. */
  outFrames = 45;
  telegraphSeconds = 0.6;
  /** Extra frames before the first cycle (to stagger several). */
  firstDelay = 0;

  phase = ShelfPhase.OPEN;
  private timer = 0;
  private home = Vec2.ZERO;
  private _offset = Vec2.ZERO;
  private d = NaN;

  constructor(name = 'MovingBookshelf') {
    super(name);
  }

  applyProps(p: Props): void {
    this.topOnly = p.bool('top_only', this.topOnly);
    this.size = p.vec('size', this.size);
    this.travel = p.vec('travel', this.travel);
    this.closeSpeed = p.num('close_speed', this.closeSpeed);
    this.openSpeed = p.num('open_speed', this.openSpeed);
    this.restFrames = p.int('rest_frames', this.restFrames);
    this.outFrames = p.int('out_frames', this.outFrames);
    this.telegraphSeconds = p.num('telegraph_seconds', this.telegraphSeconds);
    this.firstDelay = p.int('first_delay', this.firstDelay);
  }

  override ready(): void {
    super.ready();
    this.home = this.position;
    this.addBox(this.size);
    this.timer = -this.firstDelay;
  }

  override physicsProcess(): void {
    this.timer += 1;
    const length = this.travel.length();
    switch (this.phase) {
      case ShelfPhase.OPEN:
        if (this.timer >= this.rest() - this.warning()) {
          this.setPhase(ShelfPhase.WARNING);
          this.telegraphed.emit();
          LevelFx.playTelegraph();
        }
        break;
      case ShelfPhase.WARNING:
        if (this.timer >= this.warning()) {
          this.setPhase(ShelfPhase.CLOSING);
          this.closingStarted.emit();
        }
        break;
      case ShelfPhase.CLOSING: {
        const done = Math.min(this.closeSpeed * this.timer, length);
        this._offset = this.travel.mul(done / Math.max(length, 0.001));
        if (done >= length) this.setPhase(ShelfPhase.CLOSED);
        break;
      }
      case ShelfPhase.CLOSED:
        if (this.timer >= this.outFrames) this.setPhase(ShelfPhase.OPENING);
        break;
      case ShelfPhase.OPENING: {
        const frames = this.openingFrames();
        const t = clamp(this.timer / frames, 0, 1);
        this._offset = this.travel.mul(1 - (1 - Math.cos(Math.PI * t)) / 2);
        if (this.timer >= frames) {
          this._offset = Vec2.ZERO;
          this.setPhase(ShelfPhase.OPEN);
        }
        break;
      }
    }
    this.moveTo(this.home.add(this._offset));
  }

  private setPhase(phase: ShelfPhase): void {
    this.phase = phase;
    this.timer = 0;
  }

  isTelegraphing(): boolean {
    return this.phase === ShelfPhase.WARNING;
  }

  isClosing(): boolean {
    return this.phase === ShelfPhase.CLOSING;
  }

  /** How far it is out of its alcove (0 at rest). */
  offset(): Vec2 {
    return this._offset;
  }

  localDifficulty(): number {
    if (Number.isNaN(this.d)) this.d = LevelDifficulty.at(this);
    return this.d;
  }

  /** Frames at rest, the warning included. */
  rest(): number {
    return Math.max(LevelDifficulty.intervalFrames(this.restFrames, this.localDifficulty()), this.warning() + 1);
  }

  warning(): number {
    return LevelDifficulty.telegraphFrames(this.telegraphSeconds, this.localDifficulty());
  }

  /** Eased opening: peak speed pi / 2 * travel / frames = openSpeed. */
  openingFrames(): number {
    return Math.max(1, Math.ceil(((Math.PI / 2) * this.travel.length()) / this.openSpeed));
  }

  cullRect(): Rect2 {
    return new Rect2(-3, -3, this.size.x + 6, this.size.y + 6);
  }

  override draw(g: Gfx): void {
    const size = this.size;
    const warning = this.phase === ShelfPhase.WARNING;
    const rattle = warning ? (this.timer % 2) - 0.5 : 0;
    if (drawPropSprite(g, PropSprite.bookshelf, size.mul(0.5).add(new Vec2(rattle, 0)), size.div(46))) {
      g.rect(0, 0, size.x, 2, WOOD_LIGHT);
      if (warning && Math.trunc(this.timer / 4) % 2 === 0) g.rect(-3, -3, size.x + 6, size.y + 6, GLOW, false, 2);
      return;
    }
    g.rect(-1, -1, size.x + 2, size.y + 2, OUTLINE);
    g.rect(0, 0, size.x, size.y, WOOD);
    g.rect(0, 0, size.x, 3, WOOD_LIGHT);
    g.rect(0, 0, 3, size.y, WOOD_DARK);
    g.rect(size.x - 3, 0, 3, size.y, WOOD_DARK);
    // Shelves of plain book spines (no lettering).
    const shelfH = 24.0;
    const rows = Math.max(1, Math.trunc((size.y - 4) / shelfH));
    for (let r = 0; r < rows; r++) {
      const y0 = 3 + r * shelfH;
      let x = 5.0;
      let k = r * 3;
      while (x < size.x - 8) {
        const w = 5 + ((k * 7) % 4);
        const h = shelfH - 6 - ((k * 5) % 5);
        const i = k % SPINES.length;
        const ax = x + (k % 2 === 0 ? rattle : -rattle);
        const ay = y0 + shelfH - 3 - h;
        g.rect(ax - 0.5, ay - 0.5, w + 1, h + 1, OUTLINE);
        g.rect(ax, ay, w, h, SPINES[i]!);
        g.rect(ax + 1, ay + 2, w - 2, 1, SPINES_LIGHT[i]!);
        x += w + 1;
        k += 1;
      }
      g.rect(3, y0 + shelfH - 3, size.x - 6, 3, WOOD_DARK);
    }
    if (warning && Math.trunc(this.timer / 4) % 2 === 0) g.rect(-3, -3, size.x + 6, size.y + 6, GLOW, false, 2);
  }
}
