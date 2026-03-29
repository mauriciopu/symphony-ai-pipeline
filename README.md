# Symphony AI Pipeline

A production-grade, multi-agent orchestration framework for [Claude Code](https://claude.ai/claude-code). Symphony coordinates specialized AI agents through a code-enforced state machine, ensuring every task passes through mandatory quality gates before reaching production.

Born from real-world incidents where agents skipped steps, lost PRs, and claimed work was done without evidence. Every rule in this framework exists because something went wrong without it.

## What is Symphony?

Symphony is a **methodology + harness** for AI-driven software development. It provides:

- **7 specialized agents** — coordinator, coder, tester, reviewer, auditor, devops, pr-validator
- **10 hooks** — PreToolUse/PostToolUse guards that enforce rules at the tool level
- **7 rules** — hard-learned principles that prevent common agentic failure modes
- **7 skills** — reusable slash commands for pipeline operations
- **State machine** — code-enforced phase ordering (agents cannot skip steps)
- **Live dashboard** — real-time HTML monitor with auto-refresh

## Architecture

```
/start-unit U{XX}
    |
    v
Phase 0: MCP Health Check -----> ABORT if any MCP down
    |
Phase 1: Load Context ----------> Read plan, fetch Linear hierarchy
    |
Phase 1.5: Coverage Gate -------> Verify tasks exist + plan coverage
    |
Phase 2: Task Execution --------> For each Story -> Task:
    |   |                            coder -> tester -> reviewer -> commit
    |   |                            (retry on failure, rework after 3x)
    |   v
Phase 3: Integration Test ------> Full build + test suite
    |
Phase 4: Auditor ----------------> 38-point compliance checklist
    |
Phase 5: PR + CI ----------------> Push, create PR, verify CI gates
    |
Phase 6: Reconcile --------------> Verify all Linear issues are "Done"
    |
    v
  IDLE (ready for next unit)
```

### Agent Hierarchy

```
Coordinator (level 0) — orchestrates everything
    |
    |-- Coder (level 1) -------- writes tests first, then implementation
    |-- Tester (level 1) ------- validates 5 quality gates (build/lint/test/typecheck/smoke)
    |-- Reviewer (level 1) ----- quality + security gate (read-only)
    |-- Auditor (level 1) ------ 38-point compliance audit
    |-- DevOps (level 1) ------- PR creation + branch management
    |-- PR Validator (level 1) -- auto-repair loop (max 5 iterations)
```

### Hook Composition

```
PreToolUse (on Bash):
  1. prevent-dangerous-ops.sh  -- blocks destructive commands
  2. architecture-boundary.sh  -- DDD enforcement
  3. auth-coverage.sh          -- OWASP auth enforcement
  4. test-quality.sh           -- no unjustified test skips
  5. feedback-enforcer.sh      -- learned rules from past mistakes
  6. pipeline-gate.sh          -- state machine phase enforcement

PostToolUse (on all tools):
  1. post-tool-telemetry.sh    -- dashboard heartbeat + tool log
  2. deferred-work-check.sh    -- dependency unblocking tracker
```

## Quick Start

### 1. Install into your project

```bash
# Clone the framework
git clone https://github.com/YOUR_ORG/symphony-ai-pipeline.git

# Copy into your project's .claude directory
cd your-project
cp -r symphony-ai-pipeline/.claude .claude/

# Edit configuration
cp .claude/symphony.config.example.json .claude/symphony.config.json
# Edit symphony.config.json with your project details
```

Or use the install script:

```bash
bash symphony-ai-pipeline/install.sh /path/to/your-project
```

### 2. Configure for your project

Edit `.claude/symphony.config.json`:

```json
{
  "project": {
    "name": "Your Project",
    "repo_owner": "your-github-org",
    "repo_name": "your-repo",
    "base_branch": "main"
  },
  "linear": {
    "team": "Your Team Name",
    "project": "Your Project Name"
  },
  "supabase": {
    "project_id": "your-supabase-project-id"
  },
  "stack": {
    "build_cmd": "pnpm turbo build",
    "test_cmd": "pnpm turbo test",
    "lint_cmd": "pnpm turbo lint",
    "typecheck_cmd": "pnpm turbo typecheck",
    "dev_cmd": "pnpm turbo dev"
  },
  "conventions": {
    "coverage_threshold": 80,
    "max_function_lines": 30,
    "commit_format": "conventional",
    "branch_prefix": "feat/"
  },
  "domain": {
    "domain_path": "apps/api/src/domain/",
    "router_path": "apps/api/src/routers/",
    "public_router_whitelist": ["auth.router.ts"]
  }
}
```

### 3. Add CLAUDE.md to your project

Use `docs/CLAUDE.md.template` as a starting point. This file teaches the AI about your project's stack, conventions, and structure.

### 4. Set up MCP servers

Symphony requires these MCP servers:
- **Linear** — task management (issues, comments, state transitions)
- **GitHub** — PR creation, merging, CI checks
- **Supabase** — database health, type generation (optional)

Configure them in your Claude Code MCP settings.

### 5. Run

Symphony requires **autonomous execution** — agents must run without permission prompts for every tool call. Always launch Claude Code with `--dangerously-skip-permissions`:

```bash
# REQUIRED: All Symphony sessions must run with skip-permissions
# This allows agents to execute build/test/commit/MCP calls autonomously

# Initialize a session
claude --dangerously-skip-permissions "/session-init"

# Check project health
claude --dangerously-skip-permissions "/harness-check"

# Provision tasks from a plan
claude --dangerously-skip-permissions "/create-unit-tasks u09-inventory"

# Execute a unit pipeline (this is the main autonomous run)
claude --dangerously-skip-permissions "/start-unit U09"
```

> **Why `--dangerously-skip-permissions`?** The pipeline executes hundreds of tool calls per unit (git commits, build commands, MCP API calls, file writes). Without this flag, each call would require manual approval, making autonomous execution impossible. Safety is enforced by Symphony's own hooks (pipeline-gate.sh, prevent-dangerous-ops.sh, architecture-boundary.sh, etc.) — not by permission prompts.

> **Safety net**: Even with skip-permissions, Symphony's 6 PreToolUse hooks still block dangerous operations (force push, rm -rf, dropping tables, committing secrets, skipping phases). The hooks ARE the permission system.

## Core Principles

### 1. Evidence Before Claims
No agent can claim a task is "Done" without:
- Actual CI output (build, lint, test, typecheck)
- Exact test count (new + total passing)
- Explicit reviewer approval
- Commit hash

### 2. State Machine is Law
Phase ordering is enforced by code (`pipeline-gate.sh`), not by LLM discipline. Invalid transitions are rejected before execution. The LLM cannot skip phases.

### 3. No Hidden State
Everything persists: pipeline state in JSON, audit log in JSONL, task progress in Linear. Sessions survive crashes. Recovery is deterministic.

### 4. Hierarchy Discipline
Epic -> Story -> Task (3 levels). The coordinator always operates at the Task level. Parent states cascade automatically.

### 5. Rework = Fresh Start
After 3 tester failures or 2 reviewer rejections, the task gets a complete reset — revert commits, reset DB if needed, start from scratch with failure context. No incremental patching on broken code.

### 6. Scope Discipline
Agents only implement what the issue describes. Out-of-scope discoveries get logged, not fixed inline. This keeps PRs reviewable and prevents compounding errors.

## File Structure

```
.claude/
  agents/
    coordinator.md     -- pipeline orchestrator (level 0)
    coder.md           -- TDD-first implementation
    tester.md          -- 5-gate validation
    reviewer.md        -- quality + security gate
    auditor.md         -- 38-point compliance
    devops.md          -- PR creation
    pr-validator.md    -- auto-repair loop
  hooks/
    pipeline-advance.js    -- state machine transitions
    pipeline-gate.sh       -- phase enforcement guard
    pipeline-recover.sh    -- crash recovery diagnostic
    prevent-dangerous-ops.sh -- destructive command blocker
    architecture-boundary.sh -- DDD enforcement
    auth-coverage.sh       -- auth coverage linter
    test-quality.sh        -- test skip detector
    feedback-enforcer.sh   -- learned rules enforcement
    post-tool-telemetry.sh -- dashboard telemetry
    deferred-work-check.sh -- dependency tracker
    safe-db-reset.sh       -- rework-safe DB reset
  rules/
    linear-state-sync.md   -- 3-level hierarchy management
    mcp-health-gate.md     -- verify MCPs before pipeline
    pr-merge-workflow.md   -- merge only via MCP
    proof-of-work.md       -- evidence before claims
    rework-protocol.md     -- fresh start on repeated failure
    scope-discipline.md    -- stay within issue scope
    workpad-tracking.md    -- one comment per issue
  skills/
    start-unit/            -- main pipeline entry point
    session-init/          -- session initialization
    harness-check/         -- master health check
    review-pr/             -- pre-PR checklist
    create-unit-tasks/     -- task provisioning from plans
    create-all-tasks/      -- batch task provisioning
    reconcile-linear/      -- fix state mismatches
  dashboard/
    generate-dashboard.js  -- HTML generator from state
    sync-e2e-results.js    -- Playwright results sync
    pipeline-status.json   -- telemetry state file
  settings.local.json      -- hook + permission config
  pipeline-state.json      -- state machine persistence
  symphony.config.example.json -- project configuration
docs/
  ARCHITECTURE.md          -- deep dive into how it works
  CUSTOMIZATION.md         -- how to adapt to your project
  CLAUDE.md.template       -- template for project CLAUDE.md
```

## Adapting to Your Project

See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for detailed instructions on:

- Changing the tech stack (Django, Rails, Go, etc.)
- Adding/removing quality gates
- Customizing agent roles and expertise profiles
- Configuring hook behavior
- Adapting the state machine phases
- Using without Linear or Supabase

## Requirements

- [Claude Code](https://claude.ai/claude-code) CLI or IDE extension
- Node.js >= 18 (for hooks and dashboard)
- Git
- MCP servers: Linear + GitHub (Supabase optional)

## License

MIT

## Credits

Developed as part of the Montpark PMS v2.0 project. Extracted as a standalone framework for reuse across AI-driven development projects.

Built with [Claude Code](https://claude.ai/claude-code) by Anthropic.
