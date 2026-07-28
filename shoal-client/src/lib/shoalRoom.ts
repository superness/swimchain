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
}

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
 *  (`created_at`, `last_engagement`, `depth`, `child_count`, `display_name`,
 *  `media_refs`) are simply left off this narrowed type. */
interface NodeReply {
  content_id: string;
  author_id: string;
  body: string;
  parent_id: string;
  block_height: number | null;
}

interface GetRepliesResult {
  parent_id: string;
  replies: NodeReply[];
  total_count: number;
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
 */
export async function fetchRoomLog(
  auth: RpcAuth, _spaceId: string, roomContentId: string,
): Promise<LogEntry[]> {
  const result = await rpcCall<GetRepliesResult>(auth, 'get_replies', {
    content_id: roomContentId,
    limit: 100_000, // the node defaults to 1000; a long-lived room's history outgrows that
    depth_limit: 0, // direct replies only — see the module header
  });

  // REQUIRED, not defensive: depth_limit: 0 only bounds the node's chain-store
  // path (methods.rs:9464). The mempool/pending path (methods.rs:9473-9616) has no
  // depth gate on inclusion at all — it admits a pending reply purely by "is its
  // parent already known" and will chain-admit a reply-to-a-pending-reply across
  // its multi-pass loop, mislabelled depth: 0 regardless of depth_limit. Only this
  // parent_id check catches that case (see the module header for the full
  // line-by-line trace). Do not delete this as redundant with depth_limit: 0.
  const direct = result.replies.filter((r) => r.parent_id === roomContentId);

  const raw: RawReply[] = direct.map((r) => ({
    content_id: r.content_id,
    author_id: r.author_id,
    body: r.body,
    block_height: r.block_height,
  }));

  return repliesToLog(raw);
}
