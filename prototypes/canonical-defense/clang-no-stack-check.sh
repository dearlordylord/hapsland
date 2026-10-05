#!/usr/bin/env bash
set -euo pipefail
# run.sh selects this wrapper only for Apple clang 21 on Darwin ARM64.
# preserve_none passes a live argument in x9; Darwin stack probing overwrites
# it and clang aborts with "live register clobbered by inserted prologue
# instructions". See https://github.com/bendlang/bend/issues/1233 and the
# adjacent compiler-repro/apple-clang21-stack-probe.c. Remove this workaround
# once the selected Apple compiler passes that reproducer with -fstack-check.
# Append the flag so it also overrides an earlier -fstack-check. Forward the
# selected compiler and all other arguments, including Bend's version probe.
exec "${BEND_CANONICAL_DEFENSE_CC:?run through canonical-defense/run.sh}" "$@" -fno-stack-check
