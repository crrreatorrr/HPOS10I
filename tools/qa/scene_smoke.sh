#!/usr/bin/env bash
# QA scene smoke test: runs every .tscn in a Godot project headless for a few
# frames and flags any ERROR / SCRIPT ERROR / WARNING line, crash, timeout or
# non-zero exit. Owned by QA.
#
# Usage:
#   tools/qa/scene_smoke.sh [project_dir]
#
# Rows, in order:
#   (scripts)  every .gd loaded once by tools/qa/parse_check.gd (catches parse
#              errors that `godot --import` does not report)
#   (boot)     the main scene with no arguments, like a player launching the game
#   res://...  each scene through the real boot path:
#              godot --headless --fixed-fps 60 --path P --quit-after N -- --scene=res://...
#
# Environment:
#   GODOT=godot          Godot binary
#   FRAMES=120           frames per scene
#   TIMEOUT_S=60         wall-clock limit per run (a hang is a failure)
#   SMOKE_SKIP=''        extended regex; matching res:// paths are skipped
#   SMOKE_LOG_DIR=...    where full logs go (default: a new temp dir)
#   SMOKE_IMPORT=1       run `godot --import` first (0 to skip)
#
# Skipped automatically: .godot/, .git/, .worktrees/, build/, node_modules/,
# hidden folders and folders containing .gdignore (Godot cannot load them).
# Exit: 0 all pass, 1 any failure, 2 usage error.
set -uo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="${1:-$(cd "$script_dir/../.." && pwd)}"
GODOT="${GODOT:-godot}"
FRAMES="${FRAMES:-120}"
TIMEOUT_S="${TIMEOUT_S:-60}"
SMOKE_SKIP="${SMOKE_SKIP:-}"
SMOKE_IMPORT="${SMOKE_IMPORT:-1}"

if [[ ! -f "$project_dir/project.godot" ]]; then
	echo "scene_smoke: no project.godot in '$project_dir'" >&2
	exit 2
fi
if ! command -v "$GODOT" >/dev/null 2>&1; then
	echo "scene_smoke: Godot binary '$GODOT' not found" >&2
	exit 2
fi
project_dir="$(cd "$project_dir" && pwd)"
tmp_root="${TMPDIR:-/tmp}"
log_dir="${SMOKE_LOG_DIR:-$(mktemp -d "${tmp_root%/}/scene_smoke.XXXXXX")}"
mkdir -p "$log_dir"

# The issue pattern is case-sensitive on purpose: Godot prints ERROR:,
# SCRIPT ERROR:, WARNING: and crash banners in capitals.
issue_re='ERROR|WARNING|handle_crash|Program crashed|Segmentation fault'

# Runs a command with a wall-clock limit (perl is on macOS and Linux runners).
run_limited() {
	perl -e 'alarm shift @ARGV; exec @ARGV or exit 127' "$TIMEOUT_S" "$@"
}

strip_ansi() {
	sed -e $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$1"
}

declare -a rows=()
declare -a details=()
fail_count=0
total=0

# check_run <label> <log> <exit_code> <seconds>
check_run() {
	local label="$1" log="$2" code="$3" secs="$4"
	local issues first status reason=""
	issues="$(strip_ansi "$log" | grep -E "$issue_re" | grep -vE '^[[:space:]]+(at:|GDScript backtrace|\[[0-9]+\])' || true)"
	local n_issues=0
	if [[ -n "$issues" ]]; then
		n_issues="$(printf '%s\n' "$issues" | wc -l | tr -d ' ')"
	fi
	status="PASS"
	if [[ "$code" -eq 142 ]]; then
		status="FAIL"; reason="timeout after ${TIMEOUT_S}s"
	elif [[ "$code" -ne 0 ]]; then
		status="FAIL"; reason="exit code $code"
	fi
	if [[ "$n_issues" -gt 0 ]]; then
		status="FAIL"
		first="$(printf '%s\n' "$issues" | head -n 1 | sed -e 's/^[[:space:]]*//' | cut -c1-90)"
		reason="${reason:+$reason; }$first"
	fi
	total=$((total + 1))
	if [[ "$status" == "FAIL" ]]; then
		fail_count=$((fail_count + 1))
		details+=("--- $label  (exit $code, $n_issues issue lines, log: $(basename "$log"))")
		if [[ -n "$issues" ]]; then
			# Unique lines in first-seen order, with repeat counts.
			details+=("$(printf '%s\n' "$issues" | sed -e 's/^[[:space:]]*//' \
				| awk '{ if (!($0 in c)) o[++n] = $0; c[$0]++ } END { for (i = 1; i <= n && i <= 8; i++) printf "    %4dx %s\n", c[o[i]], o[i] }')")
		fi
	fi
	rows+=("$(printf '%-4s  %5s  %6s  %s%s' "$status" "$secs" "$n_issues" "$label" "${reason:+  <- $reason}")")
}

