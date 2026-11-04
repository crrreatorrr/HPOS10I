// Sproto's look. Uses the art agent's sprite sheets when they exist, otherwise
// draws a placeholder in code after docs/DESIGN.md: a round head split blue /
// yellow with 2-3 soft upward spikes growing only from the blue back half
// (the yellow face half stays smooth), big round eyes, a red clown nose and
// grin, a small blue body with yellow accents, a red collar with a
// golden-ticket badge, and short arms and legs; or, in the ball states, a blue
// ball with a yellow half and a red nose dot. Relic skins swap the colours
// (Tidebreaker also wears a gold belt, and its ball has a gold stripe instead
// of the yellow half). Rotates with the ground angle, mirrors with facing and
// blinks while invincible. Power-ups show as a bubble (shield), orbiting
// sparkles (invincibility) and a faint speed trail (speed shoes). Child of the
// Player node; local origin = hitbox centre, feet at +height radius.
//
// Sprite sheets (the Godot SpriteFrames .tres cannot be read here):
// `<name>_sheet.png` holds 64x64 cells, one animation per row. An optional
// `<name>_sheet.json` beside it describes the rows:
//   { "cell": [64, 64], "animations": { "idle": { "row": 0, "frames": 4,
//     "fps": 8, "loop": true }, ... } }
// Without it the rows are idle, run, jump, hurt (docs/CONTRACTS.md) and each
// row's frame count is the number of non-empty cells.

import { Settings } from '../core/settings';
import { Tuning } from '../core/tuning';
import { RelicLoadout } from '../hub/relic_loadout';
import { assetExists, assetImage } from '../runtime/assets';
import { Color } from '../runtime/color';
import { context2d, makeCanvas, type Gfx, type Texture } from '../runtime/gfx';
import { degToRad, fposmod, posmod, TAU } from '../runtime/math';
import { Node2D } from '../runtime/node';
import { Rect2, Vec2 } from '../runtime/vec2';
import { Effects } from './effects';
import type { Player, PlayerState } from './player';

// --- Sprite sheets ------------------------------------------------------------------

/** Every JSON file under assets/sprites (sheet layouts, anchors), by repository path. */
const SPRITE_JSON = import.meta.glob('/assets/sprites/**/*.json', { import: 'default', eager: true }) as Record<
  string,
  unknown
>;

/** Parsed JSON at a repository path ("assets/sprites/.../anchors.json"), or null. */
export function spriteJson(path: string): unknown {
  return SPRITE_JSON[path.startsWith('/') ? path : `/${path}`] ?? null;
}

export interface SheetAnim {
  row: number;
  /** 0 = count the non-empty cells of the row once the image has loaded. */
  frames: number;
  fps: number;
  loop: boolean;
}

/** Godot's SpriteFrames default speed. */
const DEFAULT_FPS = 5;

/** A sprite sheet of equal cells, one animation per row (stand-in for SpriteFrames). */
export class SheetFrames {
  readonly cell: Vec2;
  private readonly anims = new Map<string, SheetAnim>();
  private counted = false;
  private tints = new Map<string, Texture>();

  private constructor(
    readonly path: string,
    layout: unknown,
    defaultRows: readonly string[],
  ) {
    let cell = new Vec2(64, 64);
    const data = isRecord(layout) ? layout : {};
    const c = data.cell;
    if (Array.isArray(c) && c.length >= 2) cell = new Vec2(Number(c[0]) || 64, Number(c[1]) || 64);
    this.cell = cell;
    const anims = isRecord(data.animations) ? data.animations : null;
    if (anims) {
      let row = 0;
      for (const [name, raw] of Object.entries(anims)) {
        const a = isRecord(raw) ? raw : {};
        this.anims.set(name, {
          row: typeof a.row === 'number' ? a.row : row,
          frames: typeof a.frames === 'number' ? Math.max(0, Math.floor(a.frames)) : 0,
          fps: typeof a.fps === 'number' ? a.fps : DEFAULT_FPS,
          loop: a.loop !== false,
        });
        row++;
      }
    } else {
      defaultRows.forEach((name, row) => this.anims.set(name, { row, frames: 0, fps: DEFAULT_FPS, loop: true }));
    }
  }

  /** The sheet at `sheetPath` (a .png) with its optional .json layout, or null when missing. */
  static load(sheetPath: string, defaultRows: readonly string[]): SheetFrames | null {
    if (!assetExists(sheetPath)) return null;
    return new SheetFrames(sheetPath, spriteJson(sheetPath.replace(/\.png$/, '.json')), defaultRows);
  }

  /** Null until the image has loaded. */
  image(): HTMLImageElement | null {
    const img = assetImage(this.path);
    if (img && !this.counted) this.countFrames(img);
    return img;
  }

  animationNames(): string[] {
    return [...this.anims.keys()];
  }

