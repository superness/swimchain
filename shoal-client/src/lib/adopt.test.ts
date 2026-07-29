/**
 * Which published checkpoint a joining client seeds from.
 * Run: npx tsx src/lib/adopt.test.ts
 *
 * Every `CheckpointEntry` below is built by putting a real `Checkpoint` through
 * the real `encodeCheckpoint` and then the real `decodeCheckpointBody` — the
 * exact path a published checkpoint takes off the wire — rather than by
 * hand-constructing the struct. So a case that "passes" against a payload no
 * peer would ever accept cannot exist here.
 *
 * Canonical payload strings are written out by hand in the comments and pinned
 * against `serialiseCheckpoint` before anything else runs; every publisher
 * count and every winner below is then derived from those strings by hand, not
 * by calling `adoptCheckpoint` twice.
 */
import { adoptCheckpoint } from './adopt';
import { serialiseCheckpoint } from './checkpoint';
import { decodeCheckpointBody, encodeCheckpoint, type CheckpointEntry } from './shoalWire';
import type { Checkpoint } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Publishers. 64 lowercase hex, the shape `saltFor` demands of an author id. */
const PUB_A = 'a'.repeat(64);
const PUB_B = 'b'.repeat(64);
const PUB_C = 'c'.repeat(64);
const PUB_D = 'd'.repeat(64);

/** The epoch a joiner is about to fold, and the one it must seed from. */
const FOLDING = 8;
const CLOSED = 7; // === FOLDING - 1

/**
 * The one swimmer these worlds disagree about. 64 lowercase hex, because
 * `checkpointInDomain` (shoalWire.ts) now holds a checkpoint's OWN ids to the
 * same shape the envelope author is held to — every id in an honest checkpoint
 * came from a reply's `author_id`, which `splitRoomReplies` already gates on
 * that shape. A short id like `s1` no longer survives `encodeCheckpoint`, so
 * `entry()` below would throw on it rather than quietly building a fixture no
 * peer would accept.
 */
const S1 = '1'.repeat(64);

/** Three disagreeing worlds for epoch 7, and a fourth for epoch 6. */
const CP_P: Checkpoint = { epoch: CLOSED, sizes: [[S1, 112]], recent: [] };
const CP_Q: Checkpoint = { epoch: CLOSED, sizes: [[S1, 100]], recent: [] };
const CP_R: Checkpoint = { epoch: CLOSED, sizes: [[S1, 77]], recent: [] };
const CP_OLD: Checkpoint = { epoch: CLOSED - 1, sizes: [[S1, 988]], recent: [] };

/** Hand-derived canonical text: `JSON.stringify({epoch, sizes, recent})` with
 *  the three keys in that fixed order and no whitespace. The id is written as
 *  `S1` rather than spelled out so the shape of the JSON stays readable; the
 *  three checks in section 0 pin that the real serialiser agrees. */
const P_TEXT: string = '{"epoch":7,"sizes":[["' + S1 + '",112]],"recent":[]}';
const Q_TEXT: string = '{"epoch":7,"sizes":[["' + S1 + '",100]],"recent":[]}';
const R_TEXT: string = '{"epoch":7,"sizes":[["' + S1 + '",77]],"recent":[]}';

function entry(cp: Checkpoint, publisher: string, hash: string): CheckpointEntry {
  const decoded = decodeCheckpointBody(encodeCheckpoint(cp, publisher), publisher, hash);
  if (decoded === null) throw new Error(`fixture: ${hash} did not survive the wire`);
  return decoded;
}

// ---------------------------------------------------------------------------
// 0. The hand-derived payloads, pinned before anything depends on them
// ---------------------------------------------------------------------------
console.log('\n0. the canonical payloads these cases are reasoned about');
check('hand-derived: P serialises to {"epoch":7,"sizes":[[<S1>,112]],"recent":[]}',
  serialiseCheckpoint(CP_P) === P_TEXT, serialiseCheckpoint(CP_P));
check('hand-derived: Q serialises to {"epoch":7,"sizes":[[<S1>,100]],"recent":[]}',
  serialiseCheckpoint(CP_Q) === Q_TEXT, serialiseCheckpoint(CP_Q));
check('hand-derived: R serialises to {"epoch":7,"sizes":[[<S1>,77]],"recent":[]}',
  serialiseCheckpoint(CP_R) === R_TEXT, serialiseCheckpoint(CP_R));