# time_run <log> <cmd...>; sets RUN_CODE and RUN_SECS
time_run() {
	local log="$1"; shift
	local start end
	start="$(date +%s)"
	run_limited "$@" >"$log" 2>&1
	RUN_CODE=$?
	end="$(date +%s)"
	RUN_SECS=$((end - start))
}

echo "scene_smoke: project $project_dir"
echo "scene_smoke: $FRAMES frames per scene, ${TIMEOUT_S}s limit, logs in $log_dir"

if [[ "$SMOKE_IMPORT" == "1" ]]; then
	time_run "$log_dir/_import.log" "$GODOT" --headless --path "$project_dir" --import
	check_run "(import)" "$log_dir/_import.log" "$RUN_CODE" "$RUN_SECS"
fi

if [[ -f "$project_dir/tools/qa/parse_check.gd" ]]; then
	time_run "$log_dir/_scripts.log" "$GODOT" --headless --path "$project_dir" -s res://tools/qa/parse_check.gd
	check_run "(scripts) $(grep -o 'PARSE_CHECK [0-9]* scripts' "$log_dir/_scripts.log" | sed 's/PARSE_CHECK //')" \
		"$log_dir/_scripts.log" "$RUN_CODE" "$RUN_SECS"
fi

main_scene="$(sed -n 's/^run\/main_scene="\(.*\)"/\1/p' "$project_dir/project.godot" | head -n 1)"
if [[ -n "$main_scene" ]]; then
	time_run "$log_dir/_boot.log" "$GODOT" --headless --fixed-fps 60 --path "$project_dir" --quit-after "$FRAMES"
	check_run "(boot) $main_scene" "$log_dir/_boot.log" "$RUN_CODE" "$RUN_SECS"
fi

# Folders Godot ignores.
ignored=()
while IFS= read -r marker; do
	ignored+=("$(dirname "$marker")/")
done < <(find "$project_dir" \( -name .godot -o -name .git -o -name .worktrees -o -name build -o -name node_modules \) -prune \
	-o -name .gdignore -type f -print)

scenes=()
while IFS= read -r file; do
	skip=0
	for dir in "${ignored[@]+"${ignored[@]}"}"; do
		[[ "$file" == "$dir"* ]] && skip=1 && break
	done
	[[ $skip -eq 1 ]] && continue
	scenes+=("res://${file#"$project_dir"/}")
done < <(find "$project_dir" \( -name .godot -o -name .git -o -name .worktrees -o -name build -o -name node_modules -o -name '.?*' -type d \) -prune \
	-o -name '*.tscn' -type f -print | LC_ALL=C sort)

skipped=0
for res in "${scenes[@]+"${scenes[@]}"}"; do
	if [[ "$res" == "$main_scene" ]]; then
		# --scene=<main scene> would make the boot scene reopen itself forever;
		# the (boot) row already covers it.
		continue
	fi
	if [[ -n "$SMOKE_SKIP" ]] && [[ "$res" =~ $SMOKE_SKIP ]]; then
		rows+=("$(printf '%-4s  %5s  %6s  %s' "SKIP" "-" "-" "$res")")
		skipped=$((skipped + 1))
		continue
	fi
	safe="$(printf '%s' "${res#res://}" | tr '/' '_')"
	time_run "$log_dir/$safe.log" "$GODOT" --headless --fixed-fps 60 --path "$project_dir" \
		--quit-after "$FRAMES" -- --scene="$res"
	check_run "$res" "$log_dir/$safe.log" "$RUN_CODE" "$RUN_SECS"
done

echo
printf '%-4s  %5s  %6s  %s\n' "RES" "SECS" "ISSUES" "TARGET"
printf '%s\n' "${rows[@]}"
if [[ ${#details[@]} -gt 0 ]]; then
	echo
	echo "Failures:"
	printf '%s\n' "${details[@]}"
fi
echo
echo "scene_smoke: $total run, $((total - fail_count)) passed, $fail_count failed, $skipped skipped"
[[ $fail_count -eq 0 ]]
