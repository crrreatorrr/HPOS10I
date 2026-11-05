import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Build-time settings, the same names CI already uses:
//   HPOS_BASE_PATH          public path the build is served from ('' = relative, works anywhere)
//   HPOS_HUB_URL            absolute hub page for Exit to Hub (default /hub/)
//   HPOS_NAKAMA_SERVER_KEY  Nakama client server key (empty: no hub session, the game still plays)
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

export default defineConfig({
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
});
