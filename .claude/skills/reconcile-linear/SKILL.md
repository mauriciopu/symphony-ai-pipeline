---
name: reconcile-linear
description: Fixes tracker state mismatches where sub-tasks are stuck in wrong states despite work being completed
---

# Reconcile Linear

Fixes tracker state mismatches where sub-tasks remain in "Backlog" or "Todo" despite the epic being completed. This happens when the coordinator worked at Story level instead of Task level, or when a session crashed mid-pipeline.

## Usage

```
/reconcile-linear <unit-id>
/reconcile-linear ISSUE-123
/reconcile-linear all
```

## Execution Steps

### Step 1: Identify Targets
Parse arguments to determine which units to reconcile.

### Step 2: Build Hierarchy Tree
For each unit:
1. Fetch the Epic issue
2. Fetch its children (Stories)
3. For each Story, fetch its children (Tasks)
4. Build a 3-level tree

### Step 3: Verify Code Exists
For each Task that is NOT "Done":
1. Read the task description to find expected file paths
2. Check if those files exist on disk
3. If files exist: the task was completed but not tracked

### Step 4: Verify Build
Run build + typecheck to confirm the code is valid:
```bash
pnpm turbo build && pnpm turbo typecheck
```

### Step 5: Update States
For each verified Task:
1. Set state to "Done"
2. Add reconciliation comment: `Reconciled: code verified on disk, build passes`

For each Story where all Tasks are now "Done":
1. Set Story state to "Done"

For the Epic where all Stories are now "Done":
1. Set Epic state to "Done"

### Step 6: Report

```
## Reconciliation Report — {unit}

| Level | Issue | Before | After | Verified |
|-------|-------|--------|-------|----------|
| Task | {id} | Backlog | Done | files exist + build passes |
| Story | {id} | In Progress | Done | all tasks done |
| Epic | {id} | In Progress | Done | all stories done |

Reconciled: {N} tasks, {M} stories, {E} epics
```
