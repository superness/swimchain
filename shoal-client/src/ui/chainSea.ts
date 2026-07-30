/**
 * A `Sea` backed by a REAL room on a REAL node — the substitution
 * `demoSea.ts` has been pointing at since Task 5:
 *
 *     publish: (vec, say) => void sendPresence(ctx, vec, say)
 *
 * This is what makes two windows on two different nodes show one sea. It is
 * the only file in the UI that writes to the chain, and it exists for Task 7's
 * capture: `scripts/two-client-smoke.ts` proves the machinery in text, and this
 * is the same machinery with a canvas in front of it.
 *
 * DISPLAY SIDE, like the rest of `src/ui/` — it may hold a socket, a timer and
 * a promise. Nothing here leaks into `src/lib/`, which stays clock-free.
 *
 * ## Two logs, not one
 *
 * `remote` is what the node last told us. `pending` is what this client has
 * published and the node has not handed back yet. They are folded together,
 * and a pending entry is retired the moment the same (id, ms, KIND) shows up
 * in `remote`.
 *
 * That is not belt-and-braces, it is the only way the player's own fish moves
 * at all: a write is mined (Argon2id), signed, submitted, gossiped and only
 * then merged into `get_replies`. Measured end to end by the two-node smoke,
 * the gap between authoring a vector and being able to read it back is
 * hundreds of milliseconds even on a local regtest node — several frames of a
 * fish that had visibly stopped responding. The optimistic entry is folded by
 * the same engine, from the same vector, so when the real one lands nothing
 * moves.
 *
 * Matching on `(id, ms)` rather than on the content id is deliberate: the
 * content id is `sha256` of the encoded body and is only known once the node
 * answers, whereas `ms` is the authoring instant this client chose and
 * `shoalEmit`'s one-clock rule guarantees no honest client authors two
 * PRESENCE bodies at the same `ms` (see `shouldEmit`'s header).
 *
 * `kind` HAS TO BE PART OF THAT KEY, and leaving it out was a real defect,
 * not an over-specification. `shouldEmit`'s one-clock rule covers presences
 * only: an eat claim is authored from the SAME `authorMs` in the same frame
 * (App.tsx steps 3 and 5 both use it), which is routine rather than exotic.
 * Without `kind` the landing vector retires the un-landed eat claim and the
 * landing eat claim retires the un-landed vector — each one deleting the
 * other's optimistic row, so the swimmer's own fish snaps back to its
 * previous vector, or its bite un-credits, for a whole refetch cycle. The
 * two are different verbs at one instant and nothing about one says anything
 * about the other.
 *
 * ## An optimistic row is a claim, and a claim can be withdrawn
 *
 * A pending row is a promise that a write is on its way. THREE THINGS CAN
 * HAPPEN TO IT, and until this branch only the first was handled:
 *
 *  1. it lands — `refetch` sees it and retires it (above);
 *  2. the write is REJECTED — `sendPresence`/`sendEat` throws (no sponsor, a
 *     node that has stopped answering, a malformed body). The row is rolled
 *     back by `withdraw` below;
 *  3. the write neither lands nor visibly fails — a submission the node
 *     accepted and then purged (open item 2's "author not authorized in
 *     space" is exactly this shape, and it is silent). The row is expired by
 *     `PENDING_TTL_MS`.
 *
 * Leaving 2 and 3 unhandled was not cosmetic. A pending row can only ever be
 * retired by a matching entry in `remote`, so one that will never arrive
 * stays FOREVER: the client folds a claim nobody else has, its own size grows
 * on a bite the world did not credit, and because `advance` seeds the next
 * epoch from its own checkpoint the phantom crosses every hour boundary while
 * every peer shows the true value.
 *
 * WITHDRAWING A ROW ALSO HAS TO UNDO THE FOLD, which is why `withdraw` drops
 * the loop rather than only splicing the array. By the time a write rejects,
 * mining and a round trip have gone by and `advance` has long since admitted
 * the row into `loop.appliedHashes` and `loop.ordered` — removing it from
 * `pending` alone would leave the phantom in the world and change nothing on
 * screen. `createLoop(loop.epoch, loop.seed)` re-enters through the same
 * seeded warm-up path a cold joiner and a rollover both use (shoalLoop.ts
 * section 4: there is exactly one way to start an epoch), and the next
 * `step` re-folds the corrected log. It costs one bounded epoch replay —
 * the same price `advance` already pays for any entry that lands behind its
 * cursor — and it is paid only when a write actually failed.
 *
 * ## The hour boundary: publish, and adopt (spec §3.9 points 4 and 5)
 *
 * This is where open item 12 — Blocker 12 — is closed. `advance` returns
 * `{ loop, rolled }`, and `rolled` used to be dropped here while `createLoop`
 * was seeded a hard `null`. Both halves of the mechanism existed and neither
 * was reachable, so a client that had been running through an hour boundary
 * kept every swimmer's accumulated size (`advance` seeds itself from its own
 * `rolled` internally) while a client that joined after folded an UNSEEDED
 * epoch and saw everyone back at START_SIZE. Size feeds shelterWeight ->
 * shelterOf -> isExposed -> selectTaken, so the two disagreed about WHO THE
 * SHARK EATS, and spec §2.7's "you return the size you left" was false across
 * any reload that crossed an hour.
 *
 * THREE THINGS HAPPEN NOW, and each is one line of policy:
 *
 *  1. **Publish.** A non-null `rolled` is written to the room, by every client,
 *    every hour — see `publishCheckpoint` for what that costs and what it buys.
 *  2. **Adopt.** Before the first fold, and again on every refetch until it
 *     succeeds, the room's checkpoints are weighed by `adoptCheckpoint`
 *     (adopt.ts) and the winner seeds `createLoop`. Retrying is not belt and
 *     braces: the constructor's own fetch has not answered by the first frame,
 *     so the ordinary cold start adopts LATE. See `adoptInto`.
 *  3. **Report.** Two different payloads for one epoch is a detected
 *     divergence, and it goes out through the same `onError` channel as every
 *     other failure rather than being resolved in silence. See
 *     `describeDivergence`, which is careful about what a difference does and
 *     does not prove.
 *
 * A checkpoint never touches `pending` and never touches the fold. It is not a
 * `LogEntry` (shoalWire.ts), `splitRoomReplies` keeps it out of the log by
 * construction, and this client is already folding from the same value it
 * published — so there is no optimistic row here to withdraw and nothing to
 * roll back if the write fails.
 *
 * ## THE CROSSING: two rooms, one world (plan 4d Task 2)
 *
 * The room is a function of the hour (`shoalRoom.ts`, Task 1). This file is
 * where that becomes something a client actually plays in, and it is three
 * decisions.
 *
 * ### 1. WHICH ROOMS ARE READ — the epoch being folded, and the one before it
 *
 * Always two, for the whole hour. `water.roomEpochsFor` carries the argument in
 * full and the proof that the union is the same log a single-room client
 * folded; the short version is that a fold for epoch *E* begins 90 s BEFORE the
 * hour and admits entries from 180 s before it, all of which are now in another
 * room — and a fold missing that prefix cannot detect it. The old room is
 * dropped at the instant this client rolls to *E+1* and not a millisecond
 * earlier, because the admit floor is a function of the epoch and does not move
 * within it.
 *
 * ### 2. WHICH ROOM A WRITE GOES INTO — the room of the fold that will read it
 *
 * A move is placed by its OWN authoring instant: `epochOf(vec.t)` for a vector,
 * `epochOf(ms)` for an eat claim. Never by the wall clock at submit time, and
 * that distinction is real rather than theoretical — mining is Argon2id and the
 * measured median for one write is 1.6 s (seaChoice.ts), so a vector authored
 * at 23:59:59.5 routinely LANDS in the next hour.
 *
 * Placing by the authoring instant is what makes the invariant
 * `room(E) = { e : epochOf(e.ms) = E }` true, and that invariant is the whole
 * of the union proof. Placing by landing time would make a room's contents a
 * function of each writer's CPU, which is not a property of the entry at all
 * and could not be reasoned about by anybody.
 *
 * **Nothing is lost across the boundary.** The straddling write lands in room
 * *E-1* after this client has moved to room *E* — and every client folding
 * epoch *E* is reading room *E-1* anyway, for the whole hour, because of
 * decision 1. So the write is folded by exactly the clients that should fold
 * it. The one client that could lose it is one reading only the current room,
 * which is the mutation this task's agreement test is verified against.
 *
 * A write is only ever submitted to a room this client was PRESENT in, so it is
 * a room this client has already minted (decision 3): a joiner's first authored
 * vector carries the joining instant, which is in the epoch it joined.
 *
 * ### 3. THE CHECKPOINT GOES IN THE OPENING ROOM
 *
 * `advance` hands back `rolled` at the boundary between *E-1* and *E*. It is
 * published into room ***E*** — the hour it opens — not room *E-1*, the hour it
 * summarises. Both are defensible and the argument for the closing room is real:
 * a checkpoint is a statement ABOUT epoch *E-1*, and anyone verifying it against
 * the log it summarises would find both in one place.
 *
 * The opening room wins on three counts:
 *
 *  - **It is the same rule as decision 2.** A checkpoint is read by exactly one
 *    fold — epoch *E*'s, as its seed (`adoptCheckpoint` takes only `epoch - 1`
 *    payloads, and `foldShoal` REFUSES a seed from any other epoch). "The room
 *    of the fold that will read it" is room *E*. No second placement rule.
 *  - **The seed survives a client that reads one room.** A joiner whose fetch of
 *    the previous room fails, is slow, or has been truncated still finds the
 *    seed in the room it is definitely reading. Under the closing-room rule that
 *    same joiner folds UNSEEDED and puts every swimmer back at `START_SIZE` —
 *    Blocker 12 returning, silently, through a fetch failure. The failure mode
 *    is asymmetric and this is the safe side of it.
 *  - **Co-location buys nothing.** A verifier re-folding epoch *E-1* needs room
 *    *E-2* as well (same warm-up rule), so it is reading two rooms either way.
 *
 * Task 1's review flagged (C2) that checkpoints did not survive the crossing at
 * all. This is what closes it, and `adoptCheckpoint`'s epoch filter is what
 * makes it exact: room *E* holds seeds for *E* and nothing else.
 *
 * ### AND WHO MINTS THE HOUR'S ROOM
 *
 * Every client, every hour, idempotently — see `mintRoom` for why a repeat is
 * safe and why it is instant for the minter. `ensureRoom` below fires once per
 * epoch for the current hour AND the next one, so a rollover never waits on a
 * mine, and the write path re-attempts on demand if a mint failed. Nothing
 * depends on any particular client being online, and an hour nobody played
 * costs nothing: the next hour's joiner mints its own room and reads an empty
 * previous one (`get_replies` on a parent that does not exist returns no
 * replies rather than failing).
 *
 * ### A ROTATION IS INVISIBLE, WHICH IS BINDING
 *
 * Spec §1.1 and this plan's own constraint: nobody should ever learn the sea
 * has hours. Two things would have announced it and neither does. The fold
 * already crosses a boundary without a visible seam (`advance` re-enters through
 * the same warm-up path a cold joiner uses, seeded by the checkpoint), and the
 * WILD SHOAL — which would otherwise re-roll every ambient fish on the stroke of
 * the hour, because its seed used to be the room's content id — is now seeded
 * from `roomFamilyKey`, which is a function of the water and not of the hour.
 *
 * ## The event races the read
 *
 * A `content_new` notification means "something happened", NOT "the log now
 * contains it". The two-node smoke measured the node publishing the gossip
 * event immediately after `block_builder.add_action` while `get_replies` still
 * answered without it for a few hundred ms. So a refetch triggered by an event
 * is followed by a second one a moment later; `startLive`'s own poll heartbeat
 * would eventually rescue it either way, but "eventually" here means up to
 * `DEFAULT_POLL_INTERVAL_MS`, which is far too long to watch someone swim.
 *
 * ## Failure is silent to the sea, loud to the caller
 *
 * A failed write, a node that stops answering, a room that has outgrown
 * `ROOM_FETCH_LIMIT` — none of them may throw into the frame loop, because
 * there is nothing the frame loop could do about it and a thrown error would
 * black out the window. They go to `onError`, and the last good log keeps
 * being folded. There is no player-facing copy here (nor anywhere in
 * `src/lib/`); the shell decides what, if anything, to say.
 *
 * ## A write's outcome is a second channel, and it also reports SUCCESS
 *
 * `onError` cannot carry the one fact spec §2.16 needs. A newcomer nobody has
 * vouched for is refused at ingestion (`check_identity_sponsored`,
 * src/rpc/methods.rs:753) and Task 3 classified that refusal by its numeric
 * code; but being LET IN is an in-game act another player performs while this
 * window is open, and the only evidence of it here is a write that stops
 * failing. An error channel structurally cannot report that.
 *
 * So `onWrite` fires once per attempted write — `null` for accepted, the typed
 * `SendFailure` for refused — and `wayIn.ts` folds the two into a standing.
 * This file draws no conclusion from the kind and holds no copy.
 */
