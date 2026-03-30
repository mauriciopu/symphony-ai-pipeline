#!/usr/bin/env node
/**
 * AIDLC Linear Gate — PreToolUse hook for mcp__linear__save_issue
 *
 * Blocks direct Linear issue creation unless:
 *   1. The call is an UPDATE (has `id` field) — always allowed
 *   2. A valid AIDLC gate token exists (approved skill session)
 *
 * This ensures every new issue is created through the AIDLC methodology
 * (/create-unit-tasks or /create-all-tasks), which validates that a code
 * generation plan exists with full cold-start context.
 *
 * Exit 0 = allow, Exit 1 = block
 *
 * Matcher: mcp__linear__save_issue
 * Trigger: PreToolUse
 */

const fs = require('fs');
const path = require('path');

const CWD = process.cwd();
const TOKEN_FILE = path.join(CWD, '.claude', 'aidlc-gate-token.json');
const AUDIT_FILE = path.join(CWD, '.claude', 'pipeline-audit.jsonl');

// --- Helpers ---

function audit(decision, reason, title, hasToken) {
  const entry = {
    ts: new Date().toISOString(),
    action: 'aidlc-gate',
    decision,
    reason,
    title: title || '(unknown)',
    has_token: hasToken,
  };
  try {
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // Audit failure should not block the gate decision
  }
}

function readToken() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function isTokenValid(token) {
  if (!token || !token.created_at || !token.ttl_minutes) return false;
  const created = new Date(token.created_at).getTime();
  const expiry = created + token.ttl_minutes * 60000;
  return Date.now() < expiry;
}

function incrementTokenCounter() {
  try {
    const token = readToken();
    if (token) {
      token.issues_created = (token.issues_created || 0) + 1;
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
    }
  } catch {
    // Non-critical
  }
}

function blockMessage(title) {
  return `BLOCKED by AIDLC Gate: Direct Linear issue creation is not allowed.

  Attempted title: "${title || '(no title)'}"

All Linear issues must be created through the AIDLC methodology:
  /create-unit-tasks {unit-name}   — provision one unit
  /create-all-tasks                — provision all pending units

These skills validate that a code generation plan exists with:
  - Unit context, dependencies, TDD/BDD strategy
  - DDD model (aggregates, entities, events)
  - Generation steps with file paths
  - Design references (functional + NFR)

If you need to re-provision after plan changes:
  /create-unit-tasks {unit-name} --force

For manual override (temporary, 30-min TTL):
  node .claude/hooks/aidlc-gate-token-manager.js create manual manual-override`;
}

// --- Main ---

function main() {
  let input;
  try {
    const raw = process.argv[2] || '{}';
    input = JSON.parse(raw);
  } catch {
    // If we can't parse input, allow through
    audit('allow', 'unparseable-input', null, false);
    process.exit(0);
  }

  const title = input.title || input.name || '';

  // Gate 1: If `id` is present, this is an UPDATE — always allow
  if (input.id) {
    audit('allow', 'update', title, false);
    process.exit(0);
  }

  // Gate 2: No `id` — this is a CREATE. Check for valid token.
  const token = readToken();
  const tokenValid = isTokenValid(token);

  if (tokenValid) {
    incrementTokenCounter();
    audit('allow', `token:${token.skill}:${token.unit}`, title, true);
    process.exit(0);
  }

  // No valid token — BLOCK
  const reason = token ? 'token-expired' : 'no-token';
  audit('block', reason, title, false);
  console.log(blockMessage(title));
  process.exit(1);
}

main();
