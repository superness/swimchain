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
// itself draws `last_engagement_ts` from (src/rpc/methods.rs
// `build_space_list`, Source 2/3) -- a second RPC round-trip to re-rank by a
// numerically-equivalent signal would only add boot latency for no better
// data. get_space_health remains the Chart's own (separately fetched, B3)
// finer-grained per-space recency view once a channel is metered.
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
