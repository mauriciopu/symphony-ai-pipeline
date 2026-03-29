#!/usr/bin/env node
/**
 * Pipeline State Machine v3 — Advance/Transition Helper
 *
 * Manages the persistent pipeline state with support for both sequential
 * and parallel (multi-track) execution modes.
 *
 * Usage:
 *   node .claude/hooks/pipeline-advance.js <action> [args...]
 *
 * Sequential Actions (v2 compatible):
 *   start-unit <unit> <epic_id> <branch>   — Begin a new unit pipeline
 *   advance <next_phase>                    — Move to next phase (validated)
 *   gate-pass <gate_name>                   — Mark a quality gate as passed
 *   gate-fail <gate_name> <reason>          — Mark a quality gate as failed
 *   set-task <task_id> <story_id>           — Set current task being worked on
 *   task-done <task_id> <commit_sha>        — Mark task complete
 *   story-done <story_id>                   — Mark story complete
 *   task-failed <task_id> <reason>          — Mark task as failed
 *   block-task <task_id> <reason>           — Block pipeline (human needed)
 *   unblock-task <directive>                — Resume after human unblock
 *   set-pr <pr_number>                      — Record PR number
 *   complete                                — Pipeline finished, reset to idle
 *   skip-task                               — Skip current task
 *   status                                  — Print current state summary
 *   reset                                   — Force reset to idle
 *
 * Parallel Actions (v3):
 *   set-mode <sequential|parallel>          — Switch execution mode
 *   set-dependency-graph <json_file>        — Load task DAG from file
 *   next-tasks                              — List tasks ready to execute
 *   start-track <track_id> <task_id> <story_id> — Allocate task to track
 *   track-advance <track_id> <next_phase>   — Per-track phase transition
 *   track-gate-pass <track_id> <gate>       — Per-track gate pass
 *   track-gate-fail <track_id> <gate> <reason> — Per-track gate fail
 *   track-done <track_id> <commit_sha>      — Mark track complete
 *   track-failed <track_id> <reason>        — Mark track failed
 *   tracks-status                           — Show all tracks
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), '.claude/pipeline-state.json');
const AUDIT_FILE = path.join(process.cwd(), '.claude/pipeline-audit.jsonl');

// Valid phase transitions (sequential mode)
const VALID_TRANSITIONS = {
  'idle':                  ['phase0_mcp'],
  'phase0_mcp':            ['phase1_discovery'],
  'phase1_discovery':      ['phase1.5_coverage'],
  'phase1.5_coverage':     ['phase2_task_coder', 'phase2_parallel'],
  'phase2_task_coder':     ['phase2_task_tester', 'phase_blocked'],
  'phase2_task_tester':    ['phase2_task_reviewer', 'phase2_task_coder'],
  'phase2_task_reviewer':  ['phase2_task_commit', 'phase2_task_coder'],
  'phase2_task_commit':    ['phase2_task_coder', 'phase3_integration'],
  'phase2_parallel':       ['phase3_integration', 'phase_blocked'],
  'phase3_integration':    ['phase4_auditor'],
  'phase4_auditor':        ['phase5_pr', 'phase2_task_coder', 'phase_blocked'],
  'phase5_pr':             ['phase6_reconcile'],
  'phase6_reconcile':      ['idle'],
  'phase_blocked':         ['phase2_task_coder', 'phase2_parallel', 'idle']
};

// Valid track phase transitions (parallel mode)
const TRACK_TRANSITIONS = {
  'phase2_track_active':     ['phase2_track_testing'],
  'phase2_track_testing':    ['phase2_track_reviewing', 'phase2_track_active'],
  'phase2_track_reviewing':  ['phase2_track_committing', 'phase2_track_active'],
  'phase2_track_committing': ['phase2_track_done'],
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
  const entry = { ts: new Date().toISOString(), action, ...details };
  fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
}

function resetGates() {
  return {
    mcp_health: null, hierarchy_discovery: null, plan_coverage: null,
    build: null, lint: null, test: null, typecheck: null,
    supabase_check: null, reviewer: null, smoke_test: null, auditor: null
  };
}

function resetTrackGates() {
  return { build: null, lint: null, test: null, typecheck: null, reviewer: null, testid_contract: null };
}

function getActiveTracks(state) {
  return Object.entries(state.tracks || {}).filter(([, t]) => t.status === 'active');
}

function getAssignedTaskIds(state) {
  return Object.values(state.tracks || {})
    .filter(t => t.status === 'active')
    .map(t => t.task_id);
}

// --- Sequential Actions (v2 compatible) ---

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
      process.exit(1);
    }
    const newState = {
      version: 3,
      status: 'active',
      mode: 'sequential',
      max_concurrency: 3,
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
      tracks: {},
      dependency_graph: {},
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
    if (!state.tasks_done.includes(taskId)) state.tasks_done.push(taskId);
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
    if (!state.stories_done.includes(storyId)) state.stories_done.push(storyId);
    state.current_story = null;
    writeState(state);
    audit('story-done', { storyId, unit: state.unit });
    console.log(`Story DONE: ${storyId} (${state.stories_done.length} stories complete)`);
  },

  'task-failed': (args) => {
    const [taskId, ...reasonParts] = args;
    const reason = reasonParts.join(' ');
    const state = readState();
    if (!state.tasks_failed.includes(taskId)) state.tasks_failed.push(taskId);
    state.current_task = null;
    writeState(state);
    audit('task-failed', { taskId, reason, unit: state.unit });
    console.log(`Task FAILED: ${taskId} — ${reason}`);
  },

  'block-task': (args) => {
    const [taskId, ...reasonParts] = args;
    const reason = reasonParts.join(' ');
    if (!taskId) { console.error('Usage: block-task <task_id> <reason>'); process.exit(1); }
    const state = readState();
    if (!state || state.phase === 'idle') { console.error('ERROR: No active pipeline to block.'); process.exit(1); }
    state.phase = 'phase_blocked';
    state.blocked_reason = reason;
    state.blocked_at = new Date().toISOString();
    writeState(state);
    const notif = { task: taskId, unit: state.unit, branch: state.branch, reason, timestamp: state.blocked_at, gates: state.gates, attempt: state.attempt, tasks_done: state.tasks_done, tasks_failed: state.tasks_failed };
    fs.writeFileSync(path.join(process.cwd(), '.claude/blocked-notification.json'), JSON.stringify(notif, null, 2));
    audit('block-task', { taskId, reason, unit: state.unit });
    console.log(`PIPELINE BLOCKED: ${taskId} — ${reason}`);
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
    state.phase = state.mode === 'parallel' ? 'phase2_parallel' : 'phase2_task_coder';
    state.blocked_reason = null;
    state.blocked_at = null;
    state.attempt = 0;
    state.human_directive = directive || null;
    state.gates.build = null;
    state.gates.lint = null;
    state.gates.test = null;
    state.gates.typecheck = null;
    state.gates.supabase_check = null;
    state.gates.reviewer = null;
    writeState(state);
    audit('unblock-task', { directive, previousReason: oldReason, unit: state.unit });
    console.log(`PIPELINE UNBLOCKED — resuming ${state.phase}`);
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
    const summary = { unit: state.unit, tasks_done: state.tasks_done.length, tasks_failed: state.tasks_failed.length, stories_done: state.stories_done.length, pr: state.pr_number, mode: state.mode, duration_ms: Date.now() - new Date(state.started_at).getTime() };
    audit('complete', summary);
    const idle = {
      version: 3, status: 'idle', mode: 'sequential', max_concurrency: 3,
      unit: null, epic_id: null, branch: null, phase: 'idle', phase_index: 0,
      current_story: null, current_task: null, attempt: 0, max_attempts: 3,
      gates: resetGates(), tracks: {}, dependency_graph: {},
      stories_done: [], tasks_done: [], tasks_failed: [],
      started_at: null, updated_at: new Date().toISOString(), last_commit: null, pr_number: null
    };
    writeState(idle);
    console.log(`Pipeline COMPLETE: ${summary.unit} (${summary.mode} mode)`);
    console.log(`  Tasks: ${summary.tasks_done} done, ${summary.tasks_failed} failed`);
    console.log(`  Stories: ${summary.stories_done} done`);
    console.log(`  PR: #${summary.pr || 'none'}`);
  },

  'skip-task': () => {
    const state = readState();
    if (state.current_task) {
      if (!state.tasks_failed.includes(state.current_task)) state.tasks_failed.push(state.current_task);
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
    console.log(`  Mode:    ${state.mode || 'sequential'} (max ${state.max_concurrency || 3} concurrent)`);
    console.log(`  Phase:   ${state.phase} (step ${state.phase_index})`);
    if (state.mode !== 'parallel') {
      console.log(`  Story:   ${state.current_story || 'none'}`);
      console.log(`  Task:    ${state.current_task || 'none'} (attempt ${state.attempt}/${state.max_attempts})`);
    }
    console.log(`  Gates:`);
    for (const [k, v] of Object.entries(state.gates)) {
      const icon = v === 'pass' ? '✓' : v === 'fail' ? '✗' : '·';
      console.log(`    ${icon} ${k}: ${v || 'pending'}`);
    }
    // Show tracks in parallel mode
    const activeTracks = getActiveTracks(state);
    if (activeTracks.length > 0) {
      console.log(`  Tracks (${activeTracks.length} active):`);
      for (const [id, t] of activeTracks) {
        const gateStr = Object.entries(t.gates).map(([k, v]) => `${k}:${v || '...'}`).join(' ');
        console.log(`    ${id}: ${t.task_id} [${t.phase}] attempt ${t.attempt}/3 — ${gateStr}`);
      }
    }
    // Show ready tasks if DAG loaded
    if (Object.keys(state.dependency_graph || {}).length > 0) {
      const ready = getReadyTasks(state);
      if (ready.length > 0) {
        console.log(`  Ready:   [${ready.join(', ')}] (${ready.length} tasks waiting)`);
      }
    }
    console.log(`  Done:    ${state.tasks_done.length} tasks, ${state.stories_done.length} stories`);
    console.log(`  Failed:  ${state.tasks_failed.length} tasks`);
    console.log(`  Started: ${state.started_at}`);
  },

  'reset': () => {
    const state = readState();
    if (state && state.phase !== 'idle') {
      audit('reset', { unit: state.unit, phase: state.phase, reason: 'manual reset' });
    }
    const idle = {
      version: 3, status: 'idle', mode: 'sequential', max_concurrency: 3,
      unit: null, epic_id: null, branch: null, phase: 'idle', phase_index: 0,
      current_story: null, current_task: null, attempt: 0, max_attempts: 3,
      gates: resetGates(), tracks: {}, dependency_graph: {},
      stories_done: [], tasks_done: [], tasks_failed: [],
      started_at: null, updated_at: new Date().toISOString(), last_commit: null, pr_number: null
    };
    writeState(idle);
    console.log('Pipeline RESET to idle');
  },

  // --- Parallel Actions (v3) ---

  'set-mode': (args) => {
    const [mode] = args;
    if (!['sequential', 'parallel'].includes(mode)) {
      console.error('Usage: set-mode <sequential|parallel>');
      process.exit(1);
    }
    const state = readState();
    if (!state || state.phase === 'idle') {
      console.error('ERROR: No active pipeline. Run start-unit first.');
      process.exit(1);
    }
    // Only allow mode change early in the pipeline
    const earlyPhases = ['phase0_mcp', 'phase1_discovery', 'phase1.5_coverage'];
    if (!earlyPhases.includes(state.phase)) {
      console.error(`ERROR: Can only change mode in early phases (${earlyPhases.join(', ')}). Current: ${state.phase}`);
      process.exit(1);
    }
    state.mode = mode;
    writeState(state);
    audit('set-mode', { mode, unit: state.unit });
    console.log(`Mode set to: ${mode}`);
  },

  'set-dependency-graph': (args) => {
    const [filePath] = args;
    if (!filePath) {
      console.error('Usage: set-dependency-graph <json_file_path>');
      process.exit(1);
    }
    const state = readState();
    if (!state || state.phase === 'idle') {
      console.error('ERROR: No active pipeline.');
      process.exit(1);
    }
    let dag;
    try {
      dag = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`ERROR: Cannot read DAG from ${filePath}: ${err.message}`);
      process.exit(1);
    }
    // Validate DAG structure: { "TASK-ID": ["DEP-1", "DEP-2"], ... }
    for (const [taskId, deps] of Object.entries(dag)) {
      if (!Array.isArray(deps)) {
        console.error(`ERROR: Invalid DAG — value for "${taskId}" must be an array`);
        process.exit(1);
      }
    }
    state.dependency_graph = dag;
    writeState(state);
    const totalTasks = Object.keys(dag).length;
    const independent = Object.entries(dag).filter(([, deps]) => deps.length === 0).length;
    audit('set-dependency-graph', { totalTasks, independent, unit: state.unit });
    console.log(`Dependency graph loaded: ${totalTasks} tasks, ${independent} independent (can start immediately)`);
  },

  'next-tasks': () => {
    const state = readState();
    if (!state || state.phase === 'idle') {
      console.log('[]');
      return;
    }
    const ready = getReadyTasks(state);
    console.log(JSON.stringify(ready));
  },

  'start-track': (args) => {
    const [trackId, taskId, storyId] = args;
    if (!trackId || !taskId || !storyId) {
      console.error('Usage: start-track <track_id> <task_id> <story_id>');
      process.exit(1);
    }
    const state = readState();
    if (state.mode !== 'parallel') {
      console.error('ERROR: start-track requires parallel mode. Run: set-mode parallel');
      process.exit(1);
    }
    // Validate track not already active
    if (state.tracks[trackId] && state.tracks[trackId].status === 'active') {
      console.error(`ERROR: Track ${trackId} is already active with task ${state.tracks[trackId].task_id}`);
      process.exit(1);
    }
    // Validate concurrency limit
    const activeTracks = getActiveTracks(state);
    if (activeTracks.length >= (state.max_concurrency || 3)) {
      console.error(`ERROR: Max concurrency reached (${activeTracks.length}/${state.max_concurrency || 3})`);
      process.exit(1);
    }
    // Create track entry
    state.tracks[trackId] = {
      task_id: taskId,
      story_id: storyId,
      phase: 'phase2_track_active',
      worktree_branch: `symphony/${trackId}-${taskId}`,
      attempt: 0,
      gates: resetTrackGates(),
      status: 'active',
      started_at: new Date().toISOString()
    };
    // Ensure global phase is in parallel execution
    if (state.phase !== 'phase2_parallel') {
      state.phase = 'phase2_parallel';
    }
    writeState(state);
    audit('start-track', { trackId, taskId, storyId, unit: state.unit });
    console.log(`Track started: ${trackId} → ${taskId} (story: ${storyId})`);
    console.log(`  Branch: symphony/${trackId}-${taskId}`);
    console.log(`  Active tracks: ${getActiveTracks(state).length}/${state.max_concurrency || 3}`);
  },

  'track-advance': (args) => {
    const [trackId, nextPhase] = args;
    if (!trackId || !nextPhase) {
      console.error('Usage: track-advance <track_id> <next_phase>');
      process.exit(1);
    }
    const state = readState();
    const track = state.tracks?.[trackId];
    if (!track || track.status !== 'active') {
      console.error(`ERROR: Track ${trackId} not found or not active`);
      process.exit(1);
    }
    const valid = TRACK_TRANSITIONS[track.phase];
    if (!valid || !valid.includes(nextPhase)) {
      console.error(`ERROR: Invalid track transition ${track.phase} → ${nextPhase}`);
      console.error(`Valid: ${(valid || []).join(', ')}`);
      process.exit(1);
    }
    const oldPhase = track.phase;
    track.phase = nextPhase;
    writeState(state);
    audit('track-advance', { trackId, from: oldPhase, to: nextPhase, taskId: track.task_id, unit: state.unit });
    console.log(`Track ${trackId}: ${oldPhase} → ${nextPhase}`);
  },

  'track-gate-pass': (args) => {
    const [trackId, gate] = args;
    const state = readState();
    const track = state.tracks?.[trackId];
    if (!track) { console.error(`ERROR: Track ${trackId} not found`); process.exit(1); }
    if (!track.gates.hasOwnProperty(gate)) {
      console.error(`ERROR: Unknown gate '${gate}' for track. Valid: ${Object.keys(track.gates).join(', ')}`);
      process.exit(1);
    }
    track.gates[gate] = 'pass';
    writeState(state);
    audit('track-gate-pass', { trackId, gate, taskId: track.task_id, unit: state.unit });
    console.log(`Track ${trackId} gate PASSED: ${gate}`);
  },

  'track-gate-fail': (args) => {
    const [trackId, gate, ...reasonParts] = args;
    const reason = reasonParts.join(' ');
    const state = readState();
    const track = state.tracks?.[trackId];
    if (!track) { console.error(`ERROR: Track ${trackId} not found`); process.exit(1); }
    track.gates[gate] = 'fail';
    track.attempt++;
    writeState(state);
    audit('track-gate-fail', { trackId, gate, reason, attempt: track.attempt, taskId: track.task_id, unit: state.unit });
    console.log(`Track ${trackId} gate FAILED: ${gate} (attempt ${track.attempt}/3)`);
    if (track.attempt >= 3) {
      console.log(`Track ${trackId}: MAX ATTEMPTS — use track-failed or escalate`);
    }
  },

  'track-done': (args) => {
    const [trackId, commitSha] = args;
    const state = readState();
    const track = state.tracks?.[trackId];
    if (!track) { console.error(`ERROR: Track ${trackId} not found`); process.exit(1); }
    const taskId = track.task_id;
    track.status = 'done';
    track.completed_at = new Date().toISOString();
    if (!state.tasks_done.includes(taskId)) state.tasks_done.push(taskId);
    state.last_commit = commitSha || state.last_commit;
    writeState(state);
    audit('track-done', { trackId, taskId, commitSha, unit: state.unit, gates: { ...track.gates } });
    console.log(`Track ${trackId} DONE: ${taskId} (commit: ${commitSha || 'none'})`);
    console.log(`Progress: ${state.tasks_done.length} tasks done, ${state.tasks_failed.length} failed`);
  },

  'track-failed': (args) => {
    const [trackId, ...reasonParts] = args;
    const reason = reasonParts.join(' ');
    const state = readState();
    const track = state.tracks?.[trackId];
    if (!track) { console.error(`ERROR: Track ${trackId} not found`); process.exit(1); }
    const taskId = track.task_id;
    track.status = 'failed';
    if (!state.tasks_failed.includes(taskId)) state.tasks_failed.push(taskId);
    writeState(state);
    audit('track-failed', { trackId, taskId, reason, unit: state.unit });
    console.log(`Track ${trackId} FAILED: ${taskId} — ${reason}`);
  },

  'tracks-status': () => {
    const state = readState();
    if (!state || state.phase === 'idle') {
      console.log('Pipeline: IDLE');
      return;
    }
    const tracks = state.tracks || {};
    const active = Object.entries(tracks).filter(([, t]) => t.status === 'active');
    const done = Object.entries(tracks).filter(([, t]) => t.status === 'done');
    const failed = Object.entries(tracks).filter(([, t]) => t.status === 'failed');
    console.log(`Tracks: ${active.length} active, ${done.length} done, ${failed.length} failed`);
    for (const [id, t] of active) {
      const gateStr = Object.entries(t.gates).map(([k, v]) => `${k}:${v || '...'}`).join(' ');
      console.log(`  [ACTIVE] ${id}: ${t.task_id} [${t.phase}] attempt ${t.attempt}/3 — ${gateStr}`);
    }
    for (const [id, t] of done) {
      console.log(`  [DONE]   ${id}: ${t.task_id}`);
    }
    for (const [id, t] of failed) {
      console.log(`  [FAILED] ${id}: ${t.task_id}`);
    }
    const ready = getReadyTasks(state);
    if (ready.length > 0) {
      console.log(`  Ready to start: [${ready.join(', ')}]`);
    }
  },
};

// --- Helper: get tasks ready to execute ---
function getReadyTasks(state) {
  const dag = state.dependency_graph || {};
  const done = new Set(state.tasks_done || []);
  const failed = new Set(state.tasks_failed || []);
  const assigned = new Set(getAssignedTaskIds(state));
  const activeTracks = getActiveTracks(state);
  const maxSlots = (state.max_concurrency || 3) - activeTracks.length;

  const ready = [];
  for (const [taskId, deps] of Object.entries(dag)) {
    if (done.has(taskId) || failed.has(taskId) || assigned.has(taskId)) continue;
    if (deps.every(d => done.has(d))) {
      ready.push(taskId);
    }
  }
  return ready.slice(0, Math.max(0, maxSlots));
}

// --- Main ---
const [,, action, ...args] = process.argv;

if (!action || !actions[action]) {
  console.log('Pipeline State Machine v3 — Actions:');
  console.log('');
  console.log('  Sequential (v2 compatible):');
  console.log('    start-unit <unit> <epic_id> <branch>');
  console.log('    advance <phase>');
  console.log('    gate-pass <gate>    |  gate-fail <gate> <reason>');
  console.log('    set-task <task_id> [story_id]');
  console.log('    task-done <task_id> [commit_sha]');
  console.log('    story-done <story_id>');
  console.log('    task-failed <task_id> <reason>');
  console.log('    block-task <task_id> <reason>  |  unblock-task <directive>');
  console.log('    set-pr <pr_number>  |  complete  |  skip-task');
  console.log('    status  |  reset');
  console.log('');
  console.log('  Parallel (v3):');
  console.log('    set-mode <sequential|parallel>');
  console.log('    set-dependency-graph <json_file>');
  console.log('    next-tasks');
  console.log('    start-track <track_id> <task_id> <story_id>');
  console.log('    track-advance <track_id> <phase>');
  console.log('    track-gate-pass <track_id> <gate>');
  console.log('    track-gate-fail <track_id> <gate> <reason>');
  console.log('    track-done <track_id> [commit_sha]');
  console.log('    track-failed <track_id> <reason>');
  console.log('    tracks-status');
  process.exit(action ? 1 : 0);
}

actions[action](args);
