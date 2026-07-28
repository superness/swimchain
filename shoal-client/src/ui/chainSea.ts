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
 */
import { advance, createLoop, type LoopState } from '../lib/shoalLoop';
import { epochOf } from '../lib/epoch';
import { fetchRoomLog } from '../lib/shoalRoom';
import { DEFAULT_POLL_INTERVAL_MS, startLive } from '../lib/shoalLive';
import { powProfileFor, sendEat, sendPresence, type SendCtx, type SignFn } from '../lib/shoalSend';
import { PRESENCE_TTL_MS } from '../lib/shoalConst';
import type { RpcAuth } from '../lib/shoalRpc';
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

  let remote: LogEntry[] = [];
  let pending: LogEntry[] = [];
  let loop: LoopState | null = null;
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
      const next = await fetchRoomLog(cfg.auth, cfg.spaceId, cfg.roomContentId);
      if (stopped) return;
      remote = next;
      // Retire on (id, ms, KIND). See the module header on why `kind` is part
      // of the key: a vector and an eat claim share one `authorMs` routinely,
      // and without it each retires the other.
      pending = pending.filter(
        (p) => !next.some((r) => r.id === p.id && r.ms === p.ms && r.kind === p.kind),
      );
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
        .then(() => refetch())
        .catch((e) => {
          // A dart nobody was told about is not a dart. Take the claim back
          // before reporting, so the sea on screen is the sea that exists.
          withdraw((p) => p.hash === hash);
          report('sendPresence', e);
        });
    },

    publishEat(cell: number, ms: number): void {
      const hash = `pending-${serial++}`;
      pending.push({ kind: 'eat', id: cfg.authorIdHex, cell, ms, hash });
      void ctxReady
        .then((c) => sendEat(c, cell, ms))
        .then(() => refetch())
        .catch((e) => {
          // Otherwise this client alone believes it grew.
          withdraw((p) => p.hash === hash);
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
      if (loop === null) loop = createLoop(epochOf(wallMs), null);
      // `.rolled` — the checkpoint `advance` computes at every hour boundary —
      // IS DELIBERATELY DROPPED HERE, and that is a known, recorded defect, not
      // a tidy destructure. Nothing in this client publishes a checkpoint and
      // nothing adopts one: the seed above is a hard `null`, so a client that
      // joins after a boundary folds an UNSEEDED epoch and sees everyone back
      // at START_SIZE, while a client that was already running keeps every
      // swimmer's accumulated size (`advance` seeds itself from its own
      // `rolled` internally). Size feeds shelterWeight -> shelterOf ->
      // isExposed -> selectTaken, so the two clients disagree about WHO THE
      // SHARK EATS — the outcome sweep.ts's header names as the most
      // trust-destroying bug this game can have — and spec 2.7's "you return
      // the size you left" is false across any reload crossing an hour.
      // Spec 3.9 points 4 (checkpoints are published) and 5 (a cold joiner
      // adopts the newest verified one) are both unimplemented because of it.
      // Full write-up, including what the fix costs and why it is not done
      // here: docs/THE_SHOAL_OPEN_ITEMS.md, Blocker 12.
      loop = advance(loop, combined(), wallMs).loop;
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
