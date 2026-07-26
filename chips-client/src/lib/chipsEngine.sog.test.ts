/**
 * Sogginess: hour-boundary decay, the 30-day clamp, the bowl rim, and the
 * fixed dip-then-airtight resolution order.
 * Run: npx tsx src/lib/chipsEngine.sog.test.ts
 */
import { foldChips, parseMove, sogHoursFor, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { proofKey } from './proofKey';
import { SOG_BASE_NUM, SOG_DEN, SOG_MAX_HOURS, START_BOWL_CAP, CRUMBS_PER_CHIP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const HOUR = 3_600_000;
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** Nonce varies per chip — a repeated (ms, nonce) pair folds as a duplicate. */
let nonceSeq = 0;
const bank = (bits: number, cid: string, ms: number): ChipsReply => ({
  author_id: A, body: `bank ${bits} ${(++nonceSeq).toString(16)}#${ms}~`,
  block_height: 1, content_id: cid, created_at: ms,
});
/** proofKey for a single-chip (v1) fixture reply, derived from its own body. */
const keyFor = (r: ChipsReply): string => {
  const p = parseMove(r.body);
  if (p?.kind !== 'bank') throw new Error('keyFor: not a bank reply: ' + r.body);
  return proofKey(TABLE, r.author_id, p.chips[0].ms, p.chips[0].nonce);
};
const vAll = (rs: ChipsReply[], bits: number) => new Map(rs.map((r) => [keyFor(r), bits]));

// 1) Sub-hour gaps do not decay at all; whole hours do.
{
  const rs = [bank(14, 'a1', T0), bank(8, 'a2', T0 + HOUR - 1)];
  const s = foldChips(H, TABLE, rs, vAll(rs, 14));
  check('59 minutes does not decay', s.crumbs === CRUMBS_PER_CHIP * 64 + CRUMBS_PER_CHIP, s.crumbs);
}
{
  const rs = [bank(14, 'b1', T0), bank(8, 'b2', T0 + HOUR)];
  const s = foldChips(H, TABLE, rs, vAll(rs, 14));
  const afterOneHour = Math.floor((CRUMBS_PER_CHIP * 64 * SOG_BASE_NUM) / SOG_DEN);
  check('one hour decays once', s.crumbs === afterOneHour + CRUMBS_PER_CHIP, s.crumbs);
}

// 2) A very long gap folds in bounded time and decays the whole bowl away.
//
// NOTE ON WHAT THIS DOES *NOT* TEST. At the base rate (97/100) the
// SOG_MAX_HOURS clamp is not observable through `crumbs`: integer flooring
// drives any bowl under ~1e12 to zero within ~379 hours, well inside the
// 720-hour clamp, and applySog's `crumbs > 0` loop break already bounds the
// work. Deleting the clamp entirely would produce bit-identical output here.
// The clamp is tested for real in BLOCK 7 OF THIS FILE, arithmetically against
// the exported `sogHoursFor`. (This comment used to point at
// chipsEngine.buy.test.ts, which points back here and has never contained a
// clamp test — a comment asserting coverage that does not exist is worse than
// no comment.) Do not add a clamp assertion to this block — it would pass under
// a broken clamp and give false confidence.
{
  const rs = [bank(20, 'c1', T0), bank(8, 'c2', T0 + 5000 * HOUR)];
  const started = Date.now();
  const s = foldChips(H, TABLE, rs, vAll(rs, 20));
  check('long gap folds fast', Date.now() - started < 500);
  // Exact, not `< 2000`: the whole first bank must decay to 0, leaving only
  // the second bank's payout. A too-slow decay would leave a remainder.
  check('long gap decays the bowl away', s.crumbs === CRUMBS_PER_CHIP, s.crumbs);
}

// 3) The rim: crumbs past bowl_cap are lost, not carried.
{
  const rs = [bank(20, 'd1', T0)];  // 2^12 chips = 4,096,000 crumbs >> START_BOWL_CAP
  const s = foldChips(H, TABLE, rs, vAll(rs, 20));
  check('bowl caps at START_BOWL_CAP', s.crumbs === START_BOWL_CAP, s.crumbs);
  check('lifetime is NOT capped', s.lifetimeChips === 4096, s.lifetimeChips);
}

// 4) Decay terminates at exactly zero rather than leaving a fractional
// remainder or going negative. Asserting the exact total proves the first
// bank's 1000 crumbs decayed to 0 — `>= 0` alone would pass under almost any
// arithmetic bug, since floor(positive * positive / positive) cannot go
// negative in the first place.
{
  const rs = [bank(8, 'e1', T0), bank(8, 'e2', T0 + 700 * HOUR)];
  const s = foldChips(H, TABLE, rs, vAll(rs, 8));
  check('decay terminates at exactly zero', s.crumbs === CRUMBS_PER_CHIP, s.crumbs);
}

// 5) THE CLOCK IS created_at, NOT the body's authoring-ms.
// A player writes #<ms>~ themselves. If decay keyed off it, dating a move far
// in the future would pin the clock ahead of every later move and switch
// sogginess off permanently for ~256 hashes. created_at cannot be forged past
// +60s (verify_pow, src/crypto/action_pow.rs:554-572).
{
  const far = T0 + 400 * 24 * HOUR;   // body claims it is a year from now
  const rs: ChipsReply[] = [
    { author_id: A, body: `bank 14 a1#${far}~`, block_height: 1, content_id: 'f1', created_at: T0 },
    { author_id: A, body: `bank 8 a2#${far}~`,  block_height: 1, content_id: 'f2', created_at: T0 + HOUR },
  ];
  const s = foldChips(H, TABLE, rs, vAll(rs, 14));
  const expected = Math.floor((CRUMBS_PER_CHIP * 64 * SOG_BASE_NUM) / SOG_DEN) + CRUMBS_PER_CHIP;
  check('future-dated body ms does not stop decay', s.crumbs === expected, s.crumbs);
}

// 6) Pending replies do not advance the clock — their created_at is stamped at
// query time and is not consensus-stable (the reef pending-ordering bug).
{
  const rs: ChipsReply[] = [
    { author_id: A, body: `bank 14 b1#${T0}~`, block_height: 1,    content_id: 'p1', created_at: T0 },
    { author_id: A, body: `bank 8 b2#${T0}~`,  block_height: null, content_id: 'p2', created_at: T0 + 500 * HOUR },
  ];
  const s = foldChips(H, TABLE, rs, vAll(rs, 14));
  check('pending reply applies no decay', s.crumbs === CRUMBS_PER_CHIP * 64 + CRUMBS_PER_CHIP, s.crumbs);
}

// 7) THE CLAMP, tested arithmetically.
// The only real coverage of SOG_MAX_HOURS. It cannot be tested through
// `crumbs` -- see the note on sogHoursFor in chipsEngine.ts -- so it is tested
// where it actually lives: the hour computation itself.
{
  check('sub-hour gap is 0 hours', sogHoursFor(T0, T0 + HOUR - 1) === 0);
  check('exact hour is 1', sogHoursFor(T0, T0 + HOUR) === 1);
  check('partial hours truncate', sogHoursFor(T0, T0 + 3 * HOUR + 59 * 60_000) === 3);
  check('backwards time is 0, never negative', sogHoursFor(T0 + 5 * HOUR, T0) === 0);
  check('equal timestamps are 0', sogHoursFor(T0, T0) === 0);
  check('just under the clamp is unclamped', sogHoursFor(T0, T0 + 719 * HOUR) === 719);
  check('exactly at the clamp', sogHoursFor(T0, T0 + 720 * HOUR) === 720);
  // The assertion that fails if the clamp is deleted:
  check('far beyond the clamp is capped', sogHoursFor(T0, T0 + 5000 * HOUR) === SOG_MAX_HOURS,
    sogHoursFor(T0, T0 + 5000 * HOUR));
  check('a decade is still capped', sogHoursFor(T0, T0 + 87600 * HOUR) === SOG_MAX_HOURS);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
