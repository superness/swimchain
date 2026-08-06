/**
 * A REFUSED JAR IS GONE FOR THE RUN, AND THE SHOP MUST AGREE WITH THE FOLD.
 *
 * Reported live, 2026-07-28: "my feedback was that it was offering the upgrade
 * after I had declined and already gotten the crumbs."
 *
 * The fold was right — `burn` adds the key to `state.declined` and every later
 * `buy` of it is rejected. The SHOP was wrong: `openJarsOf` and `shelfStalls`
 * asked only "do you own it?", and a refused jar is not owned, so it went
 * straight back on the shelf at full price for something that could never be
 * delivered.
 *
 * MUTATION-TESTED against the pre-fix predicate (`owned` only). Exactly three
 * checks fail against it, and they are the three that carry this fix:
 *   - "...and is GONE once refused"                    (the reported bug)
 *   - "the refused rung is not offered"
 *   - "a stall emptied BY REFUSAL reports refused"
 *
 * The rest pass both ways and are labelled CONTROL or GUARD below. They are
 * kept deliberately — a control is what proves the failing checks are about
 * `declined` and not some unrelated gate — but none of them is evidence that
 * this fix works, and none should ever be cited as such.
 *
 * Run: npx tsx src/lib/refused.test.ts
 */
import { openJarsOf, stallStatus, vendorOf } from './crew';
import { UPGRADES, UPGRADE_CHAINS } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const DEEP = 99;                       // every jar past its layer gate
const none: ReadonlySet<string> = new Set();
const has = (jars: { key: string }[], k: string) => jars.some((u) => u.key === k);

/* ── 1. THE REPORTED BUG, exactly. Sous Chef is UNCHAINED. ──────────────── */
{
  const v = vendorOf('autodip')!;
  const before = openJarsOf(v.id, new Set(), DEEP, none, none);
  check('the Sous Chef is on sale to begin with', has(before, 'autodip'),
    before.map((u) => u.key));

  // MUTANT: with the old `owned`-only predicate this stays true and the check
  // fails — which is the bug the operator hit, reproduced.
  const after = openJarsOf(v.id, new Set(), DEEP, new Set(['autodip']), none);
  check('...and is GONE once refused', !has(after, 'autodip'), after.map((u) => u.key));

  // Refusing one jar must not clear the vendor's other stock.
  const others = v.sells.filter((k) => k !== 'autodip');
  if (others.length > 0) {
    check('refusing one jar leaves the rest of the stall alone',
      others.every((k) => {
        const chain = UPGRADE_CHAINS.find((c) => c.includes(k));
        // only unchained/head jars are expected on sale from an empty `owned`
        return chain && chain[0] !== k ? true : has(after, k);
      }), after.map((u) => u.key));
  }
}

/* ── 2. A REFUSED RUNG ENDS ITS LADDER — the fold forfeits everything above,
       so the shelf must not keep offering the rung, nor skip past it. ───── */
{
  const chain = UPGRADE_CHAINS.find((c) => c.length >= 3)!;
  const [r0, r1, r2] = chain;
  const owned = new Set([r0]);           // first rung bought, second refused
  const declined = new Set([r1]);

  const v1 = vendorOf(r1)!;
  const open1 = openJarsOf(v1.id, owned, DEEP, declined, none);
  check(`the refused rung (${r1}) is not offered`, !has(open1, r1), open1.map((u) => u.key));

  // GUARD, not proof. Nothing above a refusal may appear either — but the
  // pre-existing "is this the next unowned rung?" test already excludes it
  // (a refused rung is never owned, so it stays `next` and blocks the rest).
  // Verified: this passes against the buggy predicate too. It is here to
  // catch a FUTURE change that "helpfully" skips past refused rungs, which
  // would sell a jar the fold rejects for order.
  const v2 = vendorOf(r2)!;
  const open2 = openJarsOf(v2.id, owned, DEEP, declined, none);
  check(`GUARD: nor is anything above it (${r2})`, !has(open2, r2), open2.map((u) => u.key));

  // Control: without the refusal that same rung IS for sale. This is what
  // proves the two checks above are about `declined` and not about some
  // unrelated gate.
  const control = openJarsOf(v1.id, owned, DEEP, none, none);
  check(`control — un-refused, ${r1} is on sale`, has(control, r1), control.map((u) => u.key));
}

/* ── 3. THE STALL MUST NOT CALL A REFUSAL A PURCHASE ────────────────────── */
{
  // A vendor whose entire stock is unchained, so "all settled" is reachable.
  const v = vendorOf('autodip')!;
  const settled = new Set(v.sells.filter((k) => k !== 'autodip'));
  const st = stallStatus(v.id, settled, DEEP, new Set(['autodip']), none);
  check('a stall emptied BY REFUSAL reports refused, not sold-out', st.kind === 'refused', st);

  // And genuinely owning the lot still reports sold-out.
  const allOwned = stallStatus(v.id, new Set(v.sells), DEEP, none, none);
  check('genuinely owning the lot still reports sold-out', allOwned.kind === 'sold-out', allOwned);

  // `locked` must never name a jar you refused as the thing to "bring".
  for (const m of [v]) {
    const s = stallStatus(m.id, new Set(), DEEP, new Set(m.sells.slice(0, 1)), none);
    check('locked never names a refused jar as what you need',
      s.kind !== 'locked' || !m.sells.slice(0, 1).includes(s.needs.key), s);
  }
}

/* ── 4. Refusal is per-run: nothing here may leak into the catalog ──────── */
{
  const before = Object.keys(UPGRADES).length;
  openJarsOf(vendorOf('autodip')!.id, new Set(), DEEP, new Set(['autodip']), none);
  check('asking the shop never mutates the catalog', Object.keys(UPGRADES).length === before);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
