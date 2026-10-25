#!/usr/bin/env bash
# ============================================================
#  BotOfTheSpecter Desktop - dev launcher (macOS / Linux)
#  Runs the Electron app in dev mode (hot reload).
#  Main-process logs print in this terminal; press
#  Cmd+Option+I (macOS) or Ctrl+Shift+I (Linux) in the app for the renderer console.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "============================================"
echo " BotOfTheSpecter Desktop - dev launcher"
echo "============================================"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] Node.js / npm was not found on your PATH."
  echo "Install Node.js 18 or newer from https://nodejs.org and run this script again."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[ERROR] Node.js 18 or newer is required (found $(node --version)). Update from https://nodejs.org"
  exit 1
fi

node scripts/ensure-deps.mjs

TARGET="$(node -p 'process.platform + "-" + process.arch')"
if [ ! -x "resources/mediamtx/$TARGET/mediamtx" ]; then
  echo "Downloading the local camera server (MediaMTX, one-time)..."
  npm run fetch:mediamtx -- "$TARGET" || echo "[WARN] MediaMTX download failed - the Cameras screen will say the camera server is not bundled."
  echo
fi

echo "Starting the app..."
echo "  - Close the app window, or press Ctrl+C here, to stop."
echo
npm run dev
