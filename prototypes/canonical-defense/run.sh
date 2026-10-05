#!/usr/bin/env bash
set -euo pipefail
prototype_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$prototype_dir"
if ! command -v bend >/dev/null 2>&1; then
  echo 'Bend is required to compile this native prototype.' >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js is required to identify and cache this native build.' >&2
  exit 1
fi
# Apple clang 21 on ARM64 clobbers a live preserve_none argument (x9) when
# inserting Darwin stack probes into a large frame. This is the Apple symptom
# reported in https://github.com/bendlang/bend/issues/1233; the isolated trigger
# and controls are retained in compiler-repro/apple-clang21-stack-probe.c.
# Keep Bend's -O3/musttail ABI and scope the workaround to this compiler/host.
native_cc="${CC:-clang}"
compiler_version="$("$native_cc" --version 2>/dev/null || true)"
if [[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 \
  && "$compiler_version" == *"Apple clang version 21."* ]]; then
  prototype_binary="$(BEND_CANONICAL_DEFENSE_CC="$native_cc" \
    CC="$prototype_dir/clang-no-stack-check.sh" \
    node "$prototype_dir/cached-build.mjs")"
else
  prototype_binary="$(node "$prototype_dir/cached-build.mjs")"
fi
exec "$prototype_binary" --threads 4 "$@"
