/**
 * Bank payout: linearity, the golden band, and rejection.
 * Run: npx tsx src/lib/chipsEngine.bank.test.ts
 * The fold is pure — verification results are passed in, so no crypto here.
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { CRUMBS_PER_CHIP, GOLDEN_BITS, GOLD_NUM, GOLD_DEN } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'Test Table', owner: A };
const TABLE = 'sha256:table';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/**
 * All banks at the same ms so decay never runs — payout is isolated.
 * The nonce MUST vary per chip: a repeated (ms, nonce) pair is the same proof
 * and folds as a duplicate, which is what test 5 below deliberately exercises.
 */
let nonceSeq = 0;
const bank = (bits: number, cid: string, ms = 1_000_000, nonceHex?: string) => ({
  author_id: A,
  body: `bank ${bits} ${nonceHex ?? (++nonceSeq).toString(16)}#${ms}~`,
  block_height: 1, content_id: cid, created_at: ms,
});
const verifiedAll = (replies: ChipsReply[], bits: number) =>
  new Map(replies.map((r) => [r.content_id, bits]));

// 1) Linearity: one 14-bit chip == 64 eight-bit chips, before seasoning.
{
  const one = [bank(14, 'c1')];
  const s1 = foldChips(H, TABLE, one, verifiedAll(one, 14));

  const many: ChipsReply[] = [];
  for (let i = 0; i < 64; i++) many.push(bank(8, `c_${String(i).padStart(3, '0')}`));
  const s2 = foldChips(H, TABLE, many, verifiedAll(many, 8));

  check('one 14-bit == 64 8-bit chips', s1.crumbs === s2.crumbs, { one: s1.crumbs, many: s2.crumbs });
  check('14-bit pays 2^6 chips', s1.crumbs === CRUMBS_PER_CHIP * 64, s1.crumbs);
}

// 2) Golden band pays superlinear.
// Asserts on the RECORDED PAYOUT, not state.crumbs: these amounts exceed the
// starting bowl cap, and the rim would clip them and mask the actual result.
{
  const below = [bank(GOLDEN_BITS - 1, 'g1')];
  const at = [bank(GOLDEN_BITS, 'g2')];
  const sb = foldChips(H, TABLE, below, verifiedAll(below, GOLDEN_BITS - 1));
  const sa = foldChips(H, TABLE, at, verifiedAll(at, GOLDEN_BITS));
  const plain = CRUMBS_PER_CHIP * 2 ** (GOLDEN_BITS - 8);
  check('below golden is plain', sb.moves[0].crumbs === plain / 2, sb.moves[0].crumbs);
  check('at golden is boosted', sa.moves[0].crumbs === Math.floor((plain * GOLD_NUM) / GOLD_DEN), sa.moves[0].crumbs);
  check('golden beats plain per unit work',
    (sa.moves[0].crumbs ?? 0) > 2 * (sb.moves[0].crumbs ?? 0));
}

// 3) Over-claiming is rejected-but-present.
{
  const rs = [bank(20, 'x1')];
  const s = foldChips(H, TABLE, rs, new Map([['x1', 10]])); // actually only 10 bits
  check('over-claimed bank credits nothing', s.crumbs === 0, s.crumbs);
  check('over-claimed bank still ordered', s.moves.length === 1, s.moves.length);
  check('over-claimed outcome is rejected', s.moves[0].outcome === 'rejected-bits', s.moves[0].outcome);
}

// 4) Under-minimum is rejected.
{
  const rs = [bank(4, 'y1')];
  const s = foldChips(H, TABLE, rs, new Map([['y1', 4]]));
  check('sub-minimum bank rejected', s.crumbs === 0, s.crumbs);
  check('sub-minimum outcome', s.moves[0].outcome === 'rejected-bits', s.moves[0].outcome);
}

// 5) Duplicate nonce at the same ms is rejected (no replay of one proof).
{
  const rs = [bank(10, 'z1', 1_000_000, 'aa'), bank(10, 'z2', 1_000_000, 'aa')];
  const s = foldChips(H, TABLE, rs, verifiedAll(rs, 10));
  check('duplicate proof credited once', s.crumbs === CRUMBS_PER_CHIP * 4, s.crumbs);
  check('duplicate outcome', s.moves[1].outcome === 'rejected-duplicate', s.moves[1].outcome);
}

// 6) Lifetime crunch and crispest are tracked un-multiplied.
{
  const rs = [bank(12, 'l1'), bank(9, 'l2', 1_000_001)];
  const s = foldChips(H, TABLE, rs, new Map([['l1', 12], ['l2', 9]]));
  check('lifetime = 16 + 2 chips', s.lifetimeChips === 18, s.lifetimeChips);
  check('crispest is the max bits', s.crispest === 12, s.crispest);
}

// 7) A stranger's reply on your table is ignored entirely — no credit, no
// clock advance, not even a move-log entry. Without this, one reply from
// anyone floors a victim's bowl.
{
  const B = 'b'.repeat(64);
  const rs: ChipsReply[] = [
    { author_id: A, body: `bank 14 e1#${1_000_000}~`, block_height: 1, content_id: 'o1', created_at: 1_000_000 },
    { author_id: B, body: `bank 14 e2#${1_000_000}~`, block_height: 1, content_id: 'o2', created_at: 1_000_000 },
  ];
  const s = foldChips(H, TABLE, rs, new Map([['o1', 14], ['o2', 14]]));
  check('foreign reply credits nothing', s.crumbs === CRUMBS_PER_CHIP * 64, s.crumbs);
  check('foreign reply not in move log', s.moves.length === 1, s.moves.length);
  check('foreign reply does not raise lifetime', s.lifetimeChips === 64, s.lifetimeChips);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
