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
import { PlayerVisual, SheetFrames, SheetSprite } from './player_visual';

const SHEET_PATHS: Record<string, string> = {
  wizard_hat: 'assets/sprites/z2_wizard_academy/wizard_hat/wizard_hat_sheet.png',
  sunglasses: 'assets/sprites/z3_capital_mansion/sunglasses/sunglasses_sheet.png',
};

const HAT = new Color(0.5, 0.22, 0.75);
const HAT_DARK = new Color(0.32, 0.12, 0.5);
const STAR = new Color(1.0, 0.85, 0.3);
const GLASSES = new Color(0.04, 0.04, 0.06);
const GLINT = new Color(0.55, 0.6, 0.75);

export class Accessory extends Node2D {
  accessory = '';
  private sprite: SheetSprite | null = null;

  constructor(private readonly visual: PlayerVisual) {
    super('Accessory');
    this.zIndex = 2;
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
    this.position = this.visual.headPoint().round();
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
