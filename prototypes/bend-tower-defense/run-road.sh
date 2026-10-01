#!/bin/sh
set -eu
road_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$road_dir"
if ! command -v bend >/dev/null 2>&1; then
  echo 'Bend 2.0.34 or compatible is required: https://bend-lang.com/' >&2
  exit 127
fi
road_build=${TMPDIR:-/tmp}/hapsland-bend-road-defense-$(id -u)
mkdir -p "$road_build"
bend RoadMain.bend -o "$road_build/road-defense"
exec "$road_build/road-defense" --threads 4 "$@"
