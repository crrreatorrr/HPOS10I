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
log="$out_dir/$name.log"
godot --path "$project_dir" --write-movie "$out_dir/$name.avi" --quit-after "$frames" -- "$@" >"$log" 2>&1
# A typo'd --scene silently records the dev menu, so treat any error as fatal.
if grep -E "ERROR|SCRIPT ERROR" "$log"; then
	echo "record_clip: Godot reported errors (full log: $log)" >&2
	rm -f "$out_dir/$name.avi"
	exit 1
fi
rm "$log"

ffmpeg -y -loglevel error -i "$out_dir/$name.avi" \
	-vf "scale=iw*3:ih*3:flags=neighbor" \
	-c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$out_dir/$name.mp4"
ffmpeg -y -loglevel error -i "$out_dir/$name.avi" \
	-vf "fps=30,scale=iw*2:ih*2:flags=neighbor,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none" \
	"$out_dir/$name.gif"
rm "$out_dir/$name.avi"

echo "$out_dir/$name.mp4"
echo "$out_dir/$name.gif"
