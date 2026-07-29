/**
 * The porcelain's rules. The load-bearing one is that THE BAR MOVES: every
 * crumb you bank raises what a single dip has to beat, so grinding cannot
 * crack it and only holding can. If that ever stops being true the fight
 * becomes a patience check instead of the thing that teaches the game.
 *
 * Run: npx tsx src/lib/porcelain.test.ts
 */
import {
  bankedThisRun, porcelainInReach, readiness, cracks, crackProgress,
  PORCELAIN_READY_CRACKLES,
} from './porcelain';
import { CRUMBS_PER_CHIP, deepBandFloor } from './chipsConst';
import type { CookingChip } from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}
const chip = (crackles: number, pot: number, ms = 1): CookingChip => ({ ms, pot, crackles, cookedMs: 0 });

/* ── THE BAR MOVES. The whole point. ──────────────────────────────────── */
{
  check('the bar is everything banked this run', bankedThisRun(1000) === 1000 * CRUMBS_PER_CHIP);
  check('banking more RAISES it', bankedThisRun(2000) > bankedThisRun(1000));

  // A dip that would have cracked it earlier does not crack it later, because
  // the very act of banking moved the bar. This is what makes grinding
  // useless and holding the only answer.
  const dip = 5_000_000;
  check('a dip that cracks a small run...', cracks(dip, 4_000));
  check('...does NOT crack the same run once it is richer', !cracks(dip, 6_000));
}

/* ── strictly greater ─────────────────────────────────────────────────── */
{
  const bar = bankedThisRun(1_000);
  check('matching the bar is not cracking it', !cracks(bar, 1_000), bar);
  check('one crumb over is', cracks(bar + 1, 1_000));
  check('under is not', !cracks(bar - 1, 1_000));
}

/* ── PREPARED: you may not walk up with a cold rack ───────────────────── */
{
  const cold = readiness([chip(0, 500), chip(1, 900)], 1_000);
  check('a cold rack is not ready', !cold.ready, cold);
  check('but it still reports your best chip', cold.best?.crackles === 1, cold.best);

  const hot = readiness([chip(0, 500), chip(PORCELAIN_READY_CRACKLES, 900)], 1_000);
  check('a chip at the readiness rung IS ready', hot.ready);
  check('and the best is the fattest by WORTH, not by crackles',
    readiness([chip(5, 10), chip(3, 100_000)], 1).best?.index === 1,
    readiness([chip(5, 10), chip(3, 100_000)], 1).best);

  const empty = readiness([], 1_000);
  check('an empty rack is not ready and has no best', !empty.ready && empty.best === null);
  check('readiness always reports the bar', empty.bar === bankedThisRun(1_000));
}

/* ── in reach: the same floor the fold enforces ───────────────────────── */
{
  const floor = deepBandFloor(0);
  check('not in reach below the band floor', !porcelainInReach(floor - 1, 0));
  check('in reach at the floor', porcelainInReach(floor, 0));
  // Once it is broken it is not there any more — the next band is.
  check('not offered again once broken', !porcelainInReach(floor * 4, 1));
}

/* ── the picture cannot disagree with the rule ────────────────────────── */
{
  const life = 1_000;
  const bar = bankedThisRun(life);
  check('no hairlines at zero', crackProgress(0, life) === 0);
  check('half way is half', Math.abs(crackProgress(bar / 2, life) - 0.5) < 1e-9);
  check('the drawing is full exactly where the rule breaks',
    crackProgress(bar, life) === 1 && !cracks(bar, life) && cracks(bar + 1, life));
  check('and never overflows', crackProgress(bar * 10, life) === 1);
  check('a fresh run with nothing banked cracks on anything',
    crackProgress(1, 0) === 1 && cracks(1, 0));
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
