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
 * Two disagreeing worlds for epoch 7, and a third for epoch 6. Swimmer ids
 * inside a checkpoint are arbitrary strings (`parseCheckpoint` only asks for a
 * string), so short ones are used here to keep the hand-derived JSON readable —
 * the ids' shape is `repliesToLog`'s business, not this module's.
 */
const CP_P: Checkpoint = { epoch: CLOSED, sizes: [['s1', 112]], recent: [] };
const CP_Q: Checkpoint = { epoch: CLOSED, sizes: [['s1', 100]], recent: [] };
const CP_OLD: Checkpoint = { epoch: CLOSED - 1, sizes: [['s1', 988]], recent: [] };

/** Hand-derived canonical text: `JSON.stringify({epoch, sizes, recent})` with
 *  the three keys in that fixed order and no whitespace. */
const P_TEXT: string = '{"epoch":7,"sizes":[["s1",112]],"recent":[]}';
const Q_TEXT: string = '{"epoch":7,"sizes":[["s1",100]],"recent":[]}';

function entry(cp: Checkpoint, publisher: string, hash: string): CheckpointEntry {
  const decoded = decodeCheckpointBody(encodeCheckpoint(cp, publisher), publisher, hash);
  if (decoded === null) throw new Error(`fixture: ${hash} did not survive the wire`);
  return decoded;
}

// ---------------------------------------------------------------------------
// 0. The hand-derived payloads, pinned before anything depends on them
// ---------------------------------------------------------------------------
console.log('\n0. the canonical payloads these cases are reasoned about');
check('hand-derived: P serialises to {"epoch":7,"sizes":[["s1",112]],"recent":[]}',
  serialiseCheckpoint(CP_P) === P_TEXT, serialiseCheckpoint(CP_P));
check('hand-derived: Q serialises to {"epoch":7,"sizes":[["s1",100]],"recent":[]}',
  serialiseCheckpoint(CP_Q) === Q_TEXT, serialiseCheckpoint(CP_Q));
check('P and Q are genuinely different payloads (or every case below is vacuous)',
  P_TEXT !== Q_TEXT);

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

  // ...and had D's hash been the lower one, the tiebreak must NOT rescue it.
  const lowHash = adoptCheckpoint([
    entry(CP_P, PUB_A, 'sha256:0f'),
    entry(CP_P, PUB_D, 'sha256:01'),
    entry(CP_Q, PUB_D, 'sha256:00'),
  ], FOLDING);
  check('a self-contradicting publisher cannot win on the hash tiebreak either',
    lowHash.seed !== null && serialiseCheckpoint(lowHash.seed) === P_TEXT, lowHash.seed);
}

// ---------------------------------------------------------------------------
// 7. WHEN EVERY OPINION IS SELF-CONTRADICTED THERE IS NOTHING TO ADOPT
//
// One publisher, two payloads, nobody else. There is no honest evidence at all,
// so the client folds unseeded — the same thing it does when no checkpoint
// exists — and reports the divergence.
// ---------------------------------------------------------------------------
console.log('\n7. nothing but a self-contradicting publisher — unseeded, and reported');
{
  const out = adoptCheckpoint([
    entry(CP_P, PUB_D, 'sha256:0d'),
    entry(CP_Q, PUB_D, 'sha256:0e'),
  ], FOLDING);
  check('nothing is adopted', out.seed === null, out.seed);
  check('...and it IS reported', out.diverged === true);
  check('...with both payloads surfaced', out.opinions.length === 2, out.opinions.length);
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
  const withRecent: Checkpoint = {
    epoch: CLOSED,
    sizes: [['s1', 112], ['s2', 88]],
    recent: [['s1', 1_000, [1_000]]],
  };
  // Hand-derived canonical text, keys in fixed order, arrays ascending by id.
  const text = '{"epoch":7,"sizes":[["s1",112],["s2",88]],"recent":[["s1",1000,[1000]]]}';
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
