/**
 * Does THE MAGMA, as actually implemented, match what the design was sold on?
 *
 * scripts/magmasim.ts measured a standalone model of reading A. This drives the
 * REAL `tickChip` through the REAL `TickMods.magma` flag, because a sim that
 * agrees with a model it shares code with proves nothing about the shipped
 * game. If these numbers disagree with the design's, the design is wrong.
 *
 * The claim being checked, from the ability's own doc comment:
 *     10 min   +66%   (x32)   +169%  (x64)
 *     30 min    +4%             +31%
 *    120 min    +0%              +0.1%
 * — a TIME COMPRESSOR, not a multiplier: huge on a short session, nothing on a
 * long one. That profile is the whole reason it is safe to sell.
 *
 * Run: npx tsx scripts/magmareal.mjs
 */
import { freshChip, tickChip, worthOf, TICK_MS, GOLDEN_CRACKLES, LONG_FRY_CRACKLES } from '../src/lib/cooking';

const N = 20_000;
const SEASONING = 1;

/** Cook one chip for `budgetS`, overcooking until the ceiling, then dip. */
function run(budgetS, ceiling, { overcook, magma }) {
  let value = 0;
  let rng = 0x2f6e2b1 >>> 0;
  const rnd = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ticks = Math.floor(budgetS / (TICK_MS / 1000));
  for (let i = 0; i < N; i++) {
    let chip = freshChip(0);
    for (let k = 0; k < ticks; k++) {
      const lit = overcook && chip.crackles < ceiling;
      chip = tickChip(chip, SEASONING, 1, rnd, {
        ceiling,
        overcook: lit,
        magma: lit && magma,
      }).chip;
    }
    value += worthOf(chip);
  }
  return value / N;
}

const rows = [];
for (const [ceilName, ceiling] of [['x32', GOLDEN_CRACKLES], ['x64', LONG_FRY_CRACKLES]]) {
  for (const mins of [10, 30, 120]) {
    const B = mins * 60;
    const base = run(B, ceiling, { overcook: false, magma: false });
    const now = run(B, ceiling, { overcook: true, magma: false });
    const magma = run(B, ceiling, { overcook: true, magma: true });
    rows.push({
      ceiling: ceilName,
      mins,
      overcookNow: ((now / base - 1) * 100),
      withMagma: ((magma / base - 1) * 100),
    });
  }
}

console.log('\nTHE MAGMA, measured through the real tickChip');
console.log('(vs never overcooking at all, same session length)\n');
console.log('ceiling  session   overcook as-is   with THE MAGMA');
for (const r of rows) {
  const f = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`.padStart(9);
  console.log(`${r.ceiling.padEnd(8)} ${String(r.mins + ' min').padEnd(9)} ${f(r.overcookNow)}        ${f(r.withMagma)}`);
}

// The property the design is sold on, asserted rather than eyeballed.
const short = rows.find((r) => r.ceiling === 'x64' && r.mins === 10);
const long = rows.find((r) => r.ceiling === 'x64' && r.mins === 120);
console.log('');
let bad = 0;
const claim = (name, cond, extra) => {
  if (cond) console.log(`  ok  ${name}`);
  else { bad++; console.log(`FAIL  ${name}  ${JSON.stringify(extra)}`); }
};
claim('short sessions gain a lot', short.withMagma > 100, short);
claim('long sessions gain ~nothing', Math.abs(long.withMagma) < 2, long);
claim('it is strictly better than overcook as it ships',
  rows.every((r) => r.withMagma >= r.overcookNow - 0.01), rows);
claim('overcook as it ships is still a trap at length',
  rows.filter((r) => r.mins >= 30).every((r) => r.overcookNow < 0),
  rows.filter((r) => r.mins >= 30));

if (bad > 0) { console.error(`\n${bad} claim(s) the implementation does NOT support`); process.exit(1); }
console.log('\nthe implementation matches the design it was sold on');
