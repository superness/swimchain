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
import { createHash } from 'node:crypto';

import { chainSea, type ChainSea } from './chainSea';
import { wildSeedFrom } from './demoSea';
import { afterWrite, AT_THE_EDGE, OPEN_WATER, type Standing } from './wayIn';
import type { SendFailure } from '../lib/shoalSend';
import { encodeCheckpoint, encodeEat, encodePresence } from '../lib/shoalWire';
import { cellCentre, cellIndex } from '../lib/bloom';
import { epochEndMs, epochStartMs, epochOf, epochWarmStartMs } from '../lib/epoch';
import { roomEpochsFor, roomFamilyKey, roomIdIn, waterNamed } from '../lib/water';
import { admitFloorMs } from '../lib/shoalLoop';
import { foldShoal } from '../lib/shoalEngine';
import { repliesToLog } from '../lib/shoalRoom';
import { bodiesOf } from '../lib/shoalEngine';
import { shelterOf } from '../lib/shelter';
import { fingerprint } from '../lib/shoalFixtures';
import {
  BLOOM_VISIT_R2, EAT_R2, PRESENCE_TTL_MS, SHELTER_R2, SHELTER_THRESHOLD, TICK_MS,
} from '../lib/shoalConst';
import type { NodeReply } from '../lib/shoalRoom';
/** `chainSea`'s mint cooldown is DERIVED from `PRESENCE_TTL_MS` and not
 *  exported; re-derived here from the same constant rather than typed, so a
 *  change to one moves both. */
const MINT_RETRY_MS = PRESENCE_TTL_MS;
import type { Checkpoint, ShoalState, Vec } from '../lib/shoalTypes';

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
/**
 * THE WATER, and it is a real derived one rather than a hand-typed `sp1qqq…`.
 *
 * `waterNamed` derives the space id from the name that every room id is also
 * derived from, so a fixture built this way cannot hold a room of one water
 * beside the space of another — which is the whole point of plan 4d Task 2's
 * binding, and would be quietly undone by a fixture that typed both.
 */
const WATER = await waterNamed('main');
const SPACE = WATER.spaceId;
const ENDPOINT = 'http://127.0.0.1:29736';

// An epoch chosen once, and every instant placed a few seconds into it so a
// fold is a few hundred ticks rather than the full 14_400 — the numbers below
// do not depend on WHICH epoch, only on the offsets within it.
const EPOCH = epochOf(1_800_000_000_000);
const EPOCH_START = epochStartMs(EPOCH);
/** The room for that epoch, and the one before it — the pair every fold of
 *  `EPOCH` reads (`roomEpochsFor`). Derived, never typed. */
const ROOM = await roomIdIn(WATER, EPOCH);
const PREV_ROOM = await roomIdIn(WATER, EPOCH - 1);
const NEXT_ROOM = await roomIdIn(WATER, EPOCH + 1);
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
function landed(n: number, body: string, createdAt: number, parent: string = ROOM): NodeReply {
  return {
    content_id: `sha256:${n.toString(16).padStart(64, '0')}`,
    author_id: ID,
    body,
    parent_id: parent,
    block_height: null,
    created_at: createdAt,
  };
}

interface Stub {
  /** What `get_replies` answers with. Mutate it between steps. */
  replies: NodeReply[];
  /** When true, `submit_reply` answers with a JSON-RPC error. */
  rejectSubmit: boolean;
  /** When true, `submit_post` answers with a JSON-RPC error — the shape a
   *  node takes when this identity is not sponsored, or when the space is
   *  not one it will accept a post into. */
  rejectMint: boolean;
  /**
   * The JSON-RPC `code` that rejection carries. Default -32000 is the shape of
   * open item 2's failure on a network that enforces the space gate at
   * ingestion; section 8 sets it to -32015 (`RpcErrorCode::IdentityNotSponsored`,
   * src/rpc/error.rs:31) to exercise the way-in classification instead.
   */
  submitErrorCode: number;
  /** Every body the sea submitted, in order, with the author it claimed AND
   *  the room it went into — the latter is what plan 4d Task 2's decision 2 is
   *  asserted on. */
  submitted: { body: string; author: string; parent: string }[];
  /** Every room post the sea MINTED (`submit_post`), in order. */
  minted: { title: string; body: string; space: string }[];
  /** Every `content_id` `get_replies` was asked for, in order. The crossing is
   *  visible here: a fold of epoch E asks for E-1's room and E's, every time. */
  roomsRead: string[];
  /**
   * When true, an accepted `submit_reply` is APPENDED to `replies`, so the
   * next `get_replies` hands it back the way a real node does once the write
   * has landed. Off by default: sections 1-3 below depend on a submitted row
   * never coming back.
   */
  landSubmissions: boolean;
  calls: { getReplies: number; submit: number; submitPost: number; getInfo: number };
}

