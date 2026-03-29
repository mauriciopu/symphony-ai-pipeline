#!/bin/bash
# Hook: TestID Contract Validator
# Validates that data-testid values in staged files match the contract registry.
# Runs on git commit to prevent testID mismatches between components and E2E specs.
#
# Trigger: PreToolUse on Bash when command is `git commit`

COMMAND="$1"

# Only run on git commit commands
if ! echo "$COMMAND" | grep -qiE 'git\s+commit'; then
  exit 0
fi

# Check if contract file exists
CONTRACT_FILE=".claude/hooks/testid-contract.json"
if [ ! -f "$CONTRACT_FILE" ]; then
  exit 0
fi

# Check if contract has any entries (beyond _schema)
ENTRY_COUNT=$(node -e "
  const c = JSON.parse(require('fs').readFileSync('$CONTRACT_FILE','utf8'));
  const modules = Object.keys(c).filter(k => k !== '_schema');
  let count = 0;
  for (const m of modules) count += Object.keys(c[m]).length;
  console.log(count);
" 2>/dev/null)

if [ "$ENTRY_COUNT" = "0" ] || [ -z "$ENTRY_COUNT" ]; then
  exit 0
fi

# Get staged files that are relevant (tsx components or spec files)
STAGED_TSX=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.tsx$' | head -20)
STAGED_SPECS=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(spec|test)\.(ts|tsx)$' | head -20)

# Only run if we have staged component or spec files
if [ -z "$STAGED_TSX" ] && [ -z "$STAGED_SPECS" ]; then
  exit 0
fi

# Run the validator on staged files only
RESULT=$(node .claude/hooks/validate-testid-contract.js --staged-only 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "BLOCKED: TestID Contract validation failed"
  echo ""
  echo "$RESULT"
  echo ""
  echo "HOW TO FIX:"
  echo "  1. Add missing data-testid attributes to your components"
  echo "  2. Register new testIDs in .claude/hooks/testid-contract.json"
  echo "  3. Use static testID prefixes in E2E specs (not dynamic template literals)"
  exit 1
fi

# Show warnings but don't block
if echo "$RESULT" | grep -q "WARNING"; then
  echo "$RESULT"
fi

exit 0
