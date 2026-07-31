/**
 * The Shoal — assembling a room's ordered log from a node's replies (plan 2b, "the
 * bridge to a real node"). `repliesToLog` turns whatever `get_replies` handed back
 * into the `LogEntry[]` the deterministic engine (shoalEngine.ts) folds; `fetchRoomLog`
 * is the thin RPC call that gets those replies in the first place.
 *
 * ## The property this module exists to guarantee
 *
 * The author of a `LogEntry` comes from the reply's own `author_id` — the node's
 * record of who signed the reply — never from anything inside the reply `body`. A
 * hostile client can write ANY bytes into a reply body; the node validates PoW and
 * signatures, never application semantics (project_fold_rules_are_permanent). What it
 * cannot forge is the signed authorship of the reply itself. So `decodeBody` (see
 * shoalWire.ts) is always called as `decodeBody(reply.body, reply.author_id,
 * reply.content_id)` — `id` and `hash` sourced from the envelope, `body` the only
 * hostile-controlled input. `decodeBody`'s own wire grammar (shoalWire.ts) has no
 * field that could even carry a claimed id in the first place; the spoofing risk this
 * guards against is a *caller* bug (accidentally sourcing `id` from `body`), not
 * anything `decodeBody` itself could be tricked into trusting.
 *
 * Equally: one malformed reply must not poison the room. `decodeBody` returns `null`
 * for anything not already well-formed and in-domain (see its own "reject, never
 * repair" doc) — `repliesToLog` just drops those and keeps going.
 *
 * ## What `get_replies` actually returns (verified against src/rpc/methods.rs and
 * src/rpc/types.rs, not assumed)
 *
 * `get_replies` takes params as an OBJECT — `GetRepliesParams { content_id, limit,
 * offset, depth_limit }` (src/rpc/types.rs:644) — matching the prior note recorded
 * from the chips-and-dip project. The result is `GetRepliesResult { parent_id,
 * replies: Vec<ReplyInfo>, total_count }` (types.rs:690), NOT a bare array — the
 * `replies` field has to be unwrapped.
 *
 * Each `ReplyInfo` (types.rs:660) carries `content_id`, `author_id` (hex pubkey, both
 * for finalized and still-pending/mempool replies as of methods.rs:9551's comment —
 * an earlier inconsistency where pending used bech32 and finalized used hex was fixed
 * there), `body`, `parent_id`, `created_at`, `last_engagement`, `depth`, `child_count`,
 * an optional `display_name`, `media_refs`, and `block_height: Option<u64>` (a number
 * or `null` while still pending in the mempool). This plan's `RawReply` brief listed
 * `{content_id, author_id, body, block_height}` — checked field-by-field against the
 * real `ReplyInfo`, every one of those four names and shapes matches exactly (no
 * defect found here, unlike Task 1's `encodeEat`/`ms` gap — see shoalWire.ts's module
 * header for that one). `RawReply` only carries the subset `repliesToLog` needs;
 * `fetchRoomLog` narrows the richer `ReplyInfo` down to it below.
 *
 * The part that DOES need care, and that the brief explicitly flags: `depth_limit`
 * defaults to 5 server-side (types.rs:653-655), so a bare `{content_id, limit}` call
 * returns the WHOLE nested reply subtree under the room post — replies to replies, not
 * just direct ones — sharing the same `limit` budget as direct replies (methods.rs's
 * BFS/DFS-mixed walk counts every fetched node, nested or not, against one cap before
 * it stops). chips-client (host.ts's `loadTable`) hit exactly this and fixed it by
 * filtering to `r.parent_id === tableId` after the fetch; this module does both —
 * BUT the two paths on the node are not symmetric, and the `parent_id` filter is
 * REQUIRED, not defensive, because of that asymmetry:
 *
 *  - **Chain-store (finalized) path**: `depth_limit: 0` really does bound this to
 *    direct children only. `methods.rs:9464`'s `if depth < depth_limit` gate
 *    controls whether a finalized reply's own children ever get enqueued for
 *    fetching at all — with `depth_limit: 0` (`0 < 0` is false) nothing past depth 0
 *    is ever walked, so this path cannot surface a reply-to-a-reply regardless of
 *    the filter below.
 *  - **Mempool (pending) path** (`methods.rs:9473-9616`) has NO depth gate on
 *    inclusion at all. A pending reply is admitted purely by "is its immediate
 *    parent already known" (`methods.rs:9522-9525`, checked against a
 *    `known_hashes` set built from the chain replies plus whatever pending replies
 *    earlier passes already admitted), via a multi-pass loop
 *    (`methods.rs:9508-9616`) that explicitly exists to chain-admit A -> B -> C
 *    even when all three are still pending (`methods.rs:9506`'s own comment: "This
 *    handles chains like A -> B -> C where B and C are both pending"). The walk at
 *    `methods.rs:9527-9545` that reads `depth < depth_limit` only bounds how far
 *    the DEPTH LABEL computation looks back (so with `depth_limit: 0` a genuinely
 *    nested pending reply gets mislabelled `depth: 0`) — it does not gate whether
 *    the reply is pushed into `all_replies` (`methods.rs:9599-9611` pushes
 *    unconditionally once the parent-known check above passes). So a pending
 *    reply-to-a-pending-reply DOES come back from the node, mislabelled as direct,
 *    with `depth_limit` set to any value including 0.
 *
 * What actually keeps a nested pending reply out of a room's log is that its
 * `parent_id` field still names its TRUE immediate parent (not `roomContentId`) —
 * `methods.rs:9603` sets `parent_id` from the real `parent_id` the mempool action
 * carries, independent of the (possibly wrong) `depth` label. The `parent_id ===
 * roomContentId` filter in `fetchRoomLog` below is therefore load-bearing for the
 * mempool path specifically, not a redundant belt-and-suspenders check on top of
 * `depth_limit: 0` — do not remove it on the assumption that `depth_limit: 0`
 * already covers this; it only covers the chain-store path.
 *
 * ## THE `limit` CEILING IS A CLIFF, AND THIS MODULE FALLS OFF IT LOUDLY
 *
 * A room's direct replies accumulate for the life of that room, and nothing in
 * THIS half of the module ever ends one. (The other half — "the room is a
 * function of the hour", below — is the answer to that, and this ceiling is why
 * it exists. A room now lives one hour, which at the emitter's own rate is
 * 11_250-30_000 replies against a 100_000 ceiling, so the throw below should
 * never fire again. It stays because a ceiling that cannot be reached costs
 * nothing and a truncated log is still catastrophically silent if the rotation
 * ever stops rotating.) `limit` is NOT clamped
 * by the node (methods.rs:9358-9363 takes it verbatim), and
 * `get_replies_for_content` returns direct children OLDEST FIRST: its index key
 * is `parent || timestamp || hash` and it is a plain forward `scan_prefix`
 * (src/storage/chain.rs:1511-1540). So once a room holds more direct replies
 * than `limit`, every client silently receives the OLDEST `limit` of them and
 * drops the entire live window — a fold over an empty sea, with no error
 * anywhere. At the emitter's own derived rate (21 writes/min, shoalEmit.ts's
 * MIN_EMIT_GAP_MS, times the design's 25-swimmer ceiling) a 100_000 ceiling is
 * about three hours of play; on pure idle keep-alives, under a day.
 *
 * So `narrowRoomReplies` THROWS when the response comes back at or above the
 * limit it asked for. That is the fix, and the reason it is a throw rather than
 * something cleverer is worth writing down, because "fetch the tail instead" is
 * the obvious answer and it is NOT AVAILABLE against today's RPC:
 *
 *  - **`total_count` is not a total.** The result field is computed as
 *    `all_replies.len() as u64` (methods.rs:9620) — the length of the very array
 *    being returned, AFTER the limit truncated it. It equals `replies.length` on
 *    every response, so it cannot tell a caller how far from the end it is, and
 *    `offset = total_count - window` is exactly as wrong as no offset at all.
 *  - **`offset` IS honoured** (methods.rs:9363 into chain.rs:1512's `skipped <
 *    offset` loop), so paging is mechanically possible — but that skip is a
 *    linear scan, `O(limit + offset)` by the function's own doc comment, and the
 *    mempool block appends pending replies to EVERY page regardless of offset.
 *    Walking forward to the end is `O(D^2)` node-side work in the room's
 *    direct-reply count D, on a fetch this game runs on every `content_new`
 *    event. That converts a silently wrong answer into an unboundedly expensive
 *    right one.
 *  - **There is no cheap way to learn D.** `get_content(room).reply_count`
 *    counts the whole reply SUBTREE recursively plus the mempool
 *    (methods.rs:4478-4483, via `count_all_replies`), so it OVER-estimates D,
 *    and an over-estimate used as an offset skips real replies — the same
 *    silent-empty-fold failure, differently caused.
 *  - **`block_height` cannot separate chain rows from mempool rows**, which
 *    would otherwise make a binary search on offset possible.
 *    `get_content_finalized_height` documents `Ok(None)` for content that
 *    "predates the `finalized_content` index" (chain.rs:3445-3449), not only for
 *    still-pending content, so a null height does not prove a row came from the
 *    mempool.
 *
 * A tail fetch needs one of: a true `total_count`, a newest-first/reverse flag,
 * or a direct-child count for a parent. None exists today; adding one is a node
 * change and belongs in its own plan. Until then the contract is: this module is
 * correct while a room is under `ROOM_FETCH_LIMIT` direct replies, and REFUSES
 * TO ANSWER past it.
 *
 * WHAT A CALLER MUST DO WHEN IT THROWS: stop folding (a truncated log is not a
 * staler world, it is a DIFFERENT one) and rotate the room — publish a new room
 * post and point clients at it, exactly the way a fresh room starts. Do NOT
 * catch it and retry with a bigger limit: the limit is not the problem,
 * unbounded history is, and the next ceiling arrives on the same schedule.
 *
 * The check is deliberately conservative rather than exact. The chain-store path
 * saturates iff it returned exactly `limit` rows, but the mempool block appends
 * pending replies AFTER that check (methods.rs:9599-9611, past the
 * `all_replies.len() >= limit` break at :9457), so a response can exceed `limit`
 * without the chain having saturated. `>= limit` therefore fires slightly EARLY
 * — within a pending-reply count of the ceiling, a few dozen replies out of
 * 100_000 — and never late. Since the entire problem is that a saturated fetch
 * is indistinguishable from a complete one, erring toward the throw is the only
 * safe direction.
 */
