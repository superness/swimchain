/**
 * Upgrades: affordability, chain ordering, no double-buying, effects applied.
 * Run: npx tsx src/lib/chipsEngine.buy.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { UPGRADES, CRUMBS_PER_CHIP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/**
 * Moves MUST carry strictly increasing timestamps.
 *
 * `orderReplies` sorts replies that tie on (block_height, authoring-ms) by
 * content_id — so a fixture where every move shares one timestamp folds in
 * ID order, not array order, and a buy whose id sorts before its funding
 * bank ("b1" < "rich") is evaluated with an empty bowl. Stepping 1s per move
 * keeps sequencing honest while staying far under the one-hour decay tick, so
 * ordering costs no sogginess.
 */
let seq = 0;
const nextMs = () => T0 + ++seq * 1000;

/** Nonce varies per chip — a repeated (ms, nonce) pair folds as a duplicate. */
let nonceSeq = 0;
const bank = (bits: number, cid: string, ms = nextMs()): ChipsReply => ({
  author_id: A, body: `bank ${bits} ${(++nonceSeq).toString(16)}#${ms}~`,
  block_height: 1, content_id: cid, created_at: ms,
});
const buy = (key: string, cid: string, ms = nextMs()): ChipsReply => ({
  author_id: A, body: `buy ${key}#${ms}~`, block_height: 1, content_id: cid, created_at: ms,
});

// Bank 15 bits = 2^7 chips = 128,000 crumbs, capped to START_BOWL_CAP 100,000.
const rich = () => bank(15, 'rich');

// 1) An affordable buy deducts and applies.
{
  const rs = [rich(), buy('season1', 'b1')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15]]));
  check('season1 owned', s.owned.has('season1'));
  check('season1 deducted', s.crumbs === 100_000 - UPGRADES.season1.cost, s.crumbs);
  check('seasoning applied', s.seasoningNum === 3 && s.seasoningDen === 2, [s.seasoningNum, s.seasoningDen]);
  check('outcome bought', s.moves[1].outcome === 'bought', s.moves[1].outcome);
}

// 2) Seasoning multiplies chips banked AFTER the purchase, not before.
{
  const rs = [rich(), buy('season1', 'b1'), bank(8, 'after')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15], ['after', 8]]));
  const expected = 100_000 - UPGRADES.season1.cost + Math.floor((CRUMBS_PER_CHIP * 3) / 2);
  check('post-purchase chip is multiplied', s.crumbs === expected, s.crumbs);
}

// 3) Unaffordable buy is rejected-but-present and changes nothing.
// Uses `airtight`, which belongs to NO chain in UPGRADE_CHAINS. A chained key
// here (e.g. season5) would fold as 'rejected-order' before affordability was
// ever consulted, since the check precedence is owned -> order -> cost.
{
  const rs = [buy('airtight', 'b1')];
  const s = foldChips(H, TABLE, rs, new Map());
  check('unaffordable rejected', s.moves[0].outcome === 'rejected-cost', s.moves[0].outcome);
  check('unaffordable owns nothing', s.owned.size === 0);
}

// 4) Out-of-chain-order buy is rejected (season2 before season1).
{
  const rs = [rich(), buy('season2', 'b1')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15]]));
  check('out-of-order rejected', s.moves[1].outcome === 'rejected-order', s.moves[1].outcome);
}

// 5) Buying the same upgrade twice is rejected the second time.
{
  const rs = [rich(), buy('season1', 'b1'), buy('season1', 'b2')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15]]));
  check('double-buy rejected', s.moves[2].outcome === 'rejected-owned', s.moves[2].outcome);
  check('double-buy charged once', s.crumbs === 100_000 - UPGRADES.season1.cost, s.crumbs);
}

// 6) Unknown key is rejected.
{
  const rs = [rich(), buy('nosuch', 'b1')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15]]));
  check('unknown upgrade rejected', s.moves[1].outcome === 'rejected-parse', s.moves[1].outcome);
}

// NOTE: there is deliberately no clamp test here. SOG_MAX_HOURS cannot be
// observed through `crumbs` in ANY realistic fixture: at 97/100 integer
// flooring zeroes a reachable bowl in ~379 hours, and even with `airtight`
// (99/100) the ~95-crumb survivor after 720 hours is the same order as the
// accumulated floor error, so the result is luck rather than a proof. The
// clamp is an arithmetic property and is tested arithmetically, against the
// exported `sogHoursFor`, in chipsEngine.sog.test.ts. Do not re-add a
// fixture-based clamp test here.

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
