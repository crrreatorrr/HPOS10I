# QA

QA reviews every branch against `qa/checklists/` and writes a report to
`qa/reports/<NN>-<branch>.md` (verdict, bugs by severity: blocker, major,
minor). QA work changes nothing outside `qa/`, `tools/qa/` and `tests/qa/`;
bugs go back to the owning agent. Older reports describe the Godot build and
are kept as history.

## Tools

| Tool | What it does |
|---|---|
| `tools/qa/originality_scan.sh` | Finds names of existing franchises, studios, real people and brands in text files, file names and folder names (and optionally commit messages). |
| `tools/qa/web_check.mjs` | Static checks on the web build: files, viewport, relative URLs, no dev content, no shared memory, Ogg-only audio, the hub SDK bundled, size budgets. |
| `tools/qa/smoke.mjs` | Boots the web build in headless Chromium, opens every registered scene for two seconds and fails on any page or console error or a blank screen; then plays title → zone select → act 1 by keyboard. |
| `tools/qa/level_lint.ts` | Level-design rules (loops, spawns, tunnels, fillets, steps, narrow solids, diver posts) and the difficulty measures against `docs/LEVELS.md` (length, enemy density per section, tier mix, checkpoints, tickets, direction, the in-act ramp). Run by `tests/qa/level_lint.test.ts`. |
| `tools/qa/playtest_bot.ts` | A headless bot that plays any act through the real input actions, deaths and respawns (runner and pilot policies), and replays recorded input timelines. Run by `tests/qa/playtest*.test.ts` (`npm run test:bots`). `tests/qa/record_runs.test.ts` (`npm run record:runs`) records the pilot's inputs on every act of Zones 1 to 3 into `tests/levels/inputs/`. |
| `tools/qa/checker_check.py` | Is a terrain fill a diamond checker or a square one? (zone art rule). |

## Running

```bash
npm test                       # everything fast, QA lint and contract tests included
npm run test:bots              # the playtest bots on every act (several minutes)
tools/qa/originality_scan.sh . # add --commits=main..HEAD for commit messages
npm run build && node tools/qa/web_check.mjs build/web && npm run smoke
```

### Originality scan

```bash
tools/qa/originality_scan.sh [project_dir] [--reveal] [--commits[=RANGE]] [--no-files]
```

- Scans text files (`.ts .js .mjs .md .json .yml .html .css .sh .py` and
  more), every file name and every folder name. Git-ignored files are
  skipped when the project is a git checkout.
- The denylist (`tools/qa/denylist.b64`) is base64 and decoded only in
  memory; matches are masked unless `--reveal`.
- `tools/qa/originality_allow.txt` accepts reviewed exceptions by path or
  `path:line`. Keep every entry one line, one reason.

### Level lint and bots

The lint and the bot build levels headlessly in Node (the game's runtime has
no browser dependency), so a full act runs in seconds. Item boxes are added
at runtime and are not counted as enemies, tickets or checkpoints; the bots
run every act with boxes on and off and warn where a box slows a run.
