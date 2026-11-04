# HPOS10I

A 2D momentum platformer built with Godot 4.7.2 and GDScript. Read the relevant file in `docs/`
before changing that area: `DESIGN.md`, `CONTRACTS.md`, `PHYSICS.md` or `LEVELS.md`.

- This is a free, non-commercial fan parody that sells nothing. All characters, names, art, music,
  sound and levels must be original, with no existing franchises, real people or brands.
  `tools/qa/originality_scan.sh` enforces this.
- Every push to `main` redeploys the web build once all checks pass.
- QA work changes nothing outside `qa/`, `tools/qa/` and `tests/qa/`. See `qa/README.md`.
- `web/hub-sdk` is the vendored SDK from `metaverse-hub`. `tools/qa/originality_allow.txt` pins some
  of its line numbers, so update that file when those lines move.

## Checks

```bash
godot --headless --path . --import
tools/qa/originality_scan.sh .
godot --headless --fixed-fps 60 --path . -s res://tests/run_tests.gd
GODOT=godot tools/qa/scene_smoke.sh .
```

`tools/lead/gate.sh` runs the merge gate on a clean checkout of a commit.

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