import { createSHA256 } from 'hash-wasm';

import type { LogEntry } from './shoalTypes';
import { decodeBody, decodeCheckpointBody, type CheckpointEntry } from './shoalWire';
import { orderLog } from './shoalEngine';
import { epochOf } from './epoch';
import { rpcCall, type RpcAuth } from './shoalRpc';

/** The subset of a node's `ReplyInfo` (src/rpc/types.rs:660) that `repliesToLog`
 *  needs. `block_height` is carried through for a future pending/finalized UI
 *  distinction; nothing in this module's log-assembly (order, dedupe, decode) reads
 *  it — a room's log is chain-plus-mempool reality, not chain-only
 *  (project_chain_plus_mempool_is_reality: a pending reply is real NOW, never
 *  withheld until it finalizes). */
export interface RawReply {
  content_id: string;
  author_id: string;
  body: string;
  block_height: number | null;
  /**
   * The node's own timestamp for this reply, unix ms — CARRIED BUT UNREAD.
   * AVAILABLE FOR A FUTURE `ms` SANITY BOUND; THE FOLD DOES NOT READ IT, and
   * nothing in this module reads it either.
   *
   * It is here because leaving it off FORECLOSED the fix rather than deferring
   * it. A body's `ms` is currently checked against nothing the node knows: a
   * back-dated vector rewrites where a swimmer *was* when someone else's bite
   * is judged against `reckon(fish.vec, claim.ms)`, and a forward-dated one
   * parks a swimmer whose `expiresMs` is years out — an immortal ghost that
   * shelters and threatens forever, for the price of one write. No future fold
   * rule could bound that without changing `RawReply`, a shape `repliesToLog`
   * and every published checkpoint already depend on. Carrying it now costs one
   * field; adding it later costs a format change.
   *
   * THE BOUND IS NOT ADDED HERE. It is a consensus rule and needs its own
   * design — not least because this field is NOT a clean authoring instant on
   * either node path, and whoever writes that rule must know it:
   *  - finalized: `metadata.timestamp * 1000` (methods.rs:9446) — the action's
   *    own unix-SECONDS timestamp, so it has second granularity, never
   *    millisecond.
   *  - pending: `SystemTime::now()` AT QUERY TIME (methods.rs:9571-9575), not
   *    when the reply was authored. Two clients querying the same pending reply
   *    get different `created_at` values, and both drift with how long it sits
   *    in the mempool. (This is the same node behaviour recorded as the reef
   *    pending-created_at ordering bug.)
   * Any bound must therefore be a loose sanity window measured against the
   * FINALIZED value, and must not treat the pending value as authoritative.
   *
   * shoalTypes.ts's own rule says a carried-but-unread field invites misplaced
   * trust. This doc is the mitigation, and it is the lesser cost: the
   * alternative forecloses the fix entirely.
   */
  created_at: number;
}