  hasAnimation(name: string): boolean {
    const a = this.anims.get(name);
    if (!a) return false;
    this.image();
    return !this.counted || a.frames > 0;
  }

  frameCount(name: string): number {
    this.image();
    return Math.max(this.anims.get(name)?.frames ?? 0, 0);
  }

  anim(name: string): SheetAnim | null {
    return this.anims.get(name) ?? null;
  }

  region(name: string, frame: number): Rect2 | null {
    const a = this.anims.get(name);
    if (!a || a.frames <= 0) return null;
    const f = posmod(frame, a.frames);
    return new Rect2(f * this.cell.x, a.row * this.cell.y, this.cell.x, this.cell.y);
  }

  /** The sheet multiplied by `tint` (cached); the plain image for white or without a canvas. */
  texture(tint: Color | null): Texture | null {
    const img = this.image();
    if (!img || !tint || tint.equals(Color.WHITE)) return img;
    const key = tint.css();
    const known = this.tints.get(key);
    if (known) return known;
    const canvas = makeCanvas(img.width, img.height);
    if (!canvas) return img;
    const ctx = context2d(canvas);
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tint.withAlpha(1).css();
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);
    this.tints.set(key, canvas);
    return canvas;
  }

  private countFrames(img: HTMLImageElement): void {
    this.counted = true;
    const cols = Math.floor(img.width / this.cell.x);
    let pixels: Uint8ClampedArray | null = null;
    const canvas = makeCanvas(img.width, img.height);
    if (canvas) {
      try {
        const ctx = context2d(canvas);
        ctx.drawImage(img, 0, 0);
        pixels = ctx.getImageData(0, 0, img.width, img.height).data;
      } catch {
        pixels = null;
      }
    }
    for (const a of this.anims.values()) {
      if (a.frames > 0) continue;
      if ((a.row + 1) * this.cell.y > img.height) continue;
      let n = cols;
      if (pixels) {
        while (n > 0 && cellEmpty(pixels, img.width, (n - 1) * this.cell.x, a.row * this.cell.y, this.cell)) n--;
      }
      a.frames = n;
    }
  }
}

