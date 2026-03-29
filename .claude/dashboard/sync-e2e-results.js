#!/usr/bin/env node
/**
 * sync-e2e-results.js — Parses Playwright/Jest/Vitest JSON results
 * and writes to pipeline-status.json for dashboard display.
 *
 * Usage:
 *   node .claude/dashboard/sync-e2e-results.js [path-to-results.json]
 *
 * Supports Playwright JSON reporter format.
 * Customize the parser below for other test frameworks.
 */

const fs = require('fs');
const path = require('path');

const RESULTS_FILE = process.argv[2] || path.join(process.cwd(), 'test-results/results.json');
const STATUS_FILE = path.join(process.cwd(), '.claude/dashboard/pipeline-status.json');
const DASHBOARD_GEN = path.join(process.cwd(), '.claude/dashboard/generate-dashboard.js');

let results;
try {
  results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
} catch (err) {
  console.error('No test results found at:', RESULTS_FILE);
  process.exit(1);
}

const suites = results.suites || [];
const specFiles = [];
const failures = [];
let totalTests = 0, passedTests = 0, failedTests = 0, skippedTests = 0, totalDuration = 0;
const projectStats = {};

function processSuite(suite, filePath) {
  for (const spec of (suite.specs || [])) {
    for (const test of (spec.tests || [])) {
      totalTests++;
      const projectName = test.projectName || 'default';
      if (!projectStats[projectName]) projectStats[projectName] = { passed: 0, failed: 0, skipped: 0 };

      const lastResult = (test.results || [])[test.results.length - 1];
      totalDuration += lastResult?.duration || 0;

      if (test.status === 'expected' || test.status === 'passed') {
        passedTests++;
        projectStats[projectName].passed++;
      } else if (test.status === 'skipped') {
        skippedTests++;
        projectStats[projectName].skipped++;
      } else {
        failedTests++;
        projectStats[projectName].failed++;
        const errorMsg = lastResult?.error?.message || 'Unknown error';
        failures.push({
          name: spec.title || 'unknown',
          file: path.basename(filePath || suite.title || ''),
          line: spec.line || 0,
          error: errorMsg.split('\n').slice(0, 3).join('\n').substring(0, 200),
          project: projectName,
          retries: (test.results || []).length - 1
        });
      }
    }
  }
  for (const child of (suite.suites || [])) processSuite(child, filePath || suite.file);
}

for (const suite of suites) {
  const filePath = suite.file || suite.title || '';
  let fileTotal = 0, filePassed = 0;
  function countInSuite(s) {
    for (const spec of (s.specs || [])) {
      for (const test of (spec.tests || [])) {
        fileTotal++;
        if (test.status === 'expected' || test.status === 'passed') filePassed++;
      }
    }
    for (const child of (s.suites || [])) countInSuite(child);
  }
  countInSuite(suite);
  specFiles.push({
    name: path.basename(filePath),
    tests: fileTotal,
    passed: filePassed,
    passRate: fileTotal > 0 ? Math.round((filePassed / fileTotal) * 100) : 0
  });
  processSuite(suite, filePath);
}

const testExecution = {
  lastRunTimestamp: new Date().toISOString(),
  status: failedTests > 0 ? 'failed' : passedTests > 0 ? 'passed' : 'idle',
  totalTests, passedTests, failedTests, skippedTests,
  passRate: totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0,
  duration: totalDuration,
  durationFormatted: totalDuration > 60000
    ? Math.floor(totalDuration / 60000) + 'm ' + Math.round((totalDuration % 60000) / 1000) + 's'
    : Math.round(totalDuration / 1000) + 's',
  projects: projectStats,
  specFiles: specFiles.sort((a, b) => a.passRate - b.passRate),
  failures: failures.slice(0, 10)
};

let status;
try { status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { status = {}; }
status.testExecution = testExecution;
fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));

try { require(DASHBOARD_GEN); } catch {}

console.log(`E2E Results synced: ${totalTests} total | ${passedTests} passed | ${failedTests} failed | ${testExecution.passRate}%`);
