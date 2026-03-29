# Customization Guide

## Adapting Symphony to Your Project

Symphony was designed to be framework and language agnostic. This guide covers how to adapt each component.

## 1. Build System

### Hooks and Skills
All build/test commands are in:
- `.claude/agents/tester.md` — Gate definitions
- `.claude/skills/harness-check/SKILL.md` — Health check commands

Replace `pnpm turbo build/test/lint/typecheck` with your commands:

| Project Type | Build | Test | Lint | Typecheck |
|-------------|-------|------|------|-----------|
| Node.js/pnpm | `pnpm turbo build` | `pnpm turbo test` | `pnpm turbo lint` | `pnpm turbo typecheck` |
| npm | `npm run build` | `npm test` | `npm run lint` | `npm run typecheck` |
| Python | `python -m build` | `pytest` | `ruff check .` | `mypy .` |
| Go | `go build ./...` | `go test ./...` | `golangci-lint run` | (built into compiler) |
| Rust | `cargo build` | `cargo test` | `cargo clippy` | (built into compiler) |
| Java/Maven | `mvn compile` | `mvn test` | `mvn checkstyle:check` | (built into compiler) |

### DB Reset (`safe-db-reset.sh`)
Replace the Prisma commands with your ORM:
- Django: `python manage.py migrate --run-syncdb`
- Rails: `rails db:reset`
- Go (migrate): `migrate -database "$DB_URL" down && migrate up`

## 2. Architecture Boundaries

### `architecture-boundary.sh`
Edit the `DOMAIN_PATH` and `FORBIDDEN_IMPORTS` variables:

```bash
# Django
DOMAIN_PATH="apps/core/domain/"
FORBIDDEN_IMPORTS="(models|views|serializers)"

# Go Clean Architecture
DOMAIN_PATH="internal/domain/"
FORBIDDEN_IMPORTS="(infrastructure|repository|handler)"

# Java/Spring
DOMAIN_PATH="src/main/java/com/example/domain/"
FORBIDDEN_IMPORTS="(infrastructure|persistence|controller)"
```

### `auth-coverage.sh`
Edit the `ROUTER_PATTERN`, `PUBLIC_PATTERN`, and `WHITELIST`:

```bash
# Django REST
ROUTER_PATTERN='views\.py$'
PUBLIC_PATTERN="permission_classes.*AllowAny"
WHITELIST="auth_views.py|health_views.py"

# Express.js
ROUTER_PATTERN='\.router\.(ts|js)$'
PUBLIC_PATTERN="router\.(get|post|put|delete)\("
# (check for missing auth middleware)
```

## 3. Agent Roles

### Coder Expertise Profiles
In `.claude/agents/coder.md`, customize the expertise profiles:

```markdown
### Backend Domain Engineer
- Think as: {your domain's expert}
- Focus: {your patterns}

### Frontend Engineer
- Think as: {your frontend framework expert}
- Focus: {your UI patterns}
```

### Reviewer Checklist
In `.claude/agents/reviewer.md`, adapt the checklist:
- Replace "Zod" with your validation library
- Replace "tRPC" with your API framework
- Add framework-specific checks

### Auditor Checklist
In `.claude/agents/auditor.md`, update the 38-point checklist for your project's quality standards.

## 4. Project Tracker

### Using without Linear
Symphony uses Linear MCP for task management. To use a different tracker:

1. Replace `mcp__linear__*` calls in `coordinator.md` with your tracker's MCP tools
2. Update `settings.local.json` to allow your tracker's MCP tools
3. Update rules that reference Linear-specific concepts

### Using without a tracker
Remove tracker-related components:
- Remove `linear-state-sync.md` rule
- Remove Linear checks from `harness-check/SKILL.md`
- Remove `reconcile-linear/` skill
- Simplify coordinator to work with local TODO files instead

## 5. Quality Gates

### Adding a gate
1. Add the gate to `pipeline-advance.js` in the `resetGates()` function
2. Add the check to `tester.md` and `harness-check/SKILL.md`
3. Add `gate-pass`/`gate-fail` calls in `coordinator.md`

### Removing a gate
1. Remove from `resetGates()` in `pipeline-advance.js`
2. Remove the check from agents and skills
3. Remove the hook file if it was a standalone hook

### Changing thresholds
- Coverage threshold: edit `conventions.coverage_threshold` in config
- Max function lines: edit `conventions.max_function_lines` in config
- Max retry attempts: edit `max_attempts` in `pipeline-state.json` default

## 6. State Machine Phases

### Adding a phase
1. Add the phase to `VALID_TRANSITIONS` in `pipeline-advance.js`
2. Update `pipeline-gate.sh` with any new gate logic
3. Update `coordinator.md` with the new phase's instructions
4. Update the dashboard phase list in `generate-dashboard.js`

### Removing a phase
1. Update `VALID_TRANSITIONS` to skip the removed phase
2. Remove the phase's logic from `coordinator.md`
3. Update the dashboard

## 7. Without Supabase

If you don't use Supabase:
1. Set `supabase.enabled: false` in config
2. Remove `mcp__supabase__*` from `settings.local.json` allow list
3. Remove Supabase check from `harness-check/SKILL.md` (Gate 9)
4. The `supabase_check` gate in the state machine will auto-pass

## 8. Hooks

### Disabling a hook
Remove or comment out the hook entry in `settings.local.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          // Remove the hook entry you don't want
        ]
      }
    ]
  }
}
```

### Adding a custom hook
1. Create a `.sh` file in `.claude/hooks/`
2. Add it to `settings.local.json` under the appropriate trigger
3. Ensure it exits 0 for pass, 1 for block

## 9. CLAUDE.md Template

Create a `CLAUDE.md` in your project root based on `docs/CLAUDE.md.template`. This is what teaches the AI about your specific project. Include:
- Build/run commands
- Stack description
- Coding conventions
- Project structure
- Links to planning artifacts
