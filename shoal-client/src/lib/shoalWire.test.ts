/**
 * Wire format for a swim vector / eat claim. Run: npx tsx src/lib/shoalWire.test.ts
 *
 * Expected values here are derived by hand, in comments, never by calling
 * the function under test twice. Malformed bodies below are hand-written
 * wire strings, not produced by calling `encodePresence`/`encodeEat` and
 * then corrupting the result — a hostile client never calls our encoder, so
 * `decodeBody` has to be tested against text nobody here ever validated.
 */
import {
  encodePresence, encodeEat, encodeCheckpoint,
  decodeBody, decodeCheckpointBody, saltFor, MAX_SAY, SALT_HEX_CHARS,
  MAX_CHECKPOINT_SWIMMERS, MAX_RECENT_BITES,
} from './shoalWire';
import {
  HEADING_STEPS, WORLD_W, WORLD_H, BLOOM_COLS, BLOOM_ROWS,
  EPOCH_MS, EAT_COOLDOWN_MS, VOID_WINDOW_MS, BITE_GROWTH, MAX_SIZE,
} from './shoalConst';
import { parseCheckpoint } from './checkpoint';
// Imported so the future-time bound can be DEMONSTRATED rather than argued:
// what it stops is a swimmer that never gets hungry again, which is only
// visible by folding one. See "Why the future-time bound is NOT cosmetic".
import { foldShoal } from './shoalEngine';
import type { Vec, Presence, EatClaim, Checkpoint } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const CELL_COUNT = BLOOM_COLS * BLOOM_ROWS; // 32 * 24 = 768

// A real-shaped author id: exactly 64 lowercase hex characters, the form the
// node reports as a reply's `author_id` (methods.rs:9446). Hand-picked digits,
// not derived from anything under test.
const AUTHOR_HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
// The salt is the first SALT_HEX_CHARS(16) characters of that. Counted off by
// hand: a1 b2 c3 d4 e5 f6 07 18 is 8 bytes = 16 characters -> 'a1b2c3d4e5f60718'.
// Every hand-written wire string below embeds this literal.
const SALT: string = 'a1b2c3d4e5f60718';
// A DIFFERENT author's id and salt, for the "the salt is not the author" case.
// First 16 characters of it: ff ee dd cc bb aa 99 88 -> 'ffeeddccbbaa9988'.
const OTHER_AUTHOR_HEX = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa9988776655443322110f';
const OTHER_SALT: string = 'ffeeddccbbaa9988';

// --- saltFor: the derivation itself --------------------------------------
check(`SALT_HEX_CHARS is 16 (the length every hand-written body below assumes)`,
  SALT_HEX_CHARS === 16, SALT_HEX_CHARS);
check('saltFor takes the first 16 characters of the author hex, hand-counted',
  saltFor(AUTHOR_HEX) === SALT, saltFor(AUTHOR_HEX));
check('saltFor on a different key gives a different salt (the whole point)',
  saltFor(OTHER_AUTHOR_HEX) === OTHER_SALT && OTHER_SALT !== SALT,
  { a: saltFor(AUTHOR_HEX), b: saltFor(OTHER_AUTHOR_HEX) });
{
  // A bech32m ADDRESS instead of the pubkey hex is the realistic caller bug:
  // it would silently produce a salt of address characters that every peer's
  // decodeBody then rejects, so it must throw at the encoder instead.
  let threw = false;
  try { saltFor('sw1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'); } catch { threw = true; }
  check('saltFor throws on a bech32m address instead of a pubkey hex', threw);
  threw = false;
  try { saltFor(AUTHOR_HEX.toUpperCase()); } catch { threw = true; }
  check('saltFor throws on UPPERCASE hex (one spelling per value, as elsewhere on this wire)', threw);
  threw = false;
  try { saltFor(AUTHOR_HEX.slice(0, 63)); } catch { threw = true; }
  check('saltFor throws on a 63-character (truncated) key', threw);
}

// --- Round trip --------------------------------------------------------
// Hand-derived wire string for this exact vector, per the chosen grammar
// `v1|presence|x|y|heading|speed|ms|salt|say`: no say -> trailing field empty,
// so the string ends in a bare delimiter.
{
  const vec: Vec = { x: 1234, y: 567, heading: 77, speed: 42, t: 999_983 };
  const expectedWire = 'v1|presence|1234|567|77|42|999983|a1b2c3d4e5f60718|';
  const wire = encodePresence(vec, AUTHOR_HEX);
  check('encodePresence matches the hand-derived wire string', wire === expectedWire, wire);

  const decoded = decodeBody(wire, AUTHOR_HEX, 'hash-y');
  check('decode round-trips every integer exactly',
    decoded !== null && decoded.kind === 'presence'
      && (decoded as Presence).vec.x === 1234
      && (decoded as Presence).vec.y === 567
      && (decoded as Presence).vec.heading === 77
      && (decoded as Presence).vec.speed === 42
      && (decoded as Presence).vec.t === 999_983,
    decoded);
  check('decode carries the id and hash supplied by the caller, not the wire',
    decoded !== null && decoded.id === AUTHOR_HEX && decoded.hash === 'hash-y', decoded);
  check('no say on the wire decodes to no say on the Presence',
    decoded !== null && decoded.kind === 'presence' && (decoded as Presence).say === undefined, decoded);
}

// --- One timestamp -------------------------------------------------------
// The grammar has exactly one ms token (`v1|presence|x|y|heading|speed|ms|salt|say`)
// — there is no second field a hand-written body could put a different value
// in for vec.t, so ms === vec.t is structural, not merely usually true. Two
// distinct bodies with distinct, hand-picked ms values, neither of them 0 or
// otherwise coincidentally special, to rule out a lucky accidental match.
{
  const wireA = 'v1|presence|10|10|0|0|999983|a1b2c3d4e5f60718|';
  const a = decodeBody(wireA, AUTHOR_HEX, 'ha');
  check('ms === vec.t (value A, 999983)',
    a !== null && a.kind === 'presence' && a.ms === 999_983 && (a as Presence).vec.t === 999_983, a);

  const wireB = 'v1|presence|10|10|0|0|42|a1b2c3d4e5f60718|';
  const b = decodeBody(wireB, AUTHOR_HEX, 'hb');
  check('ms === vec.t (value B, 42, distinct from A)',
    b !== null && b.kind === 'presence' && b.ms === 42 && (b as Presence).vec.t === 42, b);
}

// --- Speech rides along ----------------------------------------------------
// spec 2.4: talking must never cost a player their life, i.e. it rides in
// the same write as the vector rather than needing a second, separately
// PoW'd action.
{
  const vec: Vec = { x: 10, y: 20, heading: 5, speed: 7, t: 55_555 };
  const say = 'hello world';
  const expectedWire = 'v1|presence|10|20|5|7|55555|a1b2c3d4e5f60718|hello world';
  const wire = encodePresence(vec, AUTHOR_HEX, say);
  check('encodePresence with say matches the hand-derived wire string', wire === expectedWire, wire);

  const decoded = decodeBody(wire, AUTHOR_HEX, 'hash-z');
  check('say rides along with a correctly-decoded vector',
    decoded !== null && decoded.kind === 'presence'
      && (decoded as Presence).say === 'hello world'
      && (decoded as Presence).vec.x === 10 && (decoded as Presence).vec.y === 20
      && (decoded as Presence).vec.heading === 5 && (decoded as Presence).vec.speed === 7
      && (decoded as Presence).vec.t === 55_555,
    decoded);
}

