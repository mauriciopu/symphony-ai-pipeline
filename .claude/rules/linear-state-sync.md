# Linear State Sync (NON-NEGOTIABLE)

## 3-Level Hierarchy State Management
The coordinator manages THREE levels of issues in your project tracker:

- **Epic (Unit)**: "In Progress" when first Story starts, "Done" when all Stories done (Phase 6)
- **Story (Parent)**: "In Progress" at Step 0 (before first Task), "Done" at Step G (after all Tasks done)
- **Task (Sub-Issue)**: "In Progress" at Step A, "Done" at Step F

## Hierarchy Discovery + Plan Coverage (Phase 1 + 1.5)
Before executing, the coordinator MUST:
1. Fetch unit epic's children (Stories)
2. For each Story, fetch its children (Tasks)
3. If Tasks don't exist under Stories: **ABORT** — run `/create-all-tasks` first
4. Cross-reference plan files against task files (Plan Coverage Validation)
5. If uncovered files exist (plan files with no owning task): **ABORT** — run `/create-unit-tasks --force`
6. **NEVER treat a Story as an atomic work item** — always descend to its child Tasks

## Every transition requires a tracker update
- BEFORE starting a Task: set state to "In Progress"
- AFTER completing a Task: set state to "Done" + add completion comment
- BEFORE starting a Story's first Task: set Story to "In Progress"
- AFTER all Tasks in a Story are Done: set Story to "Done"
- Phase 6 reconciles all 3 levels and marks Epic as Done

## Only the coordinator updates the tracker
- Subagents (coder, tester, reviewer, auditor) do NOT have tracker MCP access
- The coordinator MUST make all state update calls directly — never delegate

## Comments must include evidence
Every Task completion comment must include:
- Pipeline steps that ran: `coder -> tester (X/5) -> reviewer (APPROVED)`
- Commit hash
- File list

## Why
Without this rule, tasks were never moved to "In Progress" because the coordinator skipped tracker updates. Additionally, sub-tasks from completed epics remained stuck in Backlog because the coordinator worked at Story level instead of descending to the Task level.
