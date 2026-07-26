/**
 * Batch folding. The headline property: a batch credits exactly what the same
 * chips would as separate replies.
 * Run: npx tsx src/lib/chipsBatch.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { proofKey } from './proofKey';
import { MAX_BATCH, CRUMBS_PER_CHIP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const reply = (body: string, cid: string, at: number, height: number | null = 1): ChipsReply =>
  ({ author_id: A, body, block_height: height, content_id: cid, created_at: at });

/** Every chip verifies at exactly the bits it claims. */
const verifyAll = (chips: { ms: number; bits: number; nonce: bigint }[]) =>
  new Map(chips.map((c) => [proofKey(TABLE, A, c.ms, c.nonce), c.bits]));

// 1) EQUIVALENCE — one batch of 3 == three separate replies, same instant.
{
  const chips = [
    { ms: T0 + 1, bits: 10, nonce: 1n },
    { ms: T0 + 2, bits: 11, nonce: 2n },
    { ms: T0 + 3, bits: 9, nonce: 3n },
  ];
  const v = verifyAll(chips);

  const batched = foldChips(H, TABLE,
    [reply(`bank ${chips.map((c) => `${c.ms}:${c.bits}:${c.nonce.toString(16)}`).join(',')}#${T0}~`, 'b1', T0)], v);

  const singles = foldChips(H, TABLE,
    chips.map((c, i) => reply(`bank ${c.bits} ${c.nonce.toString(16)}#${c.ms}~`, `s${i}`, T0)), v);

  check('batch crumbs == singles crumbs', batched.crumbs === singles.crumbs, { batched: batched.crumbs, singles: singles.crumbs });
  check('batch lifetime == singles lifetime', batched.lifetimeChips === singles.lifetimeChips);
  check('batch crispest == singles crispest', batched.crispest === singles.crispest);
  check('one MoveResult per chip', batched.moves.length === 3, batched.moves.length);
  check('all banked', batched.moves.every((m) => m.outcome === 'banked'));
}

// 2) v1 REGRESSION — the form live players already have on chain.
{
  const c = { ms: T0, bits: 12, nonce: 0xabn };
  const s = foldChips(H, TABLE, [reply('bank 12 ab#' + T0 + '~', 'v1', T0)], verifyAll([c]));
  check('v1 still credits', s.crumbs === CRUMBS_PER_CHIP * 2 ** (12 - 8), s.crumbs);
  check('v1 lifetime', s.lifetimeChips === 2 ** (12 - 8));
}

// 3) OVERSIZE — rejected whole, and nothing is verified.
{
  const chips = Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ ms: T0 + i, bits: 10, nonce: BigInt(i + 1) }));
  const body = 'bank ' + chips.map((c) => `${c.ms}:${c.bits}:${c.nonce.toString(16)}`).join(',') + `#${T0}~`;
  // Deliberately supply a COMPLETE verification map: if the fold credited an
  // oversize reply it would succeed here, so passing proves the cap is enforced
  // rather than the reply merely failing for want of verification.
  const s = foldChips(H, TABLE, [reply(body, 'big', T0)], verifyAll(chips));
  check('oversize credits nothing', s.crumbs === 0, s.crumbs);
  check('oversize is one move', s.moves.length === 1, s.moves.length);
  check('oversize outcome', s.moves[0].outcome === 'rejected-oversize', s.moves[0].outcome);
}

// 4) PARTIAL VALIDITY — one bad entry rejects only itself.
{
  const good = { ms: T0 + 1, bits: 10, nonce: 1n };
  const liar = { ms: T0 + 2, bits: 20, nonce: 2n };   // claims 20, verifies at 9
  const body = `bank ${good.ms}:10:1,${liar.ms}:20:2#${T0}~`;
  const v = new Map([
    [proofKey(TABLE, A, good.ms, good.nonce), 10],
    [proofKey(TABLE, A, liar.ms, liar.nonce), 9],
  ]);
  const s = foldChips(H, TABLE, [reply(body, 'mix', T0)], v);
  check('good entry credited', s.crumbs === CRUMBS_PER_CHIP * 2 ** (10 - 8), s.crumbs);
  check('two moves recorded', s.moves.length === 2, s.moves.length);
  check('liar rejected alone', s.moves[1].outcome === 'rejected-bits', s.moves[1].outcome);
}

// 5) DEDUPE across a batch boundary — the same proof twice earns once.
{
  const c = { ms: T0 + 1, bits: 10, nonce: 1n };
  const v = verifyAll([c]);
  const b = `bank ${c.ms}:10:1#`;
  const s = foldChips(H, TABLE, [reply(b + T0 + '~', 'd1', T0), reply(b + (T0 + 1) + '~', 'd2', T0 + 1)], v);
  check('duplicate proof credits once', s.crumbs === CRUMBS_PER_CHIP * 2 ** (10 - 8), s.crumbs);
  check('second is rejected-duplicate', s.moves[1].outcome === 'rejected-duplicate', s.moves[1].outcome);
}

// 6) DECAY is unchanged by grouping: one 2-chip reply an hour later decays the
// same as two single replies at that same instant.
{
  const HOUR = 3_600_000;
  const first = { ms: T0, bits: 14, nonce: 9n };
  const later = [{ ms: T0 + HOUR, bits: 8, nonce: 10n }, { ms: T0 + HOUR + 1, bits: 8, nonce: 11n }];
  const v = verifyAll([first, ...later]);

  const batched = foldChips(H, TABLE, [
    reply(`bank 14 9#${T0}~`, 'x0', T0),
    reply(`bank ${later.map((c) => `${c.ms}:8:${c.nonce.toString(16)}`).join(',')}#${T0 + HOUR}~`, 'x1', T0 + HOUR),
  ], v);

  const singles = foldChips(H, TABLE, [
    reply(`bank 14 9#${T0}~`, 'y0', T0),
    reply(`bank 8 a#${T0 + HOUR}~`, 'y1', T0 + HOUR),
    reply(`bank 8 b#${T0 + HOUR + 1}~`, 'y2', T0 + HOUR),
  ], v);

  check('decay identical either way', batched.crumbs === singles.crumbs, { batched: batched.crumbs, singles: singles.crumbs });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