// --- Heading is bounds-checked ---------------------------------------------
// COS[heading]/SIN[heading] in fixed.ts are plain array lookups (`COS: readonly
// number[]`, indexed directly as `COS[vec.heading]`). HEADING_STEPS is 256, so
// the table has indices 0..255. heading=256 or heading=-1 read `undefined`;
// `undefined * anything` is NaN, Math.trunc(NaN) is NaN, and clampToWorld's
// comparisons (`x < 0`, `x > WORLD_W`) are BOTH false for NaN, so it falls
// through unclamped and quantize(NaN) stays NaN. reckon() returns {x: NaN, y:
// NaN} with no exception anywhere in the chain — this is what makes the
// out-of-range case dangerous rather than merely wrong: nothing crashes, so a
// bad heading rides through into shelter/tension/sweep math turning into a
// fish that (via dist2) matches no distance comparison, ever, silently.
{
  const inRangeLow = 'v1|presence|10|10|0|1|1000|a1b2c3d4e5f60718|'; // heading 0: valid
  const inRangeHigh = `v1|presence|10|10|${HEADING_STEPS - 1}|1|1000|a1b2c3d4e5f60718|`; // heading 255: valid
  const tooHigh = `v1|presence|10|10|${HEADING_STEPS}|1|1000|a1b2c3d4e5f60718|`; // heading 256: invalid
  const negative = 'v1|presence|10|10|-1|1|1000|a1b2c3d4e5f60718|'; // heading -1: invalid

  check('heading 0 (lower boundary) is accepted', decodeBody(inRangeLow, AUTHOR_HEX, 'h') !== null);
  check('heading HEADING_STEPS-1 (upper boundary) is accepted', decodeBody(inRangeHigh, AUTHOR_HEX, 'h') !== null);
  check('heading === HEADING_STEPS is rejected', decodeBody(tooHigh, AUTHOR_HEX, 'h') === null);
  check('heading === -1 is rejected', decodeBody(negative, AUTHOR_HEX, 'h') === null);
}

// --- The eat claim -----------------------------------------------------
{
  const expectedWire = 'v1|eat|5|1000|a1b2c3d4e5f60718';
  const wire = encodeEat(5, 1000, AUTHOR_HEX);
  check('encodeEat matches the hand-derived wire string', wire === expectedWire, wire);

  const decoded = decodeBody(wire, AUTHOR_HEX, 'hash-e');
  check('eat claim round-trips its cell and ms',
    decoded !== null && decoded.kind === 'eat'
      && (decoded as EatClaim).cell === 5 && decoded.ms === 1000
      && decoded.id === AUTHOR_HEX && decoded.hash === 'hash-e',
    decoded);

  // CELL_COUNT = BLOOM_COLS(32) * BLOOM_ROWS(24) = 768, valid cells 0..767.
  const lastValid = `v1|eat|${CELL_COUNT - 1}|1000|a1b2c3d4e5f60718`;
  const firstInvalid = `v1|eat|${CELL_COUNT}|1000|a1b2c3d4e5f60718`;
  check('cell CELL_COUNT-1 (last valid cell) is accepted', decodeBody(lastValid, AUTHOR_HEX, 'h') !== null);
  check('a cell outside the grid (cell === CELL_COUNT) is rejected', decodeBody(firstInvalid, AUTHOR_HEX, 'h') === null);
}

// --- The salt: two swimmers, one cell, one millisecond -------------------
// THE DEFECT THIS FIELD EXISTS TO CLOSE. `content_id = sha256(body)` and
// nothing else (methods.rs:2921-2923), so before the salt an eat body was
// exactly `v1|eat|cell|ms` and two swimmers biting the same cell in the same
// millisecond produced ONE content_id: the node accepts both actions, drops the
// second content-store write while returning success, and the later-indexed
// author overwrites the earlier one's metadata. One bite vanishes; the other is
// credited to the wrong fish.
{
  const cell = 300;
  const ms = 1_700_000_000_123;
  const mine = encodeEat(cell, ms, AUTHOR_HEX);
  const theirs = encodeEat(cell, ms, OTHER_AUTHOR_HEX);
  // Hand-derived, both of them, from the grammar `v1|eat|cell|ms|salt`:
  check('two swimmers biting one cell in one ms produce DIFFERENT bodies',
    mine !== theirs, { mine, theirs });
  check('…and each is exactly the hand-derived string',
    mine === `v1|eat|300|1700000000123|${SALT}`
    && theirs === `v1|eat|300|1700000000123|${OTHER_SALT}`, { mine, theirs });

  // Same for presence: identical vector, identical say, different authors.
  const vec: Vec = { x: 1, y: 2, heading: 3, speed: 4, t: ms };
  check('two swimmers authoring the identical vector also produce different bodies',
    encodePresence(vec, AUTHOR_HEX, 'hi') !== encodePresence(vec, OTHER_AUTHOR_HEX, 'hi'));
}

// --- The salt MUST match the envelope author ------------------------------
// THIS BEHAVIOUR CHANGED, and the reason is worth stating where the test is.
//
// The salt used to be shape-checked and never compared to `id`, on the ground
// that a body's claims about its own author are not a decoder's to adjudicate.
// That left 16 unconstrained hex characters inside a body whose sha256 IS its
// content id — 64 bits of free entropy with which any publisher could steer its
// own content id offline, no key and no proof-of-work required. `adopt.ts` was
// ordering checkpoints by exactly that id, and grinding a winning one was
// measured at a handful of sha256 calls.
//
// So a body salted with someone ELSE's key is now REJECTED rather than decoded
// under the envelope's id. What has NOT changed is where `id` comes from: the
// envelope, never the body — the decoder still adjudicates nothing, it just
// refuses to carry a field it cannot tie to the author the node named.
{
  const envelopeAuthor = AUTHOR_HEX; // who the node says signed it
  const bodyWithForeignSalt = `v1|eat|5|1000|${OTHER_SALT}`; // salted as someone else
  check('an eat body whose salt disagrees with the envelope author is REJECTED',
    decodeBody(bodyWithForeignSalt, envelopeAuthor, 'hash-q') === null,
    decodeBody(bodyWithForeignSalt, envelopeAuthor, 'hash-q'));

  const presenceForeign = `v1|presence|10|20|5|7|55555|${OTHER_SALT}|hi`;
  check('same for a presence body: a foreign salt is rejected',
    decodeBody(presenceForeign, envelopeAuthor, 'hash-r') === null);

  // The SAME two bodies decode for the author whose key they are salted with,
  // so the rejection above is the author comparison and not something else
  // about those bodies.
  const eatOwn = decodeBody(bodyWithForeignSalt, OTHER_AUTHOR_HEX, 'hash-q');
  check('…while the very same eat body decodes for the author it IS salted with',
    eatOwn !== null && eatOwn.id === OTHER_AUTHOR_HEX, eatOwn);
  const presOwn = decodeBody(presenceForeign, OTHER_AUTHOR_HEX, 'hash-r');
  check('…and so does the presence body',
    presOwn !== null && presOwn.id === OTHER_AUTHOR_HEX, presOwn?.id);
  check('…still carrying the ENVELOPE\'s id, which is where it has always come from',
    presOwn !== null && presOwn.id === OTHER_AUTHOR_HEX && presOwn.hash === 'hash-r', presOwn);
  // The salt is validated and DISCARDED — it is not a field on the decoded
  // entry. Checked with the `id` blanked out, because the id now necessarily
  // contains the salt as its own prefix (that is what the check above verifies),
  // so a plain `includes` would be trivially true and prove nothing.
  check('…and the salt does not leak onto the decoded entry as a field of its own',
    eatOwn !== null
      && !JSON.stringify({ ...eatOwn, id: '' }).includes(OTHER_SALT)
      && !('salt' in eatOwn),
    eatOwn);

  // An envelope author that is not a real 64-hex id fails outright: there is no
  // salt it could match. The only production caller already gates on this shape
  // (shoalRoom.ts's AUTHOR_ID_RE) before a body ever reaches the decoder.
  check('a body cannot decode under an envelope author that is not 64-hex at all',
    decodeBody(`v1|eat|5|1000|${SALT}`, 'author-x', 'h') === null);
}

// --- The salt's SHAPE is enforced (16 lowercase hex, exactly) -------------
// CONSENSUS: two clients checking different lengths would accept different sets
// of writes and silently fold different rooms. Hand-written bodies only.
check('a 15-character salt is rejected (one short)',
  decodeBody(`v1|eat|5|1000|${SALT.slice(0, 15)}`, AUTHOR_HEX, 'h') === null);
