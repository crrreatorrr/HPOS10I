// A placed golden ticket (docs/DESIGN.md). Touching it while
// player.canCollectTickets() adds one ticket (GameState.addTickets(1)), plays
// `ticket` and leaves a sparkle. Looks like the scattered tickets; all placed
// tickets spin in step. Layer 7 (objects), mask 5 (player); a 7 px circle, so
// a run at 16 px/frame always overlaps it for at least one frame.
// Levels hold 2000+ of these, so the per-tick work is one counter check: the
// player list is only read while someone is touching it.

import { Audio } from '../../core/audio';
import { GameState } from '../../core/game_state';
import type { Gfx } from '../../runtime/gfx';
import { circleShape } from '../../runtime/physics';
import { tree } from '../../runtime/tree';
import { Rect2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import { PlayerArea } from '../common/player_area';
import { drawTicket } from './ticket_art';

const CULL = new Rect2(-8, -8, 16, 16);

export class LevelTicket extends PlayerArea {
  /** Spin speed of the card flip (radians per frame). */
  static readonly SPIN = 0.08;
  static readonly RADIUS = 7;

  private collected = false;
  private touching = 0;

  constructor(name = 'Ticket') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.addShape(circleShape(LevelTicket.RADIUS));
    this.playerEntered.connect(() => (this.touching += 1));
    this.playerExited.connect(() => (this.touching = Math.max(this.touching - 1, 0)));
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
  }

  override physicsProcess(): void {
    if (this.collected || this.touching === 0) return;
    for (const player of this.playersInside()) {
      if (player.canCollectTickets()) {
        this.collect();
        return;
      }
    }
  }

  /** Gives the ticket to the player (once). */
  collect(): void {
    if (this.collected) return;
    this.collected = true;
    GameState.addTickets(1);
    Audio.playSfx('ticket');
    LevelFx.ticketSparkle(this.parent, this.globalPosition);
    this.monitoring = false;
    this.hide();
    this.queueFree();
  }

  isCollected(): boolean {
    return this.collected;
  }

  cullRect(): Rect2 {
    return CULL;
  }

  override draw(g: Gfx): void {
    drawTicket(g, Math.max(Math.abs(Math.cos(tree.physicsFrames * LevelTicket.SPIN)), 0.2));
  }
}
