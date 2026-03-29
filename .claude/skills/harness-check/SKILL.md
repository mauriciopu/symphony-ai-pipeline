---
name: harness-check
description: Master harness check — runs all project health verifications in one command and reports a summary table
---

# Harness Check

Runs ALL project health verifications in one command. A complete snapshot of project health.

## Usage

```
/harness-check
/harness-check --quick     # skip slow checks (build, test)
/harness-check --fix       # auto-fix what can be fixed (lint, format)
```

## Execution Steps

> Customize the commands below for your project's build system.

### Gate 1: Build (BLOCKING)
```bash
pnpm turbo build
```
Expected: 0 errors

### Gate 2: TypeScript (BLOCKING)
```bash
pnpm turbo typecheck
```
Expected: 0 TS errors

### Gate 3: Lint (BLOCKING)
```bash
pnpm turbo lint
```
Expected: 0 violations. If `--fix`: run with `--fix` first.

### Gate 4: Tests (BLOCKING)
```bash
pnpm turbo test
```
Expected: all passing, capture count and coverage %.

### Gate 5: Architecture Boundaries (BLOCKING)
Check that domain layer has NO imports from infrastructure/repositories/data access.

### Gate 6: Auth Coverage (BLOCKING)
Check that non-whitelisted routes don't use public/unauthenticated procedures.

### Gate 7: Test Quality (BLOCKING)
Check for unjustified test skips (.skip, .todo, xtest).

### Gate 8: No Any Types (BLOCKING)
Check for `any` types in non-test code.

### Gate 9: MCP Health (INFORMATIVE)
Verify all required MCP servers are reachable.

### Gate 10: Pipeline State (INFORMATIVE)
```bash
node .claude/hooks/pipeline-advance.js status
```

### Gate 11: Tracker Hygiene (INFORMATIVE)
Check for stale "In Progress" issues, count backlog size.

## Summary Report

```
## Harness Check Report — {date}

| # | Gate | Status | Details |
|---|------|--------|---------|
| 1 | Build | PASS/FAIL | 0 errors / {count} |
| 2 | TypeScript | PASS/FAIL | 0 errors / {count} |
| 3 | Lint | PASS/FAIL | 0 violations / {count} |
| 4 | Tests | PASS/FAIL | {count} passing, {coverage}% |
| 5 | Architecture | PASS/FAIL | Clean / {count} violations |
| 6 | Auth Coverage | PASS/FAIL | All protected / {count} unprotected |
| 7 | Test Quality | PASS/FAIL | No skips / {count} unjustified |
| 8 | No Any Types | PASS/FAIL | Clean / {count} found |
| 9 | MCP Health | PASS/WARN | All up / {which} down |
| 10 | Pipeline State | PASS/WARN | Idle / Active ({phase}) |
| 11 | Tracker Hygiene | PASS/WARN | Clean / {count} issues |

**Result: {PASS_COUNT}/11 — {HEALTHY / NEEDS ATTENTION / BLOCKED}**
```

Thresholds:
- **HEALTHY**: All blocking gates pass
- **NEEDS ATTENTION**: Blocking pass but informative gates have warnings
- **BLOCKED**: Any blocking gate fails
