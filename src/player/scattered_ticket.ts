// A ticket knocked loose when Sproto is hurt, with the classic scatter
// behaviour: a fan of up to 32 tickets, gravity, bouncing off floors, a short
// delay before they can be collected again, then blinking out of existence.
// (player/scattered_ticket.gd + .tscn: an Area2D on OBJECTS, mask PLAYER,
// not monitorable, with a radius 6 circle.)

import { Audio } from '../core/audio';
import { GameState } from '../core/game_state';
import { Layers } from '../core/layers';
import { accel, FPS, speed } from '../core/physics_constants';
import { Tuning } from '../core/tuning';
import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { degToRad, posmod } from '../runtime/math';
import { Node, Node2D } from '../runtime/node';
import { Area2D, circleShape } from '../runtime/physics';
import { tree } from '../runtime/tree';
import { Vec2 } from '../runtime/vec2';
import { Effects } from './effects';
import { Player } from './player';

// Scatter speeds, gravity and bounce come from Tuning.physics (ticket_*).
/** The first 16 tickets form the outer ring, the rest the inner one. */
export const RING_SIZE = 16;
export const SCATTER_START_ANGLE = 101.25;
export const SCATTER_ANGLE_STEP = 22.5;
export const RADIUS = 6;
/** Drawn size of the ticket card (pixels). */
const TICKET_W = 10;
const TICKET_H = 6;
/** Tickets blink during their last frames. */
export const BLINK_FRAMES = 64;

const COLOR_FILL = new Color(1.0, 0.8, 0.15);
const COLOR_RIM = new Color(0.7, 0.45, 0.05);
const COLOR_SHINE = new Color(1.0, 0.97, 0.75);

const FLOOR_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_PATH_B | Layers.TERRAIN_TOP_ONLY;

export class ScatteredTicket extends Area2D {
  static readonly RADIUS = RADIUS;

  private vel = Vec2.ZERO; // px/s
  private age = 0;

  constructor() {
    super('ScatteredTicket');
    this.addToGroup('scattered_ticket');
    this.collisionLayer = Layers.OBJECTS;
    this.collisionMask = Layers.PLAYER;
    this.monitorable = false;
    this.addShape(circleShape(RADIUS));
  }

  /** Speed in pixels per frame (classic units). */
  get velocity(): Vec2 {
    return this.vel.div(FPS);
  }

  set velocity(v: Vec2) {
    this.vel = v.mul(FPS);
  }

  /** Physics ticks lived. */
  get ageFrames(): number {
    return this.age;
  }

  /**
   * Spawns `count` tickets around `origin` (global) in the classic two-ring
   * fan. Tickets are added deferred, so this is safe inside physics callbacks.
   */
  static scatter(parent: Node | null, origin: Vec2, count: number): ScatteredTicket[] {
    const tickets: ScatteredTicket[] = [];
    if (!parent || count <= 0) return tickets;
    const p = Tuning.physics;
    let angle = SCATTER_START_ANGLE;
    let spd = p.ticket_scatter_speed_first;
    let flip = false;
    for (let i = 0; i < count; i++) {
      if (i === RING_SIZE) {
        spd = p.ticket_scatter_speed_second;
        angle = SCATTER_START_ANGLE;
      }
      const ticket = new ScatteredTicket();
      let v = new Vec2(Math.cos(degToRad(angle)), -Math.sin(degToRad(angle))).mul(spd);
      if (flip) {
        v = v.withX(-v.x);
        angle += SCATTER_ANGLE_STEP;
      }
      flip = !flip;
      ticket.velocity = v;
      ticket.position = parent instanceof Node2D ? parent.toLocal(origin) : origin;
      tree.callDeferred(() => {
        if (!parent.isFreed()) parent.addChild(ticket);
      });
      tickets.push(ticket);
    }
    return tickets;
  }

  override physicsProcess(delta: number): void {
    const p = Tuning.physics;
    this.age += 1;
    if (this.age >= p.ticket_lifetime_frames) {
      this.queueFree();
      return;
    }

    const fall = accel(p.ticket_gravity);
    const cap = speed(p.speed_cap);
    const from = this.globalPosition;
    this.globalPosition = from.add(this.vel.mul(delta)).add(new Vec2(0, 0.5 * fall * delta * delta));
    this.vel = this.vel.withY(Math.min(this.vel.y + fall * delta, cap));

    // Bounce off floors only while falling (sweep from the last position: no tunnelling).
    if (this.vel.y > 0) {
      const hit = this.tree.physics.intersectRay(from, this.globalPosition.add(new Vec2(0, RADIUS)), FLOOR_MASK);
      if (hit) {
        this.globalPosition = this.globalPosition.withY(hit.position.y - RADIUS);
        this.vel = this.vel.withY(this.vel.y * p.ticket_bounce);
      }
    }

    if (this.age >= p.ticket_recollect_delay_frames) {
      for (const area of this.getOverlappingAreas()) {
        const player = Player.fromArea(area);
        if (player && player.canCollectTickets()) {
          this.collect();
          return;
        }
      }
    }

    this.visible = this.age < p.ticket_lifetime_frames - BLINK_FRAMES || posmod(this.age, 8) < 4;
  }

  private collect(): void {
    Effects.ticketSparkle(this.globalPosition, this.parent);
    GameState.addTickets(1);
    Audio.playSfx('ticket');
    this.queueFree();
  }

  override draw(g: Gfx): void {
    ScatteredTicket.drawTicket(g, Math.max(Math.abs(Math.cos(this.age * 0.25)), 0.2));
  }

  /**
   * Draws a golden ticket centred on the origin: a 10x6 gold card with notched
   * ends, a darker gold border and a small star. `squash` (0..1) scales it
   * horizontally for the spinning flip.
   */
  static drawTicket(g: Gfx, squash: number): void {
    g.setTransform(Vec2.ZERO, 0, new Vec2(squash, 1));
    const w = TICKET_W / 2;
    const h = TICKET_H / 2;
    const notch = 1.4;
    const outline = [
      new Vec2(-w, -h),
      new Vec2(w, -h),
      new Vec2(w, -h + 1.6),
      new Vec2(w - notch, 0),
      new Vec2(w, h - 1.6),
      new Vec2(w, h),
      new Vec2(-w, h),
      new Vec2(-w, h - 1.6),
      new Vec2(-w + notch, 0),
      new Vec2(-w, -h + 1.6),
    ];
    g.polygon(outline, COLOR_FILL);
    g.polyline(outline, COLOR_RIM, 1, true);
    g.line(new Vec2(-w + 1.5, -h + 1), new Vec2(w - 2.5, -h + 1), COLOR_SHINE, 1);
    const star: Vec2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 1.8 : 0.8;
      star.push(Vec2.fromAngle(-Math.PI * 0.5 + (Math.PI * i) / 5).mul(r).add(new Vec2(0, 0.4)));
    }
    g.polygon(star, COLOR_RIM);
    g.resetTransform();
  }
}
