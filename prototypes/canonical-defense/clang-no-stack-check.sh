#!/usr/bin/env bash
set -euo pipefail
# run.sh selects this wrapper for Apple clang 21 on Darwin ARM64 or explicit O0.
# preserve_none passes a live argument in x9; Darwin stack probing overwrites
# it and clang aborts with "live register clobbered by inserted prologue
# instructions". See https://github.com/bendlang/bend/issues/1233 and the
# adjacent compiler-repro/apple-clang21-stack-probe.c. Remove this workaround
# once the selected Apple compiler passes that reproducer with -fstack-check.
# Append the flag so it also overrides an earlier -fstack-check. Forward the
# selected compiler and all other arguments, including Bend's version probe.
local_flags=(-fno-stack-check)
if [[ "${HAPSLAND_GAME_OPTIMIZATION:-3}" == 0 ]]; then
  local_flags+=(-O0)
fi
exec "${BEND_CANONICAL_DEFENSE_CC:?run through canonical-defense/run.sh}" "$@" "${local_flags[@]}"
