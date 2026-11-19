import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { clamp } from '../runtime/math';
import { Rect2, Vec2 } from '../runtime/vec2';
import type { ArenaInfo } from './boss_base';
import { OUTLINE, WARN_PALE } from './boss_fx';

type SpecialId = 'tassel_fan' | 'loom_columns' | 'fray_boomerang'
  | 'ink_seals' | 'bookends' | 'quill_fall'
  | 'rail_burst' | 'wheelie' | 'board_drop'
  | 'closing_bell' | 'red_tape' | 'stamp';

type Key = readonly [time: number, tilt: number, width: number, height: number, lift: number];
type Motion = {
  source: string;
  windup: readonly Key[];
  release: readonly Key[];
  cue: Vec2;
};

const rest: Key = [0, 0, 1, 1, 0];
const neutral: Key = [1, 0, 1, 1, 0];
const motion: Record<SpecialId, Motion> = {
  tassel_fan: { source: 'dust', cue: new Vec2(28, -10),
    windup: [rest, [.6, -0.15, .90, 1.20, 2], [1, -.21, .86, 1.28, 1]],
    release: [[0, -.21, .86, 1.28, 1], [.22, .16, 1.11, .72, 0], neutral] },
  loom_columns: { source: 'drop', cue: new Vec2(0, -23),
    windup: [rest, [.45, 0, .94, 1.25, 5], [1, 0, 1.17, .66, 2]],
    release: [[0, 0, 1.17, .66, 2], [.32, 0, .87, 1.27, 6], neutral] },
  fray_boomerang: { source: 'sweep', cue: new Vec2(22, -20),
    windup: [rest, [.55, .16, .82, 1.26, 2], [1, .27, .75, 1.42, 6]],
    release: [[0, .27, .75, 1.42, 6], [.38, -.2, 1.13, .82, 1], neutral] },
  ink_seals: { source: 'ink_wave', cue: new Vec2(11, -41),
    windup: [rest, [.56, -.04, 1.10, .90, 0], [1, .08, .90, 1.11, 2]],
    release: [[0, .08, .90, 1.11, 2], [.25, -.08, 1.17, .83, -1], neutral] },
  bookends: { source: 'pages', cue: new Vec2(29, -27),
    windup: [rest, [.65, .06, .89, 1.13, 4], [1, 0, 1.04, .94, 2]],
    release: [[0, 0, 1.04, .94, 2], [.44, 0, 1.18, .79, -1], neutral] },
  quill_fall: { source: 'ink_rain', cue: new Vec2(12, -56),
    windup: [rest, [.55, -.10, .94, 1.14, 3], [1, -.13, .90, 1.18, 5]],
    release: [[0, -.13, .90, 1.18, 5], [.29, .15, 1.06, .84, 0], neutral] },
  rail_burst: { source: 'zip_low', cue: new Vec2(24, -3),
    windup: [rest, [.54, -.08, 1.03, .88, 0], [1, -.12, 1.09, .82, 1]],
    release: [[0, -.12, 1.09, .82, 1], [.31, .13, .94, 1.13, 5], neutral] },
  wheelie: { source: 'zip_high', cue: new Vec2(30, -14),
    windup: [rest, [.50, .08, .94, 1.05, 2], [1, .18, .91, 1.13, 6]],
    release: [[0, .18, .91, 1.13, 6], [.31, -.16, .96, 1.05, 6], neutral] },
  board_drop: { source: 'cans', cue: new Vec2(19, -40),
    windup: [rest, [.55, -.06, .98, 1.03, 1], [1, -.11, .93, 1.14, 5]],
    release: [[0, -.11, .93, 1.14, 5], [.40, .18, 1.10, .84, -1], neutral] },
  closing_bell: { source: 'crash', cue: new Vec2(23, -50),
    windup: [rest, [.48, .03, .97, 1.02, 0], [1, -.09, .97, 1.11, 3]],
    release: [[0, -.09, .97, 1.11, 3], [.20, .11, 1.04, .94, 2], [.56, -.06, .98, 1.04, 0], neutral] },
  red_tape: { source: 'storm', cue: new Vec2(31, -48),
    windup: [rest, [.62, -.13, .95, 1.07, 2], [1, -.16, .91, 1.11, 3]],
    release: [[0, -.16, .91, 1.11, 3], [.40, .19, 1.11, .91, 0], neutral] },
  stamp: { source: 'briefcase', cue: new Vec2(21, -46),
    windup: [rest, [.53, -.05, .94, 1.14, 4], [1, -.10, .91, 1.18, 6]],
    release: [[0, -.10, .91, 1.18, 6], [.26, .14, 1.12, .82, 0], neutral] },
};

