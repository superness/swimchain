# Swimchain UX Study — 2026-07-13 night (post-F10 TES4)

**Method:** operator-driven sweep (not the deepconsole arm fleet — the Electron
arm backend wasn't stood up). One operator (Claude) drove all five web clients
via swim-auto (Playwright Chromium, node mode against the local genesis node),
re-checked the phone via adb, ran Track-0 static gates, measured performance
with curl, and did the visual review from the captured frames. Shots in
`./shots/`. Companion to `docs/qa/QA_PROGRAM.md`.

**Surfaces:** feed / forum / chat / search / wiki clients (PC, swim-auto),
mobile app (phone 46281FDJG001JN), local genesis node RPC, 3 droplets.

---

## Headline

The **plumbing is healthy** — every write path works (post, reply, reaction,
channel+message, profile, space, offer/claim/approve), propagation is fast
(cross-node ≤64s incl. PoW), and performance is excellent (RPC 1-3ms, page
loads <250ms). The problems are almost entirely **presentation and polish**,
concentrated in three recurring themes:

1. **Raw identifiers leak everywhere a name belongs** — the single most
   pervasive issue, in all five clients (F2/V3, still open from 2026-07-12).
2. **Cross-client inconsistency** — display-name resolution, theme, and
   error handling differ client to client for no user-visible reason.
3. **A handful of genuine UX traps and one raw-error leak** that would stop
   or scare a non-technical user.

Nothing here is a consensus/data bug — those were the earlier rounds. This is
a "make it look and feel finished" list.

## Performance (measured, curl)

| Path | Time | Target | Verdict |
|---|---|---|---|
| Client bundle load (feed/forum/chat/search/wiki) | 2.0-3.3 ms | <2 s | ✅ trivial |
| RPC `list_spaces` / `get_chain_stats` / `get_identity_info` (local) | 1.0-1.9 ms | <5 s | ✅ |
| RPC on seed droplet (on-box) | 2.5 ms | <5 s | ✅ |
| swimchain.io / reef / example page load | 113-245 ms | <2 s | ✅ |
| Search query ("phone", 16 results) | **0.00 s** reported | <5 s | ✅ |
| **PoW mine (post / space / reaction, browser Argon2id)** | **60-130 s** | n/a | by design; see UX-2 |

No performance defects. The only "slow" is proof-of-work, which is the
protocol, not the UI — but the UI misrepresents it (UX-2).

## Design / visual review (from the pixels)

- **feed** — dark, clean, correct hierarchy. Empty state ("Your feed is
  empty / Explore Spaces") reads as *locked, not broken* — good. Reaction
  popover **overlaps the post body** (minor). Byline shows a raw hex space id
  (VIS-1).
- **forum** — the most polished shell: left sidebar, real status bar ("Synced
  · 4 peers · 9/500 MB"), theme toggle, "? Shortcuts". One eyesore: the
  **"Join a private space" input is a white box in the dark theme** (V2 from
  last round, still open, and it's the loudest instance).
- **chat** — clean Discord clone; server rail, channel modal, message
  composer all correct. Server-rail avatars degrade unnamed spaces to "SP"
  initials (better than raw ids) but two "LL" and two "SP" are
  indistinguishable.
- **search** — genuinely nice results UI: term highlighting, "97% alive"
  decay bars, THREAD tags, faceted tabs (All/Spaces/Threads/Replies/Users),
  time+relevance sort, "16 results (0.00s)". Best-looking surface in the app.
- **wiki** — **LIGHT THEME.** Stark white, a completely different visual
  identity from the other four (all dark). Jarring if launched alongside them
  from the desktop shell. Its empty states ("No namespaces yet — Follow
  spaces on your node…") are the most honest/actionable in the suite.

**Cross-suite:** four dark clients + one white one, three different header
treatments, and display-name resolution that works in chat but not feed or
search — the suite doesn't feel like one product yet.

---

## Ranked findings

### Major

**M1 — Raw identifiers everywhere a name belongs (F2/V3, still open).**
Confirmed in *all five clients* this round:
- feed Discover: The Commons/Latency Lab resolve, but Daily Drift & Reef
  (CLI-created on the seed) show `sp1qqqsqpc0u…` / `sp1qqqsqr9df…`.
- feed post detail byline: `in 0100003b…000000` — raw zero-padded internal
  hex, not even bech32 (worst instance).
- forum sidebar + cards: same two `sp1…` ids.
- chat server rail: "SP"/"LL" initials (degraded, not raw — best handling).
- search: every result shows `0100003b…c8b5` as the space + unresolved
  `cs1qz0vj…` author.
- search suggested-search chips: a raw "Space 0100070f" chip.
Root cause is the known one: clients don't call `resolve_space_name` and the
node doesn't auto-resolve placeholder names. **Fix once, node-side, and it
clears ~8 separate UI symptoms.** Highest ROI item in the app.

**M2 — Raw JSON-RPC error shown to the user.** Opening a space while
unauthenticated renders, verbatim: `HTTP 401: Unauthorized -
{"jsonrpc":"2.0","error":{"code":-32001,"message":"Authentication
required"},"id":14}` with Retry / Browse Spaces buttons. A non-technical user
(the "Mom" north-star) sees a code dump. Every client should map RPC errors
to human copy ("Couldn't reach your node — check it's running").
Shot: `feed-raw-401-error.png`.

**M3 — Search index misses synced content (known bug, reconfirmed live).**
Query "phone" returned only genesis-authored "Phone welcome 1/2/3"; the
phone-authored "Phone cross-node test" that is present on this node (renders
in feed, in the space thread list) does **not** appear. Search indexes
self-authored content only. Matches memory `project_search_index_synced_content`.

**M4 — Display-name resolution is inconsistent across clients.** The name I
set ("Genesis Prime") shows correctly in **chat** and on the **profile page**,
but feed post bylines and search results show the raw `cs1qz0vj…` address for
the same identity. Same node, same identity, different answer per client.

### UX traps

**UX-1 — Chat "create channel" placeholder-as-value trap.** The channel-name
field shows "general" in grey; it's a *placeholder*, not a value. Clicking
Create (the obvious action) rejects with "Please enter a channel name" while
the box visibly reads "general". Either prefill it as a real default or don't
show a value-looking placeholder. Shots: `chat-2026-07-14T03-27-04/33.png`.

**UX-2 — PoW mining modal misrepresents itself.** During a 60-130s space
mine it shows "Estimated time: ~0s" and a progress bar pinned near 95% from
the ~12th attempt onward. Mining is unpredictable by nature; show honest
attempts/hashrate and drop the fake ETA + fake progress (it reads as "stuck").

**UX-3 — Silent identity-load failure + auth-lockout footgun.** With a stale
cookie the Identity page spins "Loading identity from node…" forever (no
timeout, no error). Worse: restarting a node under an open node-mode client
leaves the page hammering the OLD cookie → the node's rate-limiter locks the
client out for 300s (`-32017 Client locked out. Retry after 299 seconds`),
which then blocks even the fresh cookie until the limiter clears. During a
normal session this looks like "the app just broke." Needs: a load timeout
with a real message, and the client should back off (not hammer) on repeated
401s.

**UX-4 — "Create post"/"+Post" with no identity bounces to the Identity
page**, not to compose and not with an explanation. Reasonable gate, confusing
label-to-destination jump.

### Minor / polish

- **V-wiki — wiki is light-theme** amid four dark clients (see design review).
- **V2 (open) — forum "Join a private space" input is a white box** in the
  dark theme. Also the standalone-feed space-load error card is light.
- **VIS-1 — reaction popover overlaps the post body** in feed.
- **markdown not rendered in chat** — the channel-create artifact shows
  literal `**general**` with visible asterisks; if messages support markdown,
  they aren't rendering it here.
- **channel creation posts a "**general**" message** as the first line of the
  new channel — reads like stray content, not a system notice.
- **count mismatch** — feed space header "23 posts in this space" vs "20
  threads" side by side, unexplained (posts include replies; threads don't —
  but the user isn't told).
- **two indistinguishable avatars** in chat rail (Latency Lab / Latency Lab 2
  both "LL"; two `sp1…` both "SP").
- **mobile profile header** — full-width lime band (V1, open from prior round;
  cosmetic).

### What works (verified this round, don't regress)

Post (feed), reply controls, reaction (mines + registers), chat channel
create + message send, profile edit (name+bio, avatar — fixed earlier tonight),
space create (post genesis-fix), sponsorship offer→claim→approve full UI loop,
search UI + query, forum/chat/wiki empty states (all honest), sync status bars,
theme toggle (forum), keyboard-shortcut hints (forum/wiki `/` focus).

## Cross-round vs 2026-07-12

| Item | 2026-07-12 | Tonight |
|---|---|---|
| F2/V3 raw space ids | open (Discover/header/detail) | **still open, wider** — now confirmed in all 5 clients (M1) |
| V2 light cards on dark theme | open (PC space view) | **still open** — forum private-space input is the loud one |
| V1 mobile lime band | open | still open (cosmetic) |
| F6 formation stall | open | **not seen** — chain grew h26→h36 through the study; F10/flush work appears to have closed it in practice |
| Sponsorship UI flow | PASS | **PASS + extended** — full offer→claim→approve loop driven in UI, plus min-PoW-floor client bug found & fixed (282dc49e) |
| Search | not exercised | UI excellent; **index-coverage bug (M3) newly confirmed live** |
| Display-name resolution | not isolated | **new finding (M4)** — inconsistent across clients |
| Raw JSON-RPC error to user | not captured | **new finding (M2)** |
| Chat placeholder trap | not captured | **new finding (UX-1)** |

**Biggest single lever:** node-side auto-resolution of placeholder space names
(kills M1's ~8 symptoms). **Biggest safety/scare item:** M2 raw-error leak +
UX-3 lockout footgun. **Highest-confidence quick wins:** UX-1 placeholder trap,
UX-2 fake progress bar, wiki theme, forum white input.

## Fixes already shipped during the study (in the session, on main)
- Genesis CreateSpace fallback (builder + receive) — `ec064653`
- Offer/invite modals respect the 8-bit min-PoW floor — `282dc49e`
- (earlier tonight) mobile stale-bundle, empty-title edit, claim relay, F10.

## Not covered (honest scope)
Private spaces (create/invite/join/DM/key rotation), invite-link redeem
end-to-end, "Find a Sponsor" from the claimant UI, offer cancel/reject,
media attachments on PC, space rename UI, report/attest/blocklist flows,
Saved Posts, follow/unfollow effect on feed, notifications, Settings depth,
the desktop launcher apps, and reef/chess gameplay. A full deepconsole
multi-persona round (9 personas, Track 2 owners) would systematically cover
these — recommend running it once the arm backend is available.
