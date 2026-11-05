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
echo "gate: $(git -C "$repo" rev-parse --short "$commit") in $work"

fail() {
	echo "gate: FAILED at $1 (log kept in $2/$1.log)" >&2
	cp "$work/$1.log" "$2/" 2>/dev/null || true
	exit 1
}
logs="$repo/build/gate"
mkdir -p "$logs"

(cd "$work" && npm ci --no-audit --no-fund) >"$work/install.log" 2>&1 || fail install "$logs"
(cd "$work" && npm run typecheck) >"$work/typecheck.log" 2>&1 || fail typecheck "$logs"
"$repo/tools/qa/originality_scan.sh" "$work" >"$work/originality.log" 2>&1 || fail originality "$logs"
(cd "$work" && npm test) >"$work/tests.log" 2>&1 || fail tests "$logs"
(cd "$work" && npm run test:bots) >"$work/bots.log" 2>&1 || fail bots "$logs"
(cd "$work" && npm run build) >"$work/build.log" 2>&1 || fail build "$logs"
node "$work/tools/qa/web_check.mjs" "$work/build/web" >"$work/web_check.log" 2>&1 || fail web_check "$logs"
node "$work/tools/qa/smoke.mjs" "$work/build/web" >"$work/smoke.log" 2>&1 || fail smoke "$logs"

echo "gate: PASS ($(grep -E 'Tests' "$work/tests.log" | tail -1 | xargs); $(tail -1 "$work/smoke.log"); $(tail -1 "$work/originality.log"))"
