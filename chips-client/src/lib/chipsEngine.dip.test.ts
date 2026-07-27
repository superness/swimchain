/**
 * Dip tiers: threshold boundaries, guacamole browning, queso congealing,
 * and the fixed dip-then-airtight sog resolution order.
 * Run: npx tsx src/lib/chipsEngine.dip.test.ts
 */
import { foldChips, parseMove, dipIndexFor, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { proofKey } from './proofKey';
import { DIP_TIERS, CONGEAL_GAP_MS, CRUMBS_PER_CHIP, UPGRADES, START_BOWL_CAP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_000_000_000;
const HOUR = 3_600_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/**
 * The nonce must be PURE HEX. parseMove's nonce pattern is [0-9a-fA-F]{1,16},
 * so interpolating a content_id like 'q1' produces "ffq1", which fails to
 * parse — every such reply folds as rejected-parse, lifetime never moves, and
 * the tier under test is never reached. A sequence counter keeps it hex and
 * distinct (a repeated (ms, nonce) pair would fold as a duplicate).
 */
let nonceSeq = 0;
const bank = (bits: number, cid: string, ms: number): ChipsReply => ({
  author_id: A, body: `bank ${bits} ${(++nonceSeq).toString(16)}#${ms}~`,
  block_height: 1, content_id: cid, created_at: ms,
});
const buy = (key: string, cid: string, ms: number): ChipsReply => ({
  author_id: A, body: `buy ${key}#${ms}~`, block_height: 1, content_id: cid, created_at: ms,
});
/** proofKey for a single-chip (v1) fixture reply, derived from its own body. */
const keyFor = (r: ChipsReply): string => {
  const p = parseMove(r.body);
  if (p?.kind !== 'bank') throw new Error('keyFor: not a bank reply: ' + r.body);
  return proofKey(TABLE, r.author_id, p.chips[0].ms, p.chips[0].nonce);
};

// 1) Tier boundaries are inclusive at the threshold.
{
  const guac = DIP_TIERS[1];
  check('below threshold is salsa', dipIndexFor(guac.minLifetime - 1) === 0);
  check('exactly at threshold is guac', dipIndexFor(guac.minLifetime) === 1);
}

// 2) Queso congeal: the first bank after >= 12 h pays double; a shorter gap does not.
{
  const qi = DIP_TIERS.findIndex((t) => t.congeal);
  const need = DIP_TIERS[qi].minLifetime;
  // Reach the queso tier with one big chip, then bank after a long gap.
  const bits = Math.ceil(Math.log2(need)) + 8;
  const rs = [bank(bits, 'q1', T0), bank(8, 'q2', T0 + CONGEAL_GAP_MS)];
  const s = foldChips(H, TABLE, rs, new Map([[keyFor(rs[0]), bits], [keyFor(rs[1]), 8]]));
  const banked = s.moves.find((m) => m.content_id === 'q2');
  check('congeal doubles the returning chip', (banked?.crumbs ?? 0) >= CRUMBS_PER_CHIP * 2, banked);
}

// 3) Guacamole browns: its sog numerator is lower than the base.
//
// These two assert the CONSTANTS only. Blocks 4 and 5 are what prove the fold
// actually reads them — a table of numbers nothing reaches is not coverage.
{
  check('guac sets a faster sog', DIP_TIERS[1].sogNum === 96);
  check('guac pays more per chip', DIP_TIERS[1].payNum === 11 && DIP_TIERS[1].payDen === 10);
}

// 4) GUACAMOLE'S MODIFIERS, REACHED BY THE FOLD.
//
// Guac is the only tier with BOTH a payout multiplier and a sog override, and
// it is a narrow window — lifetime [300, 3000) — so a fixture has to be aimed
// at it deliberately. Hand-computed from chipsConst.ts:
//
//   g1: bank 17 bits. 1000 * 2^(17-8)        = 512,000
//       17 >= GOLDEN_BITS 16 -> floor(*5/2)  = 1,280,000
//       salsa has no payNum, seasoning 1/1   = 1,280,000
//       bowl rim                             -> 100,000
//       lifetime 2^9 = 512, in [300, 3000)   -> dipIndex 1 (guac)
//   g2: one hour later. Decay at guac's 96 (not the base 97), airtight off:
//       floor(100,000 * 96/100)              = 96,000
//       bank 8: 1000 * 2^0 = 1000, below golden, guac payNum:
//       floor(1000 * 11/10)                  = 1,100
//       total                                = 97,100
//
// Both counterfactuals are excluded by that single number: a fold that ignored
// payNum lands on 97,000, and one that decayed at the base 97 lands on 98,100.
{
  const rs = [bank(17, 'g1', T0), bank(8, 'g2', T0 + HOUR)];
  const s = foldChips(H, TABLE, rs, new Map([[keyFor(rs[0]), 17], [keyFor(rs[1]), 8]]));
  check('guac window is actually entered', s.dipIndex === 1, { dipIndex: s.dipIndex, lifetime: s.lifetimeChips });
  const g2 = s.moves.find((m) => m.content_id === 'g2');
  // Asserted on the MOVE, not on `crumbs`: the bowl is at its rim here, so a
  // payout assertion read off state alone would be swallowed by the cap.
  check('guac payNum 11/10 reaches the payout', g2?.crumbs === 1100, g2);
  check('guac sogNum 96 reaches the decay', s.crumbs === 97_100, s.crumbs);
}

// 5) THE SOG RESOLUTION ORDER, IN THE FOLD: dip sets the base, airtight adds.
//
// The docblocks on this file and on chipsEngine.sog.test.ts both claim to cover
// this; until this block existed neither did, because `airtight` was never
// successfully bought anywhere. Hand-computed:
//
//   o1: bank 17 -> bowl rim 100,000, lifetime 512 -> guac (threshold 150)
//   o2: buy airtight 1s later (no whole hour, so no decay):
//       100,000 - 30,000 (2026-07-27 retuned cost) = 70,000, airtight on
//   o3: one hour later. numerator = guac's 96 + AIRTIGHT_BONUS 2 = 98
//       floor(70,000 * 98/100)               = 68,600
//       bank 8 under guac: floor(1000*11/10) = 1,100
//       total                                = 69,700
//
// The number discriminates all three plausible orderings: dip-overrides-
// airtight (96) gives 68,300; airtight-overrides-dip (99) gives 70,400.
{
  const rs = [bank(17, 'o1', T0), buy('airtight', 'o2', T0 + 1000), bank(8, 'o3', T0 + 1000 + HOUR)];
  const s = foldChips(H, TABLE, rs, new Map([[keyFor(rs[0]), 17], [keyFor(rs[2]), 8]]));
  check('airtight is affordable off one big chip', START_BOWL_CAP >= UPGRADES.airtight.cost);
  check('airtight bought', s.airtight === true && s.owned.has('airtight'), [...s.owned]);
  check('dip base then airtight bonus (96+2)', s.crumbs === 69_700, s.crumbs);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
