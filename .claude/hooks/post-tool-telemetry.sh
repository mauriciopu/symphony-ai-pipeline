#!/bin/bash
# PostToolUse hook — writes heartbeat + tool call log to dashboard status file
# Receives JSON on stdin: { tool_name, tool_input, session_id, tool_use_id }
# Must complete fast (<50ms). HTML generation runs in background.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATUS_FILE="$PROJECT_DIR/dashboard/pipeline-status.json"
GENERATOR="$PROJECT_DIR/dashboard/generate-dashboard.js"

INPUT=$(cat)

if [ -z "$INPUT" ]; then
  exit 0
fi

if [ ! -f "$STATUS_FILE" ]; then
  exit 0
fi

node -e "
const fs = require('fs');
const statusFile = process.argv[1];
const rawInput = process.argv[2];

try {
  const input = JSON.parse(rawInput);
  const toolName = input.tool_name || 'unknown';
  const toolInput = input.tool_input || {};
  const sessionId = input.session_id || 'unknown';

  let summary = '';
  if (['Write', 'Edit', 'Read'].includes(toolName)) {
    summary = (toolInput.file_path || toolInput.path || '').replace(/.*[\\/\\\\]/, '');
  } else if (toolName === 'Bash') {
    summary = (toolInput.command || '').substring(0, 80);
  } else if (toolName === 'Agent') {
    summary = 'spawning ' + (toolInput.subagent_type || toolInput.description || 'agent');
  } else if (toolName.startsWith('mcp__linear__')) {
    summary = 'Linear: ' + toolName.replace('mcp__linear__', '');
  } else if (toolName.startsWith('mcp__github__')) {
    summary = 'GitHub: ' + toolName.replace('mcp__github__', '');
  } else if (toolName.startsWith('mcp__supabase__')) {
    summary = 'Supabase: ' + toolName.replace('mcp__supabase__', '');
  } else {
    summary = toolName;
  }

  let status;
  try {
    status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  } catch {
    status = { recentToolCalls: [] };
  }

  status.heartbeat = new Date().toISOString();
  status.lastActiveSession = sessionId;

  if (!status.recentToolCalls) status.recentToolCalls = [];
  status.recentToolCalls.unshift({
    timestamp: new Date().toISOString(),
    tool: toolName,
    summary: summary,
    session: sessionId
  });
  if (status.recentToolCalls.length > 30) {
    status.recentToolCalls = status.recentToolCalls.slice(0, 30);
  }

  fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
} catch (e) {
  process.exit(0);
}
" "$STATUS_FILE" "$INPUT" 2>/dev/null

# Generate dashboard HTML in background (non-blocking)
if [ -f "$GENERATOR" ]; then
  node "$GENERATOR" &>/dev/null &
fi

exit 0
