#!/usr/bin/env python3
"""Procedural placeholder audio for HPOS10I: original chiptune-style sound
effects and two short looping tracks, synthesised from square, triangle and
noise voices (like an early-90s console sound chip), then encoded to Ogg
Vorbis with ffmpeg.

  python3 audio/tools/make_audio.py           # everything
  python3 audio/tools/make_audio.py jump z1   # only these names

Writes audio/sfx/<name>.ogg for every SFX name in docs/CONTRACTS.md and
audio/music/<name>.ogg for every music name: seven loops plus the act_clear
and game_over jingles. Music gets an .import stub (loop=true for loops,
false for jingles) before Godot first imports it. WAVs only live in a temp folder (the project must hold
Ogg only). Uses ffmpeg's libvorbis when present, else its built-in Vorbis
encoder (stereo-only, so mono is duplicated to two channels).

Every melody, rhythm and sound here was composed for this project.
"""

import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # audio/
SFX_DIR = os.path.join(ROOT, "sfx")
MUSIC_DIR = os.path.join(ROOT, "music")
RNG = np.random.default_rng(1990)

# Peak ceiling after normalisation (QA wants below -0.5 dBFS after encoding).
PEAK_DB = -2.0
SFX_RMS_DB = -14.0
# Per-effect level offsets (dB) after normalising, for sounds that play often.
SFX_GAIN_DB = {"enemy_telegraph": -7.0}


# ---------------------------------------------------------------------------
# Oscillators


def _t(dur):
    return np.arange(int(round(dur * SR))) / SR


def _freq_array(freq, n):
    if np.isscalar(freq):
        return np.full(n, float(freq))
    return np.asarray(freq, dtype=float)


def _polyblep(phase, dt):
    out = np.zeros_like(phase)
    m = phase < dt
    x = phase[m] / dt[m]
    out[m] = x + x - x * x - 1.0
    m = phase > 1.0 - dt
    x = (phase[m] - 1.0) / dt[m]
    out[m] = x * x + x + x + 1.0
    return out


def square(freq, dur, duty=0.5, phase0=0.0):
    """Band-limited pulse wave; freq may be a per-sample array (sweeps)."""
    n = int(round(dur * SR))
    f = _freq_array(freq, n)
    dt = np.clip(f / SR, 1e-6, 0.5)
    phase = (phase0 + np.cumsum(dt)) % 1.0
    y = np.where(phase < duty, 1.0, -1.0)
    y += _polyblep(phase, dt)
    y -= _polyblep((phase - duty) % 1.0, dt)
    return y


def triangle(freq, dur, steps=16):
    """Stepped (4-bit) triangle, the classic chip bass voice."""
    n = int(round(dur * SR))
    f = _freq_array(freq, n)
    phase = np.cumsum(f / SR) % 1.0
    tri = 2.0 * np.abs(2.0 * phase - 1.0) - 1.0
    q = (steps - 1) / 2.0
    return np.round((tri + 1.0) * q) / q - 1.0


