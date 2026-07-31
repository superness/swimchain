/**
 * Assembling the log from a room's replies. Run: npx tsx src/lib/shoalRoom.test.ts
 *
 * `repliesToLog` and `narrowRoomReplies` are both pure and are where all the
 * correctness lives (see shoalRoom.ts's module header). `fetchRoomLog` itself is now
 * a bare `rpcCall` plus those two, needs a live node, and is exercised by Task 6's
 * smoke script instead.
 *
 * Bodies below are built with the REAL `encodePresence`/`encodeEat` from shoalWire.ts,
 * not hand-written wire strings — this file is testing the orchestration
 * (author/hash sourcing, dedupe, ordering, drop-on-failure, the fetch ceiling), not
 * `decodeBody`'s own grammar, which shoalWire.test.ts already covers exhaustively.
 * Expected values are derived by hand in comments, never by calling `repliesToLog` or
 * `orderLog` twice and comparing the result to itself.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  repliesToLog, splitRoomReplies, narrowRoomReplies, ROOM_FETCH_LIMIT,
  ROOM_TITLE, roomTextFor, roomTextAtMs, roomPreimage, roomIdFor, roomIdAtMs,
  type RawReply, type NodeReply, type GetRepliesResult,
} from './shoalRoom';
import { epochOf, epochStartMs, epochEndMs } from './epoch';
import { encodePresence, encodeEat, encodeCheckpoint } from './shoalWire';
import type { Checkpoint, EatClaim } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// Author ids are now SHAPE-CHECKED by repliesToLog (64 lowercase hex — the form
// both node paths produce), and `encodePresence`/`encodeEat` derive the body's
// salt from the same string, so every id below is a real-shaped 64-hex key
// rather than a readable label. Each is one hex digit repeated 64 times, so they
// stay easy to tell apart at a glance and are trivially distinct.
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function reply(
  content_id: string, author_id: string, body: string,
  block_height: number | null = null, created_at = 0,
): RawReply {
  return { content_id, author_id, body, block_height, created_at };
}

// --- Undecodable bodies are dropped, not thrown on --------------------------------
// One well-formed reply and one that is not wire-format at all (no `|` delimiter, so
// `decodeBody`'s own `takeFields(body, 2)` returns null before even the version tag is
// read — see shoalWire.ts). A hostile or malformed reply WILL land on chain (the node
// verifies PoW and signatures, never application semantics —
// project_fold_rules_are_permanent); one bad reply must not poison the room.
{
  const goodBody = encodePresence({ x: 10, y: 20, heading: 5, speed: 7, t: 1000 }, A);
  const replies: RawReply[] = [
    reply('sha256:good1', A, goodBody),
    reply('sha256:bad1', B, 'not-wire-format-at-all'),
  ];
  let threw: unknown = null;
  let log: ReturnType<typeof repliesToLog> = [];
  try {
    log = repliesToLog(replies);
  } catch (e) {
    threw = e;
  }
  check('repliesToLog does not throw on a malformed body', threw === null, threw);
  check('the malformed reply is dropped, the well-formed one survives',
    log.length === 1 && log[0].hash === 'sha256:good1', log);
}

// --- The author comes from author_id, never from the body -------------------------
// The whole anti-spoofing property at this layer: the reply's OWN signed author_id
// must become the decoded entry's `id`, never anything sourced from the body (which a
// hostile client can write to be literally anything — the node never validates
// application semantics).
//
// The body carries a SALT derived from an author key (shoalWire.ts), and that salt is
// now REQUIRED to match the envelope author — an unconstrained one handed every
// publisher 64 free bits with which to steer its own content id, which `adopt.ts` was
// ordering by. So a body salted as `B` under an envelope that says `A` no longer
// decodes at all, and the mismatch case below asserts the DROP.
//
// The anti-spoofing property is unchanged and is asserted on the well-formed reply:
// `id` still comes from `author_id`, never from the body.
{
  const bodySaltedAsB = encodeEat(5, 2000, B);
  const mismatched = repliesToLog([reply('sha256:spoof1', A, bodySaltedAsB)]);
  check('a body salted as B under an envelope that says A is dropped entirely',
    mismatched.length === 0, mismatched);

  // The same body under B's OWN envelope decodes, so the drop above is the
  // salt/author comparison and nothing else about that body.
  const matched = repliesToLog([reply('sha256:spoof1', B, bodySaltedAsB)]);
  check('…while the identical body under B\'s own envelope decodes', matched.length === 1, matched);
  check('the decoded id is the reply\'s author_id, taken from the envelope',
    matched.length === 1 && matched[0].id === B, matched[0]?.id);
  check('the decoded id is NOT the body text (the only thing a hostile client controls)',
    matched.length === 1 && matched[0].id !== bodySaltedAsB, matched[0]?.id);
}

// --- An author_id of the wrong SHAPE is dropped ------------------------------------
// A tripwire, not routine validation: both node paths hex-encode a 32-byte pubkey, so
// a healthy node cannot emit anything else. It matters because checkpoints EMBED these
// ids verbatim — a node regression that changed the spelling (bech32, a `0x` prefix,
// uppercase) would split one swimmer into two rows sharing no size and no bites, and
// invalidate every checkpoint published under the old form. The well-formed reply in
// the same batch must survive, exactly like the malformed-body case above.
//
// (A `console.warn` line per dropped reply is expected in this section's output.)
{
  const bodyA = encodePresence({ x: 1, y: 1, heading: 0, speed: 0, t: 100 }, A);
  const bodyB = encodePresence({ x: 2, y: 2, heading: 0, speed: 0, t: 200 }, B);
  const badShapes = [
    ['sha256:upper', A.toUpperCase(), 'uppercase hex'],
    ['sha256:short', A.slice(0, 63), '63 characters'],
    ['sha256:long', `${A}a`, '65 characters'],
    ['sha256:prefixed', `0x${A.slice(2)}`, 'an 0x prefix'],
    ['sha256:bech32', 'sw1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'a bech32m address'],
  ] as const;
  for (const [cid, badId, why] of badShapes) {
    const log = repliesToLog([reply(cid, badId, bodyA), reply('sha256:ok', B, bodyB)]);
    check(`an author_id that is ${why} is dropped, and the healthy reply survives`,
      log.length === 1 && log[0].hash === 'sha256:ok' && log[0].id === B,
      log.map((e) => e.id));
  }
}

// --- The hash comes from content_id, used to break same-ms ties -------------------
// Two entries authored at the IDENTICAL ms (100) so the only thing that can order them
// is the hash — which must come from each reply's own content_id. Hand-picked so
// 'sha256:aaa' < 'sha256:bbb' lexicographically (index 7: 'a' < 'b'), so the expected
// order is [aaa, bbb] regardless of input order.
{
  const bodyX = encodePresence({ x: 1, y: 1, heading: 0, speed: 0, t: 100 }, A);
  const bodyY = encodePresence({ x: 2, y: 2, heading: 0, speed: 0, t: 100 }, B);
  const replyAaa = reply('sha256:aaa', A, bodyX);
  const replyBbb = reply('sha256:bbb', B, bodyY);

  const logForward = repliesToLog([replyAaa, replyBbb]);
  const logReversed = repliesToLog([replyBbb, replyAaa]);

  check('each decoded hash equals its own content_id, not something derived from the body',
    logForward.length === 2 && logForward[0].hash === 'sha256:aaa' && logForward[1].hash === 'sha256:bbb',
    logForward.map((e) => e.hash));
  check('identical-ms entries order by hash ascending, input order [aaa, bbb]',
    logForward.map((e) => e.hash).join(',') === 'sha256:aaa,sha256:bbb', logForward.map((e) => e.hash));
  check('identical-ms entries order by hash ascending, input order [bbb, aaa] too (order-independent)',
    logReversed.map((e) => e.hash).join(',') === 'sha256:aaa,sha256:bbb', logReversed.map((e) => e.hash));
}

// --- Output is ordered exactly as orderLog orders it -------------------------------
// Three replies at ms 500, 100, 300 (same values shoalEngine.test.ts's own orderLog
// section uses) — hand-derived ascending order is 100, 300, 500, i.e. authors [B, C, A].
// The RawReply input array below is shuffled into a THIRD order ([A, C, B]), distinct
// from both the expected output order and its exact reverse, so a passing test cannot
// be explained by repliesToLog accidentally preserving or reversing input order.
{
  const bodyFor = (ms: number, who: string) =>
    encodePresence({ x: 0, y: 0, heading: 0, speed: 0, t: ms }, who);
  const replyA = reply('sha256:a', A, bodyFor(500, A));
  const replyB = reply('sha256:b', B, bodyFor(100, B));
  const replyC = reply('sha256:c', C, bodyFor(300, C));

  const shuffled: RawReply[] = [replyA, replyC, replyB];
  const log = repliesToLog(shuffled);
  check('output is ordered by authoring ms (B@100, C@300, A@500), independent of input order',
    log.map((e) => e.id).join(',') === [B, C, A].join(','),
    log.map((e) => ({ id: e.id.slice(0, 4), ms: e.ms })));

  // Independence from input order, mirroring shoalEngine.test.ts's own orderLog check.
  const logOtherOrder = repliesToLog([replyB, replyA, replyC]);
  check('the same three replies in a different input order produce the identical output order',
    logOtherOrder.map((e) => e.id).join(',') === log.map((e) => e.id).join(','),
    logOtherOrder.map((e) => e.id.slice(0, 4)));
}

// --- Duplicate content_ids are collapsed, keeping one -------------------------------
// The node can serve the same reply twice across a paginated fetch (once still
// pending in the mempool with block_height: null, once finalized with a real height,
// or simply duplicated verbatim). Same content_id, same body — only block_height
// and created_at differ, exactly like the pending-to-finalized transition on a real
// node (where `created_at` is a query-time clock read while pending and the action's
// own second-granularity timestamp once finalized — see RawReply's doc).
{
  const dupBody = encodeEat(9, 3000, D);
  const pendingCopy = reply('sha256:dup', D, dupBody, null, 3_000);
  const finalizedCopy = reply('sha256:dup', D, dupBody, 42, 4_000);
  const other = reply('sha256:other', C, encodeEat(1, 3100, C), 10, 3_100);

  const log = repliesToLog([pendingCopy, other, finalizedCopy]);
  check('the duplicate content_id collapses to exactly one entry',
    log.filter((e) => e.hash === 'sha256:dup').length === 1, log);
  check('the surviving entries are the duplicate (once) plus the distinct one (total 2)',
    log.length === 2, log);
}

// --- An empty list yields an empty log without throwing ----------------------------
{
  let threw: unknown = null;
  let log: ReturnType<typeof repliesToLog> = [{ kind: 'eat', id: 'x', cell: 0, ms: 0, hash: 'h' } as EatClaim];
  try {
    log = repliesToLog([]);
  } catch (e) {
    threw = e;
  }
  check('an empty reply list does not throw', threw === null, threw);
  check('an empty reply list yields an empty log', log.length === 0, log);
}

// ===================================================================================
// narrowRoomReplies — the fetch ceiling, and the parent_id filter
// ===================================================================================

const ROOM = 'sha256:theroom';

function nodeReply(i: number, parent = ROOM): NodeReply {
  return {
    content_id: `sha256:r${i}`,
    author_id: A,
    body: encodePresence({ x: 0, y: 0, heading: 0, speed: 0, t: 1000 + i }, A),
    parent_id: parent,
    block_height: null,
    created_at: 1000 + i,
  };
}

function result(replies: NodeReply[]): GetRepliesResult {
  // `total_count` is deliberately set to `replies.length` here because that is
  // EXACTLY what the node sends: it computes the field as `all_replies.len()`
  // (methods.rs:9620), i.e. the length of the array it is already returning.
  // That is precisely why it cannot drive a tail fetch — see the module header.
  return { parent_id: ROOM, replies, total_count: replies.length };
}

// --- A response AT the requested limit is a loud failure, never a quiet log --------
// The single highest-consequence defect this module can have. get_replies returns
// the OLDEST replies first (chain.rs:1511-1540 scans `parent || timestamp || hash`
// forward) and the node clamps nothing, so a saturated response is not "slightly
// stale" — it is the whole live window missing, folded as an empty sea, with no
// error anywhere. It must be indistinguishable from a crash, not from success.
{
  const LIMIT = 5; // a small stand-in for ROOM_FETCH_LIMIT; the rule is `length >= limit`
  const atLimit = result([0, 1, 2, 3, 4].map((i) => nodeReply(i))); // exactly 5
  let threw: unknown = null;
  try { narrowRoomReplies(atLimit, ROOM, LIMIT); } catch (e) { threw = e; }
  check('a response with exactly `limit` replies THROWS rather than returning a truncated log',
    threw instanceof RangeError, threw);
  check('…and the message names both the count and the limit, so the cause is readable',
    threw instanceof Error && threw.message.includes('5 replies') && threw.message.includes('limit of 5'),
    threw instanceof Error ? threw.message : threw);

  // Over the limit too: the mempool block appends pending replies AFTER the node's
  // own `all_replies.len() >= limit` break (methods.rs:9599-9611 vs :9457), so a
  // real response CAN exceed the limit it asked for. That is still a ceiling hit.
  const overLimit = result([0, 1, 2, 3, 4, 5, 6].map((i) => nodeReply(i))); // 7
  threw = null;
  try { narrowRoomReplies(overLimit, ROOM, LIMIT); } catch (e) { threw = e; }
  check('a response OVER the limit throws too (pendings are appended past the node\'s own break)',
    threw instanceof RangeError, threw);

  // One under the limit is the healthy case and must sail through untouched.
  const underLimit = result([0, 1, 2, 3].map((i) => nodeReply(i))); // 4
  threw = null;
  let narrowed: RawReply[] = [];
  try { narrowed = narrowRoomReplies(underLimit, ROOM, LIMIT); } catch (e) { threw = e; }
  check('a response one under the limit does NOT throw', threw === null, threw);
  check('…and returns all four replies', narrowed.length === 4, narrowed.length);

  // An empty response is not a ceiling hit — an idle room has no replies yet.
  threw = null;
  try { narrowRoomReplies(result([]), ROOM, LIMIT); } catch (e) { threw = e; }
  check('an empty response does not throw (an idle room is not a saturated one)', threw === null, threw);
}

// --- The parent_id filter is load-bearing for the mempool path --------------------
// depth_limit: 0 bounds only the node's CHAIN-store path (methods.rs:9464). The
// mempool path has no depth gate on inclusion at all and will chain-admit a
// reply-to-a-pending-reply, mislabelled depth 0, whose `parent_id` nonetheless names
// its true parent (methods.rs:9603). Only this filter catches that.
{
  const mixed = result([
    nodeReply(0),                          // direct
    nodeReply(1, 'sha256:someotherreply'), // nested pending, mislabelled depth 0
    nodeReply(2),                          // direct
  ]);
  const narrowed = narrowRoomReplies(mixed, ROOM, 100);
  check('a reply whose parent is NOT the room is filtered out',
    narrowed.length === 2 && narrowed.every((r) => r.content_id !== 'sha256:r1'),
    narrowed.map((r) => r.content_id));
}

// --- created_at is carried through, unread -----------------------------------------
// Carried so a future `ms` sanity bound is possible at all; nothing reads it today.
{
  const r0 = nodeReply(0);
  const narrowed = narrowRoomReplies(result([r0]), ROOM, 100);
  check('created_at survives the narrowing to RawReply',
    narrowed.length === 1 && narrowed[0].created_at === r0.created_at,
    narrowed[0]?.created_at);
  // And it is genuinely unread by the fold: two otherwise-identical replies whose
  // created_at values disagree wildly (including one implying a year-out ghost)
  // decode to the same entry, because `ms` comes from the BODY.
  const sane = repliesToLog([reply('sha256:x', A, encodeEat(4, 5000, A), 1, 5_000)]);
  const insane = repliesToLog([reply('sha256:x', A, encodeEat(4, 5000, A), 1, 99_999_999_999)]);
  check('created_at does not reach the fold: the same body decodes identically either way',
    JSON.stringify(sane) === JSON.stringify(insane), { sane, insane });
}

// --- A CHECKPOINT IS NOT A MOVE, AND NEVER ENTERS THE FOLD ------------------------
// A checkpoint travels as a reply to the same room post as every move, so it arrives
// in the very same `get_replies` array. It SEEDS a fold; it is never folded. If one
// reached `repliesToLog`'s output it would be handed to `foldShoal`, where every
// "if the kind is presence do this, otherwise it is an eat claim" branch would
// mis-handle it as a bite.
//
// The entry COUNT is the assertion, because it is the one a leak cannot survive:
// three moves plus one checkpoint must fold to exactly the same three entries the
// three moves alone fold to.
{
  const cp: Checkpoint = { epoch: 7, sizes: [[A, 112], [B, 100]], recent: [] };
  const cpBody = encodeCheckpoint(cp, C);
  const moves: RawReply[] = [
    reply('sha256:m1', A, encodePresence({ x: 10, y: 20, heading: 5, speed: 7, t: 1000 }, A)),
    reply('sha256:m2', B, encodeEat(9, 2000, B)),
    reply('sha256:m3', C, encodePresence({ x: 30, y: 40, heading: 6, speed: 8, t: 3000 }, C)),
  ];
  // Hand-derived: three decodable move bodies -> three entries, checkpoint or no
  // checkpoint. Nothing else in this batch can be dropped or duplicated.
  const withoutCp = repliesToLog(moves);
  const withCp = repliesToLog([...moves, reply('sha256:cp1', C, cpBody)]);
  check('hand-derived: three moves fold to three entries', withoutCp.length === 3, withoutCp.length);
  check('adding a checkpoint reply leaves the fold\'s entry count UNCHANGED at three',
    withCp.length === 3, withCp.length);
  check('...and the three entries are byte-identical to the checkpoint-free fold',
    JSON.stringify(withCp) === JSON.stringify(withoutCp), { withCp, withoutCp });

  // The same batch, split: the moves go one way and the checkpoint the other, in
  // ONE pass over the replies (a room's log and its checkpoints arrive together).
  const split = splitRoomReplies([...moves, reply('sha256:cp1', C, cpBody)]);
  check('splitRoomReplies returns the same three log entries',
    JSON.stringify(split.log) === JSON.stringify(withoutCp), split.log.length);
  check('...and exactly one checkpoint', split.checkpoints.length === 1, split.checkpoints.length);
  check('the checkpoint\'s publisher is the reply\'s author_id, from the envelope',
    split.checkpoints[0]?.id === C, split.checkpoints[0]?.id);
  check('...its hash is the reply\'s content_id, from the envelope',
    split.checkpoints[0]?.hash === 'sha256:cp1', split.checkpoints[0]?.hash);
  check('...and it carries epoch 7 with both swimmers',
    split.checkpoints[0]?.cp.epoch === 7 && split.checkpoints[0]?.cp.sizes.length === 2,
    split.checkpoints[0]?.cp);

  // A checkpoint body that is NOT canonically spelled (a space after the colon —
  // `parseCheckpoint` tolerates it, `decodeCheckpointBody` must not) is dropped from
  // BOTH halves rather than landing in either.
  const sloppy = 'v1|checkpoint|' + C.slice(0, 16) + '|{"epoch": 7,"sizes":[],"recent":[]}';
  const withSloppy = splitRoomReplies([...moves, reply('sha256:cp2', C, sloppy)]);
  check('a non-canonically-spelled checkpoint is dropped from the checkpoints',
    withSloppy.checkpoints.length === 0, withSloppy.checkpoints.length);
  check('...and does not leak into the log either', withSloppy.log.length === 3,
    withSloppy.log.length);
}

// --- ROOM_FETCH_LIMIT itself -------------------------------------------------------
{
  check('ROOM_FETCH_LIMIT is a positive integer (fetchRoomLog passes it as both the ' +
        'request limit and the ceiling it checks against)',
    Number.isSafeInteger(ROOM_FETCH_LIMIT) && ROOM_FETCH_LIMIT > 0, ROOM_FETCH_LIMIT);
}

// ===================================================================================
// THE ROOM IS A FUNCTION OF THE HOUR
// ===================================================================================
//
// The single highest-consequence value in this client: two clients that derive
// different rooms for the same hour are not degraded, they are in DIFFERENT WORLDS,
// each seeing a calm and entirely healthy empty sea. There is no symptom. So this
// section triangulates the derivation from three directions that cannot all be wrong
// together:
//
//   1. the TEXT is asserted against hand-typed literals ('The Shoal',
//      'room:shoal:v1:main:495936') — not against anything the module built;
//   2. the ID is recomputed with **node:crypto**, a different SHA-256 implementation
//      from the `hash-wasm` one `roomIdFor` uses, over a preimage this file spells
//      out by hand (`handPreimage`) rather than getting from `roomPreimage`;
//   3. two ids are PINNED as literals, hand-derived OFFLINE with three more
//      implementations still (GNU `sha256sum`, `openssl dgst -sha256`, Python
//      `hashlib`) — see the recipe below. A change to the grammar that someone
//      "helpfully" mirrored into `handPreimage` above would still fail here, which
//      is the whole point of pinning.
//
// THE PIN RECIPE, reproducible from any shell:
//
//   printf 'The Shoal\n\nroom:shoal:v1:main:0' | sha256sum
//     -> f95e9c7505a6fef02757a5247e5e4d2595faf0033fdc033c66247356eeee30d2
//   printf 'The Shoal\n\nroom:shoal:v1:main:495936' | sha256sum
//     -> 9ec91781fb7827324bda796a0f731c3d6366f9195f1969e3585b74ab403ef528
//
// (`printf`, not `echo` — `echo` appends a trailing newline that is NOT in the
// preimage. Confirmed byte-for-byte against `openssl dgst -sha256` and Python's
// `hashlib.sha256` as well.)
//
// Epoch 495936 is not arbitrary: 495936 * 3_600_000 = 1_785_369_600_000 ms, which is
// exactly 2026-07-30T00:00:00Z — a real hour of play, and one whose epoch number can
// be re-derived from a date by anyone auditing this. Epoch 0 is pinned alongside it
// because it needs no date arithmetic at all to check.
{
  console.log('\n--- the room is a function of the hour ---');

  // Hand-typed, and DELIBERATELY NOT built from `roomTextFor`/`roomPreimage`: this is
  // the grammar written out a second time by a human, so a change to the module's
  // grammar has to be made here too before these checks can pass.
  const handPreimage = (water: string, epoch: number) =>
    `The Shoal\n\nroom:shoal:v1:${water}:${epoch}`;
  const handRoomId = (water: string, epoch: number) =>
    'sha256:' + createHash('sha256').update(handPreimage(water, epoch), 'utf8').digest('hex');

  const MAIN = 'main';
  const E = 495_936; // 2026-07-30T00:00:00Z, see above

  // --- The pinned literals. Hand-derived offline; see the recipe above. ------------
  const PINNED_EPOCH_0 = 'sha256:f95e9c7505a6fef02757a5247e5e4d2595faf0033fdc033c66247356eeee30d2';
  const PINNED_EPOCH_495936 = 'sha256:9ec91781fb7827324bda796a0f731c3d6366f9195f1969e3585b74ab403ef528';

  check('PINNED: the room for epoch 0 of the water `main` is the hand-derived literal',
    (await roomIdFor(MAIN, 0)) === PINNED_EPOCH_0, await roomIdFor(MAIN, 0));
  check('PINNED: the room for epoch 495936 (2026-07-30T00:00:00Z) is the hand-derived literal',
    (await roomIdFor(MAIN, E)) === PINNED_EPOCH_495936, await roomIdFor(MAIN, E));

  // The pin's own arithmetic, so the epoch number above is not taken on trust.
  check('...and 495936 really is the epoch containing 2026-07-30T00:00:00Z (1785369600000 ms)',
    epochOf(1_785_369_600_000) === E && epochStartMs(E) === 1_785_369_600_000,
    { epochOf: epochOf(1_785_369_600_000), start: epochStartMs(E) });

  // --- The identifying TEXT, against hand-typed literals ---------------------------
  {
    const text = roomTextFor(MAIN, E);
    check('the room\'s title is the constant `The Shoal`', text.title === 'The Shoal', text.title);
    check('the room\'s body names the grammar, the water and the epoch',
      text.body === 'room:shoal:v1:main:495936', text.body);
    check('the preimage is exactly what submit_post hashes: title, blank line, body',
      roomPreimage(text) === 'The Shoal\n\nroom:shoal:v1:main:495936', roomPreimage(text));
    check('ROOM_TITLE is that same constant, exported for whatever mints the post',
      ROOM_TITLE === 'The Shoal', ROOM_TITLE);
    check('the id is a content id the node would accept as a parent_id',
      /^sha256:[0-9a-f]{64}$/.test(await roomIdFor(MAIN, E)), await roomIdFor(MAIN, E));
  }

  // --- A second SHA-256 implementation agrees, over a hand-spelled preimage --------
  // `hash-wasm` agreeing with itself would be no evidence at all.
  {
    let allAgree = true;
    const disagreed: unknown[] = [];
    for (const epoch of [-1, 0, 1, 495_935, E, 495_937, 1_000_000]) {
      const got = await roomIdFor(MAIN, epoch);
      const want = handRoomId(MAIN, epoch);
      if (got !== want) { allAgree = false; disagreed.push({ epoch, got, want }); }
    }
    check('node:crypto over a hand-spelled preimage agrees with hash-wasm for seven epochs',
      allAgree, disagreed);
  }

  // --- The same epoch is the same room, from three instants inside that hour -------
  // The property the whole rotation rests on: a client that opens the game at :00,
  // one that opens it at :30 and one that opens it one millisecond before the hour
  // ends must all be in the SAME room. `roomIdAtMs` composes `epochOf`, the fold's
  // own clock — not a second one.
  {
    const first = epochStartMs(E);                 // 1_785_369_600_000, the hour's first ms
    const middle = epochStartMs(E) + 1_800_000;    // + 30 minutes
    const last = epochEndMs(E) - 1;                // 1_785_373_199_999, its last ms
    const ids = [await roomIdAtMs(MAIN, first), await roomIdAtMs(MAIN, middle), await roomIdAtMs(MAIN, last)];
    check('three different instants inside the same hour derive the SAME room',
      ids[0] === ids[1] && ids[1] === ids[2], ids);
    check('...and that room is the pinned literal for epoch 495936',
      ids[0] === PINNED_EPOCH_495936, ids[0]);

    // `roomTextAtMs` is the same composition one level down — the form whatever
    // MINTS an hour's post needs, because the PoW miner hashes the preimage, not
    // the id. Asserted against the hand-typed body, and against the pin through
    // a second SHA-256 implementation, so it cannot drift from `roomIdAtMs`.
    const texts = [roomTextAtMs(MAIN, first), roomTextAtMs(MAIN, middle), roomTextAtMs(MAIN, last)];
    check('roomTextAtMs gives the same hand-typed body at all three instants',
      texts.every((t) => t.body === 'room:shoal:v1:main:495936' && t.title === 'The Shoal'),
      texts.map((t) => t.body));
    check('...and its preimage hashes (node:crypto) to the pinned literal',
      'sha256:' + createHash('sha256').update(roomPreimage(texts[1]), 'utf8').digest('hex')
        === PINNED_EPOCH_495936, roomPreimage(texts[1]));

    // The crossing (Task 2's job) is visible right here: one ms later is another world.
    const across = await roomIdAtMs(MAIN, epochEndMs(E));
    check('the first ms of the NEXT hour derives a different room',
      across !== ids[0] && across === (await roomIdFor(MAIN, E + 1)), { across, inside: ids[0] });
  }

  // --- Adjacent epochs never collide ----------------------------------------------
  {
    const a = await roomIdFor(MAIN, E - 1);
    const b = await roomIdFor(MAIN, E);
    const c = await roomIdFor(MAIN, E + 1);
    check('epoch E-1, E and E+1 are three distinct rooms',
      a !== b && b !== c && a !== c, { a, b, c });

    // Around zero too, where the decimal spelling changes sign.
    const neg = await roomIdFor(MAIN, -1);
    const zero = await roomIdFor(MAIN, 0);
    const one = await roomIdFor(MAIN, 1);
    check('epochs -1, 0 and 1 are three distinct rooms', neg !== zero && zero !== one && neg !== one,
      { neg, zero, one });
  }

  // --- No two (water, epoch) pairs in a wide sweep collide -------------------------
  // 300 consecutive epochs across four waters. Distinctness is asserted on the IDS,
  // not the texts, so a hash-level collapse would show up as well as a grammar one.
  {
    const seen = new Set<string>();
    let collisions = 0;
    for (const water of ['main', 'smoke', 'two', 'cp']) {
      for (let epoch = E - 150; epoch < E + 150; epoch++) {
        const id = await roomIdFor(water, epoch);
        if (seen.has(id)) collisions++;
        seen.add(id);
      }
    }
    check('1200 (water, epoch) pairs give 1200 distinct rooms',
      collisions === 0 && seen.size === 1200, { collisions, distinct: seen.size });
  }

  // --- A DIFFERENT WATER IS A DIFFERENT ROOM, AND THIS IS LOAD-BEARING -------------
  // `submit_post` does NOT put the space in the preimage (methods.rs:2221) and
  // `get_replies` is keyed on the parent content id alone. So two waters whose room
  // posts share a title and body share ONE room and one reply set: the smoke scripts'
  // moves would land in the water people are playing in. The water name is in the
  // body for exactly this reason.
  {
    const main = await roomIdFor('main', E);
    const smoke = await roomIdFor('smoke', E);
    check('the same hour in a different water is a different room',
      main !== smoke, { main, smoke });
  }

  // --- The water name is checked, because the likely mistake is silent -------------
  // Passing `@shoal:main` (WATER_SPACE_NAME) where `main` (WATER_NAME) belongs would
  // derive a room that is real, healthy, reply-able and shared with nobody. A colon
  // is also what makes the grammar's fields unambiguous, so banning it does both jobs.
  //
  // TASK 1 SHIPPED A DENYLIST — `''`, `:` and `\n` — and Task 2's review found
  // four more ways past it in a minute of looking. A denylist over a permanent
  // consensus preimage is a list of the mistakes somebody happened to think of,
  // so it is an ALLOWLIST now (`assertWaterName`). Every case below is a string
  // that used to derive a real, healthy, reply-able room shared with nobody.
  {
    const threwFor = async (water: unknown): Promise<boolean> => {
      try { await roomIdFor(water as string, E); return false; } catch { return true; }
    };
    check('the marker form `@shoal:main` is REJECTED, not silently accepted',
      await threwFor('@shoal:main'));
    check('an empty water is rejected', await threwFor(''));
    check('a water containing a newline is rejected', await threwFor('ma\nin'));
    check('a plain water name is accepted', !(await threwFor('main')));

    // 1. A NON-STRING. `['main:x'].includes(':')` asks whether any ELEMENT
    // equals ':' — it does not — so an array sailed through Task 1's colon
    // guard and interpolated as `room:shoal:v1:main:x:1`. This is why the
    // typeof check is first and is the load-bearing one.
    check('an ARRAY is rejected — it bypassed the colon guard and spelled its own room',
      await threwFor(['main:x']));
    check('a number is rejected', await threwFor(123));
    check('null and undefined are rejected',
      (await threwFor(null)) && (await threwFor(undefined)));

    // 2. INVISIBLE CHARACTERS. Every one of these renders identically to
    // `main` in every font and terminal, and derives a different room.
    for (const [name, water] of [
      ['a trailing space', 'main '],
      ['a leading space', ' main'],
      ['an inner space', 'ma in'],
      ['a carriage return', 'main\r'],
      ['a tab', 'main\t'],
      ['a NUL', 'main\0'],
    ] as [string, string][]) {
      check(`${name} is rejected`, await threwFor(water), JSON.stringify(water));
    }

    // 3. UNICODE, NORMALIZED OR NOT. `máin` (NFC) and `máin` (NFD)
    // are two different byte strings that are pixel-identical in every font, so
    // a player told to join "máin" would land in one or the other depending on
    // which keyboard, editor or clipboard produced the string — and the two
    // would never see each other. Both are refused, which is the only answer
    // that does not require picking a normalization form and defending it
    // forever.
    const NFC: string = 'máin';       // U+00E1, one code point
    const NFD: string = 'máin';      // 'a' + U+0301 combining acute
    check('an NFC accented name is rejected', await threwFor(NFC));
    check('...and its NFD twin is rejected too', await threwFor(NFD));
    check('...and they really were two different strings that render identically',
      NFC !== NFD && NFD.normalize('NFC') === NFC, { NFC, NFD });
    check('a zero-width joiner is rejected', await threwFor('ma‍in'));

    // 4. CASE. `Main` is a different preimage, not a hint.
    check('a capital letter is rejected', await threwFor('Main'));

    // 5. LENGTH, and the shape of a hyphenated name.
    check('a 32-character name is accepted', !(await threwFor('a'.repeat(32))));
    check('a 33-character name is rejected', await threwFor('a'.repeat(33)));
    check('hyphen-joined groups are accepted', !(await threwFor('deep-blue-2')));
    check('a leading hyphen is rejected', await threwFor('-main'));
    check('a trailing hyphen is rejected', await threwFor('main-'));
    check('a doubled hyphen is rejected', await threwFor('ma--in'));

    // 6. THE ALLOWLIST NARROWED WHAT IS ACCEPTED AND MOVED NOTHING. Every water
    // this game has ever had still derives exactly the room it derived before,
    // which is what makes this a safe change rather than a hard fork.
    check('every water this game has ever used is still accepted, unchanged',
      (await roomIdFor('main', E)) === PINNED_EPOCH_495936
      && !(await threwFor('smoke')) && !(await threwFor('two')) && !(await threwFor('cp')));
  }

  // --- The epoch is checked too ----------------------------------------------------
  // A float epoch would stringify as `495936.5` and derive a room of its own; NaN
  // would derive one called `NaN`. Both are silent forks, so both throw. (Integer
  // math only in src/lib is the standing rule; this is the tripwire for it.)
  {
    const threwFor = (epoch: number): boolean => {
      try { roomTextFor(MAIN, epoch); return false; } catch { return true; }
    };
    check('a fractional epoch is rejected', threwFor(495_936.5));
    check('NaN is rejected', threwFor(Number.NaN));
    check('Infinity is rejected', threwFor(Number.POSITIVE_INFINITY));
    check('an epoch past Number.MAX_SAFE_INTEGER is rejected', threwFor(2 ** 53));
    check('a plain integer epoch is accepted', !threwFor(E));
    check('a negative integer epoch is accepted (the grid is absolute, and floors below zero)',
      !threwFor(-1));
  }

  // --- Two JavaScript number quirks that would fork the population silently --------
  // `-0` is a real value `Math.floor` can produce, and `${-0}` is "0" — so the room
  // for -0 and the room for 0 are the same room. Pinned so a future hand-rolled
  // formatter that spelled it "-0" fails here.
  {
    check('epoch -0 derives the same room as epoch 0',
      (await roomIdFor(MAIN, -0)) === (await roomIdFor(MAIN, 0)), await roomIdFor(MAIN, -0));

    // Template-literal number formatting stays plain decimal for every safe integer
    // (exponent notation only starts at 1e21, three orders past MAX_SAFE_INTEGER).
    // An exponent in the body would make two different epochs spell the same bytes.
    const huge = roomTextFor(MAIN, Number.MAX_SAFE_INTEGER);
    check('a safe-integer epoch is spelled in plain decimal, never in exponent form',
      huge.body === 'room:shoal:v1:main:9007199254740991' && !huge.body.includes('e'), huge.body);
  }

  // --- Purity: the derivation reads no clock and holds no state --------------------
  // "The derivation needs no state a fresh client lacks" is the requirement. The
  // observable form of it: the same arguments give the same answer with nothing else
  // touched, and the answer depends on NOTHING but the arguments.
  {
    const once = await roomIdFor(MAIN, E);
    const twice = await roomIdFor(MAIN, E);
    check('called twice with the same arguments, byte-identical both times', once === twice, { once, twice });
    check('...and still the pinned literal', twice === PINNED_EPOCH_495936, twice);

    // NOT a source scan of this file — the other half of this module legitimately
    // talks to a node, so a whole-file grep for `fetch` would be meaningless here.
    // The globals themselves are replaced with throwing stubs for the duration of
    // one call instead, which no future refactor or renamed helper can slip past.
    // A `Date.now()` that crept into the derivation would make the room depend on
    // the READING client's clock rather than on the instant it was handed — the
    // same silent fork as a wrong grammar, arriving only when two clients' clocks
    // differ, which is to say in production and never in a test.
    //
    // FOUR GLOBALS, NOT TWO. Task 2's review mutation-tested this and found the
    // tripwire had two holes: `new Date()` and `performance.now()` are both
    // wall clocks, neither goes through `Date.now`, and BOTH MUTATIONS SURVIVED
    // — a derivation that read either would have passed this check unchanged.
    // The whole `Date` binding and `performance.now` are replaced here as well,
    // so there is no way left to ask this process what time it is.
    const g = globalThis as unknown as Record<string, unknown>;
    const realDate = g.Date as DateConstructor;
    const realRandom = Math.random;
    const realPerf = (g.performance as { now?: () => number } | undefined)?.now;

    const boom = (why: string) => () => { throw new Error(why); };
    // A `Date` that throws for BOTH spellings: `Date.now()` and `new Date()`.
    // Subclassing rather than replacing wholesale, so anything that merely
    // MENTIONS the type still typechecks and only a CALL trips it.
    class TrippedDate extends realDate {
      constructor(...args: unknown[]) {
        super(...(args as []));
        throw new Error('the room derivation constructed a Date');
      }
      static override now(): number {
        throw new Error('the room derivation read Date.now');
      }
    }
    g.Date = TrippedDate;
    Math.random = boom('the room derivation rolled dice');
    if (realPerf !== undefined) {
      (g.performance as { now: () => number }).now = boom('the room derivation read performance.now');
    }

    let threw: unknown = null;
    let clockless = '';
    try {
      clockless = await roomIdAtMs(MAIN, epochStartMs(E) + 12_345);
    } catch (e) {
      threw = e;
    } finally {
      g.Date = realDate;
      Math.random = realRandom;
      if (realPerf !== undefined) (g.performance as { now: () => number }).now = realPerf;
    }
    check('the derivation reads no clock and rolls no dice — Date.now, new Date, '
      + 'performance.now and Math.random are ALL disabled', threw === null, threw);
    check('...and with all four disabled still returns the pinned room',
      clockless === PINNED_EPOCH_495936, clockless);

    // THE TRIPWIRE IS ITSELF TRIPPED, because a stub that did not throw would
    // make the two checks above pass for any implementation at all — which is
    // exactly how the two holes survived. Each of the four is proved to fire.
    {
      const fired: string[] = [];
      const trip = (what: string, run: () => unknown) => {
        g.Date = TrippedDate;
        Math.random = boom('dice');
        if (realPerf !== undefined) (g.performance as { now: () => number }).now = boom('perf');
        try { run(); } catch { fired.push(what); } finally {
          g.Date = realDate;
          Math.random = realRandom;
          if (realPerf !== undefined) (g.performance as { now: () => number }).now = realPerf;
        }
      };
      trip('Date.now', () => Date.now());
      trip('new Date', () => new Date());
      trip('Math.random', () => Math.random());
      if (realPerf !== undefined) trip('performance.now', () => performance.now());
      const want = realPerf === undefined
        ? ['Date.now', 'new Date', 'Math.random']
        : ['Date.now', 'new Date', 'Math.random', 'performance.now'];
      check('MUTATION CHECK: every one of the disabled globals really does throw',
        fired.length === want.length && want.every((w) => fired.includes(w)), fired);
    }
  }
}


// ---------------------------------------------------------------------------
// NOTHING BUT `water.ts` DERIVES A ROOM FROM A BARE NAME
//
// Task 2's review, on Task 1: *"nothing binds the water name passed to
// `roomIdFor` to the space actually written into — correct for Task 1, but it's
// where the next symptomless fork lives."* `water.ts` is the binding: one
// function derives the space id and every room id from ONE name, and everything
// downstream takes the resulting `Water`, which is now a BRANDED type so a
// hand-built one is a compile error (`water.ts`'s `waterBrand`, pinned by the
// `@ts-expect-error` in water.test.ts §1).
//
// The brand stops a fake `Water`. It does NOT stop anyone calling
// `roomIdFor(someString, epoch)` directly, because that function takes a
// `string` — and it has to, it is the pinned primitive the literals above
// protect. So this scan is still load-bearing, and it is the half the brand
// cannot cover.
//
// ## ROUND 1's SCAN WAS WALKED AROUND THREE WAYS, ALL EXECUTED
//
//   1. a hand-built `Water` — closed by the brand, not by this scan;
//   2. `import { roomIdFor as r }` then `r(name, e)` — the call-form regex
//      never matched, because the call is spelled `r(`;
//   3. a file in a SUBDIRECTORY of `src/lib` or `src/ui` — `readdirSync` was
//      flat, so the file was never opened at all.
//
// Both 2 and 3 are fixed below, and the fix for 2 is a change of KIND rather
// than a longer regex: **the scan reads import specifiers, not call sites.**
// You cannot call a function you have not imported, and an import records the
// ORIGINAL name whatever local name it is bound to. The call-form check is kept
// as a second net (it catches a re-export through some other module, where the
// import would not name `shoalRoom` at all).
//
// ## AND THE SCANNER IS ITSELF SCANNED
//
// A checker that silently matched nothing would report exactly what a pass
// looks like — which is how round 1's holes survived. `offendersIn` is a pure
// function of one file's text, so it is driven below against synthetic sources
// for all three walk-arounds plus a legitimate import that must NOT trip it.
// ---------------------------------------------------------------------------
{
  console.log('\n--- the string form of the derivation has exactly one caller ---');

  /** The four functions that turn a bare NAME into a room. Everything else in
   *  `shoalRoom.ts` (`fetchRooms`, `roomPreimage`, `ROOM_TITLE`, the types) is
   *  free to be imported by anyone. */
  const DERIVERS = ['roomIdFor', 'roomTextFor', 'roomIdAtMs', 'roomTextAtMs'];

  /**
   * Why one file is (or is not) an offender. Pure, so the controls below can
   * drive it over text this file spells out rather than over the repo.
   */
  const offendersIn = (text: string): string[] => {
    // A mention inside a comment or a doc block is how this codebase explains
    // itself and must never fail a scan.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const found: string[] = [];

    // (a) IMPORT SPECIFIERS — alias-proof, because `import { X as y }` still
    // spells `X` on the left. Every `import { … } from '…'` in the file is
    // parsed, whatever module it names: a re-export elsewhere would still have
    // to name one of these somewhere.
    for (const m of code.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      for (const raw of m[1].split(',')) {
        const original = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (DERIVERS.includes(original)) found.push(`imports ${original} from '${m[2]}'`);
      }
    }
    // (b) A NAMESPACE IMPORT of the module that defines them — `import * as R
    // from './shoalRoom'` puts every one of them one property access away, and
    // no specifier list records it.
    for (const m of code.matchAll(/import\s*\*\s*as\s+(\w+)\s*from\s*['"]([^'"]*shoalRoom)['"]/g)) {
      found.push(`namespace-imports ${m[2]} as ${m[1]}`);
    }
    // (c) THE CALL FORM, kept as a second net for a re-export path where the
    // import names some other module entirely.
    for (const d of DERIVERS) {
      if (new RegExp(`\\b${d}\\s*\\(`).test(code)) found.push(`calls ${d}(`);
    }
    return found;
  };

  // --- the scanner, scanned ------------------------------------------------
  const control = (what: string, text: string, shouldTrip: boolean) => {
    const got = offendersIn(text);
    check(`CONTROL: the scan ${shouldTrip ? 'CATCHES' : 'ignores'} ${what}`,
      (got.length > 0) === shouldTrip, got);
  };
  control('a plain call', "import { roomIdFor } from './shoalRoom';\nawait roomIdFor('main', 1);", true);
  control('an ALIASED import (round 1 walked past this)',
    "import { roomIdFor as r } from './shoalRoom';\nawait r('main', 1);", true);
  control('an aliased TYPE-ONLY-looking import',
    "import { type RoomText, roomTextFor as t } from './shoalRoom';\nt('main', 1);", true);
  control('a namespace import', "import * as R from '../lib/shoalRoom';\nR.roomIdFor('main', 1);", true);
  control('a call reached through a re-export, with no shoalRoom import at all',
    "import { helper } from './elsewhere';\nawait roomIdFor('main', 1);", true);
  control('a legitimate import of the room FETCH path',
    "import { fetchRooms, roomPreimage, ROOM_TITLE } from './shoalRoom';\nfetchRooms(a, b);", false);
  control('the name inside a comment or a doc block',
    "/** roomIdFor(water, epoch) is the primitive. */\n// see roomTextFor(\nconst x = 1;", false);

  // --- the repo ------------------------------------------------------------
  // RECURSIVE. Round 1's `readdirSync` was flat, so a file one directory down
  // was never opened — which is walk-around 3, and it needed no cleverness at
  // all, just a folder.
  const walk = (dir: string, out: string[]): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full, out);
        continue;
      }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
      if (entry.name.endsWith('.test.ts')) continue;  // tests may call the primitive
      if (entry.name === 'water.ts') continue;        // the one legal caller
      if (entry.name === 'shoalRoom.ts') continue;    // where it is defined
      out.push(full);
    }
    return out;
  };

  const here = dirname(fileURLToPath(import.meta.url));
  const files = [
    ...walk(join(here, '..'), []),                    // all of src/, at any depth
    ...walk(join(here, '..', '..', 'scripts'), []),
  ];
  check('NON-DEGENERACY: the scan found the real source tree',
    files.length > 25 && files.some((f) => f.replace(/\\/g, '/').endsWith('ui/chainSea.ts')),
    files.length);
  check('NON-DEGENERACY: ...and it descends, so a subdirectory cannot hide in it',
    walk(join(here, '..'), []).length > readdirSync(join(here, '..', 'ui')).length,
    { walked: walk(join(here, '..'), []).length });

  const offenders: string[] = [];
  for (const f of files) {
    const found = offendersIn(readFileSync(f, 'utf8'));
    if (found.length > 0) offenders.push(`${f.replace(/\\/g, '/').split('/').slice(-2).join('/')}: ${found.join('; ')}`);
  }
  check('no module but `water.ts` derives a room from a bare name — by import, by alias, '
    + 'by namespace or by call', offenders.length === 0, offenders);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
