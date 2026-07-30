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
import {
  classifySendFailure, submitToRoom, type PowProfile, type SendCtx, type SendFailure,
} from '../lib/shoalSend';
import {
  afterWrite, AT_THE_EDGE, CROSSING, CROSSING_MS, EDGE_BODY, EDGE_TITLE, OPEN_WATER, settled,
  type Standing,
} from './wayIn';

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

/** The node's own regtest PoW profile, handed over explicitly so a real write
 *  mines in a handful of attempts and needs no `get_info` round trip. */
const REGTEST: PowProfile = {
  network: 'regtest',
  config: { memoryKib: 1024, iterations: 1, parallelism: 1 },
};

/** A real write context — real space id (bech32m wire form), real hashing, real
 *  mining, real request. Only the signer is a stand-in. */
const WRITE_CTX: SendCtx = {
  auth: AUTH,
  spaceId: `sp1${'q'.repeat(34)}`,
  roomContentId: `sha256:${'12'.repeat(32)}`,
  authorIdHex: 'cd'.repeat(32),
  sign: async () => new Uint8Array(64),
  powProfile: REGTEST,
};

/**
 * Drive a WHOLE WRITE — `submitToRoom`, not `rpcCall` — against a fake node and
 * classify whatever the caller ends up with. `realFailure` above stops at the
 * RPC layer, which cannot see the failure this exists for: a 200 whose `result`
 * carries no `content_id` is not an RPC error at all, so `rpcCall` resolves and
 * only the write path can tell that nothing landed.
 */
async function realWriteFailure(fetchFn: typeof fetch): Promise<SendFailure | null> {
  return withFakeFetch(fetchFn, async () => {
    try {
      await submitToRoom(WRITE_CTX, 'a body', 1_700_000_000_000);
      return null; // the caller was told the water took it
    } catch (e) {
      return classifySendFailure(e);
    }
  });
}

function jsonRpcOk(result: unknown): typeof fetch {
  return (async () => new Response(
    JSON.stringify({ jsonrpc: '2.0', result, id: 1 }),
    { status: 200, statusText: 'OK' },
  )) as typeof fetch;
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

  // AND — the check the whole moment turns on — NEITHER OF THEM IS A WELCOME.
  //
  // The two lines above only say the player is still at the edge. That is not
  // the same claim: a rule that lifted the boundary on "the write was not
  // refused" would leave `atTheEdge` raised (it never had cause to lower it)
  // and STILL play the crossing, which is a flaky node faking a welcome. The
  // crossing is a separate flag and has to be separately false.
  check('a dropped connection is not the water taking you in',
    afterWrite(AT_THE_EDGE, offline).crossing === false, afterWrite(AT_THE_EDGE, offline));
  check('...nor is a write that failed for some other reason entirely',
    afterWrite(AT_THE_EDGE, pow).crossing === false, afterWrite(AT_THE_EDGE, pow));
  check('...nor a 502 from something in front of the water',
    afterWrite(AT_THE_EDGE, gateway).crossing === false, afterWrite(AT_THE_EDGE, gateway));
  check('...nor invalid params', afterWrite(AT_THE_EDGE, params).crossing === false,
    afterWrite(AT_THE_EDGE, params));
  // Each of those four came back UNCHANGED — the same object, so a window
  // holding this in React state does not even re-render on a flapping node.
  check('...and every one of them leaves the standing untouched, object and all',
    [offline, pow, gateway, params].every((f) => afterWrite(AT_THE_EDGE, f) === AT_THE_EDGE));

  // (e) THE ANSWER THAT IS NOT AN ERROR AT ALL, and the one that got through.
  //
  // Every case above is a rejection. This one is a JSON-RPC SUCCESS — HTTP 200,
  // `jsonrpc: "2.0"`, a `result` object, no `error` field anywhere — that
  // carries no `content_id`, so nothing landed. `rpcCall` has no way to notice:
  // there is no error to classify, and it resolves. The review drove exactly
  // this answer through the real stack and it LIFTED THE EDGE, dropping the
  // player into water that still would not carry them with the boundary that
  // said so now gone (plan 4c task 2 review, M-1).
  //
  // It is now caught one layer lower, in `submitToRoom`, which is why this row
  // drives a whole write rather than an `rpcCall`. Unreachable from a
  // conforming node — a real `submit_reply` answers a `content_id` or an error
  // — and checked anyway, because the cost of being wrong here is the exact
  // failure this whole surface exists to prevent.
  const empty = await realWriteFailure(jsonRpcOk({}));
  check('a 200 success envelope with nothing in it is not an accepted write',
    empty !== null, empty);
  check('NON-DEGENERACY: it classifies as unknown — the node answered, and we cannot tell what it did',
    empty !== null && empty.kind === 'unknown', empty);
  check('...so it is not the water taking you in',
    empty !== null && afterWrite(AT_THE_EDGE, empty).crossing === false,
    empty !== null ? afterWrite(AT_THE_EDGE, empty) : empty);
  check('...and it leaves the player exactly at the edge, object and all',
    empty !== null && afterWrite(AT_THE_EDGE, empty) === AT_THE_EDGE);
  // AND THE CONTROL, or the four rows above pass for a write path that has
  // simply stopped succeeding: the same harness, the same real mining and
  // signing, with the one field a real node always sends.
  const landed = await realWriteFailure(jsonRpcOk({ content_id: `sha256:${'ab'.repeat(32)}` }));
  check('CONTROL: the same write with a real content_id IS accepted',
    landed === null, landed);
  check('...and that is what lifts the edge', afterWrite(AT_THE_EDGE, landed).crossing === true,
    afterWrite(AT_THE_EDGE, landed));
}

