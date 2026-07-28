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
 * A room post never rotates (epochs roll the FOLD, not the room), so its direct
 * replies accumulate for the life of the room, forever. `limit` is NOT clamped
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
import type { LogEntry } from './shoalTypes';
import { decodeBody } from './shoalWire';
import { orderLog } from './shoalEngine';
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
  const seen = new Set<string>();
  const entries: LogEntry[] = [];
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

    // id/hash come from the reply's own envelope — never from `body`, which a
    // hostile client fully controls. This is the load-bearing line in this module.
    const entry = decodeBody(r.body, r.author_id, r.content_id);
    if (entry === null) continue; // malformed/hostile body: drop it, don't poison the room
    entries.push(entry);
  }
  return orderLog(entries);
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
  auth: RpcAuth, _spaceId: string, roomContentId: string,
): Promise<LogEntry[]> {
  const result = await rpcCall<GetRepliesResult>(auth, 'get_replies', {
    content_id: roomContentId,
    limit: ROOM_FETCH_LIMIT, // the node defaults to 1000 and clamps nothing
    depth_limit: 0, // direct replies only — see the module header
  });

  return repliesToLog(narrowRoomReplies(result, roomContentId, ROOM_FETCH_LIMIT));
}
