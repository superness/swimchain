/**
 * The way in — plan 2026-07-28-the-shoal-shallows, Task 4. Run:
 * npx tsx src/ui/wayIn.test.ts
 *
 * TWO THINGS ARE PROVED HERE, and the second is the one the brief singles out.
 *
 * 1. **The classification reaches the right standing.** Every `SendFailure`
 *    below is produced by driving the REAL `rpcCall` with a fake `fetch` and
 *    running the REAL `classifySendFailure` over whatever it threw — never a
 *    hand-built `{ kind: 'not-sponsored' }` literal. A hand-built literal would
 *    prove only that `afterWrite` can read a field it was handed; this proves
 *    that a node answering -32015 on the wire ends with the player at the edge
 *    of the water, through every layer in between.
 *
 * 2. **An unrelated failure does NOT produce the way-in surface.** A wrong
 *    PoW, a 502 from something in front of the node, a laptop with no wifi —
 *    each is a real failure and none of them means "nobody has let you in".
 *    A client that showed the edge for those would send a player looking for a
 *    stranger to fix a router. Both directions are checked: an unrelated
 *    failure must not RAISE the edge, and must not CLEAR one either.
 *
 * The copy is pinned character-for-character and held to spec §1.1's diegetic
 * rule by a word list — and the word list's own checker is tested against a
 * deliberately bad string first, so a broken checker cannot pass the copy by
 * failing to look.
 */
import { rpcCall, type RpcAuth } from '../lib/shoalRpc';
import { classifySendFailure, type SendFailure } from '../lib/shoalSend';
import { afterWrite, AT_THE_EDGE, EDGE_BODY, EDGE_TITLE, OPEN_WATER } from './wayIn';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// ---------------------------------------------------------------------------
// Real failures, produced by the real RPC layer
// ---------------------------------------------------------------------------

const AUTH: RpcAuth = { endpoint: 'http://node-a.example/rpc', authHeader: null };

async function withFakeFetch<T>(fetchFn: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

/** Submit through the real `rpcCall`, catch what it throws, classify it with
 *  the real classifier. What comes back is what `chainSea` hands `afterWrite`. */
async function realFailure(fetchFn: typeof fetch): Promise<SendFailure> {
  const caught = await withFakeFetch(fetchFn, async () => {
    try {
      await rpcCall(AUTH, 'submit_reply', {});
      return { threw: false as const };
    } catch (e) {
      return { threw: true as const, e };
    }
  });
  if (!caught.threw) throw new Error('the fake fetch was supposed to make rpcCall reject, and it resolved');
  return classifySendFailure(caught.e);
}

function jsonRpcError(code: number, message: string): typeof fetch {
  return (async () => new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: 1 }),
    { status: 200, statusText: 'OK' },
  )) as typeof fetch;
}

// ---------------------------------------------------------------------------
// 1. The refusal that means "nobody has let you in"
// ---------------------------------------------------------------------------
async function theGateRaisesTheEdge(): Promise<void> {
  console.log('\n1. a write refused for want of a voucher puts the player at the edge');

  // The node's own words and its own code, verbatim from
  // src/rpc/methods.rs:823-827 and src/rpc/error.rs:31.
  const refusal = await realFailure(jsonRpcError(
    -32015,
    'Identity is not sponsored. You must be sponsored by an existing member to post.',
  ));
  check('NON-DEGENERACY: the real RPC layer really did classify this as not-sponsored',
    refusal.kind === 'not-sponsored', refusal.kind);

  const before = OPEN_WATER;
  check('NON-DEGENERACY: a client starts in open water, claiming nothing',
    before.atTheEdge === false, before);

  const after = afterWrite(before, refusal);
  check('after the refusal the player is at the edge of the water',
    after.atTheEdge === true, after);

  // Still refused on the next write, and the next: the standing does not
  // oscillate, and a second refusal does not have to be handled specially.
  const again = afterWrite(after, refusal);
  check('a second refusal leaves them exactly where they were',
    again.atTheEdge === true, again);
  check('...and returns the SAME object, so a React caller does not re-render '
    + 'the tree once every few seconds forever', again === after, { same: again === after });
}

