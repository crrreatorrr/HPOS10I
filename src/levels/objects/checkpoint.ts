// A checkpoint post. The node origin is where Sproto respawns: his centre,
// 19 px above the floor (the post's base reaches down to the floor; LevelRoot
// also lifts a respawn point that is too low onto the floor). The first touch
// by a live player calls GameState.setCheckpoint(globalPosition) once, plays
// `checkpoint` and lights the lamp. A checkpoint to the left of the current
// respawn point never moves it back. A tall trigger catches runs at 16
// px/frame and jumps over the post. Layer 7 (objects), mask 5 (player).

import { Audio } from '../../core/audio';
import { GameState } from '../../core/game_state';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { rectShape } from '../../runtime/physics';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { PlayerArea } from '../common/player_area';

const FEET = 19.0;
const POST_HEIGHT = 40.0;
const TRIGGER = new Vec2(32.0, 160.0);

const OUTLINE = new Color(0.12, 0.1, 0.18);
const POST = new Color(0.3, 0.36, 0.62);
const POST_LIGHT = new Color(0.46, 0.54, 0.84);
const LAMP_OFF = new Color(0.42, 0.48, 0.66);
const LAMP_ON = new Color(1.0, 0.82, 0.2);
const LAMP_GLOW = new Color(1.0, 0.95, 0.65);
const CULL = new Rect2(-8, FEET - POST_HEIGHT - 6, 16, POST_HEIGHT + 8);

export class Checkpoint extends PlayerArea {
  static readonly FEET = FEET;
  static readonly POST_HEIGHT = POST_HEIGHT;
  static readonly TRIGGER = TRIGGER;

  private active = false;
  private litFrames = 0;

  constructor(name = 'Checkpoint') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.addShape(rectShape(TRIGGER, new Vec2(0, FEET - TRIGGER.y / 2)));
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    // Already passed (respawned here or further on): show it lit.
    const current = GameState.checkpointPosition;
    if (current && current.x >= this.globalPosition.x - 1.0) {
      this.active = true;
      this.litFrames = 1000;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  override physicsProcess(): void {
    if (this.active) {
      this.litFrames += 1;
      return;
    }
    for (const player of this.playersInside()) {
      if (player.state !== 'dead') {
        this.activate();
        return;
      }
    }
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.litFrames = 0;
    const current = GameState.checkpointPosition;
    if (current && current.x > this.globalPosition.x + 1.0) return; // an earlier post: keep the later respawn point
    GameState.setCheckpoint(this.globalPosition);
    Audio.playSfx('checkpoint');
  }

  cullRect(): Rect2 {
    return CULL;
  }

  override draw(g: Gfx): void {
    const base = FEET;
    const top = FEET - POST_HEIGHT;
    g.rect(-6, base - 3, 12, 3, OUTLINE);
    g.rect(-2.5, top + 6, 5, POST_HEIGHT - 8, OUTLINE);
    g.rect(-1.5, top + 6, 3, POST_HEIGHT - 8, POST);
    g.rect(-1.5, top + 6, 1, POST_HEIGHT - 8, POST_LIGHT);
    const lamp = new Vec2(0, top + 2.0);
    if (this.active) {
      // The lit lamp spins for a moment, then glows.
      const squash = this.litFrames < 40 ? Math.abs(Math.cos(this.litFrames * 0.35)) : 1.0;
      g.circle(lamp, 6.5, OUTLINE);
      g.setTransform(lamp, 0, new Vec2(Math.max(squash, 0.25), 1.0));
      g.circle(Vec2.ZERO, 5.0, LAMP_ON);
      g.circle(new Vec2(-1.5, -1.5), 2.0, LAMP_GLOW);
      g.resetTransform();
    } else {
      g.circle(lamp, 6.5, OUTLINE);
      g.circle(lamp, 5.0, LAMP_OFF);
      g.circle(lamp.add(new Vec2(-1.5, -1.5)), 1.5, POST_LIGHT);
    }
  }
}