def noise(dur, rate=SR, seed=None):
    """Sample-and-hold noise; lower `rate` sounds grittier."""
    n = int(round(dur * SR))
    rng = RNG if seed is None else np.random.default_rng(seed)
    if np.isscalar(rate):
        idx = (np.arange(n) * (rate / SR)).astype(int)
    else:
        idx = np.cumsum(np.asarray(rate) / SR).astype(int)
    vals = rng.choice([-1.0, 1.0], size=idx[-1] + 1 if n else 1)
    return vals[idx]


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array (sweeping filter)."""
    c = _freq_array(cutoff, len(x))
    a = 1.0 - np.exp(-2.0 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def sweep(f0, f1, dur, curve="exp"):
    n = int(round(dur * SR))
    if curve == "exp":
        return f0 * (f1 / f0) ** np.linspace(0.0, 1.0, n)
    return np.linspace(f0, f1, n)


def env(dur, attack=0.002, decay=0.0, sustain=1.0, release=0.02, hold=None):
    """ADSR. `hold` = seconds before release starts (default: dur - release)."""
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    hold = dur - release if hold is None else hold
    e = np.ones(n) * sustain
    if decay > 0:
        e = np.where(t < attack + decay,
                     1.0 - (1.0 - sustain) * np.clip((t - attack) / decay, 0, 1), sustain)
    if attack > 0:
        e = np.where(t < attack, t / attack, e)
    rel = np.clip((t - hold) / max(release, 1e-6), 0.0, 1.0)
    return e * (1.0 - rel)


def expdecay(dur, tau):
    return np.exp(-_t(dur) / tau)


def vibrato(base, dur, rate=6.0, depth=0.01):
    return base * (1.0 + depth * np.sin(2 * np.pi * rate * _t(dur)))


def midi(note):
    return 440.0 * 2.0 ** ((note - 69) / 12.0)


def cat(*parts):
    return np.concatenate(parts)


def silence(dur):
    return np.zeros(int(round(dur * SR)))


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def at(x, offset, total):
    out = np.zeros(int(round(total * SR)))
    i = int(round(offset * SR))
    seg = x[:max(0, len(out) - i)]
    out[i:i + len(seg)] += seg
    return out


def tone(note_or_freq, dur, duty=0.5, is_midi=True, tau=None, release=0.02):
    f = midi(note_or_freq) if is_midi else note_or_freq
    y = square(f, dur, duty)
    return y * (expdecay(dur, tau) if tau else 1.0) * env(dur, release=release)


# ---------------------------------------------------------------------------
# Sound effects (one function per contract name)


def sfx_jump():
    d = 0.2
    f = sweep(260, 780, d)
    return square(f, d, 0.25) * env(d, release=0.06) * expdecay(d, 0.16)


def sfx_roll():
    d = 0.24
    whoosh = lowpass(noise(d, 22000), sweep(5000, 600, d)) * expdecay(d, 0.09)
    body = square(sweep(420, 160, d), d, 0.5) * expdecay(d, 0.05) * 0.4
    return (whoosh * 1.6 + body) * env(d, release=0.05)


def sfx_spindash_charge():
    d = 0.3
    f = sweep(300, 1250, d) * (1.0 + 0.04 * np.sin(2 * np.pi * 38 * _t(d)))
    rev = square(f, d, 0.25) * env(d, attack=0.004, release=0.08)
    hiss = lowpass(noise(d, 20000), 3000) * expdecay(d, 0.12) * 0.35
    return rev + hiss


def sfx_spindash_release():
    d = 0.42
    burst = lowpass(noise(d, 18000), sweep(7000, 400, d)) * expdecay(d, 0.12) * 1.4
    zoom = square(cat(sweep(900, 220, 0.12), sweep(220, 1400, d - 0.12)), d, 0.25)
    return burst + zoom * env(d, release=0.12) * 0.7


def sfx_skid():
    d = 0.28
    trem = 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 34 * _t(d)))
    screech = square(sweep(1500, 1100, d), d, 0.125) * trem * 0.45
    grit = lowpass(noise(d, 9000), 2500) * 0.9
    return (screech + grit) * env(d, attack=0.004, release=0.09)


def sfx_ticket():
    # Two bright notes, the second one rings.
    a = tone(83, 0.07, 0.25, release=0.005)
    b = tone(90, 0.32, 0.25, tau=0.11, release=0.08)
    shimmer = square(midi(102), 0.32, 0.5) * expdecay(0.32, 0.05) * 0.18
    return cat(a, mix(b, shimmer))


def sfx_ticket_loss():
    notes = [96, 91, 88, 84, 79, 76, 72, 67]
    out = [tone(n, 0.05, 0.25, release=0.01) * (1.0 - i * 0.07) for i, n in enumerate(notes)]
    tail = lowpass(noise(0.25, 16000), 6000) * expdecay(0.25, 0.08) * 0.4
    return mix(cat(*out), at(tail, 0.1, 0.4))


def sfx_hurt():
    d = 0.36
    buzz = square(sweep(520, 110, d), d, 0.5) * expdecay(d, 0.16)
    crunch = lowpass(noise(d, 6000), 1800) * expdecay(d, 0.06) * 1.2
    return (buzz * 0.8 + crunch) * env(d, release=0.08)


def sfx_death():
    d = 0.9
    f = vibrato(sweep(660, 70, d), d, 9.0, 0.05)
    fall = square(f, d, 0.5) * env(d, attack=0.004, release=0.2)
    thud = triangle(sweep(140, 40, 0.25), 0.25) * expdecay(0.25, 0.1)
    return mix(fall * 0.7, at(thud, 0.0, d))


def sfx_spring():
    d = 0.45
    f = vibrato(sweep(180, 820, d), d, 14.0, 0.07)
    boing = triangle(f, d) * env(d, attack=0.002, release=0.15)
    ping = square(sweep(500, 1600, 0.09), 0.09, 0.25) * expdecay(0.09, 0.05) * 0.5
    return mix(boing, ping)


def sfx_booster():
    d = 0.5
    rush = lowpass(noise(d, 22000), sweep(500, 9000, d)) * env(d, attack=0.05, release=0.2) * 1.3
    rise = square(sweep(200, 1300, d), d, 0.125) * env(d, attack=0.02, release=0.2) * 0.45
    return rush + rise


def sfx_break_wall():
    d = 0.6
    crash = lowpass(noise(d, 12000), sweep(6000, 300, d)) * expdecay(d, 0.16) * 1.4
    thump = triangle(sweep(110, 38, 0.3), 0.3) * expdecay(0.3, 0.12)
    rubble = noise(d, 2500) * expdecay(d, 0.25) * 0.25
    return mix(crash, thump, rubble) * env(d, release=0.15)


def sfx_enemy_pop():
    d = 0.3
    pop = lowpass(noise(0.12, 16000), 5000) * expdecay(0.12, 0.03) * 1.3
    blip = square(sweep(900, 260, 0.16), 0.16, 0.5) * expdecay(0.16, 0.07) * 0.7
    sparkle = square(midi(98), 0.12, 0.25) * expdecay(0.12, 0.04) * 0.3
    return mix(pop, blip, at(sparkle, 0.12, d))


def sfx_checkpoint():
    notes = [76, 81, 85, 88, 93]
    out = cat(*[tone(n, 0.06, 0.25, release=0.01) for n in notes[:-1]],
              tone(notes[-1], 0.4, 0.25, tau=0.14, release=0.1))
    echo = np.zeros(len(out) + int(0.09 * SR))
    echo[:len(out)] += out
    echo[int(0.09 * SR):] += out * 0.35
    return echo


def sfx_goal_sign():
    # The sign spins: a fast alternating flutter that slows and settles.
    d = 1.3
    t = _t(d)
    rate = 26.0 * np.exp(-t / 0.7) + 3.0
    gate = np.sign(np.sin(2 * np.pi * np.cumsum(rate) / SR))
    f = np.where(gate > 0, midi(88), midi(84))
    flutter = square(f, d, 0.25) * env(d, release=0.3) * 0.7
    chime = tone(95, 0.6, 0.25, tau=0.2, release=0.15)
    return mix(flutter, at(chime, 0.7, d))


def sfx_boss_hit():
    d = 0.45
    clang = mix(square(midi(57), d, 0.5), square(midi(57) * 1.41, d, 0.5) * 0.6,
                square(midi(57) * 2.73, d, 0.25) * 0.4) * expdecay(d, 0.09)
    smack = lowpass(noise(0.1, 18000), 6000) * expdecay(0.1, 0.02) * 1.5
    return mix(clang * 0.6, smack) * env(d, release=0.1)


def sfx_boss_explode():
    d = 1.4
    boom = lowpass(noise(d, 8000), sweep(4000, 200, d)) * expdecay(d, 0.45) * 1.6
    rumble = triangle(sweep(90, 30, d), d) * expdecay(d, 0.5) * 0.8
    pops = np.zeros(int(round(d * SR)))
    for k, offset in enumerate([0.0, 0.18, 0.33, 0.52, 0.74]):
        pop = lowpass(noise(0.16, 14000, seed=k), 5000) * expdecay(0.16, 0.04)
        pops += at(pop, offset, d) * (1.0 - k * 0.12)
    return mix(boom, rumble, pops) * env(d, release=0.3)


def sfx_boss_telegraph():
    # Two-tone warning, twice.
    beep_hi = tone(81, 0.11, 0.5, release=0.01)
    beep_lo = tone(74, 0.11, 0.5, release=0.01)
    gap = silence(0.03)
    return cat(beep_hi, gap, beep_lo, gap, beep_hi, gap, beep_lo)


def sfx_enemy_telegraph():
    # A pill robot about to act: a quick, light rising blip (thin pulse, two
    # notes a fifth apart), much softer and shorter than the boss warning.
    a = tone(86, 0.05, 0.125, release=0.008)
    b = square(vibrato(midi(93), 0.13, 18.0, 0.012), 0.13, 0.125) \
        * expdecay(0.13, 0.06) * env(0.13, release=0.04)
    return cat(a, silence(0.015), b)


def sfx_emerald_get():
    # The act's emerald: a bright upward run that blooms into a shimmering
    # held chord with high glints (about 0.9 s).
    run = [81, 85, 88, 92, 93]
    seq = cat(*[tone(n, 0.045, 0.125, release=0.01) for n in run])
    d = 0.75
    bloom = mix(square(vibrato(midi(97), d, 7.0, 0.006), d, 0.25) * 0.45,
                square(vibrato(midi(100), d, 7.5, 0.006), d, 0.125) * 0.35,
                triangle(midi(85), d) * 0.5) * expdecay(d, 0.28) * env(d, attack=0.004, release=0.2)
    glints = np.zeros(int(round(d * SR)))
    for k, (offset, note) in enumerate([(0.08, 105), (0.22, 109), (0.37, 104), (0.5, 108)]):
        g = square(midi(note), 0.05, 0.5) * expdecay(0.05, 0.015) * (0.35 - k * 0.05)
        glints += at(g, offset, d)
    return cat(seq, mix(bloom, glints))


def sfx_one_up():
    # A short original fanfare: up the scale, a skip, and a held top note.
    seq = [(72, 0.09), (76, 0.09), (79, 0.09), (84, 0.09), (81, 0.09), (84, 0.09), (88, 0.42)]
    lead = cat(*[tone(n, d, 0.25, release=0.015) for n, d in seq])
    bass_notes = [(48, 0.36), (53, 0.18), (55, 0.42)]
    bass = cat(*[triangle(midi(n), d) * env(d, release=0.03) for n, d in bass_notes])
    return mix(lead * 0.8, bass * 0.6)


def sfx_menu_move():
    return tone(88, 0.045, 0.25, release=0.015)


def sfx_menu_select():
    return cat(tone(84, 0.05, 0.25, release=0.008), tone(91, 0.14, 0.25, tau=0.06, release=0.04))


def sfx_pause():
    return cat(tone(79, 0.06, 0.5, release=0.01), tone(72, 0.06, 0.5, release=0.01),
               tone(84, 0.12, 0.5, tau=0.05, release=0.04))


def sfx_tally_tick():
    return square(midi(96), 0.035, 0.5) * env(0.035, release=0.012)


SFX = {
    "jump": sfx_jump, "roll": sfx_roll, "spindash_charge": sfx_spindash_charge,
    "spindash_release": sfx_spindash_release, "skid": sfx_skid, "ticket": sfx_ticket,
    "ticket_loss": sfx_ticket_loss, "hurt": sfx_hurt, "death": sfx_death,
    "spring": sfx_spring, "booster": sfx_booster, "break_wall": sfx_break_wall,
    "enemy_pop": sfx_enemy_pop, "checkpoint": sfx_checkpoint, "goal_sign": sfx_goal_sign,
    "boss_hit": sfx_boss_hit, "boss_explode": sfx_boss_explode,
    "boss_telegraph": sfx_boss_telegraph, "enemy_telegraph": sfx_enemy_telegraph,
    "emerald_get": sfx_emerald_get, "one_up": sfx_one_up,
    "menu_move": sfx_menu_move, "menu_select": sfx_menu_select, "pause": sfx_pause,
    "tally_tick": sfx_tally_tick,
}


# ---------------------------------------------------------------------------
# Music: a tiny four-voice sequencer (lead, arpeggio, bass, drums). Patterns
# are in eighth notes: a MIDI number starts a note, "-" holds it, "." rests.


class Song:
    def __init__(self, bpm, bars, loop=True, tail=1.0):
        self.step = 60.0 / bpm / 2.0  # one eighth note
        self.bars = bars
        self.loop = loop
        self.length = int(round(self.step * 8 * bars * SR))
        if not loop:
            # Jingles: no wrap-around; let the last notes ring out.
            self.length += int(round(tail * SR))
        self.buf = np.zeros(self.length)

    def add(self, start_s, wave_):
        """Mixes in, wrapping the tail to the start so the loop is seamless
        (jingles just clip at the end of their tail)."""
        if not self.loop:
            i = int(round(start_s * SR))
            seg = wave_[:max(0, self.length - i)]
            self.buf[i:i + len(seg)] += seg
            return
        i = int(round(start_s * SR)) % self.length
        n = len(wave_)
        first = min(n, self.length - i)
        self.buf[i:i + first] += wave_[:first]
        rest = wave_[first:]
        while len(rest):
            k = min(len(rest), self.length)
            self.buf[:k] += rest[:k]
            rest = rest[k:]

    def lead(self, bars, gain=0.3, duty=0.25, echo=0.22, octave=0):
        notes = _parse([s for bar in bars for s in bar])
        for slot, note, length in notes:
            d = length * self.step
            f = midi(note + 12 * octave)
            if d > 0.3:
                vib_depth = np.clip((_t(d) - 0.18) / 0.2, 0, 1) * 0.008
                f = f * (1.0 + vib_depth * np.sin(2 * np.pi * 5.5 * _t(d)))
            w = square(f, d, duty) * env(d, attack=0.004, decay=0.12, sustain=0.75, release=0.03)
            # A soft echo voice an eighth later gives the lead some space.
            self.add(slot * self.step, w * gain)
            if echo:
                self.add((slot + 1) * self.step, w * gain * echo)

    def arp(self, chords, gain=0.12, duty=0.125, pattern=(0, 1, 2, 1)):
        sixteenth = self.step / 2.0
        for b, chord in enumerate(chords):
            for k in range(16):
                note = chord[pattern[k % len(pattern)]]
                w = square(midi(note), sixteenth, duty) * env(sixteenth, release=0.02) \
                    * expdecay(sixteenth, 0.07)
                self.add((b * 16 + k) * sixteenth, w * gain)

    def bass(self, roots, patterns, gain=0.42):
        """Patterns of 8 (eighths) or 16 (sixteenths) slots per bar."""
        for b, root in enumerate(roots):
            pat = patterns[b % len(patterns)]
            step = self.step * 8.0 / len(pat)
            for slot, offset, length in _parse_offsets(pat):
                d = length * step
                w = triangle(midi(root + offset), d) * env(d, attack=0.003, release=min(0.03, d / 3))
                self.add(b * 8 * self.step + slot * step, w * gain)

    def drums(self, patterns, gain=1.0):
        kick = _kick()
        snare = _snare()
        hat = _hat()
        for b, pat in enumerate(patterns):
            for k, ch in enumerate(pat):
                t = (b * 16 + k) * self.step / 2.0
                if ch == "K":
                    self.add(t, kick * 0.62 * gain)
                elif ch == "S":
                    self.add(t, snare * 0.42 * gain)
                elif ch == "h":
                    self.add(t, hat * 0.16 * gain)
                elif ch == "o":
                    self.add(t, _hat(0.09) * 0.14 * gain)

    def render(self):
        y = np.tanh(self.buf * 1.1) / np.tanh(1.1)
        return y


def _parse(slots):
    out = []
    for i, s in enumerate(slots):
        if isinstance(s, int):
            length = 1
            j = i + 1
            while j < len(slots) and slots[j] == "-":
                length += 1
                j += 1
            out.append((i, s, length))
    return out


def _parse_offsets(pattern):
    """Bass pattern: ints are semitone offsets from the bar's root."""
    return _parse(pattern)


