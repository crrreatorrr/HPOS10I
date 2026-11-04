// Audio for every system: Audio.playSfx('jump'), Audio.playMusic('z1'),
// Audio.stopMusic(). Web Audio with decoded buffers: effects start with no
// latency and the same effect twice in one frame plays once. Browsers keep
// audio locked until the first key press, click or tap; until then effects
// are skipped and the requested music waits for that gesture. A gamepad
// press while locked raises the "click or press a key for sound" hint.
// Missing or undecodable files are silent, so gameplay never waits on audio.

import { Signal } from '../runtime/signal';

export const SFX_NAMES = [
  'jump',
  'roll',
  'spindash_charge',
  'spindash_release',
  'skid',
  'ticket',
  'ticket_loss',
  'hurt',
  'death',
  'spring',
  'booster',
  'break_wall',
  'enemy_pop',
  'checkpoint',
  'goal_sign',
  'boss_hit',
  'boss_explode',
  'boss_telegraph',
  'enemy_telegraph',
  'one_up',
  'menu_move',
  'menu_select',
  'pause',
  'tally_tick',
  'emerald_get',
  'item_box',
  'shield',
  'power_up',
] as const;

export const MUSIC_NAMES = ['title', 'zone_select', 'z1', 'z2', 'z3', 'z4', 'boss', 'act_clear', 'game_over', 'invincible', 'ending'] as const;

export type SfxName = (typeof SFX_NAMES)[number];
export type MusicName = (typeof MUSIC_NAMES)[number];

/** Short tracks that play once instead of looping. */
const JINGLES: readonly string[] = ['act_clear', 'game_over'];
const MAX_SFX_VOICES = 8;
const SFX_GAIN = 1.0;
/** Music a little under the effects (-4 dB), quieter still while paused (-14 dB). */
const MUSIC_GAIN = Math.pow(10, -4 / 20);
const PAUSED_MUSIC_GAIN = Math.pow(10, -14 / 20);
const HINT_REPEAT_FRAMES = 15;