/**
 * An `author_id` as the node spells it: 64 lowercase hex characters, the
 * 32-byte ed25519 public key. BOTH node paths produce exactly this —
 * `hex::encode(&metadata.author)` when finalized (methods.rs:9446) and
 * `hex::encode(action.actor)` while pending (methods.rs:9548-9551, where an
 * earlier bech32-vs-hex inconsistency was fixed).
 */
const AUTHOR_ID_RE = /^[0-9a-f]{64}$/;

/**
 * Turn a room's replies into the ordered `LogEntry[]` the engine folds. Pure — no RPC,
 * no wall clock. This is where all of this module's correctness lives:
 *
 *  - drops any reply whose body doesn't decode, instead of throwing;
 *  - sources `id`/`hash` from each reply's own envelope (`author_id`/`content_id`),
 *    never from `body` — the anti-spoofing property described in the module header;
 *  - collapses duplicate `content_id`s (the node can serve the same reply twice
 *    across a paginated fetch — a still-pending mempool copy and its later-finalized
 *    self, or a plain duplicate row), keeping the first one seen;
 *  - hands the survivors to `orderLog` for the engine's total order (ms, then hash).
 */
export function repliesToLog(replies: readonly RawReply[]): LogEntry[] {
  return splitRoomReplies(replies).log;
}

/**
 * A room's replies, separated into the two things they can be: the ordered
 * `LogEntry[]` the engine FOLDS, and the `CheckpointEntry[]` a joining client
 * SEEDS from (spec §3.9 points 4 and 5).
 *
 * ONE PASS, because they arrive together. A checkpoint is a reply to the same
 * room post as every move, so it is in the same `get_replies` array, and a
 * caller that fetched twice — once for moves, once for checkpoints — could be
 * handed two different snapshots of one room.
 *
 * A CHECKPOINT MUST NEVER ENTER THE LOG. It seeds a fold; it is not something
 * the fold consumes. `foldShoal`'s tick body branches on "presence, otherwise
 * eat claim", so a checkpoint that reached the log would be mis-handled as a
 * bite by every one of those branches. The separation is structural rather than
 * a filter anyone has to remember: the two decoders are disjoint on the wire's
 * kind tag (`decodeBody` returns `null` for a checkpoint body and
 * `decodeCheckpointBody` returns `null` for a move body — shoalWire.ts's "A
 * checkpoint is NOT a `LogEntry`"), and a reply that decodes as a checkpoint
 * here is never offered to `decodeBody` at all. Pinned by the entry-count case
 * in shoalRoom.test.ts.
 *
 * Everything else is exactly `repliesToLog`'s contract, and applies to
 * checkpoints too: duplicate `content_id`s collapse to the first seen, the
 * author id's shape is a tripwire, `id`/`hash` are sourced from the reply's own
 * envelope and never from `body`, and anything that does not decode is dropped
 * rather than thrown on.
 *
 * Checkpoints come back in encounter order and are deliberately NOT sorted:
 * `adoptCheckpoint` (adopt.ts) is a function of the SET and defines its own
 * total order over them, so a second ordering rule here would be a second place
 * for two clients to disagree.
 */