_DRUM_CACHE = {}


def _kick():
    if "kick" not in _DRUM_CACHE:
        d = 0.16
        click = lowpass(noise(0.01, 20000, seed=7), 4000) * 0.4
        _DRUM_CACHE["kick"] = mix(triangle(sweep(150, 42, d), d) * expdecay(d, 0.06), click)
    return _DRUM_CACHE["kick"]


def _snare():
    if "snare" not in _DRUM_CACHE:
        d = 0.16
        body = triangle(sweep(240, 160, d), d) * expdecay(d, 0.04) * 0.6
        rattle = lowpass(noise(d, 15000, seed=3), 6500) * expdecay(d, 0.05) * 1.2
        _DRUM_CACHE["snare"] = body + rattle
    return _DRUM_CACHE["snare"]


def _hat(d=0.03):
    key = "hat%.3f" % d
    if key not in _DRUM_CACHE:
        n = noise(d, 30000, seed=11)
        hp = n - lowpass(n, 6000)
        _DRUM_CACHE[key] = hp * expdecay(d, d / 3.0)
    return _DRUM_CACHE[key]


def song_z1():
    """Zone 1: 150 BPM, D major, 16 bars (25.6 s). Upbeat and sunny."""
    s = Song(150, 16)
    D, Bm, G, A, Em, Fsm = (74, 78, 81), (71, 74, 78), (67, 71, 74), (69, 73, 76), (76, 79, 83), (73, 78, 81)
    chords = [D, Bm, G, A, D, Bm, Em, A, G, A, Fsm, Bm, Em, A, D, A]
    s.lead([
        [74, "-", 73, 74, 76, "-", 74, "-"],
        [71, "-", "-", 69, 71, "-", 74, "-"],
        [79, "-", 78, 76, 74, "-", 71, "-"],
        [73, "-", 74, 76, 73, "-", 69, "-"],
        [74, "-", 73, 74, 78, "-", 76, 74],
        [76, "-", 74, 71, 74, "-", 78, "-"],
        [79, "-", 78, 79, 81, "-", 79, 78],
        [76, "-", "-", "-", 73, 74, 76, 73],
        [71, 74, 79, "-", 78, "-", 76, "-"],
        [73, 76, 81, "-", 79, "-", 78, "-"],
        [78, "-", 76, 73, 69, "-", 73, "-"],
        [74, "-", 76, 78, 76, "-", 74, "-"],
        [71, "-", 74, 79, 78, "-", 76, "-"],
        [76, "-", 78, 79, 81, "-", 79, "-"],
        [78, "-", 74, "-", 76, 78, 74, "-"],
        [73, "-", 76, "-", 81, "-", 76, 73],
    ], gain=0.3)
    s.arp(chords, gain=0.1)
    roots = [50, 47, 43, 45, 50, 47, 52, 45, 43, 45, 54, 47, 52, 45, 50, 45]
    bounce = [0, 12, 0, 12, 0, 12, 0, 12]
    drive = [0, "-", 12, 0, 7, "-", 12, 7]
    s.bass(roots, [bounce, bounce, bounce, drive, bounce, bounce, bounce, drive,
                   drive, drive, bounce, bounce, drive, drive, bounce, drive])
    beat = "K.h.S.hKK.h.S.h."
    beat2 = "K.h.S.hKK.hKS.h."
    fill = "K.h.S.hKS.SSS.SS"
    s.drums([beat, beat2, beat, beat2, beat, beat2, beat, fill,
             beat, beat2, beat, beat2, beat, beat2, beat, fill])
    return s.render()


