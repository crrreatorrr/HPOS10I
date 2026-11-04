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
//   audio    only Ogg Vorbis audio
//   hub      the hub SDK is bundled (portal ticket redeem and the outbox)
//   size     total size and gzip size against budgets
// Environment: TOTAL_BUDGET_MB=25, GZIP_BUDGET_MB=12
// Exit: 0 no FAIL, 1 any FAIL, 2 usage error.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
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
const nonOgg = audio.filter((f) => extname(f) !== '.ogg');
out(nonOgg.length === 0 ? 'OK' : 'FAIL', 'audio', `${audio.length} Ogg file(s)${nonOgg.length ? `; other: ${nonOgg.join(', ')}` : ''}`);

const hubOk = js.includes('hub-outbox') && js.includes('authenticateCustom') && js.includes('hpos10i.level_complete');
out(hubOk ? 'OK' : 'FAIL', 'hub', hubOk ? 'hub SDK and level events bundled' : 'hub SDK or level events missing from the bundle');

let total = 0;
let gz = 0;
for (const f of files) {
  const data = readFileSync(join(dir, f));
  total += data.length;
  gz += ['.png', '.ogg', '.jpg', '.webp'].includes(extname(f)) ? data.length : gzipSync(data, { level: 9 }).length;
}
const mb = (n) => (n / 1e6).toFixed(2);
out(total <= totalBudget ? 'OK' : 'FAIL', 'size', `total ${mb(total)} MB (budget ${mb(totalBudget)})`);
out(gz <= gzipBudget ? 'OK' : 'FAIL', 'size', `over the wire ~${mb(gz)} MB gzip (budget ${mb(gzipBudget)})`);
process.exit(failed ? 1 : 0);
