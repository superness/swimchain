/**
 * The optimistic log — what happens to a row this client published and the
 * node never handed back. Run: npx tsx src/ui/chainSea.test.ts
 *
 * WHAT IS TESTED HERE, AND WHY IT IS THE REAL `chainSea` AND NOT A SKETCH OF
 * ONE. Every case below builds an actual `chainSea` and drives it through its
 * public surface — `publish`, `publishEat`, `step` — with two globals replaced:
 *
 *   - `globalThis.fetch`, by a JSON-RPC stub that answers `get_info` (regtest,
 *     so mining is the node's own flat 4 bits), `get_replies` from a room log
 *     the test owns, and `submit_reply` with a result or an error at the
 *     test's choosing;
 *   - `globalThis.WebSocket`, by a socket that opens and then says nothing, so
 *     `startLive` settles into `live` and no gossip event fires. Every refetch
 *     in this file is therefore one the code under test asked for.
 *
 * NOTHING IS MOCKED INSIDE THE UNIT. The PoW is really mined, the body is
 * really encoded by `shoalWire`, the log is really decoded by `repliesToLog`,
 * and the world is really folded by `shoalEngine`. The only thing the stub
 * decides is what the node says.
 *
 * Everything is observed through `step()`'s returned `ShoalState`, never by
 * reaching into the closure. That is deliberate: a test that read `pending`
 * directly would pass on a fix that corrected the array and left the FOLD
 * holding the phantom — which is exactly the half that was missing, and the
 * reason `withdraw` drops the loop rather than only splicing.
 *
 * THE THREE DEFECTS, all found by the final whole-branch review:
 *
 *   1. retirement matched on `(id, ms)` and ignored `kind`, so a vector and an
 *      eat claim authored at the same `authorMs` — routine; App.tsx steps 3
 *      and 5 share one clock read — retired each other;
 *   2. a REJECTED write left its optimistic row in place forever, because only
 *      a matching entry in `remote` could ever retire it and none was coming;
 *   3. a write the node accepted and then purged (open item 2's shape, and
 *      silent) had nothing at all to catch it.
 *
 * Expected values are derived by hand in comments from the consensus constants
 * and stated before the code is run.
 */
import { chainSea, type ChainSea } from './chainSea';
import { wildSeedFrom } from './demoSea';
import { encodeEat, encodePresence } from '../lib/shoalWire';
import { cellCentre, cellIndex } from '../lib/bloom';
import { epochStartMs, epochOf } from '../lib/epoch';
import { PRESENCE_TTL_MS, TICK_MS } from '../lib/shoalConst';
import type { NodeReply } from '../lib/shoalRoom';
import type { Vec } from '../lib/shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// ===========================================================================
// The fixture
// ===========================================================================

/** 64 lowercase hex — the shape `repliesToLog`'s AUTHOR_ID_RE demands. */
const ID = 'a1'.repeat(32);
/** 37 chars, `sp1` + bech32 charset: what `assertWireSpaceId` demands. */
const SPACE = 'sp1' + 'q'.repeat(34);
const ROOM = 'sha256:' + 'ab'.repeat(32);
const ENDPOINT = 'http://127.0.0.1:29736';

// An epoch chosen once, and every instant placed a few seconds into it so a
// fold is a few hundred ticks rather than the full 14_400 — the numbers below
// do not depend on WHICH epoch, only on the offsets within it.
const EPOCH = epochOf(1_800_000_000_000);
const EPOCH_START = epochStartMs(EPOCH);
/** The landed presence that puts the swimmer on a bloom cell. */
const T0 = EPOCH_START + 1_000;
/** The instant a vector and an eat claim are BOTH authored — the collision. */
const T1 = T0 + 2_000;

/** The cell the swimmer sits on, and its exact centre. Sitting on the centre
 *  puts it 0 cu from the claim target, well inside EAT_R (90). */
const CELL = cellIndex(4_000, 3_000);
const CENTRE = cellCentre(CELL);

function vecAt(t: number, heading: number): Vec {
  return { x: CENTRE.x, y: CENTRE.y, heading, speed: 0, t };
}

/** A reply the node has actually stored. `content_id` is `sha256:…` like a
 *  real one, which matters: `orderLog` breaks an `ms` tie on the hash, and a
 *  pending row's synthetic `pending-N` sorts BEFORE `sha256:…` ('p' < 's'), so
 *  faking a friendlier id here would fake away a real ordering fact. */
function landed(n: number, body: string, createdAt: number): NodeReply {
  return {
    content_id: `sha256:${n.toString(16).padStart(64, '0')}`,
    author_id: ID,
    body,
    parent_id: ROOM,
    block_height: null,
    created_at: createdAt,
  };
}

