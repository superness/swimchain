/**
 * The fold must be a pure function: identical inputs -> identical state, and
 * INPUT ORDER MUST NOT MATTER (ordering is internal to the fold). If this ever
 * fails, clients hosting different subsets will disagree about the same table.
 * Run: npx tsx src/lib/chipsEngine.determinism.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { proofKey } from './proofKey';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const replies: ChipsReply[] = [
  { author_id: A, body: `bank 15 aa#${T0}~`,        block_height: 1, content_id: 'c1', created_at: T0 },
  { author_id: A, body: `buy season1#${T0 + 1000}~`, block_height: 1, content_id: 'c2', created_at: T0 + 1000 },
  { author_id: A, body: `bank 10 bb#${T0 + 2000}~`, block_height: 2, content_id: 'c3', created_at: T0 + 2000 },
  { author_id: A, body: `bank 12 cc#${T0 + 9_000_000}~`, block_height: 2, content_id: 'c4', created_at: T0 + 9_000_000 },
  { author_id: A, body: `buy bowl1#${T0 + 9_001_000}~`, block_height: null, content_id: 'c5', created_at: T0 + 9_001_000 },
  // THE TIEBREAK PAIR. Identical block_height AND identical authoring-ms, so
  // `orderReplies` reaches its third key, content_id, and nothing else can
  // separate them. Without that branch the sort is merely stable and these two
  // fold in ARRAY order, which is exactly what the shuffle below varies.
  //
  // They are chosen so the two orders cannot agree: 'tie-a' banks a chip that
  // fills the bowl to its rim and 'tie-b' spends 70,000 on airtight, so
  // bank-then-buy ends at rim-minus-cost while buy-then-bank spends first and
  // then refills to the rim. Two different bowls, deterministically.
  { author_id: A, body: `bank 16 dd#${T0 + 9_002_000}~`, block_height: 3, content_id: 'tie-a', created_at: T0 + 9_002_000 },
  { author_id: A, body: `buy airtight#${T0 + 9_002_000}~`, block_height: 3, content_id: 'tie-b', created_at: T0 + 9_002_000 },
];
const verified = new Map([
  [proofKey(TABLE, A, T0, 0xaan), 15],
  [proofKey(TABLE, A, T0 + 2000, 0xbbn), 10],
  [proofKey(TABLE, A, T0 + 9_000_000, 0xccn), 12],
  [proofKey(TABLE, A, T0 + 9_002_000, 0xddn), 16],
]);

const snap = (s: ReturnType<typeof foldChips>) =>
  JSON.stringify({
    crumbs: s.crumbs, lifetimeChips: s.lifetimeChips, crispest: s.crispest,
    owned: [...s.owned].sort(), bowlCap: s.bowlCap, dipIndex: s.dipIndex,
    seasoning: [s.seasoningNum, s.seasoningDen], fryers: s.fryers,
    moves: s.moves.map((m) => [m.content_id, m.outcome, m.crumbs ?? 0]),
  });

const a = snap(foldChips(H, TABLE, replies, verified));
const b = snap(foldChips(H, TABLE, replies, verified));
check('same input folds identically', a === b);

// The tie pair is presented REVERSED here (replies[6] before replies[5]). If
// `orderReplies` ever loses its content_id tiebreak, this line is what fails.
const shuffled = [replies[3], replies[6], replies[0], replies[4], replies[5], replies[2], replies[1]];
const c = snap(foldChips(H, TABLE, shuffled, verified));
check('input order does not affect state', a === c, { a, c });

// The tie pair must genuinely be order-SENSITIVE, or the assertion above is
// satisfied by a fixture that could not have detected anything. Folding the two
// tied replies alone, in each array order, must still agree — and must agree on
// the order content_id dictates ('tie-a' < 'tie-b', so the bank lands first).
{
  const pair = [replies[5], replies[6]];
  const fwd = snap(foldChips(H, TABLE, pair, verified));
  const rev = snap(foldChips(H, TABLE, [replies[6], replies[5]], verified));
  check('tied replies fold identically in either order', fwd === rev, { fwd, rev });
  const s = foldChips(H, TABLE, pair, verified);
  check('the tie resolves bank-before-buy, by content_id', s.owned.has('airtight'), [...s.owned]);
}

// A client missing a verification must not silently credit the chip.
const partial = snap(foldChips(H, TABLE, replies, new Map([[proofKey(TABLE, A, T0, 0xaan), 15]])));
check('unverified banks do not credit', partial !== a);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
