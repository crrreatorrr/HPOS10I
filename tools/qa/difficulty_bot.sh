#!/usr/bin/env bash
# QA: playtest-bot clear times act by act (docs/LEVELS.md, "How it's checked":
# the bot must finish every act and its median time must rise from act to act).
# Owned by QA.
#
# Runs tools/qa/playtest_bot.gd on every built zone act (from
# `level_lint.gd -- --list-acts`), several runner variants per act (jump every
# 45/90/150/240 frames and never), takes the median clear time of the runs
# that finished, and checks it rises with the act's difficulty D (D >= 1;
# the test zone, D 0, is only reported). Slow (minutes): not part of CI.
#
# Usage:
#   tools/qa/difficulty_bot.sh [project_dir] [--runs=N] [--frames=N] [--allow-unfinished]
#     --runs=N             runner variants per act, 1-5 (default 5)
#     --frames=N           frame limit per run (default 18000 = 5 min)
#     --allow-unfinished   an act no run finishes is a warning, not a failure
# Env: GODOT (default: godot)
# Exit: 0 ok, or skipped (fewer than 2 acts with D >= 1);
#       1 an act never finished or a later act clears no slower; 2 usage.
set -euo pipefail

project_dir="."
runs=5
frames=18000
allow_unfinished=0
for arg in "$@"; do
	case "$arg" in
		--runs=*) runs="${arg#*=}" ;;
		--frames=*) frames="${arg#*=}" ;;
		--allow-unfinished) allow_unfinished=1 ;;
		--*) echo "difficulty_bot: unknown option $arg" >&2; exit 2 ;;
		*) project_dir="$arg" ;;
	esac
done
godot="${GODOT:-godot}"
jumps=(45 90 150 240 0)
if (( runs < 1 || runs > ${#jumps[@]} )); then
	echo "difficulty_bot: --runs must be 1-${#jumps[@]}" >&2
	exit 2
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/difficulty_bot.XXXXXX")"
trap 'rm -rf "${work:?}"' EXIT

"$godot" --headless --path "$project_dir" -s res://tools/qa/level_lint.gd -- --list-acts 2>/dev/null \
	| grep '^ACT ' > "$work/acts.txt" || true
if [[ ! -s "$work/acts.txt" ]]; then
	echo "difficulty_bot: no zone acts yet (skipped)"
	exit 0
fi

while read -r _ zone stage d path; do
	for ((i = 0; i < runs; i++)); do
		j="${jumps[$i]}"
		out="$work/${zone}_${stage}_j${j}.json"
		"$godot" --headless --fixed-fps 60 --path "$project_dir" -s res://tools/qa/playtest_bot.gd -- \
			--zone="$zone" --stage="$stage" --policy=runner --jump-every="$j" --frames="$frames" \
			--out="$out" > "$work/${zone}_${stage}_j${j}.log" 2>&1 || true
		echo "$zone $stage $d $path $j $out" >> "$work/runs.txt"
	done
done < "$work/acts.txt"

python3 -I - "$work/runs.txt" "$allow_unfinished" <<'EOF'
import json, os, statistics, sys

runs_file, allow_unfinished = sys.argv[1], sys.argv[2] == "1"
acts = {}
for line in open(runs_file):
    zone, stage, d, path, jump, out = line.split()
    act = acts.setdefault((zone, int(stage)), {"d": int(d), "path": path, "times": [], "stuck": []})
    try:
        data = json.load(open(out))
    except (OSError, ValueError):
        act["stuck"].append("jump %s: no summary (crash?)" % jump)
        continue
    frame = data.get("level_completed_frame", -1)
    if data.get("level_completed") and frame >= 0:
        act["times"].append(frame / 60.0)
    else:
        final = data.get("final") or {}
        act["stuck"].append("jump %s: not finished, stopped near x=%s" % (jump, final.get("x")))

failures = 0
ordered = sorted(acts.items(), key=lambda kv: (kv[1]["d"], kv[0]))
print("difficulty_bot: median clear time per act (runner policy)")
for (zone, stage), act in ordered:
    if act["times"]:
        act["median"] = statistics.median(act["times"])
        print("  D%d %s act %d: median %.1f s over %d/%d runs %s" % (
            act["d"], zone, stage, act["median"], len(act["times"]),
            len(act["times"]) + len(act["stuck"]), sorted(round(t, 1) for t in act["times"])))
    else:
        act["median"] = None
        level = "WARN" if allow_unfinished else "FAIL"
        failures += 0 if allow_unfinished else 1
        print("  %s D%d %s act %d: the bot never finished (%s)" % (level, act["d"], zone, stage, "; ".join(act["stuck"])))

curve = [(k, a) for k, a in ordered if a["d"] >= 1 and a["median"] is not None]
if len(curve) < 2:
    print("difficulty_bot: fewer than 2 finished acts with D >= 1; order check skipped")
else:
    for (prev_key, prev), (key, cur) in zip(curve, curve[1:]):
        if cur["d"] == prev["d"]:
            continue
        if cur["median"] <= prev["median"]:
            failures += 1
            print("  FAIL %s act %d (D%d, %.1f s) clears no slower than %s act %d (D%d, %.1f s)" % (
                key[0], key[1], cur["d"], cur["median"], prev_key[0], prev_key[1], prev["d"], prev["median"]))
print("difficulty_bot: %d failure(s)" % failures)
sys.exit(1 if failures else 0)
EOF
