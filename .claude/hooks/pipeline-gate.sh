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

# Read current phase and mode
STATE_INFO=$(node -e "
  const s = JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));
  console.log(JSON.stringify({
    phase: s.phase || 'idle',
    mode: s.mode || 'sequential',
    version: s.version || 2
  }));
" 2>/dev/null)

PHASE=$(echo "$STATE_INFO" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).phase))" 2>/dev/null)
MODE=$(echo "$STATE_INFO" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).mode))" 2>/dev/null)
VERSION=$(echo "$STATE_INFO" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).version))" 2>/dev/null)

# If idle, nothing to enforce
if [ "$PHASE" = "idle" ] || [ -z "$PHASE" ]; then
  exit 0
fi

# === PARALLEL MODE: per-track gate enforcement ===
# In parallel mode, agents run in worktrees. The SYMPHONY_TRACK env var
# identifies which track this agent belongs to. Gates apply per-track.
if [ "$MODE" = "parallel" ] && [ -n "$SYMPHONY_TRACK" ]; then
  TRACK_INFO=$(node -e "
    const s = JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));
    const t = (s.tracks || {})['$SYMPHONY_TRACK'];
    if (t) console.log(JSON.stringify({phase: t.phase, attempt: t.attempt, status: t.status}));
    else console.log('null');
  " 2>/dev/null)

  if [ "$TRACK_INFO" = "null" ] || [ -z "$TRACK_INFO" ]; then
    # Track not found — agent not in a valid track context, allow (non-track operations)
    : # fall through to global gates
  else
    TRACK_PHASE=$(echo "$TRACK_INFO" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).phase))" 2>/dev/null)
    TRACK_ATTEMPT=$(echo "$TRACK_INFO" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).attempt))" 2>/dev/null)

    # Per-track commit gate: no commit before review phase
    if echo "$COMMAND" | grep -qiE 'git\s+commit'; then
      if [ "$TRACK_PHASE" = "phase2_track_active" ] || [ "$TRACK_PHASE" = "phase2_track_testing" ]; then
        echo "BLOCKED by Pipeline Gate (track $SYMPHONY_TRACK): Cannot commit in track phase '$TRACK_PHASE'"
        echo "Commit is only allowed after reviewer approval (phase2_track_committing)."
        exit 1
      fi
    fi

    # Per-track max attempts
    if [ "$TRACK_ATTEMPT" -ge 3 ] 2>/dev/null; then
      echo "BLOCKED by Pipeline Gate (track $SYMPHONY_TRACK): Max attempts exceeded"
      echo "Follow Rework Protocol or contact coordinator."
      exit 1
    fi

    # In parallel mode with a valid track, skip global sequential gates
    # (global gates like no-push-before-auditor still apply below)
  fi
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
