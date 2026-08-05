/**
 * THE SHOP MUST NOT OFFER A JAR THAT IS ALREADY ON ITS WAY.
 *
 * Operator, 2026-08-04, after tapping one and being told "this one is already
 * bought — it is still going through": "ok so just dont show me the option to
 * buy it?"
 *
 * `onBuy` and `onFeed` had BOTH guarded on `queuedBuyKeys ∪ boughtPendingRef`
 * since the chip-eating bug. The SHELF never asked — so the stall kept offering
 * a jar that every downstream gate would refuse. Best case that costs a tap and
 * a confusing notice; worst case the player arms a vendor and the chip is eaten
 * on the way to a purchase that cannot happen.
 *
 * `pending` is REQUIRED on `openJarsOf`/`stallStatus`, exactly like `declined`
 * before it, for the reason that file already gives: a default silently
 * reintroduces the bug at each new call site, which is how it got in.
 *
 * Run: npx tsx src/lib/shelfPending.test.ts
 */
import { openJarsOf, stallStatus, vendorOf, CREW } from './crew';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const none: ReadonlySet<string> = new Set();
const DEEP = 99; // deep enough that availability never masks the real filter

/* ── 1. A QUEUED JAR LEAVES THE SHELF ──────────────────────────────────── */
{
  // scoop sells the opening ladder; take whichever jar he offers first.
  const scoop = CREW.find((m) => m.id === 'scoop')!;
  const before = openJarsOf('scoop', new Set(), DEEP, none, none);
  check('scoop has something to sell to start with', before.length > 0,
    before.map((u) => u.key));

  const inFlight = before[0].key;
  const after = openJarsOf('scoop', new Set(), DEEP, none, new Set([inFlight]));
  check(`the in-flight jar (${inFlight}) is no longer offered`,
    !after.some((u) => u.key === inFlight), after.map((u) => u.key));
  check('...and it is the ONLY one removed',
    after.length === before.length - 1, { before: before.length, after: after.length });
  check('scoop sells it in the first place (fixture is honest)',
    scoop.sells.includes(inFlight), scoop.sells);
}

/* ── 2. A STALL WHOSE LAST JAR IS IN FLIGHT IS NOT "OPEN" ──────────────── */
{
  // Offering an entrance to an empty stall is the same lie as offering the jar.
  const v = CREW.find((m) => m.sells.length > 0)!;
  const allInFlight = new Set(v.sells);
  const status = stallStatus(v.id, new Set(), DEEP, none, allInFlight);
  check('a stall with every jar in flight does not read as open',
    status.kind !== 'open', status);

  const open = stallStatus(v.id, new Set(), DEEP, none, none);
  check('...while the same stall with nothing in flight IS open',
    open.kind === 'open', open);
}

/* ── 3. PENDING IS NOT THE SAME AS OWNED OR DECLINED ───────────────────── */
{
  // A pending buy can still fail (rejected-cost, rejected-order). It must not
  // be recorded as owned or as refused — it is simply not for sale right now.
  const v = vendorOf('season1');
  check('season1 has a vendor', v !== undefined, v?.id);
  if (v) {
    const withPending = openJarsOf(v.id, new Set(), DEEP, none, new Set(['season1']));
    const withOwned = openJarsOf(v.id, new Set(['season1']), DEEP, none, none);
    // Both hide it; the point is that `pending` achieves it WITHOUT lying
    // about ownership anywhere else in the fold.
    check('pending hides season1', !withPending.some((u) => u.key === 'season1'));
    check('owned hides season1 too (control)', !withOwned.some((u) => u.key === 'season1'));
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
