/**
 * The shared buy-affordability predicate. Run: npx tsx src/lib/chipsAfford.test.ts
 *
 * This is the fix for a real bug: `onBuy` used to sum the cost of EVERY
 * active queued buy as "committed" and subtract that from `crumbsNow` — but
 * `crumbsNow` (the fold's own number) already has every FOLDED buy's cost
 * taken out. The result double-charged a queued buy for its entire
 * queued-plus-settling life: a lit, enabled jar (Shelf used a different,
 * simpler formula) silently did nothing when clicked.
 */
import { canAffordBuy, pendingBuyCost, isBuyMove, type BuyMove } from './chipsAfford';
import type { QueuedMove } from './chipsQueue';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)) : ''}`);
  }
}

const COST: Record<string, number> = { season1: 30_000, airtight: 70_000, bowl1: 60_000 };
const costOf = (key: string): number | undefined => COST[key];

const buy = (id: number, key: string): BuyMove => ({ id, tableId: 't', author: 'a', kind: 'buy', key });

/* ── 1) A buy the fold already reflects is not charged again ─────────────
 *
 * The exact repro from the review: 100,000 crumbs, buy `season1` (30,000)
 * queued and then FOLDED (its id lands in `foldedIds`), leaving crumbsNow at
 * 70,000. Buying `airtight` (70,000) must succeed — `committed` for it must
 * be 0, not 30,000. */
{
  const foldedIds = new Set([1]); // season1 (id 1) already folded into crumbsNow
  const activeBuys: BuyMove[] = [buy(1, 'season1')]; // still in the queue, settling or not yet retired
  const committed = pendingBuyCost(activeBuys, foldedIds, costOf);
  check('a buy already consumed by the fold contributes nothing to committed', committed === 0, committed);

  const crumbsNow = 70_000; // 100,000 - season1's 30,000, per the fold
  check('the next jar is affordable once its own committed cost is 0, not double-charged',
    canAffordBuy(crumbsNow, committed, 70_000), { crumbsNow, committed });
}

/* ── 2) Two different jars clicked in one tick cannot both queue when only
 *      one is affordable ──────────────────────────────────────────────────
 *
 * Neither buy has been folded yet (same tick, before any re-fold), so
 * `foldedIds` is empty for both checks — mirroring onBuy's functional
 * updater, where the SECOND click's committed sum must include the FIRST
 * click's not-yet-folded cost. */
{
  const foldedIds = new Set<number>(); // nothing folded yet — same-tick race
  const crumbsNow = 90_000; // enough for either jar alone, not both (30,000 + 70,000 > 90,000)

  // First click: season1 (30,000). Nothing else queued yet.
  const beforeFirst: BuyMove[] = [];
  const committed1 = pendingBuyCost(beforeFirst, foldedIds, costOf);
  const afford1 = canAffordBuy(crumbsNow, committed1, COST.season1);
  check('first click (season1, 30,000) is affordable against the full balance', afford1, { committed1 });

  // Second click, same tick: airtight (70,000). season1 is now in the queue
  // (the first click's updater already applied) but NOT in foldedIds yet.
  const beforeSecond: BuyMove[] = [buy(1, 'season1')];
  const committed2 = pendingBuyCost(beforeSecond, foldedIds, costOf);
  check('the second click sees the first\'s cost as committed (not yet folded)', committed2 === COST.season1, committed2);
  const afford2 = canAffordBuy(crumbsNow, committed2, COST.airtight);
  check('only one of two same-tick buys is affordable when both cannot fit',
    afford1 === true && afford2 === false, { afford1, afford2, committed1, committed2 });
}

/* ── 3) Shelf and onBuy must never disagree — because it is the SAME
 *      function, called with the same two numbers ──────────────────────── */
{
  const crumbsNow = 50_000;
  const committed = 10_000;
  const cost = 40_000;
  // "Shelf's call" and "onBuy's call" are literally this one function; two
  // separate invocations with identical inputs must agree (no hidden mutable
  // state inside the predicate).
  const shelfAnswer = canAffordBuy(crumbsNow, committed, cost);
  const onBuyAnswer = canAffordBuy(crumbsNow, committed, cost);
  check('the same inputs give the same answer both times (no hidden state)', shelfAnswer === onBuyAnswer);
  check('and that answer is the right one (50,000 - 10,000 >= 40,000)', shelfAnswer === true);

  const cost2 = 40_001;
  check('one crumb short is correctly unaffordable', canAffordBuy(crumbsNow, committed, cost2) === false);
}

/* ── 4) `pendingBuyCost` ignores bank moves and non-active entries by
 *      construction — it only ever receives an already-`isBuyMove`-filtered,
 *      already-`activeFor`-filtered array; this pins that the filter itself
 *      does what its name says. */
{
  const mixed: QueuedMove[] = [
    { id: 1, tableId: 't', author: 'a', kind: 'bank', chip: { ms: 1, bits: 10, nonce: 0n } },
    buy(2, 'season1'),
  ];
  const buysOnly = mixed.filter(isBuyMove);
  check('isBuyMove keeps only buy moves', buysOnly.length === 1 && buysOnly[0].id === 2, buysOnly.map((m) => m.id));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
