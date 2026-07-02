# State of Swimchain — Frontend Parity Audit

**Date:** 2026-07-01
**Method:** 6 parallel code audits (node RPC surface + all 13 client apps + shared libraries), verified against current source. Supersedes `CROSS_CLIENT_AUDIT.md` (2026-02-17) and `NOT_IMPLEMENTED_SWEEP.md` (2026-02-17), both of which are now materially stale — several of their "PASS" claims are false against the current node API, and several of their CRITICAL findings have since been fixed.

---

## Executive Summary

The backend is in good shape, with caveats. The node exposes **~74 implemented JSON-RPC methods** plus WebSocket subscriptions across every feature domain. The frontend fleet is **wide but shallow**: 13 client apps exist, none is production-ready, and feature parity is poor because the fleet is built on **four divergent copies of the same identity/RPC/PoW stack**.

Headline numbers:

| Metric | Value |
|---|---|
| Node RPC methods implemented | ~74 (+3 WS control, +8 event topics) |
| Node RPC methods stubbed/partial | 6 (1 stub, 1 deprecated, 4 partial private-space) |
| Phantom methods (allowlisted, no handler) | 15 |
| Client apps | 13 (10 web, 1 mobile, 1 desktop shell, 1 debug tool) |
| Clients calling nonexistent RPC methods | 1 (forum-client, 3 methods) |
| Clients with fake/no-op core features | 3 (archiver, web-gateway, mobile write path) |
| Parallel implementations of crypto/RPC stack | 4 |
| Clients using node WebSocket events | 0 |
| Unit tests across analytics/archiver/bridge | 0 |
| Untracked-in-git deliverables | wiki-client, swimchain-frontend (both real, recent work) |

### The five structural problems

1. **SDK fragmentation (root cause of parity drift).** Four parallel stacks: (a) `swimchain-react` + `swimchain-js` (used by analytics/archiver/bridge), (b) `@swimchain/frontend` (chat/search/wiki — still ships pre-rename `chainsocial_wasm`), (c) forum/feed self-contained `@noble`-based copies, (d) mobile's own React Native copies (where signing is a zero-byte stub). Every protocol change must be ported 4 times; in practice it isn't, so clients drift.
2. **Silent write-path breakage.** forum-client calls three methods the node doesn't have (`post_to_private_space`, `post_to_space`, `upload_content`) — private-space/DM message send and profile editing are broken. archiver-client mines real Argon2id PoW and never submits it — its core rescue feature has zero on-chain effect and its pool-progress display is fabricated. mobile-client's entire write path is fake (zero-byte signatures, SHA-256 masquerading as Argon2id in both native modules).
3. **Dead code shipping in bundles.** chat-client carries an entire unrouted legacy UI generation (SpaceChatPage stack) full of `setTimeout`-fake PoW and `Math.random()` heat decay. search-client ships a 150-line financial-trading widget (`MacroRegimeCard`) from a different project. mobile ships ~450 lines of unmounted navigators. desktop bundles ~32 MB of stale/foreign node binaries.
4. **No real-time.** The node has a WebSocket event system (`content_new`, `content_engaged`, `sync_status`, `peer_connected`…) that **zero clients use**. Chat polls; feed polls; the one "real-time updates" hook is an intentional no-op.
5. **Version-control risk.** The two most recently developed pieces (wiki-client, `@swimchain/frontend` SDK) are entirely untracked in git.

---

## Backend: Node RPC Surface (the feature universe)

Dispatcher: `src/rpc/methods.rs` (`dispatch()`, ~line 681). Auth: cookie (Bitcoin-Core style) or Ed25519 signature headers (`X-CS-Identity/Timestamp/Signature`). RPC port = P2P port + 1 (mainnet 9736 / testnet 19736 / regtest 29736). Localhost-only bind. Last RPC commit: 2026-02-05 — the API has been frozen ~5 months.

Implemented and solid: node status/chain (7), peer/network (4), identity (5 of 6), content/posts (14), engagement/reactions (5), forks (5), spam attestation (4), search (4), sponsorship (12), DMs (4), WebSocket subscribe/unsubscribe/ping + 8 event topics.

