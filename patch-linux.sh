#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ ! -d node_modules/@electron/asar ]]; then
  echo "Installing pinned Node dependencies..."
  npm ci
fi

exec node linux-appimage.js "$@"
