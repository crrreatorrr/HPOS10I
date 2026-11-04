// F1 debug overlay (input action `debug_overlay`). Draws every sensor ray of
// the last physics tick in world space with its hit point, plus the hitbox,
// and a text panel with the player's physics state. Starts visible when the
// page is opened with `?overlay` so it shows in recordings.

import { Color } from '../runtime/color';
import { Fonts } from '../runtime/font';
import type { Gfx } from '../runtime/gfx';
import type { InputEvent } from '../runtime/input';
import { CanvasLayer, Node2D } from '../runtime/node';
import { VIEW_W } from '../runtime/tree';
import { Vec2 } from '../runtime/vec2';
import { PATH_A, type Player } from './player';

const MODE_NAMES = ['floor', 'right wall', 'ceiling', 'left wall'];
const COLOR_FLOOR = new Color(0.2, 1.0, 0.35); // A/B (and the centre fallback)
const COLOR_CEILING = new Color(0.25, 0.65, 1.0); // C/D (and the centre fallback)
const COLOR_WALL = new Color(1.0, 0.3, 0.85); // E/F
const COLOR_HITBOX = new Color(1, 1, 1, 0.6);
const PANEL = new Color(0, 0, 0, 0.55);
const PANEL_MARGIN = 3;
/** Line pitch of the panel text (+1 so the pixel font's rows never touch). */
const LINE_PITCH = 8;
/** Godot CanvasItem z maximum: above everything in the world. */
const Z_MAX = 4096;

/** True when the page URL asks for the overlay (`?overlay`). */
function overlayArg(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('overlay');
  } catch {
    return false;
  }
}

function f(value: number, width: number, decimals: number): string {
  return value.toFixed(decimals).padStart(width);
}

/** The text panel, top-right (the HUD uses the top-left). */
class OverlayPanel extends Node2D {
  lines: string[] = [];

  override draw(g: Gfx): void {
    if (this.lines.length === 0) return;
    const font = Fonts.small;
    let w = 0;
    for (const line of this.lines) w = Math.max(w, font.measure(line));
    const h = this.lines.length * LINE_PITCH - 1;
    const x = VIEW_W - 2 - w - PANEL_MARGIN * 2;
    const y = 2;
    g.rect(x, y, w + PANEL_MARGIN * 2, h + PANEL_MARGIN * 2, PANEL);
    this.lines.forEach((line, i) => font.draw(g, line, new Vec2(x + PANEL_MARGIN, y + PANEL_MARGIN + i * LINE_PITCH)));
  }
}

export class DebugOverlay extends Node2D {
  private readonly layer = new CanvasLayer('OverlayLayer');
  private readonly panel = new OverlayPanel('Panel');
  private fps = 60;

  constructor(private readonly player: Player) {
    super('DebugOverlay');
    this.topLevel = true;
    this.zIndex = Z_MAX;
    this.zAsRelative = false;
    this.layer.layer = 100;
    this.layer.addChild(this.panel);
    this.addChild(this.layer);
  }

  override ready(): void {
    this.setOverlayVisible(overlayArg());
  }

  override input(ev: InputEvent): void {
    if (ev.isActionPressed('debug_overlay')) {
      this.setOverlayVisible(!this.visible);
      ev.handled = true;
    }
  }

  setOverlayVisible(on: boolean): void {
    this.visible = on;
    this.layer.visible = on;
    this.player.sensors.recording = on;
  }

  override process(delta: number): void {
    if (delta > 0) this.fps += (1 / delta - this.fps) * 0.1;
    if (!this.visible) return;
    this.position = Vec2.ZERO;
    const p = this.player;
    const vel = p.velocity;
    this.panel.lines = [
      `gsp ${f(p.groundSpeed, 7, 3)}   x ${f(vel.x, 7, 3)}  y ${f(vel.y, 7, 3)}`,
      `angle ${f(p.groundAngle, 6, 1)}   mode ${MODE_NAMES[p.collisionMode] ?? '?'}`,
      `state ${p.state}${p.crouching ? ' (crouch)' : ''}   grounded ${p.grounded ? 'yes' : 'no'}`,
      `path ${p.collisionPath === PATH_A ? 'A' : 'B'}   lock ${p.controlLock}   charge ${p.spindashCharge.toFixed(2)}`,
      `fps ${Math.round(this.fps)}`,
    ];
  }

  override draw(g: Gfx): void {
    const p = this.player;
    for (const cast of p.sensors.casts) {
      const color = colorFor(cast.label);
      g.line(cast.from, cast.to, cast.hit ? color : color.withAlpha(0.35), 1);
      if (cast.hit) g.rect(cast.point.x - 1.5, cast.point.y - 1.5, 3, 3, color);
    }
    const r = p.getRadii();
    const center = p.globalPosition;
    g.rect(center.x - r.x, center.y - r.y, r.x * 2, r.y * 2, COLOR_HITBOX, false, 1);
    g.circle(center, 1.5, Color.WHITE);
  }
}

function colorFor(label: string): Color {
  switch (label) {
    case 'A':
    case 'B':
    case 'AB':
      return COLOR_FLOOR;
    case 'C':
    case 'D':
    case 'CD':
      return COLOR_CEILING;
  }
  return COLOR_WALL;
}
