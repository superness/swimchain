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

// The flare's target: the single most-recent item across all of a channel's
// spaces. An item still returned by list_space_content is, by definition,
// "surviving" (decayed-to-zero content stops being listed) — this does NOT
// filter on `.body` the way dwell's selectForEngage does, because the
// flare's own request_content call is what fetches the body; requiring it
// up front would make the flare permanently unable to revive a channel with
// nothing locally cached, which is precisely the case it exists for. Returns
// null when nothing is retrievable — the spec's "beyond flares" case.
export function pickFlareTarget(items) {
  const sorted = items.slice().sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  return sorted.length ? sorted[0].content_id : null;
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