export function specialMotion(id: string | undefined): Motion | undefined {
  return id && Object.hasOwn(motion, id) ? motion[id as SpecialId] : undefined;
}

export function sampleMotion(keys: readonly Key[], time: number): Key {
  const end = keys.findIndex((key) => key[0] >= time);
  if (end <= 0) return end === 0 ? keys[0]! : keys[keys.length - 1]!;
  const a = keys[end - 1]!;
  const b = keys[end]!;
  const t = (time - a[0]) / (b[0] - a[0]);
  const ease = t * t * (3 - 2 * t);
  const between = (i: 1 | 2 | 3 | 4) => a[i] + (b[i] - a[i]) * ease;
  return [time, between(1), between(2), between(3), between(4)];
}

interface Strike {
  route: readonly Vec2[];
  size: Vec2;
  /** Time to complete the route, including any final stationary segment. */
  frames: number;
  delay: number;
}

export interface SpecialAttack {
  id: SpecialId;
  strikes: readonly Strike[];
  danger: readonly Rect2[];
  castAt: Vec2;
  frames: number;
}

function hazardBounds(strike: Strike): Rect2 {
  const [first, ...rest] = strike.route;
  let bounds = Rect2.centered(first!, strike.size);
  for (const at of rest) bounds = bounds.merge(Rect2.centered(at, strike.size));
  return bounds;
}

export function prepareSpecial(id: string, arena: ArenaInfo, target: Vec2, origin: Vec2): SpecialAttack | null {
  if (!specialMotion(id)) return null;
  const { left, right, floorY: floor } = arena;
  const mid = (left + right) / 2;
  const side = origin.x < mid ? -1 : 1;
  const start = side < 0 ? left + 20 : right - 20;
  const end = side < 0 ? right - 20 : left + 20;
  const aim = (x: number, margin = 18) => clamp(x, left + margin, right - margin);
  const point = (x: number, y: number) => new Vec2(x, floor + y);
  const stride = (route: Vec2[], w: number, h: number, frames: number, delay = 0): Strike =>
    ({ route, size: new Vec2(w, h), frames, delay });

  let strikes: Strike[];
  switch (id) {
    case 'tassel_fan': {
      const center = aim(target.x, 96);
      strikes = [-82, 0, 82].map((dx, i) => {
        const x = center + dx;
        return stride([point(aim(x - side * 12, 10), -91), point(x, -10)], 13, 15, 34, i * 5);
      });
      break;
    }
    case 'loom_columns':
      strikes = [mid - 93, mid + 93].map((x, i) => stride([point(x, -18)], 29, 36, 34, i * 12));
      break;
    case 'fray_boomerang':
      strikes = [stride([point(start, -13), point(end, -14), point(mid, -62), point(start, -72)], 22, 20, 132)];
      break;
    case 'ink_seals': {
      const center = aim(target.x, 55);
      strikes = [center - 43, center + 43].map((x, i) => stride([point(x, -11)], 31, 22, 42, i * 11));
      break;
    }
    case 'bookends':
      strikes = [-1, 1].map((dir) => stride(
        [point(dir < 0 ? left + 22 : right - 22, -25), point(mid + dir * 52, -25), point(mid + dir * 52, -25)], 19, 50, 78,
      ));
      break;
    case 'quill_fall': {
      const center = aim(target.x, 61);
      strikes = [-48, 0, 48].map((dx, i) => {
        const x = center + dx;
        return stride([point(aim(x - side * 29), -135), point(x, -9)], 12, 18, 43, i * 11);
      });
      break;
    }
    case 'rail_burst':
      strikes = [-1, 1].map((dir) => stride(
        [point(dir < 0 ? left + 22 : right - 22, -9), point(mid + dir * 31, -9)], 25, 18, 63,
      ));
      break;
    case 'wheelie':
      strikes = [
        stride([point(start, -54), point(mid, -101), point(end, -54)], 27, 13, 70),
        stride([point(end, -54), point(mid, -88), point(start, -54)], 24, 12, 70, 15),
      ];
      break;
    case 'board_drop': {
      const x = aim(target.x, 24);
      strikes = [stride([point(x, -127), point(x, -9), point(aim(x + side * 42), -65)], 32, 16, 69)];
      break;
    }
    case 'closing_bell': {
      const x = target.x > mid ? mid - 77 : mid + 77;
      strikes = [stride([point(x, -85)], 42, 170, 27), stride([point(mid, -85)], 36, 170, 26, 18)];
      break;
    }
    case 'red_tape':
      strikes = [
        stride([point(start, -52), point(end, -52)], 38, 10, 70),
        stride([point(end, -77), point(start, -77)], 32, 10, 70, 23),
      ];
      break;
    case 'stamp': {
      const x = aim(target.x, 22);
      const high = Math.max(arena.view.y + 24, Math.min(floor - 106, origin.y - 14));
      strikes = [stride([new Vec2(x, high), point(x, -14), point(x, -14)], 25, 27, 62)];
      break;
    }
    default:
      return null;
  }
  // Lower the caster into view so the entire anticipation pose is visible.
  const castAt = origin.withY(Math.max(origin.y, arena.view.y + 106));
  const frames = Math.max(...strikes.map((strike) => strike.delay + strike.frames));
  return { id: id as SpecialId, strikes, danger: strikes.map(hazardBounds), castAt, frames };
}

