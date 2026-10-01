#!/bin/sh
set -eu
flow_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$flow_dir"
if ! command -v bend >/dev/null 2>&1; then
  echo 'Bend 2.0.34 or compatible is required: https://bend-lang.com/' >&2
  exit 127
fi
flow_build=${TMPDIR:-/tmp}/hapsland-bend-flow-watch-$(id -u)
mkdir -p "$flow_build"
bend FlowMain.bend -o "$flow_build/flow-watch"
exec "$flow_build/flow-watch" --threads 4 "$@"
