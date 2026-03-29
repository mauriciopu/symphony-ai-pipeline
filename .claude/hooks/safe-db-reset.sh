#!/bin/bash
# Hook: Safe DB Reset — Only allowed during rework cycles
# Resets the database to a clean state when git revert alone isn't enough.
# Prevents migrations desync after code revert.
#
# Safety: Only runs if pipeline state shows an active rework (attempt > 0)
# or pipeline is blocked. NEVER runs during normal development.
#
# ===== CUSTOMIZE the reset commands below for your ORM/DB =====
#
# Usage: bash .claude/hooks/safe-db-reset.sh

STATE_FILE=".claude/pipeline-state.json"

if [ ! -f "$STATE_FILE" ]; then
  echo "BLOCKED: No pipeline state file. DB reset requires an active pipeline."
  exit 1
fi

STATE=$(node -e "
  const s = JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));
  console.log(JSON.stringify({ phase: s.phase, attempt: s.attempt, unit: s.unit, task: s.current_task }));
" 2>/dev/null)

PHASE=$(echo "$STATE" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).phase))" 2>/dev/null)
ATTEMPT=$(echo "$STATE" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).attempt))" 2>/dev/null)

# Gate 1: Only during rework or blocked state
if [ "$PHASE" != "phase_blocked" ] && [ "$PHASE" != "phase2_task_coder" ]; then
  echo "BLOCKED: DB reset only allowed during rework or blocked state"
  echo "Current phase: $PHASE"
  exit 1
fi

# Gate 2: Must have failed at least once
if [ "$PHASE" = "phase2_task_coder" ] && [ "$ATTEMPT" = "0" ]; then
  echo "BLOCKED: DB reset only allowed after a failed attempt"
  exit 1
fi

echo "============================================"
echo "  SAFE DB RESET — Rework Mode"
echo "============================================"
echo "Phase: $PHASE | Attempt: $ATTEMPT"
echo ""

# ===== CUSTOMIZE THESE COMMANDS FOR YOUR PROJECT =====
# Example for Prisma:
echo "[1/3] Resetting database..."
pnpm prisma migrate reset --force --skip-seed 2>&1 | tail -5
if [ $? -ne 0 ]; then
  echo "ERROR: Database reset failed"
  exit 1
fi

echo "[2/3] Pushing schema..."
pnpm prisma db push 2>&1 | tail -3
if [ $? -ne 0 ]; then
  echo "ERROR: Schema push failed"
  exit 1
fi

echo "[3/3] Generating client..."
pnpm prisma generate 2>&1 | tail -2

# Example for Django:
# python manage.py migrate --run-syncdb
#
# Example for Rails:
# rails db:reset
#
# Example for Go (golang-migrate):
# migrate -path ./migrations -database "$DATABASE_URL" down
# migrate -path ./migrations -database "$DATABASE_URL" up
# =====================================================

echo ""
echo "DB reset complete. Database is in sync with current code."
echo "============================================"