function installStub(): { stub: Stub; restore: () => void } {
  const g = globalThis as unknown as Record<string, unknown>;
  const realFetch = g.fetch;
  const realWs = g.WebSocket;

  const stub: Stub = {
    replies: [],
    rejectSubmit: false,
    rejectMint: false,
    submitErrorCode: -32_000,
    submitted: [],
    minted: [],
    roomsRead: [],
    landSubmissions: false,
    calls: { getReplies: 0, submit: 0, submitPost: 0, getInfo: 0 },
  };

  const json = (body: unknown) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body),
    json: async () => body,
  });

  g.fetch = async (_url: unknown, init: { body: string }) => {
    const req = JSON.parse(init.body) as {
      method: string; id: number;
      params?: {
        body?: string; author_id?: string; parent_id?: string;
        content_id?: string; title?: string; space_id?: string;
      };
    };
    if (req.method === 'get_info') {
      stub.calls.getInfo++;
      return json({ jsonrpc: '2.0', id: req.id, result: { network: 'regtest' } });
    }
    if (req.method === 'get_replies') {
      stub.calls.getReplies++;
      // FILTERED BY PARENT, the way the node's own parent index is. A stub that
      // handed every room the whole list would make the crossing tests pass for
      // a client that read one room, which is the mutation they exist to catch.
      const parent = req.params?.content_id ?? '';
      stub.roomsRead.push(parent);
      const mine = stub.replies.filter((r) => r.parent_id === parent);
      return json({
        jsonrpc: '2.0',
        id: req.id,
        result: { parent_id: parent, replies: mine, total_count: mine.length },
      });
    }
    if (req.method === 'submit_post') {
      stub.calls.submitPost++;
      if (stub.rejectMint) {
        return json({
          jsonrpc: '2.0', id: req.id,
          error: { code: -32_015, message: 'Identity is not sponsored' },
        });
      }
      // MINTING AN HOUR'S ROOM. Answered exactly as the node answers it —
      // `content_id = "sha256:" + hex(sha256(title + "\n\n" + body))`
      // (methods.rs:2221-2223) — because `ensureRoom` compares the answer with
      // its own derivation and throws on a mismatch.
      stub.minted.push({
        title: req.params?.title ?? '', body: req.params?.body ?? '',
        space: req.params?.space_id ?? '',
      });
      return json({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content_id: 'sha256:' + createHash('sha256')
            .update(`${req.params?.title ?? ''}\n\n${req.params?.body ?? ''}`, 'utf8')
            .digest('hex'),
        },
      });
    }
    if (req.method === 'submit_reply') {
      stub.calls.submit++;
      if (stub.rejectSubmit) {
        return json({
          jsonrpc: '2.0',
          id: req.id,
          // The real shape of open item 2's failure, on a network that enforces
          // the gate at ingestion (methods.rs:2917). Section 8 swaps the code
          // for -32015, which is a different refusal with a different meaning.
          error: { code: stub.submitErrorCode, message: 'author not authorized in space' },
        });
      }
      const body = req.params?.body ?? '';
      const author = req.params?.author_id ?? '';
      const parent = req.params?.parent_id ?? '';
      stub.submitted.push({ body, author, parent });
      // A distinct id per accepted write, the way a real node derives one from
      // the body. `landSubmissions` decides whether the room then serves it.
      const contentId = `sha256:${(0xf000 + stub.submitted.length).toString(16).padStart(64, '0')}`;
      if (stub.landSubmissions) {
        stub.replies = [...stub.replies, {
          content_id: contentId, author_id: author, body,
          parent_id: parent, block_height: null, created_at: 0,
        }];
      }
      return json({ jsonrpc: '2.0', id: req.id, result: { content_id: contentId } });
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

/**
 * Build a sea, opened at `openAtMs`.
 *
 * `openedAtMs` is a required part of a `ChainSeaConfig` now, and it decides
 * WHICH PAIR OF ROOMS the constructor's first read asks for — see that field.
 * It is always at or before the first instant the case under test steps to, so
 * it can only reach ticks that case was going to fold anyway.
 */
function makeSea(
  onError?: (where: string, err: unknown) => void,
  onWrite?: (failure: SendFailure | null) => void,
  openAtMs: number = EPOCH_START,
): ChainSea {
  return chainSea({
    openedAtMs: openAtMs,
    ...(onWrite === undefined ? {} : { onWrite }),
    auth: { endpoint: ENDPOINT, authHeader: null },
    water: WATER,
    authorIdHex: ID,
    signer: Promise.resolve({
      publicKeyHex: ID,
      // The node is stubbed, so nothing verifies this — but it must be 64
      // bytes or `mineAndSignAction` throws before the submit is reached.
      sign: async () => new Uint8Array(64),
    }),
    spawn: { x: CENTRE.x, y: CENTRE.y },
    onError: onError ?? (() => { /* errors are the subject here, not a failure of the run */ }),
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
  check('the same key derives the same seed every time',
    wildSeedFrom(SPACE, ROOM) === wildSeedFrom(SPACE, ROOM), wildSeedFrom(SPACE, ROOM));
  check('two different keys in the same space derive different seeds',
    wildSeedFrom(SPACE, ROOM) !== wildSeedFrom(SPACE, ROOM + 'x'),
    { a: wildSeedFrom(SPACE, ROOM), b: wildSeedFrom(SPACE, ROOM + 'x') });

  // A ROTATION MUST BE INVISIBLE (spec §1.1, and this plan's own constraint).
  // `chainSea` seeds the wild shoal from the WATER's room family, never from an
  // hour's room id — otherwise every ambient fish in the sea would re-roll on
  // the stroke of the hour, in front of the player, and announce that the sea
  // has hours.
  check('the family key is a function of the water and carries no hour',
    roomFamilyKey(WATER) === 'wild:shoal:v1:main' && !/\d{5,}/.test(roomFamilyKey(WATER)),
    roomFamilyKey(WATER));
  check('...so every hour of this water has ONE wild seed',
    new Set([PREV_ROOM, ROOM, NEXT_ROOM].map(() => wildSeedFrom(SPACE, roomFamilyKey(WATER)))).size === 1
    && new Set([PREV_ROOM, ROOM, NEXT_ROOM]).size === 3,
    [PREV_ROOM, ROOM, NEXT_ROOM]);
  // NON-DEGENERACY: the check above would hold for a seed function that ignored
  // its second argument entirely. This is what the OLD seeding would have done
  // at the same three hours, and it must differ — otherwise nothing was fixed.
  check('NON-DEGENERACY: seeding from the hour\'s own room WOULD have re-rolled it',
    new Set([PREV_ROOM, ROOM, NEXT_ROOM].map((r) => wildSeedFrom(SPACE, r))).size === 3,
    [PREV_ROOM, ROOM, NEXT_ROOM].map((r) => wildSeedFrom(SPACE, r)));
  // And two waters are still two seas (open item 13).
  check('a different water is a different wild shoal',
    wildSeedFrom(SPACE, roomFamilyKey(WATER))
      !== wildSeedFrom(SPACE, roomFamilyKey({ ...WATER, name: 'smoke' })));
  check('the seed is always non-negative (the high bit is always cleared)',
    wildSeedFrom('a', 'b') >= 0 && wildSeedFrom(SPACE, ROOM) >= 0 && wildSeedFrom('', '') >= 0,
    { ab: wildSeedFrom('a', 'b'), room: wildSeedFrom(SPACE, ROOM), empty: wildSeedFrom('', '') });
}

// ===========================================================================
// 4. THE BOUNDARY: PUBLISH, ADOPT, AND AGREE (open item 12 — Blocker 12)
//
// `advance` returns `{ loop, rolled }` and `rolled` used to be discarded, so
// nothing published a checkpoint and nothing adopted one: a client that ran
// through an hour boundary kept every swimmer's accumulated size (it seeds
// itself from its own `rolled`), while a client that joined after folded
// unseeded and saw everyone back at START_SIZE. Size feeds shelterWeight ->
// shelterOf -> isExposed -> selectTaken, so the two disagreed about who the
// shark eats.
//
// ── THE FIXTURE, AND EVERY NUMBER DERIVED FROM THE CONSENSUS CONSTANTS ─────
//
// Tick alignment first, because every size below depends on it. `foldShoal`
// starts a fresh state at `epochWarmStartMs(e) = start - 90_000` with
// `tickCount` 0, and `foldTick` increments it BEFORE testing
// `tickCount % HUNGER_TICK_INTERVAL (4)`, so the first tick is #1 and hunger
// fires on ticks 4, 8, 12 … i.e. at `warmStart + 750 + 1000k`. 90_000 is a
// whole number of seconds, so:
//
//     HUNGER FIRES AT t = epochStart + 750 + 1000k, FOR EVERY EPOCH.
//
// Hunger is HUNGER_AMOUNT (1), skipped for a fish whose last bite is under
// HUNGER_TICK_INTERVAL * TICK_MS (1000 ms) old, and `clampSize` floors at
// MIN_SIZE (60). START_SIZE is 100 and BITE_GROWTH is 12.
//
// OTHER — a swimmer that eats early in the epoch and then leaves:
//   presence  E_START + 1_000  (on CELL_O's exact centre, speed 0)
//   eat       E_START + 1_500  -> 100 + 12 = 112, lastBiteMs = E_START+1_500
//   presence  E_START + 2_000  (its last write of the epoch)
//   Hunger from E_START+1_750 on: the +1_750 tick is skipped (250 ms after the
//   bite), then one per second. Its presence expires at 2_000 + PRESENCE_TTL_MS
//   = E_START + 92_000, so it is evicted around +92_250 having taken ~90
//   hunger hits — far more than the 52 needed to take 112 down to the MIN_SIZE
//   floor. IT BANKS EXACTLY MIN_SIZE = 60 in `departed`, and the floor is what
//   makes that exact rather than sensitive to a tick either way.
//
// ID — this client's own swimmer, alive across the boundary:
//   presence  E_END - 5_000    (on CELL's exact centre, speed 0)
//   eat       E_END - 4_000
//   Hunger ticks in that window are at E_END - 4_250, -3_250, -2_250, -1_250
//   and -250 (the epoch's last tick, since E_END - 250 = start + 750 + 1000k).
//     -4_250: no bite yet            100 - 1 = 99
//     -4_000: the bite                99 + 12 = 111
//     -3_250: 750 ms after the bite   skipped
//     -2_250:                         110
//     -1_250:                         109
//       -250:                         108
//   ID CROSSES THE BOUNDARY AT SIZE 108, and its bite is 4_000 ms before
//   E_END, inside VOID_WINDOW_MS (10_000), so it is also in the checkpoint's
//   `recent` tail. OTHER's bite is 3_598_500 ms before the end and is not.
//
// THE PUBLISHED CHECKPOINT IS THEREFORE, EXACTLY:
//   {"epoch":E,"sizes":[[ID,108],[OTHER,60]],"recent":[[ID,B,[B]]]}
//   with B = E_START + 3_596_000, and ID < OTHER as strings ('a1…' < 'b2…').
//
// EPOCH E+1: OTHER writes one presence at E_END + 2_000 — it comes back. Both
// clients fold to E_END + 10_000:
//   ID:     seeded to 108 at the origin, then hunger at +750 … +9_750, ten
//           hits, none skipped (its bite is 4_000 ms before the origin):
//           108 - 10 = 98. The warm-up replays ID's own presence and eat
//           claim, so an UNSEEDED client reconstructs the identical 98 — ID is
//           the control that proves the warm-up is doing its job.
//   OTHER:  revived at the tick of its E+1 presence with `prior.size` from
//           `departed`. Hunger at +2_750 … +9_750 is eight hits.
//             ADOPTED:  60 - 8 -> clamped at MIN_SIZE = 60
//             UNSEEDED: no `departed` record at all, so a BRAND-NEW fish at
//                       START_SIZE: 100 - 8 = 92
//   60 versus 92 is spec 2.7's "you return the size you left", and it is the
//   whole of Blocker 12 in one number.
// ===========================================================================

/** The swimmer that eats early and leaves. 64 lowercase hex, and sorts AFTER
 *  ID ('a1…' < 'b2…') so the checkpoint's `sizes` order is known by hand. */
const OTHER = 'b2'.repeat(32);
/** The cell OTHER sits on: the one immediately before ID's in the row-major
 *  bloom grid. Adjacent cell centres are BLOOM cell-width apart — checked
 *  below to be inside SHELTER_R (so the two shelter each other and a size
 *  difference is visible) and outside EAT_R (so neither can claim the other's
 *  cell). */
const CELL_O = CELL - 1;
const CENTRE_O = cellCentre(CELL_O);

const E_END = epochEndMs(EPOCH);
/** The instant ID's bite is claimed — the value that lands in the checkpoint's
 *  `recent` tail. */
const ID_BITE_MS = E_END - 4_000;
/** Where both clients are folded to in epoch E+1. */
const TARGET = E_END + 10_000;

function vecAtOn(t: number, c: { x: number; y: number }): Vec {
  return { x: c.x, y: c.y, heading: 0, speed: 0, t };
}

/** A reply from an arbitrary author (the fixture above needs two). */
function landedBy(
  n: number, author: string, body: string, createdAt: number, parent: string = ROOM,
): NodeReply {
  return {
    content_id: `sha256:${n.toString(16).padStart(64, '0')}`,
    author_id: author,
    body,
    parent_id: parent,
    block_height: null,
    created_at: createdAt,
  };
}

/**
 * The rooms, before anyone publishes anything — TWO of them now, and every
 * entry placed by the hour it was AUTHORED in (plan 4d Task 2, decision 2).
 * That placement is the fixture's own statement of the rule, so a client that
 * read only one room folds a different world here rather than the same one.
 */
function boundaryRoom(): NodeReply[] {
  return [
    landedBy(11, OTHER, encodePresence(vecAtOn(EPOCH_START + 1_000, CENTRE_O), OTHER), 0, ROOM),
    landedBy(12, OTHER, encodeEat(CELL_O, EPOCH_START + 1_500, OTHER), 0, ROOM),
    landedBy(13, OTHER, encodePresence(vecAtOn(EPOCH_START + 2_000, CENTRE_O), OTHER), 0, ROOM),
    landedBy(14, ID, encodePresence(vecAtOn(E_END - 5_000, CENTRE), ID), 0, ROOM),
    landedBy(15, ID, encodeEat(CELL, ID_BITE_MS, ID), 0, ROOM),
    // Epoch E+1: OTHER comes back — into the NEXT hour's room.
    landedBy(16, OTHER, encodePresence(vecAtOn(E_END + 2_000, CENTRE_O), OTHER), 0, NEXT_ROOM),
  ];
}

function fixtureGeometryIsWhatTheDerivationAssumes(): void {
  console.log('\n4a. the fixture\'s geometry, before anything depends on it');
  const d2 = (CENTRE.x - CENTRE_O.x) ** 2 + (CENTRE.y - CENTRE_O.y) ** 2;
  check('ID and OTHER are close enough to shelter each other (inside SHELTER_R)',
    d2 <= SHELTER_R2, { d2, SHELTER_R2 });
  check('...and far enough apart that neither can claim the other\'s bloom cell (outside EAT_R)',
    d2 > EAT_R2, { d2, EAT_R2 });
  check('ID sorts before OTHER, so the checkpoint\'s `sizes` order is known by hand',
    ID < OTHER, { ID, OTHER });
}

async function aClientThatCrossesTheBoundaryPublishesAndAJoinerAdopts(): Promise<void> {
  console.log('\n4b. one client crosses the hour; a client that joins after agrees with it');
  const { stub, restore } = installStub();
  stub.landSubmissions = true;
  const seas: ChainSea[] = [];
  try {
    stub.replies = boundaryRoom();

    // --- The client that is already running -------------------------------
    const a = makeSea();
    seas.push(a);
    await until(() => stub.calls.getReplies >= 1, 'A\'s first read');

    // NON-DEGENERACY, caught in the act: OTHER's bite has to be credited while
    // it is still visible. By the boundary an hour later it is not — a bloom
    // cell that has lain fallow for BLOOM_READY_MS is reset by step 3 of
    // `foldTick`, so `bitesTaken` says nothing about an hour-old bite, and only
    // the SIZE still carries it.
    const justAfterTheBite = a.step(EPOCH_START + 1_500);
    check('NON-DEGENERACY: OTHER really ate — one bite credited on CELL_O',
      justAfterTheBite.bitesTaken.get(CELL_O) === 1, justAfterTheBite.bitesTaken.get(CELL_O));
    check('NON-DEGENERACY, hand-derived: and it grew it to START_SIZE + BITE_GROWTH = 112 '
      + '(the first hunger tick after its arrival is not until +1_750)',
      justAfterTheBite.fish.get(OTHER)?.size === 112, justAfterTheBite.fish.get(OTHER)?.size);

    // Folded to the epoch's LAST tick, which is where `rollEpoch` takes its
    // checkpoint. Not past it — this call must not roll.
    const atBoundary = a.step(E_END - TICK_MS);
    check('NON-DEGENERACY: ID ate too, close enough to the boundary that the bite '
      + 'is still on the board', atBoundary.bitesTaken.get(CELL) === 1,
      atBoundary.bitesTaken.get(CELL));
    check('hand-derived: ID crosses the boundary alive at size 108, not START_SIZE',
      atBoundary.fish.get(ID)?.size === 108, atBoundary.fish.get(ID)?.size);
    check('hand-derived: OTHER left, banking MIN_SIZE 60 in `departed`',
      atBoundary.departed.get(OTHER)?.size === 60, atBoundary.departed.get(OTHER)?.size);
    check('...and OTHER is NOT still live (it really departed)',
      atBoundary.fish.get(OTHER) === undefined);

    // --- Cross it ----------------------------------------------------------
    const readsAtRoll = stub.calls.getReplies;
    const rolling = a.step(TARGET);
    check('A rolled into the next epoch', rolling.epoch === EPOCH + 1, rolling.epoch);

    // THE PAIR OF ROOMS MOVED WITH IT, and the frame that rolls cannot already
    // have read the new one — `advance` decides the roll, and the read it fires
    // is a round trip. So the rolling frame folds epoch E+1 from what this
    // client held while it was still in epoch E: everything up to the boundary,
    // and nothing authored after it. That is correct rather than a gap. Nothing
    // with an `ms` in epoch E+1 can have been authored before E_END, so during
    // epoch E there was nothing in E+1's room to miss; the fixture only has one
    // because it jumps ten seconds in a single step where a real window takes
    // six hundred frames.
    check('the rolling frame has not read the new hour room yet — OTHER is still away',
      rolling.fish.get(OTHER) === undefined && rolling.departed.get(OTHER)?.size === 60,
      { fish: rolling.fish.get(OTHER)?.size, departed: rolling.departed.get(OTHER)?.size });
    await until(() => stub.calls.getReplies > readsAtRoll, 'A to read the new hour room');

    const crossed = a.step(TARGET);
    const crossedPrint = fingerprint(crossed);
    check('...and the very next frame, having read it, has OTHER back',
      crossed.epoch === EPOCH + 1 && crossed.fish.get(OTHER) !== undefined,
      { epoch: crossed.epoch, other: crossed.fish.get(OTHER)?.size });

    await until(() => stub.submitted.length >= 1, 'A to publish its checkpoint');
    check('A published exactly one thing at the boundary — its checkpoint',
      stub.submitted.length === 1, stub.submitted.length);

    // Hand-derived, character for character: the wire form is
    // `v1|checkpoint|<16 hex of the author key>|<canonical payload>`.
    const expectedPayload =
      `{"epoch":${EPOCH},"sizes":[["${ID}",108],["${OTHER}",60]],`
      + `"recent":[["${ID}",${ID_BITE_MS},[${ID_BITE_MS}]]]}`;
    const expectedBody = `v1|checkpoint|${ID.slice(0, 16)}|${expectedPayload}`;
    check('hand-derived: the published body is exactly the canonical checkpoint',
      stub.submitted[0]?.body === expectedBody,
      { got: stub.submitted[0]?.body, want: expectedBody });
    check('...published under this client\'s own author id',
      stub.submitted[0]?.author === ID, stub.submitted[0]?.author);

    // Hand-derived sizes in the NEW epoch, for the client that was there.
    check('hand-derived: ID is 98 in the new epoch (108, less ten hunger ticks)',
      crossed.fish.get(ID)?.size === 98, crossed.fish.get(ID)?.size);
    check('hand-derived: OTHER came back at its banked 60, held there by the floor',
      crossed.fish.get(OTHER)?.size === 60, crossed.fish.get(OTHER)?.size);

    // --- The client that joins after ---------------------------------------
    const readsBefore = stub.calls.getReplies;
    const b = makeSea(undefined, undefined, E_END);
    seas.push(b);
    await until(() => stub.calls.getReplies > readsBefore, 'B\'s first read');
    const joined = b.step(TARGET);

    check('THE BLOCKER: a joiner sees ID at the size it crossed the hour with, 98',
      joined.fish.get(ID)?.size === 98, joined.fish.get(ID)?.size);
    check('THE BLOCKER: and sees OTHER return at 60 — "you return the size you left"',
      joined.fish.get(OTHER)?.size === 60, joined.fish.get(OTHER)?.size);
    check('the two clients agree on EVERY swimmer, byte for byte',
      fingerprint(joined) === crossedPrint,
      { joined: fingerprint(joined), crossed: crossedPrint });

    // --- The control: what an UNSEEDED fold produces ------------------------
    // Without this the equality above would pass over a world where adoption
    // changed nothing at all.
    stub.replies = stub.replies.filter((r) => !r.body.startsWith('v1|checkpoint|'));
    const readsBeforeC = stub.calls.getReplies;
    const c = makeSea(undefined, undefined, E_END);
    seas.push(c);
    await until(() => stub.calls.getReplies > readsBeforeC, 'C\'s first read');
    const unseeded = c.step(TARGET);

    check('CONTROL: with no checkpoint to adopt, ID is still 98 — the warm-up '
      + 'reconstructs a swimmer whose whole history is inside its 180 s window',
      unseeded.fish.get(ID)?.size === 98, unseeded.fish.get(ID)?.size);
    check('CONTROL, hand-derived: but OTHER comes back a STRANGER at 92 '
      + '(START_SIZE 100, less eight hunger ticks) — the bug this closes',
      unseeded.fish.get(OTHER)?.size === 92, unseeded.fish.get(OTHER)?.size);
    check('CONTROL: so the unseeded world is genuinely a different world',
      fingerprint(unseeded) !== crossedPrint);

    // ...and the consequence, on the exact chain open item 12 names: size ->
    // shelterWeight -> shelterOf. Hand-derived from SHELTER_BASE (100),
    // SHELTER_SIZE_DIV (40) and SHELTER_SIZE_CAP (45):
    //   shelterWeight(60) = 100 + trunc(60/40) = 101   (adopted)
    //   shelterWeight(92) = 100 + trunc(92/40) = 102   (unseeded)
    // OTHER is ID's only neighbour inside SHELTER_R, so that IS ID's shelter.
    const selfOf = (s: ShoalState) => bodiesOf(s).find((b) => b.id === ID);
    const adoptedShelter = shelterOf(selfOf(joined)!, bodiesOf(joined));
    const unseededShelter = shelterOf(selfOf(unseeded)!, bodiesOf(unseeded));
    check('hand-derived: with the checkpoint adopted, ID\'s shelter is 101',
      adoptedShelter === 101, adoptedShelter);
    check('hand-derived: without it, 102 — the size table really does reach the '
      + 'shelter maths the sweep judges exposure with',
      unseededShelter === 102, unseededShelter);
    check('SHELTER_THRESHOLD is 300 and two swimmers cap out at 2 * 145 = 290, so '
      + 'this fixture cannot flip `isExposed` — that needs a populated room',
      SHELTER_THRESHOLD === 300 && adoptedShelter < SHELTER_THRESHOLD
        && unseededShelter < SHELTER_THRESHOLD,
      { adoptedShelter, unseededShelter, SHELTER_THRESHOLD });
  } finally {
    for (const s of seas) s.stop();
    restore();
  }
}

// ===========================================================================
// 5. TWO DIFFERING CHECKPOINTS ARE REPORTED, NOT SILENTLY ABSORBED
//
// Every honest client computes the identical PAYLOAD (the bodies still differ,
// because each carries its author's own salt), so two different payloads for
// one epoch is a detected divergence. The policy — plurality of publishers,
// then the lowest content hash — is in adopt.ts and is unit-tested there; what
// is asserted here is that the shell SURFACES it through the same `onError`
// channel it uses for every other failure, and still folds.
// ===========================================================================
async function twoCheckpointsForOneEpochAreReported(): Promise<void> {
  console.log('\n5. two differing checkpoints for one epoch are reported through onError');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  const errors: { where: string; err: unknown }[] = [];
  try {
    // The honest one (what the fixture above really computes) and a fabricated
    // rival that puts OTHER back at START_SIZE. Different authors, so they are
    // two chain objects rather than one.
    const honest: Checkpoint = {
      epoch: EPOCH,
      sizes: [[ID, 108], [OTHER, 60]],
      recent: [[ID, ID_BITE_MS, [ID_BITE_MS]]],
    };
    const rival: Checkpoint = { epoch: EPOCH, sizes: [[ID, 108], [OTHER, 100]], recent: [] };
    stub.replies = [
      ...boundaryRoom(),
      landedBy(21, ID, encodeCheckpoint(honest, ID), 0, NEXT_ROOM),
      landedBy(22, OTHER, encodeCheckpoint(rival, OTHER), 0, NEXT_ROOM),
    ];

    sea = makeSea((where, err) => { errors.push({ where, err }); }, undefined, E_END);
    await until(() => stub.calls.getReplies >= 1, 'the first read');
    const state = sea.step(TARGET);

    const diverge = errors.filter((e) => e.where === 'checkpointDivergence');
    check('the divergence is REPORTED, exactly once', diverge.length === 1,
      errors.map((e) => e.where));
    const msg = diverge[0] === undefined ? '' : String((diverge[0].err as Error).message ?? '');
    // The PROSE has to name it, not merely the appended payload dump. The old
    // spelling of this check was `msg.includes(String(EPOCH))`, which the
    // `"epoch":N` inside the payload text satisfies on its own — it passed
    // whether or not the sentence said anything. `describeDivergence` opens
    // with `epoch <n> has …`, so anchoring to the start of the message is what
    // actually pins the prose.
    check('...naming the epoch that disagrees, in the PROSE and not just the payload dump',
      msg.startsWith(`epoch ${EPOCH} has `), msg.slice(0, 80));
    check('...and both payloads, so the report is the whole picture, not the winner',
      msg.includes('"' + OTHER + '",60') && msg.includes('"' + OTHER + '",100'), msg);
    // Hand-derived: one voter each, so the tie breaks on the lowest content
    // hash. `sha256:0…15` (the honest one, id 21 = 0x15) is lower than
    // `sha256:0…16` (the rival, 22 = 0x16) as plain strings, so the honest
    // payload wins and OTHER returns at 60 rather than 100.
    check('hand-derived: the tie breaks on the lower content hash, and the sea folds on',
      state.fish.get(OTHER)?.size === 60, state.fish.get(OTHER)?.size);
  } finally {
    sea?.stop();
    restore();
  }
}

// ===========================================================================
// 6. NO CHECKPOINT IS ABSENCE, NOT DISAGREEMENT
//
// The first epoch a room ever has has no predecessor to adopt from. That must
// be silent: a client that reported it would shout on every new room, and a
// client that refused to fold would never start one.
// ===========================================================================
async function noCheckpointIsSkippedCleanly(): Promise<void> {
  console.log('\n6. a room with no checkpoint at all folds quietly');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  const errors: { where: string; err: unknown }[] = [];
  try {
    stub.replies = boundaryRoom();
    sea = makeSea((where, err) => { errors.push({ where, err }); }, undefined, E_END);
    await until(() => stub.calls.getReplies >= 1, 'the first read');
    const state = sea.step(TARGET);
    check('nothing is reported at all', errors.length === 0, errors.map((e) => e.where));
    check('...and the sea still folds — OTHER arrives as a stranger at 92',
      state.fish.get(OTHER)?.size === 92, state.fish.get(OTHER)?.size);
  } finally {
    sea?.stop();
    restore();
  }
}

// ===========================================================================
// 7. ADOPTION SURVIVES LOSING THE RACE WITH THE FIRST FRAME
//
// `chainSea` fires its first `refetch` from the constructor and the browser
// draws the first frame long before it answers, so the ordinary path is: fold
// UNSEEDED for a few hundred ms, then the room arrives. A client that only
// looked for a checkpoint at loop creation would miss it every time.
// ===========================================================================
async function adoptionCatchesUpWhenTheFirstFrameBeatsTheFetch(): Promise<void> {
  console.log('\n7. the first frame beats the first fetch, and the checkpoint is still adopted');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    const honest: Checkpoint = {
      epoch: EPOCH,
      sizes: [[ID, 108], [OTHER, 60]],
      recent: [[ID, ID_BITE_MS, [ID_BITE_MS]]],
    };
    // The checkpoint for epoch E lives in epoch E+1's room — decision 3: a write
    // goes to the room of the fold that will read it, and only E+1's fold ever
    // reads this one.
    stub.replies = [...boundaryRoom(), landedBy(21, ID, encodeCheckpoint(honest, ID), 0, NEXT_ROOM)];

    sea = makeSea(undefined, undefined, TARGET);
    // Synchronously, before the constructor's own fetch can have resolved.
    const first = sea.step(TARGET);
    check('the first frame folds an empty, unseeded sea (the fetch has not landed)',
      first.fish.size === 0, first.fish.size);
    // The constructor's `get_replies` has been ISSUED (the stub counts it the
    // moment the request is made) but not answered, which is exactly the race:
    // the frame loop is drawing before the room exists.
    check('...and knows nothing of anybody — no seed and no log',
      first.fish.size === 0 && first.departed.size === 0,
      { fish: first.fish.size, departed: first.departed.size });

    await until(() => stub.calls.getReplies >= 1, 'the room to arrive');
    const second = sea.step(TARGET);
    check('once the room lands, the checkpoint is adopted after the fact — OTHER is 60',
      second.fish.get(OTHER)?.size === 60, second.fish.get(OTHER)?.size);
    check('...and ID is 98', second.fish.get(ID)?.size === 98, second.fish.get(ID)?.size);
  } finally {
    sea?.stop();
    restore();
  }
}

// ===========================================================================
// 8. THE WAY IN (spec §2.16) — a refusal for want of a voucher reaches the
//    shell as a TYPE, and nothing else does
//
// This is the join `wayIn.test.ts` cannot make on its own: that file proves
// `afterWrite` reads a classification correctly, and `shoalSend.test.ts`
// proves `rpcCall` produces the classification correctly, but neither proves
// that `chainSea` — the only thing in this client that writes — actually
// carries one from the wire to the shell. Task 3's report says plainly that
// `classifySendFailure` had NO CALL SITE. So the whole chain is driven here,
// end to end, through the real `chainSea`:
//
//   node answers -32015  ->  rpcCall throws JsonRpcCallError
//                        ->  classifySendFailure -> kind 'not-sponsored'
//                        ->  onWrite -> afterWrite -> atTheEdge
//
// and the negative alongside it, on the SAME machinery with one number
// changed: a different code must leave the player in open water.
// ===========================================================================

/** Drive one presence write and return the standing the shell would hold, plus
 *  everything `onWrite` reported. `errors` is collected too, because the
 *  developer channel must keep firing — the way in replaces nothing. */
async function writeOnce(
  code: number | null,
): Promise<{ standing: Standing; seen: (SendFailure | null)[]; errors: string[] }> {
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  const seen: (SendFailure | null)[] = [];
  const errors: string[] = [];
  try {
    stub.replies = [landed(1, encodePresence(vecAt(T0, 0), ID), T0)];
    if (code !== null) { stub.rejectSubmit = true; stub.submitErrorCode = code; }
    sea = makeSea((where) => { errors.push(where); }, (f) => { seen.push(f); });
    await until(() => stub.calls.getReplies >= 1, 'the first read');

    sea.publish(vecAt(T1, 64));
    await until(() => seen.length >= 1, 'the write to be reported');

    let standing = OPEN_WATER;
    for (const f of seen) standing = afterWrite(standing, f);
    return { standing, seen, errors };
  } finally {
    sea?.stop();
    restore();
  }
}

async function theGateReachesTheShellAsAType(): Promise<void> {
  console.log('\n8a. a write refused with -32015 puts this client at the edge of the water');
  const { standing, seen, errors } = await writeOnce(-32_015);

  check('the write was reported exactly once', seen.length === 1, seen.length);
  check('...as a failure, not as an acceptance', seen[0] !== null, seen[0]);
  check('...classified `not-sponsored` from the CODE, with no message read anywhere',
    seen[0]?.kind === 'not-sponsored', seen[0]?.kind);
  check('THE WAY IN: the shell\'s standing is at the edge of the water',
    standing.atTheEdge === true, standing);
  check('...and the developer channel still fired too — this adds a channel, it '
    + 'does not replace one', errors.includes('sendPresence'), errors);
}

async function anUnrelatedRefusalIsNotTheWayIn(): Promise<void> {
  console.log('\n8b. THE NEGATIVE: a refusal with any other code leaves them in open water');
  // -32000 is open item 2's own failure — a real rejection, from a reachable
  // node, that has nothing to do with whether anyone has vouched for this
  // swimmer. The ONLY difference from 8a is this number.
  const { standing, seen, errors } = await writeOnce(-32_000);

  check('the write was reported as a failure', seen.length === 1 && seen[0] !== null, seen);
  check('...classified `unknown` — the honest bucket', seen[0]?.kind === 'unknown', seen[0]?.kind);
  check('THE NEGATIVE: the shell does NOT show the way in',
    standing.atTheEdge === false, standing);
  check('...and it is still reported to the developer channel, loudly',
    errors.includes('sendPresence'), errors);
}

async function anAcceptedWriteReportsAcceptance(): Promise<void> {
  console.log('\n8c. a write the node accepts is reported as such, and lifts the edge');
  const { standing, seen, errors } = await writeOnce(null);

  check('the accepted write was reported', seen.length >= 1, seen.length);
  check('...as `null`, which is what "the water took it" looks like',
    seen[0] === null, seen[0]);
  check('nothing went to the developer channel at all', errors.length === 0, errors);

  // The standing folded from an accepted write alone is open water — but the
  // case that matters is a player who WAS at the edge and has just been let in
  // by someone in the water, which is the whole point of spec §2.16's "letting
  // one in is an in-game act". Folded from the edge, the same report lifts it.
  let letIn = afterWrite(AT_THE_EDGE, seen[0] ?? null);
  for (const f of seen.slice(1)) letIn = afterWrite(letIn, f);
  check('a client that was at the edge is in the water the moment a write lands',
    letIn.atTheEdge === false, letIn);
  check('...and one that never was stays where it was', standing.atTheEdge === false, standing);
}

// ===========================================================================
// 9. THE CROSSING — two rooms, one world (plan 4d Task 2)
//
// The room is a function of the hour. A fold for epoch E therefore reads TWO
// rooms, because the fold does not start at the hour: it starts at
// `epochWarmStartMs(E)` — 90 s earlier — and its entry cursor admits everything
// from `admitFloorMs(E)`, 180 s earlier still. All of that is epoch E-1, and
// since Task 1 that is a different post.
//
// THE FAILURE THIS SECTION EXISTS TO CATCH HAS NO SYMPTOM. A client that read
// only the current room would fold a sea missing three minutes of history —
// no error, no warning, nothing missing on screen, just a permanent
// disagreement with everybody, renewed every hour. So the tests below are
// written so that the one-room client FAILS them, and the mutation at the end
// proves it does.
//
// ── THE FIXTURE ────────────────────────────────────────────────────────────
//
// Two swimmers writing across the boundary between E-1 and E. Every entry is
// placed in the room of the hour it was AUTHORED in, which is the rule
// `chainSea` writes by (decision 2), so the fixture states the rule rather than
// assuming it.
//
//   PREV_ROOM (epoch E-1):
//     E_START - 100_000   ID    presence      below the warm start, ABOVE the
//     E_START - 100_000   OTHER presence      admit floor: reachable ONLY by
//                                             reading the previous room
//     E_START -  20_000   ID    presence      inside the warm-up window
//     E_START -  15_000   ID    eat CELL      a bite before the hour, whose
//                                             growth and cooldown cross it
//     E_START -  10_000   OTHER presence
//   ROOM (epoch E):
//     E_START +  5_000    ID    presence
//     E_START +  5_000    OTHER presence
//     E_START + 10_000    OTHER eat CELL_O
//     the checkpoint for epoch E-1                (decision 3: it seeds E, so
//                                                  it lives in E's room)
//
// The 100 s entries are the load-bearing ones. `admitFloorMs(E)` is
// `E_START - 180_000` and `epochWarmStartMs(E)` is `E_START - 90_000`, so an
// entry at -100_000 is admitted, is already expired at the first warm-up tick
// by `PRESENCE_TTL_MS`... no: it is alive for the first warm-up tick and leaves
// a `departed` row, which is precisely why shoalLoop.ts calls that floor EXACT
// rather than conservative. Either way it CHANGES THE FOLD, and it is only in
// the old room.
// ===========================================================================

/** 00:00:30 — the instant the brief names, 30 s into the hour, when the fold
 *  still needs the last 90 s of the hour before it. */
const JUST_AFTER = EPOCH_START + 30_000;
/** 00:05 — long past the warm-up, and still reading the same two rooms. */
const WELL_INTO = EPOCH_START + 300_000;

/**
 * A cell FAR from `CELL` — far enough that neither swimmer's presence stamps
 * the other's bloom.
 *
 * The distance matters and is checked below. `markVisits` stamps every cell
 * within `BLOOM_VISIT_R` (200 cu) of a fish, and `isBloomReady` exempts only
 * the CLAIMANT's own stamps — so two swimmers standing on adjacent cells hold
 * each other's bloom fallow forever and NEITHER can ever eat. Section 4b's
 * fixture wants them adjacent (so they shelter each other); this one wants them
 * apart (so both bites credit and the world is demonstrably not inert).
 */
const CELL_F = cellIndex(1_000, 1_000);
const CENTRE_F = cellCentre(CELL_F);

/** The checkpoint that closes epoch E-1. Hand-built rather than harvested:
 *  what these tests compare is LOGS, and a seed both sides are given equally is
 *  a control rather than a variable. */
const CROSSING_SEED: Checkpoint = {
  epoch: EPOCH - 1,
  sizes: [[ID, 104], [OTHER, 96]],
  recent: [],
};

/** Every reply in the crossing fixture, each in the room of its own hour. */
function crossingReplies(): NodeReply[] {
  return [
    // --- epoch E-1, in the CLOSING hour's room ---------------------------
    landedBy(31, ID, encodePresence(vecAtOn(EPOCH_START - 100_000, CENTRE), ID), 0, PREV_ROOM),
    landedBy(32, OTHER, encodePresence(vecAtOn(EPOCH_START - 100_000, CENTRE_F), OTHER), 0, PREV_ROOM),
    landedBy(33, ID, encodePresence(vecAtOn(EPOCH_START - 20_000, CENTRE), ID), 0, PREV_ROOM),
    landedBy(34, ID, encodeEat(CELL, EPOCH_START - 15_000, ID), 0, PREV_ROOM),
    landedBy(35, OTHER, encodePresence(vecAtOn(EPOCH_START - 10_000, CENTRE_F), OTHER), 0, PREV_ROOM),
    // --- epoch E, in the OPENING hour's room ------------------------------
    landedBy(36, ID, encodePresence(vecAtOn(EPOCH_START + 5_000, CENTRE), ID), 0, ROOM),
    landedBy(37, OTHER, encodePresence(vecAtOn(EPOCH_START + 5_000, CENTRE_F), OTHER), 0, ROOM),
    landedBy(38, OTHER, encodeEat(CELL_F, EPOCH_START + 10_000, OTHER), 0, ROOM),
    // The seed for THIS hour lives in THIS hour's room (decision 3).
    landedBy(39, ID, encodeCheckpoint(CROSSING_SEED, ID), 0, ROOM),
    // Keep-alives, so the sea is still populated at 00:05 and the comparison
    // there is between two worlds rather than between two empty ones.
    landedBy(40, ID, encodePresence(vecAtOn(EPOCH_START + 120_000, CENTRE), ID), 0, ROOM),
    landedBy(41, OTHER, encodePresence(vecAtOn(EPOCH_START + 121_000, CENTRE_F), OTHER), 0, ROOM),
    landedBy(42, ID, encodePresence(vecAtOn(EPOCH_START + 250_000, CENTRE), ID), 0, ROOM),
    landedBy(43, OTHER, encodePresence(vecAtOn(EPOCH_START + 251_000, CENTRE_F), OTHER), 0, ROOM),
    landedBy(44, ID, encodePresence(vecAtOn(EPOCH_START + 290_000, CENTRE), ID), 0, ROOM),
    landedBy(45, OTHER, encodePresence(vecAtOn(EPOCH_START + 291_000, CENTRE_F), OTHER), 0, ROOM),
  ];
}

function theCrossingFixtureGeometryIsWhatItAssumes(): void {
  console.log('\n9. the crossing fixture geometry, before anything depends on it');
  const d2 = (CENTRE.x - CENTRE_F.x) ** 2 + (CENTRE.y - CENTRE_F.y) ** 2;
  check('the two swimmers are far enough apart not to trample each other\'s bloom',
    d2 > BLOOM_VISIT_R2 * 4, { d2, BLOOM_VISIT_R2 });
  check('the entry below the warm start is still ABOVE the admit floor, so it '
    + 'changes the fold and lives only in the previous hour\'s room',
    EPOCH_START - 100_000 < epochWarmStartMs(EPOCH)
    && EPOCH_START - 100_000 >= admitFloorMs(EPOCH)
    && epochOf(EPOCH_START - 100_000) === EPOCH - 1,
    { warmStart: epochWarmStartMs(EPOCH), floor: admitFloorMs(EPOCH) });
}

/**
 * THE PRE-CHANGE FOLD, computed directly rather than through `chainSea`.
 *
 * This is what a single-room client folded before rotation existed: ONE room
 * holding every reply that was ever written, handed whole to the engine for
 * epoch E. `repliesToLog` is the same decoder `chainSea` uses and `foldShoal`
 * is the same fold; the only difference is that nothing here knows what a room
 * is. If the union of two rooms folds to this, rotation changed the storage and
 * not the world.
 */
function singleRoomFold(toMs: number): ShoalState {
  return foldShoal(
    repliesToLog(crossingReplies()),
    toMs,
    { epoch: EPOCH, seed: CROSSING_SEED },
  );
}

async function theCrossingReadsExactlyTwoRooms(): Promise<void> {
  console.log('\n9a. a fold of epoch E reads epoch E-1\'s room and epoch E\'s, and no others');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    stub.replies = crossingReplies();
    sea = makeSea(undefined, undefined, JUST_AFTER);
    await until(() => stub.roomsRead.length >= 2, 'the first pair of reads');

    const asked = new Set(stub.roomsRead);
    check('both rooms of the pair were asked for', asked.has(PREV_ROOM) && asked.has(ROOM),
      [...asked]);
    check('...and NOTHING else was — not E-2, not E+1',
      asked.size === 2, [...asked]);
    // The rule itself, stated where a reader can check it against the reads.
    check('`roomEpochsFor` says exactly that: [E-1, E], oldest first',
      roomEpochsFor(EPOCH)[0] === EPOCH - 1 && roomEpochsFor(EPOCH)[1] === EPOCH
      && roomEpochsFor(EPOCH).length === 2, roomEpochsFor(EPOCH));

    // AND THE OLD ROOM IS NOT DROPPED HALFWAY THROUGH THE HOUR. The admit floor
    // is a function of the EPOCH, so it does not move within one; a client at
    // 00:05 needs the previous room exactly as much as one at 00:00:30.
    const readsBefore = stub.roomsRead.length;
    sea.step(WELL_INTO);
    await until(() => stub.roomsRead.length > readsBefore || stub.calls.getReplies > 0,
      'a later read', 2_000).catch(() => { /* no further read is fine; the set below is what matters */ });
    check('the admit floor does not move within an epoch, so neither does the pair',
      admitFloorMs(EPOCH) === epochWarmStartMs(EPOCH) - PRESENCE_TTL_MS
      && admitFloorMs(EPOCH) === EPOCH_START - 180_000
      && admitFloorMs(EPOCH) > epochStartMs(EPOCH - 1),
      { floor: admitFloorMs(EPOCH), prevStart: epochStartMs(EPOCH - 1) });
  } finally {
    sea?.stop();
    restore();
  }
}

async function theUnionIsThePreChangeFold(): Promise<void> {
  console.log('\n9b. the union of the two rooms folds to the world one room used to');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    stub.replies = crossingReplies();
    sea = makeSea(undefined, undefined, JUST_AFTER);
    await until(() => stub.calls.getReplies >= 2, 'both rooms');
    const union = sea.step(JUST_AFTER);

    // ── NON-DEGENERACY FIRST. An inert world would satisfy every equality
    // below, and equalities between two empty seas prove nothing at all.
    const before = singleRoomFold(JUST_AFTER);
    check('NON-DEGENERACY: both swimmers are in the sea',
      union.fish.size === 2 && union.fish.has(ID) && union.fish.has(OTHER),
      [...union.fish.keys()]);
    check('NON-DEGENERACY: bites were credited — the bloom map is not empty',
      union.bitesTaken.size >= 1, [...union.bitesTaken.entries()]);
    check('NON-DEGENERACY: sizes have really moved off the seed and off START_SIZE',
      union.fish.get(ID)?.size !== 100 && union.fish.get(OTHER)?.size !== 100
      && union.fish.get(ID)?.size !== 104,
      { id: union.fish.get(ID)?.size, other: union.fish.get(OTHER)?.size });
    check('NON-DEGENERACY: every fish has been outside the tension core and is counted',
      union.outsideTicks.size === 2, [...union.outsideTicks.entries()]);
    check('NON-DEGENERACY: and the fold really ran its ticks — hundreds of them, counted',
      Math.max(...union.outsideTicks.values()) > 100, [...union.outsideTicks.values()]);

    // ── THE CLAIM.
    check('THE UNION IS THE OLD LOG: two rooms fold byte-for-byte to what one room did',
      fingerprint(union) === fingerprint(before),
      { union: fingerprint(union), before: fingerprint(before) });

    // ...and at 00:05 as well, where the warm-up is long past but the floor has
    // not moved, so the previous room is still load-bearing.
    const later = sea.step(WELL_INTO);
    check('NON-DEGENERACY: the sea at 00:05 is still populated — this is not two empty worlds',
      later.fish.size === 2 && later.bitesTaken.size >= 1,
      { fish: later.fish.size, bites: [...later.bitesTaken.entries()] });
    check('...and still at 00:05, when the warm-up is long behind but the floor is not',
      fingerprint(later) === fingerprint(singleRoomFold(WELL_INTO)),
      { union: fingerprint(later), before: fingerprint(singleRoomFold(WELL_INTO)) });
  } finally {
    sea?.stop();
    restore();
  }
}

