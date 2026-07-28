/**
 * THE LONG FRY — the deepest jar in the game (chipsConst `longfry`, sold by
 * the first chip). It raises the CEILING of the crackle ladder by one, to
 * x64, without moving GOLDEN.
 *
 * Why those must be two different numbers: today 5 crackles means golden AND
 * terminal, so the instant a chip goes golden there is no reason on earth to
 * wait — you pull it, every time, forever. Splitting them turns the game's
 * most-repeated moment into a real choice: take the golden one now, or let it
 * ride for one more double. Everything that keys off GOLDEN (the queso
 * angel's feed, the Sous Chef's auto-dip, the basket's golden art) must be
 * completely unmoved by owning the jar — a "boost" that made the angel
 * harder to feed would be a punishment wearing an upgrade's label.
 *
 * Run: npx tsx src/lib/cooking.longfry.test.ts
 */
import {
  freshChip, tickChip, isGolden, multiOf,
  GOLDEN_CRACKLES, MAX_CRACKLES, LONG_FRY_CRACKLES,
} from './cooking';
import { overcookOff } from './overcook';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const never = () => 1;
const atCrackles = (k: number) => ({ ...freshChip(1), crackles: k, pot: 10_000 });

// 1) The shape of the two constants. Stated as a test because the whole
//    feature is "these stopped being the same number".
{
  check('golden is still five crackles (x32)', GOLDEN_CRACKLES === 5, GOLDEN_CRACKLES);
  check('the default ceiling IS golden', MAX_CRACKLES === GOLDEN_CRACKLES, { MAX_CRACKLES, GOLDEN_CRACKLES });
  check('the long fry adds exactly one', LONG_FRY_CRACKLES === GOLDEN_CRACKLES + 1, LONG_FRY_CRACKLES);
}

// 2) WITHOUT the jar, a golden chip is terminal — the rule that exists today
//    and must not regress. `forceCrackle` is the angel's guaranteed crackle:
//    if anything can push a chip past the ceiling it is this, so this is the
//    strongest form of the assertion.
{
  const r = tickChip(atCrackles(GOLDEN_CRACKLES), 1, 1, never, { forceCrackle: true });
  check('a golden chip cannot crackle again on the default ceiling',
    r.chip.crackles === GOLDEN_CRACKLES && !r.crackled, { crackles: r.chip.crackles, crackled: r.crackled });
}

// 3) WITH the jar, that same chip takes one more — and only one.
{
  const sixth = tickChip(atCrackles(GOLDEN_CRACKLES), 1, 1, never,
    { forceCrackle: true, ceiling: LONG_FRY_CRACKLES });
  check('the long fry lets a golden chip crackle once more',
    sixth.chip.crackles === GOLDEN_CRACKLES + 1 && sixth.crackled,
    { crackles: sixth.chip.crackles, crackled: sixth.crackled });
  check('and that sixth crackle is worth x64', multiOf(sixth.chip) === 64, multiOf(sixth.chip));

  const seventh = tickChip(sixth.chip, 1, 1, never, { forceCrackle: true, ceiling: LONG_FRY_CRACKLES });
  check('the raised ceiling is still a ceiling',
    seventh.chip.crackles === LONG_FRY_CRACKLES && !seventh.crackled, seventh.chip.crackles);
}

// 4) GOLDEN DOES NOT MOVE. The failure this guards against is the obvious
//    implementation — swapping MAX_CRACKLES for the ceiling everywhere,
//    including inside isGolden — which would silently make the angel's feed
//    and the Sous Chef's auto-dip need SIX crackles for anyone who bought
//    the jar. That is the bug that turns this upgrade into a nerf.
{
  check('five crackles is golden', isGolden(atCrackles(GOLDEN_CRACKLES)));
  check('four is not', !isGolden(atCrackles(GOLDEN_CRACKLES - 1)));
  // isGolden takes no ceiling and must not gain one: goldenness is a
  // property of the chip, never of what its owner has bought.
  check('isGolden ignores the raised ceiling entirely',
    isGolden(atCrackles(GOLDEN_CRACKLES)) === isGolden(atCrackles(LONG_FRY_CRACKLES)));
}

// 5) THE FLAME FOLLOWS THE CEILING, NOT GOLDEN. overcookOff puts the burner
//    out when there is "nothing left to hurry". With the jar there IS
//    something left at golden — the sixth crackle — so a flame that dies at
//    five would silently switch itself off at exactly the moment the new
//    decision begins, and the player would never see why.
{
  const golden = [atCrackles(GOLDEN_CRACKLES)];
  check('without the jar the flame goes out at golden', overcookOff(0, golden) === null);
  check('with the jar it keeps burning at golden',
    overcookOff(0, golden, LONG_FRY_CRACKLES) === 0, overcookOff(0, golden, LONG_FRY_CRACKLES));
  check('and goes out at the raised ceiling',
    overcookOff(0, [atCrackles(LONG_FRY_CRACKLES)], LONG_FRY_CRACKLES) === null);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
