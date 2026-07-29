/**
 * THE MAGMA — "overcook feeds the multiplier instead of draining the pot."
 *
 * This is the descent's keystone ability, and the design doc says to simulate
 * it before anything else is priced: if overcook-that-pays breaks the curve,
 * every other char ability needs re-pricing against a different baseline.
 *
 * There is a specific reason to distrust intuition here. Overcook as it ships
 * MEASURES NEGATIVE (-18.9% at the Long Fry ceiling, scripts/overcooksim2.ts):
 * a 3% pot drain per tick compounds far harder than 3x-sooner crackles pays,
 * because the multiplier is TERMINAL — once you top out, every remaining tick
 * is worth full rate, and the drain has been eating the base the whole time.
 * "Remove the drain" therefore does not restore a fair trade; it removes the
 * only cost from an ability whose upside is already large.
 *
 * So this measures TWO readings of the design line, because "feeds the
 * multiplier" is genuinely ambiguous and the difference is the whole balance:
 *
 *   A. NO DRAIN. Overcook keeps the 3x haste and simply stops burning.
 *      The simplest reading, and the one to be suspicious of.
 *
 *   B. THE BURN BECOMES PROGRESS. The pot still bleeds, but every burned
 *      crumb buys crackle probability. Costly and self-limiting: a fat pot
 *      buys speed, a thin one buys nothing, so it rewards the same "let it
 *      cook" instinct the game's real secret is built on.
 *
 * Metric is the honest one from overcooksim: a FIXED SESSION, what is the chip
 * worth when you dip it. Never time-to-golden — that flatters any haste effect
 * by ignoring what parking earns afterwards.
 *
 * Run: npx tsx scripts/magmasim.ts
 */
import {
  freshChip, tickChip, worthOf, TICK_MS, TICK_CRUMBS,
  CRACKLE_BASE_S, GOLDEN_CRACKLES, LONG_FRY_CRACKLES,
  OVERCOOK_HASTE, OVERCOOK_DRAIN, type CookingChip,
} from '../src/lib/cooking';

const N = 20_000;
const SEASONING = 1;

type Mode = 'off' | 'now' | 'magmaA' | 'magmaB';

/**
 * Reading B needs its own tick: the burn has to turn into crackle probability,
 * which `tickChip` has no hook for. Everything else here matches it exactly —
 * same gain, same terminal ceiling, same memoryless crackle draw — so the two
 * paths stay comparable.
 *
 * The conversion: burned crumbs buy extra crackle chance proportional to the
 * burn as a fraction of one tick's gain. A pot of 10 ticks' worth burning 3%
 * pays about a third of a tick's progress; a pot of 100 ticks' worth pays
 * three. That is the self-limiting property — it scales with what you have
 * standing in the oil, so it cannot be farmed from an empty pot.
 */
function tickMagmaB(chip: CookingChip, ceiling: number, rnd: () => number): CookingChip {
  const gained = Math.max(1, Math.floor(TICK_CRUMBS * SEASONING));
  const grown = chip.pot + gained;
  const burned = grown * OVERCOOK_DRAIN;
  const next: CookingChip = { ...chip, pot: grown - burned, cookedMs: chip.cookedMs + TICK_MS };
  if (next.crackles < ceiling) {
    const expectedWaitS = CRACKLE_BASE_S * 2 ** (next.crackles + 1);
    const base = TICK_MS / 1000 / expectedWaitS;
    // The fed part: the burn, valued in ticks, multiplying the base chance.
    const fed = base * (burned / gained);
    if (rnd() < base + fed) next.crackles += 1;
  }
  return next;
}

/** Cook one chip for `budgetS`, overcooking until `until` crackles, then dip. */
function run(budgetS: number, mode: Mode, ceiling: number, until: number) {
  let value = 0, topped = 0, toppedAt = 0;
  let rng = 0x2f6e2b1 >>> 0;
  const rnd = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ticks = Math.floor(budgetS / (TICK_MS / 1000));

  for (let i = 0; i < N; i++) {
    let chip = freshChip(0);
    let hit: number | null = null;
    for (let k = 0; k < ticks; k++) {
      const on = mode !== 'off' && chip.crackles < until && chip.crackles < ceiling;
      if (on && mode === 'magmaB') {
        chip = tickMagmaB(chip, ceiling, rnd);
      } else {
        // 'now' = ships today (haste + drain). 'magmaA' = haste, no drain.
        const r = tickChip(chip, SEASONING, 1, rnd, {
          ceiling,
          overcook: on && mode === 'now',
        });
        chip = r.chip;
        if (on && mode === 'magmaA') {
          // Haste without the burn: re-roll the crackle at the hasted rate,
          // undoing tickChip's unlit draw. Same dice stream either way.
          if (!r.crackled && chip.crackles < ceiling) {
            const w = CRACKLE_BASE_S * 2 ** (chip.crackles + 1) * OVERCOOK_HASTE;
            if (rnd() < TICK_MS / 1000 / w) chip = { ...chip, crackles: chip.crackles + 1 };
          }
        }
      }
      if (hit === null && chip.crackles >= ceiling) hit = (k * TICK_MS) / 1000;
    }
    value += worthOf(chip);
    if (hit !== null) { topped++; toppedAt += hit; }
  }
  return {
    avg: value / N,
    topPct: (100 * topped) / N,
    topMin: topped ? toppedAt / topped / 60 : NaN,
  };
}

for (const ceiling of [GOLDEN_CRACKLES, LONG_FRY_CRACKLES]) {
  const name = ceiling === GOLDEN_CRACKLES ? `x${2 ** ceiling} (golden)` : `x${2 ** ceiling} (Long Fry)`;
  console.log(`\n${'='.repeat(72)}\nCEILING ${name}\n${'='.repeat(72)}`);
  for (const budgetMin of [10, 30, 120]) {
    const B = budgetMin * 60;
    const base = run(B, 'off', ceiling, 0);
    console.log(`\n--- session ${budgetMin} min ---`);
    console.log('strategy                          avg dip      vs base    topped   @min');
    const show = (label: string, r: ReturnType<typeof run>) => {
      const d = ((r.avg / base.avg - 1) * 100);
      console.log(
        `${label.padEnd(30)} ${Math.round(r.avg).toString().padStart(10)}  ` +
        `${(d >= 0 ? '+' : '') + d.toFixed(1)}%`.padStart(9) +
        `  ${r.topPct.toFixed(0).padStart(6)}%  ${isNaN(r.topMin) ? '  —' : r.topMin.toFixed(1).padStart(5)}`
      );
    };
    show('no overcook (base)', base);
    show(`overcook AS SHIPPED (to ${ceiling})`, run(B, 'now', ceiling, ceiling));
    show('A. no drain, keep haste', run(B, 'magmaA', ceiling, ceiling));
    show('B. burn feeds the multiplier', run(B, 'magmaB', ceiling, ceiling));
    // Stopping one rung early is the sophisticated play under any of them:
    // the last rung is the longest wait and the pot ticks the whole time.
    show(`B. but stop at ${ceiling - 1}`, run(B, 'magmaB', ceiling, ceiling - 1));
  }
}
