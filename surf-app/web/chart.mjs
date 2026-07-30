// The Chart (Surf Phase B, Task 5, decision B3, spec §3.4). Pure — no DOM, no
// RPC calls. Pull down from the top -> a vertical water column, surface to
// trench, channels sitting at their fixed band depths, each glowing by
// engagement recency ("brightness is truth"). Mooring is a distinct
// horizontal flick, cap MOOR_CAP, localStorage-persisted by the shell.
import { glow, MOOR_CAP } from './policy.mjs';
import { freshestTs } from './deadair.mjs';

// §3.4's fixed, sparse band ranges (assigned at registry time, never
// renumbered): surface 2-19, mid-water 20-49, reef 50-79, trench 80-98.
// Boundaries (tested exactly): 19->surface, 20->mid, 49->mid, 50->reef,
// 79->reef, 80->trench.
export function bandOf(number) {
  if (number < 20) return 'surface';
  if (number < 50) return 'mid';
  if (number < 80) return 'reef';
  return 'trench';
}

// channels: channels.json's array ({id, number, name, spaces}).
// healthByChannel: a plain object { [channelId]: SpaceHealthEntry[] } — the
// shell's ALREADY-FETCHED get_space_health results, bucketed per METERED
// channel. A channel absent from this object (or mapped to []) is treated as
// "no matching health entries", NOT as unmetered — see the unmetered branch
// below, which is decided from `ch.spaces` alone and never looks at
// healthByChannel at all.
// warmSet/moored: anything exposing .has(id) (Set) or .includes(id) (Array)
// — deck.warm returns a plain array, the moored ledger is a Set; both are
// accepted so neither caller has to convert.
// now: epoch MILLISECONDS (Date.now()).
//
// Returns rows in canonical dial order — number ascending == depth order,
// per §3.4 ("One canonical sequence: dial order = Chart order = depth
// order"), regardless of the input channels' order.
//
// THE BLOCKER (review-hardened): a channel with spaces:[] (wiki, reef today
// — undriven live clients, not decayed spaces) is UNMETERED. It NEVER calls
// freshestTs/glow at all — glowValue stays null and unmetered:true. This is
// deliberately distinct from a channel WITH declared spaces that has no
// matching (or all-null) health entries, which gets glowValue 0 — measured
// and confirmed dead, honest, exactly deadair.mjs's null last_engagement_ts
// framing. Collapsing the two onto the same "0" reading would render a
// never-driven channel (wiki/reef) as "recently dead" instead of "no
// telemetry exists for this channel" — a false claim about data that was
// never gathered.
export function chartRows(channels, healthByChannel, warmSet, moored, now) {
  const has = (collection, id) =>
    collection?.has ? collection.has(id) : !!collection?.includes?.(id);
  return channels
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((ch) => {
      const unmetered = !ch.spaces || ch.spaces.length === 0;
      let glowValue = null;
      if (!unmetered) {
        const entries = healthByChannel?.[ch.id] ?? [];
        const ts = freshestTs(entries); // THE one aggregation point (deadair.mjs) — not re-implemented here
        const ageSeconds = ts != null ? (now - ts * 1000) / 1000 : null;
        glowValue = glow(ageSeconds);
      }
      return {
        id: ch.id,
        number: ch.number,
        name: ch.name,
        band: bandOf(ch.number),
        glowValue,
        unmetered,
        afterglow: has(warmSet, ch.id),
        moored: has(moored, ch.id),
      };
    });
}

// Toggle a channel's moored state. Pure: never mutates the input Set.
// - Already moored -> returns a NEW Set with it removed.
// - Not moored, under cap -> returns a NEW Set with it added.
// - Not moored, AT cap -> returns the ORIGINAL `moored` reference, UNCHANGED
//   (not a copy) — the shell tests `result === moored` to know whether the
//   toggle actually happened, and surfaces a brief "deck full" note when it
//   didn't, without a second size check.
export function toggleMoor(moored, id, cap = MOOR_CAP) {
  if (moored.has(id)) {
    const next = new Set(moored);
    next.delete(id);
    return next;
  }
  if (moored.size >= cap) return moored;
  const next = new Set(moored);
  next.add(id);
  return next;
}
