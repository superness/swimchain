/**
 * A SETTLING MOVE IS FOLDED TWICE, AND MUST ONLY COUNT ONCE.
 *
 * This is the bug the ⚑ report caught on 2026-07-29 and the reason every
 * check here folds the SAME move twice on purpose.
 *
 * The settling design (chipsSettling.ts) deliberately keeps an acked move in
 * the queue until its confirmed twin arrives, so for that window both copies
 * are in the fold input. Its header argues this is safe because the second
 * application is a no-op — and then enumerates only banks (`seenProofs`) and
 * buys (`state.owned`). `dip`, `broke` and `tip` came later, all three
 * ACCUMULATE, and none of them self-guarded.
 *
 * What that looked like in production: eight fold regressions in three
 * minutes, with `pollGaps: 0` and `lostMoves: 0` — nothing lost, no poll short
 * — a stable floor and varying peaks. The peak was the inflated number.
 *
 * Run: npx tsx src/lib/chipsEngine.settling.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
// The REAL wire builders, not hand-written strings. A hand-written body that
// fails to parse makes every equality check below pass on 0 === 0 — which is
// exactly what happened on the first run of this file.
import { dipBody, tipBody, brokeBody, buyBody } from './chipsBody';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const OWNER = 'deadbeef';
const TABLE = 'sha256:table';
const header: ChipsHeader = { owner: OWNER, name: 'T', createdAt: 0 } as unknown as ChipsHeader;

let n = 0;
/** A reply. `height` undefined = unconfirmed, i.e. the optimistic copy. */
const rep = (body: string, height?: number): ChipsReply => ({
  content_id: `c${n++}`, author_id: OWNER, body, block_height: height,
} as unknown as ChipsReply);

const fold = (replies: ChipsReply[]) => {
  const verified = new Map(replies.map((r) => [r.content_id, 1]));
  return foldChips(header, TABLE, replies, verified);
};

/* ── 1) THE DIP. Credited twice for the whole settling window. ──────────── */
{
  const body = dipBody(500_000, 1785384000000);
  const once = fold([rep(body, 10)]);
  // The exact production shape: confirmed twin AND the settling copy, both in.
  const both = fold([rep(body, 10), rep(body)]);

  check('one dip credits its amount', once.crumbs === 500_000, once.crumbs);
  check('the SAME dip folded twice credits it ONCE', both.crumbs === once.crumbs,
    { once: once.crumbs, both: both.crumbs });
  check('and does not inflate lifetimeChips either',
    both.lifetimeChips === once.lifetimeChips, { once: once.lifetimeChips, both: both.lifetimeChips });
  check('the second copy is recorded as a duplicate, not silently dropped',
    both.moves.filter((m) => m.outcome === 'rejected-duplicate').length === 1,
    both.moves.map((m) => m.outcome));

  // Two GENUINELY different dips must both count — a dedup that eats real
  // moves would be a far worse bug than the one it fixes.
  const two = fold([rep(dipBody(500_000, 1785384000000), 10), rep(dipBody(500_000, 1785384000001), 11)]);
  check('two dips at DIFFERENT ms both count', two.crumbs === 1_000_000, two.crumbs);
}

/* ── 2) THE BOSS. Double damage = a band at half price. ─────────────────── */
{
  // Get deep enough to have a healthbar boss in front of us, then feed it.
  const setup = [
    // deepBandFloor is in lifetimeChips, not crumbs: band 1 needs 4,000,000
    // chips, i.e. 4.1e9 crumbs. lifetimeChips is NOT bowl-capped (only stored
    // crumbs are), so one dip can legitimately carry it.
    rep(dipBody(4_100_000_000, 1785384000000), 1),
    rep(brokeBody(0, 1785384000100), 2),          // band 0, the porcelain
  ];
  const paid = brokeBody(900_000, 1785384000200);
  const once = fold([...setup, rep(paid, 3)]);
  const both = fold([...setup, rep(paid, 3), rep(paid)]);

  check('one broke pays its chip once', once.paidToBosses > 0, once.paidToBosses);
  check('the SAME broke folded twice pays ONCE',
    both.paidToBosses === once.paidToBosses, { once: once.paidToBosses, both: both.paidToBosses });
  check('and deals its damage once, not double',
    both.bossDamage === once.bossDamage, { once: once.bossDamage, both: both.bossDamage });
  check('so it cannot buy a band it did not earn',
    both.broken === once.broken, { once: once.broken, both: both.broken });
}

/* ── 3) THE TIP. Already safe, and the checks below pass EVEN WITHOUT the
       guard — verified by removing it: the first tip zeroes lifetimeChips and
       tip's own precondition tests lifetimeChips, so the second folds
       `rejected-shallow`. These are here as invariants, NOT as proof the guard
       works, and mutation testing is what revealed the difference. ────────── */
{
  const setup = [rep(dipBody(4_100_000_000, 1785384000000), 1)];
  const tip = tipBody(1785384000300);
  const once = fold([...setup, rep(tip, 2)]);
  const both = fold([...setup, rep(tip, 2), rep(tip)]);

  check('one tip counts one prestige', once.tips === 1, once.tips);
  check('the SAME tip folded twice counts ONE', both.tips === once.tips,
    { once: once.tips, both: both.tips });
  check('and oldSalt does not double', both.oldSalt === once.oldSalt,
    { once: once.oldSalt, both: both.oldSalt });
}

/* ── 4) ORDER MUST NOT MATTER. orderReplies puts unconfirmed last, but the
       guard may not DEPEND on that — a fold whose correctness rests on sort
       order breaks the first time a height arrives late. ─────────────────── */
{
  const body = dipBody(250_000, 1785384000400);
  const a = fold([rep(body, 10), rep(body)]);
  const b = fold([rep(body), rep(body, 10)]);
  check('credited once regardless of which copy is listed first',
    a.crumbs === b.crumbs && a.crumbs === 250_000, { a: a.crumbs, b: b.crumbs });
}

/* ── 5) A BUY still behaves (it self-guards via `owned`) — proof this change
       did not disturb the path that was already correct. ────────────────── */
{
  const setup = [rep(dipBody(5_000_000, 1785384000000), 1)];
  const buy = buyBody('season1', 1785384000500);
  const once = fold([...setup, rep(buy, 2)]);
  const both = fold([...setup, rep(buy, 2), rep(buy)]);
  check('a buy is charged once', once.owned.has('season1'), [...once.owned]);
  check('and folding it twice charges once', both.crumbs === once.crumbs,
    { once: once.crumbs, both: both.crumbs });
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