// ---------------------------------------------------------------------------
// 2. THE NEGATIVE: an unrelated failure must not produce the way-in surface
// ---------------------------------------------------------------------------
async function anUnrelatedFailureDoesNotRaiseTheEdge(): Promise<void> {
  console.log('\n2. an unrelated failure never puts the player at the edge');

  // (a) A different JSON-RPC code from a node that answered perfectly well.
  //     PowInvalid, src/rpc/error.rs:26 — mined against the wrong profile, say.
  const pow = await realFailure(jsonRpcError(-32010, 'Proof of work invalid'));
  check('NON-DEGENERACY: a PoW rejection classifies as unknown, not not-sponsored',
    pow.kind === 'unknown', pow.kind);
  check('a PoW rejection leaves the player in open water',
    afterWrite(OPEN_WATER, pow).atTheEdge === false, afterWrite(OPEN_WATER, pow));

  // (b) InvalidParams — a second distinct code, so nothing here can be passing
  //     because -32010 happens to be special-cased somewhere.
  const params = await realFailure(jsonRpcError(-32602, 'Invalid params'));
  check('NON-DEGENERACY: InvalidParams classifies as unknown too', params.kind === 'unknown', params.kind);
  check('...and it too leaves the player in open water',
    afterWrite(OPEN_WATER, params).atTheEdge === false, afterWrite(OPEN_WATER, params));

  // (c) The node is not there at all — `fetch` itself rejects. This is the one
  //     failure a player might genuinely mistake for "the game won't let me
  //     in", and it is exactly the one that must not say so.
  const offline = await realFailure((async () => { throw new TypeError('fetch failed'); }) as typeof fetch);
  check('NON-DEGENERACY: a transport failure classifies as unreachable',
    offline.kind === 'unreachable', offline.kind);
  check('an unreachable node leaves the player in open water — it is not a way-in problem',
    afterWrite(OPEN_WATER, offline).atTheEdge === false, afterWrite(OPEN_WATER, offline));

  // (d) A 502 from something in front of the node: reached, but not by us.
  const gateway = await realFailure(
    (async () => new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' })) as typeof fetch,
  );
  check('NON-DEGENERACY: an HTTP 502 classifies as unknown', gateway.kind === 'unknown', gateway.kind);
  check('...and leaves the player in open water',
    afterWrite(OPEN_WATER, gateway).atTheEdge === false, afterWrite(OPEN_WATER, gateway));

  // AND THE OTHER DIRECTION, which is just as much a lie if it is wrong: a
  // player who IS at the edge and then loses their connection is still at the
  // edge. Flickering the surface off on an unrelated failure would be its own
  // dishonesty, and would also make the edge blink every time a write raced a
  // reconnect.
  check('a player already at the edge stays there when the connection drops',
    afterWrite(AT_THE_EDGE, offline).atTheEdge === true, afterWrite(AT_THE_EDGE, offline));
  check('...and when a write is rejected for some other reason entirely',
    afterWrite(AT_THE_EDGE, pow).atTheEdge === true, afterWrite(AT_THE_EDGE, pow));
}

// ---------------------------------------------------------------------------
// 3. Being let in
// ---------------------------------------------------------------------------
function anAcceptedWriteLiftsTheEdge(): void {
  console.log('\n3. a write the water accepts is what lifts the edge');

  const letIn = afterWrite(AT_THE_EDGE, null);
  check('a player at the edge whose write is accepted is in the water',
    letIn.atTheEdge === false, letIn);
  check('...and a player already in the water stays in it, unchanged',
    afterWrite(OPEN_WATER, null) === OPEN_WATER, afterWrite(OPEN_WATER, null));
}

// ---------------------------------------------------------------------------
// 4. The copy, and spec §1.1
// ---------------------------------------------------------------------------

/**
 * The words the diegetic rule forbids in player-facing text (spec §1.1:
 * "no player-facing copy ever refers to nodes, chains, spaces, posts, replies,
 * or Swimchain"), plus `sponsor`, which is the one this task could most easily
 * have leaked — the node's own refusal message uses it twice.
 *
 * Matched as substrings, case-insensitively, so `Sponsored`, `reposted` and
 * `spaces` are all caught as well.
 */
const FORBIDDEN = [
  'node', 'chain', 'space', 'post', 'reply', 'replies', 'sponsor',
  'swimchain', 'identity', 'error', 'rpc', 'server', 'invite', 'account',
];

function offendingWords(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN.filter((w) => lower.includes(w));
}

function theCopyIsDiegeticAndPinned(): void {
  console.log('\n4. the copy: sea language only, and exactly these words');

  // THE CHECKER IS TESTED FIRST. Without this, a checker that had stopped
  // looking (an empty list, a typo'd `.includes`) would pass every string
  // below and the whole section would be vacuous.
  const badCopy = 'Your identity is not sponsored — the node rejected the reply.';
  const caught = offendingWords(badCopy);
  check('SELF-TEST: the checker catches a line written the way the node says it',
    caught.includes('identity') && caught.includes('sponsor')
    && caught.includes('node') && caught.includes('reply'), caught);
  check('SELF-TEST: and the word list is not empty', FORBIDDEN.length > 0, FORBIDDEN.length);

  check('the title says nothing the diegetic rule forbids', offendingWords(EDGE_TITLE).length === 0,
    offendingWords(EDGE_TITLE));
  check('nor does the body', offendingWords(EDGE_BODY).length === 0, offendingWords(EDGE_BODY));

  // No numbers anywhere: a code is the one thing spec §2.16 says a player must
  // never be handed ("never a link, a code, or an out-of-band chore"), and
  // -32015 leaking into the surface is precisely how that happens.
  check('the title carries no digits — no code ever reaches the player',
    !/\d/.test(EDGE_TITLE), EDGE_TITLE);
  check('nor does the body', !/\d/.test(EDGE_BODY), EDGE_BODY);

  // Pinned character for character. This is a change detector ON PURPOSE:
  // these two lines are the entire player-facing surface of the way in, and
  // changing them should be a deliberate act with a test edit attached.
  check('the title is exactly the line that was reviewed',
    EDGE_TITLE === 'You are at the edge of the water.', EDGE_TITLE);
  check('the body is exactly the line that was reviewed',
    EDGE_BODY === 'The shoal has not taken you in yet. Stay close and keep circling — '
      + 'someone already swimming has to bring you through.', EDGE_BODY);

  // It has to name the act and who performs it, or it is a status message
  // rather than a way in.
  check('the body says a person already in the water is what changes this',
    EDGE_BODY.includes('someone already swimming'), EDGE_BODY);
}

async function main(): Promise<void> {
  await theGateRaisesTheEdge();
  await anUnrelatedFailureDoesNotRaiseTheEdge();
  anAcceptedWriteLiftsTheEdge();
  theCopyIsDiegeticAndPinned();

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
