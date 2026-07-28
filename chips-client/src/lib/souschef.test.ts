/**
 * The Sous Chef cashes at THE CEILING, not at GOLDEN.
 *
 * Every check here is written so it FAILS against the shipped behaviour it
 * replaces (`isGolden(chip)`, i.e. `crackles >= 5` regardless of what the
 * player owns). The bug is invisible to any test that only exercises the
 * default ceiling, because there golden and the ceiling are the same number —
 * which is exactly why it shipped.
 *
 * Run: npx tsx src/lib/souschef.test.ts
 */
import { sousTakes } from './souschef';
import { GOLDEN_CRACKLES, LONG_FRY_CRACKLES, MAX_CRACKLES, isGolden } from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const chip = (crackles: number, pot = 10_000) => ({ crackles, pot });

// 1) Default ceiling: unchanged from the behaviour players have today.
{
  check('takes a topped-out chip', sousTakes(chip(MAX_CRACKLES), MAX_CRACKLES));
  check('leaves one crackle short alone', !sousTakes(chip(MAX_CRACKLES - 1), MAX_CRACKLES));
  check('takes one that overshot', sousTakes(chip(MAX_CRACKLES + 2), MAX_CRACKLES));
}

// 2) THE BUG. With The Long Fry owned, a five-crackle chip is GOLDEN but not
//    TOPPED OUT — it has a x64 ahead of it. The old rule cashed it here.
{
  const golden = chip(GOLDEN_CRACKLES);
  check('sanity: five crackles really is golden', isGolden(golden));
  check('and the old rule would have taken it', isGolden(golden) === true);
  check('THE FIX: he leaves a golden chip alone when the ceiling is higher',
    !sousTakes(golden, LONG_FRY_CRACKLES), { crackles: golden.crackles, ceiling: LONG_FRY_CRACKLES });
  check('and takes it once it reaches the raised ceiling',
    sousTakes(chip(LONG_FRY_CRACKLES), LONG_FRY_CRACKLES));
}

// 3) An empty pot is not worth banking, at any ceiling — `dip()` no-ops on it
//    and firing anyway would spend a chain reply on nothing.
{
  check('ignores an empty pot at the ceiling', !sousTakes(chip(MAX_CRACKLES, 0), MAX_CRACKLES));
  check('ignores a negative pot', !sousTakes(chip(MAX_CRACKLES, -1), MAX_CRACKLES));
  check('ignores a missing fryer', !sousTakes(undefined, MAX_CRACKLES));
}

// 4) The rule must read the CEILING and nothing else — no hidden dependency on
//    the golden constant. A hypothetical ceiling either side of golden proves
//    it is genuinely parameterised rather than coincidentally correct.
{
  check('a ceiling BELOW golden still governs', sousTakes(chip(3), 3));
  check('and holds him below it', !sousTakes(chip(2), 3));
  check('a ceiling far above golden still governs', !sousTakes(chip(GOLDEN_CRACKLES + 1), 9));
  check('until it is reached', sousTakes(chip(9), 9));
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