async function readingOnlyTheCurrentRoomDiverges(): Promise<void> {
  console.log('\n9c. THE MUTATION: a client that reads only the current room folds a DIFFERENT sea');
  // This is the agreement test of 9b with one thing changed — the previous
  // hour's room comes back empty, which is exactly what a client that read one
  // room would see. It MUST fail the comparison. If it passed, 9b would be
  // proving nothing: the whole of the crossing would be dead code and the sea
  // would look perfectly healthy without it.
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    stub.replies = crossingReplies().filter((r) => r.parent_id !== PREV_ROOM);
    sea = makeSea(undefined, undefined, JUST_AFTER);
    await until(() => stub.calls.getReplies >= 2, 'both rooms');
    const oneRoom = sea.step(JUST_AFTER);
    const before = singleRoomFold(JUST_AFTER);

    check('MUTATION: without the previous hour\'s room the fold DISAGREES',
      fingerprint(oneRoom) !== fingerprint(before),
      { oneRoom: fingerprint(oneRoom), before: fingerprint(before) });
    // And it disagrees in the way that has no symptom: a full, healthy-looking
    // sea with both swimmers in it, at the wrong sizes.
    check('...while looking entirely healthy — same swimmers, no error, wrong world',
      oneRoom.fish.size === 2 && oneRoom.fish.has(ID) && oneRoom.fish.has(OTHER),
      [...oneRoom.fish.keys()]);
    check('...and specifically loses the bite taken before the hour',
      oneRoom.fish.get(ID)?.size !== before.fish.get(ID)?.size,
      { oneRoom: oneRoom.fish.get(ID)?.size, before: before.fish.get(ID)?.size });
  } finally {
    sea?.stop();
    restore();
  }
}