check('a 17-character salt is rejected (one long)',
  decodeBody(`v1|eat|5|1000|${SALT}a`, AUTHOR_HEX, 'h') === null);
check('an UPPERCASE salt is rejected (one spelling per value)',
  decodeBody(`v1|eat|5|1000|${SALT.toUpperCase()}`, AUTHOR_HEX, 'h') === null);
check('a non-hex salt is rejected',
  decodeBody('v1|eat|5|1000|zzzzzzzzzzzzzzzz', AUTHOR_HEX, 'h') === null);
check('an empty salt field is rejected',
  decodeBody('v1|eat|5|1000|', AUTHOR_HEX, 'h') === null);
check('a presence body with a 15-character salt is rejected too',
  decodeBody(`v1|presence|10|20|5|7|55555|${SALT.slice(0, 15)}|hi`, AUTHOR_HEX, 'h') === null);
check('a presence body with an empty salt field is rejected too',
  decodeBody('v1|presence|10|20|5|7|55555||hi', AUTHOR_HEX, 'h') === null);
// The pre-salt grammar must not still decode — otherwise an old client's
// writes would keep folding and the collision this field closes would remain
// open for exactly as long as one such client kept running.
check('a PRE-SALT eat body (v1|eat|cell|ms) no longer decodes',
  decodeBody('v1|eat|5|1000', AUTHOR_HEX, 'h') === null);
check('a PRE-SALT presence body (no salt field) no longer decodes',
  decodeBody('v1|presence|10|20|5|7|55555|hi', AUTHOR_HEX, 'h') === null);

// --- Determinism -------------------------------------------------------
{
  const vec: Vec = { x: 1234, y: 567, heading: 77, speed: 42, t: 999_983 };
  const w1 = encodePresence(vec, AUTHOR_HEX, 'hi');
  const w2 = encodePresence(vec, AUTHOR_HEX, 'hi');
  check('encoding the same vector twice yields byte-identical output', w1 === w2, { w1, w2 });
  check('and it matches the same hand-derived string as before',
    w1 === 'v1|presence|1234|567|77|42|999983|a1b2c3d4e5f60718|hi', w1);
}

// --- Rejection, exhaustively -------------------------------------------
// Every case below is a hand-written wire string, not a corrupted output of
// our own encoder (which would refuse to produce most of these in the first
// place — see the encode-side checks further down).
check('empty string is rejected', decodeBody('', AUTHOR_HEX, 'h') === null);
check('unknown version tag is rejected',
  decodeBody('v2|presence|100|100|0|10|1000|', AUTHOR_HEX, 'h') === null);
check('too few fields (presence missing heading/speed/ms/say) is rejected',
  decodeBody('v1|presence|100|100', AUTHOR_HEX, 'h') === null);
check('too many fields (eat with an extra trailing field) is rejected',
  decodeBody('v1|eat|5|1000|a1b2c3d4e5f60718|extra', AUTHOR_HEX, 'h') === null);
check('a non-integer coordinate is rejected',
  decodeBody('v1|presence|100.5|100|0|10|1000|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') === null);
check('a negative ms is rejected',
  decodeBody('v1|presence|100|100|0|10|-5|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') === null);
check('a heading outside [0, HEADING_STEPS) is rejected (duplicated here for the exhaustive list)',
  decodeBody(`v1|presence|100|100|${HEADING_STEPS}|10|1000|a1b2c3d4e5f60718|`, AUTHOR_HEX, 'h') === null);
check('a coordinate outside the world (x > WORLD_W) is rejected',
  decodeBody(`v1|presence|${WORLD_W + 1}|100|0|10|1000|a1b2c3d4e5f60718|`, AUTHOR_HEX, 'h') === null);
check('a coordinate outside the world (y > WORLD_H) is rejected',
  decodeBody(`v1|presence|100|${WORLD_H + 1}|0|10|1000|a1b2c3d4e5f60718|`, AUTHOR_HEX, 'h') === null);
check('x === WORLD_W (inclusive boundary) is accepted',
  decodeBody(`v1|presence|${WORLD_W}|100|0|10|1000|a1b2c3d4e5f60718|`, AUTHOR_HEX, 'h') !== null);
// Review fix: the lower bound was missing entirely (only `x > WORLD_W` /
// `y > WORLD_H` were checked). `-1` parses fine (parseIntField accepts
// negative literals by design), so nothing stopped it reaching the
// constructed Vec. x/y = 0 is the lower boundary and must still be
// accepted; -1 is one past it and must be rejected, on both axes.
check('x === 0 (lower boundary) is accepted',
  decodeBody('v1|presence|0|100|0|10|1000|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') !== null);
check('y === 0 (lower boundary) is accepted',
  decodeBody('v1|presence|100|0|0|10|1000|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') !== null);
check('a negative x coordinate is rejected',
  decodeBody('v1|presence|-1|100|0|10|1000|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') === null);
check('a negative y coordinate is rejected',
  decodeBody('v1|presence|100|-1|0|10|1000|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') === null);
// -0 is a second byte sequence for the same logical value 0. Deliberately
// rejected at the lexer (parseIntField), not accepted-and-normalised: this
// format has exactly one spelling per value (the same rule that already
// rejects "007" for 7). Covered for both x and y, plus heading/speed/ms/cell
// share the same lexer so one check here is representative of all of them.
check('x = -0 (negative zero) is rejected, not silently accepted as 0',
  decodeBody('v1|presence|-0|100|0|10|1000|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') === null);
check('y = -0 (negative zero) is rejected, not silently accepted as 0',
  decodeBody('v1|presence|100|-0|0|10|1000|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') === null);
check('a bare -0 ms is rejected by the same no-negative-zero rule',
  decodeBody('v1|presence|100|100|0|10|-0|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') === null);
check('a negative speed is rejected',
  decodeBody('v1|presence|100|100|0|-5|1000|a1b2c3d4e5f60718|', AUTHOR_HEX, 'h') === null);
check('a say exactly MAX_SAY long is accepted (boundary)',
  decodeBody(`v1|presence|100|100|0|10|1000|a1b2c3d4e5f60718|${'a'.repeat(MAX_SAY)}`, AUTHOR_HEX, 'h') !== null);
check('a say longer than MAX_SAY is rejected',
  decodeBody(`v1|presence|100|100|0|10|1000|a1b2c3d4e5f60718|${'a'.repeat(MAX_SAY + 1)}`, AUTHOR_HEX, 'h') === null);
check('a say containing the field delimiter is rejected',
  decodeBody('v1|presence|100|100|0|10|1000|a1b2c3d4e5f60718|hi|there', AUTHOR_HEX, 'h') === null);
check('an unrecognized kind tag is rejected',
  decodeBody('v1|bogus|1|2', AUTHOR_HEX, 'h') === null);

// --- Encode-side validation (defensive, not part of the wire boundary) -----
// decodeBody is the real hostile-input boundary (see above); these just
// confirm our own encoder refuses to produce a body it would then itself
// reject, catching a caller bug before it wastes a PoW-mined write.
{
  let threw = false;
  try { encodePresence({ x: 0, y: 0, heading: HEADING_STEPS, speed: 0, t: 0 }, AUTHOR_HEX); } catch { threw = true; }
  check('encodePresence throws on an out-of-range heading', threw);
}
{
  let threw = false;
  try { encodePresence({ x: 0, y: 0, heading: 0, speed: 0, t: 0 }, AUTHOR_HEX, 'a|b'); } catch { threw = true; }
  check('encodePresence throws on a say containing the delimiter', threw);
}
{
  let threw = false;
  try { encodePresence({ x: 0, y: 0, heading: 0, speed: 0, t: 0 }, AUTHOR_HEX, 'a'.repeat(MAX_SAY + 1)); } catch { threw = true; }
  check('encodePresence throws on a say over MAX_SAY', threw);
}
{
  let threw = false;
  try { encodeEat(CELL_COUNT, 0, AUTHOR_HEX); } catch { threw = true; }
  check('encodeEat throws on an out-of-grid cell', threw);
}

