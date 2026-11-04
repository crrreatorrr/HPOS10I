// The act-clear emerald as a flat icon spinning around its vertical axis,
// drawn centred on this node. Used by the tally (big) and the zone select
// (small slots).
//
// The face is squashed to width = size x |cos(phase)|, rounded to an even
// number of whole pixels so the columns stay crisp and the icon keeps its
// centre. Past edge-on (cos < 0) the back shows: the same face mirrored and
// darkened. Near edge-on a 2 px green-and-gold strip keeps it from vanishing.
// Uses Emeralds.icon(); until the art exists, a procedural faceted gem.

import { Emeralds } from '../../core/emeralds';
import { Color } from '../../runtime/color';
import { makeCanvas, type Gfx, type Texture } from '../../runtime/gfx';
import { TAU, clamp, posmod } from '../../runtime/math';
import { Node2D } from '../../runtime/node';
import { Vec2 } from '../../runtime/vec2';
import { pixelDisc, tintedTexture } from '../common/pixel_art';

export const BIG_SIZE = 48;
export const SMALL_SIZE = 16;
/** Below this width the icon is drawn as the edge strip. */
export const EDGE_WIDTH = 2;
const BACK_TINT = new Color(0.65, 0.65, 0.65);
/** An empty slot: the gem's silhouette, dark and see-through. */
const EMPTY_TINT = new Color(0.12, 0.14, 0.3, 0.75);
const EDGE_GREEN = Color.rgb8(40, 170, 90);
const EDGE_GOLD = Color.rgb8(250, 204, 72);
const BOB_HZ = 0.6;
const SPARKLE_SECONDS = 0.7;
const SPARKLE_COLOR = new Color(1, 1, 0.9);

const placeholders = new Map<number, HTMLCanvasElement | null>();

export class EmeraldIcon extends Node2D {
  /** Turns per second. */
  spinSpeed = 1;
  /** 16 px slot icon instead of the 48 px face. */
  small = false;
  /** Gentle up-and-down float. */
  bob = true;
  /** Draw an empty slot (dim outline) instead of the gem. */
  empty = false;
  /** Spin angle in radians; 0 = face-on. */
  phase = 0;

  private clock = 0;
  private sparkleLeft = 0;
  private sparklePoints: Vec2[] = [];

  constructor(opts: { small?: boolean; empty?: boolean; bob?: boolean; spinSpeed?: number; phase?: number } = {}) {
    super('EmeraldIcon');
    this.small = opts.small ?? false;
    this.empty = opts.empty ?? false;
    this.bob = opts.bob ?? true;
    this.spinSpeed = opts.spinSpeed ?? 1;
    this.phase = opts.phase ?? 0;
  }

  override process(delta: number): void {
    this.advance(delta);
  }

  /** One step of the spin, bob and sparkle clocks (process() calls it). */
  advance(delta: number): void {
    if (this.spinSpeed !== 0 && !this.empty) this.phase = (this.phase + TAU * this.spinSpeed * delta) % TAU;
    this.clock += delta;
    if (this.sparkleLeft > 0) this.sparkleLeft = Math.max(0, this.sparkleLeft - delta);
  }

  /** Twinkles around the gem for a moment (when it is first shown). */
  sparkle(): void {
    this.sparkleLeft = SPARKLE_SECONDS;
    this.sparklePoints = [];
    const r = this.faceSize() * 0.6;
    for (let i = 0; i < 6; i++) {
      const angle = (TAU * i) / 6 + 0.4;
      this.sparklePoints.push(new Vec2(Math.cos(angle), Math.sin(angle)).mul(r * (0.8 + 0.25 * (i % 2))));
    }
  }

  isSparkling(): boolean {
    return this.sparkleLeft > 0;
  }

  faceSize(): number {
    return this.small ? SMALL_SIZE : BIG_SIZE;
  }

  /** Width of the face in whole pixels for the current phase: even, never 0. */
  faceWidth(): number {
    return EmeraldIcon.widthFor(this.phase, this.faceSize());
  }

  static widthFor(angle: number, size: number): number {
    const even = 2 * Math.round(size * Math.abs(Math.cos(angle)) * 0.5);
    return Math.max(EDGE_WIDTH, even);
  }

  isBackFace(): boolean {
    return Math.cos(this.phase) < 0;
  }

  isEdgeOn(): boolean {
    return this.faceWidth() <= EDGE_WIDTH;
  }

  /** The face: the director's art when it has loaded, else a placeholder (null without a DOM). */
  faceTexture(): Texture | null {
    return Emeralds.icon(this.small) ?? EmeraldIcon.placeholderTexture(this.faceSize());
  }