export function splitRoomReplies(
  replies: readonly RawReply[],
): { log: LogEntry[]; checkpoints: CheckpointEntry[] } {
  const seen = new Set<string>();
  const entries: LogEntry[] = [];
  const checkpoints: CheckpointEntry[] = [];
  for (const r of replies) {
    // Duplicate content_id: keep the first seen. This is a deliberate but
    // unforced choice — the brief only requires collapsing to "one", not which one
    // — and it is currently unobservable: repliesToLog reads nothing per-reply
    // that could differ between duplicate copies of the same content_id (the
    // decoded LogEntry comes from body/author_id/content_id, all identical across
    // copies of the same reply). It WOULD become observable if a future field
    // (e.g. block_height, dropped by fetchRoomLog's map to RawReply today) started
    // being read here, since a pending copy (block_height: null) and its later-
    // finalized self (block_height: <n>) can both be in the input.
    if (seen.has(r.content_id)) continue;
    seen.add(r.content_id);

    // The author id's SHAPE is a tripwire, not routine input validation. Both
    // node paths hex-encode a 32-byte pubkey (see AUTHOR_ID_RE), so a healthy
    // node cannot produce anything else — which is exactly why a silent pass
    // here would be dangerous. A `LogEntry.id` is a swimmer's whole identity to
    // the fold, and checkpoints (checkpoint.ts) EMBED these ids verbatim: a node
    // regression that changed the encoding (back to bech32, to a `0x` prefix, to
    // uppercase) would split one swimmer into two rows that share no size, no
    // bites and no departed record, and would invalidate every checkpoint ever
    // published under the old spelling. Dropped rather than repaired, matching
    // this module's and decodeBody's "reject, never repair" discipline, and
    // reported because it can only ever mean the node changed underneath us.
    if (!AUTHOR_ID_RE.test(r.author_id)) {
      console.warn(
        `repliesToLog: dropping reply ${r.content_id} — author_id ${JSON.stringify(r.author_id)} ` +
        'is not 64 lowercase hex characters. A healthy node cannot produce this; treat it as a ' +
        'node regression, not as hostile input.',
      );
      continue;
    }

    // A checkpoint is taken off here and NEVER offered to `decodeBody` below.
    // See this function's doc: it seeds a fold, it is not folded.
    const checkpoint = decodeCheckpointBody(r.body, r.author_id, r.content_id);
    if (checkpoint !== null) {
      checkpoints.push(checkpoint);
      continue;
    }

    // id/hash come from the reply's own envelope — never from `body`, which a
    // hostile client fully controls. This is the load-bearing line in this module.
    const entry = decodeBody(r.body, r.author_id, r.content_id);
    if (entry === null) continue; // malformed/hostile body: drop it, don't poison the room
    entries.push(entry);
  }
  return { log: orderLog(entries), checkpoints };
}

/** The slice of `get_replies`'s real result this module reads. See the module header
 *  for the full verified shape (src/rpc/types.rs:644-699); fields not used here
 *  (`last_engagement`, `depth`, `child_count`, `display_name`, `media_refs`) are
 *  simply left off this narrowed type. */
export interface NodeReply {
  content_id: string;
  author_id: string;
  body: string;
  parent_id: string;
  block_height: number | null;
  /** Unix ms. See `RawReply.created_at` — carried through, never read. */
  created_at: number;
}

export interface GetRepliesResult {
  parent_id: string;
  replies: NodeReply[];
  /** NOT a true total: the node computes it as `all_replies.len()`
   *  (methods.rs:9620), i.e. it always equals `replies.length`. Declared here
   *  only so the shape matches the wire; nothing in this module reads it, and
   *  nothing should — see the module header's `limit`-ceiling section. */
  total_count: number;
}

/**
 * The `limit` `fetchRoomLog` asks for. Not a tuning knob so much as the height
 * of the cliff: see the module header. A room that outgrows it makes
 * `narrowRoomReplies` throw rather than return a silently-truncated log.
 */
export const ROOM_FETCH_LIMIT = 100_000;

/**
 * Narrow one `get_replies` response down to this room's direct replies — the
 * whole of `fetchRoomLog`'s logic, split out because it is pure and therefore
 * unit-testable without a node (`fetchRoomLog` itself stays a bare RPC call).
 *
 * THROWS when `result.replies.length >= limit`, because at that point the
 * response is indistinguishable from a truncated one and a truncated one is
 * catastrophically, silently wrong — the node returns the OLDEST `limit`
 * replies, so the entire live window is what goes missing. The module header
 * has the full argument, the verified reasons a tail fetch is not available
 * against today's RPC, and what a caller must do instead.
 */
