// DOM UI: HUD (slides in on change), boss bar, text boxes, tutorial pop-ups, banners, death cards, fades,
// and a generic "screen" layer used by menus and cutscenes.
import { Assets } from '../art/assets.js';
import { input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { save } from '../core/save.js';
import { SPEAKERS, TUTORIALS, DEATH_CAPTIONS, DEATH_ART } from '../story/script.js';
import { pick } from '../core/util.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class UI {
  constructor(root) {
    this.root = root;
    // HUD
    this.hud = h('div', 'hud');
    this.slots = {};
    const mk = (key, cls, img) => {
      const s = h('div', `hud-slot ${cls}`);
      if (img) { const i = h('img'); i.src = img; s.appendChild(i); }
      const v = h('span', 'v', '0');
      s.appendChild(v);
      this.hud.appendChild(s);
      this.slots[key] = { el: s, v, timer: 0, pinned: false };
    };
    mk('tickets', 'hud-tickets', Assets.url('ticket'));
    mk('lives', 'hud-lives', Assets.url('nobu_head'));
    mk('dogs', 'hud-dogs', Assets.url('dog_shiba_free'));
    // mask pips
    const m = h('div', 'hud-slot hud-mask');
    const pips = h('div', 'pips');
    this.pips = [];
    for (let i = 0; i < 3; i++) { const p = h('div', 'pip'); const im = h('img'); im.src = Assets.url('sproto_mask'); p.appendChild(im); pips.appendChild(p); this.pips.push(p); }
    m.appendChild(pips);
    this.hud.appendChild(m);
    this.slots.mask = { el: m, v: null, timer: 0 };
    root.appendChild(this.hud);

    // boss bar
    this.boss = h('div', '', '<img><div class="bb-body"><div class="bb-name"></div><div class="bb-track"><div class="bb-fill"></div></div><div class="bb-row"><div class="bb-phase"></div><div class="bb-sp"><span>SPECIAL</span><div class="bb-sptrack"><div class="bb-spfill"></div></div></div></div></div>');
    this.boss.id = 'bossbar';
    root.appendChild(this.boss);

    // text box
    this.tb = h('div', '', '<img class="tb-portrait"><div class="tb-body"><div class="tb-name"></div><div class="tb-text"></div></div><div class="tb-next">▼</div>');
    this.tb.id = 'textbox';
    if (!Assets.has('textbox')) this.tb.classList.add('fallback');
    root.appendChild(this.tb);
    this.dialog = null;

    // popup, banner, screen, fade
    this.popup = h('div', 'popup', '<img><div><div class="p-title"></div><div class="p-text"></div></div>');
    root.appendChild(this.popup);
    this.popupT = 0;
    this.bannerEl = h('div', 'banner');
    root.appendChild(this.bannerEl);
    this.bannerT = 0;
    this.screen = h('div', 'screen');
    root.appendChild(this.screen);
    this.fadeEl = h('div');
    this.fadeEl.id = 'fade';
    root.appendChild(this.fadeEl);
  }

  // ---------- HUD ----------
  setHud(key, value, { show = true, bump = true } = {}) {
    const s = this.slots[key];
    if (!s) return;
    if (key === 'mask') {
      this.pips.forEach((p, i) => p.classList.toggle('on', i < value));
    } else {
      s.v.textContent = value;
    }
    if (show) {
      s.timer = 2.6;
      s.el.classList.add('show');
      if (bump && s.v) { s.v.classList.remove('hud-bump'); void s.v.offsetWidth; s.v.classList.add('hud-bump'); }
    }
  }
  showHud(t = 3) { for (const s of Object.values(this.slots)) { s.timer = t; s.el.classList.add('show'); } }
  pinHud(on) { this.hudPinned = on; if (on) this.showHud(999); else for (const s of Object.values(this.slots)) s.timer = 1.5; }
  hideHud() { for (const s of Object.values(this.slots)) { s.timer = 0; s.el.classList.remove('show'); } }

  // ---------- boss bar ----------
  bossShow(name, portrait) {
    this.boss.querySelector('img').src = Assets.url(portrait);
    this.boss.querySelector('.bb-name').textContent = name;
    this.bossHp(1, 1);
    this.boss.classList.add('show');
  }
  bossHp(frac, phase) {
    this.boss.querySelector('.bb-fill').style.width = `${Math.max(0, frac) * 100}%`;
    this.boss.querySelector('.bb-phase').textContent = phase ? `PHASE ${phase}` : '';
  }
  // special-attack gauge: fills up, flashes when the ultimate is ready
  bossCharge(frac, ready = false) {
    const f = this.boss.querySelector('.bb-spfill');
    f.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.boss.classList.toggle('sp-ready', ready);
  }
  bossHide() { this.boss.classList.remove('show'); }

  // ---------- dialogue ----------
  // lines: [[speakerKey, text], ...] -> Promise
  say(lines) {
    return new Promise((resolve) => {
      this.dialog = { lines, i: -1, resolve, shown: 0, full: '', t: 0, hold: 0 };
      this._nextLine();
      this.tb.classList.add('show');
    });
  }
  get talking() { return !!this.dialog; }
  _nextLine() {
    const d = this.dialog;
    d.i++;
    if (d.i >= d.lines.length) {
      this.tb.classList.remove('show');
      const r = d.resolve;
      this.dialog = null;
      setTimeout(r, 120);
      return;
    }
    const [who, text] = d.lines[d.i];
    const sp = SPEAKERS[who] || SPEAKERS.narrator;
    d.full = text; d.shown = 0; d.t = 0; d.hold = 0.15; d.blip = sp.blip;
    const img = this.tb.querySelector('.tb-portrait');
    if (sp.portrait) { img.src = Assets.url(sp.portrait); img.style.display = ''; } else img.style.display = 'none';
    this.tb.querySelector('.tb-name').textContent = sp.name;
    this.tb.querySelector('.tb-text').textContent = '';
  }
  _updateDialog(dt) {
    const d = this.dialog;
    if (!d) return;
    d.hold -= dt;
    const img = this.tb.querySelector('.tb-portrait');
    if (d.shown < d.full.length) {
      d.t += dt * 55;
      const n = Math.min(d.full.length, Math.floor(d.t));
      if (n > d.shown) {
        if (Math.floor(n / 3) !== Math.floor(d.shown / 3)) audio.play(d.blip);
        d.shown = n;
        this.tb.querySelector('.tb-text').textContent = d.full.slice(0, n);
      }
      img.classList.add('talking');
    } else img.classList.remove('talking');
    this.tb.querySelector('.tb-next').style.visibility = d.shown >= d.full.length ? 'visible' : 'hidden';
    if (d.hold <= 0 && (input.confirmPressed() || input.pressed('bite'))) {
      if (d.shown < d.full.length) { d.shown = d.full.length; d.t = d.shown; this.tb.querySelector('.tb-text').textContent = d.full; }
      else { audio.play('menu'); this._nextLine(); }
    }
  }

  // ---------- tutorial pop-up (once per save) ----------
  tutorial(id) {
    const t = TUTORIALS[id];
    if (!t) return;
    save.data.tutorials ||= {};
    if (save.data.tutorials[id]) return;
    save.data.tutorials[id] = true;
    save.write();
    this.popup.querySelector('img').src = Assets.url(t.img);
    this.popup.querySelector('.p-title').textContent = t.title;
    this.popup.querySelector('.p-text').innerHTML = t.text;
    this.popup.classList.add('show');
    this.popupT = 6;
    audio.play('select');
  }

  banner(text, sub = '', dur = 1.8) {
    this.bannerEl.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.bannerEl.classList.add('show');
    this.bannerT = dur;
  }

  deathCard(type) {
    const img = DEATH_ART[type] || 'death_angel';
    const cap = pick(DEATH_CAPTIONS[type] || DEATH_CAPTIONS.angel);
    this.setScreen(`<div class="death-card"><img src="${Assets.url(img)}"><div class="big-title">${cap}</div></div>`, 'dim');
    requestAnimationFrame(() => this.screen.querySelector('.death-card')?.classList.add('show'));
  }

  // ---------- screens ----------
  setScreen(html, cls = '') {
    this.screen.className = `screen ${cls}`;
    this.screen.innerHTML = html;
  }
  clearScreen() { this.screen.className = 'screen'; this.screen.innerHTML = ''; }

  fade(to, dur = 0.45) {
    this.fadeEl.style.transition = `opacity ${dur}s`;
    this.fadeEl.style.opacity = to;
    return new Promise((r) => setTimeout(r, dur * 1000 + 30));
  }

  update(dt) {
    for (const s of Object.values(this.slots)) {
      if (this.hudPinned) continue;
      if (s.timer > 0) { s.timer -= dt; if (s.timer <= 0) s.el.classList.remove('show'); }
    }
    if (this.popupT > 0) { this.popupT -= dt; if (this.popupT <= 0) this.popup.classList.remove('show'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.remove('show'); }
    this._updateDialog(dt);
  }
}
