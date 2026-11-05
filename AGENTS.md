# HPOS10I

A 2D momentum platformer for the web, written in TypeScript with no game engine (Vite builds it,
Vitest tests it). Read the relevant file in `docs/` before changing that area: `DESIGN.md`,
`CONTRACTS.md`, `PHYSICS.md` or `LEVELS.md`.

- This is a free, non-commercial fan parody that sells nothing. All characters, names, art, music,
  sound and levels must be original, with no existing franchises, real people or brands.
  `tools/qa/originality_scan.sh` enforces this.
- Every push to `main` redeploys the web build once all checks pass.
- QA work changes nothing outside `qa/`, `tools/qa/` and `tests/qa/`. See `qa/README.md`.
- `vendor/hub-sdk` is the vendored SDK from `metaverse-hub`, built and copied by that repo's
  `scripts/vendor-sdk.mjs`. `tools/qa/originality_allow.txt` pins some of its line numbers, so
  update that file when those lines move.

## Checks

```bash
npm ci
npm run typecheck
npm test
tools/qa/originality_scan.sh .
npm run build && node tools/qa/web_check.mjs build/web && npm run smoke
```

`tools/lead/gate.sh` runs the merge gate on a clean checkout of a commit. The smoke test needs
Playwright's Chromium (preinstalled in the cloud containers; CI installs it).

## Art generation

Follow `docs/higgsfield-workflow-guide.md`. This repo uses the **sprite sheet** workflow. If the owner says to skip approvals, follow that section of the guide.

## Working with other agents

Claude Code, Codex, Cursor and Grok Bot all work on this repo.

- Start each task on its own branch from the latest `main`, named `<agent>/<slug>`. Never push to
  `main`; open a pull request.
- On the owner's machine, `agent-task new HPOS10I <slug> --agent <name>` creates that branch in its
  own worktree.
- Don't edit files that another active task is changing.
- Run the checks before opening a pull request, and report any you could not run.
- A different agent reviews the work: `agent-task review <path>`, or `/codex:adversarial-review` in
  Claude Code.
