/**
 * Is THE TABLE beatable without The Grain, and non-trivial with it?
 *
 * The fight: five dips in a row in one basket, each worth more than the last.
 * That is exactly what The Grain (polish) pays for, and The Grain is the ability
 * this band sells. So the boss has two hard requirements, and if either fails
 * the design is wrong:
 *
 *   1. BEATABLE WITHOUT IT, or the descent locks behind a purchase.
 *   2. NOT TRIVIAL WITH IT, or the band is a formality.
 *
 * Measured, not argued — two of today's "obviously fine" balance claims turned
 * out wrong when measured (the EV-flat comment, and a +169% magma figure that
 * was really +135.5%).
 *
 * The player strategy modelled is the honest one: cook for a while, dip, and
 * cook a little LONGER each time so the pot rises. `extraTicks` is how much
 * longer each successive cook gets — the patience knob.
 *
 * Run: npx tsx scripts/tablesim.ts
 */
import { freshChip, tickChip, worthOf, TICK_MS, LONG_FRY_CRACKLES } from '../src/lib/cooking';
import { polishMult, advance, freshPolish } from '../src/lib/polish';
import { freshRun, feed, won, tableBar, TABLE_RUN } from '../src/lib/table';

const N = 3000;
const SEASONING = 1;
const CEILING = LONG_FRY_CRACKLES;
/** A player arriving at band 1 with roughly the floor's lifetime. */
const LIFETIME = 4_000_000;
const BAR = tableBar(LIFETIME);

/**
 * Play one attempt. Cook `baseTicks` before the first dip, then `extraTicks`
 * more before each subsequent one. Returns the seconds spent and whether the
 * run was made inside `budgetS`.
 */
function attempt(baseTicks: number, extraTicks: number, usePolish: boolean, budgetS: number, rnd: () => number) {
  const maxTicks = Math.floor(budgetS / (TICK_MS / 1000));
  let run = freshRun();
  let polish = freshPolish();
  let chip = freshChip(0);
  let cooked = 0;
  let target = baseTicks;
  let elapsed = 0;

  while (elapsed < maxTicks) {
    chip = tickChip(chip, SEASONING, 1, rnd, { ceiling: CEILING }).chip;
    cooked += 1;
    elapsed += 1;
    if (cooked >= target) {
      const mult = usePolish ? polishMult(polish, 0) : 1;
      const worth = Math.floor(worthOf(chip) * mult);
      run = feed(run, 0, worth);
      if (usePolish) polish = advance(polish, 0);
      if (won(run, BAR)) return { made: true, seconds: (elapsed * TICK_MS) / 1000, dips: run.worths.length };
      chip = freshChip(0);
      cooked = 0;
      target += extraTicks;
    }
  }
  return { made: false, seconds: (elapsed * TICK_MS) / 1000, dips: run.worths.length };
}

function measure(baseTicks: number, extraTicks: number, usePolish: boolean, budgetS: number) {
  let rng = 0x7f4a1c3 >>> 0;
  const rnd = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  let made = 0, secs = 0;
  for (let i = 0; i < N; i++) {
    const r = attempt(baseTicks, extraTicks, usePolish, budgetS, rnd);
    if (r.made) { made += 1; secs += r.seconds; }
  }
  return { rate: made / N, avgMin: made ? secs / made / 60 : NaN };
}

const BUDGET = 45 * 60;   // a generous attempt window

console.log(`\nTHE TABLE — ${TABLE_RUN} rising dips in one basket (ceiling x${2 ** CEILING})`);
console.log(`each attempt gets ${BUDGET / 60} min\n`);
console.log('patience (extra ticks/dip)   without grain            with grain');
console.log('                             win rate   avg min      win rate   avg min');
for (const extra of [0, 2, 4, 8]) {
  const off = measure(8, extra, false, BUDGET);
  const on = measure(8, extra, true, BUDGET);
  const f = (m: { rate: number; avgMin: number }) =>
    `${(m.rate * 100).toFixed(0).padStart(5)}%  ${(isNaN(m.avgMin) ? '  —' : m.avgMin.toFixed(1)).padStart(7)}`;
  console.log(`  +${String(extra).padEnd(26)} ${f(off)}      ${f(on)}`);
}

/* ── THE TWO REQUIREMENTS ───────────────────────────────────────────────── */
console.log('');
let bad = 0;
const claim = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) console.log(`  ok  ${name}`);
  else { bad++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
};

// 1. Beatable without the ability, if you are patient.
const patientNoGrain = measure(8, 4, false, BUDGET);
claim('beatable WITHOUT the grain by cooking longer each time',
  patientNoGrain.rate > 0.9, patientNoGrain);

// 2. Not trivial WITH it — the fight must still take real time.
const withGrain = measure(8, 0, true, BUDGET);
claim('the grain helps: it wins where no-grain at the same patience does not',
  withGrain.rate > measure(8, 0, false, BUDGET).rate + 0.1,
  { withGrain: withGrain.rate, without: measure(8, 0, false, BUDGET).rate });
claim('...but it is not instant — still minutes of play',
  withGrain.avgMin > 2, withGrain);

// 3. And impatience alone is NOT enough without the ability: dipping the same
//    length every time cannot make a rising run.
const impatientNoGrain = measure(8, 0, false, BUDGET);
claim('the bar is a real bar: some patience is needed either way',
  impatientNoGrain.rate < 0.95, impatientNoGrain);

if (bad > 0) {
  console.error(`\n${bad} requirement(s) unmet — retune before building`);
  process.exit(1);
}
console.log('\nThe Table is a real fight either way, and The Grain is the shortcut it should be');
