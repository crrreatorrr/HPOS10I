// A round bumper (classic set piece). Touching it from any side bounces
// Sproto straight away from its centre at SPEED (7 px/frame) through
// player.launch(), like a spring: he is airborne and not attacking, a hurt
// Sproto is bounced too, a dead one is ignored. Every bounce scores +10, up
// to MAX_SCORED times per bumper (after that it still bounces). It squashes
// along the hit direction and flashes for ANIM_FRAMES. The same player can
// be bounced again after COOLDOWN_FRAMES. The origin is the bumper's centre
// (it floats; place it in the air or on a post). Drawn in code: a neon ring
// in Neon Rush Remix, a brass-and-red post cap elsewhere (`art_zone`).
// Layer 7 (objects), mask 5 (player).

import { Audio } from '../../../core/audio';
import { GameState } from '../../../core/game_state';
import type { Player } from '../../../player/player';
import type { Gfx } from '../../../runtime/gfx';
import { circleShape } from '../../../runtime/physics';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { PlayerArea } from '../../common/player_area';
import type { Configurable, Props } from '../../common/props';
import { glowLine, resolveArtZone, styleFor, type SetPieceStyle } from './style';

export class Bumper extends PlayerArea implements Configurable {
  static readonly SPEED = 7.0;
  static readonly SCORE = 10;
  static readonly MAX_SCORED = 10;
  static readonly COOLDOWN_FRAMES = 8;
  static readonly ANIM_FRAMES = 12;

  radius = 12.0;
  artZone = '';
  /** Bounces that scored so far. */
  scored = 0;
  /** Bounces so far (scored or not). */
  bounces = 0;

  private anim = Bumper.ANIM_FRAMES;
  private hitDir = Vec2.UP;
  private lastFire = new Map<Player, number>();
  private style: SetPieceStyle | null = null;

  constructor(name = 'Bumper') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.addShape(circleShape(this.radius));
  }

  applyProps(p: Props): void {
    this.radius = Math.max(p.num('radius', this.radius), 4);
    this.artZone = p.str('art_zone', this.artZone);
    this.clearShapes();
    this.addShape(circleShape(this.radius));
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.style = styleFor(resolveArtZone(this, this.artZone));
  }

  override physicsProcess(): void {
    if (this.anim < Bumper.ANIM_FRAMES) this.anim += 1;
    const frame = tree.physicsFrames;
    for (const player of this.playersInside()) {
      if (player.state === 'dead') continue;
      if (frame - (this.lastFire.get(player) ?? -1000) < Bumper.COOLDOWN_FRAMES) continue;
      this.lastFire.set(player, frame);
      this.bounce(player);
    }
  }

  /** The launch velocity (px/frame) for a player whose centre is at `at`. */
  bounceVelocity(at: Vec2): Vec2 {
    const away = at.sub(this.globalPosition);
    const dir = away.lengthSquared() < 0.0001 ? Vec2.UP : away.normalized();
    return dir.mul(Bumper.SPEED);
  }

  bounce(player: Player): void {
    const v = this.bounceVelocity(player.globalPosition);
    player.launch(v);
    this.hitDir = v.normalized();
    this.anim = 0;
    this.bounces += 1;
    if (this.scored < Bumper.MAX_SCORED) {
      this.scored += 1;
      GameState.addScore(Bumper.SCORE);
    }
    Audio.playSfx('spring');
  }

  /** 0..1 squash amount of the animation (1 right after a hit). */
  squash(): number {
    if (this.anim >= Bumper.ANIM_FRAMES) return 0;
    return 1 - this.anim / Bumper.ANIM_FRAMES;
  }

  cullRect(): Rect2 {
    const r = this.radius + 8;
    return new Rect2(-r, -r, r * 2, r * 2);
  }

  override draw(g: Gfx): void {
    const style = this.style ?? styleFor(this.artZone);
    const s = this.squash();
    // Squash along the hit direction, stretch across it.
    const along = 1 - 0.28 * s;
    const across = 1 + 0.18 * s;
    g.setTransform(Vec2.ZERO, this.hitDir.angle(), new Vec2(along, across));
    const r = this.radius;
    const ring = (rr: number, n = 20): Vec2[] => {
      const pts: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(new Vec2(Math.cos(a) * rr, Math.sin(a) * rr));
      }
      return pts;
    };
    if (style.neon) {
      g.circle(Vec2.ZERO, r, style.body);
      g.circle(Vec2.ZERO, r * 0.55, style.shade);
      const flash = s > 0.05;
      g.additive(() => {
        glowLine(g, ring(r), flash ? style.warn : style.edge, true, 2);
        glowLine(g, ring(r * 0.55, 14), style.accent, true, 1);
      });
      g.circle(Vec2.ZERO, 2, style.accent.lightened(0.5));
    } else {
      g.circle(Vec2.ZERO, r + 1, style.outline);
      g.circle(Vec2.ZERO, r, s > 0.05 ? style.accent : style.warn);
      g.circle(Vec2.ZERO, r * 0.62, style.edge);
      g.circle(Vec2.ZERO, r * 0.38, style.shade);
      g.circle(new Vec2(-r * 0.35, -r * 0.4), r * 0.18, style.accent.lightened(0.4));
    }
    g.resetTransform();
  }
}