import { advance, createLoop, type LoopState } from '../lib/shoalLoop';
import { epochOf } from '../lib/epoch';
import { fetchRooms } from '../lib/shoalRoom';
import { roomEpochsFor, roomFamilyKey, roomIdIn, roomTextIn, type Water } from '../lib/water';
import { adoptCheckpoint, type Adoption } from '../lib/adopt';
import { DEFAULT_POLL_INTERVAL_MS, startLive } from '../lib/shoalLive';
import {
  classifySendFailure, mintRoom, powProfileFor, sendCheckpoint, sendEat, sendPresence,
  type SendCtx, type SendFailure, type SignFn,
} from '../lib/shoalSend';
import { PRESENCE_TTL_MS } from '../lib/shoalConst';
import type { RpcAuth } from '../lib/shoalRpc';
import type { CheckpointEntry } from '../lib/shoalWire';
import type { LogEntry, ShoalState, Vec } from '../lib/shoalTypes';
import { speechFrom, wildSeedFrom, type Sea } from './demoSea';

export interface ChainSeaConfig {
  readonly auth: RpcAuth;
  /**
   * The water — the space AND the name every room id is derived from, produced
   * together by `water.waterNamed` (see that module on why they are one value
   * and not two strings).
   *
   * IT REPLACES `spaceId` + `roomContentId`, and the room is gone from this
   * interface entirely rather than being kept as "the current one": the room is
   * a function of the hour now, so any single room named at construction time
   * would be a lie by the next boundary at the latest.
   */
  readonly water: Water;
  /**
   * The wall clock when this sea was built — the ONLY reason this file needs
   * one at all before its first frame, and it is a parameter rather than a
   * `Date.now()` for the same reason every instant in `src/lib/` is.
   *
   * WHY A SEA HAS TO KNOW THE TIME BEFORE IT IS STEPPED. Which rooms to read is
   * a function of which epoch is being folded (`roomEpochsFor`), so a sea that
   * knew nothing until its first `step` could not issue its first read from the
   * constructor — and the first read has to be in flight before the first frame
   * or the ordinary cold start folds an unseeded epoch and only learns what the
   * room holds a poll later (see `adoptInto`). It is also what makes the LIVE
   * channel useful immediately: a `content_new` that arrived before the first
   * frame would otherwise refetch nothing.
   *
   * It reaches exactly two things: which pair of rooms to read first, and the
   * ACTION-envelope timestamp of the opening mints (checked by the node against
   * a 600 s window). Nothing the fold reads ever comes from here — the fold's
   * epoch is taken from `step`'s own clock and `advance` decides every rollover.
   */
  readonly openedAtMs: number;
  /** This client's public key, hex — the swimmer the camera follows. Passed in
   *  rather than derived, so the sea can be built synchronously while the
   *  signing key resolves in the background (WebCrypto's `importKey` is
   *  async). `signer` is checked against it once it arrives. */
  readonly authorIdHex: string;
  /** Resolves to this client's signer. Only needed at publish time. */
  readonly signer: Promise<{ publicKeyHex: string; sign: SignFn }>;
  readonly spawn: { readonly x: number; readonly y: number };
  readonly onError?: (where: string, err: unknown) => void;
  /**
   * How every attempted write ended: `null` when the node accepted it,
   * otherwise the TYPED classification of the refusal (`classifySendFailure`,
   * shoalSend.ts) — never the error, never its message.
   *
   * A SECOND CHANNEL ALONGSIDE `onError`, not a replacement for it, because the
   * two answer different questions. `onError` is the developer's log: it fires
   * for reads, for signer trouble and for checkpoint divergence as well as for
   * writes, it carries the raw thrown value, and nothing is expected to act on
   * it. This one fires once per WRITE, carries a discriminant a caller can
   * switch on, and — uniquely — also fires when a write SUCCEEDS. That last
   * part is what a shell needs and an error channel structurally cannot give:
   * being let into the water (spec §2.16) shows up as a write that stops being
   * refused, which is not an event any `onError` can ever report.
   *
   * `chainSea` itself draws no conclusion from the kind. Deciding what a
   * refusal means to a player belongs to `wayIn.ts`, and the words belong to
   * `TheEdge.tsx`; this file stays as free of player-facing copy as it was.
   */
  readonly onWrite?: (failure: SendFailure | null) => void;
}

