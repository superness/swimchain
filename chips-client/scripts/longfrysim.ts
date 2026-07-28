/**
 * IS THE LONG FRY ACTUALLY A BOOST?
 *
 * The operator's standing bar, set when a second overcook was rejected: a jar
 * that does not pay is a trap, however interesting it reads. `longfry` costs
 * 1.2B — the deepest price in the game — so "it adds a decision" is not on its
 * own good enough. This measures whether it adds MONEY.
 *
 * The honest metric is steady-state income, not the value of one lucky chip:
 * cook a chip under a dip policy, bank it, start the next from an empty pot,
 * and divide total crumbs by total seconds. A ceiling that only raises the
 * top prize while costing proportionally more time to reach is worth nothing.
 *
 *   npx tsx scripts/longfrysim.ts
 */
import {
  freshChip, tickChip, worthOf, TICK_MS,
  GOLDEN_CRACKLES, LONG_FRY_CRACKLES, OVERCOOK_HASTE, OVERCOOK_DRAIN,
} from '../src/lib/cooking';

const SEASONING = 1;
const HOURS = 400;

/**
 * Play `hours` of wall clock under one policy and report crumbs/sec.
 * `holdTo` — bank the moment the chip has this many crackles.
 * `ceiling` — top of the ladder (what the jar moves).
 * `burnTo` — overcook while below this many crackles (0 = never).
 */
function income(hours: number, holdTo: number, ceiling: number, burnTo: number) {
  let rng = 0x2f6e2b1 >>> 0;
  const rnd = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ticks = Math.floor((hours * 3600) / (TICK_MS / 1000));
  let banked = 0, chips = 0, chip = freshChip(0);
  for (let k = 0; k < ticks; k++) {
    const lit = chip.crackles < burnTo;
    chip = tickChip(chip, SEASONING, 1, rnd, { ceiling, overcook: lit }).chip;
    if (chip.crackles >= holdTo) { banked += worthOf(chip); chips++; chip = freshChip(0); }
  }
  return { rate: banked / (hours * 3600), chips };
}

const fmt = (n: number) => n.toFixed(1).padStart(9);
console.log(`steady-state crumbs/sec over ${HOURS}h, seasoning ${SEASONING}, one fryer\n`);
console.log('policy                                  base       long fry      delta');

for (const [label, holdTo] of [
  ['dip at x8   (3 crackles)', 3],
  ['dip at x16  (4 crackles)', 4],
  ['dip at GOLDEN (5)', GOLDEN_CRACKLES],
] as [string, number][]) {
  const b = income(HOURS, holdTo, GOLDEN_CRACKLES, 0);
  const l = income(HOURS, holdTo, LONG_FRY_CRACKLES, 0);
  console.log(`${label.padEnd(36)}${fmt(b.rate)}   ${fmt(l.rate)}   ${((l.rate / b.rate - 1) * 100).toFixed(1)}%`);
}

// The policy the jar unlocks: hold PAST golden for the sixth.
{
  const b = income(HOURS, GOLDEN_CRACKLES, GOLDEN_CRACKLES, 0);
  const l = income(HOURS, LONG_FRY_CRACKLES, LONG_FRY_CRACKLES, 0);
  console.log(`${'hold to the ceiling'.padEnd(36)}${fmt(b.rate)}   ${fmt(l.rate)}   ${((l.rate / b.rate - 1) * 100).toFixed(1)}%`);
}

// And the interaction the design leans on: overcook was EV-neutral only
// because the multiplier was terminal. With a rung above golden there is
// something for haste to compound into — or there is not, and the claim in
// cooking.ts's header needs retracting rather than repeating.
console.log(`\novercook (haste ${OVERCOOK_HASTE.toFixed(2)}, drain ${OVERCOOK_DRAIN}) while below golden, then let it ride:`);
{
  const cold = income(HOURS, LONG_FRY_CRACKLES, LONG_FRY_CRACKLES, 0);
  const hot = income(HOURS, LONG_FRY_CRACKLES, LONG_FRY_CRACKLES, GOLDEN_CRACKLES);
  console.log(`  no burn ${fmt(cold.rate)}   burning ${fmt(hot.rate)}   ${((hot.rate / cold.rate - 1) * 100).toFixed(1)}%`);
}
