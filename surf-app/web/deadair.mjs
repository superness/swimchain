// Dead Air + the flare (Surf Phase B, Task 4, decision B6, spec §3.3). Pure —
// no DOM, no RPC calls. Decayed channels are not hidden — you flip through
// them and hit a bleached SMPTE test card; a FLARE revives the channel by
// fetching + engaging its newest surviving item.
import { DEAD_AIR_FADING_DAYS, DEAD_AIR_DYING_DAYS } from './policy.mjs';

// lastEngagementTs: unix SECONDS (get_space_health's SpaceHealthEntry field),
// or null for a known-but-never-engaged space — that classifies `dying`, not
// "no data": a space with zero chain engagements IS dead air (brief's own
// framing: "honest"). now: epoch MILLISECONDS (Date.now()).
//
// Boundary (ruling B6): strictly-greater-than-5d is `dying`; exactly 5d and
// the [2d, 5d] range is `fading`; under 2d is `alive`. The `>` on the dying
// check (not `>=`) is load-bearing — see deadair.test.mjs's exactly-5d case.
export function classifyDeadAir(lastEngagementTs, now) {
  if (lastEngagementTs == null) return { state: 'dying', days: Infinity };
  const days = (now - lastEngagementTs * 1000) / 86400_000;
  if (days > DEAD_AIR_DYING_DAYS) return { state: 'dying', days };
  if (days >= DEAD_AIR_FADING_DAYS) return { state: 'fading', days };
  return { state: 'alive', days };
}

// Freshest last_engagement_ts across a space's health entries, ignoring
// nulls. THE ONE place this aggregation happens — Task 4 (dead-air, below)
// and Task 5 (chart.mjs's healthByChannel) both call this instead of
// re-deriving it, so it exists once and is tested once.
export function freshestTs(entries) {
  const tss = entries.map((e) => e.last_engagement_ts).filter((ts) => ts != null);
  return tss.length ? Math.max(...tss) : null;
}

// A channel with no declared spaces (wiki, reef today — undriven live
// clients, not decayed spaces) is UNMETERED: there is no per-space chain
// engagement signal to fold for it. The shell must check this BEFORE ever
// calling get_space_health, not just before showing a card — per Task 1,
// an empty `space_ids` array means "all known spaces", which would credit
// an unrelated busy space's recency to this channel. This is the pure,
// unit-testable half of that guard.
export function isMetered(channel) {
  return !!(channel?.spaces && channel.spaces.length);
}

// Full pure classification for a channel given its ALREADY-FETCHED health
// entries (the shell owns the isMetered guard before ever fetching those
// entries — this re-checks it so the guard is independently provable by a
// mutation test, since shell.mjs itself has no test harness). Returns null
// when there is no card to show: unmetered channels (always), or a metered
// channel whose freshest engagement is still within the alive window.
export function classifyChannelDeadAir(channel, healthEntries, now) {
  if (!isMetered(channel)) return null;
  const classification = classifyDeadAir(freshestTs(healthEntries), now);
  return classification.state === 'alive' ? null : classification;
}

// The flare's target. Final-review fix (IMPORTANT 1): node truth
// (submit_engagement, src/rpc/methods.rs — verified in review) only records
// an ENGAGE when the target content is locally present
// (content_store.get() -> Some); against a body-less item it returns
// `engaged:false` and drops it silently. Firing engageOne() against a truly
// cold item wastes the mined PoW for nothing and leaves the flare's caller
// with zero feedback. So this now returns a shape the caller can act on:
//   - a body-PRESENT recent item, when one exists across the channel's
//     spaces — the common partly-warm case (some items landed, some
//     haven't yet) — { present: true }, engage it immediately.
//   - otherwise, the single newest metadata row (necessarily body-less,
//     since none qualified above) as the REQUEST target only —
//     { present: false } — the caller must request_content it and WAIT for
//     arrival before ever calling engageOne (spec §3.3: "engage it on
//     arrival"; see shell.mjs's pollFlareArrival).
// An item still returned by list_space_content is, by definition,
// "surviving" (decayed-to-zero content stops being listed) — the fallback
// branch still does NOT require a body up front, because the flare's own
// request_content call is what's meant to fetch it; requiring one before
// ever considering a channel flareable would make the flare permanently
// unable to revive a channel with nothing locally cached yet, which is
// precisely the case it exists for.
// Returns null when nothing is retrievable at all — the spec's "beyond
// flares" case.
export function pickFlareTarget(items) {
  if (!items.length) return null;
  const sorted = items.slice().sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  const present = sorted.find((it) => it.body);
  if (present) return { contentId: present.content_id, present: true };
  return { contentId: sorted[0].content_id, present: false };
}

// Poll predicate for the caller's arrival-wait loop (IMPORTANT 1, cont'd):
// given a FRESH list_space_content items array (re-fetched — not the stale
// listing pickFlareTarget was originally called on) and the content_id the
// flare requested, true once that item's body has landed. Pure — the shell
// wraps this in the actual RPC re-fetch + poll/timeout loop (DOM/RPC-wired,
// not unit-testable the way this predicate is; see shell.mjs's
// pollFlareArrival). Deliberately checked via list_space_content's own
// `.body` field rather than a get_content round-trip: get_content THROWS
// ContentNotFound when the body isn't locally present yet (src/rpc/
// methods.rs:5052 — no body:null success case), which would conflate "still
// fetching" with "genuine RPC error" if used to drive a poll; list_space_content
// already returns an explicit `body: null` row for chain-indexed-but-
// unfetched content, the same convention dwell.mjs's selectForEngage and
// shell.mjs's localItemCount/tuneDriver already rely on.
export function flareTargetReady(items, contentId) {
  return items.some((it) => it.content_id === contentId && !!it.body);
}

// Post-flare reclassification. On a SUCCESSFUL flare, the flare's own engage
// is the freshest engagement the instant it's submitted (chain+mempool law)
// — classify with `now` (converted to the same seconds unit
// get_space_health uses) standing in for lastEngagementTs, WITHOUT
// re-calling get_space_health (that RPC only reflects it after block
// inclusion, ~1-6 min — see get_space_health's 3s cache TTL vs. real block
// time). On a failed/no-op flare, the pre-flare lastEngagementTs is
// reclassified unchanged, so the card does not optimistically clear for an
// attempt that didn't land.
export function classifyAfterFlare(lastEngagementTs, now, flareOk) {
  const ts = flareOk ? Math.floor(now / 1000) : lastEngagementTs;
  return classifyDeadAir(ts, now);
}
