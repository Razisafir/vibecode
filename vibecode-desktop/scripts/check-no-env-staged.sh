#!/usr/bin/env bash
# check-no-env-staged.sh — Verify no .env files are staged for commit
set -euo pipefail

staged_env=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.env$|\.env\.' | grep -v '\.env\.example$' || true)

if [ -n "$staged_env" ]; then
  echo "ERROR: The following .env files are staged for commit:"
  echo "$staged_env"
  echo ""
  echo "Unstage them with: git reset HEAD <file>"
  exit 1
fi

echo "OK: No .env files staged."
exit 0
