// A crumbling ledge (classic set piece). A jump-through slab that holds
// until Sproto lands on it; then it shakes for SHAKE_FRAMES (30 frames: the
// telegraph, with the telegraph sound) and falls, accelerating like he
// does, carrying whoever is still on it (he can jump off at any time). Once
// it is off screen (or has fallen FALL_LIMIT px when there is no camera) it
// stays away for RETURN_FRAMES (5 s) and then teleports back to its post,
// never into a player standing there. It is moving terrain (MovingBody), so
// a rider is carried down with it. The origin is the top-left corner at its post.

import { Audio } from '../../../core/audio';
import type { Gfx } from '../../../runtime/gfx';
import { Signal } from '../../../runtime/signal';
import { tree, VIEW_H } from '../../../runtime/tree';
import { Vec2 } from '../../../runtime/vec2';
import { LevelFx } from '../../common/level_fx';
import type { Configurable, Props } from '../../common/props';
import { SetPiecePlatform } from './platform_base';
import { glowLine } from './style';

export enum CrumblePhase {
  IDLE,
  SHAKING,
  FALLING,
  AWAY,
}

export class CrumbleLedge extends SetPiecePlatform implements Configurable {
  static readonly SHAKE_FRAMES = 30;
  static readonly RETURN_FRAMES = 300;
  static readonly GRAVITY = 0.21875;
  static readonly MAX_FALL = 12.0;
  /** Fallen this far without a camera counts as off screen. */
  static readonly FALL_LIMIT = 480.0;

  readonly shakeStarted = new Signal();
  readonly fell = new Signal();
  readonly returned = new Signal();

  shakeFrames = CrumbleLedge.SHAKE_FRAMES;
  returnFrames = CrumbleLedge.RETURN_FRAMES;

  phase = CrumblePhase.IDLE;
  timer = 0;
  frame = 0;
  private home = Vec2.ZERO;
  private fallSpeed = 0;
  private fallen = 0;

  constructor(name = 'CrumbleLedge') {
    super(name);
    this.size = new Vec2(64, 16);
  }

  applyProps(p: Props): void {
    this.applyCommon(p);
    this.shakeFrames = Math.max(p.int('shake_frames', this.shakeFrames), 1);
    this.returnFrames = Math.max(p.int('return_frames', this.returnFrames), 1);
  }

  override ready(): void {
    super.ready();
    this.home = this.position;
  }

  override physicsProcess(): void {
    this.frame += 1;
    switch (this.phase) {
      case CrumblePhase.IDLE:
        if (this.playersStanding().length > 0) {
          this.phase = CrumblePhase.SHAKING;
          this.timer = this.shakeFrames;
          this.shakeStarted.emit();
          if (this.isVisibleInTree()) Audio.playSfx('enemy_telegraph');
        }
        this.moveTo(this.home);
        break;
      case CrumblePhase.SHAKING:
        this.timer -= 1;
        this.moveTo(this.home);
        if (this.timer <= 0) {
          this.phase = CrumblePhase.FALLING;
          this.fallSpeed = 0;
          this.fallen = 0;
          this.fell.emit();
          const s = this.styleNow();
          LevelFx.debris(this.parent, this.worldRect(), s.edge, s.shade, 4);
        }
        break;
      case CrumblePhase.FALLING:
        this.fallSpeed = Math.min(this.fallSpeed + CrumbleLedge.GRAVITY, CrumbleLedge.MAX_FALL);
        this.fallen += this.fallSpeed;
        this.moveTo(this.home.add(new Vec2(0, this.fallen)));
        if (this.offScreen()) {
          this.phase = CrumblePhase.AWAY;
          this.timer = this.returnFrames;
          this.setSolid(false);
          this.visible = false;
        }
        break;
      case CrumblePhase.AWAY:
        if (this.timer > 0) this.timer -= 1;
        if (this.timer <= 0) {
          this.teleport(this.home);
          if (this.setSolid(true)) {
            this.visible = true;
            this.phase = CrumblePhase.IDLE;
            this.returned.emit();
          }
        } else {
          this.moveTo(this.position);
        }
        break;
    }
  }

  /** Below the bottom of the view (or FALL_LIMIT px down without a camera). */
  offScreen(): boolean {
    const cam = tree.camera;
    if (cam && cam.isInsideTree()) {
      const top = cam.viewTopLeft(1);
      return this.globalPosition.y > top.y + VIEW_H + 16;
    }
    return this.fallen >= CrumbleLedge.FALL_LIMIT;
  }

  override draw(g: Gfx): void {
    const style = this.styleNow();
    const w = this.size.x;
    const h = this.size.y;
    // The shake is drawn only (the slab itself stays put until it falls).
    const shaking = this.phase === CrumblePhase.SHAKING;
    const jx = shaking ? ((this.frame % 4) - 1.5) * 1.2 : 0;
    const jy = shaking ? ((Math.floor(this.frame / 2) % 2) - 0.5) : 0;
    if (shaking) g.setTransform(new Vec2(jx, jy));
    const cracks = [0.3, 0.55, 0.8].map((f) => Math.round(w * f));
    if (style.neon) {
      g.rect(0, 0, w, h, style.body);
      g.rect(0, h * 0.5, w, h * 0.5, style.shade);
      g.additive(() => {
        glowLine(g, [new Vec2(0, 0), new Vec2(w, 0)], shaking ? style.warn : style.edge, false, 2);
        glowLine(g, [new Vec2(0, h), new Vec2(w, h)], style.accent, false, 1);
      });
    } else {
      g.rect(0, 0, w, h, style.outline);
      g.rect(1, 1, w - 2, h - 2, style.body);
      g.rect(1, h * 0.6, w - 2, h * 0.4 - 1, style.shade);
      g.rect(1, 1, w - 2, 2, shaking ? style.warn : style.edge);
    }
    // Cracks: always hinted, wide open while shaking.
    const crack = (shaking || this.phase === CrumblePhase.FALLING ? style.warn : style.shade.lightened(0.2)).withAlpha(0.9);
    for (const cx of cracks) {
      g.line(new Vec2(cx, 2), new Vec2(cx - 3, h * 0.5), crack, 1);
      g.line(new Vec2(cx - 3, h * 0.5), new Vec2(cx + 2, h - 1), crack, 1);
    }
    if (shaking) g.resetTransform();
  }
}