interface Stub {
  /** What `get_replies` answers with. Mutate it between steps. */
  replies: NodeReply[];
  /** When true, `submit_reply` answers with a JSON-RPC error. */
  rejectSubmit: boolean;
  calls: { getReplies: number; submit: number; getInfo: number };
}

function installStub(): { stub: Stub; restore: () => void } {
  const g = globalThis as unknown as Record<string, unknown>;
  const realFetch = g.fetch;
  const realWs = g.WebSocket;

  const stub: Stub = {
    replies: [],
    rejectSubmit: false,
    calls: { getReplies: 0, submit: 0, getInfo: 0 },
  };

  const json = (body: unknown) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body),
    json: async () => body,
  });

  g.fetch = async (_url: unknown, init: { body: string }) => {
    const req = JSON.parse(init.body) as { method: string; id: number };
    if (req.method === 'get_info') {
      stub.calls.getInfo++;
      return json({ jsonrpc: '2.0', id: req.id, result: { network: 'regtest' } });
    }
    if (req.method === 'get_replies') {
      stub.calls.getReplies++;
      return json({
        jsonrpc: '2.0',
        id: req.id,
        result: { parent_id: ROOM, replies: [...stub.replies], total_count: stub.replies.length },
      });
    }
    if (req.method === 'submit_reply') {
      stub.calls.submit++;
      if (stub.rejectSubmit) {
        return json({
          jsonrpc: '2.0',
          id: req.id,
          // The real shape of open item 2's failure, on a network that enforces
          // the gate at ingestion (methods.rs:2917).
          error: { code: -32_000, message: 'author not authorized in space' },
        });
      }
      return json({ jsonrpc: '2.0', id: req.id, result: { content_id: `sha256:${'f'.repeat(64)}` } });
    }
    throw new Error(`stub fetch: unexpected method ${req.method}`);
  };

  // Opens, subscribes into the void, and never delivers an event — so every
  // refetch in this file is one the code under test asked for, and there are
  // no reconnect timers racing the assertions.
  class QuietSocket {
    onopen: ((ev: unknown) => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onclose: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    constructor(_url: string) {
      setTimeout(() => this.onopen?.({}), 0);
    }
    send(_data: string): void { /* the subscribe frame goes nowhere */ }
    close(): void { /* nothing to tear down */ }
  }
  g.WebSocket = QuietSocket;

  return {
    stub,
    restore: () => { g.fetch = realFetch; g.WebSocket = realWs; },
  };
}

function makeSea(): ChainSea {
  return chainSea({
    auth: { endpoint: ENDPOINT, authHeader: null },
    spaceId: SPACE,
    roomContentId: ROOM,
    authorIdHex: ID,
    signer: Promise.resolve({
      publicKeyHex: ID,
      // The node is stubbed, so nothing verifies this — but it must be 64
      // bytes or `mineAndSignAction` throws before the submit is reached.
      sign: async () => new Uint8Array(64),
    }),
    spawn: { x: CENTRE.x, y: CENTRE.y },
    onError: () => { /* errors are the subject here, not a failure of the run */ },
  });
}

/** Wait until `pred` holds, polling on a real timer. Everything awaited here
 *  is genuinely asynchronous work (Argon2id mining, the stubbed round trip and
 *  the refetch that follows it), so there is nothing to fake-clock. */
async function until(pred: () => boolean, what: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
  // One more turn, so the continuation that follows the predicate's own
  // await (the refetch a successful send chains onto) has run too.
  await new Promise((r) => setTimeout(r, 30));
}

// ===========================================================================
// 1. RETIREMENT MATCHES ON (id, ms, KIND)
//
// The collision is not exotic. App.tsx reads the clock ONCE per frame and
// derives one `authorMs` from it (step "ONE CLOCK READ PER FRAME"); step 3
// publishes the vector with that instant and step 5 publishes the eat claim
// with the same one. `shouldEmit`'s one-clock rule bounds PRESENCES only, so
// the two verbs share an `ms` as a matter of course.
//
// Both directions are checked, because the old `(id, ms)` key was symmetric
// and broke both.
// ===========================================================================
async function landedEatMustNotRetireAPendingVector(): Promise<void> {
  console.log('\n1a. an eat claim landing at T1 must not retire the vector authored at T1');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    // The room already holds one presence, heading 0, on the cell centre.
    stub.replies = [landed(1, encodePresence(vecAt(T0, 0), ID), T0)];
    sea = makeSea();
    await until(() => stub.calls.getReplies >= 1, 'the first read');

    // This client publishes a NEW vector at T1, heading 64. It is optimistic:
    // the room does not hold it and never will during this test.
    sea.publish(vecAt(T1, 64));
    await until(() => stub.calls.submit >= 1, 'the vector to be submitted');

    // Now an eat claim, authored at the SAME instant, and this one lands.
    stub.replies = [...stub.replies, landed(2, encodeEat(CELL, T1, ID), T1)];
    sea.publishEat(CELL, T1);
    await until(() => stub.calls.submit >= 2, 'the eat claim to be submitted');

    // The refetch that followed the eat's submission saw a landed entry with
    // (id=ID, ms=T1) — but kind 'eat'. The pending PRESENCE at (ID, T1) is a
    // different verb and must survive it.
    //
    // Hand-derived: the fold applies both entries at the tick covering T1, so
    // the swimmer's vector is the one authored last in (ms, hash) order.
    // 'pending-0' < 'sha256:…' on the tiebreak, so the presence is applied,
    // then the eat — and `state.fish` carries HEADING 64. If the presence were
    // retired, the only presence left is the landed one at T0, HEADING 0.
    const state = sea.step(T1 + TICK_MS);
    const me = state.fish.get(ID);
    check('the swimmer is in the sea at all', me !== undefined);
    check('the pending vector survived the landed eat claim (heading 64, not 0)',
      me?.vec.heading === 64, { heading: me?.vec.heading });
  } finally {
    sea?.stop();
    restore();
  }
}

