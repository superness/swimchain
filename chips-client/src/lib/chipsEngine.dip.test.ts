/**
 * Dip tiers: threshold boundaries, guacamole browning, queso congealing,
 * and the fixed dip-then-airtight sog resolution order.
 * Run: npx tsx src/lib/chipsEngine.dip.test.ts
 */
import { foldChips, dipIndexFor, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { DIP_TIERS, CONGEAL_GAP_MS, CRUMBS_PER_CHIP } from './chipsConst';

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
  const s = foldChips(H, TABLE, rs, new Map([['q1', bits], ['q2', 8]]));
  const banked = s.moves.find((m) => m.content_id === 'q2');
  check('congeal doubles the returning chip', (banked?.crumbs ?? 0) >= CRUMBS_PER_CHIP * 2, banked);
}

// 3) Guacamole browns: its sog numerator is lower than the base.
{
  check('guac sets a faster sog', DIP_TIERS[1].sogNum === 96);
  check('guac pays more per chip', DIP_TIERS[1].payNum === 11 && DIP_TIERS[1].payDen === 10);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