export function narrowRoomReplies(
  result: GetRepliesResult, roomContentId: string, limit: number,
): RawReply[] {
  if (result.replies.length >= limit) {
    throw new RangeError(
      `fetchRoomLog: get_replies returned ${result.replies.length} replies for a limit of ` +
      `${limit}, so the response is at the node's ceiling and CANNOT be trusted to be ` +
      'complete. get_replies returns the OLDEST replies first (chain.rs:1511-1540), so a ' +
      'truncated response silently drops the entire live window and folds an empty sea. ' +
      'This room has outgrown a single fetch: rotate it (publish a new room post and point ' +
      'clients at it). Do NOT retry with a larger limit — `total_count` is not a real total ' +
      '(methods.rs:9620) and paging the tail is O(D^2) on the node, so a bigger ceiling only ' +
      'moves this failure later. See shoalRoom.ts\'s module header.',
    );
  }

  // REQUIRED, not defensive: depth_limit: 0 only bounds the node's chain-store
  // path (methods.rs:9464). The mempool/pending path (methods.rs:9473-9616) has no
  // depth gate on inclusion at all — it admits a pending reply purely by "is its
  // parent already known" and will chain-admit a reply-to-a-pending-reply across
  // its multi-pass loop, mislabelled depth: 0 regardless of depth_limit. Only this
  // parent_id check catches that case (see the module header for the full
  // line-by-line trace). Do not delete this as redundant with depth_limit: 0.
  return result.replies
    .filter((r) => r.parent_id === roomContentId)
    .map((r) => ({
      content_id: r.content_id,
      author_id: r.author_id,
      body: r.body,
      block_height: r.block_height,
      created_at: r.created_at,
    }));
}

/**
 * Fetch a room's replies from a live node and fold them into an ordered `LogEntry[]`.
 * All the actual logic lives in `repliesToLog` above (pure, unit-tested); this is
 * deliberately thin — it is not unit-testable here (it needs a real node) and is
 * exercised instead by Task 6's smoke script.
 *
 * `spaceId` is accepted (matching this task's interface) but not sent to
 * `get_replies` — the RPC is keyed purely by `content_id` (verified against
 * `GetRepliesParams`, src/rpc/types.rs:644-656, which has no space field at all).
 * It is named `_spaceId` here (unused, satisfying this project's
 * `noUnusedParameters`) rather than threaded into the call, so a caller holding a
 * room as a (space, content) pair doesn't have to unpack it just to call this
 * function — kept for API symmetry with the rest of the game's host-facing
 * functions and left available for a future space-scoped use (e.g. validating the
 * room post itself belongs to the expected space) that this task does not require.
 *
 * THROWS (via `narrowRoomReplies`) if the room has outgrown `ROOM_FETCH_LIMIT`
 * direct replies — see the module header for why that is the only safe answer
 * and what a caller does about it.
 */
export async function fetchRoomLog(
  auth: RpcAuth, spaceId: string, roomContentId: string,
): Promise<LogEntry[]> {
  return (await fetchRoom(auth, spaceId, roomContentId)).log;
}

/**
 * One fetch, both halves: the room's ordered log AND the checkpoints published
 * into it (spec §3.9). `fetchRoomLog` is this function with the checkpoints
 * dropped, kept because callers that only fold already import it.
 *
 * ONE round trip, not two. A checkpoint is a reply to the same room post as
 * every move, so a caller that fetched the log and the checkpoints separately
 * would be adopting a seed from one snapshot of the room and folding a log from
 * another — and the second fetch is not free either (the room is a single
 * `get_replies` of up to `ROOM_FETCH_LIMIT` rows, run on every `content_new`).
 *
 * THROWS (via `narrowRoomReplies`) if the room has outgrown `ROOM_FETCH_LIMIT`
 * direct replies — see the module header. Checkpoints make that ceiling arrive
 * sooner rather than later (they are replies too, one per publisher per hour),
 * which is why open item 12 records that whatever rotates a room has to decide
 * where checkpoints live at the same time.
 */
export async function fetchRoom(
  auth: RpcAuth, _spaceId: string, roomContentId: string,
): Promise<{ log: LogEntry[]; checkpoints: CheckpointEntry[] }> {
  return splitRoomReplies(await fetchRoomReplies(auth, roomContentId));
}

/**
 * One room's raw direct replies. Split out from `fetchRoom` so `fetchRooms`
 * below can concatenate several rooms' replies and hand the WHOLE union to a
 * SINGLE `splitRoomReplies` — see that function on why one pass matters.
 *
 * A room that has never been minted comes back EMPTY rather than failing:
 * `get_replies` never checks that the parent exists, it just asks the chain
 * store's parent index for children and returns whatever that yields
 * (methods.rs:9628-9640). That is what makes "nobody played last hour" cost
 * nothing — the previous hour's room is simply a room with no replies in it.
 */
async function fetchRoomReplies(auth: RpcAuth, roomContentId: string): Promise<RawReply[]> {
  const result = await rpcCall<GetRepliesResult>(auth, 'get_replies', {
    content_id: roomContentId,
    limit: ROOM_FETCH_LIMIT, // the node defaults to 1000 and clamps nothing
    depth_limit: 0, // direct replies only — see the module header
  });

  return narrowRoomReplies(result, roomContentId, ROOM_FETCH_LIMIT);
}

