# Surf — design spec

**Date:** 2026-07-28
**Status:** Draft for operator review
**Codename/name:** **Surf** (decided)

## 1. What it is

Surf is a phone + desktop app that replaces the "app launcher" model with a
**television**: you open it and you are on a live channel, and you flip.
Channels are the network's apps — the social feed, the games (Reef, chess,
Chips & Dip, The Shoal, The Trench), the wiki, forums, chat — and, as the
network grows, news, an inbox, and eventually streamed video, all arriving as
channels on the dial rather than as app-store releases.

**The soul (one sentence):** *Somewhere out there, it's already on.*

Two truths make the TV metaphor real here and fake everywhere else:

1. **The broadcast continues without you.** Your node syncs whether or not a
   channel's UI is mounted. Flipping lands on something that was genuinely
   happening — not a fetch-on-open simulation of liveness.
2. **Watching is feeding.** Content on Swimchain decays without engagement.
   Tuning in, lingering, and flaring a channel are real engagement actions
   that literally keep it alive. The viewer is life support.

Product rules that follow from the soul:

- **No home screen, ever.** The app opens onto a live channel, always.
- **Nothing stands between the viewer and the sea.** No interstitials, no
  loading cards; the only permitted "between" is the (meaningful) static seam.
- **No password wall.** First power-on silently creates the node identity
  (mobile-app's current behavior, extended to desktop). The seed is encrypted
  at rest as today; device-level protection (Android keystore / OS user auth)
  is a later hardening, not a v1 gate. *(Flagged for operator: this diverges
  from desktop-launcher's password unlock.)*

Surf is a **new app** (`surf-app/`), not a rewrite of `mobile-app/` or
`desktop-app/` in place. It replaces `mobile-app` as the shipped Android app
when it reaches parity (feed channel works end-to-end); the desktop launcher
continues to exist for the "node homestead / many windows" audience.

## 2. Architecture

One Tauri v2 project, `surf-app/`, building both an Android APK and a Windows
(later mac/Linux) desktop binary.

### 2.1 Node host — two backends, one interface

A Rust trait (`NodeHost`) with the operations the shell needs:
`status()`, `rpc_endpoint()`, `rpc_auth()`, `node_address()`, plus
lifecycle (`start`, `stop`).

- **Android:** in-process node, exactly `mobile-app`'s model — lib link,
  autostart, Kotlin `NodeForegroundService` keeps it alive in the background,
  loopback-only cleartext, rustls `ring` backend for Android targets.
  Port: the mobile defaults.
- **Desktop:** `sw.exe` sidecar, exactly `desktop-app`'s model — spawn with
  free-port-pair scan (`find_free_port_pair` pattern), cookie auth, stderr to
  `node.log`. Surf uses **its own data dir** (`swimchain-surf` app id) so it
  never fights the launcher's node for the sled lock; the port scan already
  handles coexistence.
- **Network:** Mainnet, hardcoded (like `mobile-app` today). The
  `network.magic` data guard applies as-is.

The dial UI above the trait never knows which backend it runs on.

### 2.2 The deck — warm channel management

The shell renders channels as iframes speaking the **existing
`SWIMCHAIN_RPC_CONFIG` postMessage contract** (endpoint + cookie auth +
`nodeAddress`), i.e. the same contract `desktop-app` ClientFrame,
`mobile-app`, and app-shell already use. A client that speaks it today is a
channel with **zero changes**.

- **Warm set:** N most-recently-watched channels stay mounted (N=3 Android,
  N=5 desktop; tunable). LRU eviction. One channel is pinnable ("always
  warm").
- **Flip:** if target is warm → shown instantly; if cold → mounted, config
  posted, shown when its first paint lands (the static seam covers mount
  time, but is never artificially extended).
- **Hidden channels** receive `SWIMCHAIN_CHANNEL_HIDDEN` / `_VISIBLE`
  postMessages so well-behaved games pause render loops. Advisory; ignoring
  it costs battery until eviction.
- **Known risk (memory: hash-wasm event-loop starvation):** clients that mine
  PoW must keep it in Workers; a synchronous await-hash loop in a warm hidden
  channel starves its own event loop. Channel-side fix, but the deck must
  survive an unresponsive iframe (eviction works regardless).

### 2.3 Liveness is driven, not assumed

DESIGN LAW (memory): nodes fetch content on demand only — keeping a space
alive needs a driver. **Surf's tuner is that driver.** Tuning a channel:

1. adds its space(s) to `followed_spaces` (cache retention),
2. fires `request_content` for recent content in those spaces,
3. counts a real engagement signal (see Dead Air / flare).

This is what makes "it's already on" true for the channels you actually
watch: the foreground service + followed spaces keep them synced while the
set is off. Reads must honor **chain + mempool** (design law): a flare or
post shows as real the moment it's in the mempool, never "waiting for a
block."

### 2.4 The lineup — baked core + on-chain dial (hybrid)

**Baked (v1):** the existing clients' dist bundles ship in the binary —
feed, wiki, forum, chat, reef, chess, chips, shoal, trench(*). On Android the
bundles embed in the `.so` at cargo-build time (mobile-app's model and its
known gotcha: frontend changes need a cargo rebuild).

(*) Trench's UI is `trench-client/ui` and needs `TAURI_ENV_PLATFORM` set at
build (memory: grey-screen incident); whether Trench is a sensible *phone*
channel is decided at plan time — it may be desktop-only in v1.

**On-chain dial (v1 = registry, v2 = bundles):** the shell reads a **channel
registry** from a curated space (same allowlist pattern as /browse). Each
entry: channel name, category, depth hint, icon, and a *source*:

- `baked:<id>` — points at a bundled client,
- `url:<https://…>` — hosted client (swimchain.io already hosts reef, chess,
  browse) — the v1 path for channels appearing without an app release,
- `hash:<content-hash>` — bundle fetched through the node's own content
  store — **v2**, no web server involved.

**Trust line:** baked channels get full RPC config. `url:`/`hash:` channels
render **sandboxed** — no RPC auth injected — until the viewer explicitly
**subscribes** (a deliberate act, framed diegetically), after which they get
the standard config. Subscription state is local.

### 2.5 Identity — one self across every channel

All channels share the node's identity via the `nodeAddress` handover: your
name, reputation, sponsorship, and game standing are the same everywhere on
the dial. Work items this implies (plan-time inventory):

- Every baked client must support parent-RPC-config + node-identity mode
  (feed/forum/chat/wiki/search already do; reef/chess/chips were built
  browser-first and must adopt the shared `useParentRpcConfig` /
  `useNodeIdentity` hooks from `swimchain-react` — verify per client).
- **Sponsorship:** a freshly minted identity can't act on mainnet until
  sponsored. Surf's first power-on runs the existing N2 game-onboarding
  auto-sponsor flow (standing genesis offer + proxy allowlist) in the
  background during the phosphor bloom. If sponsorship is still pending when
  the user first tries to *act*, the UI says so diegetically ("your signal is
  still being picked up") rather than failing.
- Seed never leaves the node; channels sign via `sign_message` RPC (desktop
  parity model).

## 3. The experience

### 3.1 Power-On

No splash, no menu. Black screen → a phosphor-green point blooms from center
(~700ms CSS over the already-mounted last channel) with a low hull-groan
swell → you are on your **last channel, mid-broadcast, scrolled to now**.
First-ever launch lands on the feed channel while identity mint + sponsorship
run behind the bloom.

### 3.2 The Flip

Vertical swipe (phone) / Up-Down keys or wheel (desktop) = next/prev channel
in dial order. Between channels, ≤300ms of **honest static**: a canvas shader
whose snow is driven by live node numbers — fleck density from peer/gossip
activity, a ghost of the latest block hash drifting through, particle drift
from mempool size. Busy network nights boil; quiet nights fall like marine
snow. Sound: soft burble-hiss, sonar ping on lock.

**No interstitial card.** The channel number + name burn briefly in a corner
**overlaying the live picture** (fat 1978 tuner type, slight underwater
refraction), then fade.

### 3.3 Dead Air

Channels whose content has decayed are **not hidden** — you flip through
them. Test card: SMPTE bars re-colored as bleached coral, channel name, and:

> LAST SIGNAL: 6 DAYS AGO. THIS CHANNEL IS DYING.

One action: **Send up a flare** — a real engagement action (existing engage
verb, real PoW, submitted to mempool). Staying tuned + flaring visibly
re-saturates the bars over time. Data source: `space_health` metrics /
engagement recency via RPC (exact RPC inventory at plan time; if a compact
"channel health" aggregate is missing, add one node-side).

### 3.4 The Chart (guide)

Pull down from any channel → **The Chart**: a single vertical water column,
descending from sunlit surface to trench black. Channels sit at depths by
kind (news/feed near surface; forums/chat mid-water; games at the reef;
The Trench in the black; Channel 0 below everything). Scrolling down is
descending; water darkens; channel numbers ascend with depth.

- **Brightness is truth:** each channel's glow = its real engagement health
  (same data as Dead Air). The guide is a rescue map — you can *see* what
  dies without viewers tonight.
- **Warmth is memory:** warm-deck channels carry phosphor afterglow that
  fades over minutes.
- **Mooring:** favoriting = mooring a buoy at a depth; moored channels are
  one flick away. Tap any light → drop in, in progress, always.

### 3.5 Night Swim & Channel 0

After local midnight the set drops into deep-water dress: darker palette,
slower static, quieter pings. **Channel 0 surfaces** — a lean-back ambient
station assembled client-side: posts from followed/allowlisted spaces read
out slowly in large type, a live Reef board panning, chain telemetry as
bioluminescence. Zero interaction. This is the standing timeslot where
streamed video eventually lives; text and game-state are its first
programming. (Channel 0 exists at all hours on the dial's far end; it only
*auto-surfaces* at night.)

### 3.6 Interference

New registry entries are never announced with badges. While flipping, the
static occasionally resolves into a half-tuned, desaturated ghost of the new
channel: "NEW SIGNAL DETECTED — hold to tune." Holding locks it into a
station sign-on card (FIRST BROADCAST + name + born-on date) and offers the
subscribe act if it's a `url:`/`hash:` channel.

### 3.7 Power-Off

On close/background: picture collapses to the CRT white dot; the dot shrinks
to a steady lantern-point with the line *"Still broadcasting."* — because the
node (foreground service on Android) genuinely keeps running. ~10 lines of
CSS; teaches the deepest technical truth on every exit.

## 4. What Surf is not (v1 scope fences)

- **No video/live TV/movies.** The Channel 0 timeslot is built; its video
  programming is not. Streaming over content chunks is its own future
  workstream.
- **No email/inbox channel.** DMs/private-space primitives exist; the inbox
  channel is a future registry entry, not v1.
- **No `hash:` bundle loading** (v2). V1 on-chain dial = registry + `url:`
  channels + sandbox/subscribe.
- **No cross-channel deep-linking** in v1 (the launcher's Phase-4 gap is not
  inherited as a requirement; a `SWIMCHAIN_NAVIGATE` from one channel may
  simply flip the dial if trivial, else deferred).
- **Desktop launcher is not deleted.** Surf ships alongside it.

## 5. Delivery phases

1. **Phase A — the set:** `surf-app/` scaffold, NodeHost trait + both
   backends, deck (warm set, flip, RPC-config handover), baked lineup with
   feed + wiki + one game, power-on/power-off moments. *Milestone: flip
   between live channels on a Pixel and on Windows.*
2. **Phase B — the soul:** honest static, OSD overlay, Dead Air + flare,
   The Chart with health glow + mooring.
3. **Phase C — the dial:** registry space + reader, `url:` channels,
   sandbox/subscribe, Interference, Channel 0 / Night Swim.
4. **Phase D — the fleet:** remaining baked channels (incl. games'
   node-identity adoption), Android release build + signing (existing
   keystore recipe), replace `mobile-app` as the shipped APK.

Each phase gets its own implementation plan (writing-plans skill) and is
independently shippable.

## 6. Error handling & testing

- **Node fails to start:** the set shows full-screen honest static with a
  diegetic diagnostic line (and a plain-text details toggle — production
  bar, but debuggable). Desktop: tail of `node.log` behind the toggle.
- **Channel bundle fails to load / iframe wedges:** channel shows Dead Air
  variant "SIGNAL LOST" with retune (remount) action; deck eviction must
  work even when an iframe is unresponsive.
- **Sponsorship pending / RPC auth missing:** act-blocking states are
  explained in-world, never as raw errors.
- **Tests:** NodeHost trait unit tests per backend (regtest, like
  mobile-app's `node_host.rs` tests); deck logic (LRU, pinning, eviction,
  config handover) as TS unit tests; registry parsing (malformed entries,
  unknown source kinds → skipped, never crash) unit-tested; per the
  mutation-test rule, every load-bearing test is proven to fail against the
  bug it names. E2E smoke per platform: power-on → flip through 3 channels →
  post from feed channel → flare a dead channel, verified against regtest.
- **Perf gates (phone-first):** flip-to-paint ≤300ms warm, ≤2s cold on a
  Pixel-class device; static shader ≤1 canvas at 30fps; no event-loop
  starvation with 3 warm channels including one game.

## 7. Open questions (non-blocking, decided at plan time)

- Trench on the phone dial: include, desktop-only, or registry `url:` later?
- Channel numbering scheme (stable per registry order vs. depth-derived).
- Exact RPC inventory for health/static (what exists vs. small additions).
- Whether Surf desktop should offer "adopt existing launcher identity"
  (import path) or stay cleanly separate in v1.
