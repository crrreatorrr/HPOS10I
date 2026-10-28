#!/usr/bin/env bash
# QA: runs the test suite at several render rates to catch frame-rate
# assumptions (code or tests that count process frames instead of physics
# ticks, or input that only lands one process frame later). Physics always
# ticks at 60 Hz; only the number of process frames per tick changes:
#   --fixed-fps 30   2 ticks per process frame (a slow phone)
#   --fixed-fps 60   1 : 1 (CI)
#   --fixed-fps 144  about 0.42 ticks per process frame (a fast monitor)
# A run without --fixed-fps would tick in real time (minutes per test), so
# fixed rates stand in for it. Owned by QA. About 2 minutes per rate.
#
# Usage: tools/qa/suite_framerates.sh [project_dir] [--rates=30,60,144] [-- --filter=...]
# Env: GODOT (default: godot)
# Exit: 0 when every rate passes, 1 otherwise.
set -uo pipefail

project_dir="."
rates="30,60,144"
extra=()
while (($#)); do
	case "$1" in
		--rates=*) rates="${1#*=}" ;;
		--) shift; extra=("$@"); break ;;
		*) project_dir="$1" ;;
	esac
	shift
done
godot="${GODOT:-godot}"
work="$(mktemp -d "${TMPDIR:-/tmp}/suite_framerates.XXXXXX")"
trap 'rm -rf "${work:?}"' EXIT

status=0
IFS=',' read -r -a list <<< "$rates"
for fps in "${list[@]}"; do
	log="$work/suite_$fps.log"
	if ((${#extra[@]})); then
		"$godot" --headless --fixed-fps "$fps" --path "$project_dir" -s res://tests/run_tests.gd -- "${extra[@]}" > "$log" 2>&1
	else
		"$godot" --headless --fixed-fps "$fps" --path "$project_dir" -s res://tests/run_tests.gd > "$log" 2>&1
	fi
	code=$?
	summary=$(grep -E '^[0-9]+ passed' "$log" | tail -1)
	echo "fixed-fps $fps: ${summary:-no summary (crash?)}"
	grep -E '^\s*FAIL' "$log" | sed 's/^/    /'
	if ((code != 0)); then
		status=1
	fi
done
exit $status