// ---------------------------------------------------------------------------
// 3. Being let in
// ---------------------------------------------------------------------------
function anAcceptedWriteLiftsTheEdge(): void {
  console.log('\n3. a write the water accepts is what lifts the edge');

  const letIn = afterWrite(AT_THE_EDGE, null);
  check('a player at the edge whose write is accepted is in the water',
    letIn.atTheEdge === false, letIn);
  check('...and the boundary is drawn LIFTING rather than switched off',
    letIn.crossing === true, letIn);
  check('...and a player already in the water stays in it, unchanged',
    afterWrite(OPEN_WATER, null) === OPEN_WATER, afterWrite(OPEN_WATER, null));

  // ONCE PER WAIT. The keep-alive puts a write on the wire every few seconds
  // forever, and every one of them after this is also accepted; if any of them
  // could re-enter the crossing the welcome would replay for as long as the
  // player kept playing. It cannot, and the reason is structural rather than a
  // guard: only a standing with the edge UP can enter the moment, and entering
  // puts the edge down.
  //
  // COUNTED, NOT COMPARED, AND THAT IS THE WHOLE POINT OF THE SHAPE BELOW.
  // These two rows used to read `afterWrite(letIn, null) === letIn` — and they
  // PASSED under the exact replay bug they named, because `CROSSING` is a
  // module-level singleton: a fold that re-entered the moment on every accepted
  // write returns `CROSSING`, and so does the correct one, so identity cannot
  // tell them apart (plan 4c task 2 review, M-2). What distinguishes them is
  // the session a player actually has — the moment is entered, the timer ends
  // it, and the writes keep coming — so the sequence is run and the ENTRIES are
  // counted. A fold that replayed reads 100 here.
  let entries = 0;
  let session: Standing = AT_THE_EDGE;
  for (let i = 0; i < 100; i++) {
    const next = afterWrite(session, null);
    if (next.crossing && !session.crossing) entries++;
    session = settled(next); // the moment's own timer, which always eventually fires
  }
  check('across a hundred accepted writes the moment is entered exactly ONCE',
    entries === 1, entries);
  check('...and the player ends simply in the water, not stuck mid-lift and not back outside',
    session === OPEN_WATER, session);

  // THE THREE STATES ARE EXCLUSIVE. `chooseWater` reads `atTheEdge` and
  // `TheEdge` reads `crossing`, so a standing with both raised would put a
  // player in the tutorial water with the boundary lifting off it — the one
  // combination that means nothing.
  for (const [name, s] of [['open water', OPEN_WATER], ['at the edge', AT_THE_EDGE],
    ['crossing', CROSSING]] as const) {
    check(`${name} never has both flags up`, !(s.atTheEdge && s.crossing), s);
  }
  check('NON-DEGENERACY: and they really are three different standings',
    new Set([OPEN_WATER, AT_THE_EDGE, CROSSING]).size === 3);

  // THE END OF THE MOMENT is the clock's business, not the node's.
  check('once the moment has played out the player is simply in the water',
    settled(CROSSING) === OPEN_WATER, settled(CROSSING));
  check('...and a timer that fires with nothing to end changes nothing',
    settled(OPEN_WATER) === OPEN_WATER && settled(AT_THE_EDGE) === AT_THE_EDGE);

  // THE RACE, and the reason `settled` is a fold rather than `setStanding(OPEN_WATER)`:
  // the water can refuse this swimmer AGAIN while the lift is still playing (a
  // vouch that lands and is then withdrawn, a node that flaps). The boundary has
  // to come straight back — and the timer, firing a moment later, must not put
  // them back in water that has just said no to them a second time.
  const refusedAgain = afterWrite(CROSSING, { kind: 'not-sponsored', cause: new Error('x') });
  check('refused again mid-lift, the player is back at the edge',
    refusedAgain === AT_THE_EDGE, refusedAgain);
  check('...and the moment\'s own timer, arriving late, leaves them there',
    settled(refusedAgain) === AT_THE_EDGE, settled(refusedAgain));

  // The one number this module and `theEdge.css` share. Held against the
  // EMITTED stylesheet in `shippedStyles.test.ts`; here it is only held to
  // being a moment rather than a wait, hand-picked bounds either side.
  check('the moment is long enough to be seen and short enough not to be a wait',
    CROSSING_MS >= 1_000 && CROSSING_MS <= 5_000, CROSSING_MS);
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