def song_title():
    """Title: 120 BPM, G major, 8 bars (16 s). Bright and welcoming."""
    s = Song(120, 8)
    G, Em, C, D, Am = (67, 71, 74), (64, 67, 71), (64, 67, 72), (66, 69, 74), (64, 69, 72)
    chords = [G, Em, C, D, G, Em, Am, D]
    s.lead([
        [74, "-", "-", 71, 74, "-", 79, "-"],
        [76, "-", "-", 74, 71, "-", 67, "-"],
        [72, "-", 76, "-", 79, "-", 76, 72],
        [74, "-", "-", "-", 78, "-", 74, "-"],
        [79, "-", "-", 78, 76, "-", 74, "-"],
        [76, "-", 79, "-", 83, "-", 79, 76],
        [72, "-", 76, 81, 79, "-", 76, "-"],
        [78, "-", 74, "-", 78, 79, 81, "-"],
    ], gain=0.3, duty=0.5)
    s.arp(chords, gain=0.09, pattern=(0, 1, 2, 1, 2, 1))
    roots = [43, 40, 48, 50, 43, 40, 45, 50]
    walk = [0, "-", 12, "-", 0, "-", 7, 12]
    s.bass(roots, [walk])
    beat = "K...S...K.K.S..."
    hats = "K.h.S.h.K.hKS.h."
    fill = "K.h.S.h.K.S.SSSS"
    s.drums([beat, hats, hats, hats, beat, hats, hats, fill], gain=0.9)
    return s.render()


