// Global pause menu. installUi() returns it as an overlay, added once above
// every scene; processMode is ALWAYS so it keeps running while the tree is
// paused.
//
// The `pause` action (Enter, Esc, P, gamepad Start, the touch pause button)
// toggles it, but only while SceneRouter.inGameplay(). Items:
//   RESUME         back to the game
//   RESTART        reload the stage from its checkpoint (or the playground),
//                  without losing a life (SceneRouter.restart()). Greyed out,
//                  with a hint line, unless the level is 'playing'
//                  (LevelRoot.phase()): restarting while dying would skip the
//                  life the respawn takes (owner decision HPOS-DEC-01). The
//                  HUD clock goes back to the checkpoint; the attempt clock
//                  that best times and ranks use does not, and the run is no
//                  longer clean.
//   RESTART ACT    the whole stage again from 0:00 as a fresh attempt
//                  (SceneRouter.restartAct()): lives and score are kept, the
//                  attempt clock starts over. Greyed out with RESTART.
//   OPTIONS        the Settings toggles (OptionsMenu below)
//   EXIT TO HUB    asks first (this is mid-run: the act's tickets are not
//                  banked yet), then HubClient.exitToHub(); always offered,
//                  like the original. The hub chrome's Return to Hub button
//                  opens the same question (confirmExitToHub()).
//   MAIN MENU      asks first (QUIT TO MAIN MENU?: the run ends), then
//                  SceneRouter.goTitle() (the title is the main menu)
//   SEND FEEDBACK  the hub's feedback window (ui/feedback.ts; N twice does the
//                  same anywhere). The menu is still open when it closes.
//   CONTROLS       the controller settings overlay (ui/controls), over the
//                  menu; its MAIN MENU and HUB ask the same questions
//   FULL SCREEN    on/off (ui/fullscreen.ts), where the browser allows it
// The buttons stand in two columns (the first five, then the rest); up/down
// walk them in that order. OPTIONS also offers FULL SCREEN, CONTROLS, EXIT TO
// HUB and MAIN MENU under the toggles.
// Arrows/WASD/D-pad/stick move, Enter/Space/any jump button choose, mouse and
// touch tap. Esc or the gamepad's B goes back: on the main page it resumes,
// like Start (B is also a jump button, so without this it would choose the
// focused item). Left/right cycle the Relic skin when there is a choice, and
// otherwise move between the columns. The
// panel also lists the controls for every device; key and button names come
// from the bindings (InputHints), and Esc is never offered for pause. Under
// the table one line names the classic moves and, while the extra moves are
// on, two more name the drop dash, charge run and shield bounce.
//
// Pausing releases every held game input. Resuming waits for two physics
// frames without a fresh jump press, so the key that closed the menu never
// makes Sproto jump. On the web, losing focus (tab switch, phone call)
// pauses the game.

import { Audio } from '../../core/audio';
import { SceneRouter } from '../../core/scene_router';
import { Settings, type SettingsData } from '../../core/settings';
import { HubClient } from '../../hub/hub_client';
import { LevelRoot } from '../../levels/common/level_root';
import { Moves } from '../../player/moves';
import { RelicLoadout } from '../../hub/relic_loadout';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Input } from '../../runtime/input';
import { ProcessMode, type InputEventLike } from '../../runtime/node';
import { Signal } from '../../runtime/signal';
import { tree, VIEW_H, VIEW_W } from '../../runtime/tree';
import { Rect2 } from '../../runtime/vec2';
import { InputHints } from '../common/input_hints';
import { MenuList, type Direction, type MenuItem } from '../common/menu';
import { CONTROLS_LABEL, fullScreenItem, MAIN_MENU_LABEL } from '../common/standard_items';
import { ControlsScreen, controlsScreen, openControls } from '../controls/controls_screen';
import { FullScreen } from '../fullscreen';
import { COLORS, drawButton, drawCentered, drawPanel, drawText, lineHeight, measure, PANEL_MARGIN_X, PANEL_MARGIN_Y, UiLayer, type ButtonState } from '../common/theme';
import { Display } from '../display';
import { Feedback } from '../feedback';
import { skinLabel } from '../zone_select/zone_select';

