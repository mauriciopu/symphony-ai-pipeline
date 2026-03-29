#!/usr/bin/env node
/**
 * Pipeline State Machine — Advance/Transition Helper
 *
 * Manages the persistent pipeline state. The LLM calls this to advance phases.
 * The state machine enforces valid transitions — invalid ones are rejected.
 *
 * Usage:
 *   node .claude/hooks/pipeline-advance.js <action> [args...]
 *
 * Actions:
 *   start-unit <unit> <epic_id> <branch>   — Begin a new unit pipeline
 *   advance <next_phase>                    — Move to next phase (validated)
 *   gate-pass <gate_name>                   — Mark a quality gate as passed
 *   gate-fail <gate_name> <reason>          — Mark a quality gate as failed + increment attempt
 *   set-task <task_id> <story_id>           — Set current task being worked on
 *   task-done <task_id> <commit_sha>        — Mark task complete, record commit
 *   story-done <story_id>                   — Mark story complete
 *   task-failed <task_id> <reason>          — Mark task as failed (rework)
 *   block-task <task_id> <reason>           — Block pipeline (human intervention)
 *   unblock-task <directive>                — Resume after human unblock
 *   set-pr <pr_number>                      — Record PR number
 *   complete                                — Pipeline finished, reset to idle
 *   skip-task                               — Skip current task (after max attempts)
 *   status                                  — Print current state summary
 *   reset                                   — Force reset to idle (emergency only)
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), '.claude/pipeline-state.json');
const AUDIT_FILE = path.join(process.cwd(), '.claude/pipeline-audit.jsonl');

// Valid phase transitions
const VALID_TRANSITIONS = {
  'idle':                  ['phase0_mcp'],
  'phase0_mcp':            ['phase1_discovery'],
  'phase1_discovery':      ['phase1.5_coverage'],
  'phase1.5_coverage':     ['phase2_task_coder'],
  'phase2_task_coder':     ['phase2_task_tester', 'phase_blocked'],
  'phase2_task_tester':    ['phase2_task_reviewer', 'phase2_task_coder'],
  'phase2_task_reviewer':  ['phase2_task_commit', 'phase2_task_coder'],
  'phase2_task_commit':    ['phase2_task_coder', 'phase3_integration'],
  'phase3_integration':    ['phase4_auditor'],
  'phase4_auditor':        ['phase5_pr', 'phase2_task_coder', 'phase_blocked'],
  'phase5_pr':             ['phase6_reconcile'],
  'phase6_reconcile':      ['idle'],
  'phase_blocked':         ['phase2_task_coder', 'idle']
};

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function audit(action, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    action,
    ...details
  };
  fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
}

function resetGates() {
  return {
    mcp_health: null,
    hierarchy_discovery: null,
    plan_coverage: null,
    build: null,
    lint: null,
    test: null,
    typecheck: null,
    supabase_check: null,
    reviewer: null,
    smoke_test: null,
    auditor: null
  };
}

// --- Actions ---

const actions = {
  'start-unit': (args) => {
    const [unit, epicId, branch] = args;
    if (!unit || !epicId || !branch) {
      console.error('Usage: start-unit <unit> <epic_id> <branch>');
      process.exit(1);
    }
    const state = readState() || {};
    if (state.phase && state.phase !== 'idle') {
      console.error(`ERROR: Pipeline already active (phase: ${state.phase}, unit: ${state.unit})`);
      console.error('Complete current unit or run: node .claude/hooks/pipeline-advance.js reset');
      process.exit(1);
    }
    const newState = {
      version: 2,
      status: 'active',
      unit,
      epic_id: epicId,
      branch,
      phase: 'phase0_mcp',
      phase_index: 1,
      current_story: null,
      current_task: null,
      attempt: 0,
      max_attempts: 3,
      gates: resetGates(),
      stories_done: [],
      tasks_done: [],
      tasks_failed: [],
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_commit: null,
      pr_number: null
    };
    writeState(newState);
    audit('start-unit', { unit, epicId, branch });
    console.log(`Pipeline started: ${unit} (${epicId}) on ${branch}`);
    console.log(`Phase: phase0_mcp — verify MCP health next`);
  },

  'advance': (args) => {
    const [nextPhase] = args;
    const state = readState();
    if (!state || state.phase === 'idle') {
      console.error('ERROR: No active pipeline. Run start-unit first.');
      process.exit(1);
    }
    const valid = VALID_TRANSITIONS[state.phase];
    if (!valid || !valid.includes(nextPhase)) {
      console.error(`ERROR: Invalid transition ${state.phase} → ${nextPhase}`);
      console.error(`Valid transitions from ${state.phase}: ${(valid || []).join(', ')}`);
      process.exit(1);
    }
    const oldPhase = state.phase;
    state.phase = nextPhase;
    state.phase_index++;
    // Reset task-level gates when entering a new task cycle
    if (nextPhase === 'phase2_task_coder' && oldPhase !== 'phase2_task_tester' && oldPhase !== 'phase2_task_reviewer') {
      state.gates.build = null;
      state.gates.lint = null;
      state.gates.test = null;
      state.gates.typecheck = null;
      state.gates.reviewer = null;
      state.attempt = 0;
    }
    writeState(state);
    audit('advance', { from: oldPhase, to: nextPhase, unit: state.unit, task: state.current_task });
    console.log(`Advanced: ${oldPhase} → ${nextPhase}`);
  },

  'gate-pass': (args) => {
    const [gate] = args;
    const state = readState();
    if (!state || !state.gates.hasOwnProperty(gate)) {
      console.error(`ERROR: Unknown gate '${gate}'. Valid: ${Object.keys(state?.gates || {}).join(', ')}`);
      process.exit(1);
    }
    state.gates[gate] = 'pass';
    writeState(state);
    audit('gate-pass', { gate, unit: state.unit, task: state.current_task });
    console.log(`Gate PASSED: ${gate}`);
  },

  'gate-fail': (args) => {
    const [gate, ...reasonParts] = args;
    const reason = reasonParts.join(' ');
    const state = readState();
    if (!state || !state.gates.hasOwnProperty(gate)) {
      console.error(`ERROR: Unknown gate '${gate}'.`);
      process.exit(1);
    }
    state.gates[gate] = 'fail';
    state.attempt++;
    writeState(state);
    audit('gate-fail', { gate, reason, attempt: state.attempt, unit: state.unit, task: state.current_task });
    console.log(`Gate FAILED: ${gate} (attempt ${state.attempt}/${state.max_attempts})`);
    if (state.attempt >= state.max_attempts) {
      console.log(`MAX ATTEMPTS REACHED — follow Rework Protocol or skip-task`);
    }
  },

  'set-task': (args) => {
    const [taskId, storyId] = args;
    const state = readState();
    state.current_task = taskId;
    state.current_story = storyId || state.current_story;
    state.attempt = 0;
    // Reset task-level gates
    state.gates.build = null;
    state.gates.lint = null;
    state.gates.test = null;
    state.gates.typecheck = null;
    state.gates.reviewer = null;
    writeState(state);
    audit('set-task', { taskId, storyId, unit: state.unit });
    console.log(`Task set: ${taskId} (story: ${state.current_story})`);
  },

  'task-done': (args) => {
    const [taskId, commitSha] = args;
    const state = readState();
    if (!state.tasks_done.includes(taskId)) {
      state.tasks_done.push(taskId);
    }
    state.last_commit = commitSha || state.last_commit;
    state.current_task = null;
    writeState(state);
    audit('task-done', { taskId, commitSha, unit: state.unit, gates: { ...state.gates } });
    console.log(`Task DONE: ${taskId} (commit: ${commitSha || 'none'})`);
    console.log(`Progress: ${state.tasks_done.length} tasks done, ${state.tasks_failed.length} failed`);
  },

  'story-done': (args) => {
    const [storyId] = args;
    const state = readState();
    if (!state.stories_done.includes(storyId)) {
      state.stories_done.push(storyId);
    }
    state.current_story = null;
    writeState(state);
    audit('story-done', { storyId, unit: state.unit });
    console.log(`Story DONE: ${storyId} (${state.stories_done.length} stories complete)`);
  },

  'task-failed': (args) => {
    const [taskId, ...reasonParts] = args;
    const reason = reasonParts.join(' ');
    const state = readState();
    if (!state.tasks_failed.includes(taskId)) {
      state.tasks_failed.push(taskId);
    }
    state.current_task = null;
    writeState(state);
    audit('task-failed', { taskId, reason, unit: state.unit });
    console.log(`Task FAILED: ${taskId} — ${reason}`);
  },

  'block-task': (args) => {
    const [taskId, ...reasonParts] = args;
    const reason = reasonParts.join(' ');
    if (!taskId) {
      console.error('Usage: block-task <task_id> <reason>');
      process.exit(1);
    }
    const state = readState();
    if (!state || state.phase === 'idle') {
      console.error('ERROR: No active pipeline to block.');
      process.exit(1);
    }
    state.phase = 'phase_blocked';
    state.blocked_reason = reason;
    state.blocked_at = new Date().toISOString();
    writeState(state);
    // Write notification file for external consumption
    const notif = {
      task: taskId,
      unit: state.unit,
      branch: state.branch,
      reason,
      timestamp: state.blocked_at,
      gates: state.gates,
      attempt: state.attempt,
      tasks_done: state.tasks_done,
      tasks_failed: state.tasks_failed
    };
    fs.writeFileSync(
      path.join(process.cwd(), '.claude/blocked-notification.json'),
      JSON.stringify(notif, null, 2)
    );
    audit('block-task', { taskId, reason, unit: state.unit });
    console.log(`PIPELINE BLOCKED: ${taskId} — ${reason}`);
    console.log(`Human intervention required.`);
    console.log(`Notification written to .claude/blocked-notification.json`);
    console.log(`To unblock: node .claude/hooks/pipeline-advance.js unblock-task "<directive>"`);
    console.log(`To abort:   node .claude/hooks/pipeline-advance.js reset`);
  },

  'unblock-task': (args) => {
    const directive = args.join(' ');
    const state = readState();
    if (!state || state.phase !== 'phase_blocked') {
      console.error('ERROR: Pipeline is not blocked (current phase: ' + (state?.phase || 'none') + ')');
      process.exit(1);
    }
    const oldReason = state.blocked_reason;
    state.phase = 'phase2_task_coder';
    state.blocked_reason = null;
    state.blocked_at = null;
    state.attempt = 0;
    state.human_directive = directive || null;
    // Reset task-level gates for fresh attempt
    state.gates.build = null;
    state.gates.lint = null;
    state.gates.test = null;
    state.gates.typecheck = null;
    state.gates.supabase_check = null;
    state.gates.reviewer = null;
    writeState(state);
    audit('unblock-task', { directive, previousReason: oldReason, unit: state.unit, task: state.current_task });
    console.log(`PIPELINE UNBLOCKED`);
    console.log(`Previous block: ${oldReason}`);
    console.log(`Human directive: ${directive || 'none'}`);
    console.log(`Phase reset to: phase2_task_coder (attempt 0)`);
  },

  'set-pr': (args) => {
    const [prNumber] = args;
    const state = readState();
    state.pr_number = parseInt(prNumber, 10);
    writeState(state);
    audit('set-pr', { prNumber, unit: state.unit });
    console.log(`PR set: #${prNumber}`);
  },

  'complete': () => {
    const state = readState();
    const summary = {
      unit: state.unit,
      tasks_done: state.tasks_done.length,
      tasks_failed: state.tasks_failed.length,
      stories_done: state.stories_done.length,
      pr: state.pr_number,
      duration_ms: Date.now() - new Date(state.started_at).getTime()
    };
    audit('complete', summary);
    const idle = {
      version: 2,
      status: 'idle',
      unit: null,
      epic_id: null,
      branch: null,
      phase: 'idle',
      phase_index: 0,
      current_story: null,
      current_task: null,
      attempt: 0,
      max_attempts: 3,
      gates: resetGates(),
      stories_done: [],
      tasks_done: [],
      tasks_failed: [],
      started_at: null,
      updated_at: new Date().toISOString(),
      last_commit: null,
      pr_number: null
    };
    writeState(idle);
    console.log(`Pipeline COMPLETE: ${summary.unit}`);
    console.log(`  Tasks: ${summary.tasks_done} done, ${summary.tasks_failed} failed`);
    console.log(`  Stories: ${summary.stories_done} done`);
    console.log(`  PR: #${summary.pr || 'none'}`);
  },

  'skip-task': () => {
    const state = readState();
    if (state.current_task) {
      if (!state.tasks_failed.includes(state.current_task)) {
        state.tasks_failed.push(state.current_task);
      }
      audit('skip-task', { taskId: state.current_task, unit: state.unit, attempt: state.attempt });
      console.log(`Skipped task: ${state.current_task} (after ${state.attempt} attempts)`);
      state.current_task = null;
      state.attempt = 0;
      state.phase = 'phase2_task_coder';
      writeState(state);
    } else {
      console.log('No active task to skip');
    }
  },

  'status': () => {
    const state = readState();
    if (!state || state.phase === 'idle') {
      console.log('Pipeline: IDLE (no active unit)');
      return;
    }
    console.log(`Pipeline Status:`);
    console.log(`  Unit:    ${state.unit} (${state.epic_id})`);
    console.log(`  Branch:  ${state.branch}`);
    console.log(`  Phase:   ${state.phase} (step ${state.phase_index})`);
    console.log(`  Story:   ${state.current_story || 'none'}`);
    console.log(`  Task:    ${state.current_task || 'none'} (attempt ${state.attempt}/${state.max_attempts})`);
    console.log(`  Gates:`);
    for (const [k, v] of Object.entries(state.gates)) {
      const icon = v === 'pass' ? '✓' : v === 'fail' ? '✗' : '·';
      console.log(`    ${icon} ${k}: ${v || 'pending'}`);
    }
    console.log(`  Done:    ${state.tasks_done.length} tasks, ${state.stories_done.length} stories`);
    console.log(`  Failed:  ${state.tasks_failed.length} tasks`);
    console.log(`  Started: ${state.started_at}`);
    console.log(`  Updated: ${state.updated_at}`);
  },

  'reset': () => {
    const state = readState();
    if (state && state.phase !== 'idle') {
      audit('reset', { unit: state.unit, phase: state.phase, reason: 'manual reset' });
    }
    const idle = {
      version: 2,
      status: 'idle',
      unit: null,
      epic_id: null,
      branch: null,
      phase: 'idle',
      phase_index: 0,
      current_story: null,
      current_task: null,
      attempt: 0,
      max_attempts: 3,
      gates: resetGates(),
      stories_done: [],
      tasks_done: [],
      tasks_failed: [],
      started_at: null,
      updated_at: new Date().toISOString(),
      last_commit: null,
      pr_number: null
    };
    writeState(idle);
    console.log('Pipeline RESET to idle');
  }
};

// --- Main ---
const [,, action, ...args] = process.argv;

if (!action || !actions[action]) {
  console.log('Pipeline State Machine — Actions:');
  console.log('  start-unit <unit> <epic_id> <branch>');
  console.log('  advance <phase>');
  console.log('  gate-pass <gate>');
  console.log('  gate-fail <gate> <reason>');
  console.log('  set-task <task_id> [story_id]');
  console.log('  task-done <task_id> [commit_sha]');
  console.log('  story-done <story_id>');
  console.log('  task-failed <task_id> <reason>');
  console.log('  set-pr <pr_number>');
  console.log('  complete');
  console.log('  skip-task');
  console.log('  status');
  console.log('  reset');
  process.exit(action ? 1 : 0);
}

actions[action](args);
