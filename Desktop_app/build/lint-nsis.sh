#!/usr/bin/env bash
# Compiles installer.nsh under both electron-builder compile passes using
# the harness files in nsis-lint/, with -WX (warnings as errors) so the
# exact "compiles as installer, fails as uninstaller" gotcha (or vice versa)
# is caught here in ~seconds, not partway through a ~3.5 minute Windows
# build job. See release_pipeline.md §2 Stage 2 and §6 Step 6.
#
# Requires `makensis` (apt-get install nsis on the CI runner — see
# .github/workflows/nsis-lint.yml). Run from anywhere; paths below are
# relative to this script's own location.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Prefer a system makensis (what the CI job installs via apt), but fall back
# to the Linux binary electron-builder already caches locally — that lets a
# developer run this lint without root/apt access, using the exact same NSIS
# version the real build uses.
if command -v makensis >/dev/null 2>&1; then
  MAKENSIS=makensis
else
  MAKENSIS=$(find "$HOME/.cache/electron-builder" -path '*/linux/makensis' -type f 2>/dev/null | head -1)
  if [ -z "$MAKENSIS" ]; then
    echo "makensis not found — install NSIS (apt-get install nsis), or run an" >&2
    echo "electron-builder Windows build once so it caches its own copy." >&2
    exit 1
  fi
  echo "(using electron-builder's cached NSIS: $MAKENSIS)"
fi

echo "=== Pass 1/2: installer compile (BUILD_UNINSTALLER not defined) ==="
"$MAKENSIS" -WX nsis-lint/pass_installer.nsi

echo
echo "=== Pass 2/2: uninstaller compile (BUILD_UNINSTALLER defined) ==="
"$MAKENSIS" -WX nsis-lint/pass_uninstaller.nsi

echo
echo "Both passes compiled clean — installer.nsh is safe for a real electron-builder build."
