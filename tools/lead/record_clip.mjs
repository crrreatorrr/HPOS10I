#!/usr/bin/env node
// Records a gameplay clip from the web build with scripted input and
// converts it to MP4 and a small GIF for review. The game steps its fixed
// 60 Hz clock from the browser's frames, so a timeline replays the same way.
//
//   npm run build
//   node tools/lead/record_clip.mjs <name> <seconds> "<url query>" [timeline.json]
// Example:
//   node tools/lead/record_clip.mjs z1_run 20 "zone=z1_retro_rush_hills&mute" tests/levels/inputs/z1_act1_run.json
//
// Clips land in build/clips (git-ignored). ffmpeg makes the MP4 and GIF when present.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const [name, seconds, query = '', timeline] = process.argv.slice(2);
if (!name || !seconds) {
  console.error('usage: node tools/lead/record_clip.mjs <name> <seconds> "<url query>" [timeline.json]');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = 'build/web';
const out = 'build/clips';
mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = new URL(req.url ?? '/', 'http://x').pathname;
  if (p.endsWith('/')) p += 'index.html';
  const f = join(dir, p);
  if (!existsSync(f) || !statSync(f).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 848, height: 480 }, recordVideo: { dir: out, size: { width: 848, height: 480 } } });
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/?${query}`);
await page.waitForFunction(() => window.hpos && window.hpos.router.currentId !== '');
if (timeline) await page.evaluate((t) => window.hpos.play(t), JSON.parse(readFileSync(timeline, 'utf8')));
await page.waitForTimeout(Number(seconds) * 1000);
const video = page.video();
await context.close();
await browser.close();
server.close();
const webm = join(out, `${name}.webm`);
renameSync(await video.path(), webm);
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-pix_fmt', 'yuv420p', join(out, `${name}.mp4`)]);
if (ff.status === 0) {
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'fps=15,scale=424:-1:flags=neighbor', join(out, `${name}.gif`)]);
}
console.log(`clip: ${readdirSync(out).filter((f) => f.startsWith(name)).map((f) => join(out, f)).join(', ')}`);
