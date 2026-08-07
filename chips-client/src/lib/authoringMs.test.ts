/**
 * A MOVE'S BODY CARRIES THE MOMENT IT WAS PLAYED, NEVER THE MOMENT IT WAS SENT.
 *
 * The fold replays a table in embedded-ms order (orderReplies). Every verb
 * except `buy` and `bank` already stamps its authoring moment; those two
 * minted a FRESH ms inside `planSend` on every attempt. That is harmless only
 * while the send happens within moments of the tap — and on 2026-08-06,
 * mainnet table "Counter Fryer 303", it did not: a post-tip rebuild queued 13
 * moves behind single-flight PoW pacing, so `buy bowl2` (tapped ~23:47:2x,
 * cap 3M -> 200M) landed with ms 23:49:44 while the dips tapped AFTER it kept
 * their authoring ms of 23:47:3x-52. The fold replayed the dips first,
 * clamped them at the 3M cap, and destroyed ~6.4M crumbs the UI had already
 * shown as credited with `spilled: 0` — the operator's "not keeping crumbs".
 *
 * Send-minted ms also broke retirement: `TWIN_SKEW_MS` assumed body-ms and
 * `sentAt` are stamped "in the same tick", but a phone submit takes 5-25s
 * (bowl1: body 23:46:36.654, sentAt 23:46:43.856), so every sent buy failed
 * `twinAt >= sentAt - 2000` and sat as settling noise for the full TTL.
 *
 * The rule this suite pins: the queue entry owns its authoring ms from
 * `enqueue`, and every body built from it — sender or pending overlay —
 * carries that ms. A buy's moveKey is therefore unique for all time (ms in
 * the key), retirement needs no skew window, and a retry re-sends the
 * byte-identical body, which the node dedupes to the same content id.
 *
 * Run: npx tsx src/lib/authoringMs.test.ts
 */
import { planSend } from './chipsSender';
import { enqueue, type QueuedMove } from './chipsQueue';
import { withPending } from './chipsPending';
import { moveKey } from './moveKey';
import { confirmedMoveKeys, retireSettled, SETTLE_TTL_MS } from './chipsSettling';
import { foldChips, type ChipsReply } from './chipsEngine';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)) : ''}`);
  }
}

const TABLE = 'sha256:table-a';
const ME = 'a'.repeat(64);
let nextId = 1;

const reply = (body: string, n: number): ChipsReply => ({
  author_id: ME, body, block_height: null, content_id: `sha256:r${n}`, created_at: 0,
});

// ---------------------------------------------------------------------------
// 1) The sender: a buy's body ms is the AUTHORING ms, not the send clock.
{
  const AUTHORED = 1_786_060_000_000;
  const SENT = AUTHORED + 150_000;                       // sent 2.5 minutes later
  let q: QueuedMove[] = [];
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'buy', key: 'bowl2', ms: AUTHORED }, nextId++);
  const plan = planSend(q, TABLE, ME, SENT)!;
  check('buy body carries the authoring ms', plan.body === `buy bowl2#${AUTHORED}~`, plan.body);
  const again = planSend(q, TABLE, ME, SENT + 30_000)!;
  check('a retry re-builds the byte-identical body (idempotent on the node)',
    again.body === plan.body, again.body);
}

// 2) The sender: a bank batch's outer ms is its OLDEST chip's ms.
{
  const SENT = 1_786_060_150_000;
  let q: QueuedMove[] = [];
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'bank', chip: { ms: 1_786_060_000_500, bits: 10, nonce: 7n } }, nextId++);
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'bank', chip: { ms: 1_786_060_000_100, bits: 10, nonce: 8n } }, nextId++);
  const plan = planSend(q, TABLE, ME, SENT)!;
  check('bank batch body ends with the oldest chip ms',
    plan.body.endsWith(`#${1_786_060_000_100}~`), plan.body);
}

// 3) The pending overlay folds the same bodies the sender will send.
{
  const AUTHORED = 1_786_060_000_000;
  let q: QueuedMove[] = [];
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'buy', key: 'season1', ms: AUTHORED }, nextId++);
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'bank', chip: { ms: AUTHORED + 5, bits: 10, nonce: 9n } }, nextId++);
  const { replies } = withPending([], new Map(), q, ME, TABLE);
  check('pending buy body carries the authoring ms',
    replies.some((r) => r.body === `buy season1#${AUTHORED}~`), replies.map((r) => r.body));
  check('pending bank body carries its chip ms',
    replies.some((r) => r.body.endsWith(`#${AUTHORED + 5}~`)), replies.map((r) => r.body));
}

