/**
 * A SETTLING MOVE IS FOLDED TWICE, AND MUST ONLY COUNT ONCE.
 *
 * This is the bug the ⚑ report caught on 2026-07-29 and the reason every
 * check here folds the SAME move twice on purpose.
 *
 * Two real bugs (dip, broke) and one that only looked like one (tip — safe by
 * accident; see the note at section 3). Sections 6-7 are two MEASURED cases
 * from the live mainnet table on 2026-07-30: the node serving one reply twice
 * under one content id, and two real dips that collided on a single ms.
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

/* ── 6) THE NODE'S OWN DUPLICATE. Measured on the live mainnet table
       2026-07-30: get_replies returned `dip 54750#1785375989160~`
       (sha256:2d4606d6a3ce9, height 1264) TWICE — the SAME content id as two
       separate entries. Content is content-addressed, so that is one move
       listed twice, and it was a PERMANENT overcount: every confirmed-only
       fold paid it twice, forever, with no optimistic copy involved. ──────── */
{
  const body = dipBody(54_750, 1785375989160);
  const one = rep(body, 1264);
  // The SAME object twice, exactly as the node served it — not a second copy
  // with its own id, which is the settling case section 1 covers.
  const twice = fold([one, one]);
  const once = fold([one]);
  check('a reply listed twice under ONE content id credits once',
    twice.crumbs === once.crumbs && once.crumbs === 54_750,
    { once: once.crumbs, twice: twice.crumbs });
  check('and does not inflate lifetime either',
    twice.lifetimeChips === once.lifetimeChips, { once: once.lifetimeChips, twice: twice.lifetimeChips });
  // Dropped BEFORE folding, not folded and rejected: a duplicate content id is
  // not a move that happened and was refused.
  check('the duplicate is dropped, not recorded as a move',
    twice.moves.length === once.moves.length, twice.moves.map((m) => m.outcome));

  // The guard may not collapse DISTINCT replies that merely look similar.
  const distinct = fold([
    rep(dipBody(1000, 1785375989160), 1264),
    rep(dipBody(1000, 1785375989161), 1264),
  ]);
  check('two distinct content ids both count', distinct.crumbs === 2000, distinct.crumbs);
}

/* ── 7) THE ms COLLISION, measured on the live table 2026-07-30:
       `dip 60300#1785381545497~` AND `dip 6030#1785381545497~` — two DIFFERENT
       dips sharing one ms (two allocators; chipsQueue's known two-tab gap).
       Keying dedup on ms alone would have destroyed one real dip, so the amount
       is part of the key. ────────────────────────────────────────────────── */
{
  const both = fold([
    rep(dipBody(60_300, 1785381545497), 1274),
    rep(dipBody(6_030, 1785381545497), 1274),
  ]);
  check('two real dips that collided on ms BOTH count',
    both.crumbs === 66_330, both.crumbs);
  check('and neither is written off as a duplicate',
    both.moves.filter((m) => m.outcome === 'rejected-duplicate').length === 0,
    both.moves.map((m) => m.outcome));

  // While the settling copy — same ms AND same amount, different content id —
  // is still caught. This is the pair that must not both count.
  const settling = fold([rep(dipBody(60_300, 1785381545497), 1274), rep(dipBody(60_300, 1785381545497))]);
  check('but a settling copy of the same dip still counts once',
    settling.crumbs === 60_300, settling.crumbs);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