def song_zone_select():
    """Zone select: 128 BPM, F major, 8 bars (15 s). Light and bouncy."""
    s = Song(128, 8)
    F, Dm, Bb, C, Am = (72, 77, 81), (69, 74, 77), (70, 74, 77), (67, 72, 76), (69, 72, 76)
    s.lead([
        [72, "-", 77, "-", 76, 77, 79, "-"],
        [77, "-", 74, "-", 69, "-", 74, "-"],
        [70, "-", 74, 77, 82, "-", 81, 79],
        [77, "-", 76, "-", 79, "-", "-", "-"],
        [81, "-", 79, 77, 76, "-", 77, "-"],
        [76, "-", 72, "-", 69, "-", 72, 76],
        [74, "-", 77, "-", 82, "-", 79, 77],
        [76, "-", 72, "-", 67, "-", 72, "-"],
    ], gain=0.28, duty=0.25)
    s.arp([F, Dm, Bb, C, F, Am, Bb, C], gain=0.08, pattern=(0, 2, 1, 2))
    s.bass([41, 50, 46, 48, 41, 45, 46, 48], [[0, "-", 12, "-", 7, "-", 12, "-"]], gain=0.38)
    s.drums(["K...h...S...h..."] * 7 + ["K...h...S.S.SSS."], gain=0.8)
    return s.render()


