#!/usr/bin/env bash
# check-no-secrets-staged.sh — Scan staged files for secret patterns
set -euo pipefail

staged_files=$(git diff --cached --name-only --diff-filter=ACMR | grep -vE '\.(lock|map|svg|png|jpg|ico)$' || true)

if [ -z "$staged_files" ]; then
  echo "OK: No text files staged for secret scanning."
  exit 0
fi

secret_patterns=(
  'sk-[a-zA-Z0-9]{20,}'
  'ghp_[a-zA-Z0-9]{36}'
  'github_pat_[a-zA-Z0-9_]{22,}'
  'AKIA[0-9A-Z]{16}'
  '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'
)

found=0
for file in $staged_files; do
  if [ ! -f "$file" ]; then
    continue
  fi
  for pattern in "${secret_patterns[@]}"; do
    if grep -qE "$pattern" "$file" 2>/dev/null; then
      echo "ERROR: Secret pattern found in $file (pattern: $pattern)"
      found=1
    fi
  done
done

if [ "$found" -eq 1 ]; then
  echo ""
  echo "Remove secrets before committing."
  exit 1
fi

echo "OK: No secret patterns found in staged files."
exit 0
