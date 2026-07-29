/**
 * Run EVERY test in the client. Found by glob, never by a list.
 *
 * `npm test` used to be a hand-written chain of 32 `tsx` invocations joined by
 * `&&`. On 2026-07-28 there were 38 test files on disk, and the six that were
 * missing were the six added that same day — every fold-verb suite for `broke`
 * and `burn`, the Long Fry rules, the rack store, the snapshot. The script
 * would have exited 0 having run none of them.
 *
 * That is the failure mode a list always has: it drifts silently, and it drifts
 * fastest exactly when the most new code is landing. A glob cannot drift.
 *
 * Runs every file rather than stopping at the first failure, because when
 * something breaks you want the whole blast radius in one pass, not one name
 * per re-run.
 */
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// tsx's real JS entrypoint, run under node. NOT the `.bin` shim: that is a
// `.cmd` on Windows, and Node refuses to spawn one without `shell: true` —
// which then fails EVERY suite at once while printing nothing, because the
// failure is in the launch rather than the test. A `.mjs` needs no shell and
// behaves the same on every platform.
const TSX = join('node_modules', 'tsx', 'dist', 'cli.mjs');
if (!existsSync(TSX)) {
  console.error(`test-all: ${TSX} not found — run npm install`);
  process.exit(1);
}

const DIRS = ['src/lib', 'src'];
const files = [...new Set(
  DIRS.flatMap((dir) => {
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))
        .map((f) => join(dir, f));
    } catch { return []; }
  })
)].sort();

if (files.length === 0) {
  console.error('test-all: no test files found — that is itself a failure');
  process.exit(1);
}

console.log(`running ${files.length} suites\n`);
const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [TSX, f], { stdio: 'pipe', encoding: 'utf8' });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  // A suite passes only if it EXITED 0. Never scrape stdout for a happy word:
  // a suite that dies before printing anything would look identical to silence.
  const ok = r.status === 0;
  if (ok) {
    console.log(`  ok    ${f}`);
  } else {
    failed.push(f);
    console.log(`  FAIL  ${f}${r.error ? `  (could not launch: ${r.error.message})` : ''}`);
    console.log(out.split('\n').filter((l) => /FAIL|error|Error/.test(l)).slice(0, 6).map((l) => `        ${l}`).join('\n'));
  }
}

console.log('');
if (failed.length > 0) {
  console.error(`${failed.length}/${files.length} suites failed:\n${failed.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`all ${files.length} suites passed`);