// =========================================================================
// The checkpoint kind
// =========================================================================
// A checkpoint travels as a reply body alongside vectors and eat claims:
//   v1|checkpoint|salt|<canonical checkpoint JSON>
// Every wire string below is hand-written from that grammar. The JSON tails
// are hand-derived from `serialiseCheckpoint`'s documented fixed key order
// (`epoch`, `sizes`, `recent`) and JSON.stringify's no-whitespace output —
// never produced by calling the code under test.

// The checkpoint every case below builds on. Two swimmers, one of whom ate
// recently enough to carry a `recent` row.
//
// THE IDS ARE 64-HEX AND THE EPOCH IS A REAL ONE, and both had to change:
// `checkpointInDomain` holds a checkpoint's own ids to the same shape the
// reply envelope's author is held to (shoalRoom.ts's AUTHOR_ID_RE), and
// refuses any carried bite time later than the end of the epoch being
// summarised. `alice`/`bob` at `epoch: 7` were readable and are not a
// checkpoint any peer would now accept — a fixture built on them would make
// every rejection case below pass for the wrong reason.
//
// Hand-derived epoch: 1_700_000_000_123 / EPOCH_MS(3_600_000) = 472_222.2…,
// so that bite falls in epoch 472_222, which runs
// [472_222 * 3_600_000, 472_223 * 3_600_000) =
// [1_699_999_200_000, 1_700_002_800_000) — the bite sits 800_123 ms into it.
const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64); // 'a' < 'b', so [ALICE, BOB] is strictly ascending
const CP_EPOCH = 472_222;
const CP_END_MS = 1_700_002_800_000; // hand-derived: (472_222 + 1) * 3_600_000
const CP: Checkpoint = {
  epoch: CP_EPOCH,
  sizes: [[ALICE, 112], [BOB, 88]],
  recent: [[ALICE, 1_700_000_000_123, [1_700_000_000_123]]],
};
// Hand-assembled, brace by brace, from {epoch, sizes, recent} in that order:
//   {  "epoch":472222  ,  "sizes":[[<ALICE>,112],[<BOB>,88]]
//                      ,  "recent":[[<ALICE>,1700000000123,[1700000000123]]]  }
const CP_JSON =
  '{"epoch":472222,"sizes":[["' + ALICE + '",112],["' + BOB + '",88]],'
  + '"recent":[["' + ALICE + '",1700000000123,[1700000000123]]]}';
const CP_WIRE = `v1|checkpoint|${SALT}|${CP_JSON}`;

// --- Round trip ------------------------------------------------------------
{
  const wire = encodeCheckpoint(CP, AUTHOR_HEX);
  check('encodeCheckpoint matches the hand-derived wire string', wire === CP_WIRE, wire);

  const decoded = decodeCheckpointBody(CP_WIRE, AUTHOR_HEX, 'hash-c');
  check('a checkpoint body decodes to a checkpoint entry',
    decoded !== null && decoded.kind === 'checkpoint', decoded);
  check('…carrying the id and hash from the ENVELOPE, not the body',
    decoded !== null && decoded.id === AUTHOR_HEX && decoded.hash === 'hash-c', decoded);
  check('…and every field of the checkpoint round-trips exactly',
    decoded !== null
      && decoded.cp.epoch === CP_EPOCH
      && decoded.cp.sizes.length === 2
      && decoded.cp.sizes[0][0] === ALICE && decoded.cp.sizes[0][1] === 112
      && decoded.cp.sizes[1][0] === BOB && decoded.cp.sizes[1][1] === 88
      && decoded.cp.recent.length === 1
      && decoded.cp.recent[0][0] === ALICE
      && decoded.cp.recent[0][1] === 1_700_000_000_123
      && decoded.cp.recent[0][2].length === 1
      && decoded.cp.recent[0][2][0] === 1_700_000_000_123,
    decoded);
  // As for a move: blank the id first, since the id now contains the salt by
  // construction. What must not appear is a salt FIELD.
  check('…and the salt does not leak onto the decoded entry as a field of its own',
    decoded !== null
      && !JSON.stringify({ ...decoded, id: '' }).includes(SALT)
      && !('salt' in decoded),
    decoded);
}
{
  // The empty checkpoint — an epoch nobody swam. `recent` is written even
  // when empty (see the "recent is not optional on this wire" case below).
  const empty: Checkpoint = { epoch: 0, sizes: [], recent: [] };
  const expected = `v1|checkpoint|${SALT}|{"epoch":0,"sizes":[],"recent":[]}`;
  check('an empty checkpoint matches its hand-derived wire string',
    encodeCheckpoint(empty, AUTHOR_HEX) === expected, encodeCheckpoint(empty, AUTHOR_HEX));
  const d = decodeCheckpointBody(expected, AUTHOR_HEX, 'h');
  check('an empty checkpoint round-trips',
    d !== null && d.cp.epoch === 0 && d.cp.sizes.length === 0 && d.cp.recent.length === 0, d);
}
{
  const w1 = encodeCheckpoint(CP, AUTHOR_HEX);
  const w2 = encodeCheckpoint(CP, AUTHOR_HEX);
  check('encoding the same checkpoint twice is byte-identical', w1 === w2, { w1, w2 });
}

// --- The salt decision -----------------------------------------------------
// A checkpoint carries a salt (see shoalWire.ts's "A checkpoint is a third
// kind, and it carries a salt"). Two swimmers who AGREE about an epoch
// produce the same canonical payload but DIFFERENT bodies, so both writes
// land as distinct on-chain objects instead of the second being silently
// dropped and its author credited to the first.
{
  const mine = encodeCheckpoint(CP, AUTHOR_HEX);
  const theirs = encodeCheckpoint(CP, OTHER_AUTHOR_HEX);
  check('two swimmers publishing the SAME epoch produce different bodies',
    mine !== theirs, { mine, theirs });
  check('…each exactly the hand-derived string for its own salt',
    mine === `v1|checkpoint|${SALT}|${CP_JSON}`
    && theirs === `v1|checkpoint|${OTHER_SALT}|${CP_JSON}`, { mine, theirs });
  // …and yet they agree, because agreement is judged on the PAYLOAD.
  const a = decodeCheckpointBody(mine, AUTHOR_HEX, 'hash-a');
  const b = decodeCheckpointBody(theirs, OTHER_AUTHOR_HEX, 'hash-b');
  check('…and both decode to the identical canonical payload (they agree)',
    a !== null && b !== null && JSON.stringify(a.cp) === JSON.stringify(b.cp), { a, b });
  check('…while remaining distinguishable as two different publishers',
    a !== null && b !== null && a.id !== b.id, { a, b });
}
{
  // A CHECKPOINT IS EXEMPT FROM THE SALT/AUTHOR BINDING, and the exemption is
  // load-bearing rather than an oversight — binding it here was shipped once and
  // had to be reverted. `content_id = sha256(body)`, so a byte-identical copy of
  // an honest checkpoint is ONE object with a nondeterministic reported author;
  // binding meant the node that attributed the copy to the attacker DROPPED a
  // valid checkpoint and left its clients unseeded. Measured on two peered
  // nodes. See `saltMatchesAuthor`'s "WHY A CHECKPOINT IS EXEMPT", and
  // adopt.test.ts section 9 for the agreement it protects.
  //
  // Binding it bought nothing back: no checkpoint decision reads a content hash
  // any more (`adopt.ts` ranks by voters, then publisher id, then payload).
  const foreign = `v1|checkpoint|${OTHER_SALT}|${CP_JSON}`;
  const underA = decodeCheckpointBody(foreign, AUTHOR_HEX, 'hash-q');
  const underOther = decodeCheckpointBody(foreign, OTHER_AUTHOR_HEX, 'hash-q');
  check('a checkpoint whose salt disagrees with the envelope author still DECODES',
    underA !== null, underA);
  check('…and the identical body decodes under the author it IS salted with too',
    underOther !== null && underOther.id === OTHER_AUTHOR_HEX, underOther?.id);
  check('…to the identical payload, whichever author the node happened to report — '
    + 'which is what stops one write splitting two nodes\' clients',
    underA !== null && underOther !== null
      && JSON.stringify(underA.cp) === JSON.stringify(underOther.cp),
    { underA, underOther });
  check('…while each still carries the ENVELOPE\'s id, never the salt\'s owner',
    underA !== null && underA.id === AUTHOR_HEX, underA?.id);

  // A MOVE is still bound, and this is the pair that pins the asymmetry: the
  // same foreign-salt situation, opposite answers, on purpose.
  check('…whereas a MOVE with a foreign salt is still rejected (the paths differ '
    + 'deliberately — a dropped move self-heals in one emit gap, a dropped '
    + 'checkpoint costs a whole node the hour)',
    decodeBody(`v1|eat|5|1000|${OTHER_SALT}`, AUTHOR_HEX, 'hash-q') === null);

  // The ENCODE side is unchanged: an honest publisher still salts with its own
  // key, so two agreeing publishers still produce two distinct chain objects —
  // the salt's original job, which never depended on the decoder checking it.
  check('an honest publisher still salts with its own key',
    encodeCheckpoint(CP, OTHER_AUTHOR_HEX) === foreign, encodeCheckpoint(CP, OTHER_AUTHOR_HEX));
  check('…so two agreeing publishers still produce two distinct bodies',
    encodeCheckpoint(CP, AUTHOR_HEX) !== encodeCheckpoint(CP, OTHER_AUTHOR_HEX));
}