export function strikePosition(strike: Strike, frame: number): Vec2 {
  const segments = strike.route.length - 1;
  if (segments === 0) return strike.route[0]!;
  const step = clamp(frame / (strike.frames - 1), 0, 1) * segments;
  const segment = Math.min(segments - 1, Math.floor(step));
  return strike.route[segment]!.lerp(strike.route[segment + 1]!, step - segment);
}

export function drawSpecialWarning(g: Gfx, special: SpecialAttack, elapsed: number, telegraphFrames: number): void {
  const previewFrame = clamp((elapsed + 1) / telegraphFrames, 0, 1) * special.frames;
  for (const [index, strike] of special.strikes.entries()) {
    const bounds = special.danger[index]!;
    const strikeFrame = previewFrame - strike.delay;
    const charge = clamp((strikeFrame + 1) / strike.frames, 0, 1);
    if (strike.route.length === 1) {
      const alpha = .12 + charge * .08;
      g.rectR(bounds, WARN_PALE.withAlpha(alpha));
      g.rectR(bounds, WARN_PALE.withAlpha(.8), false, 1);
      const y = bounds.bottom - 4;
      g.rect(bounds.x, y, bounds.w * charge, 4, WARN_PALE);
    } else {
      for (let i = 0; i + 1 < strike.route.length; i++) {
        const a = strike.route[i]!;
        const b = strike.route[i + 1]!;
        const length = b.distanceTo(a);
        if (length === 0) continue;
        const unit = b.sub(a).div(length);
        for (let j = 0; j < length; j += 12) {
          g.line(a.add(unit.mul(j)), a.add(unit.mul(Math.min(j + 6, length))), WARN_PALE.withAlpha(.75), 1);
        }
      }
      if (strikeFrame >= 0 && strikeFrame <= strike.frames) {
        const at = strikePosition(strike, strikeFrame);
        g.rectR(Rect2.centered(at, strike.size), WARN_PALE.withAlpha(.85), false, 1);
      }
    }
  }
}

const pigments: Record<SpecialId, string> = {
  tassel_fan: 'f7be70', loom_columns: 'db8c58', fray_boomerang: 'd95e68',
  ink_seals: 'a17ce1', bookends: 'c99072', quill_fall: 'e9d6a4',
  rail_burst: '69deed', wheelie: 'bbf38e', board_drop: '6de0bd',
  closing_bell: 'ffb969', red_tape: 'ed668d', stamp: 'f08770',
};

