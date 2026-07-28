/**
 * QUESTION 2: the CYCLING regime — dip at your target multiplier, start a
 * fresh chip, repeat. Metric is crumbs per second over a long run, which is
 * what actually fills the bowl. (overcooksim.ts answers the PARKING regime:
 * one chip, fixed session, dip at the end.)
 */
import { freshChip, tickChip, worthOf, TICK_MS, MAX_CRACKLES } from '../src/lib/cooking';

const RUN_S = 400_000;
const SEASONING = 1;

/** Cook to `dipAt` crackles, dip, repeat. Overcook is on below `until`. */
function cycle(haste: number, drainPerTick: number, until: number, dipAt: number) {
  let rng = 0x51f3a7 >>> 0;
  const rnd = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  let banked = 0, t = 0, dips = 0;
  let chip = freshChip(0);
  const step = TICK_MS / 1000;
  while (t < RUN_S) {
    const on = chip.crackles < until && chip.crackles < MAX_CRACKLES;
    chip = tickChip(chip, SEASONING, on ? haste : 1, rnd).chip;
    if (on && drainPerTick > 0) chip = { ...chip, pot: chip.pot * (1 - drainPerTick) };
    t += step;
    if (chip.crackles >= dipAt) { banked += worthOf(chip); dips++; chip = freshChip(0); }
  }
  return { perSec: banked / t, dips };
}

for (const dipAt of [5, 4, 3]) {
  const base = cycle(1, 0, 0, dipAt);
  console.log(`\n=== cycling, dip at x${2 ** dipAt} ${'='.repeat(30)}`);
  console.log('strategy                          crumbs/s    vs base     dips');
  const show = (name: string, r: ReturnType<typeof cycle>) =>
    console.log(`${name.padEnd(30)} ${r.perSec.toFixed(1).padStart(10)}  ${(100 * r.perSec / base.perSec).toFixed(1).padStart(7)}%  ${r.dips.toString().padStart(7)}`);
  show('never overcook (base)', base);
  show('  haste 1/3, no drain', cycle(1 / 3, 0, MAX_CRACKLES, dipAt));
  show('  haste 1/3, 1%/tick', cycle(1 / 3, 0.01, MAX_CRACKLES, dipAt));
  show('  haste 1/3, 3%/tick', cycle(1 / 3, 0.03, MAX_CRACKLES, dipAt));
  show('  haste 1/5, 3%/tick', cycle(1 / 5, 0.03, MAX_CRACKLES, dipAt));
}
