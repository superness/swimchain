# Surf Phase B â€” decision sheet

**Date:** 2026-07-29 Â· **Status:** awaiting operator rulings Â· **Spec:** `2026-07-28-surf-channel-app-design.md` Â§3.3, Â§3.4, Â§5 B, Â§9

Every fact below was verified in the worktree tonight (file:line in parentheses). Each dial ends with a RULING line for you to fill. Nothing here is consensus â€” per the fold-rules law, everything below is node-policy or client-policy and stays tunable.

---

## B1 â€” What `get_space_health` actually exposes (the honesty problem)

**Fact:** the spec says "expose `compute.rs` metrics plus last-engagement recency" â€” but `compute.rs`'s score is half-fake today. Two of its four inputs are hardcoded stubs: `posts_at_risk` always 0 (`space_health/risk.rs:121-128`) and `last_sync_age` always 0, which silently awards every space full sync points (`manager.rs:199-201`). The manager is never constructed anywhere in `src/` and both of its consumers (notification trigger, P2P query handler) are unwired stubs (`router.rs:1520-1541`). Exposing `health_score` as-is would make the Chart's "brightness is truth" a lie on day one.

**Also fact:** per-space **engagement recency is genuinely derivable from the synced chain** â€” Engage actions land in `ContentBlock.actions` on blocks keyed by the target's space (`methods.rs:4019-4030`), and a precedent loop already folds engage timestamps into `SpaceSummary.last_activity` (`methods.rs:5690-5709`). This works for spaces you never followed â€” the spec's claim holds.

**Options:**
- **(a) Minimal-honest RPC (recommended):** new `get_space_health` returning only fields that are real: `{ space_id, last_engagement_ts, engagements_7d, unique_actors_7d, active_swimmers }`, derived by a chain scan behind the same 3s-TTL cache pattern `list_spaces` uses (`methods.rs:5570`). No `health_score` until its inputs are real. Chart glow maps from recency.
- **(b) Finish the health subsystem first:** wire the manager, implement real posts_at_risk + sync age, then expose the full score. Node-side scope roughly triples; B slips.
- **(c) No new RPC:** Chart glows from `list_spaces.last_activity` alone. Cheapest, but no engagement-vs-post distinction and no 7d aggregates.

**RULING B1:** (a) minimal-honest RPC — real fields only, no fake score. *(Operator delegated 2026-07-29 22:41; recommendation adopted.)*

## B2 â€” Dwell-engage mechanics (Â§3.3's open dials, Â§9)

**Facts:** `submit_engagement` has **no weight/kind field** â€” the only magnitude on the wire is `pow_work = 2^difficulty/1000+1` (`methods.rs:3999`), so "low-weight" mechanically means "minimum PoW difficulty the node accepts." There is **no per-content/24h rate limit anywhere node-side** (only the generic 120-writes/min RPC bucket, `rate_limiter.rs:70,112`) â€” the spec's 24h rule must be shell-enforced policy. Mining must run in a Worker (the hash-wasm event-loop trap is a known repo-wide gotcha). PoW difficulty units are zero BITS, and byte-counting miners over-mine 8Ã— (standing memory).

**Signing wrinkle (needs your eyes):** the shell holds no key material â€” the seed never leaves the node (Â§2.5). To sign `engage:{content_id}:{nonce}:{timestamp}` (`methods.rs:3918-3937`) the shell must call the node's `sign_message` RPC over loopback+cookie. Â§2.4 bans `sign_message` from any *channel grant*; the shell is not a channel and is baked trusted code, so I read this as within the letter and spirit for the A/B era â€” Phase D's purpose-scoped signing replaces it. But it's a security-posture call and it's yours.

**Proposed dials:** N = **45s** continuously tuned before the miner starts; K = **3** most-recent items actually rendered (same-origin DOM peek can read them, or the shell re-uses its listing call); weight = **node-minimum action difficulty**; rate limit = **1 per content per 24h, shell-side ledger** (localStorage, honest-best-effort); receive-only channels: try once, on sponsorship rejection mark the channel receive-only for the session and go silent (Â§2.5 â€” no error, no nag).

**RULING B2:** N=45s, K=3, node-minimum difficulty, 24h shell-side ledger, and sign_message via the shell over loopback+cookie is approved for the A/B era (never in any channel grant; Phase D replaces it). *(Operator delegated; recommendation adopted.)*

## B3 â€” The Chart: glow mapping + mooring

**Facts:** bands and numbering are already decided in the spec (Â§3.4, struck from Â§9). What's open is presentation policy: the recencyâ†’brightness curve, and the mooring flick.

**Proposed:** glow = log-scaled recency â€” full phosphor <6h, fading through 2d, ember at 5d, near-black past 7d (matches the content half-life so the Chart *is* the decay made visible); warm-deck channels additionally carry the Â§3.4 afterglow. Mooring = horizontal flick on a Chart row toggles moored; moored buoys cycle via horizontal flick on the set (distinct from the vertical dial per Â§3.4); moored set persisted in localStorage; cap at 3 (the measured warm size is the natural cap).

**RULING B3:** log-scaled glow tied to the 7-day half-life; mooring by horizontal flick, cap 3, localStorage-persisted. *(Operator delegated; recommendation adopted.)*

## B4 â€” Trench on the phone dial (Â§9, unanswered in spec)

**Fact:** TheTrench is a PC exe (node-homestead game); there is no web bundle to bake â€” putting it on the phone dial would mean building a new web client, which is nowhere in scope.

**Proposed:** ruled out for B â€” "desktop-only, revisit at E." The dial stays feed/wiki/reef until C adds the rest of the baked fleet.

**RULING B4:** Trench ruled out for B — desktop-only, revisit at E. *(Operator delegated; recommendation adopted.)*

## B5 â€” Bootstrap-via-health (closes A1's debt row)

**Fact:** first-run acquisition currently depends on three hardcoded /browse spaces staying body-bearing; `list_spaces` already returns all known spaces sorted by `last_activity` desc with `post_count` (`methods.rs:5868`, `types.rs:747-782`) and is auth-exempt.

**Proposed:** acquisition's follow-set becomes top-N (N=3) spaces from `list_spaces` filtered to `class == "social"` (or B1's RPC once it exists, preferring engagement recency), with the current hardcoded three as the fallback when the listing is empty (true first run before any sync â€” the static covers that wait regardless).

**RULING B5:** bootstrap = top-3 social spaces from list_spaces (B1 RPC preferred once live); hardcoded trio becomes fallback. *(Operator delegated; recommendation adopted.)*

## B6 â€” Dead Air thresholds (Â§3.3)

**Proposed** (all client policy, tuned against the 7-day half-life): last engagement <2d = alive, no card; 2â€“5d = test card with `LAST SIGNAL: N DAYS AGO`, flare available; >5d = `THIS CHANNEL IS DYING`, flare available; flare's target = the space's most recent surviving item via the B1 listing (spec-defined fallback text when nothing is retrievable). Flare = `request_content` + one engage on arrival, same signing path as B2.

**RULING B6:** 2d/5d thresholds; flare = request_content + one engage on the newest surviving item. *(Operator delegated; recommendation adopted.)*

---

## Not in B (fences, for the record)

Night Swim + Channel 0 (Â§3.5 â€” not in Â§5 B's list), any client-source changes, the dial/registry, `get_space_health` v2 with a real score (that's the B1(b) future), node-side engagement rate limiting (policy stays client-side until someone abuses it), release signing/size gates.

## Standing note

The G2 WebView soak + on-device long-press check remain open from A1 â€” deliberately skipped for now per operator; they can ride any future device session.

