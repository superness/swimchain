# Swimchain UX Study — 2026-07-14 evening (round 3: the confusing/bad/ugly pass)

**Method:** operator-driven per `docs/qa/rounds/2026-07-13-night/HANDOFF.md`.
This round's mandate: complete the functionality sweep and finish the UI
evaluations with an explicit **confusing / bad / ugly** lens. One operator
(Claude) drove all five PC clients via swim-auto (node mode, genesis), the
live swimchain.io reef/chess pages, the phone (46281FDJG001JN) via adb, and —
new this round — the **desktop launcher driven headlessly over WebView2 CDP**
(`tools/app-automation/drive-launcher.mjs`, no focus stealing; launch the exe
with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`).
All shots in `./shots/`, each visually reviewed.

**Round-2 leftovers closed:** desktop-launcher walkthrough ◐ (unlock +
error path exercised; blocked at password — see L1), qa2 DM UI re-read ✅
(finding N4-sharp below), phone invite-redeem ✅ (claimant UI verified; the
phone identity is already sponsored so a live redeem is a no-op).

---

## Headline

The plumbing held this round — nothing new was functionally broken. The theme
is **identity of things**: the single ugliest pattern across every surface is
that *spaces and users the local node didn't name itself* render as raw
identifiers, and the single most confusing pattern is that **the game/app
spaces are social-class**, so all three social clients present machine data as
human content. Six polish bugs were fixed inline this round; the two big items
(app-space classing, node-side prefs) need operator decisions.

## Fixes shipped this round (committed to main)

1. **feed: space-page cards rendered the title twice** — ThreadCard showed the
   raw `title\n\nbody` blob as the excerpt. Now stripped like the feed page
   (`SpaceView.tsx`).
2. **feed: post-detail space chip showed the raw zero-padded hex id** — and no
   name could ever resolve because `get_content` returns hex while
   `list_spaces` returns bech32. Fixed at the root: `get_content` now also
   returns `space_id_bech32` (node, `rpc/types.rs` + `methods.rs`, additive so
   nothing parsing the hex breaks), and the feed prefers it — the chip resolves
   to the space name and links stay in one id form (`Post.tsx`, `useRpc.tsx`).
3. **forum: the white "Join a private space" textarea on dark** (round-1
   leftover) — `.form-textarea` was only styled in NewThread/InviteModal CSS,
   which isn't loaded on the browse page. The component now owns its styles
   (`JoinPrivateSpace.css`).
4. **forum: private-space sidebar ignored node-decrypted names** — it only
   tried browser-held keys (which don't exist in node mode) and labeled
   everything "Private Space". Now uses the `name` the node already returns,
   and the no-key fallback is disambiguated (`PrivateSpaceList.tsx`).
5. **chat: bridged post titles rendered literal `**asterisks**`** — chat has no
   markdown renderer; composes plain text now (`useMessages.ts`).
6. **feed+forum: "1 posts"** grammar.

## Ranked findings

### Major (new)

**R1 — The game spaces are social-class, so every social client shows machine
data as human content.** `list_spaces` reports the reef, chess, and drift
spaces as `class: "social"` with `name: null`. Consequences observed live:
- Chat's default server is the **reef space**: channel list is slugified game
  threads (`#reef-founded-by-cs1qrh2wlj`), the message pane shows the raw reef
  JSON header, every channel wears a permanent unread badge.
- The phone feed's **top item** is `Reef — founded by…` followed by raw JSON —
  the first thing a new phone user sees (shot `phone-launch.png`).
- Feed Discover "suggests" `sp1qqqsqpc0u…` / `sp1qqqsqrsm2…`; forum lists them
  as spaces; feed compose offers them as posting targets.
The space-class byte exists exactly for this (space_id[0], 2026-07-12 reset)
but the game spaces were created before/without an app class. **Decision
needed:** mint app-class spaces for reef/chess/drift and migrate (breaks
existing on-chain game state), or teach clients to hide spaces whose root
content is app JSON (heuristic), or backfill a name+class registry. Until
then, every social surface leaks gibberish.

**R2 — DM lists are unrecoverable (N4, sharpened from "portability" to "data
loss").** As qa2 — whose node still holds the round-2 DM space and its key —
a fresh browser profile shows **"No DMs yet"**. The DM list lives only in
`swimchain-chat-dms` localStorage; the node has the space, the membership, and
the key, but no RPC returns DM spaces (`get_my_private_spaces` filters them
out on purpose), so no client can rediscover a DM from node state. Any profile
wipe/new machine silently orphans every DM. Scope (corrected 2026-07-14
evening): exactly three localStorage-where-the-node-should-answer stores —
chat's DM list, feed's follows, feed's saved posts. **Wiki is NOT part of
R2**: its namespaces are `@wiki:` app-class spaces from list_spaces, a world
disjoint from social spaces; follows were never part of that mechanism. The
"follow spaces to see them as wiki namespaces" empty-state string was stale
copy describing a design that doesn't exist (fixed this round), and round 2's
"wiki namespaces unreachable" claim is retracted — they appear as soon as a
@wiki: space exists on the chain (no create flow in the wiki client yet).

**R3 — Search cannot find spaces by name. FIXED same day.** `search("commons")`
→ 0 results with a space literally named "The Commons" holding 24 posts on the
same node. Root cause: the search RPC's space branch matched only the raw
on-chain space registry, but space names are content-derived and are resolved
(registry + config.toml overrides + app markers) only inside `list_spaces` —
so search could never see the names clients display. Fix: extracted that
resolution into `resolved_space_list()` (shared, behind the existing 3s
cache) and search now matches against it. Verified in the UI: "commons"
returns The Commons space card (`search-spaces-fixed.png`). (M3's
content-side gaps unchanged: synced third-party content still unindexed,
private ciphertext still indexed as noise.)

### Desktop launcher (round-2 leftover, walked this round)

**L1 — A wrong password reports as data corruption.** The launcher's spawned
node exits with `Decryption failed - wrong password?` (its stderr), but the
UI shows *"Node failed to start (exit code: 3). This may indicate a corrupted
identity or configuration issue."* + Retry. A typo reads as a destroyed
identity — the scariest message the app can show, for the most common input
error. Retry does return to the form (good). Map the exit/stderr to "wrong
password, try again". Shots `launcher-unlock.png`, `launcher-home.png`.
- **Walkthrough completed after the operator supplied the password.** Unlock →
  app registry ("Connected · TESTNET · 3 peers · address chip", five app
  tiles) → clicking a tile spawns the standalone `feed-app.exe`, which
  connects to the launcher's node, adopts the launcher identity, and honestly
  banners "Your identity is not sponsored. Your claim is pending review." with
  a View Status button. The decoupled node/app architecture works end to end.
  Shots `launcher-registry.png`, `launcher-feed-app.png`.
- CORRECTION to the port-collision concern first filed this round: the
  launcher's node started fine alongside the running genesis node (two sw.exe
  processes coexist) — it does not fight over 19735/6.
- Registry nit: all five app tiles share the same generic "S" placeholder
  icon — indistinguishable at a glance; each client has a real logo in-app.
- Unlock screen renders clean and centered at 1800×1200 (round-2's clipping
  at 1215px not reproduced); nit: the bech32 address wraps with one orphan
  character on line 2.
- Tooling note: the launcher is fully drivable headless via CDP
  (`drive-launcher.mjs shot|ui|type|click|eval`) — no more "operator was
  using the machine" deferrals.

### Confusing (UX)

- **"Your Feed is empty" for the operator's own identity** every fresh
  profile — follows are localStorage (R2 root). PC "Your Feed" = followed-only
  while phone "Your Feed" = global recent (round-2 mismatch, still true).
- **Sponsorship "My Offers" says `Sponsor: 9ec9661d…0420` on your own
  offers** — that's the viewer, in raw hex. Should read "You".
- **"Probationary (180-day trial)" badge on every offer card** (PC + phone) —
  ambiguous who is probationary (offer? sponsor? future sponsee?) and
  meaningless to a claimant browsing offers.
- **Feed space header counts disagree in adjacent labels**: "24 posts in this
  space" above "20 threads" (posts include replies; threads don't — but no
  user can know that).
