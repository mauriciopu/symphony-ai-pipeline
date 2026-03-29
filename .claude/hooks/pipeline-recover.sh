#!/bin/bash
# Hook: Pipeline Crash Recovery
# Detects if a previous session died mid-pipeline and reports the state.
# This is NOT a blocking hook — it's a diagnostic script.
# Usage: bash .claude/hooks/pipeline-recover.sh

STATE_FILE=".claude/pipeline-state.json"
AUDIT_FILE=".claude/pipeline-audit.jsonl"

if [ ! -f "$STATE_FILE" ]; then
  echo "No pipeline state file found. Nothing to recover."
  exit 0
fi

STATUS=$(node -e "
  const s = JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8'));
  if (s.phase === 'idle' || !s.phase) {
    console.log('IDLE');
  } else {
    const age = Date.now() - new Date(s.updated_at).getTime();
    const ageMin = Math.round(age / 60000);
    console.log(JSON.stringify({
      status: 'ACTIVE',
      unit: s.unit,
      phase: s.phase,
      task: s.current_task,
      story: s.current_story,
      attempt: s.attempt,
      tasks_done: s.tasks_done.length,
      tasks_failed: s.tasks_failed.length,
      stories_done: s.stories_done.length,
      last_updated_min_ago: ageMin,
      gates: s.gates,
      branch: s.branch
    }));
  }
" 2>/dev/null)

if [ "$STATUS" = "IDLE" ]; then
  echo "Pipeline is idle. No recovery needed."
  exit 0
fi

echo "=========================================="
echo "  PIPELINE RECOVERY DETECTED"
echo "=========================================="
echo ""
echo "A previous session left the pipeline mid-execution."
echo ""
echo "$STATUS" | node -e "
  process.stdin.on('data', d => {
    const s = JSON.parse(d);
    console.log('  Unit:     ' + s.unit);
    console.log('  Branch:   ' + s.branch);
    console.log('  Phase:    ' + s.phase);
    console.log('  Task:     ' + (s.task || 'none'));
    console.log('  Story:    ' + (s.story || 'none'));
    console.log('  Attempt:  ' + s.attempt);
    console.log('  Progress: ' + s.tasks_done + ' tasks done, ' + s.tasks_failed + ' failed, ' + s.stories_done + ' stories done');
    console.log('  Last update: ' + s.last_updated_min_ago + ' minutes ago');
    console.log('');
    console.log('  Gates:');
    for (const [k,v] of Object.entries(s.gates)) {
      const icon = v === 'pass' ? '  ✓' : v === 'fail' ? '  ✗' : '  ·';
      console.log('  ' + icon + ' ' + k + ': ' + (v || 'pending'));
    }
    console.log('');
    console.log('  ACTION NEEDED:');
    console.log('  Resume from phase: ' + s.phase);
    if (s.task) {
      console.log('  Continue task: ' + s.task + ' (attempt ' + s.attempt + ')');
    }
    console.log('');
    console.log('  To resume: continue the pipeline from the current phase');
    console.log('  To abort:  node .claude/hooks/pipeline-advance.js reset');
    console.log('  To check:  node .claude/hooks/pipeline-advance.js status');
  });
"

# Show last 5 audit entries for context
if [ -f "$AUDIT_FILE" ]; then
  LINES=$(wc -l < "$AUDIT_FILE" 2>/dev/null | tr -d ' ')
  if [ "$LINES" -gt 0 ]; then
    echo ""
    echo "  Last audit entries:"
    tail -5 "$AUDIT_FILE" | node -e "
      const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n');
      for (const line of lines) {
        try {
          const e = JSON.parse(line);
          console.log('    [' + e.ts.substring(11,19) + '] ' + e.action + (e.taskId ? ' ' + e.taskId : '') + (e.gate ? ' ' + e.gate : ''));
        } catch {}
      }
    " 2>/dev/null
  fi
fi

echo ""
echo "=========================================="
