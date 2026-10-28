import { defineConfig } from 'vite';
import fs from 'node:fs';

// Dev-only helper: POST a canvas data URL to /__shot to save a screenshot for playtesting.
const devShot = {
  name: 'dev-shot',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__shot', (req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const name = (new URL(req.url, 'http://x').searchParams.get('n') || 'shot').replace(/[^\w-]/g, '');
        fs.mkdirSync('tools/_raw/shots', { recursive: true });
        fs.writeFileSync(`tools/_raw/shots/${name}.jpg`, Buffer.from(body.split(',')[1] || '', 'base64'));
        res.end('ok');
      });
    });
  },
};

export default defineConfig({
  plugins: [devShot],
});
