/**
 * Standalone verification of the same-tile tie / move-outcome logic in
 * `foldReef`. Run with: npx tsx src/lib/reefEngine.tie.test.ts
 * (No framework — asserts + process.exit. The fold is pure, no PoW/crypto.)
 */
import { foldReef, START_BUDGET, type ReefHeader } from './reefEngine';

const H: ReefHeader = { v: 1, kind: 'reef', founder: 'F', w: 12, h: 12, created: 0 };
const A = 'aaaa000000000000';
const B = 'bbbb111111111111';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  }
}

// content_id ordering matters: within a block, lower content_id applies first.
const reply = (
  author: string,
  body: string,
  block_height: number | null,
  content_id: string,
  created_at = 1000
) => ({ author_id: author, body, block_height, content_id, created_at });

// ── 1) same tile, same block, two authors → one grows, the other ties & is refunded
{
  const replies = [
    reply(A, 'grow 5 5', 10, 'c_00_A'), // lower content_id → applies first, wins
    reply(B, 'grow 5 5', 10, 'c_99_B'), // same block, same tile → tie-lost
  ];
  const s = foldReef(H, replies, 10);
  const cell = s.cells.get('5,5');
  const mA = s.moves.find((m) => m.author === A)!;
  const mB = s.moves.find((m) => m.author === B)!;
  check('tie: winner is A (lower content_id)', cell?.owner === A, cell);
  check('tie: A outcome grew', mA.outcome === 'grew', mA.outcome);
  check('tie: B outcome tie-lost', mB.outcome === 'tie-lost', mB.outcome);
  check('tie: B refunded (budget == START)', s.budgets.get(B) === START_BUDGET, s.budgets.get(B));
  check('tie: A charged (budget < START)', (s.budgets.get(A) ?? 99) < START_BUDGET, s.budgets.get(A));
}

// ── 2) established (prior-block) enemy cell, with adjacency → real contest (NOT a tie)
{
  const replies = [
    reply(A, 'grow 5 5', 10, 'c_A_seed'), // A seeds (5,5) at height 10
    reply(B, 'grow 6 6', 11, 'c_B_seed'), // B seeds a cell at height 11
    reply(B, 'grow 6 5', 11, 'c_B_sprd'), // B spreads to (6,5), adjacent to (5,5)
    reply(B, 'grow 5 5', 12, 'c_B_cont'), // B grows onto A's ESTABLISHED (5,5) at height 12
  ];
  const s = foldReef(H, replies, 12);
  const mCont = s.moves.find((m) => m.author === B && m.x === 5 && m.y === 5)!;
  check('contest: prior-block attack is contested, not tie-lost', mCont.outcome === 'contested', mCont.outcome);
  check('contest: (5,5) still A (single contest does not capture)', s.cells.get('5,5')?.owner === A);
}

// ── 3) same author, same tile, twice → second is a tend (grow-on-own), never a tie
{
  const replies = [
    reply(A, 'grow 5 5', 10, 'c_A_1'),
    reply(A, 'grow 5 5', 10, 'c_A_2'), // same author, same tile, same block
  ];
  const s = foldReef(H, replies, 10);
  const second = s.moves[1];
  check('same-author: second grow is tended (not tie-lost)', second.outcome === 'tended', second.outcome);
  check('same-author: still owns the cell', s.cells.get('5,5')?.owner === A);
}

// ── 4) two pending (unconfirmed) grows on the same tile also tie
{
  const replies = [
    reply(A, 'grow 7 7', null, 'c_p_A', 1000), // pending; lower content_id
    reply(B, 'grow 7 7', null, 'c_p_B', 1001), // pending; ties
  ];
  const s = foldReef(H, replies, 20);
  const mA = s.moves.find((m) => m.author === A)!;
  const mB = s.moves.find((m) => m.author === B)!;
  check('pending tie: A grew', mA.outcome === 'grew', mA.outcome);
  check('pending tie: B tie-lost', mB.outcome === 'tie-lost', mB.outcome);
  check('pending tie: B refunded', s.budgets.get(B) === START_BUDGET, s.budgets.get(B));
}

// ── 5) same-block build chain: a seed then a spread FROM it must both apply,
//     even when content_id order would put the spread first. Creation order wins.
{
  const replies = [
    // seed made FIRST (earlier created_at) but HIGHER content_id
    reply(A, 'grow 5 5', 10, 'c_zzz_seed', 1000),
    // spread made SECOND (later created_at) but LOWER content_id — hash order
    // alone would apply this before the seed and orphan it.
    reply(A, 'grow 5 6', 10, 'c_aaa_spread', 1001),
  ];
  const s = foldReef(H, replies, 10);
  const spread = s.moves.find((m) => m.x === 5 && m.y === 6)!;
  check('build-order: spread from same-block seed is NOT rejected', spread.outcome === 'grew', spread.outcome);
  check('build-order: both cells owned by A', s.cells.get('5,5')?.owner === A && s.cells.get('5,6')?.owner === A);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