async function aJoinerInTheWarmUpSeesTheSameSea(): Promise<void> {
  console.log('\n9d. a client that joins at 00:00:30 and one that joins at 00:05 agree');
  const { stub, restore } = installStub();
  const seas: ChainSea[] = [];
  try {
    stub.replies = crossingReplies();

    // EARLY — opens 30 s into the hour, while the fold still depends on the
    // previous room's tail, and keeps running to 00:05.
    const early = makeSea(undefined, undefined, JUST_AFTER);
    seas.push(early);
    await until(() => stub.calls.getReplies >= 2, 'the early client\'s read');
    early.step(JUST_AFTER);
    const earlyState = early.step(WELL_INTO);

    // LATE — has never seen 00:00:30 at all and opens straight at 00:05.
    const readsBefore = stub.calls.getReplies;
    const late = makeSea(undefined, undefined, WELL_INTO);
    seas.push(late);
    await until(() => stub.calls.getReplies > readsBefore + 1, 'the late client\'s read');
    const lateState = late.step(WELL_INTO);

    check('NON-DEGENERACY: the late client folded a populated sea',
      lateState.fish.size === 2 && lateState.bitesTaken.size >= 1,
      { fish: lateState.fish.size, bites: [...lateState.bitesTaken.entries()] });
    check('a joiner inside the first 90 s and one at 00:05 fold identical worlds',
      fingerprint(earlyState) === fingerprint(lateState),
      { early: fingerprint(earlyState), late: fingerprint(lateState) });
    check('...and both are the pre-change single-room fold',
      fingerprint(lateState) === fingerprint(singleRoomFold(WELL_INTO)),
      { late: fingerprint(lateState), before: fingerprint(singleRoomFold(WELL_INTO)) });
  } finally {
    for (const s of seas) s.stop();
    restore();
  }
}