// --- A checkpoint is not a move, and a move is not a checkpoint ------------
// The two decoders are disjoint by the kind tag. Note that a REAL move body
// is also rejected by decodeCheckpointBody on its salt field (a move's third
// field is a coordinate or a cell, not 16 hex characters), so the cases that
// actually exercise the kind tag ALONE are the mis-tagged ones below.
{
  const presenceWire = `v1|presence|1234|567|77|42|999983|${SALT}|`;
  const eatWire = `v1|eat|5|1000|${SALT}`;

  check('decodeBody rejects a checkpoint body (a checkpoint is not a log entry)',
    decodeBody(CP_WIRE, AUTHOR_HEX, 'h') === null, decodeBody(CP_WIRE, AUTHOR_HEX, 'h'));
  check('decodeCheckpointBody rejects a presence body',
    decodeCheckpointBody(presenceWire, AUTHOR_HEX, 'h') === null);
  check('decodeCheckpointBody rejects an eat body',
    decodeCheckpointBody(eatWire, AUTHOR_HEX, 'h') === null);

  // Mis-tagged: a well-formed checkpoint payload wearing a MOVE's kind tag.
  // Everything after the kind tag is a valid checkpoint body's tail, so the
  // kind tag is the only thing that can reject it.
  const cpUnderEat = `v1|eat|${SALT}|${CP_JSON}`;
  const cpUnderPresence = `v1|presence|${SALT}|${CP_JSON}`;
  check('a checkpoint payload wearing the `eat` kind tag is rejected by decodeCheckpointBody',
    decodeCheckpointBody(cpUnderEat, AUTHOR_HEX, 'h') === null, decodeCheckpointBody(cpUnderEat, AUTHOR_HEX, 'h'));
  check('…and by decodeBody too',
    decodeBody(cpUnderEat, AUTHOR_HEX, 'h') === null, decodeBody(cpUnderEat, AUTHOR_HEX, 'h'));
  check('a checkpoint payload wearing the `presence` kind tag is rejected by decodeCheckpointBody',
    decodeCheckpointBody(cpUnderPresence, AUTHOR_HEX, 'h') === null,
    decodeCheckpointBody(cpUnderPresence, AUTHOR_HEX, 'h'));
  check('…and by decodeBody too',
    decodeBody(cpUnderPresence, AUTHOR_HEX, 'h') === null, decodeBody(cpUnderPresence, AUTHOR_HEX, 'h'));

  // Mis-tagged the other way: a well-formed eat body wearing `checkpoint`.
  const eatUnderCheckpoint = `v1|checkpoint|5|1000|${SALT}`;
  check('an eat body wearing the `checkpoint` kind tag is rejected by both decoders',
    decodeCheckpointBody(eatUnderCheckpoint, AUTHOR_HEX, 'h') === null
    && decodeBody(eatUnderCheckpoint, AUTHOR_HEX, 'h') === null);

  check('an unknown version tag on a checkpoint is rejected',
    decodeCheckpointBody(`v2|checkpoint|${SALT}|${CP_JSON}`, AUTHOR_HEX, 'h') === null);
}

