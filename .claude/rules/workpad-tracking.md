# Workpad Tracking (Symphony Pattern)

## Single Workpad Comment Per Issue
When the coordinator starts work on an issue, create ONE comment with header `## Workpad` and update it in-place throughout execution. Do NOT create multiple comments.

### Workpad Format
```markdown
## Workpad

### Plan
- [ ] Step 1: description
- [ ] Step 2: description

### Pipeline
| Phase | Status | Details |
|-------|--------|---------|
| Coder | pending | — |
| Tester | pending | — |
| Reviewer | pending | — |

### Validation
- [ ] Build passes
- [ ] Lint passes
- [ ] Tests pass (X new, Y total)
- [ ] Typecheck passes
- [ ] Smoke test passes

### Files Changed
- `path/to/file.ts` — description

### Commit
`abc1234` feat(module): description
```

### Update Rules
- Update the SAME comment (use its comment ID) as each phase completes
- Change `pending` to `done` / `failed` with details
- Check off validation items as they pass
- Add commit hash when committed

## Why (Symphony principle)
One persistent workpad per issue provides a single source of truth for progress. Multiple scattered comments are hard to reconcile and easy to lose track of.
