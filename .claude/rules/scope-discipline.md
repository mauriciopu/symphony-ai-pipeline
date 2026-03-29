# Scope Discipline (Symphony Pattern)

## Stay within the issue scope
When working on an issue, ONLY implement what that issue describes.

### If you discover something out of scope:
1. Do NOT fix it inline
2. Do NOT expand the current task
3. Log it as a note in the workpad: `Out of scope: [description] — needs separate issue`
4. Continue with the original task

### Examples of scope creep to avoid:
- Refactoring unrelated code while implementing a feature
- Adding "nice to have" improvements not in the acceptance criteria
- Fixing pre-existing bugs discovered during implementation
- Adding extra test coverage for code you didn't change

### Exception: blocking issues
If an out-of-scope issue BLOCKS the current task:
1. Document the blocker in the workpad
2. Create a minimal fix (smallest possible change)
3. Note it in the commit message: `fix(module): unblock ISSUE-123 — [description]`

## Why (Symphony principle)
Scope discipline prevents compounding errors and keeps PRs reviewable. When improvements are needed, file a separate issue so they get proper planning and testing.