async function landedVectorMustNotRetireAPendingEat(): Promise<void> {
  console.log('\n1b. a vector landing at T1 must not retire the eat claim authored at T1');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    stub.replies = [landed(1, encodePresence(vecAt(T0, 0), ID), T0)];
    sea = makeSea();
    await until(() => stub.calls.getReplies >= 1, 'the first read');

    // An eat claim at T1, optimistic — the room never returns it.
    sea.publishEat(CELL, T1);
    await until(() => stub.calls.submit >= 1, 'the eat claim to be submitted');

    // A vector at the same instant, and THIS one lands.
    stub.replies = [...stub.replies, landed(2, encodePresence(vecAt(T1, 64), ID), T1)];
    sea.publish(vecAt(T1, 64));
    await until(() => stub.calls.submit >= 2, 'the vector to be submitted');

    // Hand-derived: the swimmer has sat on CELL's exact centre since T0, so it
    // is 0 cu from the claim target (EAT_R is 90) and the claimant-exemption
    // rule means its own visits do not deny it. bitesTaken is 0 and
    // lastBiteMs -1, so the claim credits exactly one bite.
    const state = sea.step(T1 + TICK_MS);
    check('the pending eat claim survived the landed vector (one bite credited)',
      state.bitesTaken.get(CELL) === 1, { bitesTaken: state.bitesTaken.get(CELL) });
  } finally {
    sea?.stop();
    restore();
  }
}

// ===========================================================================
// 2. A REJECTED WRITE IS WITHDRAWN — FROM THE FOLD, NOT JUST THE ARRAY
//
// The optimistic row is what makes the player's own fish move at all, so it is
// folded the instant it is pushed. The test therefore asserts it BOTH ways
// round the rejection: present before, gone after. Asserting only the second
// half would pass against a `publish` that had stopped being optimistic.
// ===========================================================================
async function aRejectedWriteIsRolledBack(): Promise<void> {
  console.log('\n2. a write the node refuses is taken back out of the world');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    stub.replies = [landed(1, encodePresence(vecAt(T0, 0), ID), T0)];
    sea = makeSea();
    await until(() => stub.calls.getReplies >= 1, 'the first read');

    stub.rejectSubmit = true;
    sea.publish(vecAt(T1, 64));

    // SYNCHRONOUSLY, before mining has finished and therefore before the
    // rejection can have arrived: the fish is already on the new heading.
    const optimistic = sea.step(T1 + TICK_MS);
    check('the optimistic row is folded immediately (heading 64)',
      optimistic.fish.get(ID)?.vec.heading === 64,
      { heading: optimistic.fish.get(ID)?.vec.heading });

    await until(() => stub.calls.submit >= 1, 'the submission to be refused');

    // Hand-derived: with the row withdrawn, the only presence anywhere is the
    // landed one at T0, heading 0 — and the fold must say so, which it can
    // only do if `withdraw` dropped the loop as well as the array. `advance`
    // had already put the row in `appliedHashes` and `ordered`, so a fix that
    // spliced the array alone would leave heading 64 standing here forever.
    const after = sea.step(T1 + 2 * TICK_MS);
    check('after the refusal the world is back on the vector that really landed (heading 0)',
      after.fish.get(ID)?.vec.heading === 0, { heading: after.fish.get(ID)?.vec.heading });
  } finally {
    sea?.stop();
    restore();
  }
}

