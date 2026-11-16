// Nakama's client server key. The portal-ticket redeem (POST /v2/account/authenticate/custom)
// sends it as Basic auth; it is not the runtime HTTP key and not a secret. A production
// build takes HPOS_NAKAMA_SERVER_KEY, or every redeem is refused (401 "Server key invalid")
// and the game runs without a hub session: no Tickets banked, no level_complete reported,
// no Relics.
//
// `vite dev` falls back to Nakama's stock key, like the hub. So does a build served from
// this machine: the dev hub serves game builds from its public/play/<slug>/, and
// metaverse-hub's local stack keeps the stock key. A build served from any other host
// never falls back to it.

export const LOCAL_SERVER_KEY = 'defaultkey';

const LOOPBACK_HOST = /^(localhost|[\w-]+\.localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i;

export interface ServerKeyInputs {
  buildKey?: string;
  dev?: boolean;
  hostname?: string;
}

export function nakamaServerKey({ buildKey, dev, hostname }: ServerKeyInputs = {}): string {
  if (buildKey) return buildKey;
  if (dev) return LOCAL_SERVER_KEY;
  return LOOPBACK_HOST.test(String(hostname ?? '')) ? LOCAL_SERVER_KEY : '';
}

/** The key for this page: the build's key, else the stock key in dev or on a loopback host. */
export function pageServerKey(): string {
  return nakamaServerKey({
    buildKey: __NAKAMA_SERVER_KEY__,
    dev: import.meta.env.DEV,
    hostname: typeof location !== 'undefined' ? location.hostname : '',
  });
}
