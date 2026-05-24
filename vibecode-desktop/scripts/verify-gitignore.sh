#!/usr/bin/env bash
# verify-gitignore.sh — Ensure critical patterns are in .gitignore
set -euo pipefail

gitignore="${1:-.gitignore}"

if [ ! -f "$gitignore" ]; then
  echo "ERROR: $gitignore not found!"
  exit 1
fi

required_patterns=(
  'node_modules'
  '.env'
  'dist/'
  'dist-electron/'
  '*.log'
  '.DS_Store'
  'Thumbs.db'
)

missing=0
for pattern in "${required_patterns[@]}"; do
  if ! grep -qE "^${pattern}" "$gitignore" 2>/dev/null && ! grep -qF "$pattern" "$gitignore" 2>/dev/null; then
    echo "MISSING: '$pattern' not found in $gitignore"
    missing=1
  fi
done

if [ "$missing" -eq 1 ]; then
  echo ""
  echo "Add missing patterns to $gitignore"
  exit 1
fi

echo "OK: All critical .gitignore patterns present."
exit 0
