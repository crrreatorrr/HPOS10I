import { describe, expect, it } from 'vitest';
import { PRODUCTION_ARGS, readArgs } from '../../src/core/dev';

describe('dev URL options', () => {
  it('honours every option with the test hooks', () => {
    expect(readArgs('?scene=title&inputs=x.json&dev&mute', true)).toEqual({ scene: 'title', inputs: 'x.json', dev: true, mute: true });
  });

  it('honours only display and sound options in production', () => {
    expect(readArgs('?scene=title&zone=z1&stage=2&inputs=https://x/y.json&dev&start=900&mute&touch&overlay', false)).toEqual({ mute: true, touch: true, overlay: true });
    expect(PRODUCTION_ARGS).not.toContain('inputs');
  });

  it('reads nothing without a location', () => {
    expect(readArgs(null, true)).toEqual({});
  });
});
