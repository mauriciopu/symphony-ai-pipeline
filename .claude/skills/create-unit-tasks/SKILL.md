---
name: create-unit-tasks
description: Converts code generation plans into a structured task hierarchy (Epic -> Stories -> Tasks) optimized for the coordinator pipeline
---

# Create Unit Tasks

Converts a code generation plan into a structured hierarchy of tracker issues — **Epic → Stories → Tasks** — optimized for execution by the coordinator pipeline (`/start-unit`).

Each task is self-contained with full context, explicit scope boundaries, and validation criteria. Every task passes the **"cold start" test**: an agent with zero prior context can read only the task description and produce the correct output.

## Usage

```
/create-unit-tasks <unit-name> [--dry-run] [--force]
```

## Arguments
- **unit-name** (required): matches the plan filename
- **--dry-run**: preview without creating issues
- **--force**: re-provision tasks (moves existing to "Canceled" and creates fresh)

## Execution Steps

### Step 1: Load Context
1. Locate and read the code generation plan
2. Read design documents if they exist
3. Resolve the tracker team

### Step 2: Parse the Plan
1. Extract all steps with file paths
2. Count total steps and files

### Step 3: Group Steps into Stories
Group by **functional cohesion** — files that must exist together to be testable.

**Granularity Decision Matrix**:
| Signal | Split | Merge |
|--------|-------|-------|
| File count per step | >10 files | <=5 files |
| Module coupling | Low coupling | High coupling |
| Test isolation | Independently testable | Only testable together |
| Review complexity | Mixed concerns | Single concern |
| Agent collision risk | Same file touched | Single-agent ownership |

### Step 4: Decompose Stories into Tasks
Each task gets:
- 2-letter prefix derived from unit name
- Self-contained description with full context
- File list with exact paths
- Validation criteria
- Dependencies on other tasks

### Step 5: Symphony Readiness Checklist
Before creating:
- [ ] Every plan file is owned by exactly one task
- [ ] No task creates files that another task also creates
- [ ] Dependencies form a DAG (no cycles)
- [ ] Each task passes the cold-start test

### Step 6: Create in Tracker
Create Epic → Stories → Tasks with proper parent-child relationships.
Set blocking dependencies between tasks.

### Step 7: Summary
```
## Task Provisioning Complete

| Story | Tasks | Files | Dependencies |
|-------|-------|-------|--------------|
| {name} | {count} | {count} | {list} |

Total: {N} stories, {M} tasks, {F} files
Ready for: /start-unit {unit-name}
```