def song_z2():
    """Wizard Academy: 132 BPM, D minor with a raised 7th, 16 bars (29 s).
    Mysterious and magical: a twinkling high arpeggio and a sighing lead."""
    s = Song(132, 16)
    Dm, Bb, Gm, A, F, C, Am = (74, 77, 81), (70, 74, 77), (67, 70, 74), (69, 73, 76), \
        (69, 72, 77), (67, 72, 76), (69, 72, 76)
    chords = [Dm, Bb, Gm, A, Dm, F, Gm, A, Bb, C, Am, Dm, Gm, Bb, A, A]
    s.lead([
        [81, "-", "-", 80, 81, "-", 77, "-"],
        [74, "-", 77, "-", 82, "-", 81, "-"],
        [79, "-", "-", 77, 74, "-", 70, "-"],
        [73, "-", 76, "-", 81, "-", "-", "-"],
        [81, "-", 82, 81, 77, "-", 74, "-"],
        [72, "-", 77, "-", 81, "-", 84, "-"],
        [82, "-", 81, 79, 77, "-", 74, 76],
        [73, "-", "-", "-", ".", ".", 69, 73],
        [74, "-", 77, 82, 81, "-", 77, "-"],
        [76, "-", 79, 84, 82, "-", 79, "-"],
        [81, "-", 76, "-", 72, "-", 76, 81],
        [77, "-", "-", 76, 74, "-", "-", "-"],
        [70, "-", 74, 79, 82, "-", 79, "-"],
        [77, "-", 82, "-", 86, "-", 84, 82],
        [81, "-", 80, "-", 81, "-", 85, "-"],
        [88, "-", "-", "-", 85, "-", 81, 76],
    ], gain=0.26, duty=0.125, echo=0.35)
    # Twinkle: chord tones an octave up, upward runs.
    s.arp([tuple(n + 12 for n in c) for c in chords], gain=0.06, duty=0.25, pattern=(0, 1, 2, 1, 2, 0))
    roots = [50, 46, 43, 45, 50, 41, 43, 45, 46, 48, 45, 50, 43, 46, 45, 45]
    s.bass(roots, [[0, "-", "-", 7, 12, "-", 7, "-"]], gain=0.36)
    soft = "K.......S...h.o."
    s.drums([soft] * 7 + ["K.......S...S.SS"] + [soft] * 7 + ["K...h...S.S.SSSS"], gain=0.7)
    return s.render()


def song_z3():
    """Capital Mansion: 112 BPM, C minor, 12 bars (25.7 s). Stately and
    tense: a dotted march with snare rolls."""
    s = Song(112, 12)
    Cm, Ab, Fm, G, Eb, Bb = (60, 63, 67), (60, 63, 68), (60, 65, 68), (62, 67, 71), (63, 67, 70), (62, 65, 70)
    chords = [Cm, Ab, Fm, G, Cm, Eb, Bb, G, Ab, Fm, G, G]
    s.lead([
        [72, "-", "-", 72, 75, "-", 79, "-"],
        [80, "-", "-", 79, 77, "-", 75, "-"],
        [77, "-", "-", 75, 72, "-", 68, "-"],
        [71, "-", "-", 74, 79, "-", "-", "-"],
        [79, "-", "-", 80, 79, "-", 75, "-"],
        [79, "-", "-", 82, 79, "-", 75, "-"],
        [74, "-", "-", 77, 82, "-", 77, "-"],
        [79, "-", 77, 75, 74, "-", 71, "-"],
        [72, "-", 75, 80, 84, "-", 80, "-"],
        [80, "-", 77, 72, 77, "-", 80, "-"],
        [79, "-", 83, "-", 86, "-", 83, "-"],
        [77, "-", 74, "-", 71, "-", 67, "-"],
    ], gain=0.28, duty=0.5, echo=0.18)
    s.arp(chords, gain=0.07, duty=0.5, pattern=(0, 2, 1, 2))
    roots = [48, 44, 41, 43, 48, 51, 46, 43, 44, 41, 43, 43]
    s.bass(roots, [[0, "-", 12, "-", 7, "-", 12, "-"]], gain=0.4)
    march = "K...S.SSK...S..."
    s.drums([march, march, march, "K...S.SSK.S.SSSS"] * 3, gain=0.85)
    return s.render()


