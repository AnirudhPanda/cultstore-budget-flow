#!/bin/zsh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="/Users/anirudh.panda/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

if [ ! -x "$NODE_BIN" ]; then
  echo "Bundled Node runtime not found at:"
  echo "  $NODE_BIN"
  exit 1
fi

cd "$SCRIPT_DIR" || exit 1
exec "$NODE_BIN" server.js
