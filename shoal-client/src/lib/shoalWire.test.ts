/**
 * Wire format for a swim vector / eat claim. Run: npx tsx src/lib/shoalWire.test.ts
 *
 * Expected values here are derived by hand, in comments, never by calling
 * the function under test twice. Malformed bodies below are hand-written
 * wire strings, not produced by calling `encodePresence`/`encodeEat` and
 * then corrupting the result — a hostile client never calls our encoder, so
 * `decodeBody` has to be tested against text nobody here ever validated.
 */
import { encodePresence, encodeEat, decodeBody, saltFor, MAX_SAY, SALT_HEX_CHARS } from './shoalWire';
import { HEADING_STEPS, WORLD_W, WORLD_H, BLOOM_COLS, BLOOM_ROWS } from './shoalConst';
import type { Vec, Presence, EatClaim } from './shoalTypes';

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

  const decoded = decodeBody(wire, 'author-x', 'hash-y');
  check('decode round-trips every integer exactly',
    decoded !== null && decoded.kind === 'presence'
      && (decoded as Presence).vec.x === 1234
      && (decoded as Presence).vec.y === 567
      && (decoded as Presence).vec.heading === 77
      && (decoded as Presence).vec.speed === 42
      && (decoded as Presence).vec.t === 999_983,
    decoded);
  check('decode carries the id and hash supplied by the caller, not the wire',
    decoded !== null && decoded.id === 'author-x' && decoded.hash === 'hash-y', decoded);
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
  const a = decodeBody(wireA, 'a', 'ha');
  check('ms === vec.t (value A, 999983)',
    a !== null && a.kind === 'presence' && a.ms === 999_983 && (a as Presence).vec.t === 999_983, a);

  const wireB = 'v1|presence|10|10|0|0|42|a1b2c3d4e5f60718|';
  const b = decodeBody(wireB, 'b', 'hb');
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

  const decoded = decodeBody(wire, 'author-z', 'hash-z');
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

  check('heading 0 (lower boundary) is accepted', decodeBody(inRangeLow, 'i', 'h') !== null);
  check('heading HEADING_STEPS-1 (upper boundary) is accepted', decodeBody(inRangeHigh, 'i', 'h') !== null);
  check('heading === HEADING_STEPS is rejected', decodeBody(tooHigh, 'i', 'h') === null);
  check('heading === -1 is rejected', decodeBody(negative, 'i', 'h') === null);
}