def song_z4():
    """Neon Rush Remix: the Zone 1 tune at 172 BPM (16 bars, 22.3 s) with
    synthwave drive: sixteenth octave bass, four-on-the-floor, long echoes."""
    s = Song(172, 16)
    D, Bm, G, A, Em, Fsm = (74, 78, 81), (71, 74, 78), (67, 71, 74), (69, 73, 76), (76, 79, 83), (73, 78, 81)
    chords = [D, Bm, G, A, D, Bm, Em, A, G, A, Fsm, Bm, Em, A, D, A]
    s.lead([
        [74, "-", 73, 74, 76, "-", 74, "-"],
        [71, "-", "-", 69, 71, "-", 74, "-"],
        [79, "-", 78, 76, 74, "-", 71, "-"],
        [73, "-", 74, 76, 73, "-", 69, "-"],
        [74, "-", 73, 74, 78, "-", 76, 74],
        [76, "-", 74, 71, 74, "-", 78, "-"],
        [79, "-", 78, 79, 81, "-", 79, 78],
        [76, "-", "-", "-", 73, 74, 76, 73],
        [71, 74, 79, "-", 78, "-", 76, "-"],
        [73, 76, 81, "-", 79, "-", 78, "-"],
        [78, "-", 76, 73, 69, "-", 73, "-"],
        [74, "-", 76, 78, 76, "-", 74, "-"],
        [71, "-", 74, 79, 78, "-", 76, "-"],
        [76, "-", 78, 79, 81, "-", 79, "-"],
        [78, "-", 74, "-", 76, 78, 74, "-"],
        [73, "-", 76, "-", 81, "-", 76, 73],
    ], gain=0.27, duty=0.5, echo=0.4)
    s.arp([tuple(n + 12 for n in c) for c in chords], gain=0.07, duty=0.125, pattern=(0, 1, 2, 0, 1, 2, 1, 0))
    roots = [38, 35, 43, 45, 38, 35, 40, 45, 43, 45, 42, 35, 40, 45, 38, 45]
    pump = [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12]
    s.bass(roots, [pump], gain=0.4)
    four = "K.o.S.o.K.o.S.oo"
    s.drums([four] * 7 + ["K.o.S.o.K.SSS.SS"] + [four] * 7 + ["K.S.S.S.SSSSSSSS"], gain=0.95)
    return s.render()


def song_boss():
    """Boss: 160 BPM, E phrygian, 8 bars (12 s). Intense and driving."""
    s = Song(160, 8)
    Em, F, D, G, B = (64, 67, 71), (65, 69, 72), (62, 66, 69), (67, 71, 74), (63, 66, 71)
    s.lead([
        [76, 76, 79, 76, 77, 76, 74, 76],
        [77, "-", 76, 77, 81, "-", 77, "-"],
        [79, 79, 83, 79, 77, 79, 76, "-"],
        [74, "-", 78, "-", 81, "-", 78, 74],
        [76, 76, 79, 76, 77, 76, 74, 76],
        [77, "-", 81, "-", 84, "-", 81, 77],
        [79, "-", 83, 86, 83, "-", 79, "-"],
        [78, "-", 75, "-", 71, "-", 75, 78],
    ], gain=0.27, duty=0.25, echo=0.15)
    s.arp([Em, F, Em, D, Em, F, G, B], gain=0.07, duty=0.125, pattern=(0, 1, 2, 1))
    s.bass([40, 41, 40, 38, 40, 41, 43, 47], [[0, 0, 12, 0, 0, 12, 0, 12]], gain=0.42)
    hit = "K.hKS.hKK.hKS.hS"
    s.drums([hit] * 7 + ["K.SKS.SSKSSSSSSS"], gain=1.0)
    return s.render()


def song_act_clear():
    """Act clear jingle: a short C major fanfare (about 4 s, no loop)."""
    s = Song(150, 2, loop=False, tail=1.0)
    s.lead([
        [67, 72, 76, 79, "-", 76, 79, "-"],
        [84, "-", "-", "-", "-", "-", "-", "."],
    ], gain=0.32, duty=0.25, echo=0.25)
    s.lead([
        [64, 67, 72, 76, "-", 72, 76, "-"],
        [79, "-", "-", "-", "-", "-", "-", "."],
    ], gain=0.16, duty=0.5, echo=0.0)
    s.bass([48, 48], [[0, "-", 7, "-", 12, "-", 7, "-"], [0, "-", "-", "-", "-", "-", "-", "."]], gain=0.4)
    s.drums(["K...S...K.S.SSSS", "K..............."], gain=0.8)
    return s.render()


