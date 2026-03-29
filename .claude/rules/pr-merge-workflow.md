# PR Merge Workflow (NON-NEGOTIABLE)

## Merge ONLY via GitHub MCP
- ALL merges MUST use `mcp__github__merge_pull_request(merge_method: "squash")`
- NEVER use `gh pr merge`, `gh pr close`, or local `git merge` into master/main
- NEVER close a PR without merging — closed PRs LOSE code permanently

## Post-Merge Verification (MANDATORY)
After every `mcp__github__merge_pull_request` call:
1. Call `mcp__github__get_pull_request(pull_number)` immediately
2. Confirm `merged: true` AND `merged_at` is not null
3. If `merged_at` is null: STOP and report failure — do NOT proceed

## Why
PRs were closed without merge, and code was lost entirely — requiring manual recovery. This rule prevents that from ever happening again.
