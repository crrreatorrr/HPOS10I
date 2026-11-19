# Handoff status: HPOS10I optimization pass

Branch `claude/happy-pasteur-0dhfzp` (main + `CLAUDE_HANDOFF_OPTIMIZATION.md` + `CLAUDE_SESSION_BRIEF.md`).
No pull request opened, nothing pushed to `main`, no deploys.

## Items

### Phase 0 (§1, P0)
- §1.1 Silent audio on Safari / iOS — **done** (c62c4b9, 41f163e, 7b7eff9). Every Ogg file has an AAC twin
  (`audio/**/*.m4a`, `audio/tools/make_m4a.sh`: ffmpeg `aac`, 96 kbps music, 128 kbps SFX); `src/core/audio.ts`
  picks the format with `canPlayType('audio/ogg; codecs="vorbis"')` and retries a file in the other format when
  `decodeAudioData` refuses it. All 74 files decode in Chromium; music loop lengths are unchanged (title 16.000 s,
  z1 25.600 s), mean loudness within 0.6 dB. AAC pads short SFX by ~30 ms of silence at the tail, and a few
  square-wave SFX peak higher after AAC (menu_select -5.8 → -0.2 dBFS, no clipping in float Web Audio).
  `web_check` now requires an AAC twin for every Ogg file; checklists updated. Not verified on real Safari/iOS
  (no WebKit here): the smoke test simulates the Safari path by refusing Ogg in `canPlayType`.
- §1.2 `window.hpos` and dev/TAS URL options in production — **done** (41f163e). `__HPOS_TEST_HOOKS__` define:
  true under `vite` (serve), Vitest and `HPOS_TEST_BUILD=1`; false in `npm run build`. Production honours only
  `?touch`, `?mute`, `?overlay`. `web_check` fails a production build containing `.hpos=`, the timeline loader
  or the hooks marker; the smoke test boots the production build with `?dev&scene&zone&inputs` and checks there
  is no `window.hpos` and no timeline fetch, then builds its own test build in `build/web-test` for the rest.
  `tests/core/dev_args.test.ts` covers the argument filter. §1.2.4 (replay payload for server verification):
  **skipped**, needs a server-side verifier in metaverse-hub.
- §1.3 Ranked/Relic boot race — **done** (161fce9). While a hub *visit* is pending (`reach === 'pending'` and a
  portal ticket or live session), `extras_allowed` is false (no item boxes, no extra moves). A stage start during a
  pending visit waits for init, capped at 1.5 s (`SceneRouter.beforeStage` → `HubClient.whenSettled`). If the cap
  hits, Golden Sproto's life is granted once init answers. Plain page loads (never Ranked) are unaffected.
  Tests: `tests/hub/ranked_race.test.ts`.

### Phase 1 (§2, §3.1, §3.2)
- Pending.

### Phase 3 (§3.3 repo hygiene)
- Pending.

## Checks

| Check | Phase 0 |
|---|---|
| `npm ci` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass: 855 passed, 1 skipped (baseline 845) |
| `tools/qa/originality_scan.sh .` | pass: 0 hits |
| `npm run build && node tools/qa/web_check.mjs build/web` | pass |
| `npm run smoke` | pass: 19 scenes, production-hooks check, play path, feedback, Ogg and AAC audio paths |
| `npm run test:bots` | not run yet |
| `npm run e2e:hub` | not run: needs the metaverse-hub Nakama stack (docker) |

## Measurements

Boot = page load until the boot screen hides, plus 1.5 s on the title, in headless Chromium with the
AudioContext held suspended until a gesture (as real browsers do). Script:
`node measure.mjs <build dir>` (kept outside the repo).

| | baseline (main) | after Phase 0 |
|---|---|---|
| `build/web` bytes | 9,273,675 (122 files) | 11,424,798 (159 files; +2.15 MB of AAC twins, only one format is fetched) |
| web_check gzip estimate | 4.31 MB | 6.46 MB (budget 12) |
| boot requests | 43 (28 audio) | 17 (2 audio) |
| boot bytes | 1,141 KB | 903 KB |

## Cross-repo follow-ups
- metaverse-hub: the hub's `fetch:games` downloads the `web-build` artifact, which is the production build and so
  has no `window.hpos`. Anything in the hub that drove `window.hpos` must use a `HPOS_TEST_BUILD=1` build.
- metaverse-hub: §1.2.4 server-side replay verification of `hpos10i_act_time` submissions.
