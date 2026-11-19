#!/usr/bin/env node
// QA static checks on the web build (build/web). Reads files only.
//
//   node tools/qa/web_check.mjs [build_dir]
//
// Checks:
//   files    index.html and at least one script bundle
//   mobile   viewport meta tag present
//   base     every asset URL in index.html is relative (works from any folder) unless HPOS_BASE_PATH is set
//   export   no dev content shipped (tests/, tools/, docs/, qa/, *.md, *.map, _raw/, .gd/.tscn)
//   threads  no SharedArrayBuffer / cross-origin isolation needed
//   audio    Ogg Vorbis plus an AAC (.m4a) twin of every file (Safari and iOS), no other format
//   hooks    no test hooks in a production build: no window.hpos, no ?scene/?zone/?inputs/?dev
//            (skipped for a test build, HPOS_TEST_BUILD=1)
//   hub      the hub SDK is bundled (portal ticket redeem and the outbox)
//   size     total size and gzip size against budgets
// Environment: TOTAL_BUDGET_MB=25, GZIP_BUDGET_MB=12
// Exit: 0 no FAIL, 1 any FAIL, 2 usage error.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? 'build/web';
if (!existsSync(dir)) {
  console.error(`web_check: no build at ${dir}`);
  process.exit(2);
}
const totalBudget = Number(process.env.TOTAL_BUDGET_MB ?? 25) * 1e6;
const gzipBudget = Number(process.env.GZIP_BUDGET_MB ?? 12) * 1e6;
let failed = false;
const out = (status, check, detail) => {
  if (status === 'FAIL') failed = true;
  console.log(`${status.padEnd(4)}  ${check.padEnd(8)} ${detail}`);
};

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dir, p));
  }
})(dir);

const index = join(dir, 'index.html');
if (!existsSync(index)) out('FAIL', 'files', 'index.html missing');
const html = existsSync(index) ? readFileSync(index, 'utf8') : '';
const scripts = files.filter((f) => f.endsWith('.js'));
out(scripts.length > 0 ? 'OK' : 'FAIL', 'files', `${files.length} files, ${scripts.length} script bundle(s)`);
out(/<meta[^>]+name="viewport"/.test(html) ? 'OK' : 'FAIL', 'mobile', 'viewport meta tag');

const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const absolute = urls.filter((u) => u.startsWith('/') && !u.startsWith('//'));
if (process.env.HPOS_BASE_PATH) out('OK', 'base', `base path ${process.env.HPOS_BASE_PATH}`);
else out(absolute.length === 0 ? 'OK' : 'FAIL', 'base', absolute.length ? `absolute URLs: ${absolute.join(', ')}` : 'all asset URLs relative');

const dev = files.filter((f) => /(^|\/)(tests|tools|docs|qa|_raw)\//.test(f) || /\.(md|map|gd|tscn|tres|import)$/.test(f));
out(dev.length === 0 ? 'OK' : 'FAIL', 'export', dev.length ? `dev content: ${dev.slice(0, 5).join(', ')}` : 'no dev content');

const js = scripts.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
out(/new SharedArrayBuffer|crossOriginIsolated\s*\)/.test(js) ? 'FAIL' : 'OK', 'threads', 'no SharedArrayBuffer');

const audio = files.filter((f) => ['.ogg', '.mp3', '.wav', '.m4a', '.aac', '.opus', '.flac'].includes(extname(f)));
// Ogg Vorbis for most browsers plus an AAC (.m4a) twin of each file for Safari and iOS, which
// cannot decode Ogg with Web Audio. Built names are <name>-<hash>.<ext>.
const stem = (f) => basename(f).replace(/-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/, '');
const oggs = audio.filter((f) => extname(f) === '.ogg');
const m4as = audio.filter((f) => extname(f) === '.m4a');
const other = audio.filter((f) => !['.ogg', '.m4a'].includes(extname(f)));
const m4aStems = new Set(m4as.map(stem));
const oggStems = new Set(oggs.map(stem));
const unpaired = [...oggs.filter((f) => !m4aStems.has(stem(f))), ...m4as.filter((f) => !oggStems.has(stem(f)))];
const audioOk = other.length === 0 && unpaired.length === 0 && oggs.length > 0;
out(
  audioOk ? 'OK' : 'FAIL',
  'audio',
  `${oggs.length} Ogg + ${m4as.length} AAC file(s)${other.length ? `; other formats: ${other.join(', ')}` : ''}${unpaired.length ? `; without a twin: ${unpaired.join(', ')}` : ''}`,
);

// The debug API and the dev URL options are compiled out of production builds (__HPOS_TEST_HOOKS__).
if (process.env.HPOS_TEST_BUILD === '1') out('OK', 'hooks', 'test build: test hooks expected');
else {
  const leaks = [
    [/\.hpos\s*=/, 'window.hpos'],
    [/could not load input timeline/, '?inputs= timeline replay'],
    [/HPOS_TEST_HOOKS_ON/, 'test hooks marker'],
  ].filter(([re]) => re.test(js)).map(([, what]) => what);
  out(leaks.length === 0 ? 'OK' : 'FAIL', 'hooks', leaks.length ? `test hooks in a production build: ${leaks.join(', ')}` : 'no window.hpos or dev URL options');
}

const hubOk = js.includes('hub-outbox') && js.includes('authenticateCustom') && js.includes('hpos10i.level_complete');
out(hubOk ? 'OK' : 'FAIL', 'hub', hubOk ? 'hub SDK and level events bundled' : 'hub SDK or level events missing from the bundle');

let total = 0;
let gz = 0;
for (const f of files) {
  const data = readFileSync(join(dir, f));
  total += data.length;
  gz += ['.png', '.ogg', '.m4a', '.jpg', '.webp'].includes(extname(f)) ? data.length : gzipSync(data, { level: 9 }).length;
}
const mb = (n) => (n / 1e6).toFixed(2);
out(total <= totalBudget ? 'OK' : 'FAIL', 'size', `total ${mb(total)} MB (budget ${mb(totalBudget)})`);
out(gz <= gzipBudget ? 'OK' : 'FAIL', 'size', `over the wire ~${mb(gz)} MB gzip (budget ${mb(gzipBudget)})`);
process.exit(failed ? 1 : 0);