def song_game_over():
    """Game over jingle: a slow fall in C minor (about 5 s, no loop)."""
    s = Song(96, 2, loop=False, tail=0.8)
    s.lead([
        [79, "-", 75, "-", 74, "-", 72, "-"],
        [71, "-", "-", "-", 72, "-", "-", "."],
    ], gain=0.3, duty=0.5, echo=0.3)
    s.bass([48, 43], [[0, "-", "-", "-", 3, "-", "-", "-"], [-1, "-", "-", "-", 5, "-", "-", "."]], gain=0.4)
    s.drums(["K...............", "K.......K......."], gain=0.6)
    return s.render()


# name -> (composer, bpm, loops)
MUSIC = {
    "z1": (song_z1, 150, True),
    "title": (song_title, 120, True),
    "zone_select": (song_zone_select, 128, True),
    "z2": (song_z2, 132, True),
    "z3": (song_z3, 112, True),
    "z4": (song_z4, 172, True),
    "boss": (song_boss, 160, True),
    "act_clear": (song_act_clear, 150, False),
    "game_over": (song_game_over, 96, False),
}


# ---------------------------------------------------------------------------
# Output


def normalise(y, rms_db=None):
    y = y - np.mean(y)
    peak = np.max(np.abs(y)) or 1.0
    gain = 10 ** (PEAK_DB / 20.0) / peak
    if rms_db is not None:
        rms = np.sqrt(np.mean(y ** 2)) or 1.0
        gain = min(gain, 10 ** (rms_db / 20.0) / rms)
    return y * gain


def fade_edges(y, fade_in=0.001, fade_out=0.006):
    y = y.copy()
    a = int(fade_in * SR)
    b = min(len(y), int(fade_out * SR))
    if a:
        y[:a] *= np.linspace(0, 1, a)
    if b:
        y[-b:] *= np.linspace(1, 0, b)
    return y


def write_wav(path, y):
    data = (np.clip(y, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


# Vorbis quality (-q:a). Square waves and drum transients need a little more
# than speech.
QUALITY = 3
# Music is stored at 32 kHz (everything up to 16 kHz kept), which keeps all
# nine tracks plus the effects well under the 2 MB audio budget.
MUSIC_RATE = 32000


def _encoder():
    out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    if "libvorbis" in out:
        return ["-c:a", "libvorbis", "-q:a", str(QUALITY)]
    # The built-in encoder only takes stereo: copy the mono signal to both
    # channels at full level (a plain -ac 2 upmix would drop it 3 dB).
    return ["-af", "pan=stereo|c0=c0|c1=c0", "-c:a", "vorbis", "-strict", "experimental",
            "-q:a", str(QUALITY)]


def encode(wav, ogg, rate=None):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav] + _encoder()
    if rate:
        cmd += ["-ar", str(rate)]
    cmd += [ogg]
    subprocess.run(cmd, check=True)


def peak_db(ogg):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", ogg, "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    peak = mean = None
    for line in out.splitlines():
        if "max_volume" in line:
            peak = float(line.split(":")[1].split()[0])
        if "mean_volume" in line:
            mean = float(line.split(":")[1].split()[0])
    return peak, mean


def write_music_import(ogg, loops):
    path = ogg + ".import"
    if os.path.exists(path):
        return
    with open(path, "w") as f:
        f.write('[remap]\n\nimporter="oggvorbisstr"\ntype="AudioStreamOggVorbis"\n\n'
                "[params]\n\nloop=%s\nloop_offset=0.0\nbpm=0.0\nbeat_count=0\nbar_beats=4\n"
                % ("true" if loops else "false"))


def main(names):
    os.makedirs(SFX_DIR, exist_ok=True)
    os.makedirs(MUSIC_DIR, exist_ok=True)
    jobs = []
    for name, fn in SFX.items():
        if not names or name in names:
            gain = 10 ** (SFX_GAIN_DB.get(name, 0.0) / 20.0)
            jobs.append((name, os.path.join(SFX_DIR, name + ".ogg"),
                         lambda fn=fn, gain=gain: fade_edges(normalise(fn(), SFX_RMS_DB)) * gain, None))
    for name, (fn, _bpm, loops) in MUSIC.items():
        if not names or name in names:
            render = (lambda fn=fn: normalise(fn())) if loops \
                else (lambda fn=fn: fade_edges(normalise(fn()), 0.001, 0.05))
            jobs.append((name, os.path.join(MUSIC_DIR, name + ".ogg"), render, loops))
    total = 0
    bad = []
    with tempfile.TemporaryDirectory() as tmp:
        for name, ogg, render, loops in jobs:
            wav = os.path.join(tmp, name + ".wav")
            y = render()
            write_wav(wav, y)
            encode(wav, ogg, MUSIC_RATE if loops is not None else None)
            if loops is not None:
                write_music_import(ogg, loops)
            size = os.path.getsize(ogg)
            total += size
            peak, mean = peak_db(ogg)
            if peak is None or peak >= -0.5:
                bad.append(name)
            print("%-18s %6.2f s %7d B  peak %6.1f dB  mean %6.1f dB" % (name, len(y) / SR, size, peak, mean))
    print("total %d bytes" % total)
    if bad:
        print("PEAK TOO HIGH:", bad)
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
