---
name: create-all-tasks
description: Batch-creates task hierarchies for all pending units. Planning phase — run BEFORE /start-unit.
---

# Create All Tasks

Batch-provisions tracker task hierarchy (Epic → Stories → Tasks) for ALL pending units in one session.

This is a **planning phase** skill — run BEFORE `/start-unit`.

## Usage

```
/create-all-tasks
/create-all-tasks U09,U13,U15
/create-all-tasks --dry-run
```

## Arguments
- Unit list (optional): comma-separated unit names to provision
- `--dry-run`: preview without creating issues

## Execution Steps

### Step 1: MCP Health Check
Verify tracker MCP is available.

### Step 2: Identify Pending Units
Read your project state file to find units that need task provisioning.

### Step 3: Check Existing State
For each unit, check if tasks already exist in the tracker.
Skip units that are already provisioned (unless `--force`).

### Step 4: Sequential Provisioning
For each pending unit, invoke `/create-unit-tasks` sequentially.
Wait for each to complete before starting the next (to avoid collision).

### Step 5: Summary

```
## Batch Task Provisioning Complete

| Unit | Stories | Tasks | Status |
|------|---------|-------|--------|
| {name} | {N} | {M} | Created / Skipped / Error |

Total: {units} units, {stories} stories, {tasks} tasks
Next: /start-unit {first-unit}
```
