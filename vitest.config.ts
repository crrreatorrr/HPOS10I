import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@hub-sdk': fileURLToPath(new URL('./vendor/hub-sdk/dist/index.js', import.meta.url)),
    },
  },
  define: {
    __HUB_URL__: JSON.stringify('/hub/'),
    __NAKAMA_SERVER_KEY__: JSON.stringify(''),
    __BUILD_ID__: JSON.stringify('test'),
    __HPOS_TEST_HOOKS__: JSON.stringify(true),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