/** How long after an event-driven refetch to look again, to cover the gap
 *  between `content_new` and `get_replies` (see the module header). */
const RECHECK_MS = 600;

/**
 * How long an optimistic row may sit unretired before this client treats it as
 * lost and withdraws it. Case 3 in the module header — the write the node took
 * and then quietly dropped, which raises no error anywhere.
 *
 * DERIVED, not chosen. `PRESENCE_TTL_MS` is the exact point past which a
 * pending row cannot matter even if it were genuine: `foldTick` evicts a
 * presence once `t > vec.t + PRESENCE_TTL_MS`, so a row older than that has
 * already stopped keeping its own fish alive, and an eat claim that far behind
 * the cursor is long since folded or floored. It is also comfortably above
 * every honest delay in the write path — mining, submission, gossip, the
 * 74-372 ms `content_new`-to-`get_replies` lag (open item 11), and
 * `DEFAULT_POLL_INTERVAL_MS` between refetches — so a slow write is never
 * withdrawn out from under itself. Measured against `PRESENCE_TTL_MS`
 * directly, never a second hardcoded 90_000.
 */
const PENDING_TTL_MS = PRESENCE_TTL_MS;

/**
 * How long after a FAILED mint this client waits before mining another one.
 *
 * DERIVED, not chosen, and it is a CPU bound rather than a correctness one.
 * `roomFor` writes whether or not the mint succeeded, so nothing waits on this;
 * what it stops is a client whose mint keeps failing from mining a fresh
 * Argon2id `Post` on every single write. A refused player writes every
 * `MAX_EMIT_GAP_MS` (8 s) forever by design (`seaChoice.knockOn` measures what
 * that already costs), and a Post is the heavier mine of the two — base
 * difficulty 20 against a Reply's 18, so four times the expected work. Without
 * a cooldown, being refused would cost five mines where it costs one.
 *
 * `PRESENCE_TTL_MS` is the same number `PENDING_TTL_MS` is derived from, and
 * for a related reason: it is the longest window anything in this client waits
 * on before deciding a write is not coming. A room that has not appeared in
 * that long is worth one more try; a room that failed four seconds ago is not.
 */
