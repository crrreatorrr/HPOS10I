// The ending (scene id 'ending', after the last zone's boss): a short credits
// roll over the hills, music `ending`, then the title. Jump, accept, pause
// (a gamepad's Start, as on the title and game over) or a tap skips to the
// end of the roll; pressing again (or waiting) goes on. Every
// name here is the game's own.

import { Audio } from '../../core/audio';
import { Emeralds } from '../../core/emeralds';
import { GameState } from '../../core/game_state';
import { SceneRouter } from '../../core/scene_router';
import { ZoneRegistry } from '../../core/zone_registry';
import type { Gfx } from '../../runtime/gfx';
import { Input } from '../../runtime/input';
import { Node, type InputEventLike } from '../../runtime/node';
import { VIEW_H } from '../../runtime/tree';
import { MenuBackdrop } from '../common/menu_backdrop';
import { COLORS, drawCentered, UiLayer, type TextStyle } from '../common/theme';
import { DISCLAIMER } from '../title/title_screen';

/** Pixels per second the credits scroll. */
export const SCROLL_SPEED = 24;
/** Seconds the last line stays before the title. */
export const HOLD_SECONDS = 4;
export const INPUT_GRACE = 0.5;
const LINE_GAP = 14;

export interface CreditLine {
  text: string;
  style: TextStyle;
  gap?: number;
}

/** The roll, top to bottom. */
export function creditLines(): CreditLine[] {
  const lines: CreditLine[] = [
    { text: 'HPOS10I', style: 'title', gap: 30 },
    { text: 'STARRING SPROTO', style: 'hudLabel', gap: 28 },
    { text: 'ZONES', style: 'header' },
  ];
  for (const zone of ZoneRegistry.allZones(false)) lines.push({ text: zone.name.toUpperCase(), style: 'hudValue' });
  lines.push({ text: '', style: 'label', gap: 6 });
  lines.push({ text: Emeralds.NAME.toUpperCase(), style: 'header' });
  lines.push({ text: `${GameState.emeraldCount()} / ${Emeralds.total()}`, style: 'hudValue', gap: 28 });
  lines.push({ text: 'FINAL SCORE', style: 'header' });
  lines.push({ text: String(GameState.score), style: 'hudValue', gap: 28 });
  lines.push({ text: 'MADE BY THE HPOS10I CREW', style: 'outline' });
  lines.push({ text: DISCLAIMER, style: 'outline', gap: 40 });
  lines.push({ text: 'THANKS FOR PLAYING!', style: 'title' });
  return lines;
}

class Credits extends UiLayer {
  constructor(private readonly screen: EndingScreen) {
    super('Credits', 10);
  }

  protected override paint(g: Gfx): void {
    let y = Math.round(VIEW_H - this.screen.scroll);
    for (const line of this.screen.lines) {
      if (y > -30 && y < VIEW_H + 10 && line.text !== '') {
        drawCentered(g, line.text, y, line.style, line.style === 'header' ? { color: COLORS.gold } : {});
      }
      y += line.gap ?? LINE_GAP;
    }
  }
}

export class EndingScreen extends Node {
  readonly lines = creditLines();
  /** How far the roll has scrolled up, in pixels. */
  scroll = 0;
  private clock = 0;
  private holdClock = 0;
  private leaving = false;

  constructor() {
    super('Ending');
    this.addChild(new MenuBackdrop(196, 0.45));
    this.addChild(new Credits(this));
  }

  override ready(): void {
    Audio.playMusic('title');
  }

  /** Scroll at which the last line sits in the middle of the screen. */
  endScroll(): number {
    let h = 0;
    for (let i = 0; i < this.lines.length - 1; i++) h += this.lines[i]!.gap ?? LINE_GAP;
    return VIEW_H / 2 + h;
  }

  isRolled(): boolean {
    return this.scroll >= this.endScroll();
  }

  override process(delta: number): void {
    this.clock += delta;
    if (this.leaving) return;
    if (!this.isRolled()) {
      this.scroll = Math.min(this.endScroll(), this.scroll + SCROLL_SPEED * delta);
    } else {
      this.holdClock += delta;
      if (this.holdClock >= HOLD_SECONDS) this.finish();
    }
    if (this.accepting() && (Input.isActionJustPressed('jump') || Input.isActionJustPressed('ui_accept') || Input.isActionJustPressed('pause'))) this.skip();
  }

  override input(ev: InputEventLike): void {
    if (this.accepting() && ev.kind === 'pointer' && ev.pressed && !ev.echo) this.skip();
  }

  private accepting(): boolean {
    return !this.leaving && this.clock >= INPUT_GRACE && this.isInsideTree() && this.tree.currentScene === this;
  }

  /** Jumps to the end of the roll, or leaves when it is already there. */
  skip(): void {
    if (this.isRolled()) this.finish();
    else this.scroll = this.endScroll();
  }

  private finish(): void {
    if (this.leaving) return;
    this.leaving = true;
    SceneRouter.goTitle();
  }

  isLeaving(): boolean {
    return this.leaving;
  }
}