// --- Rejection, exhaustively ----------------------------------------------
// Hand-written bodies throughout; the encoder would refuse to produce most of
// these in the first place, which is the point.
{
  const cp = (json: string) => decodeCheckpointBody(`v1|checkpoint|${SALT}|${json}`, AUTHOR_HEX, 'h');
  // Every hand-written payload below uses REAL ids and epoch 7's own time
  // range (epoch 7 ends at 8 * 3_600_000 = 28_800_000 ms, so a bite time of 1
  // is well inside it). Anything else would be rejected by the domain check
  // before the rule each case is named for ever ran.
  const A = '"' + ALICE + '"';
  const B = '"' + BOB + '"';

  // sizes must already be sorted strictly ascending by id — sorting it here
  // would let two serialisations of one world both parse, which is the whole
  // reason the checkpoint is canonical.
  check('an unsorted `sizes` is rejected',
    cp(`{"epoch":7,"sizes":[[${B},88],[${A},112]],"recent":[]}`) === null);
  check('a duplicated id in `sizes` is rejected (strictly ascending, no dupes)',
    cp(`{"epoch":7,"sizes":[[${A},112],[${A},88]],"recent":[]}`) === null);
  check('an unsorted `recent` is rejected too',
    cp(`{"epoch":7,"sizes":[],"recent":[[${B},1,[1]],[${A},1,[1]]]}`) === null);

  check('a non-integer size is rejected',
    cp(`{"epoch":7,"sizes":[[${A},112.5]],"recent":[]}`) === null);
  check('a non-integer lastBiteMs is rejected',
    cp(`{"epoch":7,"sizes":[],"recent":[[${A},1.5,[1]]]}`) === null);
  check('a non-integer bite ms is rejected',
    cp(`{"epoch":7,"sizes":[],"recent":[[${A},1,[1.5]]]}`) === null);
  check('a non-string id is rejected',
    cp('{"epoch":7,"sizes":[[5,112]],"recent":[]}') === null);
  check('a two-element `recent` row is rejected',
    cp(`{"epoch":7,"sizes":[],"recent":[[${A},1]]}`) === null);

  // The epoch's own domain. `epoch` is NOT duplicated as a head field — it
  // lives once, inside the payload — so this is the only place it is checked.
  check('a non-integer epoch is rejected', cp('{"epoch":7.5,"sizes":[],"recent":[]}') === null);
  check('a missing epoch is rejected', cp('{"sizes":[],"recent":[]}') === null);
  check('a string epoch is rejected', cp('{"epoch":"7","sizes":[],"recent":[]}') === null);
  check('a negative epoch is rejected', cp('{"epoch":-1,"sizes":[],"recent":[]}') === null);
  check('epoch 0 (the lower boundary) is accepted', cp('{"epoch":0,"sizes":[],"recent":[]}') !== null);
  // 1e+21 is an integer to `Number.isInteger` and survives a JSON round trip
  // verbatim (JSON.stringify(1e21) === '1e+21'), so ONLY the safe-integer rule
  // rejects it. Anything past 2^53-1 has lost the exact-integer arithmetic the
  // rest of this game is built on.
  check('an epoch past Number.MAX_SAFE_INTEGER is rejected (1e+21 survives the canonical-form check)',
    cp('{"epoch":1e+21,"sizes":[],"recent":[]}') === null);
  check('a size past Number.MAX_SAFE_INTEGER is rejected',
    cp(`{"epoch":7,"sizes":[[${A},1e+21]],"recent":[]}`) === null);
  check('a negative size is rejected', cp(`{"epoch":7,"sizes":[[${A},-5]],"recent":[]}`) === null);
  check('a negative lastBiteMs is rejected',
    cp(`{"epoch":7,"sizes":[],"recent":[[${A},-1,[]]]}`) === null);
  check('a negative bite ms is rejected',
    cp(`{"epoch":7,"sizes":[],"recent":[[${A},1,[-1]]]}`) === null);

  // Exactly one spelling per value — the same rule that already rejects
  // "007" for 7 in a move's integer fields. `-0` and `1E21` both parse to a
  // legitimate number and are caught by the canonical-form check alone.
  //
  // `-0` is spelled on a BITE MS rather than on a size, deliberately: `-0` is
  // below MIN_SIZE, so as a size the domain check would reject it first and
  // this case would stop discriminating the canonical-form rule it is named
  // for. As a bite ms it is in domain (`-0 >= 0`, and `-0 <= endMs`), so the
  // canonical-form check is the only thing left that can reject it.
  check('a bite ms of -0 is rejected (JSON.stringify(-0) is "0", so this is a second spelling)',
    cp(`{"epoch":7,"sizes":[],"recent":[[${A},1,[-0]]]}`) === null);
  check('an exponent spelling of a small integer is rejected (1E2 for 100)',
    cp(`{"epoch":7,"sizes":[[${A},1E2]],"recent":[]}`) === null);
  check('whitespace inside the payload is rejected (a second spelling of one world)',
    cp('{"epoch": 7, "sizes": [], "recent": []}') === null);
  check('a different key order is rejected (a second spelling of one world)',
    cp('{"sizes":[],"epoch":7,"recent":[]}') === null);
  check('an unknown extra key is rejected',
    cp('{"epoch":7,"sizes":[],"recent":[],"extra":1}') === null);
  // `parseCheckpoint` tolerates an absent `recent` for checkpoints serialised
  // before that field existed. Nothing has ever been published on THIS wire,
  // so the canonical form always carries it and the lenient spelling must not
  // become a second body for one world.
  check('an absent `recent` is rejected on the wire (the canonical form always writes it)',
    cp('{"epoch":7,"sizes":[]}') === null);

  check('a truncated payload (unterminated JSON) is rejected',
    cp(`{"epoch":7,"sizes":[[${A},112]],"recent":[]`) === null);
  check('an empty payload is rejected', cp('') === null);
  check('a non-object payload is rejected', cp('7') === null);
  check('a null payload is rejected', cp('null') === null);
  check('an array payload is rejected', cp('[]') === null);

  // Truncation of the BODY rather than the payload: no payload field at all.
  check('a body truncated before the payload field is rejected',
    decodeCheckpointBody(`v1|checkpoint|${SALT}`, AUTHOR_HEX, 'h') === null);
  check('a body truncated to version|kind is rejected',
    decodeCheckpointBody('v1|checkpoint', AUTHOR_HEX, 'h') === null);
  check('an empty body is rejected', decodeCheckpointBody('', AUTHOR_HEX, 'h') === null);

  // The salt's shape, exactly as for a move.
  check('a checkpoint with a 15-character salt is rejected',
    decodeCheckpointBody(`v1|checkpoint|${SALT.slice(0, 15)}|${CP_JSON}`, AUTHOR_HEX, 'h') === null);
  check('a checkpoint with a 17-character salt is rejected',
    decodeCheckpointBody(`v1|checkpoint|${SALT}a|${CP_JSON}`, AUTHOR_HEX, 'h') === null);
  check('a checkpoint with an UPPERCASE salt is rejected',
    decodeCheckpointBody(`v1|checkpoint|${SALT.toUpperCase()}|${CP_JSON}`, AUTHOR_HEX, 'h') === null);
  check('a checkpoint with an empty salt field is rejected',
    decodeCheckpointBody(`v1|checkpoint||${CP_JSON}`, AUTHOR_HEX, 'h') === null);
  check('a checkpoint with a non-hex salt is rejected',
    decodeCheckpointBody(`v1|checkpoint|zzzzzzzzzzzzzzzz|${CP_JSON}`, AUTHOR_HEX, 'h') === null);
}

// --- The payload is LAST, so a delimiter inside it is not a field boundary --
// Unlike `say`, the payload is not delimiter-checked: it is taken as
// everything after the third `|`. An id containing a `|` USED to decode on
// that reasoning; it no longer does, because `checkpointInDomain` requires
// every id to be 64-character lowercase hex.
//
// The distinction still matters, and this case is what keeps it honest: the
// GRAMMAR must still hand the whole tail over rather than truncating it at the
// first `|`. So the payload below is checked twice — `parseCheckpoint` accepts
// it (proving the whole tail arrived intact and structurally well-formed) and
// `decodeCheckpointBody` rejects it (proving the DOMAIN, not the split, is
// what refuses it). If the tail were being truncated at the delimiter,
// `parseCheckpoint` would fail on unterminated JSON instead.
{
  const json = '{"epoch":0,"sizes":[["a|b",100]],"recent":[]}';
  check('a payload containing the delimiter still reaches parseCheckpoint WHOLE',
    (() => {
      const parsed = parseCheckpoint(json);
      return parsed !== null && parsed.sizes.length === 1 && parsed.sizes[0][0] === 'a|b';
    })(), parseCheckpoint(json));
  check('…and is then rejected on the id\'s SHAPE, not on the field split',
    decodeCheckpointBody(`v1|checkpoint|${SALT}|${json}`, AUTHOR_HEX, 'h') === null);
}

