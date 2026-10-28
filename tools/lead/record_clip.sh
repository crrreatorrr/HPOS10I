#!/usr/bin/env bash
# Records a gameplay clip with Godot's Movie Maker (scripted input, fixed
# 60 fps) and converts it to MP4 and a small GIF for review.
#
# Usage:
#   tools/lead/record_clip.sh <name> <frames> [user args passed after --]
# Example:
#   tools/lead/record_clip.sh physics_tour 900 \
#     --scene=res://tests/physics/sandbox.tscn \
#     --inputs=res://tests/physics/inputs/tour.json --overlay
#
# PROJECT_DIR overrides the project (e.g. an agent worktree).
# Clips land in $PROJECT_DIR/build/clips (git-ignored).
set -euo pipefail

if [[ $# -lt 2 ]]; then
	sed -n '2,13p' "$0"
	exit 1
fi

project_dir="${PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
out_dir="$project_dir/build/clips"
name="$1"
frames="$2"
shift 2

mkdir -p "$out_dir"
# Keep Godot from importing anything recorded under build/.
touch "$project_dir/build/.gdignore"
log="$out_dir/$name.log"
# macOS stops redrawing a window when the display dims or the window is
# covered, and Movie Maker then repeats the last image. Keep the display
# awake while recording, and retry if too many frames are repeats.
min_unique="${MIN_UNIQUE:-0.7}"
for attempt in 1 2; do
	caffeinate -dimsu -t $((frames / 60 + 60)) &
	awake_pid=$!
	godot --path "$project_dir" --always-on-top --write-movie "$out_dir/$name.avi" --quit-after "$frames" -- "$@" >"$log" 2>&1
	{ kill "$awake_pid" && wait "$awake_pid"; } 2>/dev/null || true
	# A typo'd --scene silently records the dev menu, so treat any error as fatal.
	if grep -E "ERROR|SCRIPT ERROR" "$log"; then
		echo "record_clip: Godot reported errors (full log: $log)" >&2
		rm -f "$out_dir/$name.avi"
		exit 1
	fi
	unique=$(ffmpeg -i "$out_dir/$name.avi" -vf mpdecimate -f null - 2>&1 | grep -oE "frame= *[0-9]+" | tail -1 | grep -oE "[0-9]+")
	ratio=$(python3 -c "print(round(${unique:-0} / $frames, 2))")
	if python3 -c "import sys; sys.exit(0 if $ratio >= $min_unique else 1)"; then
		break
	fi
	echo "record_clip: only $ratio of frames are unique (window throttled?)" >&2
	if [[ $attempt == 2 ]]; then
		echo "record_clip: keeping the clip anyway; set MIN_UNIQUE lower for mostly static scenes" >&2
	fi
done
rm "$log"

ffmpeg -y -loglevel error -i "$out_dir/$name.avi" \
	-vf "scale=iw*3:ih*3:flags=neighbor" \
	-c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$out_dir/$name.mp4"
ffmpeg -y -loglevel error -i "$out_dir/$name.avi" \
	-vf "fps=30,scale=iw*2:ih*2:flags=neighbor,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none" \
	"$out_dir/$name.gif"
rm "$out_dir/$name.avi"

echo "$out_dir/$name.mp4 (unique frames: $ratio)"
echo "$out_dir/$name.gif"
