#!/usr/bin/env bash
# Fires after a .py file is written.
# Reminds Claude to call the debugger subagent on the file that was just created.

FILE=$(echo "$CLAUDE_TOOL_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null)

if [[ "$FILE" != *.py ]] || [[ "$FILE" == */__pycache__/* ]]; then
  exit 0
fi

BASENAME=$(basename "$FILE")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  POST-MODULE DEBUG GATE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Written: $BASENAME"
echo ""
echo "  NEXT STEP: Call the debugger subagent on this"
echo "  file before moving to the next module."
echo ""
echo "  Debugger must report one of:"
echo "    PASS  → move to the next module"
echo "    FAIL  → report problem + proposed fix to user"
echo "            and wait for approval before changing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
