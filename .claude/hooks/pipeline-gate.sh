#!/bin/bash
# Hook: Pipeline Gate — Enforces phase ordering via persistent state machine
# The LLM CANNOT skip phases. This hook reads pipeline-state.json and blocks
# operations that violate the required sequence.
#
# Phase sequence (enforced by code, not by LLM):
#   idle → phase0_mcp → phase1_discovery → phase1.5_coverage →
#   phase2_task_coder → phase2_task_tester → phase2_task_reviewer →
#   phase2_task_commit → phase3_integration → phase4_auditor →
#   phase5_pr → phase6_reconcile → idle
#
# Trigger: PreToolUse on Bash (all commands)

COMMAND="$1"
STATE_FILE=".claude/pipeline-state.json"

# If no state file, nothing to enforce
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Read current phase
PHASE=$(node -e "
  const s = JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));
  console.log(s.phase || 'idle');
" 2>/dev/null)

# If idle, nothing to enforce
if [ "$PHASE" = "idle" ] || [ -z "$PHASE" ]; then
  exit 0
fi

# === GATE 0: Pipeline blocked — human intervention required ===
if [ "$PHASE" = "phase_blocked" ]; then
  REASON=$(node -e "
    const s = JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));
    console.log(s.blocked_reason || 'unknown');
  " 2>/dev/null)
  echo "BLOCKED: Pipeline paused — human intervention required"
  echo ""
  echo "Reason: $REASON"
  echo ""
  echo "To unblock: node .claude/hooks/pipeline-advance.js unblock-task '<your directive>'"
  echo "To abort:   node .claude/hooks/pipeline-advance.js reset"
  echo "Details:    cat .claude/blocked-notification.json"
  exit 1
fi

# === GATE 1: No push before auditor ===
if echo "$COMMAND" | grep -qiE 'git\s+push'; then
  if [ "$PHASE" != "phase5_pr" ] && [ "$PHASE" != "phase6_reconcile" ]; then
    echo "BLOCKED by Pipeline Gate: Cannot push in phase '$PHASE'"
    echo "Push is only allowed in phase5_pr (after auditor passes)."
    echo "Required sequence: coder → tester → reviewer → commit → integration → AUDITOR → push"
    exit 1
  fi
fi

# === GATE 2: No commit before reviewer ===
if echo "$COMMAND" | grep -qiE 'git\s+commit'; then
  if [ "$PHASE" = "phase2_task_coder" ] || [ "$PHASE" = "phase2_task_tester" ]; then
    echo "BLOCKED by Pipeline Gate: Cannot commit in phase '$PHASE'"
    echo "Commit is only allowed after reviewer approval (phase2_task_commit)."
    exit 1
  fi
fi

# === GATE 3: No PR creation before auditor ===
if echo "$COMMAND" | grep -qiE 'gh\s+pr\s+create|mcp__github__create_pull_request'; then
  AUDITOR=$(node -e "
    const s = JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));
    console.log(s.gates.auditor || 'null');
  " 2>/dev/null)

  if [ "$AUDITOR" != "pass" ]; then
    echo "BLOCKED by Pipeline Gate: Cannot create PR without auditor approval"
    echo "Auditor gate: $AUDITOR (required: pass)"
    exit 1
  fi
fi

# === GATE 4: No test suite before coder completes ===
# Customize the pattern below to match your build/test commands
if echo "$COMMAND" | grep -qiE 'pnpm\s+turbo\s+(test|build|lint|typecheck)|npm\s+run\s+(test|build|lint)|yarn\s+(test|build|lint)'; then
  if [ "$PHASE" = "phase0_mcp" ] || [ "$PHASE" = "phase1_discovery" ] || [ "$PHASE" = "phase1.5_coverage" ]; then
    echo "BLOCKED by Pipeline Gate: Cannot run test suite in phase '$PHASE'"
    echo "Test suite runs in phase2_task_tester or later."
    exit 1
  fi
fi

# === GATE 5: Max attempts enforcement ===
ATTEMPT=$(node -e "
  const s = JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));
  console.log(JSON.stringify({attempt: s.attempt, max: s.max_attempts, task: s.current_task}));
" 2>/dev/null)

MAX_EXCEEDED=$(echo "$ATTEMPT" | node -e "
  process.stdin.on('data', d => {
    const a = JSON.parse(d);
    console.log(a.attempt >= a.max ? 'yes' : 'no');
  });
" 2>/dev/null)

if [ "$MAX_EXCEEDED" = "yes" ]; then
  TASK_ID=$(echo "$ATTEMPT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).task))" 2>/dev/null)
  echo "BLOCKED by Pipeline Gate: Max attempts exceeded for task $TASK_ID"
  echo "Follow Rework Protocol or skip: node .claude/hooks/pipeline-advance.js skip-task"
  exit 1
fi

# All gates passed
exit 0
