#!/bin/bash
# Hook: Auth Coverage Linter
# Ensures API endpoints use authenticated procedures by default.
# Detects unauthenticated/public procedure usage (except in whitelisted files).
#
# Customize ROUTER_PATH and WHITELIST below for your project.
#
# Trigger: PreToolUse on Bash when command is `git commit`

COMMAND="$1"

# Only run on git commit commands
if ! echo "$COMMAND" | grep -qiE 'git\s+commit'; then
  exit 0
fi

# ===== CUSTOMIZE THIS =====
# Path pattern to match your router/controller files
ROUTER_PATTERN='^apps/api/src/routers/.*\.router\.ts$'
# Pattern that indicates an unauthenticated/public endpoint
PUBLIC_PATTERN="publicProcedure"
# Pattern that indicates an authenticated endpoint
PROTECTED_PATTERN="(protectedProcedure|adminProcedure)"
# Files that are allowed to have public endpoints (auth endpoints, health checks, etc.)
WHITELIST="auth.router.ts|health.router.ts|apiKey.router.ts"
# ===========================

ROUTER_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E "$ROUTER_PATTERN" | grep -v '__tests__')

if [ -z "$ROUTER_FILES" ]; then
  exit 0
fi

VIOLATIONS=""

while IFS= read -r file; do
  [ -z "$file" ] && continue
  BASENAME=$(basename "$file")

  # Skip whitelisted files
  if echo "$BASENAME" | grep -qE "^($WHITELIST)$"; then
    continue
  fi

  PUBLIC_USAGE=$(grep -nE "$PUBLIC_PATTERN" "$file" 2>/dev/null)
  if [ -n "$PUBLIC_USAGE" ]; then
    VIOLATIONS="$VIOLATIONS\n  $file:\n$PUBLIC_USAGE\n"
  fi

  HAS_PROTECTED=$(grep -cE "$PROTECTED_PATTERN" "$file" 2>/dev/null)
  HAS_ANY_PROCEDURE=$(grep -cE "($PUBLIC_PATTERN|$PROTECTED_PATTERN)" "$file" 2>/dev/null)

  if [ "$HAS_ANY_PROCEDURE" -gt 0 ] && [ "$HAS_PROTECTED" -eq 0 ]; then
    VIOLATIONS="$VIOLATIONS\n  $file: has procedures but NONE are protected/admin\n"
  fi
done <<< "$ROUTER_FILES"

if [ -n "$VIOLATIONS" ]; then
  echo "BLOCKED: Auth coverage violation (OWASP)"
  echo ""
  echo "Non-whitelisted routes must use authenticated procedures."
  echo ""
  echo "Violations found:"
  echo -e "$VIOLATIONS"
  echo ""
  echo "HOW TO FIX: Use authenticated procedures. If public access is intentional,"
  echo "add the file to the whitelist in this hook."
  exit 1
fi

exit 0
