#!/bin/sh
set -eu

case "${0##*/}" in
  hapsland) entry=dist/cli.js ;;
  hapsland-doctor) entry=dist/package-doctor.js ;;
  hapsland-parser) entry=dist/parser-main.js ;;
  hapsland-resident) entry=dist/resident/main.js ;;
  *) echo "Unknown review integration command." >&2; exit 2 ;;
esac

self=$0
while [ -L "$self" ]; do
  target=$(readlink "$self")
  case "$target" in
    /*) self=$target ;;
    *) self=$(dirname "$self")/$target ;;
  esac
done
package_root=$(CDPATH= cd "$(dirname "$self")/.." && pwd -P)

case "$(uname -s)/$(uname -m)" in
  Darwin/arm64) runtime_package=node-bin-darwin-arm64 ;;
  Linux/aarch64|Linux/arm64) runtime_package=node-linux-arm64 ;;
  *) echo "This review integration package does not support this OS and architecture." >&2; exit 2 ;;
esac

runtime="$package_root/node_modules/$runtime_package/bin/node"
if [ ! -x "$runtime" ]; then
  runtime="$package_root/../../$runtime_package/bin/node"
fi
if [ ! -x "$runtime" ]; then
  echo "The review integration runtime is missing. Reinstall the package with optional dependencies enabled." >&2
  exit 2
fi

exec "$runtime" "$package_root/$entry" "$@"