const MINT_RETRY_MS = PRESENCE_TTL_MS;

export interface ChainSea extends Sea {
  /** Tear down the live socket and the timers. */
  stop(): void;
}

export function chainSea(cfg: ChainSeaConfig): ChainSea {
  const report = (where: string, err: unknown) => { cfg.onError?.(where, err); };
  /**
   * Announce how one write ended. Called for all three of them — a presence, an
   * eat claim and a checkpoint are the same action to the node, and the gate
   * that refuses one refuses all three, so a shell that watched only presences
   * would go on believing it was in the water for as long as nobody moved.
   *
   * The classification is done HERE rather than by the caller so that no other
   * module ever has to hold a raw thrown value to find out what happened. The
   * kind is all that leaves this file.
   */
  const noteWrite = (failure: SendFailure | null) => { cfg.onWrite?.(failure); };

  let remote: LogEntry[] = [];
  let pending: LogEntry[] = [];
  let published: CheckpointEntry[] = [];
  let loop: LoopState | null = null;
  /** True once this loop's epoch has an authoritative seed — either adopted
   *  from the room, or this client's own `rolled` from the boundary it crossed.
   *  Adoption is attempted on every refetch until it is. */
  let seeded = false;
  /** Epochs whose divergence has already been reported, so a refetch that keeps
   *  finding the same disagreement does not keep shouting about it. */
  const divergenceReported = new Set<number>();
  let stopped = false;
  let serial = 0;
  let inFlight = false;
  /** A `refetch` arrived while one was in flight. See `refetch` — this is
   *  what stops a rollover's read being the one that gets dropped. */
  let refetchQueued = false;
  const recheckTimers: ReturnType<typeof setTimeout>[] = [];

  /**
   * The epoch whose pair of rooms is being read, or `null` before the
   * constructor has set it.
   *
   * THE ROOM SET FOLLOWS THE FOLD. It is seeded once from `cfg.openedAtMs` so
   * the first read can leave the constructor, and from then on it is taken from
   * `loop.epoch` — never from a clock read of this file's own. `advance` is the
   * one thing that decides when an epoch ends, so sourcing it there is what
   * makes "which rooms" and "which fold" incapable of answering differently
   * about the same instant; it is the same discipline `roomIdAtMs` follows one
   * level down.
   */
  let foldEpoch: number | null = null;
  /**
   * The most recent clock this sea was handed — `cfg.openedAtMs` until the first
   * frame, then `step`'s own. Used for exactly one thing: the AHEAD-mint's
   * action-envelope timestamp, which the node checks against a 600 s window and
   * which therefore has to be roughly now rather than roughly the hour being
   * minted. Every other mint takes its timestamp from the write that needed it.
   * Nothing the fold reads ever comes from here.
   */
  let lastFrameMs = 0;
  /** `epoch -> the room's derived content id`. Pure and constant per epoch, but
   *  `hash-wasm` makes it async, so it is held rather than recomputed. */
  const roomIds = new Map<number, Promise<string>>();
  /** `epoch -> an in-flight or settled mint`. See `ensureRoom`. */
  const mints = new Map<number, Promise<string>>();
  /** `epoch -> the frame clock at which a mint for it last FAILED`. The
   *  cooldown in `ensureRoom` reads it. */
  const mintFailedAtMs = new Map<number, number>();

  // The signing context, built once. `powProfileFor` caches per endpoint, so
  // this is one `get_info` round trip for the life of the window. `SendCtx`
  // carries a room, and this one does not have one — the room depends on WHEN a
  // write is authored, so each write builds its own from this base.
  type BaseCtx = Omit<SendCtx, 'roomContentId'>;
  const ctxReady: Promise<BaseCtx> = (async () => {
    const [signer, powProfile] = await Promise.all([cfg.signer, powProfileFor(cfg.auth)]);
    if (signer.publicKeyHex !== cfg.authorIdHex) {
      // Not fatal to rendering — the sea still folds and draws — but every
      // write would be signed by a key the fold attributes to somebody else,
      // and the camera would follow an empty spot. Worth being loud about.
      report('identity', new Error(
        `the signing key derives ${signer.publicKeyHex} but the sea was told it is ${cfg.authorIdHex}`,
      ));
    }
    return {
      auth: cfg.auth,
      spaceId: cfg.water.spaceId,
      authorIdHex: cfg.authorIdHex,
      sign: signer.sign,
      powProfile,
    };
  })();
  ctxReady.catch((e) => { report('signer', e); });

  /** This water's room for `epoch`, derived once and held. */
  function roomIdOf(epoch: number): Promise<string> {
    let id = roomIds.get(epoch);
    if (id === undefined) {
      id = roomIdIn(cfg.water, epoch);
      // A failed derivation must not be cached as a permanent answer.
      id.catch(() => { roomIds.delete(epoch); });
      roomIds.set(epoch, id);
    }
    return id;
  }

  /**
   * Make sure `epoch`'s room POST exists, and answer with its content id.
   *
   * ONE ATTEMPT AT A TIME, AND NOT ONE PER FRAME. The promise is cached while
   * it is in flight and after it succeeds, so the ordinary case is a single
   * `submit_post` an hour. A FAILED mint is evicted so a later call can try
   * again — but the callers are the ones that make that safe: `step` fires this
   * exactly once per epoch change (never per frame), and every other caller is
   * a write, which `shouldEmit`'s 3-8 s floor already rate-limits. Retrying on
   * a schedule of this module's own would mine an Argon2id Post every frame for
   * a player the water has refused, which is precisely the wrong answer.
   *
   * THE NODE'S ANSWER IS CHECKED AGAINST THE DERIVATION, and that check is not
   * ceremony — it is the only place in this client where the room grammar meets
   * a real node. `submit_post` re-derives `content_id` from
   * `sha256(title + "\n\n" + body)` itself (methods.rs:2221-2223), so if this
   * client's preimage ever stopped agreeing with the node's, every write would
   * go to a room nobody else derives and NOTHING would look wrong. Here it
   * throws instead.
   */
  function ensureRoom(epoch: number, nowMs: number): Promise<string> {
    const held = mints.get(epoch);
    if (held !== undefined) return held;
    const failedAt = mintFailedAtMs.get(epoch);
    if (failedAt !== undefined && nowMs - failedAt < MINT_RETRY_MS) {
      // Cooling off: answer the derived id without mining. See MINT_RETRY_MS.
      return roomIdOf(epoch);
    }
    const mint = (async () => {
      const [base, derived] = await Promise.all([ctxReady, roomIdOf(epoch)]);
      const answered = await mintRoom(base, roomTextIn(cfg.water, epoch), nowMs);
      if (answered !== derived) {
        throw new Error(
          `submit_post minted ${answered} for the room this client derives as ${derived}. `
          + 'The node hashes `${title}\\n\\n${body}` (methods.rs:2221) and so does '
          + '`roomPreimage`, so a disagreement means the grammar has drifted from the node — '
          + 'every write would land in a room no other client derives, with no symptom.',
        );
      }
      return derived;
    })();
    mint.catch(() => { mints.delete(epoch); mintFailedAtMs.set(epoch, nowMs); });
    mints.set(epoch, mint);
    return mint;
  }

  /**
   * The room one write goes into. **The mint is fired and never waited on.**
   *
   * The room id is DERIVED, so it is known before anything is minted, and the
   * whole of `ensureRoom`'s value is making the post EXIST — not telling this
   * function anything it did not already know. Three reasons the write does not
   * wait on it, and the third is why this changed:
   *
   *  - **A peer has almost certainly minted it already.** Everybody mints, and
   *    everybody ahead-mints the next hour, so by the time an hour arrives its
   *    room is usually an hour old. This client's own `submit_post` is then
   *    pure redundancy, and waiting on redundancy is pure loss.
   *  - **A player the water has REFUSED must go on knocking.** `submit_post`
   *    runs `check_identity_sponsored` exactly as `submit_reply` does
   *    (methods.rs:2204), so an unsponsored client's mint fails with the same
   *    -32015. If that cancelled the write, `submit_reply` would never be
   *    reached, `onWrite` would never see a write's outcome, and the one signal
   *    that can ever lift the edge of the water (`wayIn.ts`) would be gone —
   *    the silent permanent lockout `seaChoice.chooseWater` exists to prevent,
   *    reintroduced from a new direction.
   *  - **A NEWCOMER'S FIRST WRITE IS THE ONE THAT MATTERS MOST, and it was the
   *    one being delayed.** `noteEpoch` fires the mint at construction and the
   *    first vector is authored on the first frame ~16 ms later, so awaiting
   *    the mint put a whole Argon2id `Post` in front of it — base difficulty 20
   *    against a Reply's 18, four times the expected work, measured at roughly
   *    6.5 s median at the mainnet profile. That is 6.5 s before anybody else
   *    can see the new swimmer, and 6.5 s before the write that tells THEM they
   *    are in the water.
   *
   * WHAT IT COSTS, stated rather than hidden: for the one client that really is
   * first into an hour nobody has minted, the first write races its own mint
   * and can lose. The node answers "Parent content not found"
   * (methods.rs:3204-3218), `classifySendFailure` puts that in the `'unknown'`
   * bucket, `'unknown'` moves no standing in either direction (`wayIn.ts`), the
   * optimistic row is withdrawn, and the next emit — at most `MAX_EMIT_GAP_MS`
   * later, by which time the mint has long since landed — carries the same
   * swimmer. One vector, in the rarest case, against 6.5 s for every joiner.
   */
  async function roomFor(base: BaseCtx, authoredMs: number): Promise<SendCtx> {
    const epoch = epochOf(authoredMs);
    // FIRED, NEVER AWAITED. See the doc above on why the write does not wait.
    void ensureRoom(epoch, authoredMs).catch((e) => { report('mintRoom', e); });
    return { ...base, roomContentId: await roomIdOf(epoch) };
  }

  /**
   * The fold has reached `epoch` — point the reads at the right pair of rooms,
   * and make sure this hour's room and the NEXT one exist.
   *
   * Called from `step` on every frame and cheap on all but the first of each
   * epoch: the two mints are chained rather than raced so a joiner's first
   * vector is not queued behind the mint for an hour that has not started, and
   * the ahead-mint is what keeps a rollover from ever waiting on a mine.
   */
  function noteEpoch(epoch: number, nowMs: number): void {
    if (foldEpoch === epoch) return;
    foldEpoch = epoch;
    // BOUNDED PER EPOCH, NOT PER SESSION — the same discipline `advance`'s
    // rollover applies to `appliedHashes` (shoalLoop.ts section 4). One entry
    // an hour is nothing on its own, but a window left open for a week is a
    // week of them, and "nothing removed them" is exactly how that set grew.
    // Everything below `epoch - 1` is a room this client will never read or
    // write again: `roomEpochsFor` reaches back exactly one hour, and a write
    // is placed by an authoring instant that cannot go backwards past the
    // pending TTL. A re-derivation costs one sha256 if one were ever needed.
    for (const held of [roomIds, mints, mintFailedAtMs]) {
      for (const e of held.keys()) if (e < epoch - 1) held.delete(e);
    }
    void refetch(); // the pair of rooms has changed; read the new one now
    void ensureRoom(epoch, nowMs)
      .catch((e) => { report('mintRoom', e); })
      .then(() => ensureRoom(epoch + 1, lastFrameMs))
      .catch((e) => { report('mintRoomAhead', e); });
  }

  /**
   * Read the pair of rooms and fold what comes back into `remote`.
   *
   * ## ONE AT A TIME, BUT NOT AT THE COST OF LOSING ONE
   *
   * `inFlight` stops N concurrent polls becoming N concurrent fetches of a room
   * that can hold tens of thousands of rows. It used to do that by DROPPING the
   * extra calls, and that was wrong at exactly one moment: the rollover.
   * `noteEpoch` fires a read the instant the pair of rooms changes, and if a
   * read was already in the air that call vanished — so a client that had just
   * crossed the hour went on holding the OLD pair until something else asked,
   * up to `RECHECK_MS` later and in the worst case a whole
   * `DEFAULT_POLL_INTERVAL_MS`. The new room is where every write from that
   * moment on is landing, so the window is a window of not seeing anybody.
   *
   * So a call that arrives mid-flight is COALESCED rather than dropped: it sets
   * a flag, and the in-flight read runs once more when it finishes. A flag and
   * not a counter, so ten dropped calls cost one extra fetch and not ten — the
   * fetch storm `inFlight` exists to prevent is still prevented.
   *
   * It cannot spin: the flag is cleared when the follow-up STARTS, so only
   * calls that arrive during that follow-up can queue another, and a client
   * that is not being asked to refetch stops after one.
   */
  async function refetch(): Promise<void> {
    if (stopped || foldEpoch === null) return;
    if (inFlight) { refetchQueued = true; return; }
    inFlight = true;
    refetchQueued = false;
    try {
      const ids = await Promise.all(roomEpochsFor(foldEpoch).map(roomIdOf));
      const room = await fetchRooms(cfg.auth, ids);
      if (stopped) return;
      const next = room.log;
      remote = next;
      published = room.checkpoints;
      // Retire on (id, ms, KIND). See the module header on why `kind` is part
      // of the key: a vector and an eat claim share one `authorMs` routinely,
      // and without it each retires the other.
      pending = pending.filter(
        (p) => !next.some((r) => r.id === p.id && r.ms === p.ms && r.kind === p.kind),
      );
      // A checkpoint that arrives after the first frame is still worth
      // adopting — see `adopt` below on why this is not a one-shot at startup.
      if (loop !== null && !seeded) adoptInto(loop.epoch);
    } catch (e) {
      report('fetchRoomLog', e); // keep folding the last good log
    } finally {
      inFlight = false;
    }
    // Somebody asked while that was in the air — most importantly `noteEpoch`
    // at a rollover, whose read named a different pair of rooms from the one
    // just fetched. Run it once more.
    if (refetchQueued && !stopped) await refetch();
  }

  const live = startLive({
    auth: cfg.auth,
    spaceId: cfg.water.spaceId,
    onRefetch: () => {
      void refetch();
      const t = setTimeout(() => { void refetch(); }, RECHECK_MS);
      recheckTimers.push(t);
      // Bounded: only the handful still waiting to fire are worth keeping.
      if (recheckTimers.length > 32) recheckTimers.splice(0, recheckTimers.length - 32);
    },
  });
  // The first read and the first mints, before any event and before any frame.
  // `step` calls `noteEpoch` again with the epoch `advance` is actually folding,
  // which is a no-op unless the boundary fell between construction and the first
  // frame — in which case it corrects, which is the point of asking twice.
  lastFrameMs = cfg.openedAtMs;
  noteEpoch(epochOf(cfg.openedAtMs), cfg.openedAtMs);

  /** `remote` plus whatever this client has published and not yet read back. */
  function combined(): LogEntry[] {
    return pending.length === 0 ? remote : [...remote, ...pending];
  }

  /**
   * Withdraw every pending row `doomed` names, and make the fold forget them.
   *
   * The loop is dropped rather than patched because there is no way to patch
   * it: `advance` has already put the row in `appliedHashes` (so re-offering
   * the corrected log would change nothing) and in `ordered` (so every replay
   * would keep re-folding it). `createLoop(epoch, seed)` is the one legal way
   * to start an epoch — the same call a cold joiner and a rollover both make —
   * and it carries this loop's own epoch and seed forward, so nothing but the
   * withdrawn row is lost.
   *
   * A no-op when nothing matched, so the ordinary path never pays for it.
   */
  function withdraw(doomed: (p: LogEntry) => boolean): void {
    const kept = pending.filter((p) => !doomed(p));
    if (kept.length === pending.length) return;
    pending = kept;
    if (loop !== null) loop = createLoop(loop.epoch, loop.seed);
  }

  /**
   * What a detected divergence reads like on the way out. Diagnostic, not
   * player-facing copy: the shell's `onError` is a developer channel, and no
   * copy of any kind lives in `src/lib/`.
   *
   * It deliberately does NOT say "someone is cheating". `shoalLoop.ts` section 2
   * names an entirely honest cause: a checkpoint is taken AT the boundary, so an
   * eat claim authored in the last seconds of an hour and still in flight when
   * one client rolls is simply absent from its checkpoint and present in a
   * slower peer's. Both folds are correct and the payloads still differ. What
   * this reports is that two clients did not close the hour holding the same
   * entries — which covers an attack and a gossip race alike.
   */
  function describeDivergence(closedEpoch: number, outcome: Adoption): Error {
    const lines = outcome.opinions.map(
      (o) => `  ${o.voters.length} voter(s) of ${o.publishers.length} publisher(s), `
        + `lowest voter ${o.lowestVoter ?? "(none — self-contradicted)"}: ${o.payload}`,
    );
    return new Error(
      `epoch ${closedEpoch} has ${outcome.opinions.length} different checkpoint payloads. `
      + 'Every honest client computes the identical payload, so these clients did not close '
      + 'the hour holding the same entries — an attack, or an eat claim still in flight when '
      + 'one of them rolled. Adopted the payload with the most independent publishers — '
      + 'the lowest publisher id breaks a tie, and the payload text decides outright when '
      + 'every publisher contradicted itself (one player with two sessions does that '
      + 'honestly); see adopt.ts.\n' + lines.join('\n'),
    );
  }

  /**
   * Pick the seed for `epoch` from the checkpoints the room has handed over,
   * reporting a divergence the first time one is seen for that epoch. The
   * policy itself — which payload wins, and why — lives in `adopt.ts`.
   */
  function chooseSeed(epoch: number): Adoption {
    const outcome = adoptCheckpoint(published, epoch);
    if (outcome.diverged && !divergenceReported.has(epoch - 1)) {
      divergenceReported.add(epoch - 1);
      report('checkpointDivergence', describeDivergence(epoch - 1, outcome));
    }
    return outcome;
  }

  /**
   * Adopt into a loop that is already running unseeded.
   *
   * THIS IS NOT A ONE-SHOT AT STARTUP, and making it one would miss the
   * checkpoint almost every time. `refetch` is fired from the constructor and
   * the first frame is drawn hundreds of ms before it answers, so the ordinary
   * cold start folds an unseeded epoch first and only then learns what the room
   * holds. A joiner that arrives while the last publisher is still mining has to
   * keep looking, too. So adoption is attempted on every refetch until it
   * succeeds once — after which `seeded` closes it, because a second adoption
   * mid-epoch would be a second answer to a question already settled.
   *
   * Re-entering costs one bounded epoch replay and no correctness: `createLoop`
   * is the one legal way to start an epoch (shoalLoop.ts section 4), and the
   * fresh loop's empty `appliedHashes` makes the next `advance` re-admit the
   * whole log — the same mechanism `withdraw` above relies on.
   */
  function adoptInto(epoch: number): void {
    const outcome = chooseSeed(epoch);
    if (outcome.seed === null) return; // nothing to adopt yet; look again next fetch
    seeded = true;
    loop = createLoop(epoch, outcome.seed);
  }

  /**
   * Publish the checkpoint `advance` handed back at a boundary (spec §3.9
   * point 4). Fire-and-forget, like every other write here.
   *
   * EVERY CLIENT PUBLISHES, EVERY HOUR. That is the policy, and the cost is
   * what makes it affordable: PoW and mempool eviction are priced per ACTION
   * (builder.rs:92), so a checkpoint costs one mine — the same as a single
   * vector — however many KB it carries. At the design's 25-swimmer ceiling
   * that is ~141 KB an hour of storage across the whole space. What it buys is
   * the only evidence a joiner has: with one publisher per opinion the count of
   * independent publishers IS the count of independent folds, which is exactly
   * what `adoptCheckpoint` weighs. A rule that let only some clients publish
   * would make that number mean nothing while saving a rounding error.
   *
   * `nowMs` is the frame's own clock and reaches only the ACTION envelope's
   * timestamp, never the body — see `sendCheckpoint`. Two honest clients rolling
   * milliseconds apart therefore still author the identical payload.
   *
   * A FAILURE COSTS THIS CLIENT ITS VOTE AND NOTHING ELSE. There is no
   * optimistic row to withdraw: a checkpoint is not a `LogEntry` and never
   * enters the fold, and this client is already folding from the same value
   * (`advance` seeded itself with it internally). So the only consequence is
   * that peers see one fewer publisher agreeing, which is why it is reported
   * rather than swallowed. It is deliberately NOT retried: by the time a retry
   * could land, the node's own timestamp window (600 s back) would be closing
   * on it, and a checkpoint published late is a checkpoint every joiner that
   * needed it has already done without.
   *
   * IT GOES IN THE ROOM OF THE EPOCH IT OPENS — `cp.epoch + 1` — not the one it
   * summarises. The module header's decision 3 has the argument. Spelled from
   * the PAYLOAD rather than from `epochOf(nowMs)` so that a client that had
   * been asleep for hours (one `advance` rolls at most one epoch, by design)
   * still publishes into the room its checkpoint is the seed for, rather than
   * into whatever hour it happens to have woken up in.
   */
  function publishCheckpoint(cp: NonNullable<ReturnType<typeof advance>['rolled']>, nowMs: number): void {
    void ctxReady
      .then(async (c) => {
        // Into the room of the epoch it OPENS, minted best-effort like any
        // other write — a checkpoint that could not mint its room is still
        // worth attempting, because a peer has almost certainly minted it.
        const ctx = { ...c, roomContentId: await roomIdOf(cp.epoch + 1) };
        try { await ensureRoom(cp.epoch + 1, nowMs); } catch (e) { report('mintRoom', e); }
        return sendCheckpoint(ctx, cp, nowMs);
      })
      .then(() => { noteWrite(null); return refetch(); })
      .catch((e) => {
        noteWrite(classifySendFailure(e));
        report('sendCheckpoint', e);
      });
  }

  return {
    selfId: cfg.authorIdHex,
    // The sea is a property of the WATER, not of the hour (open item 13, and
    // this plan's "a rotation must be invisible"): every client in this water
    // derives the identical wild shoal and goes on seeing it across every
    // boundary, and a client in another water gets another one. See
    // `roomFamilyKey` for why the room's own id can no longer be the seed.
    wildSeed: wildSeedFrom(cfg.water.spaceId, roomFamilyKey(cfg.water)),
    spawn: cfg.spawn,
    seaMs: (wallMs: number) => wallMs,

    publish(vec: Vec, say?: string): void {
      // The synthetic hash is captured, not just minted: it is this row's only
      // identity until the node answers, and it is what `withdraw` names if
      // the write never gets there.
      const hash = `pending-${serial++}`;
      pending.push({
        kind: 'presence',
        id: cfg.authorIdHex,
        ms: vec.t,
        hash,
        vec,
        ...(say !== undefined ? { say } : {}),
      });
      void ctxReady
        .then((c) => roomFor(c, vec.t))
        .then((c) => sendPresence(c, vec, say))
        .then(() => { noteWrite(null); return refetch(); })
        .catch((e) => {
          // A dart nobody was told about is not a dart. Take the claim back
          // before reporting, so the sea on screen is the sea that exists.
          withdraw((p) => p.hash === hash);
          noteWrite(classifySendFailure(e));
          report('sendPresence', e);
        });
    },

    publishEat(cell: number, ms: number): void {
      const hash = `pending-${serial++}`;
      pending.push({ kind: 'eat', id: cfg.authorIdHex, cell, ms, hash });
      void ctxReady
        .then((c) => roomFor(c, ms))
        .then((c) => sendEat(c, cell, ms))
        .then(() => { noteWrite(null); return refetch(); })
        .catch((e) => {
          // Otherwise this client alone believes it grew.
          withdraw((p) => p.hash === hash);
          noteWrite(classifySendFailure(e));
          report('sendEat', e);
        });
    },

    speechAt: (atMs: number) => speechFrom(combined(), atMs),

    step(wallMs: number): ShoalState {
      // Case 3 of the module header: a row the node accepted and then dropped
      // raises nothing anywhere, so the only thing that can catch it is time.
      // Done here, before the fold, because this is the one method with a
      // clock. The comparison is against the authoring instant the row carries,
      // never a second clock read.
      withdraw((p) => wallMs - p.ms >= PENDING_TTL_MS);
      // The only clock this file keeps, and it reaches nothing the fold reads —
      // see `lastFrameMs`.
      lastFrameMs = wallMs;

      // The epoch is chosen from the first frame's clock, not at construction,
      // so a sea built a moment before a boundary still starts in the epoch it
      // will actually be folding. `advance` rolls it from there.
      //
      // ADOPTION HAPPENS HERE (spec §3.9 point 5) and, when the room has not
      // arrived yet, again on the refetch that brings it — see `adoptInto`.
      // `chooseSeed` returns `null` for a room with no checkpoint for the
      // preceding epoch, which is the first epoch a room ever has: absence, not
      // disagreement, and folded unseeded without a word.
      if (loop === null) {
        const epoch = epochOf(wallMs);
        const outcome = chooseSeed(epoch);
        if (outcome.seed !== null) seeded = true;
        loop = createLoop(epoch, outcome.seed);
      }
      // WHICH ROOMS FOLLOW WHICH EPOCH, and nothing else decides it. On the
      // first frame this fires the first read and the first mints; on every
      // frame after that within one hour it returns immediately.
      noteEpoch(loop.epoch, wallMs);
      const advanced = advance(loop, combined(), wallMs);
      loop = advanced.loop;
      if (advanced.rolled !== null) {
        // A boundary was crossed. `advance` has already seeded the new epoch
        // from this value internally, so from here on this client's own fold IS
        // the authority for the new epoch and there is nothing left to adopt.
        seeded = true;
        publishCheckpoint(advanced.rolled, wallMs);
        // ...and the pair of rooms has moved on with it: from here the fold
        // reads (E, E+1) and the room this client just left is dropped. This is
        // the ONE instant at which dropping it is correct — see `roomEpochsFor`.
        noteEpoch(loop.epoch, wallMs);
      }
      return loop.state;
    },

    stop(): void {
      stopped = true;
      live.stop();
      for (const t of recheckTimers) clearTimeout(t);
      recheckTimers.length = 0;
    },
  };
}

/** Re-exported so a caller can size its own poll expectations against the
 *  same number the live channel uses. */
export { DEFAULT_POLL_INTERVAL_MS };
