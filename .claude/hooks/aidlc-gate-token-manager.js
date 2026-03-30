#!/usr/bin/env node
/**
 * AIDLC Gate Token Manager
 *
 * Manages session tokens that authorize approved skills (/create-unit-tasks,
 * /create-all-tasks) to create Linear issues through the AIDLC gate hook.
 *
 * Usage:
 *   node .claude/hooks/aidlc-gate-token-manager.js create <unit-name> <skill-name>
 *   node .claude/hooks/aidlc-gate-token-manager.js revoke
 *   node .claude/hooks/aidlc-gate-token-manager.js validate
 *   node .claude/hooks/aidlc-gate-token-manager.js status
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_FILE = path.join(process.cwd(), '.claude', 'aidlc-gate-token.json');
const TTL_MINUTES = 30;

function createToken(unitName, skillName) {
  const token = {
    skill: skillName,
    unit: unitName,
    created_at: new Date().toISOString(),
    ttl_minutes: TTL_MINUTES,
    session_id: crypto.randomBytes(8).toString('hex'),
    issues_created: 0,
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
  console.log(`AIDLC gate token created for ${unitName} (skill: ${skillName})`);
  console.log(`  Session: ${token.session_id}`);
  console.log(`  Expires: ${new Date(Date.now() + TTL_MINUTES * 60000).toISOString()}`);
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

function revokeToken() {
  try {
    const token = readToken();
    fs.unlinkSync(TOKEN_FILE);
    if (token) {
      console.log(`AIDLC gate token revoked (session: ${token.session_id}, issues created: ${token.issues_created})`);
    } else {
      console.log('AIDLC gate token revoked (no active token found)');
    }
  } catch {
    console.log('No active AIDLC gate token to revoke');
  }
}

function validateToken() {
  const token = readToken();
  if (!token) { console.log('No token file found'); process.exit(1); }
  if (!isTokenValid(token)) {
    console.log(`Token expired (created: ${token.created_at}, TTL: ${token.ttl_minutes}min)`);
    process.exit(1);
  }
  console.log('Token is valid');
  process.exit(0);
}

function showStatus() {
  const token = readToken();
  if (!token) { console.log('No active AIDLC gate token'); return; }
  const valid = isTokenValid(token);
  const created = new Date(token.created_at);
  const expiry = new Date(created.getTime() + token.ttl_minutes * 60000);

  console.log(`AIDLC Gate Token Status`);
  console.log(`  Skill:          ${token.skill}`);
  console.log(`  Unit:           ${token.unit}`);
  console.log(`  Session:        ${token.session_id}`);
  console.log(`  Created:        ${token.created_at}`);
  console.log(`  Expires:        ${expiry.toISOString()}`);
  console.log(`  Valid:           ${valid ? 'YES' : 'EXPIRED'}`);
  console.log(`  Issues created: ${token.issues_created}`);
}

// --- Main ---
const [action, ...args] = process.argv.slice(2);

switch (action) {
  case 'create': {
    const [unitName, skillName] = args;
    if (!unitName || !skillName) {
      console.error('Usage: create <unit-name> <skill-name>');
      process.exit(1);
    }
    createToken(unitName, skillName);
    break;
  }
  case 'revoke':
    revokeToken();
    break;
  case 'validate':
    validateToken();
    break;
  case 'status':
    showStatus();
    break;
  default:
    console.error('Usage: node aidlc-gate-token-manager.js <create|revoke|validate|status> [args]');
    process.exit(1);
}
