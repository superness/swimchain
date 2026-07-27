/**
 * The cooking engine against the locked spec (its own header): the pot is
 * ALWAYS moving, crackles double the multi with designed escalating rarity,
 * golden is terminal, a dip pays pot x multi, the double-dip is a chance the
 * dip pays twice. Injected RNG throughout — tests own the dice.
 *
 * Run: npx tsx src/lib/cooking.test.ts
 */
import {
  tickChip, dipChip, freshChip, multiOf, isGolden, worthOf, createMsAllocator,
  TICK_CRUMBS, TICK_MS, CRACKLE_BASE_S, MAX_CRACKLES,
} from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const never = () => 0.999999;  // rng that never crackles / never procs
const always = () => 0;        // rng that always crackles / always procs

// 1) THE POT IS ALWAYS MOVING — every tick gains, no exceptions, and the
//    gain scales with seasoning, floored.
{
  let chip = freshChip(1);
  for (let i = 1; i <= 10; i++) {
    const r = tickChip(chip, 1, 1, never);
    check(`tick ${i} moved the pot by TICK_CRUMBS`, r.chip.pot === chip.pot + TICK_CRUMBS && r.gained === TICK_CRUMBS, r);
    chip = r.chip;
    if (i > 2) break; // three explicit checks are enough noise
  }
  const seasoned = tickChip(freshChip(2), 3 / 2, 1, never);
  check('seasoning multiplies the tick (floored)', seasoned.gained === Math.floor(TICK_CRUMBS * 1.5));
  const tiny = tickChip(freshChip(3), 0.0001, 1, never);
  check('a tick can never be zero — the pot ALWAYS moves', tiny.gained >= 1, tiny.gained);
}

// 2) CRACKLES: doubling multi, terminal at MAX_CRACKLES.
{
  let chip = freshChip(4);
  for (let k = 1; k <= MAX_CRACKLES; k++) {
    const r = tickChip(chip, 1, 1, always);
    check(`crackle ${k} doubles the multi to x${2 ** k}`, r.crackled && multiOf(r.chip) === 2 ** k, multiOf(r.chip));
    chip = r.chip;
  }
  check('the top is golden', isGolden(chip) && multiOf(chip) === 2 ** MAX_CRACKLES);
  const after = tickChip(chip, 1, 1, always);
  check('golden is terminal — no sixth crackle even on hot dice', !after.crackled && multiOf(after.chip) === 2 ** MAX_CRACKLES);
  check('golden still ticks the pot — never frozen', after.chip.pot === chip.pot + TICK_CRUMBS);
}

// 3) THE DESIGNED RARITY CURVE: P(crackle) halves at each level (waits
//    double), and haste scales waits down. Pinned against the exact
//    probability the engine computes, by brute-forcing the threshold rng.
{
  const pAt = (crackles: number, haste: number): number => {
    // binary-search the largest rng value that still crackles
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const r = tickChip({ ms: 9, pot: 0, crackles, cookedMs: 0 }, 1, haste, () => mid);
      if (r.crackled) lo = mid; else hi = mid;
    }
    return lo;
  };
  const p0 = pAt(0, 1), p1 = pAt(1, 1), p2 = pAt(2, 1);
  check('crackle odds halve as levels rise (waits double)',
    Math.abs(p0 / p1 - 2) < 0.01 && Math.abs(p1 / p2 - 2) < 0.01, { p0, p1, p2 });
  check('first-crackle odds match the designed base wait',
    Math.abs(p0 - (TICK_MS / 1000) / (CRACKLE_BASE_S * 2)) < 1e-6, p0);
  const hasted = pAt(0, 0.75);
  check('haste makes crackles come sooner', Math.abs(hasted / p0 - 1 / 0.75) < 0.01, { p0, hasted });
}

// 4) THE DIP: pot x multi, double-dip as a chance to pay twice.
{
  const chip = { ms: 5, pot: 7000, crackles: 3, cookedMs: 0 };
  check('worth = pot x multi', worthOf(chip) === 7000 * 8);
  const plain = dipChip(chip, 0, always);
  check('no upgrade: never doubles even on hot dice', plain.amount === 56_000 && !plain.doubled);
  // 10x rarer than the modulus reads (operator 2026-07-27): mod 4 procs at
  // 1-in-40, i.e. rng < .025.
  const proc = dipChip(chip, 4, () => 0.024);
  const miss = dipChip(chip, 4, () => 0.026);
  check('double dip procs exactly under 1/(mod x RARITY)', proc.doubled && proc.amount === 112_000, proc);
  check('and not above it', !miss.doubled && miss.amount === 56_000, miss);
  const oldOdds = dipChip(chip, 4, () => 0.24);
  check('the old 1-in-4 odds are really gone', !oldOdds.doubled, oldOdds);
}

// 5) The allocator: strictly increasing, never repeats, and TRACKS REAL
//    TIME — a stale seed must not stamp today's dips with yesterday's clock
//    (the fold orders by this ms within a block; a load-time stamp made
//    every dip sort before every buy and fed 1.94M into a pre-upgrade bowl
//    cap on the live designer-review table, 2026-07-27).
{
  const alloc = createMsAllocator(1000);   // ancient seed
  const now = Date.now();
  const a = alloc(), b = alloc(), c = alloc();
  check('ms values strictly increase', a < b && b < c, [a, b, c]);
  check('a stale-seeded allocator still stamps wall-clock time', a >= now, { a, now });
}

// 6) CREW INTERFERENCE (TickMods) — and, crucially, that its ABSENCE is
//    exact: a bare call must behave byte-identically to the pre-crew engine.
{
  const base = { ms: 6, pot: 1000, crackles: 1, cookedMs: 0 };

  const diverted = tickChip(base, 1, 1, never, { divertPot: true });
  check('divertPot: the pot does NOT move but the gain is still reported',
    diverted.chip.pot === 1000 && diverted.gained === TICK_CRUMBS && diverted.diverted, diverted);
  check('divertPot: the clock still advances', diverted.chip.cookedMs === base.cookedMs + TICK_MS);

  const eaten = tickChip(base, 1, 1, always, { eatCrackle: true });
  check('eatCrackle: a landing crackle is eaten — reported, multi unmoved',
    eaten.crackleEaten && !eaten.crackled && multiOf(eaten.chip) === 2, eaten);
  const noBite = tickChip(base, 1, 1, never, { eatCrackle: true });
  check('eatCrackle: nothing to eat when no crackle lands', !noBite.crackleEaten && !noBite.crackled);

  const blessed = tickChip(base, 1, 1, never, { forceCrackle: true });
  check('forceCrackle: crackles on the coldest dice', blessed.crackled && multiOf(blessed.chip) === 4, blessed);
  const goldenChip = { ms: 7, pot: 500, crackles: MAX_CRACKLES, cookedMs: 0 };
  const overBless = tickChip(goldenChip, 1, 1, never, { forceCrackle: true });
  check('forceCrackle: golden stays terminal even blessed', !overBless.crackled && multiOf(overBless.chip) === 2 ** MAX_CRACKLES);

  const ratBeatsAngel = tickChip(base, 1, 1, never, { forceCrackle: true, eatCrackle: true });
  check('the rat eats even a blessing (eat beats force)',
    ratBeatsAngel.crackleEaten && !ratBeatsAngel.crackled && multiOf(ratBeatsAngel.chip) === 2, ratBeatsAngel);

  const bare = tickChip(base, 1, 1, always);
  check('no mods: identical to the pre-crew engine (crackles land, pot moves)',
    bare.crackled && !bare.crackleEaten && !bare.diverted && bare.chip.pot === 1000 + TICK_CRUMBS);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