async function everyWriteGoesToTheRoomOfItsOwnHour(): Promise<void> {
  console.log('\n9e. a write straddling the boundary goes to the room of the hour it was AUTHORED in');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    stub.replies = crossingReplies();
    // The window is 30 s into epoch E and publishes a vector it authored 500 ms
    // BEFORE the boundary — which is exactly what a mine that took a second
    // produces, and the case the brief calls the straddling write.
    sea = makeSea(undefined, undefined, JUST_AFTER);
    await until(() => stub.calls.getReplies >= 2, 'both rooms');

    sea.publish(vecAtOn(EPOCH_START - 500, CENTRE));
    await until(() => stub.submitted.length >= 1, 'the straddling write');
    check('a vector authored before the boundary goes into the CLOSING hour\'s room',
      stub.submitted[0]?.parent === PREV_ROOM,
      { got: stub.submitted[0]?.parent, prev: PREV_ROOM, now: ROOM });

    // ...and one authored after it goes into the opening hour's.
    sea.publish(vecAtOn(EPOCH_START + 20_000, CENTRE));
    await until(() => stub.submitted.length >= 2, 'the ordinary write');
    check('...and one authored after the boundary goes into the OPENING hour\'s',
      stub.submitted[1]?.parent === ROOM,
      { got: stub.submitted[1]?.parent, now: ROOM });

    // NON-DEGENERACY: the two rooms really are different, so the pair of checks
    // above is discriminating rather than accidentally true.
    check('NON-DEGENERACY: those are two different rooms', PREV_ROOM !== ROOM);

    // AND NOTHING IS LOST. The straddler landed in a room every client folding
    // epoch E is reading for the whole hour — that is what decision 1 buys, and
    // it is why placing by authoring time costs nothing.
    check('the room it landed in is one of the pair a fold of epoch E reads',
      roomEpochsFor(EPOCH).includes(EPOCH - 1), roomEpochsFor(EPOCH));
  } finally {
    sea?.stop();
    restore();
  }
}

