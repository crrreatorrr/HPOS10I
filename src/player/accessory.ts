// Zone accessory drawn on Sproto's head: SceneRouter.currentZone().accessory is
// '', 'wizard_hat' or 'sunglasses'. Uses the art agent's sheet when it exists,
// else a placeholder (purple pointed wizard hat, black sunglasses bar).
// Positioned from anchors.json "head" points when available, otherwise from
// the placeholder's headPoint(). Child of the visual node, so it mirrors and
// rotates with the body.

import { SceneRouter } from '../core/scene_router';
import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { Node2D } from '../runtime/node';
import { Vec2 } from '../runtime/vec2';
import { PlayerVisual, SheetFrames, SheetSprite, spriteJson } from './player_visual';

const ANCHORS_PATH = 'assets/sprites/common/sproto/anchors.json';
const SHEET_PATHS: Record<string, string> = {
  wizard_hat: 'assets/sprites/z2_wizard_academy/wizard_hat/wizard_hat_sheet.png',
  sunglasses: 'assets/sprites/z3_capital_mansion/sunglasses/sunglasses_sheet.png',
};
/** Frame cells are 64x64; anchor points are in cell pixels. */
const CELL_CENTER = new Vec2(32, 32);

const HAT = new Color(0.5, 0.22, 0.75);
const HAT_DARK = new Color(0.32, 0.12, 0.5);
const STAR = new Color(1.0, 0.85, 0.3);
const GLASSES = new Color(0.04, 0.04, 0.06);
const GLINT = new Color(0.55, 0.6, 0.75);

export class Accessory extends Node2D {
  accessory = '';
  private anchors: Record<string, unknown> = {};
  private sprite: SheetSprite | null = null;

  constructor(private readonly visual: PlayerVisual) {
    super('Accessory');
    this.zIndex = 2;
    const data = spriteJson(ANCHORS_PATH);
    if (isRecord(data)) this.anchors = data;
  }

  override ready(): void {
    this.refresh();
  }

  /** Re-reads the zone's accessory (called on ready; call again after a zone change). */
  refresh(): void {
    this.setAccessory(SceneRouter.currentZone()?.accessory ?? '');
  }

  /** Shows `id` ('', 'wizard_hat' or 'sunglasses') regardless of the zone. */
  setAccessory(id: string): void {
    this.accessory = id;
    if (this.sprite) {
      this.sprite.queueFree();
      this.sprite = null;
    }
    const path = SHEET_PATHS[id];
    const frames = path ? SheetFrames.load(path, ['default']) : null;
    const first = frames?.animationNames()[0];
    if (frames && first !== undefined) {
      this.sprite = new SheetSprite(frames, 'Sprite');
      this.addChild(this.sprite);
      this.sprite.play(first);
    }
    this.visible = id !== '';
  }

  override process(): void {
    if (this.accessory === '') return;
    this.position = this.headPoint().round();
  }

  /** Head centre in the visual's local space. */
  private headPoint(): Vec2 {
    const sprite = this.visual.sprite;
    if (sprite && sprite.visible && !this.visual.drawsPlaceholder()) {
      const point = this.anchorFor(sprite.animation, sprite.frame);
      if (point) return sprite.position.add(point).sub(CELL_CENTER);
    }
    return this.visual.headPoint();
  }

  /**
   * Reads a "head" point from anchors.json. Accepts the layouts
   * {anim: [{head: [x, y]}, ...]}, {head: {anim: [[x, y], ...]}} and
   * {animations|frames: {anim: [{head: ...}]}}; points as [x, y] or {x, y}.
   */
  private anchorFor(anim: string, frame: number): Vec2 | null {
    const candidates: unknown[] = [];
    for (const root of [this.anchors, this.anchors.animations, this.anchors.frames]) {
      if (!isRecord(root)) continue;
      const list = root[anim];
      if (Array.isArray(list) && frame < list.length) {
        const entry: unknown = list[frame];
        if (isRecord(entry)) candidates.push(entry.head);
      }
    }
    const head = this.anchors.head;
    if (isRecord(head)) {
      const list = head[anim];
      if (Array.isArray(list) && frame < list.length) candidates.push(list[frame]);
    }
    for (const value of candidates) {
      if (Array.isArray(value) && value.length >= 2) return new Vec2(Number(value[0]), Number(value[1]));
      if (isRecord(value) && 'x' in value && 'y' in value) return new Vec2(Number(value.x), Number(value.y));
    }
    return null;
  }

  override draw(g: Gfx): void {
    if (this.sprite?.loaded()) return;
    switch (this.accessory) {
      case 'wizard_hat': {
        // Brim on the crown of the head, between the tufts.
        const brim: Vec2[] = [];
        for (let i = 0; i < 16; i++) {
          const t = (Math.PI * 2 * i) / 16;
          brim.push(new Vec2(Math.cos(t) * 9.5, -8 + Math.sin(t) * 2));
        }
        g.polygon(brim, HAT_DARK);
        g.polygon([new Vec2(-6, -8.5), new Vec2(6, -8.5), new Vec2(-1, -19), new Vec2(-7, -23)], HAT);
        g.circle(new Vec2(0, -13), 1.3, STAR);
        break;
      }
      case 'sunglasses':
        // Over the two eyes (centres (1, -2) and (5.5, -2) from the head centre).
        g.rect(-2.5, -3.8, 12.0, 1.4, GLASSES);
        g.rect(-2.0, -4.6, 6.0, 4.6, GLASSES);
        g.rect(3.2, -4.4, 4.8, 4.2, GLASSES);
        g.line(new Vec2(-1, -3.6), new Vec2(1, -3.6), GLINT, 1);
        break;
    }
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