// ===========================================================================
// 3. A ROW THAT NEITHER LANDS NOR FAILS EXPIRES, AT AN EXACT INSTANT
//
// The silent case: the node accepts the submission (open item 2 — regtest
// bypasses sponsorship at ingestion and enforces it at block inclusion) and
// then purges it. Nothing throws, nothing arrives, and before this branch the
// row sat in the fold forever.
//
// The window is PENDING_TTL_MS === PRESENCE_TTL_MS (90_000), measured from the
// row's own authoring instant, so the boundary is exactly:
//   kept    at wallMs - ms === 89_999
//   dropped at wallMs - ms === 90_000
// and both sides are asserted rather than one.
// ===========================================================================
async function anUnansweredRowExpires(): Promise<void> {
  console.log('\n3. an optimistic row that is never answered expires at PENDING_TTL_MS');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    // Three landed presences on the same spot keep the swimmer alive — and
    // keep it VISITING the cell — well past T1 + PRESENCE_TTL_MS. Without
    // that the cell would lie fallow for BLOOM_READY_MS (45_000) and step 3 of
    // foldTick would clear `bitesTaken` on its own, which would make the
    // observable below true for a reason that has nothing to do with expiry.
    stub.replies = [
      landed(1, encodePresence(vecAt(T0, 0), ID), T0),
      landed(2, encodePresence(vecAt(T0 + 60_000, 0), ID), T0 + 60_000),
      landed(3, encodePresence(vecAt(T0 + 120_000, 0), ID), T0 + 120_000),
    ];
    sea = makeSea();
    await until(() => stub.calls.getReplies >= 1, 'the first read');

    // Accepted by the node, and then never seen again.
    sea.publishEat(CELL, T1);
    await until(() => stub.calls.submit >= 1, 'the claim to be submitted');

    const justInside = sea.step(T1 + PRESENCE_TTL_MS - 1);
    check('one ms inside the window the claim is still credited',
      justInside.bitesTaken.get(CELL) === 1, { bitesTaken: justInside.bitesTaken.get(CELL) });

    const atTheBound = sea.step(T1 + PRESENCE_TTL_MS);
    check('at the window the phantom bite is gone from the world',
      atTheBound.bitesTaken.get(CELL) === undefined,
      { bitesTaken: atTheBound.bitesTaken.get(CELL) });
    check('...and the swimmer is still in the sea (the presences kept it alive)',
      atTheBound.fish.get(ID) !== undefined);
  } finally {
    sea?.stop();
    restore();
  }
}

// ===========================================================================
// wildSeedFrom — the one value a second shell (the launcher, a native
// client) must derive IDENTICALLY to see the same wild shoal as the browser
// client (open item 13). Pure and synchronous, so no fetch stub is needed;
// exercised here rather than in demoSea.test.ts because there isn't one —
// `chainSea` is `wildSeedFrom`'s one real caller (chainSea.ts:251).
//
// FNV-1a over `${spaceId}/${roomContentId}`, folded to 31 bits. Hand-derived
// for the shortest inputs that still exercise all three characters of the
// joining slash, spaceId="a", roomContentId="b" -> s = "a/b":
//
//   h0 = 2166136261 (0x811c9dc5), the FNV-1a offset basis
//   'a' (97):  h0 ^ 97      = 2166136228 (0x811c9da4)
//              * 16777619 mod 2^32 = 3826002220 (0xe40c292c)
//   '/' (47):  ^ 47         = 3826002179 (0xe40c2903)
//              * 16777619 mod 2^32 =   35950521 (0x02248fb9)
//   'b' (98):  ^ 98         =   35950555 (0x02248fdb)
//              * 16777619 mod 2^32 =  982414785 (0x3a8e75c1)
//   & 0x7fffffff (already positive, high bit clear) = 982414785
function wildSeedFromIsPinnedAndAgreesAcrossShells(): void {
  check('hand-derived: wildSeedFrom("a", "b") = 982414785',
    wildSeedFrom('a', 'b') === 982414785, wildSeedFrom('a', 'b'));
  check('the same room derives the same seed every time',
    wildSeedFrom(SPACE, ROOM) === wildSeedFrom(SPACE, ROOM), wildSeedFrom(SPACE, ROOM));
  check('two different rooms in the same space derive different seeds',
    wildSeedFrom(SPACE, ROOM) !== wildSeedFrom(SPACE, ROOM + 'x'),
    { a: wildSeedFrom(SPACE, ROOM), b: wildSeedFrom(SPACE, ROOM + 'x') });
  check('the seed is always non-negative (the high bit is always cleared)',
    wildSeedFrom('a', 'b') >= 0 && wildSeedFrom(SPACE, ROOM) >= 0 && wildSeedFrom('', '') >= 0,
    { ab: wildSeedFrom('a', 'b'), room: wildSeedFrom(SPACE, ROOM), empty: wildSeedFrom('', '') });
}

async function main(): Promise<void> {
  wildSeedFromIsPinnedAndAgreesAcrossShells();
  await landedEatMustNotRetireAPendingVector();
  await landedVectorMustNotRetireAPendingEat();
  await aRejectedWriteIsRolledBack();
  await anUnansweredRowExpires();

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
