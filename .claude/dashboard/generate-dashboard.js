#!/usr/bin/env node
// generate-dashboard.js — Reads pipeline-status.json + pipeline-state.json + audit log
// Generates self-contained monitor.html with full pipeline visibility.
// No dependencies. Pure Node.js.

const fs = require('fs');
const path = require('path');

const DASHBOARD_DIR = __dirname;
const CLAUDE_DIR = path.join(DASHBOARD_DIR, '..');
const STATUS_FILE = path.join(DASHBOARD_DIR, 'pipeline-status.json');
const STATE_FILE = path.join(CLAUDE_DIR, 'pipeline-state.json');
const AUDIT_FILE = path.join(CLAUDE_DIR, 'pipeline-audit.jsonl');
const OUTPUT_FILE = path.join(DASHBOARD_DIR, 'monitor.html');

// Read telemetry
let telemetry;
try {
  telemetry = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
} catch {
  telemetry = { heartbeat: null, currentPhase: { phase: 'Idle' }, pipelineProgress: {}, recentToolCalls: [], agentHistory: [] };
}

// Read pipeline state machine
let pipelineState;
try {
  pipelineState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch {
  pipelineState = { phase: 'idle', gates: {}, tasks_done: [], tasks_failed: [], stories_done: [] };
}

// Read last 30 audit entries
let auditEntries = [];
try {
  const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
  auditEntries = lines.slice(-30).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
} catch {}

const testExecution = telemetry.testExecution || null;
const now = new Date().toISOString();
const dataJson = JSON.stringify({
  telemetry,
  pipeline: pipelineState,
  audit: auditEntries,
  e2e: testExecution
});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="5">
<title>Symphony — Pipeline Monitor</title>
<style>
  :root {
    --bg: #0a0a14; --card: #12122a; --card-border: #1e1e3a;
    --text: #c8c8d8; --text-dim: #666680; --text-bright: #ffffff;
    --green: #00e676; --green-dim: #1a3a2a;
    --yellow: #ffab00; --red: #ff5252; --red-dim: #3a1a1a;
    --blue: #448aff; --blue-dim: #1a2a3a;
    --purple: #b388ff; --cyan: #18ffff;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; font-size: 13px; padding: 20px; }
  code, .mono { font-family: 'Cascadia Code', 'Fira Code', monospace; }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: var(--card); border-radius: 12px; margin-bottom: 20px; border: 1px solid var(--card-border); }
  .logo { font-size: 18px; font-weight: 700; color: var(--text-bright); }
  .logo span { color: var(--green); }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 18px; }
  .card h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-dim); margin-bottom: 14px; }
  .stat { font-size: 32px; font-weight: 700; color: var(--text-bright); }
  .stat-label { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
  .stat-row { display: flex; gap: 24px; }
  .phase-flow { display: flex; gap: 3px; align-items: center; flex-wrap: wrap; }
  .phase-chip { padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; font-family: monospace; }
  .phase-chip.done { background: var(--green-dim); color: var(--green); }
  .phase-chip.active { background: var(--green); color: #000; box-shadow: 0 0 12px rgba(0,230,118,0.3); }
  .phase-chip.pending { background: #1a1a2a; color: #444; }
  .phase-arrow { color: #333; font-size: 10px; }
  .gate-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .gate { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 6px; background: #0e0e1e; font-size: 12px; font-family: monospace; }
  .gate.pass { border-left: 3px solid var(--green); }
  .gate.fail { border-left: 3px solid var(--red); }
  .gate.pending { border-left: 3px solid #333; }
  .ctx-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #151530; }
  .ctx-label { color: var(--text-dim); font-size: 12px; }
  .ctx-value { color: var(--text-bright); font-weight: 600; font-size: 12px; font-family: monospace; }
  .audit-entry { display: flex; gap: 8px; padding: 5px 0; border-bottom: 1px solid #0e0e1e; font-size: 11px; font-family: monospace; }
  .audit-time { color: var(--text-dim); min-width: 60px; }
  .audit-action { font-weight: 700; min-width: 90px; }
  .activity-table { width: 100%; border-collapse: collapse; }
  .activity-table th { text-align: left; font-size: 10px; color: var(--text-dim); padding: 6px 10px; border-bottom: 1px solid var(--card-border); }
  .activity-table td { padding: 6px 10px; border-bottom: 1px solid #0e0e1e; font-size: 12px; }
  .tool-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; font-family: monospace; }
  .footer { color: #333; font-size: 10px; text-align: center; margin-top: 16px; }
</style>
</head>
<body>
<script>
const D = ${dataJson};
const T = D.telemetry;
const P = D.pipeline;
const A = D.audit;
const NOW = new Date('${now}');

function timeAgo(s) {
  if (!s) return '—';
  const d = Math.floor((NOW - new Date(s)) / 1000);
  if (d < 5) return 'now';
  if (d < 60) return d + 's';
  if (d < 3600) return Math.floor(d/60) + 'm';
  return Math.floor(d/3600) + 'h ' + Math.floor((d%3600)/60) + 'm';
}

const PHASES = [
  { id: 'idle', label: 'IDLE' }, { id: 'phase0_mcp', label: 'MCP' },
  { id: 'phase1_discovery', label: 'DISCOVERY' }, { id: 'phase1.5_coverage', label: 'COVERAGE' },
  { id: 'phase2_task_coder', label: 'CODER' }, { id: 'phase2_task_tester', label: 'TESTER' },
  { id: 'phase2_task_reviewer', label: 'REVIEWER' }, { id: 'phase2_task_commit', label: 'COMMIT' },
  { id: 'phase3_integration', label: 'INTEGRATION' }, { id: 'phase4_auditor', label: 'AUDITOR' },
  { id: 'phase5_pr', label: 'PR' }, { id: 'phase6_reconcile', label: 'RECONCILE' },
];
const phaseIdx = PHASES.findIndex(p => p.id === P.phase);
const isActive = P.phase && P.phase !== 'idle';
const gateEntries = Object.entries(P.gates || {});
const gatesPassed = gateEntries.filter(([,v]) => v === 'pass').length;
const gatesFailed = gateEntries.filter(([,v]) => v === 'fail').length;

document.body.innerHTML = \`
<div class="header">
  <div class="logo">Symphony <span>Pipeline</span></div>
  <div style="color:var(--text-dim);font-size:11px;font-family:monospace">Monitor v2 &mdash; \${timeAgo(T.heartbeat)}</div>
</div>
<div class="grid">
  <div class="card"><h2>Pipeline</h2><div class="stat">\${isActive ? P.phase.replace('phase2_task_','').replace('phase','P').toUpperCase() : 'IDLE'}</div><div class="stat-label">\${isActive ? P.unit + ' on ' + (P.branch||'—') : 'No active unit'}</div></div>
  <div class="card"><h2>Quality Gates</h2><div class="stat-row"><div><div class="stat" style="color:var(--green)">\${gatesPassed}</div><div class="stat-label">Passed</div></div><div><div class="stat" style="color:var(--red)">\${gatesFailed}</div><div class="stat-label">Failed</div></div></div></div>
  <div class="card"><h2>Progress</h2><div class="stat-row"><div><div class="stat" style="color:var(--green)">\${(P.tasks_done||[]).length}</div><div class="stat-label">Tasks Done</div></div><div><div class="stat" style="color:var(--red)">\${(P.tasks_failed||[]).length}</div><div class="stat-label">Failed</div></div></div></div>
</div>
<div class="card" style="margin-bottom:16px"><h2>Phase Flow</h2><div class="phase-flow">\${PHASES.map((p,i) => {
  let cls = i === phaseIdx ? 'active' : (phaseIdx > 0 && i < phaseIdx) ? 'done' : 'pending';
  return '<span class="phase-chip '+cls+'">'+p.label+'</span>' + (i < PHASES.length-1 ? '<span class="phase-arrow">&rarr;</span>' : '');
}).join('')}</div></div>
<div class="grid-2">
  <div class="card"><h2>Gates</h2><div class="gate-grid">\${gateEntries.map(([k,v]) => '<div class="gate '+(v||'pending')+'"><span>'+(v==='pass'?'\\u2713':v==='fail'?'\\u2717':'\\u25CB')+'</span><span>'+k+'</span><span style="font-size:10px">'+(v||'pending')+'</span></div>').join('')}</div></div>
  <div class="card"><h2>Context</h2>
    <div class="ctx-row"><span class="ctx-label">Unit</span><span class="ctx-value">\${P.unit||'—'}</span></div>
    <div class="ctx-row"><span class="ctx-label">Branch</span><span class="ctx-value">\${P.branch||'—'}</span></div>
    <div class="ctx-row"><span class="ctx-label">Task</span><span class="ctx-value">\${P.current_task||'—'}</span></div>
    <div class="ctx-row"><span class="ctx-label">PR</span><span class="ctx-value">\${P.pr_number?'#'+P.pr_number:'—'}</span></div>
  </div>
</div>
<div class="grid-2" style="margin-top:16px">
  <div class="card"><h2>Audit Log</h2><div style="max-height:300px;overflow-y:auto">\${A.length ? A.slice().reverse().slice(0,15).map(e => '<div class="audit-entry"><span class="audit-time">'+(e.ts?new Date(e.ts).toLocaleTimeString('en',{hour12:false}):'')+'</span><span class="audit-action">'+e.action+'</span><span style="color:var(--text-dim)">'+(e.from&&e.to?e.from+' → '+e.to:e.gate||e.taskId||e.unit||'')+'</span></div>').join('') : '<div style="color:#333;text-align:center;padding:20px">No entries</div>'}</div></div>
  <div class="card"><h2>Recent Activity</h2><div style="max-height:300px;overflow-y:auto"><table class="activity-table"><thead><tr><th>Time</th><th>Tool</th><th>Detail</th></tr></thead><tbody>\${(T.recentToolCalls||[]).slice(0,15).map(tc => '<tr><td style="color:var(--text-dim);font-family:monospace;font-size:11px">'+new Date(tc.timestamp).toLocaleTimeString('en',{hour12:false})+'</td><td><span class="tool-badge">'+tc.tool+'</span></td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(tc.summary||'').substring(0,60)+'</td></tr>').join('')}</tbody></table></div></div>
</div>
<div class="footer">SYMPHONY PIPELINE MONITOR &bull; Generated \${NOW.toLocaleString()} &bull; Auto-refresh 5s</div>
\`;
</script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_FILE, html, 'utf8');
