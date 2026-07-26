/**
 * Batch folding. The headline property: a batch credits exactly what the same
 * chips would as separate replies.
 * Run: npx tsx src/lib/chipsBatch.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { proofKey } from './proofKey';
import { MAX_BATCH, CRUMBS_PER_CHIP, DIP_TIERS } from './chipsConst';

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

// 6) DECAY is unchanged by grouping, AND a chip's declared ms must stay INERT
// with respect to the decay clock even WITHIN a batch. Two entries in ONE
// reply (one instant, one created_at) declare ms values 20 HOURS apart --
// comfortably enough for `sogHoursFor` to register nonzero decay if anything
// ever ran the decay clock BETWEEN entries using their declared ms instead of
// the reply's created_at. (With only a 1ms gap, as this block used to have
// it, `sogHoursFor` returns 0 and such a bug is invisible here — the exact
// fixture-timestamp trap this codebase has hit before.)
//
// Hand-computed (SOG_BASE_NUM/DEN 97/100, CRUMBS_PER_CHIP 1000, both entries
// bits 8 -> 1000 crumbs each, salsa tier, no golden/congeal/seasoning bonus):
//   correct (chip ms never touches decay): 1,000 + 1,000 = 2,000
//   wrong (decay applied BETWEEN the two entries using their declared ms, 20h
//     apart): first entry banks 1,000; that pool decays over 20 simulated
//     hours to floor(1000 * 0.97^20) = 536; + the second entry's 1,000 = 1,536
{
  const HOUR = 3_600_000;
  const e1 = { ms: T0, bits: 8, nonce: 0x501n };
  const e2 = { ms: T0 + 20 * HOUR, bits: 8, nonce: 0x502n };
  const v = verifyAll([e1, e2]);

  const batched = foldChips(H, TABLE, [
    reply(`bank ${e1.ms}:${e1.bits}:${e1.nonce.toString(16)},${e2.ms}:${e2.bits}:${e2.nonce.toString(16)}#${T0}~`, 'x1', T0),
  ], v);

  const singles = foldChips(H, TABLE, [
    reply(`bank 8 ${e1.nonce.toString(16)}#${e1.ms}~`, 'y1', T0),
    reply(`bank 8 ${e2.nonce.toString(16)}#${e2.ms}~`, 'y2', T0),
  ], v);

  check('decay identical either way', batched.crumbs === singles.crumbs, { batched: batched.crumbs, singles: singles.crumbs });
  check('exact expected crumbs: chip ms 20h apart is inert w.r.t. decay', batched.crumbs === 2_000, batched.crumbs);
}

// 7) INTRA-BATCH ORDER IS CONSENSUS-RELEVANT: chips fold in DECLARATION order,
// never resorted by ms. Declared order here is [small, big], but big's
// declared ms is EARLIER than small's — so a fold that ever normalized a
// batch by sorting entries by ms would silently swap them.
//
// `big` alone crosses the guac tier (lifetime >= 300), but dipIndex updates
// only AFTER a chip's own payout is computed — so in true declaration order
// BOTH chips are credited while still salsa: small pays the plain rate (no
// payNum bonus), and big's own crossing helps nobody in this reply. A fold
// that sorted the batch by ms would run big FIRST, cross into guac before
// small is credited, and hand small guac's 11/10 bonus it never earned.
//
// Hand-computed from chipsConst.ts (BANK_MIN_BITS 8, GOLDEN_BITS 16,
// GOLD_NUM/DEN 5/2, guac payNum/payDen 11/10):
//   small: bits 9  -> 1000*2^1 = 2,000. No golden (9<16). Salsa: no payNum.
//   big:   bits 17 -> 1000*2^9 = 512,000 -> golden (17>=16): floor(*5/2)
//          = 1,280,000. Still salsa when IT is credited (small's own +2
//          lifetime can't reach 300 on its own): no payNum either.
//   DECLARATION-order total: 2,000 + 1,280,000 = 1,282,000
//   sort-by-ms total (WRONG): big first (1,280,000, still salsa) crosses
//     lifetime to 512 (guac); small second now wrongly pays guac's 11/10:
//     floor(2,000*11/10) = 2,200 -> total 1,282,200
{
  const small = { ms: T0 + 20, bits: 9, nonce: 0x111n };   // declared FIRST
  const big = { ms: T0 + 10, bits: 17, nonce: 0x112n };    // declared SECOND, but an EARLIER ms
  const v = verifyAll([small, big]);
  const body = `bank ${small.ms}:${small.bits}:${small.nonce.toString(16)},${big.ms}:${big.bits}:${big.nonce.toString(16)}#${T0}~`;
  const s = foldChips(H, TABLE, [reply(body, 'order1', T0)], v);

  const smallMove = s.moves.find((m) => m.ms === small.ms);
  const bigMove = s.moves.find((m) => m.ms === big.ms);
  check("small chip pays the plain rate, not guac's bonus (order preserved)", smallMove?.crumbs === 2_000, smallMove);
  check('big chip still pays the plain rate itself', bigMove?.crumbs === 1_280_000, bigMove);
  const total = s.moves.reduce((sum, m) => sum + (m.crumbs ?? 0), 0);
  check('exact batch total under DECLARATION order, not ms order', total === 1_282_000, total);
  check('the batch still crosses into guac by its end', s.dipIndex === 1, s.dipIndex);
}

// 8) A CHIP'S DECLARED ms MUST STAY INERT WITH RESPECT TO THE DECAY/CONGEAL
// CLOCK. It exists only to bind the Argon2id preimage and the proof key. Two
// entries in ONE reply (one instant, one `created_at`) declared 13 HOURS
// apart — comfortably over CONGEAL_GAP_MS (12h) — must not let the second
// entry congeal-double, because no real time has elapsed between them.
{
  const HOUR = 3_600_000;
  const boot = { ms: T0, bits: 23, nonce: 0x201n };            // -> lifetime 32,768: queso (the congeal tier)
  const e1 = { ms: T0 + 1_000, bits: 8, nonce: 0x202n };
  const e2 = { ms: e1.ms + 13 * HOUR, bits: 8, nonce: 0x203n }; // declared 13h after e1's ms

  const v = verifyAll([boot, e1, e2]);
  const replies: ChipsReply[] = [
    reply(`bank ${boot.bits} ${boot.nonce.toString(16)}#${boot.ms}~`, 'boot', boot.ms),
    // ONE reply carrying both entries: ONE created_at, so NO real time passes
    // between e1 and e2 no matter how far apart their declared ms values are.
    reply(
      `bank ${e1.ms}:${e1.bits}:${e1.nonce.toString(16)},${e2.ms}:${e2.bits}:${e2.nonce.toString(16)}#${T0 + 1_000}~`,
      'batch', T0 + 1_000
    ),
  ];
  const s = foldChips(H, TABLE, replies, v);

  const qi = DIP_TIERS.findIndex((t) => t.congeal);
  check('queso (the congeal tier) is reached before the batch', s.dipIndex === qi, s.dipIndex);
  const e1Move = s.moves.find((m) => m.ms === e1.ms);
  const e2Move = s.moves.find((m) => m.ms === e2.ms);
  check('first entry banks at the plain rate', e1Move?.crumbs === CRUMBS_PER_CHIP, e1Move);
  check(
    'second entry is NOT congeal-doubled despite a 13h gap in DECLARED ms (no real time elapsed)',
    e2Move?.crumbs === CRUMBS_PER_CHIP, e2Move
  );
}

// 9) DEDUPE WITHIN a single batch: the same proof declared twice in ONE reply
// still earns once — the second occurrence is rejected-duplicate.
{
  const c = { ms: T0 + 500, bits: 10, nonce: 0x301n };
  const v = verifyAll([c]);
  const body = `bank ${c.ms}:${c.bits}:${c.nonce.toString(16)},${c.ms}:${c.bits}:${c.nonce.toString(16)}#${T0}~`;
  const s = foldChips(H, TABLE, [reply(body, 'dupe-in-batch', T0)], v);
  check('one entry banked, one rejected', s.moves.length === 2, s.moves.length);
  check('first occurrence banks', s.moves[0].outcome === 'banked', s.moves[0].outcome);
  check('second occurrence in the SAME batch is rejected-duplicate', s.moves[1].outcome === 'rejected-duplicate', s.moves[1].outcome);
  check('credited exactly once', s.crumbs === CRUMBS_PER_CHIP * 2 ** (10 - 8), s.crumbs);
}

// 10) DEDUPE ACROSS FORMATS: a chip banked as a v1 reply, then replayed as an
// entry inside a LATER batch reply, is still rejected-duplicate — v1 and
// batch entries share one proof-identity space (both key on ms+nonce).
{
  const c = { ms: T0, bits: 10, nonce: 0x401n };
  const other = { ms: T0 + 1, bits: 9, nonce: 0x402n };
  const v = verifyAll([c, other]);
  const replies: ChipsReply[] = [
    reply(`bank ${c.bits} ${c.nonce.toString(16)}#${c.ms}~`, 'v1-first', T0),
    reply(
      `bank ${c.ms}:${c.bits}:${c.nonce.toString(16)},${other.ms}:${other.bits}:${other.nonce.toString(16)}#${T0 + 2}~`,
      'batch-replay', T0 + 2
    ),
  ];
  const s = foldChips(H, TABLE, replies, v);
  check('three moves total', s.moves.length === 3, s.moves.length);
  check('v1 original banks', s.moves[0].outcome === 'banked', s.moves[0].outcome);
  check('replayed entry inside the later batch is rejected-duplicate', s.moves[1].outcome === 'rejected-duplicate', s.moves[1].outcome);
  check('the distinct second entry in that batch still banks', s.moves[2].outcome === 'banked', s.moves[2].outcome);
  check(
    'credited only for the v1 original and the distinct entry',
    s.crumbs === CRUMBS_PER_CHIP * 2 ** (10 - 8) + CRUMBS_PER_CHIP * 2 ** (9 - 8),
    s.crumbs
  );
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