// --- The eat claim -----------------------------------------------------
{
  const expectedWire = 'v1|eat|5|1000|a1b2c3d4e5f60718';
  const wire = encodeEat(5, 1000, AUTHOR_HEX);
  check('encodeEat matches the hand-derived wire string', wire === expectedWire, wire);

  const decoded = decodeBody(wire, 'author-e', 'hash-e');
  check('eat claim round-trips its cell and ms',
    decoded !== null && decoded.kind === 'eat'
      && (decoded as EatClaim).cell === 5 && decoded.ms === 1000
      && decoded.id === 'author-e' && decoded.hash === 'hash-e',
    decoded);

  // CELL_COUNT = BLOOM_COLS(32) * BLOOM_ROWS(24) = 768, valid cells 0..767.
  const lastValid = `v1|eat|${CELL_COUNT - 1}|1000|a1b2c3d4e5f60718`;
  const firstInvalid = `v1|eat|${CELL_COUNT}|1000|a1b2c3d4e5f60718`;
  check('cell CELL_COUNT-1 (last valid cell) is accepted', decodeBody(lastValid, 'i', 'h') !== null);
  check('a cell outside the grid (cell === CELL_COUNT) is rejected', decodeBody(firstInvalid, 'i', 'h') === null);
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

// --- The salt is NEVER trusted as the author ------------------------------
// The salt exists only to perturb sha256(body). `decodeBody` already receives
// the TRUE id from the reply envelope (shoalRoom.ts sources it from
// `author_id`), and a body's own claims about who wrote it are exactly what
// this decoder must not believe. A body salted with someone ELSE's key must
// still decode, and must decode with the ENVELOPE'S id — not the salt's owner,
// and not a rejection either (a mismatching salt is a valid, if pointless,
// body; rejecting it would make the decoder start adjudicating authorship).
{
  const envelopeAuthor = AUTHOR_HEX; // who the node says signed it
  const bodyWithForeignSalt = `v1|eat|5|1000|${OTHER_SALT}`; // salted as someone else
  const decoded = decodeBody(bodyWithForeignSalt, envelopeAuthor, 'hash-q');
  check('a body whose salt disagrees with the envelope author still decodes',
    decoded !== null, decoded);
  check('…and it decodes with the ENVELOPE\'s id, never the salt\'s owner',
    decoded !== null && decoded.id === envelopeAuthor, decoded?.id);
  check('…and the salt does not leak onto the decoded entry in any form',
    decoded !== null && !JSON.stringify(decoded).includes(OTHER_SALT), decoded);

  const presenceForeign = `v1|presence|10|20|5|7|55555|${OTHER_SALT}|hi`;
  const dp = decodeBody(presenceForeign, envelopeAuthor, 'hash-r');
  check('same for a presence body: foreign salt, envelope id wins',
    dp !== null && dp.id === envelopeAuthor, dp?.id);
}

// --- The salt's SHAPE is enforced (16 lowercase hex, exactly) -------------
// CONSENSUS: two clients checking different lengths would accept different sets
// of writes and silently fold different rooms. Hand-written bodies only.
check('a 15-character salt is rejected (one short)',
  decodeBody(`v1|eat|5|1000|${SALT.slice(0, 15)}`, 'i', 'h') === null);
check('a 17-character salt is rejected (one long)',
  decodeBody(`v1|eat|5|1000|${SALT}a`, 'i', 'h') === null);
check('an UPPERCASE salt is rejected (one spelling per value)',
  decodeBody(`v1|eat|5|1000|${SALT.toUpperCase()}`, 'i', 'h') === null);
check('a non-hex salt is rejected',
  decodeBody('v1|eat|5|1000|zzzzzzzzzzzzzzzz', 'i', 'h') === null);
check('an empty salt field is rejected',
  decodeBody('v1|eat|5|1000|', 'i', 'h') === null);
check('a presence body with a 15-character salt is rejected too',
  decodeBody(`v1|presence|10|20|5|7|55555|${SALT.slice(0, 15)}|hi`, 'i', 'h') === null);
check('a presence body with an empty salt field is rejected too',
  decodeBody('v1|presence|10|20|5|7|55555||hi', 'i', 'h') === null);
// The pre-salt grammar must not still decode — otherwise an old client's
// writes would keep folding and the collision this field closes would remain
// open for exactly as long as one such client kept running.
check('a PRE-SALT eat body (v1|eat|cell|ms) no longer decodes',
  decodeBody('v1|eat|5|1000', 'i', 'h') === null);
check('a PRE-SALT presence body (no salt field) no longer decodes',
  decodeBody('v1|presence|10|20|5|7|55555|hi', 'i', 'h') === null);

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
check('empty string is rejected', decodeBody('', 'i', 'h') === null);
check('unknown version tag is rejected',
  decodeBody('v2|presence|100|100|0|10|1000|', 'i', 'h') === null);
check('too few fields (presence missing heading/speed/ms/say) is rejected',
  decodeBody('v1|presence|100|100', 'i', 'h') === null);
check('too many fields (eat with an extra trailing field) is rejected',
  decodeBody('v1|eat|5|1000|a1b2c3d4e5f60718|extra', 'i', 'h') === null);
check('a non-integer coordinate is rejected',
  decodeBody('v1|presence|100.5|100|0|10|1000|a1b2c3d4e5f60718|', 'i', 'h') === null);
check('a negative ms is rejected',
  decodeBody('v1|presence|100|100|0|10|-5|a1b2c3d4e5f60718|', 'i', 'h') === null);
check('a heading outside [0, HEADING_STEPS) is rejected (duplicated here for the exhaustive list)',
  decodeBody(`v1|presence|100|100|${HEADING_STEPS}|10|1000|a1b2c3d4e5f60718|`, 'i', 'h') === null);
check('a coordinate outside the world (x > WORLD_W) is rejected',
  decodeBody(`v1|presence|${WORLD_W + 1}|100|0|10|1000|a1b2c3d4e5f60718|`, 'i', 'h') === null);
check('a coordinate outside the world (y > WORLD_H) is rejected',
  decodeBody(`v1|presence|100|${WORLD_H + 1}|0|10|1000|a1b2c3d4e5f60718|`, 'i', 'h') === null);
check('x === WORLD_W (inclusive boundary) is accepted',
  decodeBody(`v1|presence|${WORLD_W}|100|0|10|1000|a1b2c3d4e5f60718|`, 'i', 'h') !== null);
// Review fix: the lower bound was missing entirely (only `x > WORLD_W` /
// `y > WORLD_H` were checked). `-1` parses fine (parseIntField accepts
// negative literals by design), so nothing stopped it reaching the
// constructed Vec. x/y = 0 is the lower boundary and must still be
// accepted; -1 is one past it and must be rejected, on both axes.
check('x === 0 (lower boundary) is accepted',
  decodeBody('v1|presence|0|100|0|10|1000|a1b2c3d4e5f60718|', 'i', 'h') !== null);
check('y === 0 (lower boundary) is accepted',
  decodeBody('v1|presence|100|0|0|10|1000|a1b2c3d4e5f60718|', 'i', 'h') !== null);
check('a negative x coordinate is rejected',
  decodeBody('v1|presence|-1|100|0|10|1000|a1b2c3d4e5f60718|', 'i', 'h') === null);
check('a negative y coordinate is rejected',
  decodeBody('v1|presence|100|-1|0|10|1000|a1b2c3d4e5f60718|', 'i', 'h') === null);
// -0 is a second byte sequence for the same logical value 0. Deliberately
// rejected at the lexer (parseIntField), not accepted-and-normalised: this
// format has exactly one spelling per value (the same rule that already
// rejects "007" for 7). Covered for both x and y, plus heading/speed/ms/cell
// share the same lexer so one check here is representative of all of them.
check('x = -0 (negative zero) is rejected, not silently accepted as 0',
  decodeBody('v1|presence|-0|100|0|10|1000|a1b2c3d4e5f60718|', 'i', 'h') === null);
check('y = -0 (negative zero) is rejected, not silently accepted as 0',
  decodeBody('v1|presence|100|-0|0|10|1000|a1b2c3d4e5f60718|', 'i', 'h') === null);
check('a bare -0 ms is rejected by the same no-negative-zero rule',
  decodeBody('v1|presence|100|100|0|10|-0|a1b2c3d4e5f60718|', 'i', 'h') === null);
check('a negative speed is rejected',
  decodeBody('v1|presence|100|100|0|-5|1000|a1b2c3d4e5f60718|', 'i', 'h') === null);
check('a say exactly MAX_SAY long is accepted (boundary)',
  decodeBody(`v1|presence|100|100|0|10|1000|a1b2c3d4e5f60718|${'a'.repeat(MAX_SAY)}`, 'i', 'h') !== null);
check('a say longer than MAX_SAY is rejected',
  decodeBody(`v1|presence|100|100|0|10|1000|a1b2c3d4e5f60718|${'a'.repeat(MAX_SAY + 1)}`, 'i', 'h') === null);
check('a say containing the field delimiter is rejected',
  decodeBody('v1|presence|100|100|0|10|1000|a1b2c3d4e5f60718|hi|there', 'i', 'h') === null);
check('an unrecognized kind tag is rejected',
  decodeBody('v1|bogus|1|2', 'i', 'h') === null);

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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
