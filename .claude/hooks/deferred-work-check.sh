#!/bin/bash
# Hook: Deferred Work Tracker
# Checks if previously blocked work items have become unblocked.
# Reads conditions from .claude/deferred-work.json and checks against current project state.
#
# Trigger: PostToolUse on Write/Edit (checks after file modifications)

DEFERRED_FILE=".claude/deferred-work.json"

if [ ! -f "$DEFERRED_FILE" ]; then
  exit 0
fi

UNBLOCKED=$(node -e "
const fs = require('fs');
const path = require('path');
const items = JSON.parse(fs.readFileSync('$DEFERRED_FILE', 'utf8'));
const alerts = [];

for (const item of items) {
  if (item.resolved) continue;

  let triggered = false;

  // Check if trigger file exists
  if (item.trigger_file) {
    try {
      const result = require('child_process').execSync(
        'find . -path \"' + item.trigger_file + '\" 2>/dev/null | head -1',
        { encoding: 'utf8' }
      ).trim();
      if (result) triggered = true;
    } catch {}
  }

  // Check if trigger content exists in a file
  if (item.trigger_content && item.trigger_in) {
    try {
      const content = fs.readFileSync(item.trigger_in, 'utf8');
      if (content.includes(item.trigger_content)) triggered = true;
    } catch {}
  }

  if (triggered) {
    alerts.push(item.id + ': ' + item.description + (item.issue ? ' (Issue: ' + item.issue + ')' : ''));
  }
}

if (alerts.length > 0) {
  console.log('UNBLOCKED:\\n' + alerts.join('\\n'));
}
" 2>/dev/null)

if [ -n "$UNBLOCKED" ]; then
  echo "NOTICE: Deferred work items are now UNBLOCKED!"
  echo ""
  echo "$UNBLOCKED"
  echo ""
  echo "These items were waiting for a dependency that now exists."
fi

exit 0