- **Chat's thread→channel mapping explodes content spaces**: The Commons is 24
  one-message channels, each with a permanent unread "1" badge. Chat suits
  chat-shaped spaces; content spaces need either a channel cap, read-state, or
  a different projection.
- **Forum breadcrumb shows `Space sp1qqqsqqpm8…`** while the sidebar shows the
  resolved "The Commons" one inch away.

### Ugly (visual)

- **Cancel Offer button: red-on-red** text/background, barely legible
  (`feed-sponsorship.png`).
- **Wiki is still the only light-themed client** (round-1 leftover) — jarring
  inside the dark shell.
- Phone Sponsorship "My Offers": description text squeezed one-word-per-line
  beside the action buttons (`phone-sponsor.png`).
- Feed profile: hot-pink default banner with the name straddling its edge —
  serviceable, not pretty (`feed-profile.png`).

### Re-verified / still open (don't re-file)

- **M1 raw identifiers** — new instances mapped this round: feed Discover
  suggested-space list, feed compose dropdown, feed space-page bylines
  (`cs1qz0vj…` where the post detail resolves "Genesis Prime"), forum
  breadcrumb, chat server initials ("SP"), phone find-a-sponsor sponsor line.
- **N3 stale remote offer state** — the phone (older APK) shows an offer at
  "2 of 2 remaining" that the sponsor's node doesn't have in that state; the
  slot-convergence fix shipped this morning but only reaches surfaces that get
  a client rebuild (the distribution gap in action).
