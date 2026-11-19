#!/usr/bin/env node
// Browser smoke test of the web build. First the production build (build/web):
// it boots to the title, has no window.hpos and ignores the dev URL options
// (?scene, ?zone, ?inputs, ?dev). Then a test build of the same source with the
// test hooks (HPOS_TEST_BUILD=1, built into build/web-test unless SMOKE_TEST_BUILD
// names one): boots the game in
// headless Chromium, opens every registered scene for a couple of seconds and
// fails on any page error or console error, a scene that never shows up, or a
// blank screen. Also plays the title -> zone select -> act 1 path by keyboard,
// and opens the feedback window (N twice) over a level.
//
//   npm run build && node tools/qa/smoke.mjs [build_dir]
//
// Playwright comes from the environment (preinstalled in CI and dev
// containers); set CHROMIUM_PATH to use a specific browser binary.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = await import('playwright'));
}

const prodDir = process.argv[2] ?? 'build/web';
if (!existsSync(join(prodDir, 'index.html'))) {
  console.error(`smoke: no build at ${prodDir} (run npm run build)`);
  process.exit(2);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let dir = process.env.SMOKE_TEST_BUILD;
if (!dir) {
  dir = join(root, 'build/web-test');
  const built = spawnSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: root,
    env: { ...process.env, HPOS_TEST_BUILD: '1' },
    encoding: 'utf8',
  });
  if (built.status !== 0) {
    console.error(`smoke: the test build failed\n${built.stderr || built.stdout}`);
    process.exit(2);
  }
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serve(from) {
  const requested = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    requested.push(url.pathname);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    const file = join(from, path);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return { server, requested };
}
const prod = serve(prodDir);
await new Promise((r) => prod.server.listen(0, '127.0.0.1', r));
const prodBase = `http://127.0.0.1:${prod.server.address().port}/`;
const test = serve(dir);
const server = test.server;
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