// 4) The join key: a buy names ONE attempt for all time.
{
  const a: QueuedMove = { id: 900, tableId: TABLE, author: ME, kind: 'buy', key: 'overcook', ms: 1_000 };
  const b: QueuedMove = { id: 901, tableId: TABLE, author: ME, kind: 'buy', key: 'overcook', ms: 2_000 };
  check('two attempts at the same jar have distinct keys', moveKey(a) !== moveKey(b), moveKey(a));
  check('confirmedMoveKeys emits the same ms-scoped key',
    confirmedMoveKeys([reply(`buy overcook#${1_000}~`, 1)], TABLE, ME).has(moveKey(a)));
}

// 5) Retirement: a sent buy retires on its own twin even when the submit took
//    20 seconds — no skew window involved — and ONLY when the fold honoured it.
{
  const AUTHORED = 1_786_060_000_000;
  const SENT = AUTHORED + 20_000;                        // slow phone submit
  const NOW = SENT + 15_000;                             // one poll later
  const m: QueuedMove = { id: 910, tableId: TABLE, author: ME, kind: 'buy', key: 'bowl2', ms: AUTHORED, sentAt: SENT };
  const twins = confirmedMoveKeys([reply(`buy bowl2#${AUTHORED}~`, 2)], TABLE, ME);
  const retired = retireSettled([m], twins, NOW, SETTLE_TTL_MS, new Set(['bowl2']));
  check('a slow-submit buy retires the moment its twin is honoured', retired.length === 0, retired);
  const held = retireSettled([m], twins, NOW, SETTLE_TTL_MS, new Set());
  check('a twin the fold did NOT honour retires nothing (post-tip re-score)', held.length === 1);
  // A namesake from a previous bowl carries a different ms — different key,
  // no match, the fresh attempt survives.
  const namesake = confirmedMoveKeys([reply(`buy bowl2#${AUTHORED - 3_600_000}~`, 3)], TABLE, ME);
  check('an hour-old namesake retires nothing', retireSettled([m], namesake, NOW, SETTLE_TTL_MS, new Set(['bowl2'])).length === 1);
}

// 6) THE INCIDENT, end to end: dips tapped after a cap-raise buy must fold
//    under the raised cap even when the buy's SEND happens minutes late.
{
  const T0 = 1_786_060_000_000;
  let q: QueuedMove[] = [];
  // Fund the buy, buy the bigger bowls, then dip past the small cap — the
  // exact tap order of the 2026-08-06 rebuild, compressed.
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'dip', amount: 950_000, ms: T0 }, nextId++);
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'buy', key: 'bowl1', ms: T0 + 1_000 }, nextId++);
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'dip', amount: 900_000, ms: T0 + 2_000 }, nextId++);
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'buy', key: 'bowl2', ms: T0 + 3_000 }, nextId++);
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'dip', amount: 4_000_000, ms: T0 + 4_000 }, nextId++);

  // Single-flight sends, each 150s apart — the queue-depth delay of the incident.
  const bodies: string[] = [];
  let queue = q, sendAt = T0 + 150_000;
  for (let guard = 0; guard < 10 && queue.some((m) => m.sentAt === undefined); guard++) {
    const plan = planSend(queue, TABLE, ME, sendAt)!;
    bodies.push(plan.body);
    queue = queue.map((m) => (plan.moves.some((p) => p.id === m.id) ? { ...m, sentAt: sendAt } : m));
    sendAt += 150_000;
  }
  const replies = bodies.map((b, i) => reply(b, 100 + i));
  const st = foldChips({ v: 1, kind: 'chips-table', name: 'x', owner: ME }, TABLE, replies, new Map());
  // 950k dipped, -25k bowl1, 900k dipped, -900k bowl2 (cap now 200M), 4M dipped.
  check('no crumb is destroyed by send-order drift', st.crumbs === 4_925_000, st.crumbs);
  check('the cap raise folded before the dips tapped after it', st.bowlCap === 200_000_000, st.bowlCap);
}

console.log('');
if (failures > 0) { console.error(`${failures} checks failed`); process.exit(1); }
console.log('authoring ms: all checks passed');