async function everyClientMintsItsOwnHour(): Promise<void> {
  console.log('\n9f. every client mints the hour it needs, and the one after it');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    // A NODE THAT HAS NEVER HEARD OF THIS GAME. No replies anywhere, no room
    // post, nobody played last hour — the case the brief requires to work
    // without depending on any particular client being online.
    stub.replies = [];
    sea = makeSea(undefined, undefined, JUST_AFTER);
    // Bounded, and a TIMEOUT IS A FAILED CHECK rather than a thrown run: the
    // interesting mutation here (drop the ahead-mint) makes the second mint
    // never happen, and a suite that died of a timeout would report that as an
    // error rather than as the check it is.
    const bothMinted = await until(() => stub.minted.length >= 2, 'both mints', 10_000)
      .then(() => true).catch(() => false);

    check('the hour being folded is minted', stub.minted.some(
      (m) => m.body === `room:shoal:v1:main:${EPOCH}`), stub.minted.map((m) => m.body));
    check('...and the NEXT hour, ahead of the boundary, so a rollover never waits on a mine',
      bothMinted && stub.minted.some((m) => m.body === `room:shoal:v1:main:${EPOCH + 1}`),
      stub.minted.map((m) => m.body));
    check('every mint carries the constant title and this water\'s own space',
      stub.minted.every((m) => m.title === 'The Shoal' && m.space === WATER.spaceId),
      stub.minted);
    // NOT the previous hour: this client never writes into it (its own first
    // vector is authored now), so minting it would be a post nobody needs.
    check('the PREVIOUS hour is not minted — nothing this client writes belongs there',
      !stub.minted.some((m) => m.body === `room:shoal:v1:main:${EPOCH - 1}`),
      stub.minted.map((m) => m.body));
    // AND AN HOUR NOBODY PLAYED COSTS NOTHING. `get_replies` on a parent that
    // does not exist answers with no replies rather than failing
    // (methods.rs:9628-9640), so the previous room simply reads empty.
    const state = sea.step(JUST_AFTER);
    check('an hour nobody played leaves an empty previous room and a working sea',
      state.fish.size === 0 && state.epoch === EPOCH,
      { fish: state.fish.size, epoch: state.epoch });

    // NON-DEGENERACY: minting is not a per-frame Argon2id loop. Twelve more
    // frames inside the same hour must add no mints at all.
    const after = stub.minted.length;
    for (let i = 1; i <= 12; i++) sea.step(JUST_AFTER + i * 1_000);
    await new Promise((r) => setTimeout(r, 50));
    check('NON-DEGENERACY: twelve more frames in the same hour mint nothing further',
      stub.minted.length === after, { before: after, after: stub.minted.length });

    // ...and crossing hours does not accumulate either. A window left open for
    // a week must not carry a week of derived room ids, mint promises and
    // failure stamps: `noteEpoch` prunes everything below `epoch - 1`, which is
    // the oldest room `roomEpochsFor` can ever ask for. Observed through the
    // WRITE PATH rather than by reaching into the closure — a write into a
    // pruned hour re-derives its room correctly, which is the only thing the
    // prune could have broken.
    for (let h = 1; h <= 3; h++) {
      sea.step(epochStartMs(EPOCH + h) + 1_000);
      // The ahead-mint is chained behind the current hour's, so give the two
      // promises their turns before stepping into the next hour.
      await until(() => stub.minted.some((m) => m.body === `room:shoal:v1:main:${EPOCH + h + 1}`),
        `the mint for hour +${h + 1}`, 10_000).catch(() => {});
    }
    const mintedByThen = stub.minted.length;
    check('...and three hours later the client has minted each hour it reached, once each',
      mintedByThen === after + 3
      && new Set(stub.minted.map((m) => m.body)).size === mintedByThen,
      { after, mintedByThen, bodies: stub.minted.map((m) => m.body) });
    const submittedBefore = stub.submitted.length;
    sea.publish(vecAtOn(epochStartMs(EPOCH + 3) + 2_000, CENTRE));
    await until(() => stub.submitted.length > submittedBefore, 'a write three hours on', 10_000)
      .catch(() => {});
    check('a write in the fourth hour still names that hour room, after three prunes',
      stub.submitted[submittedBefore]?.parent === (await roomIdIn(WATER, EPOCH + 3)),
      { got: stub.submitted[submittedBefore]?.parent, want: await roomIdIn(WATER, EPOCH + 3) });
  } finally {
    sea?.stop();
    restore();
  }
}