// --- The domain bounds ----------------------------------------------------
// The trust boundary. Before checkpoints existed, no attacker-controlled bytes
// could seed a fold at all (`createLoop`'s seed was a hard `null`); now an
// adopted checkpoint is written straight into fold state by `foldShoal` and
// then REPUBLISHED next hour as the adopter's own honest checkpoint. Adoption
// is trust-on-first-sight (adopt.ts), so `checkpointInDomain` is the only
// place any of this is ever checked.
//
// Each case is paired with the value one step INSIDE the bound, which must be
// accepted — a bound on a consensus wire that is one step too tight refuses
// honest checkpoints forever.
{
  const cp = (json: string) => decodeCheckpointBody(`v1|checkpoint|${SALT}|${json}`, AUTHOR_HEX, 'h');
  const A = '"' + ALICE + '"';
  const E = String(CP_EPOCH);

  // 1. NO TIME IN THE FUTURE OF THE EPOCH BEING SUMMARISED.
  // Hand-derived: epoch 472_222 ends at 1_700_002_800_000 (CP_END_MS). A
  // `lastBiteMs` past that is the one that never decays — hunger is skipped
  // while `t - f.lastBiteMs < HUNGER_TICK_INTERVAL * TICK_MS`, so a future
  // value makes that difference permanently negative — and `checkpointFrom`
  // re-emits any swimmer within VOID_WINDOW_MS of the cutoff, which a future
  // value always satisfies, so the adopter republishes the lie as its own.
  check('a lastBiteMs one ms after the epoch ends is rejected',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},${CP_END_MS + 1},[]]]}`) === null);
  check('…and MAX_SAFE_INTEGER, the immortality value, likewise',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},9007199254740991,[]]]}`) === null);
  check('…while a lastBiteMs exactly ON the epoch end is accepted (the bound is inclusive, '
    + 'and an honest one is a whole tick below it)',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},${CP_END_MS},[]]]}`) !== null);
  check('a BITE ms after the epoch ends is rejected too, not just lastBiteMs',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},1,[${CP_END_MS + 1}]]]}`) === null);

  // 2. SIZES INSIDE THE FOLD'S OWN RANGE. `clampSize` floors at MIN_SIZE(60)
  // and never ceilings, so both halves are checked here.
  check('a size below MIN_SIZE is rejected (59)',
    cp(`{"epoch":${E},"sizes":[[${A},59]],"recent":[]}`) === null);
  check('…while MIN_SIZE itself is accepted (60 — clampSize\'s own floor)',
    cp(`{"epoch":${E},"sizes":[[${A},60]],"recent":[]}`) !== null);
  check('a size past MAX_SIZE is rejected (1_000_000_001)',
    cp(`{"epoch":${E},"sizes":[[${A},1000000001]],"recent":[]}`) === null);
  check('…while MAX_SIZE itself is accepted',
    cp(`{"epoch":${E},"sizes":[[${A},1000000000]],"recent":[]}`) !== null);
  check('hand-derived: MAX_SIZE is 1e9, which at the fold\'s fastest possible '
    + 'growth (EPOCH_MS/EAT_COOLDOWN_MS + 1 = 1441 bites * BITE_GROWTH 12 = 17_292 an epoch) '
    + 'is 57_830 unbroken epochs of play',
    MAX_SIZE === 1_000_000_000
      && Math.floor(MAX_SIZE / ((EPOCH_MS / EAT_COOLDOWN_MS + 1) * BITE_GROWTH)) === 57_830,
    Math.floor(MAX_SIZE / ((EPOCH_MS / EAT_COOLDOWN_MS + 1) * BITE_GROWTH)));

  // 3. THE VOID LEDGER'S LENGTH. Derived, not chosen:
  // floor(VOID_WINDOW_MS 10_000 / EAT_COOLDOWN_MS 2_500) + 1 = 5, which is
  // exactly the longest ledger `foldTick` can build. An unbounded one can be
  // attached to ANOTHER swimmer, who is then charged
  // `voided.length * BITE_GROWTH` on the next sweep and filtered over per hush.
  check('hand-derived: MAX_RECENT_BITES is floor(10_000 / 2_500) + 1 = 5',
    MAX_RECENT_BITES === 5 && MAX_RECENT_BITES === Math.floor(VOID_WINDOW_MS / EAT_COOLDOWN_MS) + 1,
    MAX_RECENT_BITES);
  // A well-formed five-bite ledger: EAT_COOLDOWN_MS(2_500) apart, ascending,
  // spanning exactly VOID_WINDOW_MS(10_000), with lastBiteMs on the newest —
  // the exact shape `foldTick` builds at its maximum.
  const FIVE = '[2500,5000,7500,10000,12500]';
  check('…and a five-bite ledger in exactly that shape is accepted',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},12500,${FIVE}]]}`) !== null);
  // A six-bite ledger is rejected — but by the SPAN rule, not the length rule.
  // Six entries at least EAT_COOLDOWN_MS apart span at least 12_500 ms, past
  // VOID_WINDOW_MS, so the length check is provably redundant and NO input can
  // isolate it (confirmed by mutation: removing it changes no answer). It is
  // kept as the O(1) fast path — see `checkpointLedgerShape`. Named for what it
  // actually guards, rather than for the bound it looks like it is testing.
  check('a six-bite ledger is rejected — six bites 2.5 s apart cannot fit in a 10 s span',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},15000,[2500,5000,7500,10000,12500,15000]]]}`) === null);
  // Refused, but NOT "without being scanned" — `JSON.parse` and
  // `parseCheckpoint` have both already walked it by then. See
  // `checkpointLedgerShape`'s doc for the measured cost, which is parse-bound.
  check('...and a million-entry ledger is refused too',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},15000,[${Array.from({ length: 1_000_000 }, (_, i) => i * 2500).join(',')}]]]}`) === null);

  // THE LEDGER'S SHAPE, not just its length. A length bound alone did not make
  // the array well-formed, and the gap was reachable: five bites all at one
  // millisecond, with an older `lastBiteMs`, is a shape the fold can never
  // build — and `foldShoal` used to install it verbatim, after which the
  // swimmer's next bite appended a SIXTH that every one of the five survived
  // (they are a millisecond apart, so the VOID_WINDOW_MS filter drops none).
  // Measured: a fold reaching six. Not exploitable — the six-entry array cannot
  // be published back — but it made MAX_RECENT_BITES's own derivation untrue.
  check('a degenerate all-at-one-ms ledger is rejected (the fold cannot build one)',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},9999,[5000,5000,5000,5000,5000]]]}`) === null);
  check('bites closer together than EAT_COOLDOWN_MS are rejected (canEat refuses them)',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},7499,[5000,7499]]]}`) === null);
  check('…while exactly EAT_COOLDOWN_MS apart is accepted (canEat admits that)',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},7500,[5000,7500]]]}`) !== null);
  check('a descending ledger is rejected (entries are appended in ms order)',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},7500,[7500,5000]]]}`) === null);
  check('a bite later than lastBiteMs is rejected (lastBiteMs IS the newest bite)',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},5000,[7500]]]}`) === null);
  check('…while lastBiteMs NEWER than every bite is accepted — a sweep voids the '
    + 'tail out from under it and leaves lastBiteMs alone',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},99999,[5000,7500]]]}`) !== null);
  check('a ledger spanning more than VOID_WINDOW_MS is rejected',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},12501,[2500,12501]]]}`) === null);
  check('…while a span of exactly VOID_WINDOW_MS is accepted (the filter keeps <=)',
    cp(`{"epoch":${E},"sizes":[],"recent":[[${A},12500,[2500,12500]]]}`) !== null);

  // 4. HOW MANY SWIMMERS ONE CHECKPOINT MAY NAME.
  // Ids are generated as zero-padded hex counters so they are 64-hex AND
  // strictly ascending, which `parseCheckpoint` requires independently.
  const idAt = (n: number) => n.toString(16).padStart(64, '0');
  const sizesOf = (n: number) =>
    Array.from({ length: n }, (_, i) => `["${idAt(i)}",100]`).join(',');
  check(`a checkpoint naming ${MAX_CHECKPOINT_SWIMMERS + 1} swimmers is rejected`,
    cp(`{"epoch":${E},"sizes":[${sizesOf(MAX_CHECKPOINT_SWIMMERS + 1)}],"recent":[]}`) === null);
  check(`…while exactly ${MAX_CHECKPOINT_SWIMMERS} is accepted (40x the design's 25-swimmer `
    + 'ceiling, which nothing enforces)',
    cp(`{"epoch":${E},"sizes":[${sizesOf(MAX_CHECKPOINT_SWIMMERS)}],"recent":[]}`) !== null);
  const recentOf = (n: number) =>
    Array.from({ length: n }, (_, i) => `["${idAt(i)}",1,[1]]`).join(',');
  check('`recent` is length-bounded on its own, not only through `sizes`',
    cp(`{"epoch":${E},"sizes":[],"recent":[${recentOf(MAX_CHECKPOINT_SWIMMERS + 1)}]}`) === null);

  // 5. IDS ARE 64-CHARACTER LOWERCASE HEX — the same shape shoalRoom.ts's
  // AUTHOR_ID_RE holds the envelope author to. Every id in an honest
  // checkpoint came from a reply's `author_id`, which is gated on that shape
  // before the body is ever decoded, so any other shape names a swimmer no
  // honest client has folded.
  check('a short id is rejected', cp(`{"epoch":${E},"sizes":[["s1",100]],"recent":[]}`) === null);
  check('a 63-character id is rejected',
    cp(`{"epoch":${E},"sizes":[["${'a'.repeat(63)}",100]],"recent":[]}`) === null);
  check('a 65-character id is rejected',
    cp(`{"epoch":${E},"sizes":[["${'a'.repeat(65)}",100]],"recent":[]}`) === null);
  check('an UPPERCASE-hex id is rejected (one swimmer, two spellings)',
    cp(`{"epoch":${E},"sizes":[["${'A'.repeat(64)}",100]],"recent":[]}`) === null);
  check('a 64-character non-hex id is rejected',
    cp(`{"epoch":${E},"sizes":[["${'z'.repeat(64)}",100]],"recent":[]}`) === null);
  check('a padded-out id is rejected (an arbitrary-length string is not an id)',
    cp(`{"epoch":${E},"sizes":[["${'a'.repeat(10_000)}",100]],"recent":[]}`) === null);
  check('`recent`\'s ids are held to the same shape as `sizes`\'s',
    cp(`{"epoch":${E},"sizes":[],"recent":[["s1",1,[1]]]}`) === null);

  // 6. The epoch bound that keeps bound 1 meaningful: `(epoch + 1) * EPOCH_MS`
  // must itself be exact, or the future-time comparison is arithmetic on a
  // number that has lost its integers. MAX_SAFE_INTEGER / 3_600_000 is about
  // 2.5e9 epochs — ~285_000 years of hours — so this can only fire on a
  // fabricated epoch.
  check('an epoch whose end ms is past MAX_SAFE_INTEGER is rejected',
    cp('{"epoch":9007199254740000,"sizes":[],"recent":[]}') === null);
}