  private bobOffset(): number {
    if (!this.bob) return 0;
    const amplitude = this.small ? 1 : 2;
    return Math.round(Math.sin(this.clock * TAU * BOB_HZ) * amplitude);
  }

  override draw(g: Gfx): void {
    const size = this.faceSize();
    const top = -size / 2 + this.bobOffset();
    const tex = this.faceTexture();
    if (this.empty) {
      // A dark gem-shaped hollow, face-on and still.
      if (tex) g.texture(tintedTexture(tex, EMPTY_TINT), new Vec2(-size * 0.5, top), { size: new Vec2(size, size), modulate: EMPTY_TINT });
      else pixelDisc(g, 0, top + size / 2, size / 2 - 1, EMPTY_TINT);
      return;
    }
    const width = this.faceWidth();
    if (width <= EDGE_WIDTH) {
      const stripTop = top + 2;
      const stripH = size - 4;
      g.rect(-1, stripTop, 1, stripH, EDGE_GREEN);
      g.rect(0, stripTop, 1, stripH, EDGE_GOLD);
    } else if (tex) {
      const back = this.isBackFace();
      // The back face is mirrored around the vertical axis, darkened.
      g.texture(back ? tintedTexture(tex, BACK_TINT) : tex, new Vec2(-width * 0.5, top), { size: new Vec2(width, size), flipH: back });
    } else {
      g.ellipse(new Vec2(0, top + size / 2), width / 2, size / 2, this.isBackFace() ? EDGE_GREEN.darkened(0.35) : EDGE_GREEN);
    }
    if (this.sparkleLeft > 0) {
      const t = this.sparkleLeft / SPARKLE_SECONDS;
      const color = SPARKLE_COLOR.withAlpha(t);
      for (let i = 0; i < this.sparklePoints.length; i++) {
        const p = this.sparklePoints[i]!.mul(1.2 - 0.2 * t)
          .round()
          .add(new Vec2(0, Math.round(top + size / 2)));
        const arm = (i + Math.floor(this.clock * 12)) % 2 === 0 ? 2 : 1;
        g.rect(p.x - arm, p.y, arm * 2 + 1, 1, color);
        g.rect(p.x, p.y - arm, 1, arm * 2 + 1, color);
      }
    }
  }

  /** A faceted green gem disc, size x size, lit from the top-left (cached; null without a DOM). */
  static placeholderTexture(size: number): HTMLCanvasElement | null {
    if (placeholders.has(size)) return placeholders.get(size)!;
    const canvas = makeCanvas(size, size);
    const ctx = canvas?.getContext('2d') ?? null;
    if (canvas && ctx) {
      const img = ctx.createImageData(size, size);
      const set = (x: number, y: number, c: Color) => {
        const i = (y * size + x) * 4;
        img.data[i] = c.r8;
        img.data[i + 1] = c.g8;
        img.data[i + 2] = c.b8;
        img.data[i + 3] = c.a8;
      };
      const c = (size - 1) / 2;
      const r = size / 2 - 0.5;
      const outline = Color.rgb8(16, 40, 34);
      const table = Color.rgb8(120, 236, 160);
      const light = new Vec2(-0.7, -0.7).normalized();
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const d = new Vec2(x - c, y - c);
          const dist = d.length();
          if (dist > r) continue;
          if (dist > r - 1.2) {
            set(x, y, outline);
            continue;
          }
          let color: Color;
          if (dist < r * 0.42) {
            color = table;
          } else {
            // Eight facets around the table, shaded by how much each faces the light.
            const sector = posmod(Math.round(Math.atan2(d.y, d.x) / (TAU / 8)), 8);
            const a = (sector * TAU) / 8;
            const normal = new Vec2(Math.cos(a), Math.sin(a));
            const lit = clamp(0.55 + 0.45 * normal.dot(light), 0.2, 1);
            color = Color.rgb8(30, 120, 70).lerp(Color.rgb8(90, 220, 130), lit);
            if (dist > r * 0.8) color = color.darkened(0.18);
          }
          set(x, y, color);
        }
      }
      // A small white glint on the upper-left facet.
      const gx = Math.round(c - r * 0.45);
      const gy = Math.round(c - r * 0.45);
      set(gx, gy, Color.WHITE);
      if (size >= 32) {
        set(gx + 1, gy, new Color(1, 1, 1, 0.8));
        set(gx, gy + 1, new Color(1, 1, 1, 0.8));
      }
      ctx.putImageData(img, 0, 0);
    }
    const out = canvas && ctx ? canvas : null;
    placeholders.set(size, out);
    return out;
  }
}