/**
 * SEVERAL rooms, folded into one log and one checkpoint set — the crossing.
 *
 * `roomContentIds` is what `water.roomEpochsFor` chose, mapped to ids: the
 * epoch being folded and the one before it. That function carries the whole
 * argument for why it is two and why it stays two for a full hour; this one is
 * the mechanism.
 *
 * ## ONE `splitRoomReplies` OVER THE CONCATENATION, NOT ONE PER ROOM
 *
 * Merging two already-ordered logs would need a second ordering rule, and a
 * second ordering rule is a second place two clients can disagree — the exact
 * hazard `splitRoomReplies` cites for not sorting checkpoints. Concatenating
 * the RAW replies and splitting once means `orderLog`'s (ms, hash) total order
 * runs exactly once over the union, and the dedupe runs once across all of it.
 *
 * ## THE FETCHES ARE CONCURRENT, AND THE SNAPSHOT IS STILL HONEST
 *
 * `Promise.all`, so the crossing costs one round trip's latency rather than
 * two. The two responses are therefore from very slightly different instants —
 * which is harmless in a way that a split log/checkpoint fetch would not have
 * been: the rooms are DISJOINT by construction (a reply has exactly one
 * parent), so no entry can be seen twice or missed between them, and the fold
 * is a pure function of the SET it is handed (shoalLoop.ts section 2). A late
 * arrival is absorbed by the next poll exactly as one from a single room is.
 *
 * THROWS if ANY room has outgrown `ROOM_FETCH_LIMIT` — see the module header.
 * With a room per hour that is the emitter's rate for a full hour against a
 * 100_000 ceiling, i.e. it should now never fire; if it does, the rotation has
 * stopped rotating and folding a truncated log would be worse than stopping.
 */
export async function fetchRooms(
  auth: RpcAuth, roomContentIds: readonly string[],
): Promise<{ log: LogEntry[]; checkpoints: CheckpointEntry[] }> {
  const perRoom = await Promise.all(
    roomContentIds.map((id) => fetchRoomReplies(auth, id)),
  );
  return splitRoomReplies(perRoom.flat());
}

// ===================================================================================
// WHICH ROOM — the room is a function of the hour
// ===================================================================================

/**
 * ## THE ROOM IS A FUNCTION OF THE HOUR
 *
 * Everything above this line assembles ONE room's log and refuses to answer once
 * that room outgrows a single fetch. This section is the other half: WHICH room,
 * and it exists because the ceiling above is not a distant hazard. Spec §2.15's
 * healthy shoal is 25 swimmers; `shoalEmit.ts`'s own cadence puts each of them
 * at a write every 3-8 seconds; that is 11_250-30_000 replies an hour into one
 * post. `ROOM_FETCH_LIMIT` is 100_000. So a single room is a matter of hours,
 * and rotating it is not an optimisation — it is the only thing standing between
 * the game and `narrowRoomReplies` throwing forever.
 *
 * It rotates HOURLY, on the epoch boundary the fold and the checkpoints already
 * run on (`epoch.ts`, `EPOCH_MS` = 3_600_000). Not a second clock: `roomIdAtMs`
 * composes `epochOf` and nothing else, so "which room" and "which fold" can
 * never answer differently about the same instant.
 *
 * ## THIS IS CONSENSUS, AND A WRONG DERIVATION HAS NO SYMPTOM
 *
 * Read this before changing a single byte below. Two clients that derive
 * different rooms for the same hour are not in a degraded world or a staler one
 * — they are in DIFFERENT worlds and cannot see each other at all. What each of
 * them sees is a calm, empty, entirely healthy sea: no error, no warning, no
 * missing peer, nothing to debug. That is strictly worse than the truncation
 * failure above, which at least produces a fold that disagrees with somebody.
 *
 * The defence is that the derivation is PINNED as a literal in
 * `shoalRoom.test.ts` — `sha256("The Shoal\n\nroom:shoal:v1:main:0")` and the
 * same for epoch 495936 — hand-derived offline with three SHA-256
 * implementations that are not this one. Any change to the grammar, the tag, the
 * separator or the number formatting fails those checks loudly instead of
 * forking the population silently. DO NOT "FIX" A FAILING PIN BY UPDATING IT.
 * A pin that has to change is a hard fork of every room ever derived, and it
 * needs the same treatment as a fold rule (project_fold_rules_are_permanent):
 * decided deliberately, versioned in the tag below, never edited in passing.
 *
 * ## THE IDENTIFYING BYTES, AND WHY THEY ARE THESE
 *
 * A room is a POST, and `submit_post` derives its content id from the post's
 * text and nothing else: `content_id = "sha256:" + hex(sha256(`${title}\n\n${body}`))`
 * (src/rpc/methods.rs:2221-2223). So a room is fully determined by two strings,
 * and the whole job is choosing them. For epoch N in a water named W:
 *
 *     title = "The Shoal"
 *     body  = "room:shoal:v1:" + W + ":" + N        (N in plain decimal)
 *
 * i.e. the hashed preimage is `The Shoal\n\nroom:shoal:v1:main:495936`.
 *
 * **Why the title is constant and all the identity is in the body.** One string
 * with one grammar is one place to be wrong. It also makes "different epochs
 * never collide" a claim about a single format rather than about an interaction
 * between two, and keeps the human-readable half stable for anyone reading a
 * node's content store.
 *
 * **Why `room:shoal:v1:` mirrors the space id's shape.** The water's own id is
 * `sha256("app:shoal:v1:main")[..15]` under a class byte — a frozen tag, a
 * version, and the name (`water.waterNamed`, src/types/space_class.rs:70-73).
 * The room uses the same discipline for the same reason: the tag says what kind
 * of thing this preimage names so it can never be confused with another one, and
 * the `v1` is where a future change to the grammar goes instead of into these
 * bytes.
 *
 * The `shoal` in that tag is FROZEN WIRE TEXT and is deliberately NOT read from
 * `WATER_APP`. It is not a reference to a constant that could be re-pointed: if
 * someone renamed the app constant, every room id ever derived would silently
 * move. (It is also why this module does not import `shellConfig` — `src/lib/`
 * does not depend on `src/ui/`, and this direction of that rule is load-bearing
 * rather than tidy: the derivation must be usable by the smoke scripts and by
 * whatever mints a room, none of which have a UI.)
 *
 * **Why the WATER NAME is in the preimage, and why it is a parameter.** THE
 * SPACE IS NOT IN THE HASH. `submit_post` hashes title and body only, and
 * `get_replies` is keyed on the parent content id alone — so two spaces whose
 * room posts share a title and body share ONE room and one reply set. That is
 * content addressing working correctly, not a node bug, and "fixing" it by
 * salting the preimage with a space id would re-score every content id ever
 * minted. The obligation is ours: a room that must stay separate needs separate
 * TEXT. `scripts/regtest-smoke.ts` records the near miss — its moves would
 * have landed in the water people play in. So the water name is in the body, and
 * it is a parameter rather than a constant because the smoke scripts
 * (`@shoal:smoke`, `@shoal:two`, `@shoal:cp`) are exactly the callers that must
 * get a different answer.
 *
 * Callers pass the DISPLAY name (`main`), not the marker form (`@shoal:main`) —
 * the same distinction `WATER_NAME` and `WATER_SPACE_NAME` already draw, and the
 * single most likely way to derive a real, healthy, reply-able room that is
 * shared with nobody. `roomTextFor` therefore REJECTS a water containing `:`
 * rather than deriving from it, which also makes the grammar's fields
 * unambiguous: no field but the last can contain the delimiter, so
 * `(water, epoch)` is recoverable from the body and two distinct pairs can never
 * spell the same bytes.
 *
 * **Why the epoch is spelled in plain decimal, and checked.** `${epoch}` on a
 * safe integer is always plain decimal — exponent notation starts at 1e21, three
 * orders of magnitude past `Number.MAX_SAFE_INTEGER` — and `${-0}` is `"0"`, so
 * the `-0` that `Math.floor` can hand back derives the same room as `0` rather
 * than a private `"-0"` one. Both are pinned in the test. A NON-integer epoch
 * would quietly spell `495936.5` and derive a room of its own, and `NaN` would
 * derive one called `NaN`, so `roomTextFor` throws on anything that is not a
 * safe integer. That is the tripwire for this project's integer-math-only rule
 * in `src/lib/`, at the one place where breaking it splits the population.
 *
 * ## WHAT THIS SECTION DOES NOT DO
 *
 * It does not read a clock: `roomIdAtMs` takes the instant as an argument, the
 * way every other function in `src/lib/` does. It does not decide WHEN to cross
 * from one room to the next (`water.roomEpochsFor` — two rooms, always, and it
 * says why), nor who publishes the room post for an hour nobody has minted yet
 * — `submit_reply` rejects an unknown parent outright
 * (src/rpc/methods.rs:3204-3218), so an hour's post has to exist before its
 * first move can land. Minting is `chainSea.ts`'s: every client mints every
 * hour's room idempotently, so no client waits on any other.
 *
 * It also does not bind this water name to the SPACE the writes go into. That
 * is `water.ts`'s whole reason for existing — see its header. Prefer
 * `water.roomIdIn(water, epoch)` over `roomIdFor(name, epoch)` everywhere in
 * the app.
 *
 * `shellConfig.ts`'s fixed `ROOM_TITLE`/`ROOM_BODY`/`roomContentId` were the
 * single never-rotating room this replaced, and they are gone.
 */

