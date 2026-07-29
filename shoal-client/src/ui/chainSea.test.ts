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
import { encodeCheckpoint, encodeEat, encodePresence } from '../lib/shoalWire';
import { cellCentre, cellIndex } from '../lib/bloom';
import { epochEndMs, epochStartMs, epochOf } from '../lib/epoch';
import { bodiesOf } from '../lib/shoalEngine';
import { shelterOf } from '../lib/shelter';
import { fingerprint } from '../lib/shoalFixtures';
import {
  EAT_R2, PRESENCE_TTL_MS, SHELTER_R2, SHELTER_THRESHOLD, TICK_MS,
} from '../lib/shoalConst';
import type { NodeReply } from '../lib/shoalRoom';
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
  /** Every body the sea submitted, in order, with the author it claimed. */
  submitted: { body: string; author: string }[];
  /**
   * When true, an accepted `submit_reply` is APPENDED to `replies`, so the
   * next `get_replies` hands it back the way a real node does once the write
   * has landed. Off by default: sections 1-3 below depend on a submitted row
   * never coming back.
   */
  landSubmissions: boolean;
  calls: { getReplies: number; submit: number; getInfo: number };
}

function installStub(): { stub: Stub; restore: () => void } {
  const g = globalThis as unknown as Record<string, unknown>;
  const realFetch = g.fetch;
  const realWs = g.WebSocket;

  const stub: Stub = {
    replies: [],
    rejectSubmit: false,
    submitted: [],
    landSubmissions: false,
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
    const req = JSON.parse(init.body) as {
      method: string; id: number; params?: { body?: string; author_id?: string };
    };
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
      const body = req.params?.body ?? '';
      const author = req.params?.author_id ?? '';
      stub.submitted.push({ body, author });
      // A distinct id per accepted write, the way a real node derives one from
      // the body. `landSubmissions` decides whether the room then serves it.
      const contentId = `sha256:${(0xf000 + stub.submitted.length).toString(16).padStart(64, '0')}`;
      if (stub.landSubmissions) {
        stub.replies = [...stub.replies, {
          content_id: contentId, author_id: author, body,
          parent_id: ROOM, block_height: null, created_at: 0,
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

function makeSea(onError?: (where: string, err: unknown) => void): ChainSea {
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
  check('the same room derives the same seed every time',
    wildSeedFrom(SPACE, ROOM) === wildSeedFrom(SPACE, ROOM), wildSeedFrom(SPACE, ROOM));
  check('two different rooms in the same space derive different seeds',
    wildSeedFrom(SPACE, ROOM) !== wildSeedFrom(SPACE, ROOM + 'x'),
    { a: wildSeedFrom(SPACE, ROOM), b: wildSeedFrom(SPACE, ROOM + 'x') });
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
function landedBy(n: number, author: string, body: string, createdAt: number): NodeReply {
  return {
    content_id: `sha256:${n.toString(16).padStart(64, '0')}`,
    author_id: author,
    body,
    parent_id: ROOM,
    block_height: null,
    created_at: createdAt,
  };
}

/** The room, before anyone publishes anything. */
function boundaryRoom(): NodeReply[] {
  return [
    landedBy(11, OTHER, encodePresence(vecAtOn(EPOCH_START + 1_000, CENTRE_O), OTHER), 0),
    landedBy(12, OTHER, encodeEat(CELL_O, EPOCH_START + 1_500, OTHER), 0),
    landedBy(13, OTHER, encodePresence(vecAtOn(EPOCH_START + 2_000, CENTRE_O), OTHER), 0),
    landedBy(14, ID, encodePresence(vecAtOn(E_END - 5_000, CENTRE), ID), 0),
    landedBy(15, ID, encodeEat(CELL, ID_BITE_MS, ID), 0),
    // Epoch E+1: OTHER comes back.
    landedBy(16, OTHER, encodePresence(vecAtOn(E_END + 2_000, CENTRE_O), OTHER), 0),
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
    const crossed = a.step(TARGET);
    const crossedPrint = fingerprint(crossed);
    check('A rolled into the next epoch', crossed.epoch === EPOCH + 1, crossed.epoch);

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
    const b = makeSea();
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
    const c = makeSea();
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
      landedBy(21, ID, encodeCheckpoint(honest, ID), 0),
      landedBy(22, OTHER, encodeCheckpoint(rival, OTHER), 0),
    ];

    sea = makeSea((where, err) => { errors.push({ where, err }); });
    await until(() => stub.calls.getReplies >= 1, 'the first read');
    const state = sea.step(TARGET);

    const diverge = errors.filter((e) => e.where === 'checkpointDivergence');
    check('the divergence is REPORTED, exactly once', diverge.length === 1,
      errors.map((e) => e.where));
    const msg = diverge[0] === undefined ? '' : String((diverge[0].err as Error).message ?? '');
    check('...naming the epoch that disagrees', msg.includes(String(EPOCH)), msg);
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
    sea = makeSea((where, err) => { errors.push({ where, err }); });
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
    stub.replies = [...boundaryRoom(), landedBy(21, ID, encodeCheckpoint(honest, ID), 0)];

    sea = makeSea();
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

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
