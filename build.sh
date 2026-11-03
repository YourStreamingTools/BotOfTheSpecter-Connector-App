#!/usr/bin/env bash
# ============================================================
#  BotOfTheSpecter Desktop - release build (macOS / Linux)
#
#  ./build.sh            Windows + Linux packages -> dist/
#                        (Windows installers need Wine on Linux; skipped without it)
#  ./build.sh --linux    Linux only (tar.gz, plus AppImage when run on Linux)
#  ./build.sh --win      Windows only (setup + portable; needs Wine on Linux, Rosetta on Apple Silicon)
#  ./build.sh --mac      macOS DMGs (Intel + Apple Silicon); run on a Mac.
#                        Signs with your "Developer ID Application" certificate if it is
#                        in the keychain, and notarizes with the APPLE_* settings in .env.mac
#                        (copy .env.mac.example; git ignores .env.mac).
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

# --mac and --skip-checks can come in any order.
MAC=0
SKIP_CHECKS=0
for arg in "$@"; do
  case "$arg" in
    --mac) MAC=1 ;;
    --skip-checks) SKIP_CHECKS=1 ;;
  esac
done

if [ "$MAC" = 1 ]; then
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "[ERROR] macOS builds must run on a Mac." >&2
    exit 1
  fi
  for arg in "$@"; do
    if [ "$arg" != "--mac" ] && [ "$arg" != "--skip-checks" ]; then
      echo "[ERROR] --mac builds only the macOS DMGs; it can't be combined with $arg." >&2
      exit 1
    fi
  done
  # Signing/notarization settings live in .env.mac (git-ignored); see .env.mac.example.
  if [ -f .env.mac ]; then
    echo "Loading signing settings from .env.mac"
    set -a
    . ./.env.mac
    set +a
  else
    echo "[WARN] No .env.mac - the app will not be notarized. See .env.mac.example."
  fi
  node scripts/ensure-deps.mjs
  if [ "$SKIP_CHECKS" = 0 ]; then
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
