/**
 * The fold must be a pure function: identical inputs -> identical state, and
 * INPUT ORDER MUST NOT MATTER (ordering is internal to the fold). If this ever
 * fails, clients hosting different subsets will disagree about the same table.
 * Run: npx tsx src/lib/chipsEngine.determinism.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';

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
];
const verified = new Map([['c1', 15], ['c3', 10], ['c4', 12]]);

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

const shuffled = [replies[3], replies[0], replies[4], replies[2], replies[1]];
const c = snap(foldChips(H, TABLE, shuffled, verified));
check('input order does not affect state', a === c, { a, c });

// A client missing a verification must not silently credit the chip.
const partial = snap(foldChips(H, TABLE, replies, new Map([['c1', 15]])));
check('unverified banks do not credit', partial !== a);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
