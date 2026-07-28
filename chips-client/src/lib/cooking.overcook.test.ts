/**
 * Overcook: the rule that burns a fryer's pot for sooner crackles.
 * Run: npx tsx src/lib/cooking.overcook.test.ts
 */
import {
  freshChip, tickChip, TICK_CRUMBS, CRACKLE_BASE_S, TICK_MS,
  OVERCOOK_HASTE, OVERCOOK_DRAIN,
} from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const never = () => 1;      // rng that never crackles

// 1) The drain takes its cut AFTER the tick's gain, and only when lit.
{
  const cold = tickChip(freshChip(1), 1, 1, never);
  check('an unlit fryer keeps the whole tick', cold.chip.pot === TICK_CRUMBS, cold.chip.pot);
  check('an unlit fryer reports nothing burned', cold.burned === 0, cold.burned);

  const lit = tickChip(freshChip(1), 1, 1, never, { overcook: true });
  const want = (0 + TICK_CRUMBS) * (1 - OVERCOOK_DRAIN);
  check('a lit fryer burns the drain off the post-gain pot', Math.abs(lit.chip.pot - want) < 1e-9,
    { got: lit.chip.pot, want });
  check('a lit fryer reports what it burned', Math.abs(lit.burned - TICK_CRUMBS * OVERCOOK_DRAIN) < 1e-9, lit.burned);
}

// 2) The drain compounds on an existing pot, not just the new gain.
{
  const chip = { ...freshChip(1), pot: 100_000 };
  const r = tickChip(chip, 1, 1, never, { overcook: true });
  const want = (100_000 + TICK_CRUMBS) * (1 - OVERCOOK_DRAIN);
  check('the drain applies to the whole pot', Math.abs(r.chip.pot - want) < 1e-9, { got: r.chip.pot, want });
}

// 3) Haste shortens the WAIT, which raises the per-tick crackle chance.
//    Measured as a rate over many ticks rather than asserted on internals.
{
  const rollsFor = (mods: object) => {
    let hits = 0;
    const N = 200_000;
    let seed = 0x1234567 >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < N; i++) if (tickChip(freshChip(1), 1, 1, rnd, mods).crackled) hits++;
    return hits / N;
  };
  const cold = rollsFor({});
  const lit = rollsFor({ overcook: true });
  const expected = 1 / OVERCOOK_HASTE;
  check('a lit fryer crackles ~1/HASTE times as often',
    Math.abs(lit / cold - expected) < 0.15 * expected, { cold, lit, ratio: lit / cold, expected });

  // The cold rate must still match the untouched curve — proof the haste did
  // not leak into every fryer.
  const p = TICK_MS / 1000 / (CRACKLE_BASE_S * 2);
  check('an unlit fryer still follows the published curve', Math.abs(cold - p) < 0.1 * p, { cold, p });
}

// 4) A forced crackle (the angel) is unaffected by overcook.
{
  const r = tickChip(freshChip(1), 1, 1, never, { overcook: true, forceCrackle: true });
  check('a blessing still lands on a lit fryer', r.crackled === true);
}

// 5) The rat's diversion wins: a lit fryer whose pot is being siphoned has no
//    gain to burn, and must not go NEGATIVE.
{
  const chip = { ...freshChip(1), pot: 0 };
  const r = tickChip(chip, 1, 1, never, { overcook: true, divertPot: true });
  check('a diverted lit fryer never goes negative', r.chip.pot >= 0, r.chip.pot);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