**Backend gaps that block frontend parity (the "backend is fine" caveats):**

| Gap | Detail | Blocks |
|---|---|---|
| `contribute_to_pool` stub | Returns `MethodNotFound` (`methods.rs:6488`) | Pool contribution UIs (feed/forum call it) |
| Private-space actions don't broadcast | `invite_to_space`, `accept_invite`, `leave_space`, `kick_member` mutate local state only; network broadcast is TODO (`methods.rs:9333/9574/9803/10025`) | Multi-node private spaces in every client |
| No blocklist RPC | `BlocklistStore` enforced internally, but no list/manage methods; `list_blocklist` allowlisted with no handler | All clients fake it with localStorage |
| No analytics/metrics RPC | No aggregate stats endpoint | analytics-client does O(spaces×content) client-side aggregation |
| `get_identity_level` deprecated placeholder | Returns fake values + warning | forum/feed still call it |
| 15 phantom allowlist entries | `list_threads`, `get_space`, `create_thread`, `search_content`, … allowlisted in `server.rs:460-503` but not dispatched | Confused client authors (forum's 3 broken calls follow this pattern) |

---

## Client-by-Client State

Completeness is a judgment of "distance from shippable for its scoped purpose," not a checkbox count.

### Tier 1 — Flagship (bundled in desktop app)

| Client | Est. complete | Verdict |
|---|---|---|
| **forum-client** | ~85% | Most complete client. Full sponsorship (all 12 RPCs), moderation w/ real PoW, media, decay display, DM/invite plumbing. **Broken:** private-space chat send (`post_to_private_space` — method doesn't exist), profile save (`post_to_space`), avatar upload (`upload_content`); all three lack PoW params and were written against an imagined API. Leave-space unwired (`SpaceSettings.tsx:119`). Node-managed identity (remote `sign_message`). |
| **feed-client** | ~88% | Real PoW, real signatures, full sponsorship, moderation w/ counter-attestation, private-space E2E crypto. **FIXED:** followed-user posts now appear in feed via `get_user_posts` RPC (`useFeed.ts:239` wired); fabricated local-space fallback removed (`CreatePrivateSpace.tsx`). **Gaps:** user discovery tab empty; DM RPC wrappers with no UI. |
| **chat-client** | ~65% | Live path (servers=spaces, channels=threads, messages=replies, reactions via `submit_engagement`, real Argon2id PoW) is genuine. **But:** ships dead legacy SpaceChatPage stack with fake PoW/heat; presence/typing are local-only simulations; private spaces are create-only (no accept-invite UI, no channel list, no members/kick — node supports all); zero sponsorship; no DMs; no decay display; search is client-side filter; no identity backup, seed stored plaintext. |
| **search-client** | ~75% (scoped) | Clean, real search/suggest/trending with query DSL, client-side blocklist. **Gaps:** no report/spam-attestation path; `MacroRegimeCard` foreign dead code; footer links to unregistered routes; deep links target forum-client while feed-client is the natural post renderer. |

### Tier 2 — Specialized

| Client | Est. complete | Verdict |
|---|---|---|
| **bridge-client** | ~75% | Most complete end-to-end specialized client. Real Matrix Client-Server API (whoami/sync/send), real IRC protocol over WebSocket→TCP proxy, real signed `submit_post` with PoW, AES-GCM decryption of private content, echo/rate-limit/budget protection. **Gaps:** the required IRC WebSocket proxy isn't in the repo (IRC half dead out-of-box); messages arriving during mining are silently dropped; inbound always posts as new post, never threaded reply; Matrix sync is short-poll. |
| **analytics-client** | ~70% (read-only) | Real telemetry (health score from live sync/peers/content). **Gaps:** `engagementsLast24h` hardcoded 0 (TODO); `activeSwimmers` = peer count (proxy metric); moderation page is localStorage-only, no on-chain attestation; client-side aggregation won't scale; zero tests. |
| **archiver-client** | ~50% | Detection real (decay math, spam filtering, pool status). **Core feature is a no-op:** `AutoEngageEngine.engage()` mines a valid Argon2id solution then discards it — its `rpc.ts` has no submit method at all. Pool progress shown to the user is computed locally (`currentSeconds + seconds`, `contributorCount + 1`). Burns CPU, preserves nothing on-chain. |
| **wiki-client** | ~70% prototype | Newest work (Feb 18). Real signed RPC, markdown editor, wikilinks, TOC, revision diffs, talk pages. **Gaps:** untracked in git; a fork of search-client with orphaned leftovers; revisions faked by sorting `list_space_content`; verify writes actually mine PoW; moderation local-only. |
| **debug-dashboard** | works (ops tool) | Vanilla JS + Node proxy, real multi-node RPC. Unhardened proxy (`Access-Control-Allow-Origin: *` on a cookie-auth proxy, no timeouts). |

### Tier 3 — Shells & husks

| Client | Est. complete | Verdict |
|---|---|---|
| **web-gateway** | ~40% | Polished Next.js SSR/SEO shell (middleware, sitemap, structured data, real lunr ranking engine + docs) over **100% mock data** — `NodeConnection` methods all return null/[]. No RPC client exists. Stale since Dec 2025. Highest-leverage fix: port wiki-client's read-only RPC subset. |
| **mobile-client** | ~55% | Read/browse path real (full JSON-RPC client, hooks, screens). **Write path is fake end-to-end:** `useKeypair` sign returns 64 zero bytes; both Android and iOS "Argon2id" native modules compute SHA-256 placeholders (iOS `fatalError`s on the real path). Declares `@swimchain/react`/`core` but imports neither. 12 unused navigators (~450 LOC). |
| **desktop-app** | alpha | The packaged "node + multi-frontend" product. Real node lifecycle (spawn/stop `sw.exe`, cookie auth, onboarding/unlock), embeds **4 clients (forum/chat/feed/search)** as iframes with RPC config injected via postMessage. **Gaps:** chat-client has no parent-RPC-config listener — bundled but not wired; identity is per-iframe, not unified (shell injects endpoint+cookie only); testnet hardcoded; placeholder address derivation (hex-SHA256, not Bech32m); ~32 MB stale/foreign binaries bundled; debug screenshot scaffolding in prod; dead legacy RPC context. Two divergent build recipes (`build.sh` vs `build.ps1`/`build-clients.js`) that disagree on which SDK to build. |
| **reddit-client** | 0% | Dead husk — only a stray `.vite` temp artifact on disk. Nothing to finish. **Recommend: delete the directory**; if reddit-style voting is wanted it's a greenfield project. |

### Shared libraries

- **`@swimchain/frontend`** (swimchain-frontend/): the SDK for chat/search/wiki. Identity provider, Argon2id action-PoW, encryption, X25519. Functional, built, **untracked in git**, ships pre-rename `chainsocial_wasm` artifacts, no tests on load-bearing crypto, consumed via `file:` links with silent-staleness risk.
- **`@swimchain/react` + `@swimchain/core`** (swimchain-react/, swimchain-js/): the other SDK lineage (analytics/archiver/bridge). Broad hook surface incl. action-pow, encryption, DM utils. A *third* `@swimchain/react` fork exists at `clients/packages/react`.
- **swimchain-wasm**: canonical Rust WASM crate; compiled copies vendored divergently across clients.

---

## Feature Parity Matrix

Legend: ✅ implemented · 🟡 partial · ❌ missing · 💥 broken (calls nonexistent API or fakes results) · ▫ n/a by design

| Domain | forum | feed | chat | search | wiki | analytics | archiver | bridge | gateway | mobile |
|---|---|---|---|---|---|---|---|---|---|---|
| Identity (keys, names, display) | ✅ | ✅ | 🟡 no backup | 🟡 delegated | ✅ | ▫ read-only | ✅ | ✅ | ▫ | 💥 stub sign |
| Content create (post/reply/edit, PoW) | ✅ | ✅ | ✅ | ▫ | ✅¹ | ▫ | ▫ | ✅ | ▫ | 💥 fake PoW |
| Content display + decay | ✅ | ✅ | 🟡 no decay | ✅ | ✅ | ✅ | ✅ | ✅ | 💥 mock data | ✅ |
| Media upload/display | ✅ | ✅ | ✅ | ▫ | ❌ | ▫ | ▫ | ❌ | ▫ | ❌ |
| Engagement/reactions | ✅ | ✅ | ✅ | ▫ | ❌ | ▫ | 💥 not submitted | ▫ | ▫ | 💥 |
| Sponsorship | ✅ full | ✅ full | ❌ | 🟡 badge only | ❌ | 🟡 offers view | ❌ | ❌ | ❌ | ❌ |
| Private spaces (create/E2E) | ✅ | ✅ | 🟡 create-only | ▫ | ❌ | ▫ | ▫ | 🟡 decrypt only | ▫ | ❌ |
| Private space send | 💥 phantom RPC | ✅ | ✅ | ▫ | ▫ | ▫ | ▫ | ▫ | ▫ | ❌ |
| Invites (send/accept/members/kick) | ✅ | ✅ | 🟡 send only | ▫ | ❌ | ▫ | ▫ | ▫ | ▫ | ❌ |
| DMs | ✅ | 🟡 RPC no UI | ❌ | ▫ | ▫ | ▫ | ▫ | ▫ | ▫ | ❌ |
| Moderation: report/attestation | ✅ + counter | ✅ + counter | 🟡 report only | ❌ | ❌ | ❌ local block | ✅ checks | ✅ checks | ▫ | ❌ |
| Moderation: blocklist | ✅ local | ✅ local | ✅ local | ✅ local | ✅ local | ✅ local | ✅ local | ✅ local | ▫ | ❌ |
| Search | ✅ | ✅ | 💥 local filter | ✅ full | ✅ | ▫ | ▫ | ▫ | 💥 mock | ✅ |
| Real-time (WS events) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Profile view/edit | 💥 save broken | ✅ | 🟡 name only | ▫ | ❌ | ▫ | ▫ | ▫ | 💥 mock | 🟡 |

¹ wiki writes need verification that PoW is actually mined before ship.

Blocklist row: all "local" = per-browser localStorage, not synced, because no node RPC exists (backend gap).

---

## The Plan

Four phases. Phase 0 unblocks; Phase 1 fixes what's broken; Phase 2 builds parity; Phase 3 hardens. Lanes within a phase are parallel and independently claimable. The DAG is encoded in `post_parity_dag.py` for the Overmind board; a static snapshot renders in `docs/parity-dashboard.html`.

### Phase 0 — Foundations (do first; small; unblocks everything)
- **F1** Commit wiki-client + swimchain-frontend to git; delete reddit-client husk. (S) — PR #1 open on GitHub
- **F2** Backend enablers: implement or remove `contribute_to_pool`; add network broadcast to the 4 private-space actions; add blocklist list/manage RPC; prune 15 phantom allowlist entries. (L, backend) — PR #13 open on GitHub
- **F3** SDK decision: pick ONE shared package (recommend `@swimchain/frontend` as base — newest, already consumed by 3 clients), absorb `swimchain-react`'s action-pow/encryption/DM utils, add the parent-RPC-config (postMessage) handshake into it, rename `chainsocial_wasm` artifacts. (L) — PR #11 open on GitHub

### Phase 1 — Fix what's broken (parallel lanes)
- **B1** forum: replace 3 phantom RPC calls with real `submit_post`/`submit_reply`/`upload_media` + PoW (fixes private-space chat send, profile save, avatar). (M) **✔ DONE** — PR #18: https://github.com/superness/swimchain/pull/18
- **B2** forum: wire leave-space; delete dead mocks/data.ts; wire keyboard engagement. (S) **✔ DONE** — merged to main (commit 00c75f5, PR #5)
- **B3** chat: delete dead SpaceChatPage stack + fake hooks (useReactions, useRealTimeUpdates, etc.). (M) — PR #2 open on GitHub
- **B4** feed: wire followed-user posts via existing `get_user_posts`; remove fabricated local-space fallback. (M) **✔ DONE** — merged to main — PR #7 closed
- **B5** search: delete MacroRegimeCard; fix dead footer routes; unify deep-link target. (S)
- **B6** archiver: add `submit_engagement` to its RPC client and actually submit mined PoW; replace locally-fabricated pool status with authoritative re-poll. (L) **✔ DONE** — merged to main (commit cc96dc2, PR #12). ← *top correctness fix in the fleet*
- **B7** ✅ bridge: ship/document IRC WebSocket proxy; queue (don't drop) messages during mining; thread inbound as replies. (M) — PR #10 open on GitHub; docs update on main (commit 61e7bb6)
- **B8** web-gateway: port wiki-client's read-only RPC subset; delete all MOCK_*; feed lunr index + sitemap from live node; real health check. (L)
- **B9** mobile: real Ed25519 signing (replace zero-byte stub); real Argon2id (argon2kt / Argon2Swift); on-device identity generation. (L) — PR #4 open on GitHub
- **B10** desktop: chat parent-RPC handshake (via F3 SDK); strip debug scaffolding; prune stale binaries; real Bech32m in `check_identity`. (M)

### Phase 2 — Parity build-out (gated on relevant Phase 0/1 lanes)
- **P1** chat: accept-invite UI + private-channel list + members/kick (gated F2). (M)
- **P2** chat: DMs; sponsorship; decay indicators; server-side search. (L) — PR #8 open on GitHub
- **P3** feed: user discovery; DM inbox UI. (M)
- **P4** search: report/attestation parity. (M) — PR #6 open on GitHub
- **P5** wiki: real revision model; verify write PoW; moderation. (M) **✔ DONE** — merged to main (PR #9)
- **P6** real-time: adopt node WS events in the shared SDK, wire into chat (messages) and feed (new content) first. (L)
- **P7** analytics: real engagement metric; on-chain attestation from moderation page (gated F2 blocklist RPC for synced blocklists). (M)
- **P8** desktop: network selection UI; unified identity story across iframes; consider bundling wiki. (L)

### Phase 3 — Hardening & ship
- **Q1** Tests: unit tests for analytics/archiver/bridge (currently zero) + crypto tests in the SDK. (M)
- **Q2** E2E write-path validation of every client against a regtest node (post → PoW → sign → accepted). (M)
- **Q3** Cross-client re-audit checkpoint; refresh this document; desktop packaged-app release candidate. (M)

### Sequencing rationale
F3 (SDK unification) is the highest-leverage item in the program: B10's chat handshake, P6's real-time, B9's mobile crypto, and all future parity work land once instead of four times. But it's long — so Phase 1 broken-fixes run in parallel against clients' current stacks rather than waiting; only lanes touching the handshake/real-time gate on it.

---

## Appendix: source audit trails

Per-client detail (file:line evidence for every claim above) lives in the six audit transcripts from 2026-07-01; key anchors:
- forum phantom RPCs: `ChatView.tsx:93`, `Profile.tsx:132,145,155` **— FIXED in B1 (PR #18: https://github.com/superness/swimchain/pull/18)**
- archiver no-op rescue: `AutoEngageEngine.ts:165-259`, `EngageButton.tsx:103` **— FIXED in B6 (merged to main)**
- mobile fake crypto: `useKeypair.ts` (zero-byte sign), `NativeArgon2Module.kt:187-200`, `NativeArgon2.swift:181-215` — PR #4 open
- chat dead stack: `SpaceChatPage.tsx` subtree, `useReactions.ts:49-52`, `useRealTimeUpdates.ts:29-67` — PR #2 open
- desktop chat gap: no `useParentRpcConfig` in chat-client or `@swimchain/frontend` — PR #11 addresses SDK unification
- node partial private-space: `methods.rs:9333, 9574, 9803, 10025`; pool stub `methods.rs:6488` — PR #13 addresses F2 backend enablers
