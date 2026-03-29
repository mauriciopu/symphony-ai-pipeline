# Proof of Work (Symphony Pattern)

## Never claim success without evidence
Before marking ANY task as "Done" in the tracker, the coordinator MUST have:

1. **CI evidence**: actual output of build, test, typecheck, lint
2. **Test count**: exact number of new tests + total passing (not approximate)
3. **Reviewer verdict**: explicit APPROVED from reviewer agent (not assumed)
4. **Commit hash**: the actual SHA from `git log`

## Reproduce Before Fixing (Symphony principle)
When a test fails or reviewer rejects:
1. Read the ACTUAL error output — do not guess
2. Reproduce the failure locally before attempting a fix
3. Verify the fix resolves the exact error, not a different one

## Validation Checklist (must be in workpad)
Every task completion MUST include these checked items:
- [ ] Build — 0 errors
- [ ] Lint — 0 violations
- [ ] Tests — X passing, Y% coverage
- [ ] Typecheck — 0 TS errors
- [ ] Reviewer: APPROVED (or REJECTED with reason)

## Why
On multiple occasions, the coordinator claimed tasks were "Done" without actually running validation. Symphony requires agents to demonstrate success through CI and tests — not just claim it.
