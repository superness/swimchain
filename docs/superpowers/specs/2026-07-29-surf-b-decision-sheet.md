# Surf Phase B — decision sheet

**Date:** 2026-07-29 · **Status:** RULED (all six dials operator-delegated 2026-07-29 22:41) · **Spec:** `2026-07-28-surf-channel-app-design.md` §3.3, §3.4, §5 B, §9

Every fact below was verified in the worktree tonight (file:line in parentheses). Nothing here is consensus — per the fold-rules law, everything below is node-policy or client-policy and stays tunable.

---

## B1 — What `get_space_health` actually exposes (the honesty problem)

**Fact:** the spec says "expose `compute.rs` metrics plus last-engagement recency" — but `compute.rs`'s score is half-fake today. Two of its four inputs are hardcoded stubs: `posts_at_risk` always 0 (`space_health/risk.rs:121-128`) and `last_sync_age` always 0, which silently awards every space full sync points (`manager.rs:199-201`). The manager is never constructed anywhere in `src/` and both of its consumers (notification trigger, P2P query handler) are unwired stubs (`router.rs:1520-1541`). Exposing `health_score` as-is would make the Chart's "brightness is truth" a lie on day one.

**Also fact:** per-space **engagement recency is genuinely derivable from the synced chain** — Engage actions land in `ContentBlock.actions` on blocks keyed by the target's space (`methods.rs:4019-4030`), and a precedent loop already folds engage timestamps into `SpaceSummary.last_activity` (`methods.rs:5690-5709`). This works for spaces you never followed — the spec's claim holds.

**Options:**
- **(a) Minimal-honest RPC (recommended):** new `get_space_health` returning only fields that are real: `{ space_id, last_engagement_ts, engagements_7d, unique_actors_7d }`, derived by a chain scan behind the same 3s-TTL cache pattern `list_spaces` uses (`methods.rs:5570`). No `health_score` until its inputs are real. Chart glow maps from recency.
- **(b) Finish the health subsystem first:** wire the manager, implement real posts_at_risk + sync age, then expose the full score. Node-side scope roughly triples; B slips.
- **(c) No new RPC:** Chart glows from `list_spaces.last_activity` alone. Cheapest, but no engagement-vs-post distinction and no 7d aggregates.

**RULING B1:** (a) minimal-honest RPC — real fields only, no fake score. *(Operator delegated; recommendation adopted.)*

## B2 — Dwell-engage mechanics (§3.3's open dials, §9)

**Facts:** `submit_engagement` has **no weight/kind field** — the only magnitude on the wire is `pow_work = 2^difficulty/1000+1` (`methods.rs:3999`), so "low-weight" mechanically means "minimum PoW difficulty the node accepts." There is **no per-content/24h rate limit anywhere node-side** (only the generic 120-writes/min RPC bucket, `rate_limiter.rs:70,112`) — the spec's 24h rule must be shell-enforced policy. Mining must run in a Worker (the hash-wasm event-loop trap is a known repo-wide gotcha). PoW difficulty units are zero BITS, and byte-counting miners over-mine 8× (standing memory).

**Signing wrinkle:** the shell holds no key material — the seed never leaves the node (§2.5). To sign `engage:{content_id}:{nonce}:{timestamp}` (`methods.rs:3918-3937`) the shell must call the node's `sign_message` RPC over loopback+cookie. §2.4 bans `sign_message` from any *channel grant*; the shell is not a channel and is baked trusted code — within the letter and spirit for the A/B era; Phase D's purpose-scoped signing replaces it.

**Dials:** N = **45s** continuously tuned before the miner starts; K = **3** most-recent items actually rendered; weight = **node-minimum action difficulty**; rate limit = **1 per content per 24h, shell-side ledger** (localStorage, honest-best-effort); receive-only channels: try once, on sponsorship rejection mark the channel receive-only for the session and go silent (§2.5 — no error, no nag).

**RULING B2:** N=45s, K=3, node-minimum difficulty, 24h shell-side ledger; sign_message via the shell over loopback+cookie approved for the A/B era (never in any channel grant; Phase D replaces it). *(Operator delegated; recommendation adopted.)*

## B3 — The Chart: glow mapping + mooring

**Facts:** bands and numbering are already decided in the spec (§3.4, struck from §9). What's open is presentation policy: the recency→brightness curve, and the mooring flick.

**Ruling basis:** glow = log-scaled recency — full phosphor <6h, fading through 2d, ember at 5d, near-black past 7d (matches the content half-life so the Chart *is* the decay made visible); warm-deck channels additionally carry the §3.4 afterglow. Mooring = horizontal flick on a Chart row toggles moored; moored buoys cycle via horizontal flick on the set (distinct from the vertical dial per §3.4); moored set persisted in localStorage; cap at 3 (the measured warm size is the natural cap).

**RULING B3:** log-scaled glow tied to the 7-day half-life; mooring by horizontal flick, cap 3, localStorage-persisted. *(Operator delegated; recommendation adopted.)*

## B4 — Trench on the phone dial (§9, unanswered in spec)

**Fact:** TheTrench is a PC exe (node-homestead game); there is no web bundle to bake — putting it on the phone dial would mean building a new web client, which is nowhere in scope.

**RULING B4:** Trench ruled out for B — desktop-only, revisit at E. The dial stays feed/wiki/reef until C adds the rest of the baked fleet. *(Operator delegated; recommendation adopted.)*

## B5 — Bootstrap-via-health (closes A1's debt row)

**Fact:** first-run acquisition currently depends on three hardcoded /browse spaces staying body-bearing; `list_spaces` already returns all known spaces sorted by `last_activity` desc with `post_count` (`methods.rs:5868`, `types.rs:747-782`) and is auth-exempt.

**RULING B5:** acquisition's follow-set becomes top-3 spaces from `list_spaces` filtered to `class == "social"` (B1's RPC preferred once live, ranking by engagement recency), with the current hardcoded trio as fallback when the listing is empty. *(Operator delegated; recommendation adopted.)*

## B6 — Dead Air thresholds (§3.3)

**RULING B6** (all client policy, tuned against the 7-day half-life): last engagement <2d = alive, no card; 2–5d = test card with `LAST SIGNAL: N DAYS AGO`, flare available; >5d = `THIS CHANNEL IS DYING`, flare available; flare = `request_content` on the space's most recent surviving item + one engage on arrival, same signing path as B2; spec-defined "beyond flares" text when nothing is retrievable. *(Operator delegated; recommendation adopted.)*

---

## Not in B (fences, for the record)

Night Swim + Channel 0 (§3.5 — not in §5 B's list), any client-source changes, the dial/registry, `get_space_health` v2 with a real score (that's the B1(b) future), node-side engagement rate limiting (policy stays client-side until someone abuses it), release signing/size gates.

## Standing note

The G2 WebView soak + on-device long-press check remain open from A1 — deliberately skipped for now per operator; they can ride any future device session.
