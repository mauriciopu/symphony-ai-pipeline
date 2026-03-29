# Rework Protocol (Symphony Pattern)

## When rework is triggered
Rework happens when:
- Tester fails 3 times on the same task
- Reviewer rejects 2 times on the same task
- CI fails after push and 2 fix attempts fail

## Rework = Fresh Start (NOT incremental patching)
When a task enters rework:

1. **Mark in tracker**: set state to "Todo" with "rework" label
2. **Add workpad note**: document what failed and why
3. **Revert the failing code**: `git revert` the commits for this task only
4. **Reset DB if needed**: run `bash .claude/hooks/safe-db-reset.sh` if task touched migrations/schema
5. **Fresh attempt**: start the coder from scratch with the failure context as guidance
6. **Do NOT**: keep layering fixes on top of broken code

## Why fresh start over patching
Incremental patching after multiple failures compounds errors. Each fix attempt adds complexity and can mask the root cause. A fresh start with knowledge of what went wrong produces cleaner code.

## Rework attempt limit
- Maximum 2 rework cycles per task
- After 2 rework cycles fail: **block the pipeline** (not just escalate)
  ```bash
  node .claude/hooks/pipeline-advance.js block-task <taskId> "<failure summary>"
  ```
- This transitions the state machine to `phase_blocked` and writes `.claude/blocked-notification.json`
- ALL operations are blocked until the human runs:
  ```bash
  node .claude/hooks/pipeline-advance.js unblock-task "<human directive>"
  ```
- The human directive guides the fresh attempt

## Why (Symphony principle)
Symphony treats rework as a full reset — close PR, delete workpad, fresh branch. This avoids compounding errors from incremental patching.
