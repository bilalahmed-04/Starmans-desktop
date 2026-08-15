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

# --- Guard: setup-sqlserver.ps1 must be pure ASCII -------------------------
# Windows PowerShell 5.1 reads a BOM-less file as ANSI/Windows-1252, NOT UTF-8.
# A UTF-8 em-dash then arrives as three garbage bytes, one of which terminates
# a string early, and the whole script fails to PARSE - so nothing runs and no
# log is written, which is exactly what happened on the v1.0.3 and v1.0.4
# Windows installs. The script carries a BOM now, but ASCII-only is the belt to
# that braces: it parses identically under every encoding guess.
#
# This is checked here rather than trusted to review because the failure is
# invisible on Linux - Python/editors read the file as UTF-8 and see nothing
# wrong. Only the Windows runtime disagrees.
echo "=== Pass 0/2: setup-sqlserver.ps1 encoding guard ==="
PS1="setup-sqlserver.ps1"
# The BOM is itself non-ASCII bytes, so it must be skipped before scanning the
# content - otherwise the guard flags the very thing it requires.
if ! head -c 3 "$PS1" | cmp -s - <(printf '\xef\xbb\xbf'); then
  echo "ERROR: $PS1 is missing its UTF-8 BOM" >&2
  exit 1
fi
if tail -c +4 "$PS1" | grep -qP '[^\x00-\x7F]'; then
  echo "ERROR: $PS1 contains non-ASCII characters:" >&2
  tail -c +4 "$PS1" | grep -nP '[^\x00-\x7F]' | head -10 >&2
  echo "Replace them with ASCII equivalents (- for dashes, etc)." >&2
  exit 1
fi
# installer.nsh too. NSIS did render a UTF-8 em-dash correctly in testing, so
# this is precaution rather than a known break - but the cost of a mangled
# character here is a garbled dialog on a client's screen, and the cost of
# enforcing ASCII is nil.
if grep -qP '[^\x00-\x7F]' installer.nsh; then
  echo "ERROR: installer.nsh contains non-ASCII characters:" >&2
  grep -nP '[^\x00-\x7F]' installer.nsh | head -10 >&2
  exit 1
fi
echo "  OK: setup-sqlserver.ps1 has its BOM and is pure ASCII; installer.nsh is pure ASCII"
echo

echo "=== Pass 1/2: installer compile (BUILD_UNINSTALLER not defined) ==="
"$MAKENSIS" -WX nsis-lint/pass_installer.nsi

echo
echo "=== Pass 2/2: uninstaller compile (BUILD_UNINSTALLER defined) ==="
"$MAKENSIS" -WX nsis-lint/pass_uninstaller.nsi

echo
echo "Both passes compiled clean — installer.nsh is safe for a real electron-builder build."
