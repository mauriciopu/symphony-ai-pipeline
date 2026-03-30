# AIDLC Linear Gate (NON-NEGOTIABLE)

## All Linear issue creation MUST go through AIDLC methodology
Direct calls to `mcp__linear__save_issue` without an `id` (i.e., creating new issues) are blocked by the `aidlc-linear-gate.js` PreToolUse hook unless an approved skill session is active.

## How it works
1. A PreToolUse hook on `mcp__linear__save_issue` parses the tool input
2. If `id` is present → **ALLOW** (this is an update/state transition, not a create)
3. If `id` is absent (create) → check for a valid AIDLC gate token
4. Token exists and not expired → **ALLOW** (approved skill session)
5. No valid token → **BLOCK** with instructions

## Approved creation paths
- `/create-unit-tasks {unit-name}` — provisions one unit's Epic → Stories → Tasks
- `/create-all-tasks` — batch-provisions all pending units
- Both skills activate a gate token before Linear writes and revoke it after completion

## Token lifecycle
```bash
# Skills call these automatically:
node .claude/hooks/aidlc-gate-token-manager.js create {unit-name} {skill-name}  # before Linear writes
node .claude/hooks/aidlc-gate-token-manager.js revoke                           # after completion

# Manual override (temporary, 30-min TTL):
node .claude/hooks/aidlc-gate-token-manager.js create manual manual-override

# Inspect current token:
node .claude/hooks/aidlc-gate-token-manager.js status
```

## What is NOT blocked
- State transitions: `mcp__linear__save_issue(id: "ISSUE-XXX", state: "In Progress")` — has `id`
- Comments: `mcp__linear__save_comment(...)` — different tool, not intercepted
- Labels: `mcp__linear__create_issue_label(...)` — metadata, not gated
- All read operations: `list_issues`, `get_issue`, etc.

## Audit trail
Every gate decision (allow/block) is logged to `.claude/pipeline-audit.jsonl` with:
- Timestamp, decision, reason, attempted title, token status

## Why
AIDLC requires every Linear task to be backed by a code generation plan with full context: unit description, design references, TDD/BDD strategy, DDD model, generation steps with file paths, and machine-verifiable acceptance criteria. Direct issue creation bypasses all of these validations, producing tasks that lack the "cold start" context needed for agent execution.
