# Surf — design spec

**Date:** 2026-07-28
**Status:** **rev 3 — decisions locked, ready for an implementation plan.**
Rev 2 rewrote rev 1 against a 28-agent adversarial review (22 confirmed
findings, 7 blockers); rev 3 records the operator's calls (§10). Every
correction is traceable to a verified finding.
**Name:** **Surf** (decided)

> §1 is what we're building. §10 is what was decided and why.
> **Scope:** Android; baked core + the on-chain dial; the dial's security
> gates are v1, not an appendix.

## 1. What it is

**Somewhere out there, it's already on.**

TikTok and Netflix are vending machines — you arrive, you demand, they
dispense. Television was different, and everyone over thirty remembers why: TV
was a place that existed *without you*. You didn't summon the broadcast; you
joined it in progress. That's the loneliness-killer of late-night TV — not the
content, the *company*. The knowledge that the signal was there before you
turned the set on and will be there after.

Swimchain is the only network on earth where that can be **true instead of
simulated**. Your node synced while you slept. The chain grew. The school
moved. When you open Surf at 11pm you are not launching software — you are
surfacing into a sea that has been alive all day without your permission or
your attention. Every other app fakes liveness with a spinner and a fetch.
Here the flip lands on something that was actually happening.

And there's a second truth under the first, and it's the one that beats
Netflix at 11pm: **on this network, watching is feeding.** Content decays.
Attention is oxygen. When you tune in you are not a viewership statistic — you
are life support. Old TV asked nothing of you and gave you nothing back. This
set knows you're there, and the channel *lives longer because you stayed.* No
medium in history has been able to say that honestly.

The mood, which every decision below serves: a warm rectangle of light in a
dark room, tuned to an ocean that doesn't need you but is glad you came.

### What it is, concretely

Surf replaces the launcher grid with a **television**. You open it and you are
on a live channel, and you flip. Channels are the network's apps — the social
feed, the games, the wiki, forums, chat — and, as the network grows, news, an
inbox, and eventually streamed video.

### How true the two truths actually are

The review tested both claims against the code. Here is exactly how far each
one holds, because a product built on a lie about its own foundation is worse
than one built on less:

1. **The broadcast continues without you.** *True for the chain, with a
   caveat.* Your node keeps syncing blocks and action gossip whether or not a
   channel's UI is mounted. It does **not** fetch content *bodies* on its own
   — `followed_spaces` buys cache retention only (`src/storage/cache.rs`;
   zero uses in `src/sync/`, `src/node/`, `src/content/`), and content GETs
   fire only for hashes explicitly requested (`src/node/router/router.rs`
   ~1031). Freshness therefore needs a driver, which Surf provides while
   running (§2.3). Rev 1's claim that "followed spaces keep them synced while
   the set is off" was false and is deleted.
