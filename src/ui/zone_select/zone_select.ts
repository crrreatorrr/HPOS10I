// Zone select: the 4 zones x 2 acts from ZoneRegistry, each act with its
// emerald slot (filled once won). Acts whose scene isn't built yet, and every
// act of an unreleased zone (ZoneRegistry.isReleased), are greyed out and
// skipped by navigation. Choosing an act calls SceneRouter.startZone(); BACK
// (P, Esc, the gamepad B or the button) returns to the title. Arrows / WASD / D-pad /
// stick move (wrapping), Enter, Space, Start or any jump button chooses
// (except the gamepad's B, which is cancel here: back to the title); mouse
// and touch tap. Music: `zone_select`. Input only counts while it is the current
// scene.
//
// With two or more Relic skins to choose from, a SKIN row cycles the body
// slot (RelicLoadout.cycleBody: left/right or choose). HUB, beside BACK,
// returns to the hub at once (a menu: nothing to confirm). The hub Ticket
// balance is in the hub chrome (src/ui/hub_chrome.ts) on every screen. (The
// old Ticket exchange panel is gone: the hub refuses exchanges for this game.)

import { Audio } from '../../core/audio';
import { Emeralds } from '../../core/emeralds';
import { GameState } from '../../core/game_state';
import { SceneRouter } from '../../core/scene_router';
import { Scenes } from '../../core/scenes';
import { ZoneRegistry, type Zone } from '../../core/zone_registry';
import { HubClient } from '../../hub/hub_client';
import { ITEM_GOLDEN, ITEM_NOBU, ITEM_TIDEBREAKER, RelicLoadout } from '../../hub/relic_loadout';
import type { Gfx } from '../../runtime/gfx';
import { Input } from '../../runtime/input';
import { posmod } from '../../runtime/math';
import { Node, type InputEventLike } from '../../runtime/node';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { MenuBackdrop } from '../common/menu_backdrop';
import { MenuList, type Direction, type MenuItem } from '../common/menu';
import { COLORS, drawCentered, drawPanel, drawText, UiLayer, PANEL_MARGIN_X, PANEL_MARGIN_Y } from '../common/theme';
import { Display } from '../display';
import { EmeraldIcon } from '../emerald/emerald_icon';

export const INPUT_GRACE = 0.25;
const NAME_WIDTH = 132;
const BUTTON_W = 58;
const BUTTON_H = 22;
const SLOT = 18;
const ROW_SEP = 4;
const COL_SEP = 4;
const BOX_SEP = 6;
const ROW_W = NAME_WIDTH + (COL_SEP + BUTTON_W + COL_SEP + SLOT) * 2;
const SKIN_W = BUTTON_W * 2 + COL_SEP * 2 + SLOT;
/** Space between the title and the bottom hint where the panel is centred (zone_select.tscn). */
const AREA_TOP = 34;
const AREA_BOTTOM = 220;
/** Bottom hint for keys/gamepad, and for touch (follows Display's touch mode). */
export const HINT_KEYS = 'JUMP: START     PAUSE: BACK TO TITLE';
export const HINT_TOUCH = 'TAP AN ACT TO START     TAP BACK FOR THE TITLE';
/** On a gamepad B is a jump button too, but here it goes back (ui_cancel wins). */
export const HINT_PAD = 'A: START     B: BACK TO TITLE';

export interface ActEntry {
  zoneId: string;
  act: number;
  open: boolean;
  /** Index in the menu, or -1 when locked. */
  item: number;
  slot: EmeraldIcon;
}

export function skinLabel(body: string): string {
  switch (body) {
    case ITEM_GOLDEN:
      return 'GOLDEN';
    case ITEM_NOBU:
      return 'NOBU';
    case ITEM_TIDEBREAKER:
      return 'TIDEBREAKER';
  }
  return 'NONE';
}

class ZoneSelectLayer extends UiLayer {
  constructor(private readonly screen: ZoneSelect) {
    super('Layer', 10);
  }

  protected override paint(g: Gfx): void {
    this.screen.paint(g);
  }
}

export class ZoneSelect extends Node {
  readonly menu: MenuList;
  readonly acts: ActEntry[] = [];
  /** Rows of menu indices (-1 where an act can't be played), then the skin row, then [Back]. */
  readonly grid: number[][] = [];
  readonly backIndex: number;
  readonly hubIndex: number;
  readonly skinIndex: number;
  private readonly layer: ZoneSelectLayer;
  private readonly zones: { zone: Zone; open: boolean; y: number }[] = [];
  private panel = new Rect2();
  private busy = false;

