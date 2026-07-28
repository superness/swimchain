/**
 * Wire format for a swim vector / eat claim. Run: npx tsx src/lib/shoalWire.test.ts
 *
 * Expected values here are derived by hand, in comments, never by calling
 * the function under test twice. Malformed bodies below are hand-written
 * wire strings, not produced by calling `encodePresence`/`encodeEat` and
 * then corrupting the result — a hostile client never calls our encoder, so
 * `decodeBody` has to be tested against text nobody here ever validated.
 */
import { encodePresence, encodeEat, decodeBody, MAX_SAY } from './shoalWire';
import { HEADING_STEPS, WORLD_W, WORLD_H, BLOOM_COLS, BLOOM_ROWS } from './shoalConst';
import type { Vec, Presence, EatClaim } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const CELL_COUNT = BLOOM_COLS * BLOOM_ROWS; // 32 * 24 = 768

// --- Round trip --------------------------------------------------------
// Hand-derived wire string for this exact vector, per the chosen grammar
// `v1|presence|x|y|heading|speed|ms|say`: no say -> trailing field empty,
// so the string ends in a bare delimiter.
{
  const vec: Vec = { x: 1234, y: 567, heading: 77, speed: 42, t: 999_983 };
  const expectedWire = 'v1|presence|1234|567|77|42|999983|';
  const wire = encodePresence(vec);
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
// The grammar has exactly one ms token (`v1|presence|x|y|heading|speed|ms|say`)
// — there is no second field a hand-written body could put a different value
// in for vec.t, so ms === vec.t is structural, not merely usually true. Two
// distinct bodies with distinct, hand-picked ms values, neither of them 0 or
// otherwise coincidentally special, to rule out a lucky accidental match.
{
  const wireA = 'v1|presence|10|10|0|0|999983|';
  const a = decodeBody(wireA, 'a', 'ha');
  check('ms === vec.t (value A, 999983)',
    a !== null && a.kind === 'presence' && a.ms === 999_983 && (a as Presence).vec.t === 999_983, a);

  const wireB = 'v1|presence|10|10|0|0|42|';
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
  const expectedWire = 'v1|presence|10|20|5|7|55555|hello world';
  const wire = encodePresence(vec, say);
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
  const inRangeLow = 'v1|presence|10|10|0|1|1000|'; // heading 0: valid
  const inRangeHigh = `v1|presence|10|10|${HEADING_STEPS - 1}|1|1000|`; // heading 255: valid
  const tooHigh = `v1|presence|10|10|${HEADING_STEPS}|1|1000|`; // heading 256: invalid
  const negative = 'v1|presence|10|10|-1|1|1000|'; // heading -1: invalid

  check('heading 0 (lower boundary) is accepted', decodeBody(inRangeLow, 'i', 'h') !== null);
  check('heading HEADING_STEPS-1 (upper boundary) is accepted', decodeBody(inRangeHigh, 'i', 'h') !== null);
  check('heading === HEADING_STEPS is rejected', decodeBody(tooHigh, 'i', 'h') === null);
  check('heading === -1 is rejected', decodeBody(negative, 'i', 'h') === null);
}

// --- The eat claim -----------------------------------------------------
{
  const expectedWire = 'v1|eat|5|1000';
  const wire = encodeEat(5, 1000);
  check('encodeEat matches the hand-derived wire string', wire === expectedWire, wire);

  const decoded = decodeBody(wire, 'author-e', 'hash-e');
  check('eat claim round-trips its cell and ms',
    decoded !== null && decoded.kind === 'eat'
      && (decoded as EatClaim).cell === 5 && decoded.ms === 1000
      && decoded.id === 'author-e' && decoded.hash === 'hash-e',
    decoded);

  // CELL_COUNT = BLOOM_COLS(32) * BLOOM_ROWS(24) = 768, valid cells 0..767.
  const lastValid = `v1|eat|${CELL_COUNT - 1}|1000`;
  const firstInvalid = `v1|eat|${CELL_COUNT}|1000`;
  check('cell CELL_COUNT-1 (last valid cell) is accepted', decodeBody(lastValid, 'i', 'h') !== null);
  check('a cell outside the grid (cell === CELL_COUNT) is rejected', decodeBody(firstInvalid, 'i', 'h') === null);
}

// --- Determinism -------------------------------------------------------
{
  const vec: Vec = { x: 1234, y: 567, heading: 77, speed: 42, t: 999_983 };
  const w1 = encodePresence(vec, 'hi');
  const w2 = encodePresence(vec, 'hi');
  check('encoding the same vector twice yields byte-identical output', w1 === w2, { w1, w2 });
  check('and it matches the same hand-derived string as before',
    w1 === 'v1|presence|1234|567|77|42|999983|hi', w1);
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
  decodeBody('v1|eat|5|1000|extra', 'i', 'h') === null);
check('a non-integer coordinate is rejected',
  decodeBody('v1|presence|100.5|100|0|10|1000|', 'i', 'h') === null);
check('a negative ms is rejected',
  decodeBody('v1|presence|100|100|0|10|-5|', 'i', 'h') === null);
check('a heading outside [0, HEADING_STEPS) is rejected (duplicated here for the exhaustive list)',
  decodeBody(`v1|presence|100|100|${HEADING_STEPS}|10|1000|`, 'i', 'h') === null);
check('a coordinate outside the world (x > WORLD_W) is rejected',
  decodeBody(`v1|presence|${WORLD_W + 1}|100|0|10|1000|`, 'i', 'h') === null);
check('a coordinate outside the world (y > WORLD_H) is rejected',
  decodeBody(`v1|presence|100|${WORLD_H + 1}|0|10|1000|`, 'i', 'h') === null);
check('x === WORLD_W (inclusive boundary) is accepted',
  decodeBody(`v1|presence|${WORLD_W}|100|0|10|1000|`, 'i', 'h') !== null);
// Review fix: the lower bound was missing entirely (only `x > WORLD_W` /
// `y > WORLD_H` were checked). `-1` parses fine (parseIntField accepts
// negative literals by design), so nothing stopped it reaching the
// constructed Vec. x/y = 0 is the lower boundary and must still be
// accepted; -1 is one past it and must be rejected, on both axes.
check('x === 0 (lower boundary) is accepted',
  decodeBody('v1|presence|0|100|0|10|1000|', 'i', 'h') !== null);
check('y === 0 (lower boundary) is accepted',
  decodeBody('v1|presence|100|0|0|10|1000|', 'i', 'h') !== null);
check('a negative x coordinate is rejected',
  decodeBody('v1|presence|-1|100|0|10|1000|', 'i', 'h') === null);
check('a negative y coordinate is rejected',
  decodeBody('v1|presence|100|-1|0|10|1000|', 'i', 'h') === null);
// -0 is a second byte sequence for the same logical value 0. Deliberately
// rejected at the lexer (parseIntField), not accepted-and-normalised: this
// format has exactly one spelling per value (the same rule that already
// rejects "007" for 7). Covered for both x and y, plus heading/speed/ms/cell
// share the same lexer so one check here is representative of all of them.
check('x = -0 (negative zero) is rejected, not silently accepted as 0',
  decodeBody('v1|presence|-0|100|0|10|1000|', 'i', 'h') === null);
check('y = -0 (negative zero) is rejected, not silently accepted as 0',
  decodeBody('v1|presence|100|-0|0|10|1000|', 'i', 'h') === null);
check('a bare -0 ms is rejected by the same no-negative-zero rule',
  decodeBody('v1|presence|100|100|0|10|-0|', 'i', 'h') === null);
check('a negative speed is rejected',
  decodeBody('v1|presence|100|100|0|-5|1000|', 'i', 'h') === null);
check('a say exactly MAX_SAY long is accepted (boundary)',
  decodeBody(`v1|presence|100|100|0|10|1000|${'a'.repeat(MAX_SAY)}`, 'i', 'h') !== null);
check('a say longer than MAX_SAY is rejected',
  decodeBody(`v1|presence|100|100|0|10|1000|${'a'.repeat(MAX_SAY + 1)}`, 'i', 'h') === null);
check('a say containing the field delimiter is rejected',
  decodeBody('v1|presence|100|100|0|10|1000|hi|there', 'i', 'h') === null);
check('an unrecognized kind tag is rejected',
  decodeBody('v1|bogus|1|2', 'i', 'h') === null);

// --- Encode-side validation (defensive, not part of the wire boundary) -----
// decodeBody is the real hostile-input boundary (see above); these just
// confirm our own encoder refuses to produce a body it would then itself
// reject, catching a caller bug before it wastes a PoW-mined write.
{
  let threw = false;
  try { encodePresence({ x: 0, y: 0, heading: HEADING_STEPS, speed: 0, t: 0 }); } catch { threw = true; }
  check('encodePresence throws on an out-of-range heading', threw);
}
{
  let threw = false;
  try { encodePresence({ x: 0, y: 0, heading: 0, speed: 0, t: 0 }, 'a|b'); } catch { threw = true; }
  check('encodePresence throws on a say containing the delimiter', threw);
}
{
  let threw = false;
  try { encodePresence({ x: 0, y: 0, heading: 0, speed: 0, t: 0 }, 'a'.repeat(MAX_SAY + 1)); } catch { threw = true; }
  check('encodePresence throws on a say over MAX_SAY', threw);
}
{
  let threw = false;
  try { encodeEat(CELL_COUNT, 0); } catch { threw = true; }
  check('encodeEat throws on an out-of-grid cell', threw);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
