// The hub chrome: a small DOM bar over the top-right corner of the canvas, on
// every screen. It shows the hub Ticket balance (HubClient.ticketText(): the
// server balance, or '--' with no hub session) and a RETURN TO HUB button.
// The balance is display only: nothing here spends, exchanges or earns.
//
// RETURN TO HUB goes to the hub at once from the menus (title, zone select,
// game over, ending). Mid-run (SceneRouter.inGameplay()) it asks first,
// through the pause menu's EXIT TO HUB? page, because the act's tickets are
// banked only when it is cleared.
//
// CSS and DOM only (no art). It follows the canvas size and position, and in
// touch mode it sits left of the touch pause button. A mouse click or tap
// never moves keyboard focus off the canvas; Tab can still reach the button.

import { SceneRouter } from '../core/scene_router';
import { HubClient } from '../hub/hub_client';
import { VIEW_W } from '../runtime/tree';
import { Display } from './display';
import { PAUSE_CENTER, PAUSE_HIT_RADIUS } from './touch_controls/touch_controls';

export const CHROME_ID = 'hub-chrome';
export const RETURN_LABEL = 'RETURN TO HUB';
export const TICKETS_LABEL = 'HUB TICKETS';
/** Gap to the canvas edges, in game pixels. */
export const CHROME_MARGIN = 4;

/** What asks "EXIT TO HUB?" mid-run (the pause menu). */
export interface ExitAsker {
  confirmExitToHub(): void;
}

/** Leaving for the hub asks first only during a run; menus go straight away. */
export function exitNeedsConfirm(): boolean {
  return SceneRouter.inGameplay();
}

/** The RETURN TO HUB button: asks mid-run, leaves at once from a menu. */
export function requestHubExit(asker: ExitAsker): 'asked' | 'left' {
  if (exitNeedsConfirm()) {
    asker.confirmExitToHub();
    return 'asked';
  }
  HubClient.exitToHub();
  return 'left';
}

/** Right inset in game pixels: clear of the touch pause button in touch mode. */
export function chromeInset(touch: boolean): number {
  if (!touch) return CHROME_MARGIN;
  return VIEW_W - (PAUSE_CENTER.x - PAUSE_HIT_RADIUS) + CHROME_MARGIN;
}

const STYLE = `
#${CHROME_ID} {
  position: fixed;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0.45em;
  font: 700 12px/1 ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  letter-spacing: 0.05em;
  color: #ffdb57;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}
#${CHROME_ID} .hub-tickets {
  padding: 0.32em 0.55em;
  border-radius: 0.3em;
  background: rgba(18, 20, 31, 0.74);
  box-shadow: inset 0 0 0 1px rgba(255, 219, 87, 0.45);
  white-space: nowrap;
}
#${CHROME_ID} .hub-tickets b {
  margin-left: 0.4em;
  color: #fff6d6;
}
#${CHROME_ID}[data-session='off'] .hub-tickets b {
  color: #8d8fa3;
}
#${CHROME_ID} button {
  pointer-events: auto;
  font: inherit;
  letter-spacing: inherit;
  color: #12141f;
  background: #ffdb57;
  border: 0;
  border-radius: 0.3em;
  padding: 0.32em 0.6em;
  cursor: pointer;
  box-shadow: 0 0.15em 0 #a8791a;
  touch-action: manipulation;
}
#${CHROME_ID} button:hover {
  background: #ffe88a;
}
#${CHROME_ID} button:active {
  transform: translateY(0.1em);
  box-shadow: 0 0.05em 0 #a8791a;
}
#${CHROME_ID} button:focus-visible {
  outline: 2px solid #fff6d6;
  outline-offset: 2px;
}
`;

export class HubChrome {
  readonly root: HTMLElement;
  readonly value: HTMLElement;
  readonly button: HTMLButtonElement;
  private readonly tickets: HTMLElement;

  constructor(
    private readonly doc: Document,
    private readonly canvas: HTMLCanvasElement,
    private readonly asker: ExitAsker,
  ) {
    const style = doc.createElement('style');
    style.textContent = STYLE;
    doc.head.appendChild(style);

    this.root = doc.createElement('div');
    this.root.id = CHROME_ID;
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Hub');

    this.tickets = doc.createElement('span');
    this.tickets.className = 'hub-tickets';
    this.tickets.setAttribute('role', 'status');
    this.tickets.textContent = TICKETS_LABEL;
    this.value = doc.createElement('b');
    this.tickets.appendChild(this.value);

    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.className = 'hub-return';
    this.button.textContent = RETURN_LABEL;
    // A click keeps focus on the canvas, so Space and Enter still play the game afterwards.
    this.button.addEventListener('pointerdown', (e) => e.preventDefault());
    this.button.addEventListener('mousedown', (e) => e.preventDefault());
    // Enter or Space on the button (reached with Tab) presses it, not the game.
    this.button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    });
    this.button.addEventListener('click', () => this.press());

    this.root.appendChild(this.tickets);
    this.root.appendChild(this.button);
    doc.body.appendChild(this.root);

    HubClient.stateChanged.connect(() => this.render());
    Display.touchModeChanged.connect(() => this.place());
    this.render();
    this.place();
  }

  /** The button: asks mid-run, leaves from a menu. Focus goes back to the game. */
  press(): 'asked' | 'left' {
    const result = requestHubExit(this.asker);
    this.canvas.focus();
    return result;
  }

  /** Balance text, and whether there is a session (greys the '--'). */
  render(): void {
    const text = HubClient.ticketText();
    this.value.textContent = text;
    this.root.dataset.session = HubClient.inSession ? 'on' : 'off';
    this.tickets.setAttribute('aria-label', text === '--' ? `${TICKETS_LABEL}: no hub session` : `${TICKETS_LABEL}: ${text}`);
  }

  /** Follows the canvas: call after every canvas refit. */
  place(): void {
    const r = this.canvas.getBoundingClientRect();
    if (!(r.width > 0)) return;
    const scale = r.width / VIEW_W;
    const viewW = this.doc.documentElement.clientWidth || r.right;
    this.root.style.top = `${Math.round(r.top + CHROME_MARGIN * scale)}px`;
    this.root.style.right = `${Math.round(viewW - r.right + chromeInset(Display.isTouch) * scale)}px`;
    this.root.style.fontSize = `${Math.max(10, Math.round(5 * scale))}px`;
  }
}
