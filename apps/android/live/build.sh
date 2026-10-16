#!/bin/sh
# Rebuilds app/src/main/assets/live/bridge.js from bridge.ts with the repo's
# automerge packages (run `npm ci` at the repo root first). The built file is
# committed, so building the Android app needs no Node.
set -e
cd "$(dirname "$0")"
ROOT=../../..
"$ROOT/node_modules/.bin/esbuild" bridge.ts --bundle --format=iife --platform=browser --target=chrome100 --minify \
  --main-fields=browser,module,main --conditions=webpack --outfile=../app/src/main/assets/live/bridge.js
