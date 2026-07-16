/**
 * Regression for the "not next to your reef" on FRESH tiles bug.
 *
 * Root cause (verified against a live node): get_replies stamps PENDING (mempool)
 * replies with a query-time `created_at`, not authoring time — so it is unstable
 * and ~equal for freshly-submitted moves. The fold sorted pending moves by
 * (created_at, content_id); with created_at useless, order collapsed to
 * content_id (hash) order, so ~half the time a spread applied BEFORE the seed it
 * grows from and was wrongly rejected as "not next to your reef", until both
 * confirmed into height-ordered blocks and it corrected (the "rubberband").
 *
 * Fix: order moves by the AUTHORING sequence embedded in the (signed, immutable)
 * move body — `#<n>~` — which is stable across fetches and reflects true submit
 * order. Run: npx tsx src/lib/reefEngine.ordering.test.ts
 */
import { foldReef, type ReefHeader } from './reefEngine';

const H: ReefHeader = { v: 1, kind: 'reef', founder: 'F', w: 12, h: 12, created: 0 };
const A = 'aaaa000000000000';
const R = 'sha256:region';

let failures = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
};
const reply = (author: string, body: string, block_height: number | null, content_id: string, created_at: number) =>
  ({ author_id: author, body, block_height, content_id, created_at });

// A already holds an established cell at (5,5) (confirmed at height 10), so the
// "own nothing → seed anywhere" fallback can't mask an ordering inversion.
// Then A spreads (6,5) [from (5,5)] and (7,5) [from (6,5)] — both PENDING, with:
//   - EQUAL, useless created_at (as the node reports for mempool replies), and
//   - content_ids ordered so the DEPENDENT move (7,5) sorts FIRST by hash.
// The authoring sequence embedded in the body (#1000 < #1001) is the only signal
// that (6,5) came before (7,5). A correct fold must honor it.
{
  const replies = [
    reply(A, 'grow 5 5', 10, 'c_established', 900),
    reply(A, `grow 6 5 ${R}#1000~aaaa~n1`, null, 'c_zzz_first', 5000), // authored FIRST
    reply(A, `grow 7 5 ${R}#1001~aaaa~n2`, null, 'c_aaa_second', 5000), // authored SECOND, lower hash
  ];
  const s = foldReef(H, replies, 10);
  const m65 = s.moves.find((m) => m.x === 6 && m.y === 5)!;
  const m75 = s.moves.find((m) => m.x === 7 && m.y === 5)!;
  check('fresh spread (6,5) grows', m65.outcome === 'grew', m65.outcome);
  check('dependent spread (7,5) grows despite lower content_id', m75.outcome === 'grew', m75.outcome);
  check('both fresh tiles owned by A', s.cells.get('6,5')?.owner === A && s.cells.get('7,5')?.owner === A, {
    c65: s.cells.get('6,5'),
    c75: s.cells.get('7,5'),
  });
}

// Same inversion, but for CONFIRMED moves sharing a block AND a (second-precision)
// created_at — the finer authoring sequence must still order seed before spread.
{
  const replies = [
    reply(A, 'grow 2 2', 10, 'c_seed_base', 900),
    reply(A, `grow 3 2 ${R}#2000~aaaa~m1`, 12, 'c_zzz', 3000), // same block, same second
    reply(A, `grow 4 2 ${R}#2001~aaaa~m2`, 12, 'c_aaa', 3000), // lower hash, authored later
  ];
  const s = foldReef(H, replies, 12);
  const m42 = s.moves.find((m) => m.x === 4 && m.y === 2)!;
  check('same-block same-second dependent spread grows', m42.outcome === 'grew', m42.outcome);
  check('(4,2) owned by A', s.cells.get('4,2')?.owner === A, s.cells.get('4,2'));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
