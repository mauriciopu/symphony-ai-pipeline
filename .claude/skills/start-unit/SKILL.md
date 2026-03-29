---
name: start-unit
description: Starts the full pipeline for a unit as the main coordinator (level 0). Usage: /start-unit U06
---

Adopt the role of **Pipeline Coordinator**. You are the main session — level 0.

## Pre-Check: Autonomous Execution Mode

**BEFORE ANYTHING ELSE**, verify this session was launched with `--dangerously-skip-permissions`:

```bash
# This session MUST be running with skip-permissions for autonomous execution.
# If not, the pipeline will be interrupted by permission prompts on every tool call.
# Launch with: claude --dangerously-skip-permissions "/start-unit {args}"
```

If the session was NOT launched with skip-permissions, you will encounter permission prompts on git commits, build commands, and MCP calls. **WARN the user immediately** and suggest relaunching:
```
WARNING: This session may not have skip-permissions enabled.
The pipeline requires autonomous execution to function correctly.
Relaunch with: claude --dangerously-skip-permissions "/start-unit {args}"
```

Safety is enforced by Symphony's 6 PreToolUse hooks — they block dangerous operations regardless of permission mode.

## Phase 0: MCP Health Check (MANDATORY — BEFORE ANYTHING ELSE)

Verify that all required MCP servers are operational. If ANY fails, **STOP IMMEDIATELY** and report which MCP is down. Do NOT proceed to Phase 1 without all verified.

### Verifications (execute in parallel):

1. **Linear** — `mcp__linear__list_issues(team: "<YOUR_TEAM>", limit: 1)`
   - Expected: response with `issues` array
   - Failure: connection error, timeout, or tool unavailable

2. **GitHub** — `mcp__github__list_pull_requests(owner: "<OWNER>", repo: "<REPO>", state: "open")`
   - Expected: response with PR array
   - Failure: auth error, timeout, or tool unavailable

3. **Supabase** (optional) — `mcp__supabase__list_tables(project_id: "<PROJECT_ID>")`
   - Expected: response with table list
   - Failure: connection error, timeout, or tool unavailable

### If any MCP fails:
```
MCP Health Check FAILED
- Linear: PASS/FAIL {error detail}
- GitHub: PASS/FAIL {error detail}
- Supabase: PASS/FAIL {error detail}

Pipeline aborted. Fix the failed MCPs and re-run /start-unit {args}
```

---

Read the full pipeline instructions from:
`.claude/agents/coordinator.md`

Then execute the phases for the unit: **{args}**

Remember:
- Phase 0 (MCP check) is a PRE-REQUISITE — without all MCPs, nothing starts
- Phase 1.5 has 2 gates:
  - **Gate 1**: validates that Tasks (grandchildren) exist in the tracker
  - **Gate 2**: cross-references the code generation plan against Tasks for 100% coverage
  - If either gate fails: **ABORT** — run `/create-unit-tasks --force` or `/create-all-tasks`
- The pipeline operates at the **TASK** level (grandchildren of the epic), NOT at Story level
- Stories transition automatically
- Planning (creating tasks) and Execution (pipeline) are SEPARATE phases
- YOU make the tracker MCP calls directly (don't delegate to subagents)
- Spawn coder, tester, reviewer, auditor as sub-agents via Agent tool (they are level 1)
- Follow ALL phases: 0 → 1 → 1.5 → 2 → 3 → 4 → 5 → 6

After Phase 6, report:
```
Unit complete — PR #{N} merged
Tracker reconciled: {T} tasks Done, {S} stories Done, epic Done
Next: /start-unit {next-unit}
```
Then STOP. The user decides when to start the next unit.
