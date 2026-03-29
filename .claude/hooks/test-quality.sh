#!/bin/bash
# Hook: Test Quality Linter
# Detects test.skip, it.skip, describe.skip without justification comment.
# Also detects fragile CSS selectors in e2e tests.
#
# Trigger: PreToolUse on Bash when command is `git commit`

COMMAND="$1"

# Only run on git commit commands
if ! echo "$COMMAND" | grep -qiE 'git\s+commit'; then
  exit 0
fi

# Get staged test files
TEST_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(test|spec)\.(ts|tsx|js|jsx)$')

if [ -z "$TEST_FILES" ]; then
  exit 0
fi

VIOLATIONS=""

while IFS= read -r file; do
  [ -z "$file" ] && continue

  # Find .skip, .todo, and xtest/xdescribe/xit usage
  SKIPS=$(grep -nE '\.(skip|todo)\s*\(|^[[:space:]]*(xtest|xdescribe|xit)\s*\(' "$file" 2>/dev/null)

  if [ -n "$SKIPS" ]; then
    while IFS= read -r skip_line; do
      LINE_NUM=$(echo "$skip_line" | cut -d: -f1)
      PREV_LINE=$((LINE_NUM - 1))

      HAS_JUSTIFICATION=$(sed -n "${PREV_LINE}p" "$file" 2>/dev/null | grep -cE '//\s*(SKIP|TODO|FIXME|REASON):')

      if [ "$HAS_JUSTIFICATION" -eq 0 ]; then
        VIOLATIONS="$VIOLATIONS\n  $file:$LINE_NUM: $(echo "$skip_line" | cut -d: -f2-)\n"
      fi
    done <<< "$SKIPS"
  fi
done <<< "$TEST_FILES"

# Check for fragile CSS selectors in e2e files
E2E_FILES=$(echo "$TEST_FILES" | grep -E 'e2e/.*\.(spec|test)\.(ts|tsx)$')
if [ -n "$E2E_FILES" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    FRAGILE=$(grep -nE "\.locator\(\s*['\"][^'\"]*[.#>~+\s:][^'\"]*['\"]" "$file" 2>/dev/null | grep -v 'data-testid' | grep -v 'role=' | head -5)
    if [ -n "$FRAGILE" ]; then
      VIOLATIONS="$VIOLATIONS\n  $file: Fragile CSS selector in e2e test (use getByTestId or data-testid):\n$FRAGILE\n"
    fi
  done <<< "$E2E_FILES"
fi

if [ -n "$VIOLATIONS" ]; then
  echo "BLOCKED: Test quality violation"
  echo ""
  echo "Issues found in test files:"
  echo -e "$VIOLATIONS"
  echo ""
  echo "HOW TO FIX:"
  echo "  - Skipped tests: add // SKIP: <reason> on the line above"
  echo "  - CSS selectors in e2e: use page.getByTestId('my-element') instead"
  exit 1
fi

exit 0