// Vite turns these into hashed URLs at build time (cached forever by the browser).
const SFX_URLS = import.meta.glob('/audio/sfx/*.ogg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const MUSIC_URLS = import.meta.glob('/audio/music/*.ogg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

function urlFor(table: Record<string, string>, dir: string, name: string): string | null {
  return table[`/audio/${dir}/${name}.ogg`] ?? null;
}

class AudioManager {
  readonly unlockHintChanged = new Signal<[boolean]>();
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer | null>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private voices: { src: AudioBufferSourceNode; started: number }[] = [];
  private lastStarted = new Map<string, number>();
  private frame = 0;
  private locked = true;
  private gamepadWhileLocked = false;
  private lastHintFrame = -HINT_REPEAT_FRAMES;
  private currentMusic = '';
  private musicSource: AudioBufferSourceNode | null = null;
  private musicToken = 0;
  private ducked = false;
  private muted = false;
  /** Effects heard this session (tests read it; the game never does). */
  readonly history: string[] = [];

  /** Creates the context and wires the unlock gesture (browser only). */
  attach(target: Window): void {
    const w = target as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const sfx = ctx.createGain();
    sfx.gain.value = SFX_GAIN;
    sfx.connect(ctx.destination);
    this.sfxBus = sfx;
    const music = ctx.createGain();
    music.gain.value = MUSIC_GAIN;
    music.connect(ctx.destination);
    this.musicBus = music;
    this.locked = ctx.state !== 'running';
    const unlock = () => {
      if (!this.ctx) return;
      void this.ctx.resume().then(() => this.setLocked(false));
      if (this.ctx.state === 'running') this.setLocked(false);
    };
    for (const type of ['keydown', 'pointerdown', 'touchend', 'mousedown'] as const) {
      target.addEventListener(type, unlock, { capture: true, passive: true });
    }
    target.addEventListener('gamepadconnected', () => {
      if (this.locked) this.gamepadUsedWhileLocked();
    });
    // Preload the small effects so the first play never waits.
    for (const name of SFX_NAMES) void this.load('sfx', name);
  }

  /** Called once per rendered frame by the game. */
  tick(paused: boolean, padActivity: boolean): void {
    this.frame++;
    if (this.locked && padActivity) this.gamepadUsedWhileLocked(true);
    if (paused !== this.ducked && this.musicBus && this.ctx) {
      this.ducked = paused;
      this.musicBus.gain.setTargetAtTime(paused ? PAUSED_MUSIC_GAIN : MUSIC_GAIN, this.ctx.currentTime, 0.05);
    }
  }

  isLocked(): boolean {
    return this.locked;
  }

  needsUnlockHint(): boolean {
    return this.locked && this.gamepadWhileLocked;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.sfxBus && this.musicBus) {
      this.sfxBus.gain.value = muted ? 0 : SFX_GAIN;
      this.musicBus.gain.value = muted ? 0 : this.ducked ? PAUSED_MUSIC_GAIN : MUSIC_GAIN;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  private setLocked(locked: boolean): void {
    if (this.locked === locked) return;
    this.locked = locked;
    if (!locked) {
      if (this.gamepadWhileLocked) {
        this.gamepadWhileLocked = false;
        this.unlockHintChanged.emit(false);
      }
      if (this.currentMusic && !this.musicSource) this.startMusic(this.currentMusic);
    }
  }

  private gamepadUsedWhileLocked(throttled = false): void {
    if (throttled && this.gamepadWhileLocked && this.frame - this.lastHintFrame < HINT_REPEAT_FRAMES) return;
    this.gamepadWhileLocked = true;
    this.lastHintFrame = this.frame;
    this.unlockHintChanged.emit(true);
  }

  private load(dir: 'sfx' | 'music', name: string): Promise<AudioBuffer | null> {
    const key = `${dir}/${name}`;
    const known = this.loading.get(key);
    if (known) return known;
    const url = urlFor(dir === 'sfx' ? SFX_URLS : MUSIC_URLS, dir, name);
    const ctx = this.ctx;
    const p = (async () => {
      if (!url || !ctx) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.arrayBuffer();
        return await ctx.decodeAudioData(data);
      } catch {
        return null;
      }
    })().then((buf) => {
      this.buffers.set(key, buf);
      return buf;
    });
    this.loading.set(key, p);
    return p;
  }

  playSfx(name: SfxName): void {
    this.history.push(name);
    if (this.history.length > 256) this.history.splice(0, 128);
    if (this.locked || !this.ctx || !this.sfxBus) return;
    const buf = this.buffers.get(`sfx/${name}`);
    if (!buf) {
      void this.load('sfx', name);
      return;
    }
    if (this.lastStarted.get(name) === this.frame) return;
    this.lastStarted.set(name, this.frame);
    if (this.voices.length >= MAX_SFX_VOICES) {
      const oldest = this.voices.shift();
      try {
        oldest?.src.stop();
      } catch {
        /* already ended */
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxBus);
    const voice = { src, started: this.frame };
    this.voices.push(voice);
    src.onended = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    };
    src.start();
  }

  playMusic(name: MusicName): void {
    if (name === this.currentMusic && (this.musicSource || this.locked)) return;
    this.currentMusic = name;
    this.stopSource();
    if (!this.locked) this.startMusic(name);
  }

  stopMusic(): void {
    this.currentMusic = '';
    this.stopSource();
  }

  currentMusicName(): string {
    return this.currentMusic;
  }

  private stopSource(): void {
    this.musicToken++;
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* already stopped */
      }
      this.musicSource.disconnect();
      this.musicSource = null;
    }
  }

  private startMusic(name: string): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const token = ++this.musicToken;
    void this.load('music', name).then((buf) => {
      if (token !== this.musicToken || this.currentMusic !== name || this.locked) return;
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = !JINGLES.includes(name);
      src.connect(bus);
      src.start();
      this.musicSource = src;
      src.onended = () => {
        if (this.musicSource === src) this.musicSource = null;
      };
    });
  }
}

export const Audio = new AudioManager();
