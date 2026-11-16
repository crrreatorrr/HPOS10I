import { describe, expect, it } from 'vitest';
import { nakamaServerKey } from '../../src/hub/server_key';

describe('Nakama server key', () => {
  it('uses the build key whenever it is set', () => {
    expect(nakamaServerKey({ buildKey: 'prodkey', dev: false, hostname: 'play.example.com' })).toBe('prodkey');
    expect(nakamaServerKey({ buildKey: 'prodkey', dev: false, hostname: '127.0.0.1' })).toBe('prodkey');
    expect(nakamaServerKey({ buildKey: 'prodkey', dev: true, hostname: 'localhost' })).toBe('prodkey');
  });

  it('falls back to the stock key under vite dev', () => {
    expect(nakamaServerKey({ dev: true, hostname: 'play.example.com' })).toBe('defaultkey');
  });

  // The dev hub serves a game build from apps/hub/public/play/<slug>/. Without this the
  // ticket redeem gets 401 "Server key invalid" and the game runs with no hub session.
  it('falls back to the stock key for a build served from this machine', () => {
    for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '127.1.2.3', '[::1]', '::1', 'hub.localhost']) {
      expect(nakamaServerKey({ dev: false, hostname: host })).toBe('defaultkey');
    }
  });

  it('sends no key from a production build on any other host', () => {
    for (const host of ['play.example.com', '192.168.1.20', '10.0.0.1', 'localhost.example.com', '127.0.0.1.example.com', '', undefined]) {
      expect(nakamaServerKey({ dev: false, hostname: host })).toBe('');
    }
    expect(nakamaServerKey()).toBe('');
  });
});