- **Round-2 fixes confirmed in the built bundles:** post-detail byline
  resolves "Genesis Prime" (M4 fix), private spaces appear with decrypted
  names in feed compose (N1 fix), feed Manage Blocklist works, feed settings
  healthy.

### What works (verified this round — don't regress)

Feed home/discover/compose/settings/profile all render clean; forum thread
view remains the gold standard (name + address + copy byline, health bar,
stats); search returns self-authored content fine with good empty-state copy;
reef + chess landings are clean, honest, and the one-click onboarding from N2
is live; phone status bar (Running · peers · height · sync%) is excellent;
phone find-a-sponsor is the best claimant UI of any surface; genesis chain at
height 71 with clean cross-client consistency on The Commons content.

## Cross-round diff vs 2026-07-14-morning

| Item | Round 2 | This round |
|---|---|---|
| DMs | fixed + verified e2e | UI can't rediscover from node state (R2) |
| Invite funnel | C1 fixed; N2 games live | holding; phone claimant UI verified |
| N1 private compose | fixed | confirmed in built bundle |
| M4 name resolution | post-detail fixed | confirmed; space-page cards still raw |
| Games leak into social clients | noted as "JSON renders raw" | root-caused: social-class space ids (R1) |
| M3 search | synced-content gap | + space names not indexed at all (R3) |
| Desktop launcher | launch+unlock only | full CDP driving; L1 error-mapping bug |
| White forum textarea | open (round 1) | **fixed** |
| Title duplicated in previews | not noticed | **found + fixed** (feed space page) |

**Biggest single lever:** R1. One decision about app-space classing removes
the worst content from every social surface at once — chat's default server,
the phone's top feed item, Discover's suggestions, and compose's target list
are all the same three space ids.

## Session gotchas (additions)

- The desktop launcher is drivable headless: launch with
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`, then
  `node tools/app-automation/drive-launcher.mjs <shot|ui|type|click|eval>`
  (run from `tools/app-automation/` for the playwright dep).
- `cli.js stop` kills the whole daemon (not just the page) — `open` restarts
  it.
- The launcher identity (`cs1qpmrpj6…`, %APPDATA%/swimchain-testnet) has an
  unrecorded password; its node log is `%APPDATA%/swimchain-testnet/node.log`.
- Native `<select>` dropdowns don't render options in screenshots — read them
  with `eval` on `document.querySelectorAll('select option')`.
