// The "Something broke" panel: a small DOM card over the game, shown when the
// crash guard halts the game (or boot fails). One button: RELOAD (a halted
// game) or RETRY (boot). Styled like the hub chrome (CSS only, no art).

export const CRASH_PANEL_ID = 'crash-panel';

const STYLE = `
#${CRASH_PANEL_ID} {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(18, 20, 31, 0.6);
  font: 700 14px/1.4 ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  letter-spacing: 0.05em;
  color: #fff6d6;
}
#${CRASH_PANEL_ID} .card {
  max-width: 22em;
  padding: 1em 1.3em;
  border-radius: 0.4em;
  background: rgba(18, 20, 31, 0.94);
  box-shadow: inset 0 0 0 1px rgba(255, 219, 87, 0.55);
  text-align: center;
}
#${CRASH_PANEL_ID} .title {
  color: #ffdb57;
  margin-bottom: 0.4em;
}
#${CRASH_PANEL_ID} .detail {
  font-weight: 400;
  font-size: 0.85em;
  color: #c9c7d6;
  margin-bottom: 0.9em;
}
#${CRASH_PANEL_ID} button {
  font: inherit;
  letter-spacing: inherit;
  color: #12141f;
  background: #ffdb57;
  border: 0;
  border-radius: 0.3em;
  padding: 0.4em 1em;
  cursor: pointer;
  box-shadow: 0 0.15em 0 #a8791a;
}
#${CRASH_PANEL_ID} button:hover {
  background: #ffe88a;
}
#${CRASH_PANEL_ID} button:focus-visible {
  outline: 2px solid #fff6d6;
  outline-offset: 2px;
}
`;

export type CrashPanelKind = 'reload' | 'retry';

export class CrashPanel {
  private shown = false;

  constructor(
    private readonly doc: Document,
    private readonly reload: () => void,
  ) {}

  /** Shows the panel (once; later calls do nothing). */
  show(kind: CrashPanelKind): void {
    if (this.shown) return;
    this.shown = true;
    const doc = this.doc;
    const style = doc.createElement('style');
    style.textContent = STYLE;
    doc.head.appendChild(style);

    const root = doc.createElement('div');
    root.id = CRASH_PANEL_ID;
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-label', 'Something broke');
    const card = doc.createElement('div');
    card.className = 'card';
    const title = doc.createElement('div');
    title.className = 'title';
    title.textContent = 'Something broke';
    const detail = doc.createElement('div');
    detail.className = 'detail';
    detail.textContent =
      kind === 'retry' ? 'HPOS10I could not start. Check your connection and try again.' : 'The game hit an error and paused. Reloading usually fixes it.';
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = kind === 'retry' ? 'RETRY' : 'RELOAD';
    button.addEventListener('click', () => this.reload());
    card.appendChild(title);
    card.appendChild(detail);
    card.appendChild(button);
    root.appendChild(card);
    doc.body.appendChild(root);
    button.focus();
  }
}
