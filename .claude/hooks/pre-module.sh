#!/usr/bin/env bash
# Fires before a new .py file is written.
# Reads the filename from the CLAUDE_TOOL_INPUT env var (injected by the harness).

FILE=$(echo "$CLAUDE_TOOL_INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null)

# Only gate on .py files inside the project root (not __pycache__, not .env, etc.)
if [[ "$FILE" != *.py ]] || [[ "$FILE" == */__pycache__/* ]]; then
  exit 0
fi

BASENAME=$(basename "$FILE")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PRE-MODULE APPROVAL REQUIRED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  About to write: $BASENAME"
echo ""
echo "  Claude must walk through EVERY task/function"
echo "  in this module one by one and get your approval"
echo "  before writing any code."
echo ""
echo "  Required format for each task/function:"
echo ""
echo "    Task 1: <function or task name>"
echo "    Plan:"
echo "    - <what it does>"
echo "    - <key implementation decision>"
echo "    - <inputs / outputs>"
echo "    Approve this task? (yes / edit)"
echo ""
echo "    Task 2: <next function or task name>"
echo "    Plan:"
echo "    - ..."
echo "    Approve this task? (yes / edit)"
echo ""
echo "  Only after ALL tasks are approved should"
echo "  Claude write the file."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