check('P, Q and R are genuinely different payloads (or every case below is vacuous)',
  P_TEXT !== Q_TEXT && Q_TEXT !== R_TEXT && P_TEXT !== R_TEXT);

// ---------------------------------------------------------------------------
// 1. NOTHING TO ADOPT — the first epoch a room ever has
//
// A room's very first epoch has no predecessor and therefore no checkpoint.
// That is ABSENCE, not disagreement: seed null, diverged false, and no
// opinions to report. A client that treated it as a divergence would shout
// on every brand-new room.
// ---------------------------------------------------------------------------
console.log('\n1. no checkpoint at all — skipped cleanly, never reported as a disagreement');
{
  const out = adoptCheckpoint([], FOLDING);
  check('an empty log adopts nothing', out.seed === null, out.seed);
  check('...and is NOT a divergence', out.diverged === false);
  check('...and surfaces no opinions', out.opinions.length === 0, out.opinions.length);
}

// ---------------------------------------------------------------------------
// 2. ONLY THE IMMEDIATELY PRECEDING EPOCH COUNTS
//
// `foldShoal` refuses any seed whose epoch is not exactly `epoch - 1`, so a
// checkpoint for epoch 6 is not a stale-but-usable seed for epoch 8 — it is
// unusable. Adopting one would either throw inside the fold or, worse, present
// a two-hour-old size table as current and then republish it as this epoch's
// checkpoint. It is skipped, exactly as an absent one is.
// ---------------------------------------------------------------------------
console.log('\n2. a checkpoint for an older epoch is skipped, not adopted and not reported');
{
  const out = adoptCheckpoint([entry(CP_OLD, PUB_A, 'sha256:01')], FOLDING);
  check('epoch 6 is not a seed for epoch 8', out.seed === null, out.seed);
  check('...and is not a divergence either', out.diverged === false);
  check('...and does not appear as an opinion about epoch 7', out.opinions.length === 0);

  // The same entry IS the seed for the epoch it actually precedes.
  const forSeven = adoptCheckpoint([entry(CP_OLD, PUB_A, 'sha256:01')], CLOSED);
  check('...while for epoch 7 that same checkpoint is exactly the seed',
    forSeven.seed !== null && serialiseCheckpoint(forSeven.seed) === serialiseCheckpoint(CP_OLD),
    forSeven.seed);
}

// ---------------------------------------------------------------------------
// 3. ONE OPINION — trust on first sight (spec 3.9 point 5)
//
// A joiner cannot verify a checkpoint without folding the epoch it summarises,
// which is the work adoption exists to avoid. One payload, however many
// publishers carry it, is adopted.
// ---------------------------------------------------------------------------
console.log('\n3. one payload is adopted, whether one client published it or three');
{
  const one = adoptCheckpoint([entry(CP_P, PUB_A, 'sha256:0a')], FOLDING);
  check('a lone publisher is adopted', one.seed !== null && serialiseCheckpoint(one.seed) === P_TEXT,
    one.seed);
  check('...and one publisher is not a divergence', one.diverged === false);
  check('...counted as exactly one voter', one.opinions.length === 1 && one.opinions[0].voters.length === 1,
    one.opinions.map((o) => o.voters.length));

  // Three DIFFERENT publishers, same payload. Different salts (each derived
  // from its own key) make three distinct chain objects saying one thing.
  const three = adoptCheckpoint([
    entry(CP_P, PUB_A, 'sha256:0a'),
    entry(CP_P, PUB_B, 'sha256:0b'),
    entry(CP_P, PUB_C, 'sha256:0c'),
  ], FOLDING);
  check('three agreeing publishers are still one opinion', three.opinions.length === 1,
    three.opinions.length);
  check('...counted as three voters', three.opinions[0]?.voters.length === 3,
    three.opinions[0]?.voters);
  check('...adopted, and not a divergence',
    three.diverged === false && three.seed !== null && serialiseCheckpoint(three.seed) === P_TEXT);

  // The same three, delivered in the reverse order and with the entries for
  // one publisher duplicated: adoption must be a function of the SET.
  const shuffled = adoptCheckpoint([
    entry(CP_P, PUB_C, 'sha256:0c'),
    entry(CP_P, PUB_A, 'sha256:0a'),
    entry(CP_P, PUB_B, 'sha256:0b'),
    entry(CP_P, PUB_A, 'sha256:0a'),
  ], FOLDING);
  check('arrival order and duplicate copies change nothing',
    JSON.stringify(shuffled) === JSON.stringify(three), { shuffled, three });
}

