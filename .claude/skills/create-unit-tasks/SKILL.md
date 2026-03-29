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

### Step 4.5: Mandatory Task Sections (NON-NEGOTIABLE)

Every task that touches UI components MUST include these three sections in its description. These sections prevent the #1 cause of E2E test failures: mismatches between what the spec expects and what the code implements.

#### A. TestID Contract

A binding contract between the coder and the E2E specs. Lists EVERY `data-testid` the task's components must render.

```markdown
## TestID Contract
| Component | data-testid | Type | Notes |
|-----------|------------|------|-------|
| BellboyDashboard | bellboy-dashboard | container | Main wrapper |
| PendingSection | pending-deliveries | section | List of unclaimed tasks |
| TaskCard | delivery-card-{id} | list-item (dynamic) | Prefix: delivery-card |
| ClaimButton | claim-task-btn | action | Inside each TaskCard |
| LoadingState | bellboy-loading | loading | Shown while fetching |
| EmptyState | no-pending-tasks | empty | When list is empty |
```

**Naming rules**:
- Containers: `{module}-{component}` (static)
- Sections: `{semantic-name}` (static)
- List items: `{entity}-card-{id}` or `{entity}-row-{id}` (dynamic suffix — spec uses static prefix)
- Actions: `{verb}-{entity}-btn` (static)
- Forms: `{entity}-form`, Inputs: `{field}-input`, Submit: `{entity}-submit-btn`
- Loading: `{module}-loading`, Empty: `no-{items}` or `{module}-empty`

**CRITICAL**: E2E specs use `getByTestId('claim-task-btn')` with the STATIC name, never `getByTestId(\`delivery-card-${id}\`)` with dynamic interpolation.

#### B. Test Data Assumptions

What seed data the coder must know exists when writing tests.

```markdown
## Test Data Assumptions
- **Auth role**: bellboy (use `.auth/bellboy.json` storage state)
- **Seed property**: SEED_IDS.PROPERTY_ID from `e2e/fixtures/data.fixture.ts`
- **Expected records**: EXPECTED_COUNTS.bellboyTasks (10 tasks in seed)
- **Room states needed**: AVAILABLE (30), OCCUPIED (10), PENDING_CLEANING (5)
- **Guest types**: VIP (SEED_IDS.GUESTS.VIP), Frequent, Blacklisted
- **Reference file**: `e2e/fixtures/data.fixture.ts` — import SEED_IDS and EXPECTED_COUNTS
```

**CRITICAL**: NEVER hardcode UUIDs in tests. Always import from `data.fixture.ts`.

#### C. BDD Scenario Mapping

Which Gherkin scenarios from USER-STORIES.md this task's E2E tests cover.

```markdown
## BDD Scenarios (E2E Coverage)
| Story ID | Scenario | Expected TestIDs | Spec File |
|----------|----------|-----------------|-----------|
| US-BELL-01 | Dashboard loads with pending tasks | bellboy-dashboard, pending-deliveries | bellboy.spec.ts |
| US-BELL-02 | Bellboy claims a delivery task | claim-task-btn → card moves | bellboy.spec.ts |
| US-BELL-03 | Bellboy completes delivery | complete-delivery-btn → success | bellboy.spec.ts |
```

This mapping ensures every user story is covered by at least one E2E test, and every test knows which testIDs to assert on.

### Step 5: Symphony Readiness Checklist
Before creating:
- [ ] Every plan file is owned by exactly one task
- [ ] No task creates files that another task also creates
- [ ] Dependencies form a DAG (no cycles)
- [ ] Each task passes the cold-start test
- [ ] Every UI task has a non-empty TestID Contract table
- [ ] Every UI task has Test Data Assumptions referencing data.fixture.ts
- [ ] Every UI task has BDD Scenario Mapping linking to user stories

### Step 5.5: Dependency Graph Export (for Parallel Execution)

After validating the DAG, export it for the coordinator's parallel scheduler:

1. Build the graph: `{ "TASK-001": [], "TASK-002": ["TASK-001"], "TASK-003": ["TASK-001"] }`
2. Compute parallel groups: tasks with no mutual dependencies
3. Add to the Epic description as a hidden comment:
   ```
   <!-- SYMPHONY_DAG: {"TASK-001":[],"TASK-002":["TASK-001"],"TASK-003":["TASK-001"]} -->
   ```
4. Also set blocking relations in the tracker for human visibility
5. Log: `Parallel analysis: {N} tasks, {G} groups, max {W} concurrent, critical path: {P} tasks`

### Step 6: Create in Tracker
Create Epic → Stories → Tasks with proper parent-child relationships.
Set blocking dependencies between tasks.
Include the SYMPHONY_DAG comment in the Epic description.

### Step 7: Summary
```
## Task Provisioning Complete

| Story | Tasks | Files | Dependencies |
|-------|-------|-------|--------------|
| {name} | {count} | {count} | {list} |

Total: {N} stories, {M} tasks, {F} files
Parallel groups: {G} (max {W} concurrent)
Critical path: {P} tasks
Ready for: /start-unit {unit-name}
```