2. **Watching is feeding — where your sponsorship reaches.** Content decays
   without engagement, and the only viewer path that touches decay is
   `submit_engagement` (`src/rpc/methods.rs` ~3827): specific content hash,
   PoW over it, signature. Rev 1 asserted that tuning and lingering feed the
   network while specifying no mechanic; §3.3 now specifies **dwell-engage**.
   Its reach is bounded by the sponsorship model, which already answers this:
   **an identity acts wherever its grants reach and nowhere else.** Grants are
   space-scoped by design — the node refuses to mint an unscoped auto-approve
   offer at all (`src/rpc/methods.rs` ~17447, `src/sponsorship/offer_store.rs`
   ~87-95: *"auto_approve requires space_scope… grants unrestricted network
   write access"*), which is the 2026-07-16 faucet-off decision in code. So
   the dial has channels you can feed and channels you can only watch, and
   that is the designed behavior, not a gap (§2.5).

### Product rules

- **No home screen, ever.** The app opens onto a live channel — or, on a cold
  first run, onto honest static that *is* the programming (§3.1).
- **Nothing stands between the viewer and the sea.** No interstitials, no
  loading cards. **One carved exception:** any consent dialog that grants
  capability is shell chrome (v2 only; see §2.4).
- **No password wall.** First power-on silently creates the node identity.
  **Honest statement of what that protects:** in the code being copied, the
  decryption passphrase is written in cleartext next to the encrypted seed
  (`mobile-app/src-tauri/src/node_host.rs` — `identity.pass` beside
  `identity.enc`), and the RPC cookie's `0600` mode is inside `#[cfg(unix)]`
  (`src/rpc/auth.rs`), so on Windows it inherits directory ACLs. **v1 protects
  the seed at filesystem-permission level only.** That is defensible on
  Android app-private storage and *not* on a shared desktop — one more reason
  Android leads. Requirement: OS-keystore wrapping of the passphrase (Android
  Keystore; DPAPI/Keychain when desktop lands) is a **v1 requirement on any
  platform where the data dir is not app-private**, not a later hardening.

Surf is a **new app** (`surf-app/`), not an in-place rewrite. It replaces
`mobile-app` as the shipped Android app at parity; the desktop launcher
continues to exist.

## 2. Architecture

### 2.1 Node host

Android: in-process node, exactly `mobile-app`'s model — lib link, autostart,
Kotlin `NodeForegroundService`, loopback-only cleartext, `ring` rustls backend.
Mainnet hardcoded; the `network.magic` guard applies unchanged.

Desktop (post-v1, §5 E): `sw.exe` sidecar, `desktop-app`'s model — free
`(P2P, RPC)` port-pair scan, cookie auth, its own `swimchain-surf` data dir so
it never fights the launcher's sled lock.

**Not a trait yet.** With one backend, `NodeHost` is a struct. The trait is
introduced when the second backend actually arrives — rev 1's
trait-then-two-backends ordering was the single largest source of pre-soul
work.

### 2.2 The deck

Channels are iframes speaking the existing `SWIMCHAIN_RPC_CONFIG` postMessage
contract (endpoint + cookie auth + `nodeAddress`). **Correction to rev 1:**
"a client that speaks it today is a channel with zero changes" holds *only for
same-origin baked bundles*. It is false cross-origin (§2.4) and it is unsafe
as-is even same-origin (below).

**Warm set.** N most-recently-watched channels stay mounted; LRU eviction; one
pinnable. **N is a memory bet, not a freshness knob:** on Android every iframe
shares one WebView renderer process, so three mounted React apps sum into a
single process Android kills *as a unit* — losing the whole deck, which LRU
cannot prevent. N=3 is a hypothesis to be measured in the A0 spike (§5), with
**N=2 (current + last) as the stated fallback**.

Hidden channels receive `SWIMCHAIN_CHANNEL_HIDDEN` / `_VISIBLE` (advisory;
ignoring it costs battery until eviction). Clients that mine PoW must do it in
Workers — a synchronous await-hash loop starves its own event loop.

**Readiness signal (new).** Rev 1 said a cold channel is "shown when its first
paint lands" — an event the shell cannot observe; no such signal exists in the
contract. Specified: a channel posts **`SWIMCHAIN_CHANNEL_READY`** after first
meaningful render. Fallback for channels that don't: iframe `load` + one
`requestAnimationFrame`. Hard timeout → the SIGNAL LOST card (§6), **never a
blank frame**.

**Config-handover hardening (v1 prerequisite).** Today's shared client hook
accepts `SWIMCHAIN_RPC_CONFIG` from any origin *starting with* one of four
allowlisted strings, never checks `event.source`, and last-writer-wins
(`feed-client/src/hooks/useParentRpcConfig.ts` and its copies in
`swimchain-frontend`, `search-client`, `shoal-client`, plus `forum`, `wiki`,
`chat`, and `app-shell/web/embed.js`). Any frame can therefore repoint a
sibling's `rpcEndpoint` at an attacker's server — and the sibling will send
the real cookie there — or spoof `nodeAddress` so the user acts under a false
identity. Required changes, in every client listed, **before any non-baked
channel is ever mounted**:

1. exact-origin equality (no prefix matching), and the allowlist must include
   the real Tauri v2 origin (`http(s)://tauri.localhost`), which today's list
   would reject;
2. `event.source === window.parent`;
3. **first-wins** — later configs ignored.

**Inbound contract (new section — rev 1 defined only outbound).** The shell
enumerates every message type it accepts; for each, it resolves `event.source`
to a specific mounted channel and requires `event.origin` to equal that
channel's declared origin, dropping everything else. This matters because the
two ancestors disagree: `desktop-app` gates external opens on origin and
`^https?://`, while `mobile-app` checks **nothing** and forwards any string to
the Android opener — so a hidden frame could fire `intent://`, `market://`,
`tel:`, `file://` invisibly. Surf: **https-only, re-validated in Rust against
a scheme allowlist, foreground channel only.** Surf also ships a real **CSP**
(`frame-src` limited to approved origins, no top-level navigation from
frames); `mobile-app`'s `"csp": null` is not inherited.

**Origin model (new).** Today every embedded client is same-origin with the
shell and framed with `allow-same-origin`, so channels share storage and can
reach `window.parent` — tolerable while all bundles are first-party, fatal
otherwise. Rule: **the shell's origin never hosts non-baked channel code.**
Frames carry `allow=""` (no camera/mic/geolocation riding the app's OS grants)
and no `allow-top-navigation`. Per-channel origin isolation is a **stated
prerequisite** of the `hash:` source kind, not a v2 implementation detail.

### 2.3 Liveness is driven

DESIGN LAW: nodes fetch on demand only. **Surf's tuner is that driver.**
Tuning a channel: (1) adds its space(s) to `followed_spaces` (cache retention
only — that is all it does), (2) fires `request_content` for recent content,
(3) starts the dwell-engage timer (§3.3). While the app is foregrounded, a
periodic driver refreshes moored channels. There is no background content
driver today; if "already on" must hold for content bodies while the app is
closed, that is a **separate node-side follow-and-fetch work item**, named
here and not assumed.

Reads honor **chain + mempool** — a flare or post is real the moment it is in
the mempool, never "waiting for a block."

### 2.4 The lineup

**Decided: both halves ship.** A baked core so the set works instantly and
offline, and the **on-chain dial** so the lineup grows without an app release.
The dial is what makes Surf an entry to the network rather than a launcher
with a nicer coat of paint — so its security work is v1 scope, not a deferred
appendix, and the requirements below are gates, not aspirations.

**The baked core.** The existing clients' dist bundles ship in the binary.
Build requirements, measured rather than assumed:

- **Sourcemaps must be excluded from the bake.** All client vite configs set
  `sourcemap: true`, and the *currently shipped* mobile APK already embeds a
  2.45 MB feed sourcemap. Across nine dists, maps are ~17 MB of ~32 MB on
  disk. Tauri brotli-compresses embedded assets, so a maps-stripped
  nine-channel APK lands ~21 MB (vs ~30 MB with maps) against today's 18.3 MB
  single-client APK — maps still dominate compressed payload ~3.5:1, so
  stripping them is the single biggest win.
- **CI size gate** (release APK ≤ 40 MB per ABI) and **per-ABI APKs** (arm64
  for sideload), never universal.
- The `.so` embeds assets at cargo-build time, so with nine baked channels a
  one-line CSS fix in any client costs a full cross-compile + gradle + resign
  + sideload redistribution. That tax is precisely why the dial exists.

**The on-chain dial.** A channel registry read from the chain; each entry
carries name, category, depth band, icon, and a source: `baked:<id>`,
`url:<https://…>`, or `hash:<content-hash>` (fetched through the node's own
content store — no web server involved). New channels appear on the dial
without an app release; that is the whole point.

**Its gates.** Every item below came out of the security review as a
confirmed finding, and each one is load-bearing — a dial that ships without
them hands strangers your identity:

- **Never the cookie.** A channel grant is a shell-minted **capability token**
  with a registry-declared method allowlist, session expiry, and shell-side
  revocation. `sign_message` is **never** in any channel grant — it is an
  unrestricted signing oracle; it must be replaced by a purpose-scoped signing
  RPC that domain-separates by verb and space.
- **Signed registry, not a curated space id.** `/browse`'s allowlist is
  server-side env config on a trusted gateway; on-device a space id confers
  nothing, and any sponsored identity can post into a public space (there is
  no write-ACL). Entries must be signed by publisher keys **baked into the
  binary** (the `genesis_list.rs` precedent), with revocation entries and
  monotonic sequence numbers so a revoked entry cannot be replayed.
- **Grants bind to (channel id, exact origin, publisher key, method set,
  granted-at).** Any change revokes and requires re-consent; the shell
  revalidates on every mount. Otherwise repointing a registry `url:` silently
  transfers every existing subscriber's grant.
- **Delivery is origin-bound and handshake-gated.** Config goes only to the
  exact scheme+host+port in the registry entry — never `'*'`, never a
  prefix-derived value — after the channel posts `SWIMCHAIN_CLIENT_READY` and
  the shell checks `event.source` and `event.origin`. The rev-1 retry loop
  (re-post on every `load`, 1s × 10s) must go: it turns any navigation or 302
  into a credential handoff at the new origin.
- **Credentials are foreground-only.** On hide the shell revokes; a hidden
  channel's calls fail. Pinning may keep a channel mounted, never
  credentialed. A shell-drawn, channel-uncoverable indicator shows whenever
  any channel holds auth, with one-tap revoke.
- **Consent is shell chrome** — drawn over a blurred, `pointer-events:none`
  channel surface, showing literal origin, publisher key and exact method set,
  on a gesture distinct from tuning, with a minimum display time before input
  is accepted. It may not be reachable from the passive Interference flow
  without a second confirmation. Otherwise the channel can paint a convincing
  fake of the sign-on card and harvest the real gesture.
- **Exit criterion:** a purpose-built hostile test channel proves it cannot
  inject config into a sibling, cannot reach the shell's IPC, and cannot open
  a non-https scheme. **No dialed channel is ever mounted before this passes.**

**Sequencing within v1.** The baked core ships first and stands alone (§5 A1,
B); the dial lands after the hostile-channel gate passes (§5 D). A slipped
dial delays the lineup growing, never the set working.

### 2.5 Identity and what it may do

All channels share the node identity via `nodeAddress`, so name, reputation
and game standing are the same everywhere on the dial.

**Capability follows sponsorship — this is already defined, not a new
question.** An identity acts wherever its grants reach and nowhere else.
Grants are space-scoped by design (the node refuses unscoped auto-approve
outright), so on a given channel a viewer is in one of two states, and the
set says which diegetically rather than failing:

- **Licensed to broadcast** — the channel's space grants this identity
  action; posting, flaring and dwell-engage all work.
- **Receive-only** — no grant reaches here; the channel plays, the viewer
  watches, and feeding happens on the channels where they are licensed.
  Getting sponsored for a space is an ordinary in-world act, not an error
  state.

Neither state blocks the watch-loop, which is every channel, always.

Other implied work:

- reef, chess and chips were built browser-first and contain **zero**
  `SWIMCHAIN_RPC_CONFIG` handling — adopting node identity is real per-client
  work, not a config flag.
- Seed never leaves the node. Channels sign via RPC — and per §2.4 the
  purpose-scoped replacement for `sign_message` is required before any
  dialed channel signs anything.

## 3. The experience

### 3.1 Power-On, including the honest cold start

Warm path: black → a phosphor-green point blooms (~700ms) over the
already-mounted last channel → you are mid-broadcast, scrolled to now.

**First-ever launch is different and rev 1 lied about it.** A fresh mainnet
node has no peers and no content; the feed client would render its
empty-state card (`feed-client/src/pages/Feed.tsx`) — an app screen, the exact
thing §1 forbids. Specified: the bloom resolves into **first signal
acquisition** — the honest static of §3.2, whose flecks and block-hash ghosts
are driven by live node numbers, so the wait is watchably true and its
character visibly changes as peers connect. The set locks onto the feed
channel when N real items have landed locally. Partial content renders as it
arrives; an empty-state card is never shown. A default follow-set bootstraps
the first tune so acquisition has a target.

### 3.2 The Flip

Vertical swipe (phone) = next/prev in dial order. Between channels, **honest
static**: a canvas shader driven by live node numbers — fleck density from
peer/gossip activity, a ghost of the latest block hash, drift from mempool
size. Sound: burble-hiss, sonar ping on lock.

**Seam rule (corrected).** The static persists **exactly until the incoming
channel's `SWIMCHAIN_CHANNEL_READY`** — never shorter, so an unpainted frame
is never exposed; never artificially longer. ≤300ms is the *warm-flip target*;
on a cold flip the static duration **is** the honest mount time, up to the 2s
gate, then SIGNAL LOST. Rev 1's flat "≤300ms" against a 2s cold gate left up
to 1.7s of blank frame undefined.

No interstitial card: channel number and name burn over the live picture in
fat 1978 tuner type, slightly refracted, then fade.

### 3.3 Dead Air, the flare, and dwell-engage

Decayed channels are not hidden — you flip through them. Test card: bleached
coral SMPTE bars, channel name, `LAST SIGNAL: 6 DAYS AGO. THIS CHANNEL IS
DYING.`

**Data source (corrected).** No space-health RPC exists — `src/space_health/`
feeds only the notification service and a P2P query; the dispatch table has no
entry. **Phase B includes a node-side `get_space_health` RPC** exposing
`compute.rs` metrics plus last-engagement recency per space. This works for
channels you have *never tuned*: engagement records ride the globally-synced
consensus chain (`ContentBlock.actions` carries `Engage`; block data is stored
unfiltered by follows), so recency measures the channel, not your node's
ignorance — a claim the review specifically tested and upheld.

**Flare, with a defined target.** `request_content` for the space's most
recent surviving item, engage it on arrival. Fallback when nothing is
retrievable: the card says the channel is beyond flares. (Rev 1 left the
flare's target undefined on exactly the channels where it matters.)

**Dwell-engage — the mechanic behind "watching is feeding."** After N seconds
tuned, the shell mines (in a Worker) and submits low-weight `submit_engagement`
actions against the most-recent K items actually rendered, rate-limited to
once per content per 24h, honoring chain+mempool. Runs only where the viewer
is licensed to broadcast (§2.5); on receive-only channels it is silently
absent — no error, no nag, the channel simply plays.

### 3.4 The Chart (guide)

Pull down → a vertical water column from sunlit surface to trench black.
Channels sit at depths by kind; scrolling down is descending.

- **Brightness is truth:** glow = real engagement health (same RPC as §3.3),
  making the guide a rescue map.
- **Warmth is memory:** warm-deck channels carry fading phosphor afterglow.

**Numbering (decided here, not deferred).** One canonical sequence: dial order
= Chart order = depth order. Numbers are **sparse and fixed per band** —
surface 2–19, mid-water 20–49, reef 50–79, trench 80–98 — assigned at
registry-entry time and **never renumbered**, so a new signal never changes
what "CH 7" means; gaps are period-correct for a real dial. Within-band order
is registry timestamp. **Channel 0 is the spec's one explicit exception**,
sold diegetically as *below the numbered water*. Mooring is a **distinct
horizontal flick** cycling moored buoys only, leaving the vertical swipe as
the immutable physical dial. (§9's numbering question is struck — rev 1 both
decided and deferred it.)

### 3.5 Night Swim & Channel 0

After local midnight: darker palette, slower static, quieter pings, and
**Channel 0** surfaces — a lean-back station assembled client-side from posts,
a panning Reef board, and chain telemetry as bioluminescence. On a fresh
install its source set is empty, so it inherits §3.1's acquisition state
rather than rendering blank. This is the standing timeslot where streamed
video eventually lives.

### 3.6 Interference

The ghost-signal fires in two cases, and the viewer needn't know which:
**new-to-chain** (a freshly dialed registry entry) and **new-to-you** (a
channel long on the dial that this viewer has never tuned). The second case
carries the moment before the dial ships and keeps it alive on quiet network
weeks afterward.

Gate: unsigned or unknown-publisher-key entries **never** auto-surface;
chain confirmation plus a signed publisher key are required before an entry
may appear here at all. Holding locks it in on a sign-on card — and per §2.4,
consent to *grant* anything is shell chrome reached by a second, distinct
act, never by the tuning hold itself.

### 3.7 Power-Off

Picture collapses to the CRT white dot; the dot shrinks to a steady
lantern-point: *"Still broadcasting."* — true, because the foreground service
keeps the node running.

## 4. What Surf is not (v1 fences)

- No video/live TV/movies (the Channel 0 timeslot is built; its programming
  is not).
- No email/inbox channel.
- **No desktop build.** Android only — the launcher already serves desktop
  and is not deleted.
- No cross-channel deep-linking.
- **No dialed channel mounts before the hostile-channel gate passes** (§2.4).
  The dial is in scope; shipping it unguarded is not.

## 5. Delivery phases

- **A0 — the spike (browser, hours not days).** The deck as a plain web page:
  iframes, LRU, config handover, power-on/off CSS, flip feel, static shader —
  pointed at an existing dev node. **Measures first:** renderer RSS with 3
  warm channels incl. one game, flip-to-paint, event-loop health. Decides N.
  Iterating here costs seconds; iterating in an APK costs ~30 minutes.
- **A1 — the set.** Promote the deck into `surf-app/` (Android). Node host as
  a struct. Baked lineup: feed + wiki + one game. Power-on incl. first-signal
  acquisition, power-off. *Milestone: flip between live channels on a Pixel.*
- **B — the soul.** Honest static, OSD overlay, `get_space_health` RPC, Dead
  Air + flare + dwell-engage, the Chart with health glow and mooring.
- **C — the fleet.** Remaining baked channels incl. reef/chess/chips node-
  identity adoption, **config-handover hardening across all clients** (exact
  origin, `event.source`, first-wins — a prerequisite for anything dialed),
  sourcemap exclusion + size gate, release signing, replace `mobile-app`.
- **D — the dial.** Signed registry format + publisher keys baked in;
  registry reader with revocation and sequence numbers; per-channel origins;
  capability tokens + the purpose-scoped signing RPC replacing `sign_message`;
  origin-bound handshake delivery; foreground-only credentials with revoke and
  indicator; shell-chrome consent; Interference on new-to-chain entries.
  **Exit gate: the hostile test channel (§2.4).** This is the phase that
  turns Surf from an app into an entry to the network — and the one that
  needs its own threat model reviewed before a single dialed channel mounts.
- **E — desktop**, post-v1, when the dial is proven on one platform.

## 6. Error handling

- **Node fails to start:** full-screen honest static with a diegetic line and
  a plain-text details toggle.
- **Node started, nothing synced:** §3.1 acquisition state — never an
  empty-state card.
- **Channel wedges or times out:** SIGNAL LOST variant with retune; eviction
  must work even when an iframe is unresponsive.
- **Sponsorship pending:** explained in-world, never a raw error.
- **Renderer killed (Android):** the whole deck dies as a unit; on relaunch,
  restore the last channel and treat it as a warm power-on.

## 7. Testing

- Node host unit tests on regtest; deck logic (LRU, pin, evict, handover,
  READY/timeout) as TS unit tests; **config-handover security tests** —
  sibling frame cannot inject config, prefix-origin is rejected, non-parent
  source is rejected, second config ignored.
- Per the mutation-test rule, every load-bearing test must be proven to fail
  against the bug it names.
- E2E smoke: power-on cold → acquisition → flip 3 channels → post → flare,
  against regtest.

## 8. Perf & size gates

- Flip-to-paint ≤300ms warm; ≤2s cold, then SIGNAL LOST.
- **Memory: 3 warm channels incl. one game must hold renderer RSS under the
  A0-measured ceiling and survive a backgrounded hour without renderer
  death.** If not, N=2.
- **Time-to-first-picture on a fresh install**, measured on regtest *and* a
  real mainnet cold start.
- Static shader: one canvas, 30fps.
- Release APK ≤ 40 MB per ABI, sourcemaps excluded.

## 9. Open questions

- Trench on the phone dial: include, desktop-only, or v2 channel?
- Exact `get_space_health` shape (what `compute.rs` already yields vs what the
  Chart needs).
- Dwell-engage tuning: N seconds, K items, weight.
- **Answered:** never import a launcher identity into a no-password store
  unless that store is keystore-backed (§1).

## 10. Decisions on record (2026-07-28)

**Capability follows sponsorship — not an open question.** An identity does
what its sponsorship allows; that model is already defined and Surf inherits
it unchanged. The dial therefore has channels a given viewer can feed and
channels they can only watch, expressed in-world as *licensed to broadcast* /
*receive-only* (§2.5). No unscoped auto-approve offer is sought — the node
refuses to mint one, and that guard is the faucet-off decision in code.
Where a channel's space wants fresh identities to act, that space gets a
scoped offer through the existing keeper, exactly as reef/chess/chips do.

**The on-chain dial ships.** Not deferred, not a v2 appendix. The lineup grows
without an app release, because that is what makes Surf an entry to the
network rather than a launcher with a nicer coat of paint. The price is that
§2.4's gates are v1 scope: capability tokens instead of the cookie, a
purpose-scoped signing RPC instead of `sign_message`, a signed registry with
baked publisher keys, per-channel origins, origin-bound handshake delivery,
foreground-only credentials, shell-chrome consent — and a hostile test channel
that must fail to break out before any dialed channel is ever mounted (§5 D).

**Android only.** Desktop is post-v1; the launcher continues to serve it. The
set gets built once, on the platform where flipping channels belongs.