export const QUIET_FRAMES_TO_RESUME = 2;
const BUTTON_W = 150;
const BUTTON_H = 16;
const BUTTON_SEP = 2;
const LAYOUT_SEP = 6;
const BACKDROP = new Color(0.02, 0.03, 0.09, 0.62);
const HEADER_ACTIVE = COLORS.gold;
const HEADER_IDLE = COLORS.idle;
const OPTION_W = 236;
/** The main page's buttons: this many in the first column, the rest in the second. */
export const FIRST_COLUMN = 5;
const COLUMN_SEP = 6;
/** Under EXIT TO HUB? (tickets bank only when an act is cleared). */
export const EXIT_CONFIRM_NOTE = 'THIS RUN ENDS HERE. TICKETS FROM THIS ACT ARE NOT BANKED.';
/** Under QUIT TO MAIN MENU?. */
export const QUIT_CONFIRM_NOTE = 'THIS RUN ENDS HERE. TICKETS FROM THIS ACT ARE NOT BANKED.';
export const MAIN_MENU_INDEX = 5;
export const CONTROLS_INDEX = 7;
export const MOVES_LINE = 'DOWN: ROLL   HOLD DOWN + JUMP: SPIN DASH   UP: LOOK';
/** Shown under it only while the extra moves are on (Moves.extrasOn()). One line is wider than the screen. */
export const EXTRA_MOVES_LINES: readonly string[] = ['JUMP TWICE AND HOLD: DROP DASH   HOLD UP + JUMP: CHARGE RUN', 'JUMP WITH A SHIELD: BOUNCE'];
/** Under the list while RESTART is greyed out: dying (or the respawn is on its way)... */
export const RESTART_HINT_DYING = 'WAIT FOR RESPAWN';
/** ...or the act is being cleared. */
export const RESTART_HINT_FINISHING = 'STAGE CLEAR';
const RESTART_INDEX = 1;
const RESTART_ACT_INDEX = 2;

type Device = 'keyboard' | 'pad' | 'touch';
const DEVICE_COLUMN: Record<Device, number> = { keyboard: 1, pad: 2, touch: 3 };

export interface OptionRow {
  key: keyof SettingsData;
  label: string;
  /** Shown as OFF IN RANKED while the session is ranked. */
  rankedOff: boolean;
  /** Sound is stored as `muted`: the row shows the opposite. */
  inverted?: boolean;
  /** One line under the list while the row is focused. */
  help: string;
}

export const OPTION_ROWS: readonly OptionRow[] = [
  { key: 'extraMoves', label: 'EXTRA MOVES', rankedOff: true, help: 'DROP DASH, CHARGE RUN, SHIELD BOUNCE, JUMP ASSIST' },
  { key: 'itemBoxes', label: 'ITEM BOXES', rankedOff: true, help: 'SHIELDS, SPEED SHOES AND INVINCIBILITY' },
  { key: 'screenShake', label: 'SCREEN SHAKE', rankedOff: false, help: 'SHAKE AND HIT-STOP ON BIG IMPACTS' },
  { key: 'speedEffects', label: 'SPEED EFFECTS', rankedOff: false, help: 'SPEED LINES AND THE AFTERIMAGE TRAIL' },
  { key: 'muted', label: 'SOUND', rankedOff: false, inverted: true, help: 'MUSIC AND SOUND EFFECTS' },
];

/** Whether an option row reads ON. */
export function optionOn(row: OptionRow): boolean {
  const v = Settings.data[row.key];
  return row.inverted ? !v : v;
}

/** Flips an option and applies it (sound goes to Audio at once). */
export function toggleOption(row: OptionRow): void {
  const next = !Settings.data[row.key];
  Settings.set(row.key, next);
  if (row.key === 'muted') Audio.setMuted(next);
}

export class PauseMenu extends UiLayer {
  readonly opened = new Signal();
  readonly closed = new Signal();
  /** Losing focus pauses the game (web only; the browser build sets this). */
  pauseOnFocusLoss = typeof window !== 'undefined';

  readonly main: MenuList;
  readonly options: MenuList;
  /** EXIT TO HUB (or MAIN MENU) / KEEP PLAYING: the question before leaving a run. */
  readonly confirm: MenuList;
  /** 'main', 'options' or 'confirm' while open. */
  page: 'main' | 'options' | 'confirm' = 'main';
  /** What the confirm page asks about: leaving for the hub or for the main menu. */
  confirmKind: 'hub' | 'title' = 'hub';

