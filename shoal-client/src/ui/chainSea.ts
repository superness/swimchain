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
import { fetchRoom } from '../lib/shoalRoom';
import { adoptCheckpoint, type Adoption } from '../lib/adopt';
import { DEFAULT_POLL_INTERVAL_MS, startLive } from '../lib/shoalLive';
import {
  classifySendFailure, powProfileFor, sendCheckpoint, sendEat, sendPresence,
  type SendCtx, type SendFailure, type SignFn,
} from '../lib/shoalSend';
import { PRESENCE_TTL_MS } from '../lib/shoalConst';
import type { RpcAuth } from '../lib/shoalRpc';
import type { CheckpointEntry } from '../lib/shoalWire';
import type { LogEntry, ShoalState, Vec } from '../lib/shoalTypes';
import { speechFrom, wildSeedFrom, type Sea } from './demoSea';

export interface ChainSeaConfig {
  readonly auth: RpcAuth;
  readonly spaceId: string;
  readonly roomContentId: string;
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
  let ctx: SendCtx | null = null;
  const recheckTimers: ReturnType<typeof setTimeout>[] = [];

  // The signing context, built once. `powProfileFor` caches per endpoint, so
  // this is one `get_info` round trip for the life of the window.
  const ctxReady: Promise<SendCtx> = (async () => {
    const [signer, powProfile] = await Promise.all([cfg.signer, powProfileFor(cfg.auth)]);
    if (signer.publicKeyHex !== cfg.authorIdHex) {
      // Not fatal to rendering — the sea still folds and draws — but every
      // write would be signed by a key the fold attributes to somebody else,
      // and the camera would follow an empty spot. Worth being loud about.
      report('identity', new Error(
        `the signing key derives ${signer.publicKeyHex} but the sea was told it is ${cfg.authorIdHex}`,
      ));
    }
    ctx = {
      auth: cfg.auth,
      spaceId: cfg.spaceId,
      roomContentId: cfg.roomContentId,
      authorIdHex: cfg.authorIdHex,
      sign: signer.sign,
      powProfile,
    };
    return ctx;
  })();
  ctxReady.catch((e) => { report('signer', e); });

  async function refetch(): Promise<void> {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const room = await fetchRoom(cfg.auth, cfg.spaceId, cfg.roomContentId);
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
  }

  const live = startLive({
    auth: cfg.auth,
    spaceId: cfg.spaceId,
    onRefetch: () => {
      void refetch();
      const t = setTimeout(() => { void refetch(); }, RECHECK_MS);
      recheckTimers.push(t);
      // Bounded: only the handful still waiting to fire are worth keeping.
      if (recheckTimers.length > 32) recheckTimers.splice(0, recheckTimers.length - 32);
    },
  });
  void refetch(); // the first read, before any event

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
   */
  function publishCheckpoint(cp: NonNullable<ReturnType<typeof advance>['rolled']>, nowMs: number): void {
    void ctxReady
      .then((c) => sendCheckpoint(c, cp, nowMs))
      .then(() => { noteWrite(null); return refetch(); })
      .catch((e) => {
        noteWrite(classifySendFailure(e));
        report('sendCheckpoint', e);
      });
  }

  return {
    selfId: cfg.authorIdHex,
    // The sea is a property of the ROOM (open item 13): every client pointed
    // at this space and this room derives the identical wild shoal, and a
    // client pointed at another room gets another one.
    wildSeed: wildSeedFrom(cfg.spaceId, cfg.roomContentId),
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
      const advanced = advance(loop, combined(), wallMs);
      loop = advanced.loop;
      if (advanced.rolled !== null) {
        // A boundary was crossed. `advance` has already seeded the new epoch
        // from this value internally, so from here on this client's own fold IS
        // the authority for the new epoch and there is nothing left to adopt.
        seeded = true;
        publishCheckpoint(advanced.rolled, wallMs);
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
