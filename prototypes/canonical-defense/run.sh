#!/usr/bin/env bash
set -euo pipefail
prototype_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$prototype_dir"
if ! command -v bend >/dev/null 2>&1; then
  echo 'Bend is required to compile this native prototype.' >&2
  exit 1
fi
prototype_binary="${TMPDIR:-/tmp}/hapsland-canonical-defense-${UID:-user}-$$"
# LLVM 14 on Linux ARM64 cannot optimize the generated large musttail graph.
# Let Bend retain ownership of native platform flags while lowering optimization.
if [[ "$(uname -s)" == Linux && "$(uname -m)" == aarch64 ]]; then
  prototype_cc="$(mktemp "${TMPDIR:-/tmp}/hapsland-defense-cc.XXXXXX")"
  trap 'rm -f "$prototype_cc"' EXIT
  cat > "$prototype_cc" <<'COMPILER'
#!/usr/bin/env bash
set -euo pipefail
args=()
for arg in "$@"; do
  if [[ "$arg" == -O3 ]]; then arg=-O0; fi
  args+=("$arg")
done
exec "$BEND_DEFENSE_ORIGINAL_CC" "${args[@]}"
COMPILER
  chmod +x "$prototype_cc"
  BEND_DEFENSE_ORIGINAL_CC="${CC:-clang}" CC="$prototype_cc" bend DefenseMain.bend -o "$prototype_binary"
  rm -f "$prototype_cc"
  trap - EXIT
else
  bend DefenseMain.bend -o "$prototype_binary"
fi
exec "$prototype_binary" --threads 4 "$@"
