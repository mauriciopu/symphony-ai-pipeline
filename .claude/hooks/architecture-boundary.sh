#!/bin/bash
# Hook: Architecture Boundary Linter (DDD enforcement)
# Ensures domain layer does NOT import from infrastructure, repositories, or data access.
# Dependency inversion: domain defines interfaces, infrastructure implements.
#
# Customize DOMAIN_PATH below to match your project structure.
#
# Trigger: PreToolUse on Bash when command is `git commit`

COMMAND="$1"

# Only run on git commit commands
if ! echo "$COMMAND" | grep -qiE 'git\s+commit'; then
  exit 0
fi

# ===== CUSTOMIZE THIS =====
# Path to your domain layer (relative to project root)
DOMAIN_PATH="apps/api/src/domain/"
# Patterns that domain should NOT import from
FORBIDDEN_IMPORTS="(infrastructure|repositories|prisma|database)"
# ===========================

# Get staged .ts files in domain/
DOMAIN_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E "^${DOMAIN_PATH}.*\.ts$" | grep -v '\.test\.ts$')

if [ -z "$DOMAIN_FILES" ]; then
  exit 0
fi

VIOLATIONS=""

while IFS= read -r file; do
  [ -z "$file" ] && continue
  BAD_IMPORTS=$(grep -nE "from\s+['\"].*/${FORBIDDEN_IMPORTS}" "$file" 2>/dev/null)
  if [ -n "$BAD_IMPORTS" ]; then
    VIOLATIONS="$VIOLATIONS\n  $file:\n$BAD_IMPORTS\n"
  fi
done <<< "$DOMAIN_FILES"

if [ -n "$VIOLATIONS" ]; then
  echo "BLOCKED: Architecture boundary violation (DDD)"
  echo ""
  echo "Domain layer must NOT import from infrastructure, repositories, or data access."
  echo ""
  echo "Violations found:"
  echo -e "$VIOLATIONS"
  echo ""
  echo "HOW TO FIX: Use dependency inversion — define interfaces in domain,"
  echo "implement them in infrastructure/repositories."
  exit 1
fi

exit 0
