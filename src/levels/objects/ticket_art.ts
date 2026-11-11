// The golden ticket card, drawn in code. A local copy of
// ScatteredTicket.draw_ticket() (player/scattered_ticket.gd) so placed
// tickets, the playground ticket and the goal sign emblem don't depend on the
// scattered-ticket port: a 10x6 gold card with notched ends, a darker gold
// border and a small star, squashed horizontally for the spinning flip.

import { drawPropSprite, PropSprite } from './prop_sprite';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';

export const TICKET_SIZE = new Vec2(10, 6);
export const TICKET_FILL = new Color(1.0, 0.8, 0.15);
export const TICKET_RIM = new Color(0.7, 0.45, 0.05);
export const TICKET_SHINE = new Color(1.0, 0.97, 0.75);

function cardOutline(w: number, h: number, notch: number, cut: number): Vec2[] {
  return [
    new Vec2(-w, -h),
    new Vec2(w, -h),
    new Vec2(w, -h + cut),
    new Vec2(w - notch, 0),
    new Vec2(w, h - cut),
    new Vec2(w, h),
    new Vec2(-w, h),
    new Vec2(-w, h - cut),
    new Vec2(-w + notch, 0),
    new Vec2(-w, -h + cut),
  ];
}

function star(size: number, offset: Vec2): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 === 0 ? 1.8 : 0.8) * size;
    out.push(Vec2.fromAngle(-Math.PI * 0.5 + (Math.PI * i) / 5).mul(r).add(offset));
  }
  return out;
}

// The card at scale 1 never changes: build it once (thousands of tickets draw it).
const CARD = cardOutline(TICKET_SIZE.x / 2, TICKET_SIZE.y / 2, 1.4, 1.6);
const CARD_STAR = star(1, new Vec2(0, 0.4));
const SHINE_A = new Vec2(-TICKET_SIZE.x / 2 + 1.5, -TICKET_SIZE.y / 2 + 1.0);
const SHINE_B = new Vec2(TICKET_SIZE.x / 2 - 2.5, -TICKET_SIZE.y / 2 + 1.0);

/** Draws a ticket centred on the node's origin; `squash` (0..1) scales it horizontally. */
export function drawTicket(g: Gfx, squash: number): void {
  const pose = squash > 0.67 ? PropSprite.ticket : squash > 0.32 ? PropSprite.ticketTurn : PropSprite.ticketEdge;
  if (drawPropSprite(g, pose, Vec2.ZERO, new Vec2(0.77, 0.77))) return;
  g.setTransform(Vec2.ZERO, 0, new Vec2(squash, 1));
  g.polygon(CARD, TICKET_FILL);
  g.polyline(CARD, TICKET_RIM, 1, true);
  g.line(SHINE_A, SHINE_B, TICKET_SHINE, 1);
  g.polygon(CARD_STAR, TICKET_RIM);
  g.resetTransform();
}

/** The ticket `size` times bigger, drawn within the current transform (the goal sign). */
export function drawTicketEmblem(g: Gfx, size: number): void {
  if (drawPropSprite(g, PropSprite.ticket, Vec2.ZERO, new Vec2(size * 0.72, size * 0.68))) return;
  const w = (TICKET_SIZE.x / 2) * size;
  const h = (TICKET_SIZE.y / 2) * size;
  const outline = cardOutline(w, h, 1.4 * size, 1.6 * size);
  g.polygon(outline, TICKET_FILL);
  g.polyline(outline, TICKET_RIM, 1, true);
  g.line(new Vec2(-w + 2.0, -h + 1.5), new Vec2(w - 3.0, -h + 1.5), TICKET_SHINE, 1);
  g.polygon(star(size, Vec2.ZERO), TICKET_RIM);
}
