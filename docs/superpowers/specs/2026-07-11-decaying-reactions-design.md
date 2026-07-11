# Decaying Reactions (one live reaction per user/emoji, 5-day decay)

**Date:** 2026-07-11
**Status:** Approved (operator-designed in session)

## Problem

Reactions currently **stack**: `ContentStore::add_reaction` always increments a
per-(content, emoji) counter, and `get_reactions` returns those raw totals. A
single user can add the same emoji unbounded times, so counts read as "someone
tapped N times" rather than "N people reacted." (A client-side runaway loop
exploited this and recorded hundreds of engagements before it was fixed.)

## Design (operator's model)

Reactions are engagement proof-of-work that resets a post's decay timer
(SPEC_02). Make reactions obey the same physics as content, with these rules:

1. **One live reaction per (user, post, emoji).** A user cannot stack the same
   emoji on the same post while their existing one is still live.
2. **Reactions decay on a 5-day lifetime.** A reaction older than 5 days is no
   longer "live" — it stops counting and the user may add that emoji again to
   renew the keep-alive.
3. **Different emojis are always allowed.** A user may hold one live reaction of
   each distinct emoji on a post simultaneously.
4. **Reactions never receive their own keep-alive** (nothing engages a
   reaction), so they only ever decay — the set of live reactions is
   self-cleaning; flood residue ages out on its own within 5 days.

Rationale for 5 days: a reaction keeps its post alive, so the post always
outlives the reaction; a 5-day reaction window sits inside the content's
effective lifetime and requires genuine recurring effort to sustain.

## Semantics of the count

`get_reactions` count for emoji E on post P = **number of distinct users whose
most-recent E-reaction on P is within the last 5 days.** Decayed reactions are
excluded. Each user contributes at most 1 to each emoji's count.

## Implementation

Constant: `REACTION_LIFETIME_MS = 5 * 24 * 60 * 60 * 1000` (5 days).

**Storage (`src/storage/content.rs`):**
- `Reaction` records are written per (content, reactor, reaction_type) into
  `reactions_tree` with the reaction `timestamp` (the tree + `reaction_key`
  already exist; `add_reaction` currently only bumps the counter — it must also
  persist the timestamped record, upserting on the stable key so re-reacting
  refreshes the timestamp).
- New `add_reaction_windowed(reaction, now_ms) -> Result<bool>`: returns
  `Ok(false)` (rejected, no count change) if a live reaction already exists for
  that (content, reactor, type) within `REACTION_LIFETIME_MS`; otherwise writes
  the record and returns `Ok(true)`.
- `get_reaction_counts` becomes window-aware: derive counts by scanning
  `reactions_tree` for the content, keeping reactions within the window, one per
  (reactor, type). Drop the pre-aggregated stacking counter as the source of
  truth for display (leave the tree writes harmless or remove).

**RPC (`src/rpc/methods.rs`):**
- `submit_engagement` (reaction path): call `add_reaction_windowed`. When it
  returns `Ok(false)`, respond with a clear, non-error result the client can
  show ("You already reacted with this emoji — it stays live for 5 days"),
  and DO NOT mine/record a duplicate. Gate BEFORE the engagement is recorded so
  a stacked reaction is not accepted.
- `get_reactions` passes `now` so counts reflect the live window.

**Client (`feed-client`):**
- `PostReactions`: reflect that a user's own live reaction is already applied
  (disable / show active state for emojis in `userReactions`), and surface the
  "already live" response instead of a generic failure.
- Reaction count display already renders per-emoji counts; no shape change
  (counts are now live-user counts).

## Out of scope

- Retroactively purging existing stacked counts (they age out within 5 days on
  their own once windowed counting is live).
- Changing decay for non-reaction engagement (pool contributions for survival).

## Verification

- Unit tests (storage): stacking the same emoji within 5 days is rejected and
  does not change the count; a different emoji is accepted; after 5 days the
  same emoji is accepted again; counts exclude decayed reactions and dedupe per
  user.
- On device: reacting 🤔 twice quickly yields count 1 (second tap is a no-op
  with a clear message); reacting 🔥 adds a distinct count; the pre-existing
  inflated 🤔×7 shrinks toward the live-user count as flood records age out.