/**
 * Every room's title, in every water and every hour. Constant on purpose — all
 * of a room's identity lives in its body (see the section header). Exported so
 * whatever mints an hour's post types no literal of its own.
 */
export const ROOM_TITLE = 'The Shoal';

/**
 * The frozen head of every room body: what kind of thing this preimage names,
 * and which version of the grammar spells it. NOT derived from `WATER_APP` —
 * see the section header on why re-pointing it must be impossible. A change
 * here is a hard fork of every room; it goes in `v2`, alongside a decision about
 * what happens to `v1`'s rooms.
 */
const ROOM_BODY_TAG = 'room:shoal:v1';

/** A room post's two identifying strings. Together they ARE the room: the node
 *  hashes `${title}\n\n${body}` and that hash is the content id. */
export interface RoomText {
  readonly title: string;
  readonly body: string;
}

/**
 * The longest a water's display name may be. Not a node limit — a limit on how
 * much of a permanent consensus preimage one field may occupy, and a bound on
 * anything that could be pasted in by accident.
 */
const MAX_WATER_NAME_LEN = 32;

/**
 * The whole grammar of a water name: lowercase alphanumerics in hyphen-joined
 * groups. No leading, trailing or doubled hyphen, and no other character at
 * all.
 */
const WATER_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Refuse anything that is not a water name, before it can reach a hash
 * preimage. Used by `roomTextFor` below and by `water.waterNamed` (which
 * re-exports it), so the room body and the space id cannot disagree about what
 * a legal name is.
 *
 * ## WHY THIS IS AN ALLOWLIST, WHEN TASK 1 SHIPPED A DENYLIST
 *
 * Task 1 rejected `''`, `:` and `\n` — the three ways anyone had thought of to
 * spell a room nobody shares. A denylist over a PERMANENT CONSENSUS PREIMAGE is
 * a list of the mistakes somebody happened to think of, and the review found
 * four more within a minute of looking:
 *
 *  - `roomTextFor(['main:x'] as any, 1)` passed the colon guard and spelled
 *    `room:shoal:v1:main:x:1`. `Array.prototype.includes(':')` asks whether any
 *    ELEMENT equals `':'`, not whether the text contains one — a guard written
 *    for strings simply does not run on a value that is not one. This is why
 *    the `typeof` check below is first and is the load-bearing one.
 *  - `'main '`, `'main\r'`, `'main\t'` and `'main\0'` are four more waters, and
 *    no rendering of any of them differs from `main`.
 *  - `'máin'` in NFC (U+00E1) and in NFD (`a` + U+0301) are two different byte
 *    strings that are pixel-identical in every font, so a player told to join
 *    "máin" lands in one or the other depending on which keyboard, editor or
 *    clipboard produced the string — and the two never see each other.
 *  - `'Main'` is not `'main'`. Case is a different preimage, not a hint.
 *
 * The allowlist answers all of those at once, and every case nobody has thought
 * of yet, which is the point of an allowlist. It NARROWS what is accepted and
 * changes no accepted name's bytes, so no room id that has ever been derived
 * moves — the pinned literals below are the proof of that and they are
 * unchanged.
 */
