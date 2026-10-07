#!/bin/sh
set -eu

case "${0##*/}" in
  hapsland|launch.sh) command=hapsland ;;
  hapsland-hook) command=hapsland-hook ;;
  hapsland-doctor) command=hapsland-doctor ;;
  hapsland-parser) command=hapsland-parser ;;
  hapsland-resident) command=hapsland-resident ;;
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
  Darwin/arm64) profile=darwin-arm64 ;;
  Linux/aarch64|Linux/arm64) profile=linux-arm64 ;;
  *) echo "This review integration package does not support this OS and architecture." >&2; exit 2 ;;
esac
executable="$package_root/dist/bin/$profile/$command"
if [ ! -x "$executable" ]; then
  echo "The standalone review integration executable is missing. Reinstall the package." >&2
  exit 2
fi
exec "$executable" "$@"
