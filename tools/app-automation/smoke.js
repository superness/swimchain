#!/usr/bin/env node
// Acceptance check: node up -> open forum -> see it -> read logs -> switch
// to chat -> see it -> tear down. Run: node tools/app-automation/smoke.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const CLI = path.join(__dirname, 'cli.js');

function run(...cliArgs) {
  console.log(`\n$ swim-auto ${cliArgs.join(' ')}`);
  const out = execFileSync(process.execPath, [CLI, ...cliArgs], { encoding: 'utf8', timeout: 120000 });
  process.stdout.write(out);
  return out.trim();
}

function lastLine(s) {
  const lines = s.split('\n').filter(Boolean);
  return lines[lines.length - 1];
}

try {
  run('node', 'start'); // daemon-control waits for RPC health itself

  run('open', 'forum');
  run('wait', '#root');

  const shot1 = lastLine(run('screenshot'));
  assert.ok(fs.existsSync(shot1), `screenshot missing: ${shot1}`);
  assert.ok(fs.statSync(shot1).size > 5000, 'screenshot suspiciously small');

  const logs = run('logs', '--tail=50');
  assert.notStrictEqual(logs, '(no log entries)', 'expected console output from the forum client');

  const snapshot = run('ui');
  assert.ok(snapshot.length > 0, 'expected a non-empty ARIA snapshot');

  const chatStatus = run('open', 'chat');
  assert.ok(chatStatus.includes('chat-client'), `expected chat-client URL, got: ${chatStatus}`);
  const shot2 = lastLine(run('screenshot'));
  assert.ok(fs.existsSync(shot2), `screenshot missing: ${shot2}`);

  console.log('\nSMOKE OK');
} finally {
  try {
    run('stop');
  } catch {}
}
