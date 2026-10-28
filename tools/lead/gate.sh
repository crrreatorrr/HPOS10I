#!/usr/bin/env bash
# Lead merge gate: runs every check on a clean checkout of a commit, so
# untracked local files can't hide or cause failures. Exits non-zero on the
# first failure; use it as `tools/lead/gate.sh && git push`.
#
# Usage: tools/lead/gate.sh [commit]   (default: HEAD)
set -uo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
commit="${1:-HEAD}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git -C "$repo" archive "$commit" | tar -x -C "$work"
mkdir -p "$work/build" && touch "$work/build/.gdignore"
echo "gate: $(git -C "$repo" rev-parse --short "$commit") in $work"

fail() {
	echo "gate: FAILED at $1 (log: $work/$1.log kept in $2)" >&2
	cp "$work/$1.log" "$2/" 2>/dev/null || true
	exit 1
}
logs="$repo/build/gate"
mkdir -p "$logs"

godot --headless --path "$work" --import >"$work/import.log" 2>&1 || fail import "$logs"
"$repo/tools/qa/originality_scan.sh" "$work" >"$work/originality.log" 2>&1 || fail originality "$logs"
godot --headless --fixed-fps 60 --path "$work" -s res://tests/run_tests.gd >"$work/tests.log" 2>&1 || fail tests "$logs"
SMOKE_IMPORT=0 "$repo/tools/qa/scene_smoke.sh" "$work" >"$work/smoke.log" 2>&1 || fail smoke "$logs"

echo "gate: PASS ($(grep -E 'passed' "$work/tests.log" | tail -1); $(tail -1 "$work/smoke.log"); $(tail -1 "$work/originality.log"))"
