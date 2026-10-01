#!/usr/bin/env bash
set -euo pipefail
prototype_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$prototype_dir"
if ! command -v bend >/dev/null 2>&1; then
  echo 'Bend is required to compile this native prototype.' >&2
  exit 1
fi
prototype_binary="${TMPDIR:-/tmp}/hapsland-canonical-defense-${UID:-user}-$$"
bend DefenseMain.bend -o "$prototype_binary"
exec "$prototype_binary" --threads 4 "$@"
