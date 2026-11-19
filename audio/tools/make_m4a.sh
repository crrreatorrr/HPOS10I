#!/usr/bin/env bash
# Writes an AAC (.m4a) twin next to every Ogg file in audio/sfx and audio/music.
# Safari and every iOS browser cannot decode Ogg Vorbis with Web Audio, so
# src/core/audio.ts loads these there (it picks the format with canPlayType).
# Re-run after audio/tools/make_audio.py changes an Ogg file.
#
#   audio/tools/make_m4a.sh            # every file
#   audio/tools/make_m4a.sh jump z1    # only these names
set -euo pipefail
cd "$(dirname "$0")/.."
want=("$@")
for ogg in sfx/*.ogg music/*.ogg; do
  name=$(basename "$ogg" .ogg)
  rate=96k; [[ $ogg == sfx/* ]] && rate=128k  # short effects: more headroom against AAC overshoot
  if [ ${#want[@]} -gt 0 ] && [[ ! " ${want[*]} " == *" $name "* ]]; then continue; fi
  ffmpeg -hide_banner -loglevel error -y -i "$ogg" -map_metadata -1 -c:a aac -b:a "$rate" \
    -movflags +faststart "${ogg%.ogg}.m4a"
done
