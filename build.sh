#!/usr/bin/env bash
# ============================================================
#  BotOfTheSpecter Desktop - release build (macOS / Linux)
#
#  ./build.sh            Windows + Linux packages -> dist/
#                        (Windows installers need Wine on Linux; skipped without it)
#  ./build.sh --linux    Linux only (tar.gz, plus AppImage when run on Linux)
#  ./build.sh --win      Windows only (setup + portable; needs Wine on Linux)
#  ./build.sh --mac      macOS DMGs (Intel + Apple Silicon); run on a Mac.
#                        Signs with your "Developer ID Application" certificate if it is
#                        in the keychain, and notarizes if APPLE_API_KEY / APPLE_API_KEY_ID /
#                        APPLE_API_ISSUER (or APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD /
#                        APPLE_TEAM_ID) are set.
#  Add --skip-checks to skip the typecheck and tests.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found. Install Node.js 18 or newer from https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[ERROR] Node.js 18 or newer is required (found $(node --version))." >&2
  exit 1
fi

if [ "${1:-}" = "--mac" ]; then
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "[ERROR] macOS builds must run on a Mac." >&2
    exit 1
  fi
  shift
  node scripts/ensure-deps.mjs
  if [ "${1:-}" != "--skip-checks" ]; then
    npm run typecheck
    npm test
  fi
  npm run dist:mac
  echo
  echo "Done. DMGs are in dist/:"
  ls -1 dist/*.dmg
  exit 0
fi

node scripts/build.mjs "$@"
