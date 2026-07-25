/**
 * Sogginess: hour-boundary decay, the 30-day clamp, the bowl rim, and the
 * fixed dip-then-airtight resolution order.
 * Run: npx tsx src/lib/chipsEngine.sog.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
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
const vAll = (rs: ChipsReply[], bits: number) => new Map(rs.map((r) => [r.content_id, bits]));

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

// 2) A very long gap is clamped to SOG_MAX_HOURS of decay, not unbounded work.
{
  const rs = [bank(20, 'c1', T0), bank(8, 'c2', T0 + 5000 * HOUR)];
  const started = Date.now();
  const s = foldChips(H, TABLE, rs, vAll(rs, 20));
  check('long gap folds fast (clamped)', Date.now() - started < 500);
  check('long gap decays to near nothing', s.crumbs < CRUMBS_PER_CHIP * 2, s.crumbs);
  check('clamp constant is respected', SOG_MAX_HOURS === 720);
}

// 3) The rim: crumbs past bowl_cap are lost, not carried.
{
  const rs = [bank(20, 'd1', T0)];  // 2^12 chips = 4,096,000 crumbs >> START_BOWL_CAP
  const s = foldChips(H, TABLE, rs, vAll(rs, 20));
  check('bowl caps at START_BOWL_CAP', s.crumbs === START_BOWL_CAP, s.crumbs);
  check('lifetime is NOT capped', s.lifetimeChips === 4096, s.lifetimeChips);
}

// 4) Decay never drives crumbs negative and terminates at zero.
{
  const rs = [bank(8, 'e1', T0), bank(8, 'e2', T0 + 700 * HOUR)];
  const s = foldChips(H, TABLE, rs, vAll(rs, 8));
  check('crumbs never negative', s.crumbs >= 0, s.crumbs);
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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
