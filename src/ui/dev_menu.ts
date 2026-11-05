// The dev boot menu (scene id 'main'; port of core/main.gd's menu). The boot
// code (src/main.ts) does the URL routing; this lists every playground, stage
// and sandbox that is registered, and is also where the router falls back to
// when a scene is missing. Arrows/WASD move (with repeat), Enter/Space/any
// jump key starts, the physical digits 1-9 start an entry directly, mouse and
// touch tap. The list scrolls to keep the focused entry on screen.

import { SceneRouter } from '../core/scene_router';
import { Scenes } from '../core/scenes';
import { ZoneRegistry } from '../core/zone_registry';
import type { Gfx } from '../runtime/gfx';
import { Node, type InputEventLike } from '../runtime/node';
import { VIEW_H } from '../runtime/tree';
import { Rect2 } from '../runtime/vec2';
import { InputHints } from './common/input_hints';
import { MenuList } from './common/menu';
import { drawButton, drawText, UiLayer } from './common/theme';
import { Display } from './display';

export interface DevEntry {
  label: string;
  start: () => void;
}

const LEFT = 16;
const TOP = 12;
const BUTTON_W = 220;
const BUTTON_H = 16;
const SEP = 3;
const LIST_TOP = TOP + 11 + SEP;
const LIST_BOTTOM = VIEW_H - 14;

function capitalize(id: string): string {
  return id
    .split(/[_\-/ ]+/)
    .filter((w) => w !== '')
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

/** Everything playable that is registered right now, in menu order. */
export function collectEntries(): DevEntry[] {
  const entries: DevEntry[] = [];
  const ids = Scenes.ids().sort();
  for (const id of ids.filter((i) => i.startsWith('playground:'))) {
    entries.push({ label: `${capitalize(id.slice('playground:'.length))} Playground`, start: () => SceneRouter.openScene(id) });
  }
  for (const zone of ZoneRegistry.allZones(true)) {
    const stageCount = zone.acts.length + (zone.boss !== '' ? 1 : 0);
    for (let stage = 1; stage <= stageCount; stage++) {
      const path = ZoneRegistry.stagePath(zone.id, stage);
      if (path === '' || !Scenes.exists(path)) continue;
      let stageName = stage > zone.acts.length ? 'Boss' : `Act ${stage}`;
      if (zone.acts.length === 1 && stage === 1) stageName = '';
      // Dev menu only; players never see these.
      if (!ZoneRegistry.isReleased(zone.id)) stageName += ' (WIP)';
      entries.push({ label: `${zone.name} ${stageName}`.trim(), start: () => SceneRouter.startZone(zone.id, stage) });
    }
  }
  for (const id of ids.filter((i) => i.startsWith('sandbox:'))) {
    entries.push({ label: `Sandbox: ${id.slice('sandbox:'.length)}`, start: () => SceneRouter.openScene(id) });
  }
  return entries;
}

class DevMenuLayer extends UiLayer {
  constructor(private readonly menuScreen: DevMenu) {
    super('Layer', 10);
  }

  protected override paint(g: Gfx): void {
    this.menuScreen.paint(g);
  }
}

export class DevMenu extends Node {
  readonly entries: DevEntry[];
  readonly menu: MenuList;
  private scroll = 0;

  constructor() {
    super('Main');
    this.entries = collectEntries();
    this.menu = new MenuList(
      this.entries.map((e, i) => ({
        label: i < 9 ? `${i + 1}  ${e.label}` : e.label,
        rect: new Rect2(),
        onSelect: () => e.start(),
        draw: (g, item, state) => {
          if (item.rect.w > 0) drawButton(g, item.rect, typeof item.label === 'string' ? item.label : item.label(), state, 'left');
        },
      })),
      { selectSound: false },
    );
    this.addChild(new DevMenuLayer(this));
    this.place();
  }

  override ready(): void {
    this.menu.reset(0);
  }

  override process(delta: number): void {
    if (!this.isInsideTree() || this.tree.currentScene !== this) return;
    this.menu.update(delta);
    this.place();
  }

  override input(ev: InputEventLike): void {
    if (!this.isInsideTree() || this.tree.currentScene !== this) return;
    if (ev.kind === 'key' && ev.pressed && !ev.echo && ev.code) {
      // Physical digits: AZERTY keyboards need Shift for the printed digits.
      const m = /^Digit([1-9])$/.exec(ev.code);
      if (m) {
        const index = Number(m[1]) - 1;
        if (index < Math.min(9, this.entries.length)) {
          ev.handled = true;
          this.entries[index]!.start();
        }
        return;
      }
    }
    this.menu.handleEvent(ev);
  }

  /** Lays the buttons out, scrolled so the focused one is visible. */
  private place(): void {
    const step = BUTTON_H + SEP;
    const focusTop = this.menu.focus * step;
    const visible = LIST_BOTTOM - LIST_TOP - 12;
    if (focusTop - this.scroll < 0) this.scroll = focusTop;
    if (focusTop + BUTTON_H - this.scroll > visible) this.scroll = focusTop + BUTTON_H - visible;
    this.menu.items.forEach((it, i) => {
      const y = LIST_TOP + i * step - this.scroll;
      const onScreen = y >= LIST_TOP - 1 && y + BUTTON_H <= LIST_BOTTOM - 12 + 1;
      // Off-screen entries stay focusable (navigation scrolls to them) but can't be tapped or drawn.
      it.rect = onScreen ? new Rect2(LEFT, y, BUTTON_W, BUTTON_H) : new Rect2(-1000, -1000, 0, 0);
    });
  }

  hint(): string {
    if (Display.isTouch) return 'Tap an entry to play';
    return `Choose: arrows or ${InputHints.moveLetter('move_up')}/${InputHints.moveLetter('move_down')}   Start: ${InputHints.forAction('jump', 1)} or ${InputHints.firstKey('ui_accept')}`;
  }

  /** @internal (the layer's painter) */
  paint(g: Gfx): void {
    drawText(g, 'HPOS10I  -  early build', LEFT, TOP, 'hudValue');
    if (this.entries.length === 0) drawText(g, 'Nothing playable yet.', LEFT, LIST_TOP, 'label');
    this.menu.draw(g);
    drawText(g, this.hint(), LEFT, LIST_BOTTOM - 9, 'label');
  }
}