async function theCheckpointGoesIntoTheOpeningRoom(): Promise<void> {
  console.log('\n9g. the checkpoint is published into the room of the hour it OPENS');
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    stub.landSubmissions = true;
    stub.replies = boundaryRoom();
    sea = makeSea();
    await until(() => stub.calls.getReplies >= 2, 'the first pair of reads');

    sea.step(E_END - TICK_MS);
    sea.step(TARGET); // cross it
    await until(() => stub.submitted.length >= 1, 'the checkpoint');

    check('NON-DEGENERACY: what was published IS a checkpoint for the closing hour',
      stub.submitted[0]?.body.startsWith(`v1|checkpoint|${ID.slice(0, 16)}|{"epoch":${EPOCH},`),
      stub.submitted[0]?.body.slice(0, 60));
    check('THE CARRY: it went into epoch E+1\'s room — the hour it seeds',
      stub.submitted[0]?.parent === NEXT_ROOM,
      { got: stub.submitted[0]?.parent, opening: NEXT_ROOM, closing: ROOM });
    check('NON-DEGENERACY: and NOT into the closing hour\'s room, which is a different post',
      stub.submitted[0]?.parent !== ROOM && ROOM !== NEXT_ROOM);

    // WHY IT MATTERS, DEMONSTRATED RATHER THAN ARGUED: a joiner in epoch E+1
    // whose read of the PREVIOUS room fails outright still finds the seed,
    // because the seed is in the room it is definitely reading. Under the
    // closing-room rule the same joiner folds unseeded and puts everyone back
    // at START_SIZE — Blocker 12, returning through a fetch failure.
    const seeds = stub.replies.filter(
      (r) => r.body.startsWith('v1|checkpoint|') && r.parent_id === NEXT_ROOM);
    check('...so a client reading only epoch E+1\'s room can still adopt it',
      seeds.length === 1, seeds.map((r) => r.parent_id));
  } finally {
    sea?.stop();
    restore();
  }
}