// 0. The production build has no test hooks: the dev URL options do nothing and there is no window.hpos.
{
  const page = await browser.newPage({ viewport: { width: 848, height: 480 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  try {
    await page.goto(`${prodBase}?dev&scene=playground%3Aphysics&zone=z1_retro_rush_hills&stage=2&inputs=evil_timeline.json&mute`);
    await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'), null, { timeout: 15000 });
    await frames(page, 60);
    const hooks = await page.evaluate(() => typeof window.hpos);
    if (hooks !== 'undefined') fail(`production build: window.hpos is ${hooks}`);
    if (prod.requested.some((p) => p.includes('evil_timeline'))) fail('production build: fetched the ?inputs= timeline');
    if (!(await nonBlank(page))) fail('production build: blank screen');
    if (errors.length) fail(`production build: ${errors.slice(0, 3).join(' | ')}`);
    else if (hooks === 'undefined') console.log('OK    production build: no window.hpos, dev URL options ignored');
  } catch (e) {
    fail(`production build: ${String(e).split('\n')[0]}`);
  }
  await page.close();
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

// 3. The feedback window (N twice) freezes the game and gives it back as it was.
{
  const { page, errors } = await open('scene=' + encodeURIComponent(ids.find((id) => id.startsWith('level:')) ?? ids[0]) + '&mute');
  const state = () => page.evaluate(() => ({ frames: window.hpos.tree.physicsFrames, paused: window.hpos.tree.paused, open: window.hpos.feedback.isOpen() }));
  try {
    await page.waitForFunction(() => window.hpos.router.inGameplay(), null, { timeout: 15000 });
    // A stand-in hub session that keeps what was sent.
    await page.evaluate(() => {
      window.__feedback = [];
      window.hpos.hub.sdk = { feedbackAccess: async () => ({ ok: true }), submitFeedback: async (note) => (window.__feedback.push(note), { id: 'TEST-0001' }) };
    });
    await frames(page, 30);
    await page.keyboard.press('KeyN');
    await page.keyboard.press('KeyN');
    await page.waitForFunction(() => window.hpos.feedback.isOpen(), null, { timeout: 5000 });
    const opened = await state();
    await page.keyboard.press('KeyP');
    await page.keyboard.press('ArrowRight');
    await frames(page, 30);
    const frozen = await state();
    if (frozen.frames !== opened.frames || frozen.paused) fail(`feedback: the game was not frozen as it was (${JSON.stringify([opened, frozen])})`);
    await page.keyboard.press('Digit7');
    await page.keyboard.press('Enter');
    await frames(page, 30);
    const after = await state();
    if (after.open || after.paused || !(after.frames > frozen.frames)) fail(`feedback: the game did not resume (${JSON.stringify(after)})`);
    const note = await page.evaluate(() => window.__feedback[0]);
    if (!note) fail('feedback: nothing was sent');
    else if (!note.image.startsWith('data:image/jpeg') || note.image.length < 5000) fail('feedback: no screenshot');
    else if (!note.meta.level || !note.meta.version || typeof note.meta.position?.x !== 'number') fail(`feedback: context missing (${JSON.stringify(note.meta).slice(0, 200)})`);
    else console.log(`OK    feedback window (${note.meta.level}, ${Math.round(note.image.length / 1024)} KB screenshot)`);
  } catch (e) {
    fail(`feedback: ${String(e).split('\n')[0]}`);
  }
  if (errors.length) fail(`feedback: ${errors.slice(0, 3).join(' | ')}`);
  await page.close();
}

// 4. Audio formats: Ogg where the browser plays Vorbis; AAC (.m4a) where it cannot (Safari, iOS),
// simulated here by a canPlayType that refuses Ogg; and a browser that claims Ogg but cannot decode
// it, which must try one Ogg file only. Only the menu effects load before the first key press; the
// rest load at it.
for (const [label, refuseOgg, want, avoid, decodeRefusesOgg] of [
  ['ogg', false, '.ogg', '.m4a', false],
  ['aac (Safari path)', true, '.m4a', '.ogg', false],
  ['aac after an Ogg decode failure', false, '.m4a', '.ogg', true],
]) {
  const context = await browser.newContext({ viewport: { width: 848, height: 480 } });
  // Headless Chromium lets audio start without a gesture; a real browser keeps the context
  // suspended until the first key press, click or tap. Do the same here.
  await context.addInitScript(() => {
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      #gesture = false;
      get state() {
        return this.#gesture ? super.state : 'suspended';
      }
      resume() {
        if (navigator.userActivation?.hasBeenActive ?? true) this.#gesture = true;
        return super.resume();
      }
    };
  });
  if (decodeRefusesOgg) {
    await context.addInitScript(() => {
      const real = BaseAudioContext.prototype.decodeAudioData;
      BaseAudioContext.prototype.decodeAudioData = function (data, ...rest) {
        const head = new Uint8Array(data, 0, 4);
        if (String.fromCharCode(...head) === 'OggS') return Promise.reject(new DOMException('no vorbis', 'EncodingError'));
        return real.call(this, data, ...rest);
      };
    });
  }
  if (refuseOgg) {
    await context.addInitScript(() => {
      const real = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function (type) {
        return /ogg/.test(type) ? '' : real.call(this, type);
      };
    });
  }
  const page = await context.newPage();
  const audio = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (/\.(ogg|m4a)$/.test(path)) audio.push(path);
  });
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.hpos && window.hpos.router.currentId === 'title', null, { timeout: 15000 });
    await frames(page, 30);
    const beforeGesture = audio.length;
    await page.keyboard.press('ArrowDown');
    await frames(page, 90);
    const wrong = audio.filter((p) => p.endsWith(avoid));
    const allowed = decodeRefusesOgg ? 1 : 0; // the one file that finds out
    const wanted = audio.filter((p) => p.endsWith(want));
    if (wrong.length > allowed) fail(`audio ${label}: fetched ${wrong.length} ${avoid} file(s)`);
    else if (beforeGesture > 3 + allowed) fail(`audio ${label}: ${beforeGesture} audio requests before the first key press`);
    else if (!(wanted.length >= 28)) fail(`audio ${label}: only ${wanted.length} ${want} file(s) after the first key press`);
    else console.log(`OK    audio ${label}: ${beforeGesture} file(s) before the first key press, ${audio.length} after`);
  } catch (e) {
    fail(`audio ${label}: ${String(e).split('\n')[0]}`);
  }
  await context.close();
}

await browser.close();
server.close();
prod.server.close();
console.log(failures ? `smoke: ${failures} failure(s)` : `smoke: ${ids.length} scenes OK`);
process.exit(failures ? 1 : 0);