  private open = false;
  /** KEEP PLAYING goes back to the pause list, or (asked from the hub chrome) straight back to the game. */
  private confirmBack: 'main' | 'options' | 'resume' = 'main';
  private controlsWasOpen = false;
  private resumePending = false;
  private quietFrames = 0;
  private relicText = '';
  private restartText = '';
  private domWired = false;
  private readonly onBlur = () => {
    // Not under the feedback window (tree.suspended): closing it must leave the game as it was.
    if (this.pauseOnFocusLoss && !this.open && SceneRouter.inGameplay() && !tree.paused && !tree.suspended) this.openMenu();
  };
  private readonly onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this.onBlur();
  };

  constructor() {
    super('PauseMenu', 101);
    // Before gameplay nodes each tick, so an unpause takes effect for the whole tick.
    this.processPriority = -100;
    this.processMode = ProcessMode.ALWAYS;
    this.visible = false;
    this.addToGroup('pause_menu');
    const items: MenuItem[] = [
      { label: 'RESUME', rect: new Rect2(), onSelect: () => this.requestResume() },
      { label: 'RESTART', rect: new Rect2(), onSelect: () => this.onRestart() },
      { label: 'RESTART ACT', rect: new Rect2(), onSelect: () => this.onRestartAct() },
      { label: 'OPTIONS', rect: new Rect2(), onSelect: () => this.showOptions() },
      { label: 'EXIT TO HUB', rect: new Rect2(), onSelect: () => this.onExitHub() },
      { label: MAIN_MENU_LABEL, rect: new Rect2(), onSelect: () => this.onQuit() },
      // After these, so the indices above stay put. The window is the hub SDK's DOM overlay.
      { label: 'SEND FEEDBACK', rect: new Rect2(), onSelect: () => Feedback.open(true) },
      { label: CONTROLS_LABEL, rect: new Rect2(), onSelect: () => this.showControls('main') },
    ];
    const fs = fullScreenItem();
    if (fs) items.push(fs);
    for (const it of items) it.onStep = (step) => this.cycleSkin(step);
    this.main = new MenuList(items, { onCancel: () => this.requestResume(), repeatHorizontal: false, links: (i, d) => this.mainLink(i, d) });
    const rows: MenuItem[] = OPTION_ROWS.map((row) => ({
      label: row.label,
      rect: new Rect2(),
      data: row,
      onSelect: () => toggleOption(row),
      onStep: () => {
        toggleOption(row);
        return true;
      },
      draw: (g, item, state) => this.drawOption(g, item, state, row),
    }));
    const fsRow = fullScreenItem();
    if (fsRow) {
      fsRow.onStep = () => {
        FullScreen.toggle();
        return true;
      };
      fsRow.draw = (g, item, state) => this.drawToggle(g, item, state, 'FULL SCREEN', FullScreen.isOn(), false);
      rows.push(fsRow);
    }
    rows.push({ label: CONTROLS_LABEL, rect: new Rect2(), onSelect: () => this.showControls('options') });
    rows.push({ label: 'EXIT TO HUB', rect: new Rect2(), onSelect: () => this.showConfirm('options', 'hub') });
    rows.push({ label: MAIN_MENU_LABEL, rect: new Rect2(), onSelect: () => this.showConfirm('options', 'title') });
    rows.push({ label: 'BACK', rect: new Rect2(), onSelect: () => this.showMain() });
    this.options = new MenuList(rows, { onCancel: () => this.showMain(), repeatHorizontal: false });
    this.confirm = new MenuList(
      [
        { label: 'EXIT TO HUB', rect: new Rect2(), onSelect: () => this.confirmLeave() },
        { label: 'KEEP PLAYING', rect: new Rect2(), onSelect: () => this.cancelExit() },
      ],
      { onCancel: () => this.cancelExit(), repeatHorizontal: false },
    );
  }

  override enterTree(): void {
    if (!this.domWired && typeof window !== 'undefined') {
      this.domWired = true;
      window.addEventListener('blur', this.onBlur);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  override exitTree(): void {
    if (this.domWired && typeof window !== 'undefined') {
      this.domWired = false;
      window.removeEventListener('blur', this.onBlur);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  isResumePending(): boolean {
    return this.resumePending;
  }

  /** The list now taking input. */
  activeMenu(): MenuList {
    if (this.page === 'confirm') return this.confirm;
    return this.page === 'options' ? this.options : this.main;
  }

  override process(delta: number): void {
    const jp = (a: 'pause' | 'ui_accept') => Input.isActionJustPressed(a);
    if (!this.open) {
      if (jp('pause') && SceneRouter.inGameplay() && !tree.paused) this.openMenu();
      return;
    }
    if (!SceneRouter.inGameplay()) {
      this.close();
      tree.paused = false;
      return;
    }
    if (!tree.paused) {
      // Someone else unpaused (a scene change, a test reset): just hide.
      this.close();
      return;
    }
    if (this.resumePending) return;
    if (ControlsScreen.blocking()) {
      this.controlsWasOpen = true;
      return;
    }
    if (this.controlsWasOpen) {
      // Back from CONTROLS: the press that closed it never acts here.
      this.controlsWasOpen = false;
      this.activeMenu().reset(this.activeMenu().focus);
    }
    this.refreshRestart();
    const menu = this.activeMenu();
    // Enter is pause and accept: in the menu it chooses, it doesn't close it.
    if (jp('pause') && !jp('ui_accept') && !menu.isSettling() && !(this.page !== 'main' && Input.isActionJustPressed('ui_cancel'))) {
      this.requestResume();
      return;
    }
    menu.update(delta);
  }

  override physicsProcess(): void {
    if (!this.resumePending) return;
    // A jump pressed this frame would reach the player the moment it unpauses,
    // so wait for two quiet physics frames in a row (about 33 ms).
    if (Input.isActionJustPressed('jump')) this.quietFrames = 0;
    else this.quietFrames += 1;
    if (this.quietFrames >= QUIET_FRAMES_TO_RESUME) {
      this.resumePending = false;
      this.close();
      tree.paused = false;
    }
  }

  override input(ev: InputEventLike): void {
    if (!this.open || this.resumePending || ControlsScreen.blocking()) return;
    this.activeMenu().handleEvent(ev);
  }

  /** Pauses the game and shows the menu. */
  openMenu(): void {
    if (this.open) return;
    this.open = true;
    this.resumePending = false;
    tree.paused = true;
    PauseMenu.releaseGameInputs();
    this.page = 'main';
    this.refreshRelicLine();
    this.refreshRestart(false);
    this.layout();
    this.main.reset(0);
    this.visible = true;
    Audio.playSfx('pause');
    this.opened.emit();
  }

  /** Closes the menu and unpauses once two physics frames in a row had no fresh jump press. */
  requestResume(): void {
    if (!this.open || this.resumePending) return;
    this.resumePending = true;
    this.quietFrames = 0;
    PauseMenu.releaseGameInputs();
  }

  /** Releases everything held (keys, pads, touch), so nothing stays down across the menu. */
  static releaseGameInputs(): void {
    Input.releaseAll();
  }

  private close(): void {
    this.open = false;
    this.resumePending = false;
    this.visible = false;
    this.page = 'main';
    this.closed.emit();
  }

  private leave(then: () => void): void {
    if (!this.open) return;
    PauseMenu.releaseGameInputs();
    this.close();
    tree.paused = false;
    tree.timeScale = 1;
    then();
  }

  private onRestart(): void {
    // LEAD-REQUEST: SceneRouter.restart() could refuse on its own while the level isn't
    // 'playing'; until then this menu (its only caller) is the guard.
    if (!this.canRestart()) return;
    this.leave(() => SceneRouter.restart());
  }

  private onRestartAct(): void {
    if (!this.canRestart()) return;
    this.leave(() => SceneRouter.restartAct());
  }

  /** RESTART is offered only while the level plays (any scene without a LevelRoot: always). */
  canRestart(): boolean {
    const level = LevelRoot.find(null);
    return !level || level.phase() === 'playing';
  }

  /** The line under the list while RESTART is greyed out ('' when it isn't). */
  restartHint(): string {
    return this.restartText;
  }

  /** Greys RESTART and RESTART ACT out (never hides them) while the level isn't playing. */
  private refreshRestart(relayout = true): void {
    const item = this.main.items[RESTART_INDEX]!;
    const actItem = this.main.items[RESTART_ACT_INDEX]!;
    const can = this.canRestart();
    const phase = LevelRoot.find(null)?.phase();
    const text = can ? '' : phase === 'finishing' || phase === 'leaving' ? RESTART_HINT_FINISHING : RESTART_HINT_DYING;
    if (item.enabled === can && actItem.enabled === can && text === this.restartText) return;
    item.enabled = can;
    actItem.enabled = can;
    this.restartText = text;
    if (!can && (this.main.focus === RESTART_INDEX || this.main.focus === RESTART_ACT_INDEX)) this.main.focus = this.main.firstUsable();
    if (relayout && this.page === 'main') this.layout();
  }

  /** MAIN MENU: asks first (the run ends), like EXIT TO HUB. */
  private onQuit(): void {
    this.showConfirm('main', 'title');
  }

  private onExitHub(): void {
    this.showConfirm('main', 'hub');
  }

  /** The confirm page's first item: leave for the hub or the main menu. */
  private confirmLeave(): void {
    if (this.confirmKind === 'title') this.leave(() => SceneRouter.goTitle());
    else this.leave(() => HubClient.exitToHub());
  }

  /** CONTROLS over the menu; its MAIN MENU and HUB ask the same questions as these pages. */
  private showControls(from: 'main' | 'options'): void {
    openControls({
      mainMenu: () => this.showConfirm(from, 'title'),
      hub: () => this.showConfirm(from, 'hub'),
      alive: () => this.open && !this.resumePending,
    });
  }

  /** Main page navigation: up/down walk the list in order (skipping greyed items), left/right switch columns. */
  private mainLink(index: number, dir: Direction): number {
    const n = this.main.items.length;
    if (dir === 'up' || dir === 'down') {
      const delta = dir === 'up' ? -1 : 1;
      for (let k = 1; k <= n; k++) {
        const i = (((index + delta * k) % n) + n) % n;
        if (this.main.isUsable(i)) return i;
      }
      return index;
    }
    const col = index < FIRST_COLUMN ? 0 : 1;
    const row = col === 0 ? index : index - FIRST_COLUMN;
    const other = col === 0 ? FIRST_COLUMN + Math.min(row, n - FIRST_COLUMN - 1) : Math.min(row, FIRST_COLUMN - 1);
    if (this.main.isUsable(other)) return other;
    // A greyed item (RESTART while dying): the nearest usable one in that column.
    const start = col === 0 ? FIRST_COLUMN : 0;
    const end = col === 0 ? n : FIRST_COLUMN;
    let best = index;
    let bestD = Infinity;
    for (let i = start; i < end; i++) {
      const d = Math.abs(i - other);
      if (this.main.isUsable(i) && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * The Return to Hub question mid-run (the hub chrome's button): pauses the
   * game if needed and asks. KEEP PLAYING then resumes. Outside gameplay
   * nothing is asked: it goes to the hub at once.
   */
  confirmExitToHub(): void {
    if (!SceneRouter.inGameplay()) {
      HubClient.exitToHub();
      return;
    }
    const wasOpen = this.open;
    if (!wasOpen) this.openMenu();
    if (!this.open) return;
    this.resumePending = false;
    controlsScreen().close();
    this.showConfirm(wasOpen ? (this.page === 'options' ? 'options' : 'main') : 'resume', 'hub');
  }

  private showConfirm(back: 'main' | 'options' | 'resume', kind: 'hub' | 'title'): void {
    this.confirmBack = back;
    this.confirmKind = kind;
    this.confirm.items[0]!.label = kind === 'title' ? MAIN_MENU_LABEL : 'EXIT TO HUB';
    this.page = 'confirm';
    this.layout();
    // KEEP PLAYING first: a double press never leaves the run by accident.
    this.confirm.reset(1);
  }

  private cancelExit(): void {
    if (this.confirmBack === 'resume') {
      // The question stays drawn for the two quiet frames; close() resets the page.
      this.requestResume();
      return;
    }
    if (this.confirmBack === 'options') {
      this.page = 'options';
      this.layout();
      const label = this.confirmKind === 'title' ? MAIN_MENU_LABEL : 'EXIT TO HUB';
      this.options.reset(this.options.items.findIndex((i) => i.label === label));
      Audio.playSfx('menu_select');
      return;
    }
    this.page = 'main';
    this.layout();
    this.main.reset(this.confirmKind === 'title' ? MAIN_MENU_INDEX : 4);
    Audio.playSfx('menu_select');
  }

  private showOptions(): void {
    this.page = 'options';
    this.layout();
    this.options.reset(0);
  }

  private showMain(): void {
    this.page = 'main';
    this.layout();
    this.main.reset(3);
    Audio.playSfx('menu_select');
  }

  private cycleSkin(step: number): boolean {
    if (!RelicLoadout.cycleBody(step)) return false;
    this.refreshRelicLine();
    this.layout();
    return true;
  }

  /** The Relic line under the buttons: skin, cape, focus key, how to switch. */
  refreshRelicLine(): void {
    const state = RelicLoadout.resolve();
    const body = state.body;
    const choices = state.body_choices;
    if (body === '' && !state.cape && choices.length < 2) {
      this.relicText = '';
      return;
    }
    const parts: string[] = [];
    if (state.ranked) parts.push('RANKED - LOOK ONLY');
    if (choices.length > 0 || body !== '') parts.push(`SKIN ${skinLabel(body)}`);
    if (state.cape) parts.push('CAPE DUELIST');
    if (state.time_focus) {
      const key = InputHints.keysForDevice('focus', Input.lastDevice);
      if (key !== '') parts.push(`FOCUS ${key}`);
    }
    if (choices.length >= 2) parts.push('LEFT RIGHT');
    this.relicText = parts.join('  ');
  }

  relicLine(): string {
    return this.relicText;
  }

  /** The controls table: [row label, keys, gamepad, touch]. Key names from the bindings. */
  controlsRows(): string[][] {
    return [
      ['', 'KEYS', 'GAMEPAD', 'TOUCH'],
      ['MOVE', InputHints.moveKeys(), 'D-PAD / STICK', 'LEFT PAD'],
      ['JUMP', InputHints.actionKeys('jump'), InputHints.padKeys('jump'), 'JUMP BUTTON'],
      ['PAUSE', InputHints.actionKeys('pause', ' / '), InputHints.padKeys('pause', ' / '), 'II BUTTON'],
    ];
  }

  /** The moves lines under the controls table (the second only with the extra moves on). */
  movesLines(): string[] {
    return this.extraMoves ? [MOVES_LINE, ...EXTRA_MOVES_LINES] : [MOVES_LINE];
  }

  /** @internal Tests: the controls panel and the title line of the open page. */
  layoutBounds(): { top: number; bottom: number; left: number; right: number } {
    return { top: this.titleY, bottom: this.controls.bottom, left: this.controls.x, right: this.controls.right };
  }

  /** The device column to highlight: the one the player used last. */
  activeColumn(): number {
    const device: Device = Display.isTouch ? 'touch' : Input.lastDevice;
    return DEVICE_COLUMN[device];
  }

  // --- Layout and drawing ----------------------------------------------------------

  private titleY = 0;
  private relicY = 0;
  private hintY = 0;
  private controls = new Rect2();
  private extraMoves = false;
  private controlsHeader = true;
  private columnX: number[] = [];

  /** Places the items for the current page (centred vertically, like the VBox). */
  private layout(): void {
    const titleH = lineHeight('title');
    if (this.page === 'confirm') {
      const n = this.confirm.items.length;
      const noteH = lineHeight('outline');
      const listH = n * BUTTON_H + (n - 1) * BUTTON_SEP;
      const total = titleH + LAYOUT_SEP + noteH + LAYOUT_SEP + listH;
      let y = Math.floor((VIEW_H - total) / 2);
      this.titleY = y;
      y += titleH + LAYOUT_SEP;
      this.relicY = y;
      y += noteH + LAYOUT_SEP;
      const x = Math.floor((VIEW_W - BUTTON_W) / 2);
      for (const it of this.confirm.items) {
        it.rect = new Rect2(x, y, BUTTON_W, BUTTON_H);
        y += BUTTON_H + BUTTON_SEP;
      }
      return;
    }
    if (this.page === 'options') {
      // The toggles, then the standard options (FULL SCREEN, CONTROLS, EXIT TO HUB, MAIN MENU) and BACK.
      const n = this.options.items.length;
      const noteH = lineHeight('outline') * 2;
      let sep = LAYOUT_SEP;
      let buttonSep = BUTTON_SEP;
      let total = 0;
      const measureAll = () => (total = titleH + sep + n * BUTTON_H + (n - 1) * buttonSep + sep + noteH);
      measureAll();
      if (total > VIEW_H - 4) {
        sep = 3;
        buttonSep = 1;
        measureAll();
      }
      let y = Math.floor((VIEW_H - total) / 2);
      this.titleY = y;
      y += titleH + sep;
      const x = Math.floor((VIEW_W - OPTION_W) / 2);
      for (const it of this.options.items) {
        it.rect = new Rect2(x, y, OPTION_W, BUTTON_H);
        y += BUTTON_H + buttonSep;
      }
      this.relicY = y - buttonSep + sep;
      return;
    }
    // Two columns of buttons: the first FIRST_COLUMN items, then the rest.
    const n = Math.max(Math.min(FIRST_COLUMN, this.main.items.length), this.main.items.length - FIRST_COLUMN);
    // Controls panel: header, the 4-row grid, the moves lines.
    const smallH = lineHeight('label');
    const gridH = 4 * smallH + 3;
    this.extraMoves = Moves.extrasOn();
    const rows = this.controlsRows();
    const widths = [0, 1, 2, 3].map((c) => Math.max(...rows.map((r) => measure(r[c]!, 'label'))));
    const gridW = widths.reduce((a, b) => a + b, 0) + 10 * 3;
    const innerW = Math.max(gridW, measure(MOVES_LINE, 'label'), ...(this.extraMoves ? EXTRA_MOVES_LINES.map((l) => measure(l, 'label')) : []), measure('CONTROLS', 'header'));
    const panelW = innerW + PANEL_MARGIN_X * 2;
    // The page must fit 240 px with the Relic line, the restart hint and the
    // extra moves all showing: tighten the gaps first, then drop the panel's header,
    // then use shorter buttons.
    let sep = LAYOUT_SEP;
    let buttonSep = BUTTON_SEP;
    let buttonH = BUTTON_H;
    this.controlsHeader = true;
    let listH = 0;
    let relicH = 0;
    let hintH = 0;
    let panelH = 0;
    let total = 0;
    const measureAll = (): void => {
      listH = n * buttonH + (n - 1) * buttonSep;
      relicH = this.relicText !== '' ? smallH + sep : 0;
      // With the Relic line under it too, the hint sits tight on it.
      hintH = this.restartText !== '' ? smallH + (this.relicText !== '' ? 1 : sep) : 0;
      const header = this.controlsHeader ? lineHeight('header') + 3 : 0;
      const panelInner = header + gridH + 3 + smallH + (this.extraMoves ? EXTRA_MOVES_LINES.length * (smallH + 1) : 0);
      panelH = panelInner + PANEL_MARGIN_Y * 2;
      total = titleH + sep + listH + sep + hintH + relicH + panelH;
    };
    measureAll();
    if (total > VIEW_H - 4) {
      sep = 3;
      buttonSep = 1;
      measureAll();
    }
    if (total > VIEW_H - 4) {
      this.controlsHeader = false;
      measureAll();
    }
    if (total > VIEW_H - 4) {
      buttonH = 14;
      measureAll();
    }
    let y = Math.floor((VIEW_H - total) / 2);
    this.titleY = y;
    y += titleH + sep;
    const x = Math.floor((VIEW_W - BUTTON_W * 2 - COLUMN_SEP) / 2);
    this.main.items.forEach((it, i) => {
      const col = i < FIRST_COLUMN ? 0 : 1;
      const row = col === 0 ? i : i - FIRST_COLUMN;
      it.rect = new Rect2(x + col * (BUTTON_W + COLUMN_SEP), y + row * (buttonH + buttonSep), BUTTON_W, buttonH);
    });
    y += n * (buttonH + buttonSep);
    y += sep - buttonSep;
    this.hintY = y;
    y += hintH;
    this.relicY = y;
    y += relicH;
    this.controls = new Rect2(Math.floor((VIEW_W - panelW) / 2), y, panelW, panelH);
    const gx = this.controls.x + PANEL_MARGIN_X + Math.floor((innerW - gridW) / 2);
    this.columnX = [];
    let cx = gx;
    for (const w of widths) {
      this.columnX.push(cx);
      cx += w + 10;
    }
  }

  protected override paint(g: Gfx): void {
    // SEND FEEDBACK: one frame without the menu, so the screenshot shows the game.
    if (!this.open || Feedback.hidesMenus) return;
    g.rect(0, 0, VIEW_W, VIEW_H, BACKDROP);
    if (this.page === 'options') {
      this.paintOptions(g);
      return;
    }
    if (this.page === 'confirm') {
      drawCentered(g, this.confirmKind === 'title' ? 'QUIT TO MAIN MENU?' : 'EXIT TO HUB?', this.titleY, 'title');
      drawCentered(g, this.confirmKind === 'title' ? QUIT_CONFIRM_NOTE : EXIT_CONFIRM_NOTE, this.relicY, 'outline');
      this.confirm.draw(g);
      return;
    }
    drawCentered(g, 'PAUSED', this.titleY, 'title');
    this.main.draw(g);
    const hint = FullScreen.notice() || this.restartText;
    if (hint !== '') drawCentered(g, hint, this.hintY, 'label', { color: COLORS.soft });
    if (this.relicText !== '') drawCentered(g, this.relicText, this.relicY, 'label');
    const r = this.controls;
    drawPanel(g, r);
    let y = r.y + PANEL_MARGIN_Y;
    if (this.controlsHeader) {
      drawText(g, 'CONTROLS', r.x, y, 'header', { align: 'center', width: r.w });
      y += lineHeight('header') + 3;
    }
    const rows = this.controlsRows();
    const active = this.activeColumn();
    const smallH = lineHeight('label');
    rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        let color: Color | null = null;
        if (ri === 0) color = ci === active ? HEADER_ACTIVE : HEADER_IDLE;
        else if (ci === 0) color = COLORS.gold;
        drawText(g, cell, this.columnX[ci]!, y, 'label', { color });
      });
      y += smallH + 1;
    });
    y += 2;
    drawText(g, MOVES_LINE, r.x, y, 'label', { align: 'center', width: r.w, color: COLORS.soft });
    if (this.extraMoves) {
      EXTRA_MOVES_LINES.forEach((line, i) => drawText(g, line, r.x, y + (i + 1) * (smallH + 1), 'label', { align: 'center', width: r.w, color: COLORS.soft }));
    }
  }

  private paintOptions(g: Gfx): void {
    drawCentered(g, 'OPTIONS', this.titleY, 'title');
    this.options.draw(g);
    const data = this.options.focused?.data;
    const row = data && typeof data === 'object' ? (data as OptionRow) : undefined;
    const notice = FullScreen.notice();
    if (notice !== '') drawCentered(g, notice, this.relicY, 'outline');
    else if (row) drawCentered(g, row.help, this.relicY, 'outline');
    else if (data === 'fullscreen') drawCentered(g, 'THE WHOLE SCREEN FOR THE GAME (ESC LEAVES IT)', this.relicY, 'outline');
    if (RelicLoadout.resolve().ranked) drawCentered(g, 'RANKED: EXTRA MOVES AND ITEM BOXES ARE OFF', this.relicY + lineHeight('outline'), 'outline');
  }

  private drawOption(g: Gfx, item: MenuItem, state: ButtonState, row: OptionRow): void {
    this.drawToggle(g, item, state, row.label, optionOn(row), row.rankedOff && RelicLoadout.resolve().ranked);
  }

  /** An ON/OFF row: the label left, the value right (OFF IN RANKED beside it when ranked). */
  private drawToggle(g: Gfx, item: MenuItem, state: ButtonState, label: string, on: boolean, ranked: boolean): void {
    drawButton(g, item.rect, label, state, 'left');
    const value = on ? 'ON' : 'OFF';
    const r = item.rect;
    const ty = Math.round(r.y + (r.h - 11) / 2) + 1 + (state === 'pressed' ? 1 : 0);
    const valueColor = on ? COLORS.gold : COLORS.idle;
    drawText(g, value, r.x + 6, ty, 'hudValue', { align: 'right', width: r.w - 12, color: valueColor });
    if (ranked) {
      const vw = measure(value, 'hudValue');
      drawText(g, 'OFF IN RANKED', r.x + 6, ty + 1, 'label', { align: 'right', width: r.w - 12 - vw - 8, color: COLORS.warning });
    }
  }
}
