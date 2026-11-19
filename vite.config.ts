import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Build-time settings, the same names CI already uses:
//   HPOS_BASE_PATH          public path the build is served from ('' = relative, works anywhere)
//   HPOS_HUB_URL            absolute hub page for Exit to Hub (default /hub/)
//   HPOS_NAKAMA_SERVER_KEY  Nakama client server key (empty: Nakama's stock key under vite dev or
//                           on a loopback host, else no hub session; see src/hub/server_key.ts)
//   HPOS_TEST_BUILD=1       keep the test hooks (window.hpos and the ?scene/?zone/?inputs/?dev URL
//                           options) in a built bundle. Only the smoke and e2e tests set it, for
//                           their own throwaway builds; production builds never have the hooks.
//                           `vite` (dev server) always has them.
function basePath(): string {
  const raw = (process.env.HPOS_BASE_PATH ?? '').trim();
  if (raw === '') return './';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ command }) => ({
  base: basePath(),
  resolve: {
    alias: {
      '@hub-sdk': fileURLToPath(new URL('./vendor/hub-sdk/dist/index.js', import.meta.url)),
    },
  },
  define: {
    __HUB_URL__: JSON.stringify((process.env.HPOS_HUB_URL ?? '').trim() || '/hub/'),
    __NAKAMA_SERVER_KEY__: JSON.stringify((process.env.HPOS_NAKAMA_SERVER_KEY ?? '').trim()),
    __BUILD_ID__: JSON.stringify(buildId()),
    __HPOS_TEST_HOOKS__: JSON.stringify(command === 'serve' || process.env.HPOS_TEST_BUILD === '1'),
  },
  publicDir: 'public',
  build: {
    outDir: 'build/web',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
    reportCompressedSize: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5180,
  },
}));