function cellEmpty(px: Uint8ClampedArray, width: number, x0: number, y0: number, cell: Vec2): boolean {
  for (let y = y0; y < y0 + cell.y; y++) {
    for (let x = x0; x < x0 + cell.x; x++) {
      if (px[(y * width + x) * 4 + 3]! > 0) return false;
    }
  }
  return true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** AnimatedSprite2D stand-in: plays one animation of a SheetFrames, centred on its origin. */
export class SheetSprite extends Node2D {
  animation = '';
  frame = 0;
  /** 0 = frames are set by hand. */
  speedScale = 1;
  /** Multiplies the sheet (relic skin tints). */
  tint: Color | null = null;
  private time = 0;

  constructor(
    public frames: SheetFrames,
    name = 'Sprite',
  ) {
    super(name);
  }

  play(anim: string): void {
    if (anim === this.animation) return;
    this.animation = anim;
    this.frame = 0;
    this.time = 0;
  }

  /** True once the sheet image has loaded. */
  loaded(): boolean {
    return this.frames.image() !== null;
  }

  override process(delta: number): void {
    const a = this.frames.anim(this.animation);
    if (!a || this.speedScale <= 0 || a.fps <= 0) return;
    const count = this.frames.frameCount(this.animation);
    if (count <= 0) return;
    this.time += delta * a.fps * this.speedScale;
    while (this.time >= 1) {
      this.time -= 1;
      if (this.frame + 1 < count) this.frame++;
      else if (a.loop) this.frame = 0;
    }
  }

  /** Texture and source rectangle of the frame on show, or null. */
  current(): { tex: Texture; region: Rect2 } | null {
    const tex = this.frames.texture(this.tint);
    const region = this.frames.region(this.animation, this.frame);
    return tex && region ? { tex, region } : null;
  }

  override draw(g: Gfx): void {
    const c = this.current();
    if (!c) return;
    g.texture(c.tex, new Vec2(-Math.round(c.region.w / 2), -Math.round(c.region.h / 2)), { region: c.region });
  }
}

// --- Visual -------------------------------------------------------------------------

const SHEET_DIR = 'assets/sprites/common/sproto';
const SHEET_PATH = `${SHEET_DIR}/sproto_sheet.png`;
/** Golden Sproto art. Missing until the 16-bit pass; the placeholder swaps blue/yellow for gold meanwhile. */
const GOLDEN_SHEET_PATH = `${SHEET_DIR}/golden_sproto_sheet.png`;
/** Tidebreaker Sproto art. Missing until the 16-bit pass, like Golden. */
const TIDEBREAKER_SHEET_PATH = `${SHEET_DIR}/tidebreaker_sproto_sheet.png`;
/** Rows of a sheet without a .json layout (docs/CONTRACTS.md). */
const DEFAULT_ROWS = ['idle', 'run', 'jump', 'hurt'];
/** Feet centre inside a 64x64 frame cell, relative to the cell centre. */
export const CELL_FEET_OFFSET = 28;
export const BLINK_PERIOD_FRAMES = 4;
/** Rotation easing rate (1/s). */
const ROTATION_SMOOTHING = 30;
/** Placeholder head size, and how far its centre sits above the feet. */
export const HEAD_RADIUS = 8.5;
export const HEAD_HEIGHT = 23;

/** Head spikes as [base, tip] from the head centre (facing right): all on the blue back half, pointing up. */
const SPIKES: readonly [Vec2, Vec2][] = [
  [new Vec2(-2.6, -7.0), new Vec2(-2.4, -13.5)],
  [new Vec2(-5.2, -5.4), new Vec2(-6.0, -12.0)],
  [new Vec2(-7.0, -3.0), new Vec2(-8.0, -9.4)],
];
const SPIKE_HALF_WIDTH = 2.2;

const OUTLINE = new Color(0.1, 0.11, 0.2);
const BLUE = new Color(0.22, 0.52, 1.0);
const BLUE_SHADE = new Color(0.12, 0.34, 0.78);
const YELLOW = new Color(1.0, 0.84, 0.2);
const RED = new Color(0.93, 0.18, 0.2);
const GOLD = new Color(1.0, 0.78, 0.16);
const GOLD_DARK = new Color(0.7, 0.45, 0.05);
/** Tidebreaker sea-green / teal, and the belt plate's shine. */
const SEA = new Color(0.12, 0.72, 0.62);
const SEA_SHADE = new Color(0.05, 0.47, 0.44);
const GOLD_SHINE = new Color(1.0, 0.95, 0.7);
const WHITE = new Color(1, 1, 1);
const BLACK = new Color(0.04, 0.04, 0.07);
const NOSE_SHINE = new Color(1.0, 0.7, 0.7);
const PUFF = new Color(0.85, 0.85, 0.9, 0.8);
const NOBU_BODY = new Color(0.95, 0.88, 0.74);
const NOBU_FACE = new Color(0.98, 0.93, 0.84);
const NOBU_SHADE = new Color(0.55, 0.36, 0.2);

/** Frames of the walk cycle and of the rolling ball. */
export const WALK_FRAMES = 6;
export const ROLL_FRAMES = 8;

type ArmPair = [Vec2, Vec2][];

export class PlayerVisual extends Node2D {
  /** Current frame of the walk/run or roll cycle, advanced on physics ticks at the Guide's rate. */
  animFrame = 0;
  readonly player: Player;
  /** The sprite sheet node, or null when no sheet exists (placeholder drawing). */
  readonly sprite: SheetSprite | null = null;

  private ticksLeft = 0;
  private spin = 0;
  private cycle = 0;
  private baseFrames: SheetFrames | null = null;
  private shownSkin: string | null = null;
  private bodyColor = BLUE;
  private faceColor = YELLOW;
  private shadeColor = BLUE_SHADE;
  private noseColor = RED;

  constructor(player: Player) {
    super('Visual');
    this.player = player;
    const frames = SheetFrames.load(SHEET_PATH, DEFAULT_ROWS);
    if (frames) {
      this.baseFrames = frames;
      this.sprite = new SheetSprite(frames, 'Sprite');
      this.addChild(this.sprite, 0);
    }
    this.addChild(new PowerUpAura(this));
    this.addChild(new SpeedTrail(this));
  }

  /**
   * Ticks each animation frame is shown for, from the community Physics Guide:
   * walking and running max(0, 8 - |gsp|) + 1, rolling max(0, 4 - |gsp|) + 1
   * (|gsp| truncated to whole pixels), so the feet turn faster the faster he
   * goes. The spin dash spins at the full rate. 0 = the sprite's own rate.
   */
  static frameTicks(state: PlayerState | string, groundSpeed: number): number {
    const speed = Math.trunc(Math.abs(groundSpeed));
    switch (state) {
      case 'run':
      case 'skid':
        return Math.max(0, 8 - speed) + 1;
      case 'roll':
      case 'jump':
      case 'dropdash':
      case 'airdash':
        return Math.max(0, 4 - speed) + 1;
      case 'spindash':
        return 1;
    }
    return 0;
  }

  /** Charge run: the legs spin from a walk's rate up to every tick at full charge. */
  static peelOutTicks(charge: number): number {
    return Math.max(1, 6 - Math.floor(Math.min(Math.max(charge, 0), 1) * 5));
  }

  override physicsProcess(): void {
    const p = this.player;
    const speed = p.grounded ? p.groundSpeed : p.velocity.x;
    const ticks = p.state === 'peelout' ? PlayerVisual.peelOutTicks(p.moves.peelOutCharge()) : PlayerVisual.frameTicks(p.state, speed);
    if (ticks === 0) return;
    if (this.ticksLeft <= 1) {
      this.animFrame += 1;
      this.ticksLeft = ticks;
    } else {
      this.ticksLeft -= 1;
    }
  }

  override process(delta: number): void {
    const p = this.player;
    this.applySkin();
    // The placeholder's leg swing and ball spin follow the frame counter.
    this.cycle = (TAU * posmod(this.animFrame, WALK_FRAMES)) / WALK_FRAMES;
    this.spin = (TAU * posmod(this.animFrame, ROLL_FRAMES)) / ROLL_FRAMES;

    this.scale = new Vec2(p.facing, 1);
    // The sensor angle can step a few degrees when A/B swap on curves; ease the
    // drawn rotation so the body turns smoothly (physics keeps the raw angle).
    const target = -degToRad(p.groundAngle);
    if (this.isBall() || p.state === 'dead') this.rotation = 0;
    else this.rotation = lerpAngle(this.rotation, target, 1 - Math.exp(-ROTATION_SMOOTHING * delta));
    // Blink by physics ticks of invincibility left, the same at any refresh rate.
    this.visible =
      !p.isInvincible() || posmod(p.invincibleFramesLeft(), BLINK_PERIOD_FRAMES * 2) < BLINK_PERIOD_FRAMES;

    if (this.sprite) this.updateSprite();
  }

  /** The ball states (is_attacking() without the invincibility power-up, which keeps him on his feet). */
  isBall(): boolean {
    return isBallState(this.player.state);
  }

  /** Name of the animation the current state wants, before fallbacks. */
  wantedAnimation(): string {
    const p = this.player;
    if (p.pose !== '') return p.pose;
    switch (p.state) {
      case 'run':
        return Math.abs(p.groundSpeed) >= Tuning.physics.top_speed ? 'run' : 'walk';
      case 'idle':
        return p.crouching ? 'crouch' : 'idle';
      case 'dropdash':
        return 'jump';
    }
    return p.state;
  }

  /** Feet y in local space for the current hitbox. */
  feetY(): number {
    return this.player.getRadii().y;
  }

  /** True when the placeholder is drawn (no sheet, or it has not loaded yet). */
  drawsPlaceholder(): boolean {
    return !this.sprite || !this.sprite.loaded();
  }

  // --- Sprite frames ------------------------------------------------------------------

  private updateSprite(): void {
    const sprite = this.sprite!;
    const frames = sprite.frames;
    const p = this.player;
    let anim = this.wantedAnimation();
    let speedScale = 1;
    // Derive missing animations as the contract describes.
    if (!frames.hasAnimation(anim)) {
      switch (anim) {
        case 'walk':
          anim = 'run';
          speedScale = 0.5;
          break;
        case 'peelout':
          anim = 'run';
          break;
        case 'roll':
        case 'spindash':
        case 'airdash':
          anim = 'jump';
          speedScale = p.state === 'spindash' ? 2 : 1;
          break;
        case 'dead':
          anim = 'hurt';
          break;
        case 'skid':
        case 'crouch':
        case 'spring':
          anim = p.state === 'spring' ? 'run' : 'idle';
          break;
        default:
          anim = 'idle';
      }
    }
    sprite.visible = frames.hasAnimation(anim);
    if (!sprite.visible) return;
    sprite.play(anim);
    // Walk, run and roll frames step at the Guide's rate (frameTicks()); the
    // other animations keep the rate in the sheet.
    const guided = PlayerVisual.frameTicks(p.state, p.groundSpeed) > 0 || p.state === 'peelout';
    if (guided && p.pose === '') {
      sprite.speedScale = 0;
      sprite.frame = posmod(this.animFrame, Math.max(frames.frameCount(anim), 1));
    } else {
      sprite.speedScale = speedScale;
    }
    sprite.position = new Vec2(0, Math.round(this.feetY() - CELL_FEET_OFFSET));
  }

  // --- Skins ----------------------------------------------------------------------

  skin(): string {
    return RelicLoadout.resolve().skin;
  }

  /**
   * Golden uses golden_sproto_sheet.png and Tidebreaker tidebreaker_sproto_sheet.png
   * when they exist. Otherwise the base sheet is tinted, and the placeholder
   * swaps colours (gold for Golden, sea-green blue parts with the yellow face
   * kept for Tidebreaker).
   */
  private applySkin(): void {
    const skin = this.skin();
    switch (skin) {
      case 'golden':
        this.bodyColor = GOLD;
        this.faceColor = GOLD_DARK;
        this.shadeColor = GOLD_DARK;
        this.noseColor = RED;
        break;
      case 'nobu':
        this.bodyColor = NOBU_BODY;
        this.faceColor = NOBU_FACE;
        this.shadeColor = NOBU_SHADE;
        this.noseColor = BLACK;
        break;
      case 'tidebreaker':
        this.bodyColor = SEA;
        this.faceColor = YELLOW;
        this.shadeColor = SEA_SHADE;
        this.noseColor = RED;
        break;
      default:
        this.bodyColor = BLUE;
        this.faceColor = YELLOW;
        this.shadeColor = BLUE_SHADE;
        this.noseColor = RED;
    }
    const sprite = this.sprite;
    if (!sprite || skin === this.shownSkin) return;
    this.shownSkin = skin;
    const path = skinSheetPath(skin);
    const own = path !== '' ? SheetFrames.load(path, DEFAULT_ROWS) : null;
    if (own) {
      sprite.frames = own;
      sprite.tint = null;
      return;
    }
    if (this.baseFrames) sprite.frames = this.baseFrames;
    switch (skin) {
      case 'golden':
        sprite.tint = new Color(1.0, 0.84, 0.38);
        break;
      case 'nobu':
        sprite.tint = new Color(1.0, 0.86, 0.68);
        break;
      case 'tidebreaker':
        sprite.tint = new Color(0.62, 1.0, 0.9);
        break;
      default:
        sprite.tint = null;
    }
  }

  // --- Placeholder drawing ----------------------------------------------------------

  override draw(g: Gfx): void {
    if (!this.drawsPlaceholder()) return;
    this.applySkin();
    if (this.isBall()) this.drawBall(g);
    else this.drawSproto(g);
  }

  private drawBall(g: Gfx): void {
    const p = this.player;
    const r = p.getRadii().y - 1;
    const feet = this.feetY();
    const center = new Vec2(0, feet - r - 1);
    g.circle(center, r + 1, OUTLINE);
    g.circle(center, r, this.bodyColor);
    if (this.skin() === 'tidebreaker') {
      // Sea-green ball with a gold stripe through the middle, spinning with it.
      const along = Vec2.fromAngle(this.spin);
      g.line(center.sub(along.mul(r)), center.add(along.mul(r)), OUTLINE, 4.2);
      g.line(center.sub(along.mul(r - 0.6)), center.add(along.mul(r - 0.6)), GOLD, 2.6);
    } else {
      // Yellow half and red nose dot, spinning with the ball.
      const half: Vec2[] = [];
      for (let i = 0; i < 13; i++) half.push(center.add(Vec2.fromAngle(this.spin + (Math.PI * i) / 12).mul(r)));
      g.polygon(half, this.faceColor);
    }
    g.circle(center.add(Vec2.fromAngle(this.spin + Math.PI * 0.5).mul(r * 0.55)), 2.2, this.noseColor);
    if (p.state === 'spindash') {
      // Dust puffs behind the ball.
      for (let i = 0; i < 3; i++) {
        const puff = new Vec2(-r - 3 - i * 4, feet - 3 - (i % 2) * 2);
        g.circle(puff, 2.5 - i * 0.5, PUFF);
      }
    }
  }

  /** Head centre of the placeholder (local space, facing right), for the accessory and cape. */
  headPoint(): Vec2 {
    const feet = this.feetY();
    if (this.isBall()) {
      // On top of the ball, so a hat sits on it.
      return new Vec2(1, feet - this.player.getRadii().y * 2 + HEAD_RADIUS - 1);
    }
    return this.headCenter(feet);
  }

  private lean(): number {
    const p = this.player;
    if (p.state === 'skid') return -2.5;
    if (p.state === 'run') return Math.min(Math.max(Math.abs(p.groundSpeed) * 0.35, 0), 2.5);
    if (p.state === 'peelout') return 1 + 2 * p.moves.peelOutCharge();
    return 0;
  }

  private headCenter(feet: number): Vec2 {
    const drop = this.player.crouching ? 6 : 0;
    return new Vec2(1 + this.lean(), feet - HEAD_HEIGHT + drop);
  }

  private drawSproto(g: Gfx): void {
    const p = this.player;
    const feet = this.feetY();
    const state = p.state;
    const head = this.headCenter(feet);
    const body = new Vec2(this.lean() * 0.4, feet - 9 + (p.crouching ? 3 : 0));
    const hurt = state === 'hurt' || state === 'dead';
    const skin = this.skin();

    // Legs and yellow shoes.
    const swing = Math.sin(this.cycle) * (state === 'run' ? 4 : 0);
    if (state === 'peelout') {
      this.drawSpinningLegs(g, body, feet);
    } else {
      let legs: [number, number][] = [
        [-2.5, -2.5 - swing],
        [2.5, 2.5 + swing],
      ];
      if (hurt) {
        legs = [
          [-2.5, -6],
          [2.5, 6],
        ];
      } else if (state === 'skid') {
        legs = [
          [-2.5, -5],
          [2.5, 0],
        ];
      } else if (p.crouching) {
        legs = [
          [-2.5, -4],
          [2.5, 4],
        ];
      }
      for (const [topX, footX] of legs) this.drawLeg(g, body.add(new Vec2(topX, 3)), new Vec2(footX, feet - 1.5), 1);
    }

    // Body with a yellow belly.
    g.ellipse(body, 5.8, 5.6, OUTLINE);
    g.ellipse(body, 4.9, 4.7, this.bodyColor);
    g.ellipse(body.add(new Vec2(1.5, 0.8)), 2.3, 2.8, this.faceColor);
    if (skin === 'tidebreaker') this.drawBelt(g, body);

    // Short arms.
    const armSwing = -swing * 0.6;
    let arms: ArmPair = [
      [new Vec2(-3.5, -1.5), new Vec2(-6.5, 2.5 - armSwing)],
      [new Vec2(3.5, -1.5), new Vec2(6.5, 2.5 + armSwing)],
    ];
    if (state === 'spring' || p.pose === 'victory') arms[1] = [new Vec2(3.5, -1.5), new Vec2(6.0, -8.0)];
    if (state === 'peelout') {
      // Arms thrown back, ready to burst off.
      arms = [
        [new Vec2(-3.5, -1.5), new Vec2(-8.0, 0.5)],
        [new Vec2(3.5, -1.5), new Vec2(-1.0, 3.0)],
      ];
    }
    if (hurt) {
      arms = [
        [new Vec2(-3.5, -1.5), new Vec2(-7.5, -5.0)],
        [new Vec2(3.5, -1.5), new Vec2(7.5, -5.0)],
      ];
    }
    for (const [from, to] of arms) {
      g.line(body.add(from), body.add(to), OUTLINE, 3.6);
      g.line(body.add(from), body.add(to), this.bodyColor, 1.8);
      g.circle(body.add(to), 1.4, this.faceColor);
    }

    // Red collar with a tiny golden-ticket badge.
    const collar = new Vec2(body.x, head.y + HEAD_RADIUS);
    g.line(collar.add(new Vec2(-4.5, 0)), collar.add(new Vec2(4.5, 0)), OUTLINE, 3.6);
    g.line(collar.add(new Vec2(-4.0, 0)), collar.add(new Vec2(4.0, 0)), RED, 2.2);
    g.rect(collar.x + 1.0, collar.y - 0.5, 3.0, 2.2, GOLD_DARK);
    g.rect(collar.x + 1.5, collar.y, 2.0, 1.2, GOLD);

    // Soft upward spikes, only on the blue back half (the yellow face half has
    // none). The Nobu suit replaces them with ears (cape.ts).
    if (skin !== 'nobu') {
      for (const [base, tip] of SPIKES) this.drawSpike(g, head.add(base), head.add(tip), OUTLINE, 1);
      for (const [base, tip] of SPIKES) this.drawSpike(g, head.add(base), head.add(tip), this.bodyColor, 0);
    }

    // Round head, split down the middle: blue back half, yellow face half.
    g.circle(head, HEAD_RADIUS + 1, OUTLINE);
    halfDisc(g, head, HEAD_RADIUS, Math.PI, this.bodyColor);
    halfDisc(g, head, HEAD_RADIUS, 0, this.faceColor);

    // Big round eyes: white, black pupil looking ahead, white shine.
    const eyes: [Vec2, number][] = [
      [new Vec2(1.0, -2.0), 3.0],
      [new Vec2(5.5, -2.0), 2.6],
    ];
    for (const [offset, r] of eyes) {
      const c = head.add(offset);
      g.circle(c, r + 0.7, OUTLINE);
      g.circle(c, r, WHITE);
      if (hurt) {
        g.line(c.add(new Vec2(-1.2, -1.2)), c.add(new Vec2(1.2, 1.2)), BLACK, 1);
        g.line(c.add(new Vec2(1.2, -1.2)), c.add(new Vec2(-1.2, 1.2)), BLACK, 1);
      } else {
        g.circle(c.add(new Vec2(0.8, 0.3)), r * 0.48, BLACK);
        g.circle(c.add(new Vec2(0.2, -0.6)), r * 0.2, WHITE);
      }
    }

    // Wide red grin (a simple curve) and a round red clown nose.
    const grin = head.add(new Vec2(3, 1));
    if (hurt) g.arc(grin.add(new Vec2(0, 4.5)), 3, Math.PI * 1.2, Math.PI * 1.8, RED, 1.4);
    else g.arc(grin, 4.5, Math.PI * 0.15, Math.PI * 0.85, RED, 1.6);
    const nose = head.add(new Vec2(8, 0.8));
    g.circle(nose, 2.6, OUTLINE);
    g.circle(nose, 2.0, this.noseColor);
    g.circle(head.add(new Vec2(7.5, 0.2)), 0.6, NOSE_SHINE);
  }

  private drawLeg(g: Gfx, top: Vec2, foot: Vec2, alpha: number): void {
    const draw = () => {
      g.line(top, foot, OUTLINE, 4);
      g.line(top, foot, this.bodyColor, 2.2);
      g.ellipse(foot.add(new Vec2(1, 0)), 2.6, 1.6, OUTLINE);
      g.ellipse(foot.add(new Vec2(1, 0)), 2.0, 1.1, this.faceColor);
    };
    if (alpha >= 1) draw();
    else g.withAlpha(alpha, draw);
  }

  /**
   * Charge run: the legs whirl in place around a wheel under the body, faster
   * with the charge, with a blurred ring once they are a blur.
   */
  private drawSpinningLegs(g: Gfx, body: Vec2, feet: number): void {
    const charge = this.player.moves.peelOutCharge();
    const hub = new Vec2(body.x + 1, feet - 4);
    const radii = new Vec2(5, 2.6);
    if (charge > 0.35) {
      // The blur: a ring of body colour and a shoe-coloured smear on its front.
      const blur = Math.min((charge - 0.35) / 0.65, 1);
      g.withAlpha(0.35 + 0.35 * blur, () => {
        g.ellipse(hub, radii.x + 2, radii.y + 1.6, OUTLINE);
        g.ellipse(hub, radii.x + 1, radii.y + 0.8, this.bodyColor);
        g.ellipse(hub.add(new Vec2(1.5, 0.8)), radii.x - 1, radii.y - 0.8, this.faceColor);
      });
    }
    const legs = charge > 0.8 ? 4 : 2;
    for (let k = 0; k < legs; k++) {
      const a = this.spin + (k * TAU) / legs;
      const foot = hub.add(new Vec2(Math.cos(a) * radii.x, Math.sin(a) * radii.y));
      const top = body.add(new Vec2(k % 2 === 0 ? -2.5 : 2.5, 3));
      // The feet on the far side of the wheel are fainter.
      this.drawLeg(g, top, foot, Math.sin(a) < 0 ? 0.55 : 1);
    }
  }

  /** Tidebreaker's gold championship belt across the waist, with a round wave-stamped plate. */
  private drawBelt(g: Gfx, body: Vec2): void {
    const waist = body.add(new Vec2(0, 1.6));
    g.rect(waist.x - 5.6, waist.y - 1.7, 11.2, 3.4, OUTLINE);
    g.rect(waist.x - 5.0, waist.y - 1.1, 10.0, 2.2, GOLD);
    g.line(waist.add(new Vec2(-5, 0.9)), waist.add(new Vec2(5, 0.9)), GOLD_DARK, 0.6);
    const plate = waist.add(new Vec2(1.6, 0));
    g.circle(plate, 3.0, OUTLINE);
    g.circle(plate, 2.4, GOLD);
    // The wave: two small crests across the plate.
    g.arc(plate.add(new Vec2(-0.9, 0.5)), 0.9, Math.PI, TAU, GOLD_DARK, 0.7);
    g.arc(plate.add(new Vec2(0.9, 0.5)), 0.9, Math.PI, TAU, GOLD_DARK, 0.7);
    g.circle(plate.add(new Vec2(-1.0, -1.1)), 0.5, GOLD_SHINE);
  }

  /** One soft spike: a tapered blade with a rounded tip, its back edge shaded. `grow` widens it (outline pass). */
  private drawSpike(g: Gfx, base: Vec2, tip: Vec2, color: Color, grow: number): void {
    const along = tip.sub(base).normalized();
    const side = along.orthogonal();
    const half = SPIKE_HALF_WIDTH + grow;
    const tipHalf = 0.9 + grow * 0.5;
    g.polygon([base.add(side.mul(half)), tip.add(side.mul(tipHalf)), tip.sub(side.mul(tipHalf)), base.sub(side.mul(half))], color);
    g.circle(tip, 1.1 + grow, color);
    if (grow === 0) {
      // Shade the back (head-outward) edge.
      const back = side.x < 0 ? side : side.neg();
      g.polygon([base.add(back.mul(half)), tip.add(back.mul(0.9)), tip, base], this.shadeColor);
    }
  }
}

const BALL_STATES: readonly string[] = ['jump', 'roll', 'spindash', 'dropdash', 'airdash'];

/** True for the states drawn as a ball. */
export function isBallState(state: string): boolean {
  return BALL_STATES.includes(state);
}

/** Dedicated sheet for a skin, or '' when the skin only tints the base. */
function skinSheetPath(skin: string): string {
  switch (skin) {
    case 'golden':
      return GOLDEN_SHEET_PATH;
    case 'tidebreaker':
      return TIDEBREAKER_SHEET_PATH;
  }
  return '';
}

/** Filled half disc: the half on the side of `facingAngle` (radians). */
function halfDisc(g: Gfx, center: Vec2, r: number, facingAngle: number, color: Color): void {
  const points: Vec2[] = [];
  for (let i = 0; i <= 16; i++) points.push(center.add(Vec2.fromAngle(facingAngle - Math.PI * 0.5 + (Math.PI * i) / 16).mul(r)));
  g.polygon(points, color);
}

/** Godot lerp_angle: the short way round. */
export function lerpAngle(from: number, to: number, t: number): number {
  const diff = fposmod(to - from + Math.PI, TAU) - Math.PI;
  return from + diff * t;
}

// --- Power-ups ---------------------------------------------------------------------

const BUBBLE = new Color(0.55, 0.85, 1.0, 0.16);
const BUBBLE_RIM = new Color(0.7, 0.92, 1.0, 0.7);
const BUBBLE_SHINE = new Color(1, 1, 1, 0.75);
const SPARKLE_COLORS = [new Color(1, 1, 1), new Color(1.0, 0.92, 0.4), new Color(1.0, 0.55, 0.85), new Color(0.5, 0.95, 1.0)];
const SPARKLES = 5;

/** Shield bubble and invincibility sparkles, drawn over Sproto (Visual space). */
class PowerUpAura extends Node2D {
  private frame = 0;

  constructor(private readonly visual: PlayerVisual) {
    super('PowerUps');
    this.zIndex = 3;
  }

  override physicsProcess(): void {
    this.frame++;
  }

  override draw(g: Gfx): void {
    const moves = this.visual.player.moves;
    const ball = this.visual.isBall();
    const feet = this.visual.feetY();
    const center = new Vec2(0, Math.round(ball ? feet - this.visual.player.getRadii().y : feet - 16));
    const radius = ball ? 17 : 20;
    if (moves.shield) {
      // A translucent bubble that wobbles slightly, with a fixed shine.
      const wobble = Math.sin(this.frame * 0.15) * 0.8;
      g.ellipse(center, radius + wobble, radius - wobble, BUBBLE);
      g.circle(center, radius, BUBBLE_RIM, false, 1);
      g.arc(center, radius - 3, Math.PI * 1.1, Math.PI * 1.4, BUBBLE_SHINE, 1.5);
      const glint = center.add(Vec2.fromAngle(this.frame * 0.05).mul(radius - 1)).round();
      g.rect(glint.x - 1, glint.y - 1, 2, 2, BUBBLE_SHINE);
    }
    if (moves.invincible()) {
      // Little four-point stars orbiting him, twinkling in turn.
      for (let i = 0; i < SPARKLES; i++) {
        const a = this.frame * 0.12 + (i * TAU) / SPARKLES;
        const at = center.add(new Vec2(Math.cos(a) * (radius - 2), Math.sin(a) * (radius - 4))).round();
        const arm = 1 + ((this.frame + i * 3) % 8 < 4 ? 2 : 1);
        const color = SPARKLE_COLORS[(i + (this.frame >> 3)) % SPARKLE_COLORS.length]!;
        g.rect(at.x - arm, at.y, arm * 2 + 1, 1, color);
        g.rect(at.x, at.y - arm, 1, arm * 2 + 1, color);
      }
    }
  }
}

const TRAIL = new Color(0.55, 0.8, 1.0);
const TRAIL_POINTS = 8;
const TRAIL_ALPHA = 0.3;
const TRAIL_MIN_SPEED = 1;

/** A faint speed trail behind Sproto while he wears speed shoes (world space). */
class SpeedTrail extends Node2D {
  private points: Vec2[] = [];

  constructor(private readonly visual: PlayerVisual) {
    super('SpeedTrail');
    this.topLevel = true;
    this.zIndex = -1;
  }

  override physicsProcess(): void {
    const p = this.visual.player;
    const speed = p.grounded ? Math.abs(p.groundSpeed) : p.velocity.length();
    const on =
      p.moves.speedShoesFrames > 0 && Effects.enabled && Settings.data.speedEffects && p.state !== 'dead' && speed > TRAIL_MIN_SPEED;
    if (!on) {
      if (this.points.length > 0) this.points.shift();
      return;
    }
    this.points.unshift(p.globalPosition.add(new Vec2(0, p.getRadii().y - 10)));
    if (this.points.length > TRAIL_POINTS) this.points.length = TRAIL_POINTS;
  }

  override draw(g: Gfx): void {
    const pts = this.points;
    if (pts.length < 2) return;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dir = b.sub(a);
      if (dir.lengthSquared() < 0.01) continue;
      const side = dir.normalized().orthogonal();
      const fade = TRAIL_ALPHA * (1 - i / (pts.length - 1));
      const color = TRAIL.withAlpha(fade);
      for (const k of [-6, 0, 6]) {
        g.line(a.add(side.mul(k)).round(), b.add(side.mul(k)).round(), color, 1);
      }
    }
  }
}
