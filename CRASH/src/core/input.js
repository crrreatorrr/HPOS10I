// Keyboard + Gamepad input with per-frame edge detection.
// Actions: left/right/up/down (analog-ish), jump, bite, slide, pause, confirm, back.

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump',
  KeyJ: 'bite', ShiftLeft: 'bite', ShiftRight: 'bite',
  KeyK: 'slide', ControlLeft: 'slide', ControlRight: 'slide',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm',
  Backspace: 'back',
};

const PAD_DEADZONE = 0.28;

class Input {
  constructor() {
    this.down = new Set();        // actions currently held (keyboard)
    this.pressedQ = new Set();    // actions pressed since last frame (keyboard)
    this.anyKeyQ = false;
    this.pad = { axes: [0, 0], held: new Set(), prev: new Set() };
    this.state = { x: 0, y: 0 };
    this._pressed = new Set();
    this._anyPressed = false;
    this.lastDevice = 'keyboard';

    this.codes = new Set();
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        if (!e.repeat) this.pressedQ.add(a);
      }
      // Ctrl+key combos would trigger browser shortcuts while sliding; swallow what we can.
      if (e.ctrlKey && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'Space'].includes(e.code)) e.preventDefault();
      this.codes.add(e.code);
      this._recompute();
      if (!e.repeat) this.anyKeyQ = true;
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => {
      this.codes.delete(e.code);
      this._recompute();
    });
    window.addEventListener('blur', () => { this.codes.clear(); this._recompute(); });
    window.addEventListener('pointerdown', () => { this.anyKeyQ = true; });
  }

  // Called once per frame before game update.
  poll() {
    this._pressed = this.pressedQ;
    this.pressedQ = new Set();
    this._anyPressed = this.anyKeyQ;
    this.anyKeyQ = false;

    // Gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.pad.prev = this.pad.held;
    this.pad.held = new Set();
    this.pad.axes = [0, 0];
    if (gp) {
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      if (b(0)) this.pad.held.add('jump');
      if (b(2) || b(3) || b(5)) this.pad.held.add('bite');
      if (b(1) || b(4) || b(6) || b(7)) this.pad.held.add('slide');
      if (b(9)) this.pad.held.add('pause');
      if (b(0) || b(9)) this.pad.held.add('confirm');
      if (b(1) || b(8)) this.pad.held.add('back');
      if (b(12)) this.pad.held.add('up');
      if (b(13)) this.pad.held.add('down');
      if (b(14)) this.pad.held.add('left');
      if (b(15)) this.pad.held.add('right');
      let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const mag = Math.hypot(ax, ay);
      if (mag < PAD_DEADZONE) { ax = 0; ay = 0; } else {
        const k = Math.min(1, (mag - PAD_DEADZONE) / (1 - PAD_DEADZONE)) / mag;
        ax *= k; ay *= k;
      }
      this.pad.axes = [ax, ay];
      for (const a of this.pad.held) {
        if (!this.pad.prev.has(a)) { this._pressed.add(a); this._anyPressed = true; this.lastDevice = 'pad'; }
      }
      // stick flicks count as directional presses for menus
      const flick = (name, on, wasOn) => { if (on && !wasOn) this._pressed.add(name); };
      const prevAx = this._prevAxes || [0, 0];
      flick('left', ax < -0.6, prevAx[0] < -0.6);
      flick('right', ax > 0.6, prevAx[0] > 0.6);
      flick('up', ay < -0.6, prevAx[1] < -0.6);
      flick('down', ay > 0.6, prevAx[1] > 0.6);
      this._prevAxes = [ax, ay];
    }

    // Movement vector: x = right, y = up (screen space)
    let x = 0, y = 0;
    if (this.held('left')) x -= 1;
    if (this.held('right')) x += 1;
    if (this.held('up')) y += 1;
    if (this.held('down')) y -= 1;
    if (this.pad.axes[0] || this.pad.axes[1]) { x = this.pad.axes[0]; y = -this.pad.axes[1]; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.state.x = x;
    this.state.y = y;
  }

  _recompute() {
    this.down = new Set();
    for (const c of this.codes) { const a = KEYMAP[c]; if (a) this.down.add(a); }
  }

  held(a) { return this.down.has(a) || this.pad.held.has(a); }
  pressed(a) { return this._pressed.has(a); }
  anyPressed() { return this._anyPressed; }
  // Confirm in menus: Enter, Space (jump) or pad A/Start
  confirmPressed() { return this.pressed('confirm') || this.pressed('jump'); }
  clear() { this._pressed = new Set(); this._anyPressed = false; this.pressedQ.clear(); this.anyKeyQ = false; }
}

export const input = new Input();
