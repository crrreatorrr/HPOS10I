#!/usr/bin/env node
// Browser smoke test of the web build: serves build/web, boots the game in
// headless Chromium, opens every registered scene for a couple of seconds and
// fails on any page error or console error, a scene that never shows up, or a
// blank screen. Also plays the title -> zone select -> act 1 path by keyboard.
//
//   npm run build && node tools/qa/smoke.mjs [build_dir]
//
// Playwright comes from the environment (preinstalled in CI and dev
// containers); set CHROMIUM_PATH to use a specific browser binary.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = await import('playwright'));
}

const dir = process.argv[2] ?? 'build/web';
if (!existsSync(join(dir, 'index.html'))) {
  console.error(`smoke: no build at ${dir} (run npm run build)`);
  process.exit(2);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  const file = join(dir, path);
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`FAIL  ${msg}`);
};

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 848, height: 480 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => !!window.hpos, null, { timeout: 15000 });
  return { page, errors };
}

async function frames(page, n) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let left = count;
        const step = () => (--left <= 0 ? resolve(null) : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );
}

async function nonBlank(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const first = [d[0], d[1], d[2]];
    let different = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] !== first[0] || d[i + 1] !== first[1] || d[i + 2] !== first[2]) different++;
    return different > 20;
  });
}

// 1. Every scene opens and runs.
const { page: probe } = await open('dev');
const ids = await probe.evaluate(() => window.hpos.scenes());
await probe.close();
for (const id of ids) {
  const { page, errors } = await open(`scene=${encodeURIComponent(id)}&mute`);
  try {
    await page.waitForFunction((want) => window.hpos.router.currentId === want, id, { timeout: 15000 });
    await frames(page, 120);
    if (!(await nonBlank(page))) fail(`${id}: blank screen`);
  } catch (e) {
    fail(`${id}: never became the current scene (${String(e).split('\n')[0]})`);
  }
  if (errors.length) fail(`${id}: ${errors.length} error(s): ${errors.slice(0, 3).join(' | ')}`);
  else console.log(`OK    ${id}`);
  await page.close();
}

// 2. Title -> zone select -> first act, by keyboard.
{
  const { page, errors } = await open('mute');
  try {
    await page.waitForFunction(() => window.hpos.router.currentId === 'title', null, { timeout: 15000 });
    await frames(page, 30);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.hpos.router.currentId === 'zone_select', null, { timeout: 10000 });
    await frames(page, 30);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.hpos.router.inGameplay(), null, { timeout: 15000 });
    await page.keyboard.down('ArrowRight');
    await frames(page, 180);
    await page.keyboard.up('ArrowRight');
    const moved = await page.evaluate(() => window.hpos.tree.getFirstNodeInGroup('player')?.globalPosition.x ?? 0);
    if (!(moved > 200)) fail(`play path: Sproto did not run right (x = ${moved})`);
    else console.log(`OK    title -> zone select -> ${await page.evaluate(() => window.hpos.router.currentId)} (x = ${Math.round(moved)})`);
  } catch (e) {
    fail(`play path: ${String(e).split('\n')[0]}`);
  }
  if (errors.length) fail(`play path: ${errors.slice(0, 3).join(' | ')}`);
  await page.close();
}

await browser.close();
server.close();
console.log(failures ? `smoke: ${failures} failure(s)` : `smoke: ${ids.length} scenes OK`);
process.exit(failures ? 1 : 0);
