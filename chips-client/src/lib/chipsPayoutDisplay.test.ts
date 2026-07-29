/**
 * The display payout feedback must agree with the REAL fold, exactly — same
 * discipline as sogProjection.test.ts: restating a formula would pass even if
 * the fold's own resolution changed, so every check here is pinned against
 * `foldChips`/`payoutFor` themselves, never a hand-copied expectation.
 *
 * Run: npx tsx src/lib/chipsPayoutDisplay.test.ts
 */
import { foldChips, parseMove, payoutFor, type ChipsReply, type ChipsHeader, type ChipsState } from './chipsEngine';
import { proofKey } from './proofKey';
import { newBankedMoves, actualGains, worthIfBankedNow, type BankedMove } from './chipsPayoutDisplay';
import { BANK_MIN_BITS, GOLDEN_BITS, CONGEAL_GAP_MS, DIP_TIERS, START_BOWL_CAP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

let nonceSeq = 0;
/** A confirmed bank reply for `bits`, using the SAME batch grammar the real
 *  client always sends (chipsBody.ts's `bankBatchBody`, called by both
 *  chipsPending.ts and chipsSender.ts) — never the v1 two-field form — so the
 *  chip's `ms` is independent of the reply's authoring ms, exactly as in
 *  production. */
const bank = (bits: number, cid: string, ms = 1_000_000, blockHeight: number | null = 1): ChipsReply => ({
  author_id: A,
  body: `bank ${ms}:${bits}:${(++nonceSeq).toString(16)}#${ms + 1}~`,
  block_height: blockHeight, content_id: cid, created_at: ms,
});

/** Verify every chip at exactly its own claimed bits (never re-derived). */
function verifiedExact(rs: ChipsReply[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rs) {
    const p = parseMove(r.body);
    if (p?.kind !== 'bank') continue;
    for (const c of p.chips) m.set(proofKey(TABLE, r.author_id, c.ms, c.nonce), c.bits);
  }
  return m;
}

const baseState = (over: Partial<ChipsState> = {}): ChipsState => ({
  crumbs: 0, lifetimeChips: 0, oldSalt: 0, tips: 0, broken: 0, deepest: 0, char: 0, bowls: 0, paidToBosses: 0, charOwned: new Set(), declined: new Set(), crispest: 0, owned: new Set(),
  bowlCap: START_BOWL_CAP, seasoningNum: 1, seasoningDen: 1, fryers: 1,
  goldenBits: GOLDEN_BITS, airtight: false, sogBonus: 0, doubleDipMod: 0, dipIndex: 0,
  lastConfirmedAt: 0, lastBankAt: 0, unverifiedBanks: 0, moves: [],
  ...over,
});

// 1) THE LINKAGE TEST: replaying `actualGains` over the fold's OWN recorded
//    payouts, from crumbs=0, must reproduce the fold's OWN final `state.crumbs`
//    exactly — including the chip whose payout the cap clips.
{
  // 10 bits -> 4,000; 14 bits -> 64,000; 18 bits -> golden 1000*2^10*5/2 =
  // 2,560,000. Running: 4,000 -> 68,000 -> capped at 1,000,000 (START_BOWL_CAP
  // since the 2026-07-27 pot retune raised it — the last bank must still be
  // big enough to actually hit the rim or the clip check below is vacuous).
  const replies = [bank(10, 'a1', 1), bank(14, 'a2', 2), bank(18, 'a3', 3)];
  const s = foldChips(H, TABLE, replies, verifiedExact(replies));
  check('sanity: all three banks succeeded', s.moves.every((m) => m.outcome === 'banked'), s.moves);

  const bankedMoves: BankedMove[] = s.moves.map((m) => ({ ms: m.ms, bits: m.bits!, crumbs: m.crumbs!, doubleDip: m.doubleDip === true }));
  const events = actualGains(0, s.bowlCap, bankedMoves);
  const totalGained = events.reduce((a, e) => a + e.gained, 0);

  check('actualGains reproduces the folds own final crumbs exactly', totalGained === s.crumbs, { totalGained, folded: s.crumbs });
  check('an untouched-by-the-cap chip gains exactly its notional payout', events[0].gained === events[0].notional, events[0]);
  check(
    'the cap really did clip the last chip (not a vacuous pass)',
    events[2].gained < events[2].notional && events[2].gained >= 0,
    events[2]
  );
}

// 2) newBankedMoves: dedupe by ms, never by array position.
{
  const replies = [bank(10, 'b1', 10), bank(11, 'b2', 11)];
  const s = foldChips(H, TABLE, replies, verifiedExact(replies));
  const bankedMs = s.moves.map((m) => m.ms);

  check('two fresh banks both surface as new', newBankedMoves(s.moves, new Set()).length === 2);
  const fresh = newBankedMoves(s.moves, new Set([bankedMs[0]]));
  check('an already-announced ms is excluded', fresh.length === 1 && fresh[0].ms === bankedMs[1], fresh);
}

// 3) THE PENDING -> CONFIRMED TRANSITION: the exact scenario the feature
//    exists to get right. The SAME chip (same ms/nonce/bits) folds once as a
//    synthetic pending reply and, later, once more as the real confirmed
//    reply that replaces it. A move must announce itself exactly once.
{
  const ms = 555_555;
  const nonce = 0xabcdefn;
  const key = proofKey(TABLE, A, ms, nonce);
  const bodyFor = (at: number) => `bank ${ms}:12:${nonce.toString(16)}#${at}~`;

  const pending: ChipsReply = { author_id: A, body: bodyFor(9_000), block_height: null, content_id: 'pending:1', created_at: 9_000 };
  const sPending = foldChips(H, TABLE, [pending], new Map([[key, 12]]));
  const announced = new Set(newBankedMoves(sPending.moves, new Set()).map((m) => m.ms));
  check('the pending copy is seen once, keyed on ms', announced.size === 1 && announced.has(ms), [...announced]);

  const confirmed: ChipsReply = { author_id: A, body: bodyFor(9_500), block_height: 2, content_id: 'sha256:real', created_at: 9_500 };
  const sConfirmed = foldChips(H, TABLE, [confirmed], new Map([[key, 12]]));
  check('the confirmed twin really does carry the SAME ms', sConfirmed.moves[0].ms === ms, sConfirmed.moves[0]);
  const stillFresh = newBankedMoves(sConfirmed.moves, announced);
  check('...so it does not re-announce', stillFresh.length === 0, stillFresh);
}

// 4) worthIfBankedNow: below BANK_MIN_BITS is "not yet", not a misleading number.
{
  const s = baseState();
  check('below BANK_MIN_BITS is not worth anything', worthIfBankedNow(s, BANK_MIN_BITS - 1, 1000) === null);
  check('exactly BANK_MIN_BITS is a real number', worthIfBankedNow(s, BANK_MIN_BITS, 1000) !== null);
}

// 5) worthIfBankedNow matches payoutFor exactly while there is headroom to
//    spare, and reports itself as uncapped.
{
  const s = baseState();
  const w = worthIfBankedNow(s, 12, 1000);
  check('with a near-empty bowl, worth matches payoutFor exactly', w?.worth === payoutFor(s, 12, 1000), { w, real: payoutFor(s, 12, 1000) });
  check('...and is not reported as capped', w?.capped === false, w);
}

// 6) worthIfBankedNow: the SAME bowl-cap truth Part 1 applies to a live chip.
{
  const s = baseState({ crumbs: START_BOWL_CAP - 500, lastConfirmedAt: 1000 });
  const w = worthIfBankedNow(s, 20, 1000); // a payout far larger than the 500 headroom left
  check('near the rim, worth is the true headroom, never the notional payout', w?.worth === 500, w);
  check('...and IS reported as capped', w?.capped === true, w);
}

// 7) worthIfBankedNow legitimately changes over time with no change to the
//    chip itself — congeal is a real fold behaviour, not a display glitch.
{
  const quesoIdx = DIP_TIERS.findIndex((t) => t.congeal);
  check('sanity: a congeal-bearing dip tier exists', quesoIdx >= 0, quesoIdx);
  const s = baseState({ dipIndex: quesoIdx, lastBankAt: 1_000_000 });
  const before = worthIfBankedNow(s, 12, 1_000_000 + CONGEAL_GAP_MS - 1);
  const after = worthIfBankedNow(s, 12, 1_000_000 + CONGEAL_GAP_MS);
  check('congeal doubles the SAME chip\'s worth once the gap is crossed', after?.worth === (before?.worth ?? 0) * 2, { before, after });
}

console.log(failures === 0 ? '\nchipsPayoutDisplay: PASS' : `\nchipsPayoutDisplay: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
