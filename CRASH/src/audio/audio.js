// All sound is synthesized with the Web Audio API: sound effects + a step sequencer for music.
import { SONGS } from './songs.js';

const NOTE_INDEX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function noteFreq(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) return 0;
  const midi = (parseInt(m[2], 10) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Parse "C5 . E5 - G5+B5 ." into steps: [{freqs:[...], len}, null, ...]
function parsePattern(str) {
  const toks = str.trim().split(/\s+/);
  const steps = new Array(toks.length).fill(null);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '.' || t === '-') continue;
    let len = 1;
    while (toks[i + len] === '-') len++;
    steps[i] = { freqs: t.split('+').map(noteFreq), len };
  }
  return steps;
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.6;
    this.sfxVol = 0.8;
    this.song = null;
    this.songName = null;
    this.rate = 1;
    this.muted = false;
  }

  // Must be called from a user gesture.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createDynamicsCompressor();
      this.master.threshold.value = -14;
      this.master.ratio.value = 4;
      this.master.connect(c.destination);
      this.musicGain = c.createGain();
      this.musicGain.gain.value = this.musicVol * 0.5;
      this.musicGain.connect(this.master);
      this.sfxGain = c.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.master);
      // white noise buffer
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._schedTimer = setInterval(() => this._schedule(), 25);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (this.ctx) {
      this.musicGain.gain.value = music * 0.5;
      this.sfxGain.gain.value = sfx;
    }
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---------- primitive voices ----------
  _osc(type, f0, f1, dur, vol, when = 0, dest = this.sfxGain, opts = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (opts.vibrato) {
      const lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = opts.vibrato; lg.gain.value = opts.vibDepth || 20;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.filter) {
      const f = c.createBiquadFilter();
      f.type = opts.filter; f.frequency.value = opts.freq || 1000; f.Q.value = opts.q || 1;
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noise(dur, vol, when = 0, filter = 'lowpass', f0 = 2000, f1 = null, q = 1, dest = this.sfxGain) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filter; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  // ---------- sound effects ----------
  play(name, p = 1) {
    if (!this.ctx || this.muted) return;
    const r = (a, b) => a + Math.random() * (b - a);
    switch (name) {
      case 'jump': this._osc('square', 260, 640, 0.14, 0.12); break;
      case 'doubleJump': this._osc('triangle', 520, 1250, 0.16, 0.2); this._osc('sine', 1600, 2400, 0.12, 0.06, 0.04); break;
      case 'land': this._osc('sine', 140, 60, 0.09, 0.25); break;
      case 'bite':
        this._noise(0.05, 0.35, 0, 'bandpass', 1600, 900, 2);
        this._noise(0.05, 0.4, 0.07, 'bandpass', 1400, 700, 2);
        this._osc('square', 180, 90, 0.08, 0.12, 0.07);
        break;
      case 'chompHit': this._osc('triangle', 700, 260, 0.12, 0.3); this._noise(0.1, 0.25, 0, 'highpass', 2500); break;
      case 'break':
        this._noise(0.28, 0.55, 0, 'lowpass', 3500, 250, 1);
        this._osc('sine', 110, 50, 0.18, 0.4);
        this._noise(0.06, 0.3, 0.05, 'bandpass', 2500, 2500, 3);
        break;
      case 'ticket': {
        const f = r(0.98, 1.04);
        this._osc('sine', 1320 * f, 1320 * f, 0.07, 0.18);
        this._osc('sine', 1975 * f, 1975 * f, 0.12, 0.16, 0.05);
        break;
      }
      case 'hiss':
        this._noise(0.75, 0.45, 0, 'highpass', 2600, 4200, 0.7);
        this._noise(0.7, 0.2, 0.02, 'bandpass', 5000, 3000, 4);
        break;
      case 'beep': this._osc('square', 880 * p, 880 * p, 0.12, 0.12); break;
      case 'pounce':
        this._osc('sawtooth', 220, 70, 0.4, 0.3, 0, this.sfxGain, { filter: 'lowpass', freq: 1200 });
        this._noise(0.4, 0.5, 0, 'lowpass', 2500, 200);
        this._osc('sawtooth', 600, 300, 0.25, 0.18, 0.02, this.sfxGain, { vibrato: 30, vibDepth: 80 });
        break;
      case 'explosion':
        this._noise(0.6, 0.8, 0, 'lowpass', 2200, 80, 0.8);
        this._osc('sine', 90, 30, 0.5, 0.6);
        break;
      case 'rugDeath':
        this._osc('sawtooth', 900, 90, 0.55, 0.25, 0, this.sfxGain, { filter: 'lowpass', freq: 2400 });
        this._noise(0.5, 0.35, 0.05, 'bandpass', 800, 3000, 1.5);
        this._osc('square', 300, 150, 0.2, 0.15, 0.55);
        this._osc('square', 220, 110, 0.35, 0.15, 0.75);
        break;
      case 'sphereBreak':
        for (const [f, d] of [[1800, 0.5], [2420, 0.4], [3150, 0.35], [4100, 0.25]]) this._osc('sine', f, f * 0.98, d, 0.12);
        this._noise(0.25, 0.25, 0, 'highpass', 4000);
        break;
      case 'mask':
        ['C6', 'E6', 'G6', 'C7', 'E7'].forEach((n, i) => this._osc('triangle', noteFreq(n), noteFreq(n), 0.18, 0.18, i * 0.055));
        this._osc('sine', 600, 2400, 0.4, 0.06);
        break;
      case 'maskLost': this._osc('square', 700, 200, 0.35, 0.16); this._osc('triangle', 1400, 500, 0.3, 0.1, 0.05); break;
      case 'conePop':
        this._osc('sine', 700, 140, 0.1, 0.4);
        this._noise(0.03, 0.4, 0, 'highpass', 3000);
        this._osc('triangle', 900, 1800, 0.14, 0.15, 0.08);
        break;
      case 'bark': {
        const base = p * r(0.95, 1.08);
        for (const [w, vol] of [[0, 1], [0.2, 0.85]]) {
          this._osc('sawtooth', 520 * base, 260 * base, 0.13, 0.28 * vol, w, this.sfxGain, { filter: 'bandpass', freq: 900, q: 2.5, attack: 0.01 });
          this._noise(0.08, 0.12 * vol, w, 'bandpass', 1200, 600, 2);
        }
        break;
      }
      case 'bossHit':
        this._osc('sine', 120, 40, 0.35, 0.7);
        this._noise(0.3, 0.6, 0, 'lowpass', 3000, 300);
        this._osc('square', 300, 120, 0.2, 0.2, 0.02);
        break;
      case 'bossRoar':
        this._osc('sawtooth', 160, 90, 1.0, 0.3, 0, this.sfxGain, { vibrato: 9, vibDepth: 25, filter: 'lowpass', freq: 900 });
        this._noise(0.9, 0.25, 0, 'bandpass', 600, 300, 1);
        break;
      case 'squash': this._osc('square', 420, 110, 0.12, 0.2); this._osc('sine', 200, 60, 0.12, 0.3); break;
      case 'knock': this._osc('triangle', 800, 280, 0.12, 0.3); this._noise(0.25, 0.15, 0.03, 'bandpass', 1200, 4000, 1); break;
      case 'hurt': this._osc('square', 500, 180, 0.3, 0.2); break;
      case 'death':
        ['G4', 'F#4', 'F4', 'E4'].forEach((n, i) => this._osc('square', noteFreq(n), noteFreq(n) * (i === 3 ? 0.7 : 1), i === 3 ? 0.6 : 0.16, 0.12, i * 0.18));
        break;
      case 'oneUp':
        ['E6', 'G6', 'E7', 'C7', 'D7', 'G7'].forEach((n, i) => this._osc('square', noteFreq(n), noteFreq(n), 0.1, 0.09, i * 0.08));
        break;
      case 'checkpoint':
        ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => this._osc('triangle', noteFreq(n), noteFreq(n), 0.2, 0.2, i * 0.07));
        this._noise(0.2, 0.15, 0, 'lowpass', 2000, 400);
        break;
      case 'boing': this._osc('sine', 180, 720, 0.32, 0.35, 0, this.sfxGain, { vibrato: 18, vibDepth: 40 }); break;
      case 'slide': this._noise(0.35, 0.22, 0, 'lowpass', 1800, 400, 1); break;
      case 'flopStart': this._osc('sine', 1400, 500, 0.25, 0.12); break;
      case 'flop': this._osc('sine', 100, 35, 0.35, 0.7); this._noise(0.35, 0.5, 0, 'lowpass', 1500, 100); break;
      case 'invincible': ['C5', 'G5', 'C6', 'G6', 'C7'].forEach((n, i) => this._osc('sawtooth', noteFreq(n), noteFreq(n), 0.2, 0.07, i * 0.06)); break;
      case 'dizzy': this._osc('sine', 900, 500, 0.6, 0.12, 0, this.sfxGain, { vibrato: 10, vibDepth: 120 }); break;
      case 'shoot': this._osc('square', 300, 900, 0.1, 0.1); this._noise(0.08, 0.15, 0, 'highpass', 2000); break;
      case 'whoosh': this._noise(0.35, 0.3, 0, 'bandpass', 400, 2400, 1.5); break;
      case 'stomp': this._osc('sine', 80, 30, 0.5, 0.8); this._noise(0.4, 0.5, 0, 'lowpass', 900, 60); break;
      case 'menu': this._osc('square', 660, 660, 0.05, 0.08); break;
      case 'select': this._osc('square', 880, 1320, 0.12, 0.12); this._osc('triangle', 1320, 1760, 0.1, 0.1, 0.06); break;
      case 'blip': this._osc('square', 520 + Math.random() * 120, 520, 0.03, 0.04); break;
      case 'blipLow': this._osc('sawtooth', 160 + Math.random() * 40, 140, 0.05, 0.06, 0, this.sfxGain, { filter: 'lowpass', freq: 900 }); break;
      case 'switch': this._osc('square', 400, 400, 0.08, 0.15); this._osc('square', 800, 800, 0.15, 0.15, 0.09); break;
      case 'roll': this._noise(0.6, 0.3, 0, 'bandpass', 300, 1500, 2); break;
      case 'meow': this._osc('sawtooth', 700, 1100, 0.18, 0.15, 0, this.sfxGain, { filter: 'bandpass', freq: 1400, q: 3 }); this._osc('sawtooth', 1100, 600, 0.3, 0.15, 0.18, this.sfxGain, { filter: 'bandpass', freq: 1200, q: 3 }); break;
      case 'laugh':
        for (let i = 0; i < 5; i++) this._osc('sawtooth', 240 - i * 12, 200 - i * 12, 0.11, 0.15, i * 0.13, this.sfxGain, { filter: 'lowpass', freq: 1100 });
        break;
      default: break;
    }
  }

  // ---------- music ----------
  playMusic(name) {
    if (this.songName === name) return;
    this.songName = name;
    const def = SONGS[name];
    if (!def) { this.song = null; return; }
    this.song = {
      def,
      tracks: def.tracks.map((t) => ({ ...t, steps: parsePattern(t.notes) })),
      drums: def.drums || null,
      step: 0,
      nextTime: this.ctx ? this.ctx.currentTime + 0.05 : 0,
      loop: def.loop !== false,
    };
  }

  stopMusic() { this.song = null; this.songName = null; }

  setRate(r) { this.rate = r; }

  _schedule() {
    const c = this.ctx;
    if (!c || !this.song) return;
    const s = this.song;
    if (s.nextTime < c.currentTime - 0.2) s.nextTime = c.currentTime + 0.02;
    const stepDur = 60 / (s.def.bpm * this.rate) / 4;
    while (s.nextTime < c.currentTime + 0.12) {
      this._playStep(s, s.step, s.nextTime, stepDur);
      s.step++;
      const len = s.tracks[0].steps.length;
      if (s.step >= len) {
        if (!s.loop) { this.song = null; this.songName = null; return; }
        s.step = 0;
      }
      s.nextTime += stepDur;
    }
  }

  _playStep(s, i, when, stepDur) {
    const c = this.ctx;
    const w = when - c.currentTime;
    for (const tr of s.tracks) {
      const st = tr.steps[i % tr.steps.length];
      if (!st) continue;
      const dur = Math.max(0.05, st.len * stepDur * (tr.gate ?? 0.9));
      for (const f of st.freqs) {
        if (!f) continue;
        const v = (tr.vol ?? 0.15) / Math.sqrt(st.freqs.length);
        if (tr.pluck) this._osc(tr.wave, f, f, Math.min(dur, tr.pluck), v, w, this.musicGain, { attack: 0.003 });
        else this._osc(tr.wave, f, f * (tr.slide || 1), dur, v, w, this.musicGain, { attack: tr.attack ?? 0.01, filter: tr.filter, freq: tr.cutoff, vibrato: tr.vibrato, vibDepth: tr.vibDepth });
      }
    }
    if (s.drums) {
      const d = s.drums;
      const at = (pat) => pat && pat[i % pat.length] === 'x';
      const ac = (pat) => pat && pat[i % pat.length] === 'X';
      if (at(d.kick) || ac(d.kick)) this._osc('sine', 150, 45, 0.16, ac(d.kick) ? 0.75 : 0.55, w, this.musicGain);
      if (at(d.snare)) { this._noise(0.12, 0.28, w, 'highpass', 1500, null, 0.7, this.musicGain); this._osc('triangle', 220, 160, 0.08, 0.12, w, this.musicGain); }
      if (at(d.hat)) this._noise(0.03, 0.09, w, 'highpass', 7000, null, 1, this.musicGain);
      if (ac(d.hat)) this._noise(0.12, 0.1, w, 'highpass', 6000, null, 1, this.musicGain);
      if (at(d.clank)) { this._osc('square', 1800, 1700, 0.05, 0.05, w, this.musicGain); this._noise(0.05, 0.12, w, 'bandpass', 3500, null, 6, this.musicGain); }
      if (at(d.shaker)) this._noise(0.05, 0.05, w, 'bandpass', 9000, null, 2, this.musicGain);
    }
  }
}

export const audio = new AudioEngine();