// --- Why the future-time bound is NOT cosmetic ----------------------------
// The heading check has a section in this module's header explaining what a
// bad heading does downstream; this is the same argument for `lastBiteMs`,
// except it is DEMONSTRATED rather than argued, because the consequence is a
// silent immortality rather than a NaN.
//
// Hunger is skipped while `t - f.lastBiteMs < HUNGER_TICK_INTERVAL * TICK_MS`
// (shoalEngine.ts step 6). A `lastBiteMs` in the future makes that difference
// permanently negative, so the swimmer NEVER GETS HUNGRY — not for this epoch,
// for every epoch, because `checkpointFrom` re-emits any swimmer whose
// `cutoffMs - lastBiteMs <= VOID_WINDOW_MS`, which a future value always
// satisfies, so the client that adopted the lie republishes it next hour as
// its own honest checkpoint.
//
// The fold below is hand-derived end to end:
//   epoch 472_222 starts at 472_222 * 3_600_000 = 1_699_999_200_000
//   one presence for ALICE at start - 1_000, so she is live throughout
//   seeded from epoch 472_221 at size 200, folded to start + 60_000
//   the warm-up runs WARMUP_MS/TICK_MS = 90_000/250 = 360 ticks, then the
//     epoch runs (60_000/250) + 1 = 241 ticks, so tickCount ends at 601
//   hunger fires on every 4th tick, i.e. at tickCount 364, 368 … 600 —
//     ((600 - 364) / 4) + 1 = 60 firings — at HUNGER_AMOUNT 1 apiece
//   so an honestly-seeded ALICE ends at 200 - 60 = 140.
{
  const E = 472_222;
  const START = 1_699_999_200_000; // hand-derived: 472_222 * 3_600_000
  const PREV_END = START;          // epoch 472_221 ends where 472_222 begins
  // Salted with ALICE's own key, since the decoder now requires the salt to
  // match the envelope author — the swimmer whose size this case is about.
  const pres = decodeBody(
    encodePresence({ x: 1000, y: 1000, heading: 0, speed: 0, t: START - 1000 }, ALICE),
    ALICE, 'sha256:pres',
  );
  const sizeAfter = (lastBiteMs: number): number => {
    const seed: Checkpoint = {
      epoch: E - 1, sizes: [[ALICE, 200]], recent: [[ALICE, lastBiteMs, []]],
    };
    return foldShoal(pres === null ? [] : [pres], START + 60_000, { epoch: E, seed })
      .fish.get(ALICE)?.size ?? -1;
  };

  check('hand-derived: an honestly-seeded swimmer loses 60 size to hunger over 60 s (200 -> 140)',
    sizeAfter(PREV_END - 100_000) === 140, sizeAfter(PREV_END - 100_000));
  check('...and one seeded with a FUTURE lastBiteMs never decays at all (200, forever)',
    sizeAfter(Number.MAX_SAFE_INTEGER) === 200, sizeAfter(Number.MAX_SAFE_INTEGER));
  // Which is why the value can never become a seed in the first place: the
  // only route from a published body to `foldShoal`'s seed is
  // decodeCheckpointBody -> adoptCheckpoint, and it is refused here.
  const immortal =
    '{"epoch":472221,"sizes":[["' + ALICE + '",200]],'
    + '"recent":[["' + ALICE + '",9007199254740991,[]]]}';
  check('...so the body carrying it is refused at the wire, which is the only way in',
    decodeCheckpointBody(`v1|checkpoint|${SALT}|${immortal}`, AUTHOR_HEX, 'h') === null);
  // The identical payload with an in-domain lastBiteMs decodes, so the
  // rejection above is the TIME bound and not some other thing about the body.
  const honest =
    '{"epoch":472221,"sizes":[["' + ALICE + '",200]],'
    + '"recent":[["' + ALICE + '",' + (PREV_END - 100_000) + ',[]]]}';
  check('...while the same payload with an in-domain lastBiteMs decodes normally',
    decodeCheckpointBody(`v1|checkpoint|${SALT}|${honest}`, AUTHOR_HEX, 'h') !== null);
}

// --- Encode-side validation (defensive, not the hostile-input boundary) ----
{
  const throws = (name: string, f: () => unknown) => {
    let threw = false;
    try { f(); } catch { threw = true; }
    check(name, threw);
  };
  throws('encodeCheckpoint throws on an unsorted `sizes`',
    () => encodeCheckpoint({ epoch: 7, sizes: [[BOB, 88], [ALICE, 112]], recent: [] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on a duplicated id',
    () => encodeCheckpoint({ epoch: 7, sizes: [[ALICE, 100], [ALICE, 200]], recent: [] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on an unsorted `recent`',
    () => encodeCheckpoint(
      { epoch: 7, sizes: [], recent: [[BOB, 1, [1]], [ALICE, 1, [1]]] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on a non-integer size',
    () => encodeCheckpoint({ epoch: 7, sizes: [[ALICE, 1.5]], recent: [] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on a negative epoch',
    () => encodeCheckpoint({ epoch: -1, sizes: [], recent: [] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on a size past Number.MAX_SAFE_INTEGER',
    () => encodeCheckpoint({ epoch: 7, sizes: [[ALICE, 1e21]], recent: [] }, AUTHOR_HEX));
  // The domain bounds are enforced from the encode side too, so a client
  // cannot burn a PoW mine on a checkpoint every peer would drop — and cannot
  // pass one on either, if it somehow folded to an out-of-domain state.
  throws('encodeCheckpoint throws on an id that is not 64-hex',
    () => encodeCheckpoint({ epoch: 7, sizes: [['s1', 100]], recent: [] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on a size below MIN_SIZE',
    () => encodeCheckpoint({ epoch: 7, sizes: [[ALICE, 59]], recent: [] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on a size past MAX_SIZE',
    () => encodeCheckpoint(
      { epoch: 7, sizes: [[ALICE, MAX_SIZE + 1]], recent: [] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on a bite time after the epoch ends',
    () => encodeCheckpoint(
      { epoch: 7, sizes: [], recent: [[ALICE, 28_800_001, []]] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on a ledger longer than MAX_RECENT_BITES',
    () => encodeCheckpoint(
      { epoch: 7, sizes: [], recent: [[ALICE, 6, [1, 2, 3, 4, 5, 6]]] }, AUTHOR_HEX));
  throws('encodeCheckpoint throws on a bech32m address instead of a pubkey hex',
    () => encodeCheckpoint(CP, 'sw1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'));
  // A caller that never went through `checkpointFrom` can hand over an object
  // whose `recent` is missing entirely. JSON.stringify DROPS an undefined
  // value, so the body would decode as the lenient no-`recent` form on a peer
  // — a second spelling of one world, authored by us. Caught before it costs
  // a PoW mine.
  throws('encodeCheckpoint throws when `recent` is absent (JSON.stringify would drop it)',
    () => encodeCheckpoint(
      { epoch: 7, sizes: [] } as unknown as Checkpoint, AUTHOR_HEX));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
