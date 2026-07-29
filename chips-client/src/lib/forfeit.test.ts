/**
 * WHAT A REFUSAL COSTS, stated before the press.
 *
 * `burn` forfeits every rung above the refused one — the fold's rule, and a
 * correct one. The player was never told. On 2026-07-28 the operator refused a
 * rung, then sat on 4.6M crumbs unable to buy the 4M jar above it with nothing
 * anywhere in the game explaining why.
 *
 * `forfeitsOnRefuse` is what the button says out loud. It is DERIVED from
 * UPGRADE_CHAINS — the same list the fold reads — so it cannot drift from what
 * actually happens. These checks are mostly about that: that it agrees with
 * the fold's own gate rather than reimplementing it.
 *
 * Run: npx tsx src/lib/forfeit.test.ts
 */
import { forfeitsOnRefuse, UPGRADES, UPGRADE_CHAINS } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}
const labels = (keys: string[]) => keys.map((k) => UPGRADES[k].label);

/* ── 1. An unchained jar costs only itself ─────────────────────────────── */
{
  check('refusing the Sous Chef forfeits nothing else',
    forfeitsOnRefuse('autodip', new Set()).length === 0,
    forfeitsOnRefuse('autodip', new Set()));
}

/* ── 2. A rung takes everything above it ───────────────────────────────── */
{
  const chain = UPGRADE_CHAINS.find((c) => c.length >= 4)!;
  const [r0, r1] = chain;
  const got = forfeitsOnRefuse(r1, new Set([r0]));
  check(`refusing ${r1} names every rung above it`,
    JSON.stringify(got) === JSON.stringify(labels(chain.slice(2))), { got, chain });

  // The last rung has nothing above it — a refusal there costs only itself.
  const last = chain[chain.length - 1];
  check('refusing the TOP rung forfeits nothing further',
    forfeitsOnRefuse(last, new Set(chain.slice(0, -1))).length === 0);
}

/* ── 3. A rung you ALREADY OWN above the refusal is not lost ───────────── */
{
  // Not reachable in a real run (rungs buy in order), but the helper must not
  // claim to take something already in hand if the catalog is ever retuned.
  const chain = UPGRADE_CHAINS.find((c) => c.length >= 3)!;
  const owned = new Set([chain[0], chain[2]]);
  const got = forfeitsOnRefuse(chain[1], owned);
  check('an owned rung above the refusal is not listed as lost',
    !got.includes(UPGRADES[chain[2]].label), got);
}

/* ── 4. IT MUST AGREE WITH THE FOLD'S GATE ─────────────────────────────── */
{
  // The fold rejects a `buy` whose prefix is not fully owned. So for every
  // chain, refusing rung i must forfeit EXACTLY the jars that a later buy
  // would be refused for — no more (crying wolf) and no fewer (the bug).
  let mismatches = 0;
  for (const chain of UPGRADE_CHAINS) {
    for (let i = 0; i < chain.length; i++) {
      const owned = new Set(chain.slice(0, i));          // prefix bought, rung i refused
      const claimed = forfeitsOnRefuse(chain[i], owned);
      // Independently: which rungs can never be bought now? Every one above i,
      // because rung i is never owned and each buy needs its whole prefix.
      const trulyLost = labels(chain.slice(i + 1));
      if (JSON.stringify(claimed) !== JSON.stringify(trulyLost)) mismatches++;
    }
  }
  check('the warning matches the fold\'s buy gate on every rung of every chain',
    mismatches === 0, { mismatches });
}

/* ── 5. Unknown keys do not throw ──────────────────────────────────────── */
{
  let threw = false;
  try { forfeitsOnRefuse('no-such-jar', new Set()); } catch { threw = true; }
  check('an unknown key returns empty rather than throwing', !threw);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
