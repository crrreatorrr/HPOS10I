// Audio for every system: Audio.playSfx('jump'), Audio.playMusic('z1'),
// Audio.stopMusic(). Web Audio with decoded buffers: effects start with no
// latency and the same effect twice in one frame plays once. Browsers keep
// audio locked until the first key press, click or tap; until then effects
// are skipped and the requested music waits for that gesture. A gamepad
// press while locked raises the "click or press a key for sound" hint.
// Missing or undecodable files are silent, so gameplay never waits on audio.
// Every file ships as Ogg Vorbis and as AAC (.m4a): Safari and every iOS
// browser cannot decode Ogg with Web Audio, so the format is picked once with
// canPlayType, and a file that fails to decode is retried in the other format.
// Only the menu effects load at boot; the rest load at the unlock gesture
// (effects cannot play before it anyway).

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

export const MUSIC_NAMES = ['title', 'zone_select', 'z1', 'z2', 'z3', 'z4', 'boss', 'act_clear', 'game_over'] as const;

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

/** Effects the title and menus use, loaded at boot. */
const BOOT_SFX: readonly SfxName[] = ['menu_move', 'menu_select'];

// Vite turns these into hashed URLs at build time (cached forever by the browser).
const SFX_URLS = import.meta.glob('/audio/sfx/*.{ogg,m4a}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const MUSIC_URLS = import.meta.glob('/audio/music/*.{ogg,m4a}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export type AudioFormat = 'ogg' | 'm4a';

function urlFor(table: Record<string, string>, dir: string, name: string, format: AudioFormat): string | null {
  return table[`/audio/${dir}/${name}.${format}`] ?? null;
}

/** Ogg where the browser says it can play Vorbis, else AAC (Safari, iOS). */
export function pickAudioFormat(probe: { canPlayType(type: string): string } | null): AudioFormat {
  if (!probe) return 'ogg';
  try {
    return probe.canPlayType('audio/ogg; codecs="vorbis"') !== '' ? 'ogg' : 'm4a';
  } catch {
    return 'm4a';
  }
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
  private format: AudioFormat = 'ogg';
  /** Effects heard this session (tests read it; the game never does). */
  readonly history: string[] = [];

  /** Creates the context and wires the unlock gesture (browser only). */
  attach(target: Window): void {
    const w = target as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const doc = (target as unknown as { document?: Document }).document;
    this.format = pickAudioFormat(doc ? (doc.createElement('audio') as { canPlayType(type: string): string }) : null);
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
    // The menu effects now; the rest at the unlock gesture, so the boot is not a request storm.
    for (const name of BOOT_SFX) void this.load('sfx', name);
    if (!this.locked) this.preloadAllSfx();
  }

  /** Loads every effect that is not loaded yet (the first play never waits). */
  preloadAllSfx(): void {
    if (!this.ctx) return;
    for (const name of SFX_NAMES) void this.load('sfx', name);
  }

  /** The format in use ('ogg', or 'm4a' where Ogg cannot be decoded). */
  audioFormat(): AudioFormat {
    return this.format;
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
      this.preloadAllSfx();
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
    const table = dir === 'sfx' ? SFX_URLS : MUSIC_URLS;
    const ctx = this.ctx;
    const fetchDecode = async (format: AudioFormat): Promise<AudioBuffer | null> => {
      const url = urlFor(table, dir, name, format);
      if (!url || !ctx) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.arrayBuffer();
        return await ctx.decodeAudioData(data);
      } catch {
        return null;
      }
    };
    const p = (async () => {
      const first = this.format;
      const buf = await fetchDecode(first);
      if (buf) return buf;
      // canPlayType can promise a format decodeAudioData then refuses: try the other one,
      // and keep it for the rest of the session when it works.
      const other: AudioFormat = first === 'ogg' ? 'm4a' : 'ogg';
      const fallback = await fetchDecode(other);
      if (fallback && this.format === first) this.format = other;
      return fallback;
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