// ---------------------------------------------------------------------------
// 4. TWO DIFFERING PAYLOADS ARE A DETECTED DIVERGENCE — AND THE PLURALITY WINS
//
// Hand-derived: P is published by A, B and C (three voters); Q by D alone (one
// voter). 3 > 1, so P is the seed. `diverged` is true REGARDLESS of how lopsided
// the count is — two payloads for one epoch is the fact being reported, not
// "we could not decide".
// ---------------------------------------------------------------------------
console.log('\n4. two payloads: reported as a divergence, and the plurality is adopted');
{
  const out = adoptCheckpoint([
    entry(CP_Q, PUB_D, 'sha256:0d'),
    entry(CP_P, PUB_A, 'sha256:0a'),
    entry(CP_P, PUB_B, 'sha256:0b'),
    entry(CP_P, PUB_C, 'sha256:0c'),
  ], FOLDING);
  check('the disagreement is DETECTED', out.diverged === true);
  check('...both opinions are surfaced, not just the winner', out.opinions.length === 2,
    out.opinions.length);
  check('hand-derived: the 3-voter payload is ranked first',
    out.opinions[0]?.payload === P_TEXT && out.opinions[0]?.voters.length === 3,
    out.opinions.map((o) => [o.payload, o.voters.length]));
  check('hand-derived: the 1-voter payload is ranked second',
    out.opinions[1]?.payload === Q_TEXT && out.opinions[1]?.voters.length === 1,
    out.opinions.map((o) => [o.payload, o.voters.length]));
  check('the plurality is what gets adopted',
    out.seed !== null && serialiseCheckpoint(out.seed) === P_TEXT, out.seed);
}

// ---------------------------------------------------------------------------
// 5. A TIE IS BROKEN BY THE LOWEST CONTENT HASH — DECLARED, NEVER SILENT
//
// One voter each. Hand-derived: P's only entry hashes to 'sha256:0a' and Q's
// to 'sha256:0d'; '0a' < '0d' as plain strings, so P wins. The tie is still
// reported as a divergence — the rule is what stops two joiners disagreeing
// with EACH OTHER, it is not a claim that P is true.
// ---------------------------------------------------------------------------
console.log('\n5. a 1-1 tie breaks on the lowest content hash, and is still reported');
{
  const out = adoptCheckpoint([
    entry(CP_Q, PUB_D, 'sha256:0d'),
    entry(CP_P, PUB_A, 'sha256:0a'),
  ], FOLDING);
  check('the tie is reported as a divergence', out.diverged === true);
  check('hand-derived: sha256:0a < sha256:0d, so P is adopted',
    out.seed !== null && serialiseCheckpoint(out.seed) === P_TEXT, out.seed);

  // Mirror it: give Q the lower hash and the answer must flip, or the rule is
  // not the hash at all but "whichever payload the fixture happened to list".
  const mirrored = adoptCheckpoint([
    entry(CP_Q, PUB_D, 'sha256:0a'),
    entry(CP_P, PUB_A, 'sha256:0d'),
  ], FOLDING);
  check('...and with the hashes swapped, Q is adopted instead',
    mirrored.seed !== null && serialiseCheckpoint(mirrored.seed) === Q_TEXT, mirrored.seed);
}