export function assertWaterName(water: unknown): asserts water is string {
  if (typeof water !== 'string') {
    throw new RangeError(
      `assertWaterName: a water name must be a string, got ${Object.prototype.toString.call(water)} `
      + `(${JSON.stringify(water)}). A non-string reaches template interpolation intact and spells `
      + 'a room body of its own — an array bypassed the colon guard this replaces.',
    );
  }
  if (water.length > MAX_WATER_NAME_LEN) {
    throw new RangeError(
      `assertWaterName: a water name may be at most ${MAX_WATER_NAME_LEN} characters, got `
      + `${water.length} (${JSON.stringify(water)}).`,
    );
  }
  if (!WATER_NAME_RE.test(water)) {
    throw new RangeError(
      'assertWaterName: a water name must be lowercase alphanumerics in hyphen-joined groups '
      + `(${WATER_NAME_RE.source}), got ${JSON.stringify(water)}. This string goes into two `
      + 'permanent hash preimages, and every near-miss it could carry — a trailing space, a CR '
      + 'or TAB or NUL, an NFD-decomposed accent, a capital letter, the marker form '
      + '`@shoal:main` — derives a space and a room that are real, healthy, reply-able and '
      + 'shared with nobody. Pass the DISPLAY name (`main`), never the marker form.',
    );
  }
}

/**
 * The identifying text of the room for `epoch` in the water named `water`.
 * Pure, integer-only, and the whole of the derivation — everything else in this
 * section is hashing or composition.
 *
 * `water` is the space's DISPLAY name (`main`), never the marker form
 * (`@shoal:main`); anything that is not a plain lowercase name throws rather
 * than deriving a room nobody else shares (`assertWaterName`). `epoch` must be
 * a safe integer, for the same reason. See the section header for both.
 *
 * PREFER `water.roomTextIn(water, epoch)`, which takes the `Water` whose space
 * id was derived from this same name. This string form is the pinned primitive;
 * calling it directly from app code is what unbinds the room from the space, and
 * a source scan in shoalRoom.test.ts fails if anything but `water.ts` does.
 */
export function roomTextFor(water: string, epoch: number): RoomText {
  if (!Number.isSafeInteger(epoch)) {
    throw new RangeError(
      `roomTextFor: epoch must be a safe integer, got ${JSON.stringify(epoch)}. A fractional ` +
      'epoch spells a room of its own (`…:495936.5`) and NaN spells one called `NaN` — both ' +
      'are rooms no other client derives, i.e. a private sea with no symptom. Pass ' +
      'epochOf(ms), which floors.',
    );
  }
  assertWaterName(water);
  return { title: ROOM_TITLE, body: `${ROOM_BODY_TAG}:${water}:${epoch}` };
}

/**
 * The room an INSTANT falls in — `roomTextFor` composed with `epochOf`, the
 * fold's own clock. Every instant inside one hour gives one room, so a client
 * that joins at :00 and one that joins at :59 are in the same water.
 *
 * `ms` is an argument, never a clock read: nothing in `src/lib/` reads the wall
 * clock (see the section header).
 */
export function roomTextAtMs(water: string, ms: number): RoomText {
  return roomTextFor(water, epochOf(ms));
}

/**
 * The exact bytes `submit_post` hashes: `${title}\n\n${body}`
 * (src/rpc/methods.rs:2221). Exported because the PoW miner needs the same
 * preimage the node will re-derive, and every site that spelled that template
 * itself is a place the two could disagree.
 */
export function roomPreimage(text: RoomText): string {
  return `${text.title}\n\n${text.body}`;
}

/**
 * The room's content id for `epoch` — `sha256:<hex>`, derived the way the node
 * derives it, so it needs no lookup, no configuration and no discovery.
 *
 * Async only because `hash-wasm` is (the same digest `shoalSend` mines over).
 * The value is constant for a given `(water, epoch)` and callers should hold it
 * for the hour rather than recompute it per write.
 */
export async function roomIdFor(water: string, epoch: number): Promise<string> {
  const hasher = await createSHA256();
  hasher.update(new TextEncoder().encode(roomPreimage(roomTextFor(water, epoch))));
  return `sha256:${hasher.digest('hex')}`;
}

/** The content id of the room an instant falls in. `roomIdFor` composed with
 *  `epochOf` — see `roomTextAtMs`. */
export async function roomIdAtMs(water: string, ms: number): Promise<string> {
  return roomIdFor(water, epochOf(ms));
}