  constructor() {
    super('ZoneSelect');
    this.layer = this.addChild(new ZoneSelectLayer(this));
    this.layer.addChild(new MenuBackdrop(196, 0.35), 0);
    this.menu = new MenuList([], {
      onCancel: () => this.back(),
      cancelOnPause: true,
      grace: INPUT_GRACE,
      links: (i, d) => this.link(i, d),
    });
    const items = this.menu.items;
    const zones = ZoneRegistry.allZones(false);
    const showSkin = RelicLoadout.resolve().body_choices.length >= 2;
    const rows = zones.length;
    const contentH = rows * BUTTON_H + (rows - 1) * ROW_SEP + (showSkin ? ROW_SEP + BUTTON_H : 0) + BOX_SEP + BUTTON_H;
    const panelW = ROW_W + PANEL_MARGIN_X * 2;
    const panelH = contentH + PANEL_MARGIN_Y * 2;
    this.panel = new Rect2(Math.floor((424 - panelW) / 2), AREA_TOP + Math.floor((AREA_BOTTOM - AREA_TOP - panelH) / 2), panelW, panelH);
    const left = this.panel.x + PANEL_MARGIN_X;
    let y = this.panel.y + PANEL_MARGIN_Y;
    for (const zone of zones) {
      const released = ZoneRegistry.isReleased(zone.id);
      const row: number[] = [];
      let anyOpen = false;
      let x = left + NAME_WIDTH + COL_SEP;
      for (let act = 1; act <= zone.acts.length; act++) {
        const path = ZoneRegistry.stagePath(zone.id, act);
        const open = released && path !== '' && Scenes.exists(path);
        anyOpen = anyOpen || open;
        const index = items.length;
        items.push({
          label: `ACT ${act}`,
          rect: new Rect2(x, y, BUTTON_W, BUTTON_H),
          enabled: open,
          onSelect: () => this.choose(zone.id, act),
          data: { zoneId: zone.id, act },
        });
        row.push(open ? index : -1);
        x += BUTTON_W + COL_SEP;
        const slot = new EmeraldIcon({ small: true, empty: !GameState.hasEmerald(zone.id, act), bob: false, spinSpeed: 0.5, phase: act * 0.7 });
        slot.position = new Vec2(x + SLOT / 2, y + BUTTON_H / 2);
        this.layer.addChild(slot);
        this.acts.push({ zoneId: zone.id, act, open, item: open ? index : -1, slot });
        x += SLOT + COL_SEP;
      }
      this.zones.push({ zone, open: anyOpen, y });
      this.grid.push(row);
      y += BUTTON_H + ROW_SEP;
    }
    if (showSkin) {
      this.skinIndex = items.length;
      items.push({
        label: () => `SKIN: ${skinLabel(RelicLoadout.resolve().body)}`,
        rect: new Rect2(left + NAME_WIDTH + COL_SEP, y, SKIN_W, BUTTON_H),
        onSelect: () => this.cycleSkin(1),
        onStep: (step) => this.cycleSkin(step, false),
      });
      this.grid.push([this.skinIndex]);
      y += BUTTON_H + ROW_SEP;
    } else {
      this.skinIndex = -1;
    }
    y += BOX_SEP - ROW_SEP;
    this.backIndex = items.length;
    items.push({ label: 'BACK', rect: new Rect2(left, y, BUTTON_W, BUTTON_H), onSelect: () => this.back() });
    this.hubIndex = items.length;
    items.push({ label: 'HUB', rect: new Rect2(left + BUTTON_W + COL_SEP, y, BUTTON_W, BUTTON_H), onSelect: () => this.toHub() });
    this.grid.push([this.backIndex, this.hubIndex]);
    this.menu.focus = this.firstButton();
  }

  override ready(): void {
    Audio.playMusic('zone_select');
    this.menu.reset(this.firstButton());
  }

  override process(delta: number): void {
    this.menu.enabled = !this.busy && this.isCurrent();
    this.menu.update(delta);
  }

  override input(ev: InputEventLike): void {
    if (this.busy || !this.isCurrent()) return;
    this.menu.handleEvent(ev);
  }

