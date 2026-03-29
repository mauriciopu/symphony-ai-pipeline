#!/bin/bash
# Hook: Feedback Enforcer
# Converts human feedback into automated checks.
# Enforces learned rules at commit time.
#
# Currently enforced rules:
#   1. Code changes must include corresponding test changes (TDD enforcement)
#   2. ESLint incremental check on staged files (catches: any, console.log, unused vars)
#
# To add a new rule: add a check_* function below and call it in main.
#
# Trigger: PreToolUse on Bash when command is `git commit`

COMMAND="$1"

# Only run on git commit commands
if ! echo "$COMMAND" | grep -qiE 'git\s+commit'; then
  exit 0
fi

VIOLATIONS=""

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# --- Rule 1: Code changes should have corresponding tests ---
check_code_without_tests() {
  local app_code_changed=false
  local test_code_changed=false

  # ===== CUSTOMIZE THESE PATTERNS =====
  local SOURCE_PATTERN='^(apps|src|lib)/.*\.(ts|tsx|js|jsx)$'
  local EXCLUDE_PATTERN='(types|index|constants|\.d\.)\.(ts|tsx)$'
  # =====================================

  while IFS= read -r file; do
    if echo "$file" | grep -qE "$SOURCE_PATTERN" && \
       ! echo "$file" | grep -qE '\.(test|spec)\.' && \
       ! echo "$file" | grep -qE "$EXCLUDE_PATTERN"; then
      app_code_changed=true
    fi
    if echo "$file" | grep -qE '\.(test|spec)\.(ts|tsx|js|jsx)$'; then
      test_code_changed=true
    fi
  done <<< "$STAGED_FILES"

  if [ "$app_code_changed" = true ] && [ "$test_code_changed" = false ]; then
    VIOLATIONS="$VIOLATIONS\n  [FEEDBACK] App code changed but no test files included in commit."
    VIOLATIONS="$VIOLATIONS\n  TDD requires: write test FIRST, then implement."
    VIOLATIONS="$VIOLATIONS\n  If this is a pure refactor with existing coverage, add --allow-no-tests to commit message.\n"
  fi
}

# --- Rule 2: ESLint incremental (if available) ---
check_eslint_staged() {
  # Only run if eslint is available
  if ! command -v npx &> /dev/null; then
    return
  fi

  local ts_files
  ts_files=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx)$' | grep -v '\.(test|spec)\.' | grep -v 'e2e/' | grep -v '\.d\.ts$')

  if [ -z "$ts_files" ]; then
    return
  fi

  local result
  result=$(echo "$ts_files" | tr '\n' ' ' | xargs npx eslint --no-warn-ignored --format compact 2>/dev/null | head -30)

  if [ -n "$result" ] && echo "$result" | grep -qE 'Error|Warning'; then
    VIOLATIONS="$VIOLATIONS\n  [ESLINT] AST-based violations in staged files:"
    VIOLATIONS="$VIOLATIONS\n$result\n"
  fi
}

# --- Run all checks ---
check_code_without_tests
check_eslint_staged

if [ -n "$VIOLATIONS" ]; then
  echo "BLOCKED: Feedback enforcer — learned rules violated"
  echo ""
  echo "These rules come from past corrections and project conventions."
  echo ""
  echo -e "$VIOLATIONS"
  exit 1
fi

exit 0