// ---------------------------------------------------------------------------
// 6. A PUBLISHER THAT CONTRADICTS ITSELF VOTES FOR NEITHER
//
// A client rolls an epoch once, so it computes exactly one checkpoint for it.
// Two different payloads under one author id is therefore provable
// misbehaviour, and the cheap attack it enables is real: with one honest
// publisher on P, a griefer publishing BOTH P and Q would otherwise manufacture
// a 2-1... no — a 1-1 tie, and win it half the time for the price of one extra
// write. Discarding a self-contradicting author's votes costs it nothing it was
// entitled to (it can only ever cancel its OWN votes) and closes that.
//
// Hand-derived: A publishes P. D publishes P AND Q. D votes for neither, so P
// has 1 voter and Q has 0 — P is adopted outright rather than by a coin flip.
// ---------------------------------------------------------------------------
console.log('\n6. a publisher that published two payloads for one epoch votes for neither');
{
  const out = adoptCheckpoint([
    entry(CP_P, PUB_A, 'sha256:0a'),
    entry(CP_P, PUB_D, 'sha256:0d'),
    entry(CP_Q, PUB_D, 'sha256:0e'),
  ], FOLDING);
  check('it is still a divergence — two payloads exist', out.diverged === true);
  check('hand-derived: P keeps its one honest voter (A), D counts nowhere',
    out.opinions[0]?.payload === P_TEXT && out.opinions[0]?.voters.length === 1
      && out.opinions[0]?.voters[0] === PUB_A,
    out.opinions.map((o) => [o.payload, o.voters]));
  check('...and D is still listed as a PUBLISHER of both, so the report is complete',
    out.opinions.every((o) => o.publishers.includes(PUB_D)),
    out.opinions.map((o) => o.publishers.length));
  check('hand-derived: Q is left with zero voters',
    out.opinions[1]?.payload === Q_TEXT && out.opinions[1]?.voters.length === 0,
    out.opinions.map((o) => [o.payload, o.voters.length]));
  check('P is adopted — 1 voter beats 0, no tiebreak needed',
    out.seed !== null && serialiseCheckpoint(out.seed) === P_TEXT, out.seed);

  // ...and the griefer's fabrication must not win on the HASH either. This case
  // is built so that the voters filter is the only thing that decides it —
  // the previous version of it (D publishing P and Q, A publishing P) passed
  // with the filter and without, because cancelling D's votes took a vote off
  // BOTH payloads and left P ahead either way, so it could not discriminate the
  // rule it is named for.
  //
  // Hand-derived: A publishes P at the HIGHEST hash. D — one key, two
  // fabrications, neither of them P — publishes Q at the lowest hash of all and
  // R just above it.
  //   with rule 2:    P 1 voter, Q 0, R 0            -> P, on votes alone
  //   without rule 2: P 1 voter, Q 1, R 1 — a three-way tie on votes, broken by
  //                   the lowest hash 'sha256:00'    -> Q, the griefer's
  // So this check fails the moment the `voters` filter is removed.
  const lowHash = adoptCheckpoint([
    entry(CP_P, PUB_A, 'sha256:0f'),
    entry(CP_Q, PUB_D, 'sha256:00'),
    entry(CP_R, PUB_D, 'sha256:01'),
  ], FOLDING);
  check('a self-contradicting publisher cannot win on the hash tiebreak either',
    lowHash.seed !== null && serialiseCheckpoint(lowHash.seed) === P_TEXT, lowHash.seed);
  check('...and the honest payload wins on VOTES, not on its own hash — '
    + "A's hash is the highest of the three",
    lowHash.opinions[0]?.payload === P_TEXT && lowHash.opinions[0]?.voters.length === 1
      && lowHash.opinions[0]?.lowestHash === 'sha256:0f',
    lowHash.opinions.map((o) => [o.voters.length, o.lowestHash]));
}

