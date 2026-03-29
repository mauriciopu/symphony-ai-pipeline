#!/bin/bash
# Hook: Prevent dangerous operations
# Blocks destructive commands that could cause data loss.
# This hook is universal — works for any project.
#
# Trigger: PreToolUse on Bash (all commands)

COMMAND="$1"

# === DANGEROUS GIT OPERATIONS ===
if echo "$COMMAND" | grep -qiE 'git\s+push\s+.*--force|git\s+push\s+-f\b'; then
  echo "BLOCKED: git push --force is not allowed. Use --force-with-lease instead."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'git\s+push\s+.*\b(main|master)\b'; then
  echo "BLOCKED: Direct push to main/master. Create a PR instead."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'git\s+reset\s+--hard'; then
  echo "BLOCKED: git reset --hard can destroy uncommitted work. Use git stash instead."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'git\s+clean\s+-[a-zA-Z]*f'; then
  echo "BLOCKED: git clean -f deletes untracked files permanently."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'git\s+checkout\s+\.\s*$'; then
  echo "BLOCKED: git checkout . discards all uncommitted changes."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'git\s+branch\s+-D\b'; then
  echo "BLOCKED: git branch -D force-deletes branch. Use -d for safe delete."
  exit 1
fi

if echo "$COMMAND" | grep -qiF -- '--no-verify'; then
  echo "BLOCKED: --no-verify skips safety hooks. Fix the underlying issue instead."
  exit 1
fi

# === DANGEROUS FILE OPERATIONS ===
if echo "$COMMAND" | grep -qiE 'rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(/|~|\$HOME|C:\\|D:\\)\s*$'; then
  echo "BLOCKED: rm -rf on root/home directory is extremely dangerous."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+\.\s*$'; then
  echo "BLOCKED: rm -rf . would delete the entire project."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+\.git\s*$'; then
  echo "BLOCKED: rm -rf .git would destroy the git repository."
  exit 1
fi

# === DATABASE OPERATIONS ===
if echo "$COMMAND" | grep -qiE 'DROP\s+(DATABASE|TABLE|SCHEMA)\s'; then
  echo "BLOCKED: DROP DATABASE/TABLE/SCHEMA detected. This is irreversible."
  exit 1
fi

# === PR / MERGE WORKFLOW ENFORCEMENT ===
if echo "$COMMAND" | grep -qiE 'gh\s+pr\s+close'; then
  echo "BLOCKED: Do not close PRs manually. Use mcp__github__merge_pull_request to merge."
  echo "Closing a PR without merge LOSES all code on that branch."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'gh\s+pr\s+merge'; then
  echo "BLOCKED: Do not merge PRs via gh CLI. Use mcp__github__merge_pull_request instead."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'git\s+merge\s+.*\b(master|main)\b|git\s+checkout\s+(master|main)\s*&&\s*git\s+merge'; then
  echo "BLOCKED: Do not merge locally into master/main. Create a PR and merge via GitHub."
  exit 1
fi

# === SECRETS / SENSITIVE FILES ===
if echo "$COMMAND" | grep -qiE 'git\s+add\s+.*\.env'; then
  echo "BLOCKED: Do not commit .env files. They may contain secrets."
  exit 1
fi

if echo "$COMMAND" | grep -qiE 'git\s+add\s+.*(credentials|secrets|\.pem|\.key|\.p12)'; then
  echo "BLOCKED: Do not commit credential/key files."
  exit 1
fi

exit 0
