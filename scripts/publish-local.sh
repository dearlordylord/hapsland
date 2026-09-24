#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "$(git branch --show-current)" != "master" ]]; then
  echo "Publish from master after the release candidate is merged." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "Publish requires a clean worktree." >&2
  git status --short >&2
  exit 1
fi

if ! command -v mise >/dev/null 2>&1; then
  echo "Install mise with Node 24.20.0 before publishing." >&2
  exit 1
fi

# Authenticate before pulling so a missing npm login leaves the checkout unchanged.
mise exec node@24.20.0 -- npm whoami --registry=https://registry.npmjs.org/ >/dev/null
git pull --ff-only origin master
mise exec node@24.20.0 -- npm run release:local