// ---------------------------------------------------------------------------
// 7. WHEN EVERY OPINION IS SELF-CONTRADICTED, THE LOWEST HASH IS STILL ADOPTED
//
// One publisher, two payloads, nobody else. This case USED to fold unseeded,
// and that was wrong — not because the griefer deserved better, but because
// the commonest way to reach it is entirely honest: ONE PLAYER WITH TWO
// SESSIONS on one key (two tabs, or desktop plus browser) polls independently,
// rolls the hour independently, and closes it on different entry sets whenever
// an eat claim is still in flight at the boundary — the same honest race
// adopt.ts's header already calls routine. In a room where that player was the
// only publisher for epoch 7, refusing left the next joiner folding UNSEEDED,
// everyone back at START_SIZE: Blocker 12, reopened by the anti-grief rule and
// triggered by ordinary use.
//
// Rule 2 protects an honest vote from a self-contradicting one. With every
// opinion self-contradicted there is no honest vote left to protect, so the
// lowest hash decides — and an attacker gains nothing, since as the sole
// publisher it would have won trust-on-first-sight for half the writes anyway.
//
// Hand-derived: D publishes P at 'sha256:0d' and Q at 'sha256:0e'. Both have
// zero voters, so the sort degenerates to lowest-hash-first; '0d' < '0e' as
// plain strings, so P is adopted.
// ---------------------------------------------------------------------------
console.log('\n7. nothing but a self-contradicting publisher — lowest hash, still reported');
{
  const out = adoptCheckpoint([
    entry(CP_P, PUB_D, 'sha256:0d'),
    entry(CP_Q, PUB_D, 'sha256:0e'),
  ], FOLDING);
  check('hand-derived: sha256:0d < sha256:0e, so P is adopted rather than nothing',
    out.seed !== null && serialiseCheckpoint(out.seed) === P_TEXT, out.seed);
  check('...on a fallback, not on a vote — every opinion has zero voters',
    out.opinions.every((o) => o.voters.length === 0),
    out.opinions.map((o) => o.voters.length));
  check('...and it IS still reported', out.diverged === true);
  check('...with both payloads surfaced', out.opinions.length === 2, out.opinions.length);

  // Mirror it: swap the hashes and the answer must flip, or the fallback is not
  // the hash at all but "whichever payload the fixture happened to list first".
  const mirrored = adoptCheckpoint([
    entry(CP_P, PUB_D, 'sha256:0e'),
    entry(CP_Q, PUB_D, 'sha256:0d'),
  ], FOLDING);
  check('...and with the hashes swapped, Q is adopted instead',
    mirrored.seed !== null && serialiseCheckpoint(mirrored.seed) === Q_TEXT, mirrored.seed);

  // THE FALLBACK MUST NOT OUTRANK AN HONEST VOTE. One honest publisher (B on Q)
  // against a self-contradicting one (D on P and R), with EVERY one of D's
  // hashes below B's. Hand-derived: Q has 1 voter, P and R have 0, so votes
  // decide before the hash is ever consulted and Q wins. If rule 4 were applied
  // ahead of rule 3 — or instead of it — P ('sha256:00') would win here.
  const withHonest = adoptCheckpoint([
    entry(CP_Q, PUB_B, 'sha256:0f'),
    entry(CP_P, PUB_D, 'sha256:00'),
    entry(CP_R, PUB_D, 'sha256:01'),
  ], FOLDING);
  check('an honest vote still beats a self-contradicting publisher holding every lower hash',
    withHonest.seed !== null && serialiseCheckpoint(withHonest.seed) === Q_TEXT, withHonest.seed);
  check('hand-derived: Q is the only opinion with a voter',
    withHonest.opinions[0]?.payload === Q_TEXT && withHonest.opinions[0]?.voters.length === 1
      && withHonest.opinions.filter((o) => o.voters.length > 0).length === 1,
    withHonest.opinions.map((o) => [o.voters.length, o.lowestHash]));
}

// ---------------------------------------------------------------------------
// 8. THE SEED IS THE PAYLOAD'S OWN CHECKPOINT, NOT A REBUILT ONE
//
// The adopted `Checkpoint` must round-trip back to the exact payload text that
// won, or this client would publish something different next hour from what it
// adopted this hour.
// ---------------------------------------------------------------------------
console.log('\n8. the adopted seed re-serialises to exactly the payload that won');
{
  // S2 sorts after S1 ('2' > '1' at the first character), so this is ascending.
  const S2 = '2'.repeat(64);
  const withRecent: Checkpoint = {
    epoch: CLOSED,
    sizes: [[S1, 112], [S2, 88]],
    recent: [[S1, 1_000, [1_000]]],
  };
  // Hand-derived canonical text, keys in fixed order, arrays ascending by id.
  const text = '{"epoch":7,"sizes":[["' + S1 + '",112],["' + S2 + '",88]],'
    + '"recent":[["' + S1 + '",1000,[1000]]]}';
  check('hand-derived: the recent-bearing payload serialises as written',
    serialiseCheckpoint(withRecent) === text, serialiseCheckpoint(withRecent));

  const out = adoptCheckpoint([entry(withRecent, PUB_B, 'sha256:0b')], FOLDING);
  check('the seed re-serialises to the identical text',
    out.seed !== null && serialiseCheckpoint(out.seed) === text, out.seed);
  check('...including the recent tail, not just the sizes',
    out.seed !== null && out.seed.recent.length === 1 && out.seed.recent[0][2].length === 1,
    out.seed?.recent);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
