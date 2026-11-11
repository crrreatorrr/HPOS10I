// The goal sign at the end of an act. When a live player passes it (running
// at any speed, or flying over it: the trigger reaches high above), it plays
// `goal_sign`, spins from the ticket face to Sproto's face, and calls
// LevelRoot.completeLevel() once. The origin is the base of the post, on the
// floor. In group 'goal_sign' (LevelRoot.progressAt measures to it).
// Layer 7 (objects), mask 5 (player).

import { drawPropSprite, PropSprite } from './prop_sprite';
import { Audio } from '../../core/audio';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { rectShape } from '../../runtime/physics';
import { Signal } from '../../runtime/signal';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { LevelRoot } from '../common/level_root';
import { PlayerArea } from '../common/player_area';
import { drawTicketEmblem } from './ticket_art';

const POST_HEIGHT = 36.0;
const PANEL_RADIUS = 13.0;
const TRIGGER = new Vec2(32.0, 480.0);
/** Spin: full turns and how long they take to slow down. */
const SPIN_TURNS = 6.0;
const SPIN_FRAMES = 150;

const OUTLINE = new Color(0.12, 0.1, 0.18);
const POST = new Color(0.6, 0.62, 0.7);
const POST_DARK = new Color(0.38, 0.4, 0.5);
const RIM = new Color(0.95, 0.95, 1.0);
const BLUE = new Color(0.22, 0.52, 1.0);
const YELLOW = new Color(1.0, 0.84, 0.2);
const RED = new Color(0.93, 0.18, 0.2);
const CULL = new Rect2(-16, -POST_HEIGHT - PANEL_RADIUS * 2 - 2, 32, POST_HEIGHT + PANEL_RADIUS * 2 + 4);

export class GoalSign extends PlayerArea {
  static readonly SPIN_FRAMES = SPIN_FRAMES;
  readonly passed = new Signal();

  private triggered = false;
  private spinFrames = 0;

  constructor(name = 'GoalSign') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.addShape(rectShape(TRIGGER, new Vec2(0, -TRIGGER.y / 2)));
    this.addToGroup('goal_sign');
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
  }

  isTriggered(): boolean {
    return this.triggered;
  }

  override physicsProcess(): void {
    if (this.triggered) {
      if (this.spinFrames < SPIN_FRAMES) this.spinFrames += 1;
      return;
    }
    for (const player of this.playersInside()) {
      if (player.state !== 'dead') {
        this.trigger();
        return;
      }
    }
  }

  trigger(): void {
    if (this.triggered) return;
    this.triggered = true;
    this.spinFrames = 0;
    Audio.playSfx('goal_sign');
    this.passed.emit();
    if (this.isInsideTree()) LevelRoot.find(this)?.completeLevel();
  }

  /** Spin angle: fast at first, easing out to land on Sproto's face. */
  private angle(): number {
    if (!this.triggered) return 0;
    const t = Math.min(this.spinFrames / SPIN_FRAMES, 1.0);
    const eased = 1.0 - Math.pow(1.0 - t, 3.0);
    return (SPIN_TURNS + 0.5) * Math.PI * 2 * eased;
  }

  cullRect(): Rect2 {
    return CULL;
  }

  override draw(g: Gfx): void {
    const width = Math.cos(this.angle());
    const front = width >= 0 && !(this.triggered && this.spinFrames >= SPIN_FRAMES);
    const squash = Math.max(Math.abs(width), 0.08);
    // The whole sign has a thin post; its face turns to the opposite side after a pass.
    if (drawPropSprite(g, front ? PropSprite.goal : PropSprite.goalReverse, new Vec2(0, -30), new Vec2(squash * 0.7, 1.43))) return;
    g.rect(-2.5, -POST_HEIGHT, 5, POST_HEIGHT, OUTLINE);
    g.rect(-1.5, -POST_HEIGHT, 3, POST_HEIGHT, POST);
    g.rect(0.5, -POST_HEIGHT, 1, POST_HEIGHT, POST_DARK);
    const centre = new Vec2(0, -POST_HEIGHT - PANEL_RADIUS + 2.0);
    g.setTransform(centre, 0, new Vec2(squash, 1.0));
    g.circle(Vec2.ZERO, PANEL_RADIUS + 1.5, OUTLINE);
    g.circle(Vec2.ZERO, PANEL_RADIUS, RIM);
    // Front (ticket) before the pass; the back face shows Sproto.
    if (front) drawTicketEmblem(g, 1.7);
    else this.drawSprotoFace(g);
    g.resetTransform();
  }

  /** A simple emblem of Sproto: blue and yellow halves, eyes, red nose. */
  private drawSprotoFace(g: Gfx): void {
    const r = PANEL_RADIUS - 2.0;
    const left = [new Vec2(0, -r)];
    const right = [new Vec2(0, -r)];
    for (let k = 0; k < 13; k++) {
      const a = -Math.PI * 0.5 - (Math.PI * k) / 12;
      left.push(new Vec2(Math.cos(a), Math.sin(a)).mul(r));
      right.push(new Vec2(-Math.cos(a), Math.sin(a)).mul(r));
    }
    g.polygon(left, BLUE);
    g.polygon(right, YELLOW);
    for (const x of [-4.0, 4.0]) {
      g.circle(new Vec2(x, -2.5), 3.0, Color.WHITE);
      g.circle(new Vec2(x + 0.8, -2.0), 1.4, OUTLINE);
    }
    g.circle(new Vec2(0, 2.0), 2.2, RED);
    g.arc(new Vec2(0, 3.0), 5.0, 0.3, Math.PI - 0.3, RED, 1.5);
  }
}
