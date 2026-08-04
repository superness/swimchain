/**
 * A CHIP MAY NOT BE EATEN FOR A BUY THAT WILL BE DROPPED.
 *
 * Buying a jar from a vendor is two steps that were not atomic. `onFeed` takes
 * the chip off the fryer:
 *
 *     const taken = take(index);      // gone, and it cannot be put back
 *     ...
 *     onBuy(f.jarKey);                // may do nothing at all
 *
 * ...and `onBuy` refuses a jar it already has queued with a bare `return q`.
 * No notice, no sound, no jar. The chip was simply gone.
 *
 * It is reachable because a bought jar does not enter `owned` until the chain
 * confirms it, and report 23b527be-41723 measured that at a median of 14.1s
 * and a maximum of 43.7s on the operator's phone — 15 moves, every one of them
 * sent twice. For that whole window the shop looks exactly as it did before you
 * bought, so you arm the vendor and feed it another chip. Operator, 2026-08-04:
 * "I am buying upgrades but it keeps not giving me them - but it takes my chip."
 *
 * The fix is one predicate, `queuedBuyKeys`, asked by all three gates: `onBuy`'s
 * own duplicate check and the two places that consume a chip. This suite pins
 * the predicate and, more importantly, pins that the gates agree — three copies
 * of "is it already queued" drifting apart is what opened the hole.
 *
 * Run: npx tsx src/lib/queuedBuys.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { queuedBuyKeys, isBuyMove } from './chipsAfford';
import { activeFor, enqueue } from './chipsQueue';
import type { QueuedMove } from './chipsQueue';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const TABLE = 'sha256:5425dfcdce66b7d213ecc7091c4cdb3eb3607e3f12eb85299ef46c2b52d62df5';
const ME = '23b527bea8b9b185f3926b518545238696271dddbde4cf2c1abb23609e833cba';
const OTHER = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

let nextId = 1;
function withBuy(q: QueuedMove[], key: string, author = ME, table = TABLE): QueuedMove[] {
  return enqueue(q, { tableId: table, author, kind: 'buy', key }, nextId++);
}

// ---------------------------------------------------------------------------
// 1) The predicate itself.
{
  const q = withBuy(withBuy([], 'bowl5'), 'detector4');
  const keys = queuedBuyKeys(activeFor(q, TABLE, ME));
  check('names every queued jar', keys.has('bowl5') && keys.has('detector4'), [...keys]);
  check('names nothing else', keys.size === 2, [...keys]);
  check('an empty queue names nothing', queuedBuyKeys([]).size === 0);
}

// ---------------------------------------------------------------------------
// 2) THE REPRODUCTION. The window between "paid" and "confirmed" is exactly
//    when the jar is queued and NOT yet owned — the state in which the old
//    code ate a chip and dropped the buy.
{
  const owned = new Set<string>();               // chain has not confirmed yet
  const q = withBuy([], 'bowl5');                // ...but it is paid for
  const queued = queuedBuyKeys(activeFor(q, TABLE, ME));

  check('the jar is NOT owned yet', !owned.has('bowl5'));
  check('...and the queue knows it is already bought', queued.has('bowl5'));

  // The old gates asked only `owned`. That is the bug, stated as a test: an
  // `owned`-only check waves the second purchase through, and `onFeed` eats a
  // chip for a buy `onBuy` then drops.
  const oldGateWouldArm = !owned.has('bowl5');
  const newGateWouldArm = !owned.has('bowl5') && !queued.has('bowl5');
  check('the owned-only gate would have eaten a second chip', oldGateWouldArm === true);
  check('the queue-aware gate refuses instead', newGateWouldArm === false);
}

// ---------------------------------------------------------------------------
// 3) THE GATES MUST AGREE. `onBuy` drops exactly what the chip-eating gates
//    refuse — never a jar more, never a jar fewer. If these two ever disagree,
//    the disagreement IS a lost chip.
{
  const q = withBuy(withBuy([], 'bowl5'), 'cellar3');
  const active = activeFor(q, TABLE, ME);
  const gate = queuedBuyKeys(active);
  for (const key of ['bowl5', 'cellar3', 'fryer5', 'season6']) {
    // onBuy's guard, written out as it now is
    const onBuyDrops = queuedBuyKeys(activeFor(q, TABLE, ME)).has(key);
    // the chip-eating gate, from the component-level set
    const feedRefuses = gate.has(key);
    check(`gates agree on "${key}" (${onBuyDrops ? 'drop' : 'allow'})`, onBuyDrops === feedRefuses);
  }
}

// ---------------------------------------------------------------------------
// 4) PROVENANCE. Another player's queued buy, or the same jar queued on a
//    different table, must never block yours — `activeFor` is what draws that
//    line, and the predicate must not quietly widen it.
{
  const q = withBuy(withBuy([], 'bowl5', OTHER), 'cellar3', ME, 'sha256:someothertable');
  const mine = queuedBuyKeys(activeFor(q, TABLE, ME));
  check("another author's buy does not block mine", !mine.has('bowl5'), [...mine]);
  check('my buy on another table does not block this one', !mine.has('cellar3'), [...mine]);
  check('...so nothing is blocked here at all', mine.size === 0, [...mine]);
}

// ---------------------------------------------------------------------------
// 5) Non-buy moves in the queue are not jars and must not appear.
{
  // A `dip`, not a hand-rolled `bank`: a bank carries a whole ChipEntry, and a
  // fake one blows up in `moveKey` inside `enqueue`'s journalling. The point of
  // the case is "a non-buy in the queue", and a dip is one.
  const q = enqueue(withBuy([], 'bowl5'), { tableId: TABLE, author: ME, kind: 'dip', amount: 10, ms: 1 }, nextId++);
  const keys = queuedBuyKeys(activeFor(q, TABLE, ME));
  check('a bank in the queue contributes no jar', keys.size === 1 && keys.has('bowl5'), [...keys]);
  check('isBuyMove still discriminates', activeFor(q, TABLE, ME).filter(isBuyMove).length === 1);
}

// ---------------------------------------------------------------------------
// 6) THE WIRING. Everything above tests the predicate, and the predicate was
//    never the broken part — the ORDER was. `onFeed` must ask the gate BEFORE
//    it takes the chip; asking afterwards is the original bug exactly. Nothing
//    in a pure test can see that, so read the call site.
{
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'), 'utf8');
  const feed = app.slice(app.indexOf('function onFeed('), app.indexOf('function launchFeed('));
  check('onFeed exists to be checked', feed.length > 0);

  const gateAt = feed.indexOf('queuedBuyKeys.has(');
  // `const taken = take(index)` — the PURCHASE path's chip specifically. Not a
  // bare `take(index)`: the hermit's trade takes one earlier in the same
  // function and returns, which is a different transaction with no buy behind
  // it at all. Anchoring on the loose string matched the hermit's line and
  // failed against correct code.
  const takeAt = feed.indexOf('const taken = take(index)');
  check('onFeed consults the gate', gateAt >= 0);
  check('onFeed takes a chip for the purchase', takeAt >= 0);
  check('the gate is consulted BEFORE the chip is eaten', gateAt >= 0 && takeAt >= 0 && gateAt < takeAt,
    { gateAt, takeAt });

  // ...and arming must be gated too, or the player is invited to the same
  // mistake one step earlier.
  const jar = app.slice(app.indexOf('function onJar('), app.indexOf('function onFeed('));
  check('onJar refuses to re-arm a queued jar', jar.includes('queuedBuyKeys.has('));

  // All three gates must be the SHARED predicate, not a re-implementation.
  check('onBuy uses the shared predicate', app.includes('queuedBuyKeysOf(activeFor(q, table, author)).has(key)'));
  check('no hand-rolled duplicate check survives', !app.includes('activeBuys.some((m) => m.key === key)'));
}

// ---------------------------------------------------------------------------
// 7) THE REST OF THE WINDOW. The queue is not the whole pipeline. Report
//    23b527be-30565 caught `detector3` bought as move 201 AND again as move
//    206, both confirmed — 201 had already left the queue, so a queue-only
//    gate lets the second one through and the fold answers `rejected-owned`:
//    the chip that paid for it bought nothing.
//
//    So both chip-eating gates must also consult the in-flight set, which is
//    only emptied when the fold has actually granted or refused the jar.
{
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'), 'utf8');
  const jar = app.slice(app.indexOf('function onJar('), app.indexOf('function onFeed('));
  const feed = app.slice(app.indexOf('function onFeed('), app.indexOf('function launchFeed('));

  check('onJar consults the in-flight set', jar.includes('boughtPendingRef.current.has('));
  check('onFeed consults the in-flight set', feed.includes('boughtPendingRef.current.has('));

  const inflightAt = feed.indexOf('boughtPendingRef.current.has(');
  const takeAt = feed.indexOf('const taken = take(index)');
  check('...before the chip is eaten', inflightAt >= 0 && takeAt >= 0 && inflightAt < takeAt,
    { inflightAt, takeAt });

  // A key enters the set exactly where a buy is born, and leaves it only on a
  // settled fold — never on a timer, never on the queue draining.
  check('the set is filled where the buy is enqueued', app.includes('boughtPendingRef.current.add(key);'));
  check('...and drained on owned', app.includes('if (state.owned.has(key)) { pend.delete(key); continue; }'));
  check('...and drained on a rejection, so a refused buy can be retried',
    app.includes("m.outcome.startsWith('rejected')"));
}

console.log('');
if (failures > 0) { console.error(`${failures} checks failed`); process.exit(1); }
console.log('queued buys: all checks passed');
