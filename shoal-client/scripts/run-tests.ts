/**
 * The Shoal — the test runner. `npm test` is this.
 *
 * ## WHY THIS EXISTS, AND WHAT IT REPLACES
 *
 * `npm test` was one long `&&` chain: two `tsc --noEmit` runs followed by
 * thirty-six `tsx …test.ts` invocations, joined so that the first non-zero exit
 * stopped everything after it.
 *
 * That is the wrong failure mode for a suite, and the whole-branch review
 * measured the cost. One flaky check in `chainSea.test.ts` failed two of three
 * clean runs, and because it sat two thirds of the way down the chain it
 * **aborted six later files — 354 of 2277 checks never ran at all.** A green run
 * and a red run were not "the same suite, one bug apart"; the red run was a
 * different, smaller suite, and nothing said so. A flake that quietly removes a
 * sixth of the coverage is worse than the flake.
 *
 * So: every file runs, always, and the summary says what happened to each. The
 * exit code is unchanged in meaning — non-zero if anything failed — and the
 * per-file output is unchanged too, because stdio is inherited rather than
 * captured. `grep -c '^  ok  '` over a run still counts what it counted before.
 *
 * ## THE TYPECHECKS RUN FIRST BUT DO NOT GATE
 *
 * `tsx` transpiles without typechecking, so a type error does not stop the
 * tests from being meaningful — and a type error hiding two thousand behavioural
 * checks is the same mistake as the flake above, one layer up. Both `tsc`
 * projects run, both are reported, and neither aborts the run.
 *
 * ## THE FILE LIST IS DISCOVERED, NOT TYPED
 *
 * The old chain named every file by hand, so a new test file was only in the
 * suite if somebody remembered to add it — `water.test.ts` had to be, on this
 * branch. This walks `src/` for `*.test.ts` instead, which cannot go stale.
 *
 * A DISCOVERED LIST NEEDS A FLOOR, or a broken walk reports "0 failures" and
 * looks exactly like a pass. `MIN_TEST_FILES` is that floor and this refuses to
 * run below it.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Fewer files than this means the walk is broken, not that the suite shrank.
 * Deliberately well below the real count (36 at the time of writing) so an
 * ordinary addition or removal does not trip it, and well above zero so a walk
 * that found nothing cannot report success.
 */
const MIN_TEST_FILES = 30;

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

interface Result { readonly name: string; readonly ok: boolean }

function run(name: string, cmd: string, args: string[]): Result {
  console.log(`\n===== ${name} =====`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  return { name, ok: r.status === 0 };
}

const files = walk(join(root, 'src'), []).sort();
if (files.length < MIN_TEST_FILES) {
  console.error(
    `run-tests: found only ${files.length} test files under src/, which is below the floor of `
    + `${MIN_TEST_FILES}. That is a broken walk, not a smaller suite — refusing to report a pass.`,
  );
  process.exit(2);
}

const results: Result[] = [
  run('tsc --noEmit -p tsconfig.json', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']),
  run('tsc --noEmit -p tsconfig.ui.json', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.ui.json']),
];
for (const f of files) {
  results.push(run(relative(root, f).replace(/\\/g, '/'), 'npx', ['tsx', f]));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== summary =====`);
console.log(`${files.length} test files + 2 typechecks; ${results.length - failed.length} passed, `
  + `${failed.length} failed.`);
for (const f of failed) console.log(`  FAILED: ${f.name}`);
if (failed.length === 0) console.log('EVERY FILE RAN, AND EVERY FILE PASSED.');
process.exit(failed.length === 0 ? 0 : 1);
