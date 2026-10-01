#!/bin/sh
set -eu
td_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$td_dir"
if ! command -v bend >/dev/null 2>&1; then
  echo 'Bend 2.0.34 or compatible is required: https://bend-lang.com/' >&2
  exit 127
fi
td_build=${TMPDIR:-/tmp}/hapsland-bend-tower-defense-$(id -u)
mkdir -p "$td_build"
bend Main.bend -o "$td_build/tower-defense"
exec "$td_build/tower-defense" --threads 4 "$@"