function colorFor(id: SpecialId): Color {
  const rgb = Number.parseInt(pigments[id], 16);
  return Color.rgb8(rgb >> 16, (rgb >> 8) & 255, rgb & 255);
}

const light = Color.rgb8(255, 240, 187);

export function drawSpecialHazard(g: Gfx, id: SpecialId, size: Vec2, age: number): void {
  const x = size.x / 2;
  const y = size.y / 2;
  const paint = colorFor(id);
  const v = (dx: number, dy: number) => new Vec2(dx, dy);
  switch (id) {
    case 'tassel_fan': {
      const flutter = Math.round(Math.sin(age * .37) * x * .28);
      g.polygon([v(-x, -y), v(x, -y + 2), v(3 + flutter, y), v(flutter - 4, y - 1)], OUTLINE);
      g.polygon([v(-x + 1, -y + 1), v(x - 1, -y + 3), v(2 + flutter, y - 1), v(flutter - 3, y - 2)], paint);
      g.line(v(-x + 2, -y + 2), v(x - 2, -y + 4), light, 2);
      for (const dx of [-2, 0, 2]) g.line(v(dx, -y + 5), v(dx + flutter, y - 1), OUTLINE.withAlpha(.6), 1);
      break;
    }
    case 'quill_fall':
      g.polygon([v(-x, -y + 1), v(x, -y), v(x - 1, -1), v(-2, y), v(-3, y - 6)], OUTLINE);
      g.polygon([v(-x + 1, -y + 2), v(x - 1, -y + 1), v(x - 2, -1), v(-2, y - 2)], paint);
      g.line(v(-2, y - 1), v(x - 2, -y + 2), light, 1);
      g.line(v(-4, -y + 4), v(2, -y + 2), OUTLINE, 1);
      break;
    case 'loom_columns': {
      g.rect(-x, -y, size.x, size.y, paint.withAlpha(.29));
      for (let i = 0; i < 4; i++) {
        const dy = y - 5 - ((age * .65 + i * 8) % (size.y - 8));
        const dx = Math.sin(i + age * .12) * x * .3;
        g.ellipse(v(dx, dy), x * (.57 + i * .07), 3, paint.withAlpha(.8));
        g.line(v(dx - x * .4, dy - 1), v(dx + x * .36, dy - 1), light.withAlpha(.66), 1);
      }
      g.line(v(-x, y - 1), v(x, y - 1), light, 2);
      break;
    }
    case 'closing_bell': {
      const wave = Math.round(Math.sin(age * .38) * x * .24);
      g.rect(-x, -y, size.x, size.y, paint.withAlpha(.45));
      g.rect(-x, -y, 2, size.y, light);
      g.rect(x - 2, -y, 2, size.y, light);
      g.polygon([v(-x + 4, y), v(wave - 3, -y), v(wave + 4, -y), v(x - 4, y)], paint.withAlpha(.83));
      for (let yy = -y + 6 + age % 9; yy < y; yy += 14) g.line(v(-x + 3, yy), v(x - 3, yy - 2), light.withAlpha(.72), 1);
      break;
    }
    case 'ink_seals':
      g.rectR(new Rect2(-x, -y, size.x, size.y), paint.withAlpha(.40));
      g.ellipse(v(0, y - 3), x, 3, OUTLINE);
      for (const dx of [-8, 0, 8]) {
        const tip = -y + 2 + Math.round(Math.sin(age * .3 + dx) * 2);
        g.polygon([v(dx - 6, y - 2), v(dx - 4, tip + 7), v(dx + 1, tip), v(dx + 6, y - 2)], paint);
        g.line(v(dx - 3, y - 5), v(dx + 1, tip + 2), light, 1);
      }
      break;
    case 'bookends':
      g.rect(-x, -y, size.x, size.y, OUTLINE);
      g.rect(-x + 2, -y + 1, size.x - 3, size.y - 2, paint);
      g.rect(-x + 5, -y + 4, size.x - 8, size.y - 8, light);
      for (let dy = -y + 8; dy < y - 6; dy += 6) g.line(v(-x + 7, dy), v(x - 5, dy), paint, 1);
      break;
    case 'rail_burst': {
      const ripple = Math.round(Math.sin(age * .44) * 2);
      g.rect(-x, -y, size.x, size.y, paint.withAlpha(.38));
      g.polyline([v(-x, ripple), v(-x * .55, y - 2), v(-1, -y + 2), v(x * .55, y - 2), v(x, -ripple)], paint, 3);
      g.line(v(-x + 1, 0), v(x - 1, 0), light, 1);
      break;
    }
    case 'red_tape': {
      const ripple = Math.round(Math.sin(age * .34) * y * .45);
      const ribbon = [v(-x, -y + 1), v(-x / 3, -y + 2 + ripple), v(x / 3, -y + 2 - ripple), v(x, -y + 1),
        v(x - 2, y - 1), v(x / 3, y - 2 - ripple), v(-x / 3, y - 2 + ripple), v(-x + 2, y - 1)];
      g.polygon(ribbon, paint);
      g.polyline([v(-x + 1, -y + 1), v(-x / 3, -y + 2 + ripple), v(x / 3, -y + 2 - ripple), v(x - 1, -y + 1)], light, 1);
      break;
    }
    case 'fray_boomerang':
      g.ellipse(Vec2.ZERO, x, y, OUTLINE);
      g.ellipse(Vec2.ZERO, x - 1, y - 1, paint);
      g.arc(Vec2.ZERO, Math.min(x, y) * .64, age * .21, age * .21 + Math.PI * 1.7, light, 2);
      g.arc(Vec2.ZERO, Math.min(x, y) * .33, age * .21 + 1, age * .21 + 5, OUTLINE, 1);
      break;
    case 'wheelie': {
      const turn = age * .29;
      g.ellipse(Vec2.ZERO, x, y, OUTLINE);
      g.ellipse(Vec2.ZERO, x - 2, y - 2, paint);
      for (const off of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const tip = v(Math.cos(turn + off) * (x - 3), Math.sin(turn + off) * (y - 3));
        g.line(Vec2.ZERO, tip, light, 2);
      }
      g.circle(Vec2.ZERO, 2, OUTLINE);
      break;
    }
    case 'stamp':
      g.rect(-x * .43, -y, x * .86, y * 1.25, OUTLINE);
      g.rect(-x * .32, -y + 2, x * .64, y, paint);
      g.rect(-x, y * .12, size.x, y * .88, OUTLINE);
      g.rect(-x + 2, y * .12 + 1, size.x - 4, y * .88 - 3, paint);
      g.line(v(-x + 2, y - 3), v(x - 3, y - 3), light, 2);
      break;
    case 'board_drop':
      g.polygon([v(-x, -y + 3), v(x - 2, -y), v(x, -y + 3), v(x - 3, y - 2), v(-x, y)], OUTLINE);
      g.polygon([v(-x + 2, -y + 4), v(x - 2, -y + 2), v(x - 4, y - 3), v(-x + 2, y - 2)], paint);
      g.line(v(-x + 3, -y + 4), v(x - 4, -y + 3), light, 2);
      for (const dx of [-x / 2, x / 2]) g.rect(dx - 1, y - 5, 3, 2, light.withAlpha(.7 + .3 * Math.sin(age * .4)));
      break;
  }
}

export function drawSpecialCue(g: Gfx, id: string, feet: number, facing: number, ticks: number, windup: boolean, progress: number): void {
  const clip = specialMotion(id);
  if (!clip) return;
  const drift = windup ? Math.sin(progress * Math.PI) * 5 : progress * 14;
  const at = clip.cue.add(new Vec2(drift, -drift * .25));
  g.setTransform(new Vec2(at.x * facing, feet + at.y), 0);
  g.withAlpha(windup ? .45 + progress * .55 : 1 - progress, () => {
    drawSpecialHazard(g, id as SpecialId, new Vec2(14, 10), ticks);
  });
  g.resetTransform();
}
