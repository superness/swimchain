/**
 * Does "overcook" survive contact with the PARKING strategy?
 *
 * The multiplier is TERMINAL (MAX_CRACKLES = 5, x32). So the obvious play is:
 * reach x32 however you can, then stop and let the pot tick at full rate for
 * as long as you like — every crumb that lands after that is worth x32.
 *
 * The honest metric is therefore NOT time-to-golden. It is: given a fixed
 * session length, what is the chip worth when you dip it? Run:
 *   npx tsx scripts/overcooksim.ts
 */
import { freshChip, tickChip, worthOf, TICK_MS, MAX_CRACKLES } from '../src/lib/cooking';

const N = 20_000;
const SEASONING = 1;

/** Cook ONE chip for exactly `budgetS` seconds, then dip.
 *  `until` = stop overcooking once this many crackles are banked. */
function run(budgetS: number, haste: number, drainPerTick: number, until: number) {
  let value = 0, goldenAt = 0, goldenN = 0;
  let rng = 0x2f6e2b1 >>> 0;
  const rnd = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ticks = Math.floor(budgetS / (TICK_MS / 1000));
  for (let i = 0; i < N; i++) {
    let chip = freshChip(0);
    let hitGolden: number | null = null;
    for (let k = 0; k < ticks; k++) {
      const on = chip.crackles < until && chip.crackles < MAX_CRACKLES;
      chip = tickChip(chip, SEASONING, on ? haste : 1, rnd).chip;
      if (on && drainPerTick > 0) chip = { ...chip, pot: chip.pot * (1 - drainPerTick) };
      if (hitGolden === null && chip.crackles >= MAX_CRACKLES) hitGolden = (k * TICK_MS) / 1000;
    }
    value += worthOf(chip);
    if (hitGolden !== null) { goldenAt += hitGolden; goldenN++; }
  }
  return { avg: value / N, goldenMin: goldenN ? goldenAt / goldenN / 60 : NaN, goldenPct: 100 * goldenN / N };
}

for (const budgetMin of [10, 30, 120]) {
  const B = budgetMin * 60;
  const base = run(B, 1, 0, 0);
  console.log(`\n=== session ${budgetMin} min ${'='.repeat(34)}`);
  console.log('strategy                            avg dip     vs base   golden@   reached');
  const show = (name: string, r: ReturnType<typeof run>) =>
    console.log(`${name.padEnd(32)} ${Math.round(r.avg).toString().padStart(10)}  ` +
      `${(100 * r.avg / base.avg).toFixed(1).padStart(7)}%   ` +
      `${(isNaN(r.goldenMin) ? '-' : r.goldenMin.toFixed(1)).padStart(6)}m   ${r.goldenPct.toFixed(0).padStart(4)}%`);
  show('never overcook (base)', base);
  show('  haste 1/3, no drain, always', run(B, 1 / 3, 0, MAX_CRACKLES));
  show('  haste 1/3, 3%/tick, always', run(B, 1 / 3, 0.03, MAX_CRACKLES));
  show('  haste 1/3, 3%/tick, to x16', run(B, 1 / 3, 0.03, 4));
  show('  haste 1/3, 3%/tick, PARK@32', run(B, 1 / 3, 0.03, MAX_CRACKLES));
  show('  haste 1/5, 6%/tick, PARK@32', run(B, 1 / 5, 0.06, MAX_CRACKLES));
}
