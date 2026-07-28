/**
 * Assembling the log from a room's replies. Run: npx tsx src/lib/shoalRoom.test.ts
 *
 * Only `repliesToLog` is tested here — it is pure and is where all the correctness
 * lives (see shoalRoom.ts's module header). `fetchRoomLog` needs a live node and is
 * exercised by Task 6's smoke script instead.
 *
 * Bodies below are built with the REAL `encodePresence`/`encodeEat` from shoalWire.ts,
 * not hand-written wire strings — this file is testing `repliesToLog`'s orchestration
 * (author/hash sourcing, dedupe, ordering, drop-on-failure), not `decodeBody`'s own
 * grammar, which shoalWire.test.ts already covers exhaustively. Expected values are
 * derived by hand in comments, never by calling `repliesToLog` or `orderLog` twice and
 * comparing the result to itself.
 */
import { repliesToLog, type RawReply } from './shoalRoom';
import { encodePresence, encodeEat } from './shoalWire';
import type { EatClaim } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

function reply(
  content_id: string, author_id: string, body: string, block_height: number | null = null,
): RawReply {
  return { content_id, author_id, body, block_height };
}

// --- Undecodable bodies are dropped, not thrown on --------------------------------
// One well-formed reply and one that is not wire-format at all (no `|` delimiter, so
// `decodeBody`'s own `takeFields(body, 2)` returns null before even the version tag is
// read — see shoalWire.ts). A hostile or malformed reply WILL land on chain (the node
// verifies PoW and signatures, never application semantics —
// project_fold_rules_are_permanent); one bad reply must not poison the room.
{
  const goodBody = encodePresence({ x: 10, y: 20, heading: 5, speed: 7, t: 1000 });
  const replies: RawReply[] = [
    reply('sha256:good1', 'author-good', goodBody),
    reply('sha256:bad1', 'author-bad', 'not-wire-format-at-all'),
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
// application semantics). Here the body text and the author_id are deliberately
// distinct strings, so a bug that sourced `id` from `body` instead of `author_id`
// (e.g. `decodeBody(r.body, r.body, r.content_id)`) produces an entry whose `id` is
// the body text — visibly wrong and easy to assert against.
{
  const body = encodeEat(5, 2000);
  const realAuthor = 'real-author-pubkey-hex';
  const replies: RawReply[] = [reply('sha256:spoof1', realAuthor, body)];
  const log = repliesToLog(replies);
  check('exactly one entry decodes', log.length === 1, log);
  check('the decoded id is the reply\'s author_id',
    log.length === 1 && log[0].id === realAuthor, log[0]?.id);
  check('the decoded id is NOT the body text (the only thing a hostile client controls)',
    log.length === 1 && log[0].id !== body, log[0]?.id);
}

// --- The hash comes from content_id, used to break same-ms ties -------------------
// Two entries authored at the IDENTICAL ms (100) so the only thing that can order them
// is the hash — which must come from each reply's own content_id. Hand-picked so
// 'sha256:aaa' < 'sha256:bbb' lexicographically (index 7: 'a' < 'b'), so the expected
// order is [aaa, bbb] regardless of input order.
{
  const bodyX = encodePresence({ x: 1, y: 1, heading: 0, speed: 0, t: 100 });
  const bodyY = encodePresence({ x: 2, y: 2, heading: 0, speed: 0, t: 100 });
  const replyAaa = reply('sha256:aaa', 'author-x', bodyX);
  const replyBbb = reply('sha256:bbb', 'author-y', bodyY);

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
// section uses) — hand-derived ascending order is 100, 300, 500, i.e. ids [b, c, a].
// The RawReply input array below is shuffled into a THIRD order ([a, c, b]), distinct
// from both the expected output order and its exact reverse, so a passing test cannot
// be explained by repliesToLog accidentally preserving or reversing input order.
{
  const bodyFor = (ms: number) => encodePresence({ x: 0, y: 0, heading: 0, speed: 0, t: ms });
  const replyA = reply('sha256:a', 'a', bodyFor(500));
  const replyB = reply('sha256:b', 'b', bodyFor(100));
  const replyC = reply('sha256:c', 'c', bodyFor(300));

  const shuffled: RawReply[] = [replyA, replyC, replyB];
  const log = repliesToLog(shuffled);
  check('output is ordered by authoring ms (b@100, c@300, a@500), independent of input order',
    log.map((e) => e.id).join(',') === 'b,c,a', log.map((e) => ({ id: e.id, ms: e.ms })));

  // Independence from input order, mirroring shoalEngine.test.ts's own orderLog check.
  const logOtherOrder = repliesToLog([replyB, replyA, replyC]);
  check('the same three replies in a different input order produce the identical output order',
    logOtherOrder.map((e) => e.id).join(',') === log.map((e) => e.id).join(','), logOtherOrder.map((e) => e.id));
}

// --- Duplicate content_ids are collapsed, keeping one -------------------------------
// The node can serve the same reply twice across a paginated fetch (once still
// pending in the mempool with block_height: null, once finalized with a real height,
// or simply duplicated verbatim). Same content_id, same body — only block_height
// differs, exactly like the pending-to-finalized transition on a real node.
{
  const dupBody = encodeEat(9, 3000);
  const pendingCopy = reply('sha256:dup', 'author-dup', dupBody, null);
  const finalizedCopy = reply('sha256:dup', 'author-dup', dupBody, 42);
  const other = reply('sha256:other', 'author-other', encodeEat(1, 3100), 10);

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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
