// Health-driven bootstrap (Surf Phase B, Task 6, decision B5, spec §3.1
// follow-up). Pure -- no DOM, no RPC calls. Closes A1's hardcoded-space debt:
// instead of always following channels.json's fixed feed trio, rank the
// node's OWN live `list_spaces` result and adopt the top-3 'social' spaces by
// recency as the feed channel's bootstrap set. Falls back to the
// caller-supplied set (channels.json's trio, passed in by the shell) when
// there is nothing to rank -- an empty `list_spaces` response (fresh node)
// or a response with no 'social'-classed space at all.
//
// Ranking source (brief note, "pick one, note it"): `list_spaces`' own
// `last_activity` field, NOT a second `get_space_health` call. `list_spaces`
// is already the one RPC this function consumes, and its `last_activity` is
// populated from the same content-block/mempool scan `get_space_health`
// draws its numbers from (src/rpc/methods.rs `build_space_list`,
// Source 2/3) -- but it is NOT the same signal as get_space_health's
// `last_engagement_ts`, and this comment previously overclaimed that it
// was ("numerically-equivalent"). `last_activity` counts ALL activity
// (posts and replies, not just engagements); `last_engagement_ts` counts
// only engagements. A space that is post-active but unengaged can rank near
// the top here and still show a fading/dying dead-air card moments later,
// once checkDeadAir's own get_space_health call runs against the very
// spaces this function just picked -- that divergence is real and expected,
// not a bug. It's a deliberate choice, not an oversight: `last_activity` is
// the right signal for THIS function's actual job -- "find a space with
// content to show" for the feed channel's bootstrap set -- and a second
// get_space_health round-trip here would only add boot latency to re-rank
// by a signal this function doesn't need. get_space_health remains the
// Chart's own (separately fetched, B3) finer-grained per-space
// engagement-recency view once a channel is metered.
//
// id-format (verified, not assumed -- src/rpc/types.rs SpaceSummary's own
// doc comment + methods.rs decode_space_id/parse_space_id_16): list_spaces'
// `space_id` field is always BECH32 ("sp1qqq..."), regardless of the hex ids
// channels.json declares for the static trio. Every downstream consumer of
// the picked ids -- follow_space, list_space_content, get_space_health --
// calls decode_space_id (or GetSpaceHealthParams' own "Hex or bech32"
// contract) internally, which accepts bech32 OR hex equally. So the picked
// ids are stored and passed through exactly as list_spaces returns them --
// no re-encoding needed anywhere in this module or in shell.mjs.
export function pickBootstrap(listSpacesResult, fallbackSpaces) {
  const spaces = listSpacesResult?.spaces ?? [];
  const social = spaces.filter((s) => s.class === 'social');

  // CURATED FIRST. Ranking by raw recency hands the first impression to
  // whichever account posts most often, which on mainnet is an automated
  // relay: on 2026-08-02 the freshest social space was "Bot talk" (277 posts,
  // 0.0d) republishing r/dankmemes, so a stranger who had just been vouched
  // for by a human landed on exactly that. The curated set in channels.json
  // is the operator's editorial choice for a first run and must win whenever
  // it is actually present on this node.
  //
  // This does NOT reinstate A1's hardcoded-space debt that B5 removed: the
  // curated ids are preferred only while at least one of them is REAL on this
  // node (present in list_spaces). If they all decay away or were never
  // synced, discovery below still takes over, which is the resilience B5 was
  // after. `curatedLive` is deliberately membership-only — a curated space
  // with no engagement yet is still the right thing to show a newcomer, and
  // dead-air has its own separate suppression for a first reveal.
  const known = new Set(spaces.map((s) => s.space_id));
  const curatedLive = (fallbackSpaces ?? []).filter((id) => known.has(id));
  if (curatedLive.length) {
    // Same-reference signal when nothing changed, matching this function's
    // existing contract with the shell (see the fallback return below).
    return curatedLive.length === (fallbackSpaces ?? []).length ? fallbackSpaces : curatedLive;
  }

  // Same reference, not a copy -- the shell's own signal (matches chart.mjs's
  // toggleMoor idiom: an unchanged `=== ` reference means "nothing to adopt,
  // don't persist") to skip overwriting byId.get(feed).spaces and skip the
  // surf.feedSpaces write, leaving channels.json's trio live untouched.
  if (!social.length) return fallbackSpaces;
  return social
    .slice()
    .sort((a, b) => (b.last_activity ?? -1) - (a.last_activity ?? -1))
    .slice(0, 3)
    .map((s) => s.space_id);
}

export const FEED_SPACES_KEY = 'surf.feedSpaces';

// Boot-time re-apply source: the persisted live-picked bootstrap set, if a
// PRIOR boot's acquisitionBoot successfully picked and persisted one. Pure
// w.r.t. DOM (takes a store -- localStorage or a test fake with
// .getItem(key), matching dwell.mjs's ledgerHas/ledgerMark and chart.mjs's
// loadMoored convention). Any parse failure, wrong shape (not an array, or
// an array of non-strings), or a stored-but-empty array all degrade to null
// -- "nothing usable was persisted" -- rather than throwing at shell.mjs's
// module top level (loadMoored's own review-fixed precedent: a bad
// localStorage value must never brick the whole boot) or silently adopting
// an empty spaces list (which would look identical to "no bootstrap spaces
// at all" downstream, worse than just falling through to channels.json's
// trio).
export function loadFeedSpaces(store, key = FEED_SPACES_KEY) {
  try {
    const raw = store.getItem(key);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    if (!parsed.every((s) => typeof s === 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}