async function aFailedMintDoesNotSwallowTheWrite(): Promise<void> {
  console.log('\n9h. a mint the node refuses does not take the WRITE down with it');
  // THE DEFECT THIS PINS, found in self-review of this very branch. The write
  // path used to `await ensureRoom(...)` and let a rejection propagate, which
  // is wrong twice over:
  //
  //  - everybody mints, so the second client into an hour is ordinarily minting
  //    a post a peer has already made, and a failure of that redundant call
  //    would drop a move for a reason that does not exist;
  //  - `submit_post` runs the SAME `check_identity_sponsored` as `submit_reply`
  //    (methods.rs:2204), so an unsponsored player's mint fails with the same
  //    -32015 — and if that cancelled the write, `submit_reply` would never be
  //    reached at all. `onWrite` would never fire, and a write that goes
  //    through is the ONLY evidence this client can ever have that somebody has
  //    let it in (`wayIn.ts`). The silent permanent lockout, from a new
  //    direction.
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  const errors: string[] = [];
  const seen: (SendFailure | null)[] = [];
  try {
    stub.rejectMint = true;
    stub.replies = crossingReplies();
    sea = makeSea((where) => { errors.push(where); }, (f) => { seen.push(f); }, JUST_AFTER);
    await until(() => stub.calls.getReplies >= 2, 'both rooms');

    // THE STRADDLING WRITE, which is the sharpest case available and a real
    // one: a vector authored 500 ms before the boundary goes into the CLOSING
    // hour's room — a room THIS client has never minted (9f: it mints the hour
    // it is in and the next, never the one behind). So this is the mint's very
    // first attempt for that epoch, with no cooldown standing in front of it,
    // and it is refused.
    sea.publish(vecAtOn(EPOCH_START - 500, CENTRE));
    // Bounded, and A TIMEOUT IS A FAILED CHECK: the mutation this section
    // exists for (let the mint's rejection propagate) makes the write never
    // happen at all, and a suite that died of a timeout would report that as an
    // error rather than as the check it is.
    const reached = await until(() => stub.calls.submit >= 1, 'the write', 10_000)
      .then(() => true).catch(() => false);

    check('the write REACHED the node even though the mint was refused',
      reached && stub.submitted.length === 1, stub.submitted.length);
    check('...into the room this client DERIVES for that hour, not into nothing',
      stub.submitted[0]?.parent === PREV_ROOM,
      { got: stub.submitted[0]?.parent, want: PREV_ROOM });
    await until(() => seen.length >= 1, 'the write outcome', 10_000).catch(() => {});
    check('...and its outcome reached the way-in channel, which is the only signal that can '
      + 'ever lift the edge of the water', seen[0] === null, seen[0]);
    check('the refused mint is still REPORTED, loudly, on the developer channel',
      errors.includes('mintRoom'), errors);

    // NON-DEGENERACY: the mint really was attempted and really was refused.
    // Without this the checks above would pass for a client that had stopped
    // minting altogether.
    check('NON-DEGENERACY: a mint really was attempted and really was refused',
      stub.minted.length === 0 && errors.filter((e) => e === 'mintRoom').length >= 1, errors);
  } finally {
    sea?.stop();
    restore();
  }
}

async function aRefusedMintIsNotRetriedOnEveryWrite(): Promise<void> {
  console.log('\n9i. a refused mint is not re-mined on every single write');
  // A CPU bound, not a correctness one. A refused player writes every
  // MAX_EMIT_GAP_MS forever by design, and a Post is four times a Reply's
  // expected work — so a mint retried per write would make being refused cost
  // five mines where it costs one. `MINT_RETRY_MS` is the cooldown, and it is
  // `PRESENCE_TTL_MS` rather than a number somebody liked.
  const { stub, restore } = installStub();
  let sea: ChainSea | null = null;
  try {
    stub.rejectMint = true;
    stub.replies = crossingReplies();
    sea = makeSea(undefined, undefined, JUST_AFTER);
    await until(() => stub.calls.getReplies >= 2, 'both rooms');
    const postsAfterOpen = stub.calls.submitPost;
    check('NON-DEGENERACY: opening the sea did attempt a mint', postsAfterOpen >= 1, postsAfterOpen);

    // Four writes inside the cooldown. None of them may mine another Post.
    for (let i = 1; i <= 4; i++) {
      sea.publish(vecAtOn(JUST_AFTER + i * 1_000, CENTRE));
      await until(() => stub.calls.submit >= i, `write ${i}`);
    }
    check('four writes inside the cooldown mined no further room posts',
      stub.calls.submitPost === postsAfterOpen,
      { before: postsAfterOpen, after: stub.calls.submitPost });
    check('...while every one of the four writes still went out',
      stub.calls.submit >= 4, stub.calls.submit);

    // And past the cooldown it tries again — a transient failure must not lock
    // an hour out for the life of the window.
    sea.publish(vecAtOn(JUST_AFTER + MINT_RETRY_MS + 1_000, CENTRE));
    await until(() => stub.calls.submitPost > postsAfterOpen, 'the retry past the cooldown');
    check('a write past the cooldown DOES try to mint again', stub.calls.submitPost > postsAfterOpen,
      { before: postsAfterOpen, after: stub.calls.submitPost });
  } finally {
    sea?.stop();
    restore();
  }
}

async function main(): Promise<void> {
  wildSeedFromIsPinnedAndAgreesAcrossShells();
  await landedEatMustNotRetireAPendingVector();
  await landedVectorMustNotRetireAPendingEat();
  await aRejectedWriteIsRolledBack();
  await anUnansweredRowExpires();
  fixtureGeometryIsWhatTheDerivationAssumes();
  await aClientThatCrossesTheBoundaryPublishesAndAJoinerAdopts();
  await twoCheckpointsForOneEpochAreReported();
  await noCheckpointIsSkippedCleanly();
  await adoptionCatchesUpWhenTheFirstFrameBeatsTheFetch();
  await theGateReachesTheShellAsAType();
  await anUnrelatedRefusalIsNotTheWayIn();
  await anAcceptedWriteReportsAcceptance();
  theCrossingFixtureGeometryIsWhatItAssumes();
  await theCrossingReadsExactlyTwoRooms();
  await theUnionIsThePreChangeFold();
  await readingOnlyTheCurrentRoomDiverges();
  await aJoinerInTheWarmUpSeesTheSameSea();
  await everyWriteGoesToTheRoomOfItsOwnHour();
  await everyClientMintsItsOwnHour();
  await theCheckpointGoesIntoTheOpeningRoom();
  await aFailedMintDoesNotSwallowTheWrite();
  await aRefusedMintIsNotRetriedOnEveryWrite();

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
