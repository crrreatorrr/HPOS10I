// Simple placed ticket for the physics sandbox (the real one is LevelTicket).
// Collected by touching it; comes back after a few seconds so the hurt test
// can be repeated.

import { Audio } from '../../../core/audio';
import { GameState } from '../../../core/game_state';
import { Layers } from '../../../core/layers';
import { Effects } from '../../../player/effects';
import { Player } from '../../../player/player';
import type { Gfx } from '../../../runtime/gfx';
import { Area2D, circleShape } from '../../../runtime/physics';
import { Rect2 } from '../../../runtime/vec2';
import { drawTicket } from '../ticket_art';

const RADIUS = 6.0;
const RESPAWN_FRAMES = 180;
const CULL = new Rect2(-8, -8, 16, 16);

export class PlaygroundTicket extends Area2D {
  private hiddenFrames = 0;
  private age = 0;

  constructor(name = 'PlaygroundTicket') {
    super(name);
    this.collisionLayer = Layers.OBJECTS;
    this.collisionMask = Layers.PLAYER;
    this.monitorable = false;
    this.addShape(circleShape(RADIUS));
  }

  override ready(): void {
    this.collisionLayer = Layers.OBJECTS;
    this.collisionMask = Layers.PLAYER;
    this.monitorable = false;
  }

  override physicsProcess(): void {
    this.age += 1;
    if (this.hiddenFrames > 0) {
      this.hiddenFrames -= 1;
      this.visible = this.hiddenFrames === 0;
      return;
    }
    for (const area of this.getOverlappingAreas()) {
      const player = Player.fromArea(area);
      if (player && player.canCollectTickets()) {
        Effects.ticketSparkle(this.globalPosition, this.parent);
        GameState.addTickets(1);
        Audio.playSfx('ticket');
        this.hiddenFrames = RESPAWN_FRAMES;
        this.visible = false;
        return;
      }
    }
  }

  cullRect(): Rect2 {
    return CULL;
  }

  override draw(g: Gfx): void {
    drawTicket(g, Math.max(Math.abs(Math.cos(this.age * 0.08)), 0.2));
  }
}
