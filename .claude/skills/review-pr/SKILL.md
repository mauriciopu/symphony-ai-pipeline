---
name: review-pr
description: Pre-PR review checklist — analyzes diff, verifies scope, tests, testids, secrets, and conventional commits before creating a PR
---

# Review PR

Runs a comprehensive checklist before creating a PR. Catches issues that CI won't.

## Usage

```
/review-pr
/review-pr --base main
/review-pr --issue ISSUE-123
```

## Execution Steps

### Step 1: Gather Context
```bash
git log --oneline $(git merge-base HEAD master)..HEAD
git diff master...HEAD --stat
git diff master...HEAD --name-only
```

### Step 2: Scope Check
If `--issue` provided, fetch the issue and compare expected vs actual files changed.
Otherwise, analyze diff for coherence — flag changes spanning unrelated modules.

### Step 3: Test Coverage Check
For each new/modified source file, check if a corresponding test file was also changed.

### Step 4: data-testid Check
For new/modified UI files, check that interactive elements have `data-testid`.

### Step 5: Secrets Check
Scan diff for potential secrets (passwords, API keys, tokens, credentials).

### Step 6: Conventional Commits Check
Verify all commits match `type(scope): description` pattern.

### Step 7: Console.log Check
Flag debug logging in non-test code.

### Step 8: Any Type Check
Flag `any` types in non-test code.

## Summary Report

```
## Pre-PR Review — {branch} → {base}

| # | Check | Status | Details |
|---|-------|--------|---------|
| 1 | Scope | PASS/WARN | {details} |
| 2 | Tests | PASS/WARN/FAIL | {details} |
| 3 | data-testid | PASS/WARN | {details} |
| 4 | Secrets | PASS/FAIL | {details} |
| 5 | Commits | PASS/WARN | {details} |
| 6 | Console.log | PASS/WARN | {details} |
| 7 | Any types | PASS/WARN | {details} |

### Verdict
**{READY FOR PR / NEEDS FIXES}**
```
