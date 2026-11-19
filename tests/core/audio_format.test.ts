import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC_NAMES, SFX_NAMES, pickAudioFormat } from '../../src/core/audio';

describe('audio formats', () => {
  it('picks Ogg where Vorbis plays and AAC where it does not (Safari, iOS)', () => {
    expect(pickAudioFormat({ canPlayType: () => 'probably' })).toBe('ogg');
    expect(pickAudioFormat({ canPlayType: () => 'maybe' })).toBe('ogg');
    expect(pickAudioFormat({ canPlayType: () => '' })).toBe('m4a');
    expect(pickAudioFormat({ canPlayType: () => { throw new Error('no'); } })).toBe('m4a');
    expect(pickAudioFormat(null)).toBe('ogg');
  });

  it('ships every effect and track as Ogg and as AAC', () => {
    for (const name of SFX_NAMES) {
      expect(existsSync(`audio/sfx/${name}.ogg`), `${name}.ogg`).toBe(true);
      expect(existsSync(`audio/sfx/${name}.m4a`), `${name}.m4a`).toBe(true);
    }
    for (const name of MUSIC_NAMES) {
      expect(existsSync(`audio/music/${name}.ogg`), `${name}.ogg`).toBe(true);
      expect(existsSync(`audio/music/${name}.m4a`), `${name}.m4a`).toBe(true);
    }
  });
});
