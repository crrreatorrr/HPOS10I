#!/usr/bin/env node
// End-to-end check of the web build against a real hub server (the hub
// repo's local Nakama stack: `docker compose up` in metaverse-hub/server).
// A hub guest opens a portal ticket for hpos10i, the game redeems it in a
// headless browser, clears Zone 1 Act 1 with tickets, and the server is
// checked: Ticket balance, the HPOS10I Core Relic, the act-time score, no
// double payment on a retry and a reload, and Exit to Hub.
//
//   HUB_DIR=../metaverse-hub node tools/e2e/hub_e2e.mjs
//
// Needs: the stack running on 127.0.0.1:7350, docker (for psql), Playwright.

import { createServer, request as httpRequest } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HUB = resolve(process.env.HUB_DIR ?? '../metaverse-hub');
const NAKAMA = process.env.NAKAMA_URL ?? 'http://127.0.0.1:7350';
const env = Object.fromEntries(
  readFileSync(join(HUB, 'server/.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const SERVER_KEY = env.NAKAMA_SERVER_KEY;
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

// 1. Build the game with the local server key.
const out = mkdtempSync(join(tmpdir(), 'hpos-e2e-'));
const build = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
  env: { ...process.env, HPOS_NAKAMA_SERVER_KEY: SERVER_KEY, HPOS_HUB_URL: '/hub/' },
  encoding: 'utf8',
});
if (build.status !== 0) {
  console.error(build.stderr || build.stdout);
  process.exit(2);
}

// 2. Serve it same-origin with /v2 proxied to Nakama (like the hub's dev server).
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const nakama = new URL(NAKAMA);
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/v2/')) {
    const proxied = httpRequest(
      { host: nakama.hostname, port: nakama.port, path: req.url, method: req.method, headers: { ...req.headers, host: nakama.host } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    proxied.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(proxied);
    return;
  }
  let p = url.pathname;
  if (p.startsWith('/hub')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>hub</title>hub');
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const f = join(out, p);
  if (!existsSync(f) || !statSync(f).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// 3. A hub guest opens a ranked portal ticket for hpos10i.
const basic = `Basic ${Buffer.from(`${SERVER_KEY}:`).toString('base64')}`;
const auth = await (
  await fetch(`${NAKAMA}/v2/account/authenticate/device?create=true`, {
    method: 'POST',
    headers: { Authorization: basic, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: crypto.randomUUID() }),
  })
).json();
const userId = JSON.parse(Buffer.from(auth.token.split('.')[1], 'base64url').toString()).uid;
async function portalTicket() {
  const r = await fetch(`${NAKAMA}/v2/rpc/portal.enter?unwrap=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ game: 'hpos10i', ranked: true }),
  });
  const body = await r.json();
  if (!body.ticket) throw new Error(`portal.enter: ${JSON.stringify(body)}`);
  return body.ticket;
}

function sql(query) {
  return execFileSync('docker', ['compose', '-f', join(HUB, 'server/docker-compose.yml'), 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'nakama', '-tAc', query], {
    encoding: 'utf8',
  }).trim();
}
const balance = () => Number(sql(`SELECT COALESCE((SELECT balance FROM game.tickets_balance WHERE user_id = '${userId}' AND game_id = 'hpos10i'), 0)`));
const relic = () => Number(sql(`SELECT count(*) FROM game.relic_claim WHERE user_id = '${userId}' AND relic_id = 'hpos10i_core'`));
const score = () => sql(`SELECT value FROM game.ranked_score WHERE user_id = '${userId}' AND board_id = 'hpos10i_act_time'`);
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// 4. The game redeems the ticket and clears Zone 1 Act 1 with 23 tickets.
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('response', async (r) => {
  if (!r.url().includes('/v2/')) return;
  let body = '';
  try {
    body = (await r.text()).slice(0, 240);
  } catch {
    body = '?';
  }
  logs.push(`http ${r.status()} ${new URL(r.url()).pathname} <- ${(r.request().postData() ?? '').slice(0, 160)} -> ${body}`);
});
await page.goto(`${base}/?zone=z1_retro_rush_hills&stage=1&mute#t=${await portalTicket()}`);
await page.waitForFunction(() => window.hpos && window.hpos.hub.reach !== 'pending' && window.hpos.router.inGameplay(), null, { timeout: 20000 });
const hub = await page.evaluate(() => ({ reach: window.hpos.hub.reach, inSession: window.hpos.hub.inSession, ranked: window.hpos.hub.ranked }));
check(hub.reach === 'ready' && hub.inSession, `ticket redeemed: reach ${hub.reach}, session ${hub.inSession}, ranked ${hub.ranked}`);
check(!(await page.evaluate(() => location.hash.includes('t='))), 'the ticket is stripped from the URL');

async function clearAct(tickets) {
  await page.evaluate((n) => {
    const h = window.hpos;
    h.state.addTickets(n);
    h.tree.getFirstNodeInGroup('level_root').completeLevel();
  }, tickets);
}
await clearAct(23); // over the 20-per-act maximum: the game banks 20
check(await until(() => balance() === 20), `server balance after a 23-ticket clear: ${balance()} (want 20, the per-act maximum)`);
check(await until(() => page.evaluate(() => window.hpos.hub.balanceKnown && window.hpos.hub.ticketBalance === 20)), 'the game shows the server balance');
check(await until(() => relic() === 1), `HPOS10I Core granted for the Zone 1 Act 1 clear (claims: ${relic()})`);
check(await until(() => score() !== ''), `act time posted to the board: ${score() || 'none'}`);

// 5. A retry of the same attempt and a reload never pay twice.
await page.evaluate(() => window.hpos.state.completeLevel());
await new Promise((r) => setTimeout(r, 2000));
check(balance() === 20, `a repeated clear of the same attempt pays nothing: ${balance()}`);
await page.reload();
await page.waitForFunction(() => window.hpos && window.hpos.hub.reach !== 'pending', null, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 2000));
const afterReload = await page.evaluate(() => ({ reach: window.hpos.hub.reach, inSession: window.hpos.hub.inSession, cached: Object.keys(sessionStorage) }));
check(afterReload.inSession, `the reload reuses the tab session (${JSON.stringify(afterReload)})`);
check(balance() === 20, `the reload resends nothing already paid: ${balance()}`);

// 6. A new attempt (the next act) pays again.
await page.evaluate(() => window.hpos.router.startZone('z1_retro_rush_hills', 2));
await page.waitForFunction(() => window.hpos.router.currentId === 'level:z1_retro_rush_hills/act2', null, { timeout: 20000 });
await clearAct(7);
check(await until(() => balance() === 27), `a new attempt pays: ${balance()} (want 27)`);

// 7. A player stuck by an older build: an over-cap earn queued in the SDK
//    outbox. The next launch must still reach the hub.
await page.evaluate(async () => {
  const token = JSON.parse(sessionStorage.getItem('hub:hpos10i:session')).token;
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('hub-outbox', 1);
    req.onsuccess = () => {
      const tx = req.result.transaction('writes', 'readwrite');
      tx.objectStore('writes').put({ key: crypto.randomUUID(), rpc: 'tickets.earn', body: { amount: 137, reason: 'level_end' }, token, gameId: 'hpos10i' });
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
});
await page.reload();
await page.waitForFunction(() => window.hpos && window.hpos.hub.reach !== 'pending', null, { timeout: 20000 });
const stuck = await page.evaluate(() => ({ reach: window.hpos.hub.reach, inSession: window.hpos.hub.inSession }));
check(stuck.reach === 'ready' && stuck.inSession, `a launch with an undeliverable queued earn still reaches the hub (${JSON.stringify(stuck)})`);
check(balance() === 27, `and pays nothing for it: ${balance()}`);

// 8. Exit to Hub returns to the hub page with #from=hpos10i.
await page.evaluate(() => window.hpos.hub.exitToHub());
check(await until(() => page.url().includes('/hub/#from=hpos10i')), `Exit to Hub: ${page.url()}`);

if (failures || process.env.E2E_VERBOSE) console.log(logs.filter((l) => !l.includes('Canvas2D')).join('\n'));
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
server.close();
console.log(failures ? `hub e2e: ${failures} failure(s)` : 'hub e2e: all OK');
process.exit(failures ? 1 : 0);
