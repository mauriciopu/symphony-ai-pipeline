---
name: session-init
description: Session initialization — loads project context, checks health, shows pending work and next task
---

# Session Init

Initializes a working session by loading project context, checking health, and presenting what needs to be done.

> **Launch with**: `claude --dangerously-skip-permissions "/session-init"`
> Symphony requires autonomous execution. Safety is enforced by hooks, not permission prompts.

## Usage

```
/session-init
/session-init --quick    # skip full harness, just show context
```

## Execution Steps

### Step 1: Git Context
Run in parallel:
```bash
git status
git log --oneline -10
git branch --show-current
```

Report: current branch, uncommitted changes, last 10 commits.

### Step 2: Harness Quick Check
Run the fast gates from `/harness-check`:
- Architecture boundaries
- Auth coverage
- Test quality
- No any types
- MCP health

If `--quick` flag NOT set, also run full build/typecheck/lint/test.

### Step 3: Tracker Context
Fetch current work state from your project tracker (Linear):
1. List "In Progress" issues
2. List next "Todo" items (limit 5)
3. For each "In Progress" issue, check if it has a workpad comment

### Step 4: Pipeline State
```bash
node .claude/hooks/pipeline-advance.js status
```
If pipeline is active, show recovery information.

### Step 5: Session Summary

```
## Session Init — {date}

### Git
- Branch: `{branch}`
- Status: {clean / N uncommitted changes}
- Last commit: `{hash}` {message}

### Health
| Gate | Status |
|------|--------|
| Architecture | PASS/FAIL |
| Auth Coverage | PASS/FAIL |
| Test Quality | PASS/FAIL |
| Any Types | PASS/FAIL |
| MCP Health | PASS/WARN |

### Active Work
- {issue-id}: {title} — {state}

### Next Up
- {issue-id}: {title}

### Suggested Action
{Based on context: continue active work, pick next issue, or fix health issues}
```