  private isCurrent(): boolean {
    return this.isInsideTree() && this.tree.currentScene === this;
  }

  /** The first playable act (or BACK). */
  firstButton(): number {
    for (const row of this.grid) for (const i of row) if (i >= 0) return i;
    return this.backIndex;
  }

  emeraldSlots(): EmeraldIcon[] {
    return this.acts.map((a) => a.slot);
  }

  focusedItem(): MenuItem | null {
    return this.menu.focused;
  }

  /** Starts an act (only the first choice counts). The menu plays menu_select. */
  choose(zoneId: string, act: number): void {
    if (this.busy) return;
    this.busy = true;
    SceneRouter.startZone(zoneId, act);
  }

  back(): void {
    if (this.busy) return;
    this.busy = true;
    Audio.playSfx('menu_select');
    SceneRouter.goTitle();
  }

  /** Straight to the hub: the zone select is a menu, so nothing is asked. */
  toHub(): void {
    if (this.busy) return;
    this.busy = true;
    HubClient.exitToHub();
  }

  isBusy(): boolean {
    return this.busy;
  }

  hintText(): string {
    if (Display.isTouch) return HINT_TOUCH;
    return Input.lastDevice === 'pad' ? HINT_PAD : HINT_KEYS;
  }

  private cycleSkin(step: number, sound = true): boolean {
    if (!RelicLoadout.cycleBody(step)) return false;
    if (sound) Audio.playSfx('menu_move');
    return true;
  }

  // --- Grid focus: skips locked acts and wraps (ports _in_row / _in_column). ---

  private link(index: number, dir: Direction): number {
    let r = -1;
    let c = -1;
    for (let i = 0; i < this.grid.length && r < 0; i++) {
      const j = this.grid[i]!.indexOf(index);
      if (j >= 0) {
        r = i;
        c = j;
      }
    }
    if (r < 0) return this.firstButton();
    switch (dir) {
      case 'left':
        return this.inRow(r, c, -1);
      case 'right':
        return this.inRow(r, c, 1);
      case 'up':
        return this.inColumn(r, c, -1);
      default:
        return this.inColumn(r, c, 1);
    }
  }

  private inRow(r: number, c: number, step: number): number {
    const row = this.grid[r]!;
    for (let i = 1; i <= row.length; i++) {
      const other = row[posmod(c + step * i, row.length)]!;
      if (other >= 0) return other;
    }
    return row[c]!;
  }

  private inColumn(r: number, c: number, step: number): number {
    for (let i = 1; i <= this.grid.length; i++) {
      const row = this.grid[posmod(r + step * i, this.grid.length)]!;
      const same = row[Math.min(c, row.length - 1)]!;
      if (same >= 0) return same;
      for (const other of row) if (other >= 0) return other;
    }
    return this.grid[r]![c]!;
  }

  // --- Drawing ---------------------------------------------------------------------

  /** @internal (the layer's painter) */
  paint(g: Gfx): void {
    drawCentered(g, 'ZONE SELECT', 8, 'title');
    drawPanel(g, this.panel);
    const left = this.panel.x + PANEL_MARGIN_X;
    for (const z of this.zones) {
      const ty = z.y + Math.floor((BUTTON_H - 11) / 2) + 1;
      if (z.open) drawText(g, z.zone.name.toUpperCase(), left, ty, 'hudLabel');
      else drawText(g, z.zone.name.toUpperCase(), left, ty, 'hudValue', { color: COLORS.locked });
    }
    if (this.skinIndex >= 0) {
      const it = this.menu.items[this.skinIndex]!;
      const ty = it.rect.y + Math.floor((BUTTON_H - 11) / 2) + 1;
      drawText(g, RelicLoadout.resolve().ranked ? 'RELIC  RANKED' : 'RELIC', left, ty, 'hudLabel');
    }
    this.menu.draw(g);
    const hub = this.menu.items[this.hubIndex]!.rect;
    const count = `${Emeralds.NAME.toUpperCase()}  ${GameState.emeraldCount()} / ${Emeralds.total()}`;
    drawText(g, count, hub.right + 10, hub.y + Math.floor((BUTTON_H - 11) / 2) + 1, 'hudValue', {
      align: 'right',
      width: this.panel.right - PANEL_MARGIN_X - hub.right - 10,
    });
    drawCentered(g, this.hintText(), 225, 'outline');
  }
}
