#!/usr/bin/env node
/**
 * TestID Contract Validator
 *
 * Validates consistency between:
 *   1. testid-contract.json (the registry / source of truth)
 *   2. Component files (*.tsx) — data-testid attributes
 *   3. E2E spec files (*.spec.ts, *.test.ts) — getByTestId calls
 *
 * Reports:
 *   ERROR:   Contract IDs missing from components
 *   ERROR:   Spec IDs missing from components
 *   ERROR:   Dynamic patterns used directly in specs
 *   WARNING: Component IDs not registered in contract
 *
 * Usage:
 *   node .claude/hooks/validate-testid-contract.js [--staged-only]
 *
 * Options:
 *   --staged-only   Only check staged files (for commit hooks)
 *
 * Exit codes:
 *   0 = no errors (warnings OK)
 *   1 = errors found
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONTRACT_FILE = path.join(process.cwd(), '.claude/hooks/testid-contract.json');
const stagedOnly = process.argv.includes('--staged-only');

// --- Read contract ---
let contract = {};
try {
  const raw = JSON.parse(fs.readFileSync(CONTRACT_FILE, 'utf8'));
  // Flatten contract: extract all testid keys (skip _schema)
  for (const [module, entries] of Object.entries(raw)) {
    if (module === '_schema') continue;
    for (const [testId, meta] of Object.entries(entries)) {
      contract[testId] = { module, ...meta };
    }
  }
} catch (err) {
  console.log('WARNING: No testid-contract.json found or invalid JSON. Skipping contract validation.');
  process.exit(0);
}

// If contract is empty (only _schema), skip
if (Object.keys(contract).length === 0) {
  console.log('TestID Contract: empty registry, skipping validation');
  process.exit(0);
}

// --- Collect files to scan ---
function getStagedFiles(pattern) {
  try {
    return execSync(`git diff --cached --name-only --diff-filter=ACM 2>/dev/null`, { encoding: 'utf8' })
      .trim().split('\n').filter(f => f && f.match(pattern));
  } catch { return []; }
}

function findFiles(pattern, searchPaths) {
  const files = [];
  for (const searchPath of searchPaths) {
    try {
      const result = execSync(
        `find ${searchPath} -name "${pattern}" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null`,
        { encoding: 'utf8' }
      ).trim();
      if (result) files.push(...result.split('\n'));
    } catch {}
  }
  return files;
}

let componentFiles, specFiles;

if (stagedOnly) {
  componentFiles = getStagedFiles(/\.tsx$/);
  specFiles = getStagedFiles(/\.(spec|test)\.(ts|tsx)$/);
} else {
  componentFiles = findFiles('*.tsx', ['apps/', 'src/', 'components/']);
  specFiles = findFiles('*.spec.ts', ['apps/', 'src/', 'e2e/']);
  specFiles.push(...findFiles('*.test.ts', ['apps/', 'src/', 'e2e/']));
}

// --- Extract testids from component files ---
const componentTestIds = new Set();
const testIdRegex = /data-testid=["'`]([^"'`$]+)/g;
const dynamicTestIdRegex = /data-testid=\{[`"']([^`"'$]+)/g;

for (const file of componentFiles) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    let match;

    // Static testids: data-testid="foo" or data-testid='foo'
    while ((match = testIdRegex.exec(content)) !== null) {
      componentTestIds.add(match[1]);
    }
    testIdRegex.lastIndex = 0;

    // Dynamic testids: data-testid={`prefix-${id}`} — extract the static prefix
    while ((match = dynamicTestIdRegex.exec(content)) !== null) {
      const prefix = match[1].split('$')[0].replace(/-$/, '');
      if (prefix) componentTestIds.add(prefix + '*'); // mark as dynamic with *
    }
    dynamicTestIdRegex.lastIndex = 0;
  } catch {}
}

// --- Extract testids from spec files ---
const specTestIds = new Map(); // testId -> [file:line, ...]
const getByTestIdRegex = /getByTestId\(\s*['"`]([^'"`$]+)/g;

for (const file of specFiles) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      let match;
      while ((match = getByTestIdRegex.exec(lines[i])) !== null) {
        const testId = match[1];
        if (!specTestIds.has(testId)) specTestIds.set(testId, []);
        specTestIds.get(testId).push(`${file}:${i + 1}`);
      }
      getByTestIdRegex.lastIndex = 0;
    }
  } catch {}
}

// --- Validate ---
const errors = [];
const warnings = [];

// 1. Contract IDs missing from components
for (const [testId, meta] of Object.entries(contract)) {
  if (meta.dynamic) {
    // For dynamic IDs, check that the prefix exists (with or without *)
    const prefix = testId;
    const found = componentTestIds.has(prefix) || componentTestIds.has(prefix + '*') ||
                  [...componentTestIds].some(id => id.startsWith(prefix));
    if (!found && componentFiles.length > 0) {
      warnings.push(`Contract ID "${testId}" (dynamic, module: ${meta.module}) not found in any component`);
    }
  } else {
    if (!componentTestIds.has(testId) && componentFiles.length > 0) {
      errors.push(`Contract ID "${testId}" (module: ${meta.module}, component: ${meta.component}) not found in any component file`);
    }
  }
}

// 2. Spec IDs missing from components
for (const [testId, locations] of specTestIds) {
  const found = componentTestIds.has(testId) ||
                componentTestIds.has(testId + '*') ||
                [...componentTestIds].some(id => id.replace('*', '') === testId);
  if (!found && componentFiles.length > 0) {
    const loc = locations.slice(0, 3).join(', ');
    errors.push(`Spec uses getByTestId("${testId}") but no component has data-testid="${testId}" — at ${loc}`);
  }
}

// 3. Dynamic patterns used directly in specs (e.g., getByTestId(`card-${id}`))
for (const file of specFiles) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/getByTestId\(\s*`[^`]*\$\{/)) {
        errors.push(`Dynamic template literal in getByTestId at ${file}:${i + 1} — use static prefix instead`);
      }
    }
  } catch {}
}

// 4. Component IDs not registered in contract
for (const testId of componentTestIds) {
  const cleanId = testId.replace('*', '');
  if (!contract[cleanId]) {
    warnings.push(`Component has data-testid="${cleanId}" but it's not registered in testid-contract.json`);
  }
}

// --- Report ---
if (errors.length === 0 && warnings.length === 0) {
  console.log(`TestID Contract: PASS (${Object.keys(contract).length} contract IDs, ${componentTestIds.size} component IDs, ${specTestIds.size} spec IDs)`);
  process.exit(0);
}

if (warnings.length > 0) {
  console.log(`\nTestID Contract WARNINGS (${warnings.length}):`);
  for (const w of warnings.slice(0, 10)) {
    console.log(`  WARNING: ${w}`);
  }
  if (warnings.length > 10) console.log(`  ... and ${warnings.length - 10} more`);
}

if (errors.length > 0) {
  console.log(`\nTestID Contract ERRORS (${errors.length}):`);
  for (const e of errors.slice(0, 10)) {
    console.log(`  ERROR: ${e}`);
  }
  if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  console.log(`\nFix errors before committing. Register new IDs in .claude/hooks/testid-contract.json`);
  process.exit(1);
}

// Warnings only — don't block
process.exit(0);
