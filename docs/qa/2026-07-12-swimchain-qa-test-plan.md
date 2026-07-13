# Swimchain QA Test Plan — Cross-Surface Functional, Real-Time & Visual QA

**Date:** 2026-07-12
**Network:** Testnet, magic **TES4** (action-signature enforcement fork)
**Author:** QA session (operator)
**Status:** Test-driven documentation — written BEFORE operating. Scenarios define
expectations; execution fills in the Result/Actual columns and the bug log.

---

## 1. Objective

Exercise Swimchain end-to-end across every surface a real user or operator
touches, and characterize not just *whether* things work but *how they feel*:
propagation latency, real-time behavior, mempool-only timing edges, and visual
quality. Produce (a) a functional bug log, (b) a visual/UX defect log, and (c) a
quantified **propagation timing profile** per action type per surface.

This is exploratory + scripted QA on a live testnet, not a unit-test suite. The
value is in *observed timings and defects on real infrastructure*.

## 2. Topology (system under test)

All four nodes speak TES4 and can gossip to each other over the testnet.

| # | Surface | Node | RPC | Role |
|---|---------|------|-----|------|
| **S1** | Local node RPC | Windows `sw` (built from HEAD) | `127.0.0.1:19736` (cookie auth) | Ground-truth data via direct JSON-RPC |
| **S2** | Droplet CLI | Seed `167.71.241.252` (`/var/lib/swimchain-testnet`) | `sw` CLI over SSH | Remote node view; DNS seed |
| **S3** | PC feed UI | Same local node as S1 (framed) | swim-auto Chromium on `:8899` shell | Desktop feed client, node-identity mode |
| **S4** | Mobile UI | Phone in-process node (Pixel 8 Pro `46281FDJG001JN`) | `127.0.0.1:19736` on device (adb) | Android app, in-process node |
| — | Activity/faucet | Bot `165.22.47.107` | systemd bot | Generates posts/reacts + sponsor faucet offers |

**Data flow under test:** an action on any surface writes to *that node's*
mempool → gossips to peer nodes' mempools → block formation folds it into the
chain → every node re-serves it. Propagation latency = time from action at
origin to visibility at each other surface. Block-formation threshold on testnet
is network-scaled with a cold-start floor (commit `3ad32e12`).

**Identities:** Genesis ("Super") is NOT run on the seed (operator policy). New
QA identities are minted fresh and must be sponsored via the **bot faucet** offer
flow before they can post. This is itself a test target.

## 3. Surfaces & how to read each one

- **S1 local RPC** — `curl` with cookie auth. Canonical reference for "what the
  chain/mempool actually holds." Cookie: `<datadir>/genesis-testnet/.cookie` (or
  the fresh-node datadir). Auth header per `lib/node-rpc.js`.
- **S2 droplet CLI** — `ssh -i ~/.ssh/swimchain_seed_ed25519 root@167.71.241.252`
  then `sw --testnet --data-dir /var/lib/swimchain-testnet <query>`; or `curl`
  the droplet's local RPC on the box. Used to confirm content propagated OFF the
  origin node to an independent remote node.
- **S3 PC feed UI** — swim-auto: `open feed`, `ui` (ARIA snapshot for selectors),
  `click`/`type`, `screenshot` (Read the PNG), `eval` (read DOM state/timestamps),
  `logs --errors` (console errors / failed requests).
- **S4 mobile UI** — `adb -s 46281FDJG001JN exec-out screencap -p > shot.png`;
  interaction by observation (+ `adb shell input` where scripted taps help).
  Phone RPC reachable via `adb forward tcp:PORT tcp:19736` for ground-truth.

## 4. Latency / propagation methodology

For every propagation-sensitive action:

1. Embed a **unique marker** in the payload (e.g. `QA-<scenario>-<epoch_ms>`), so
   the same item is unambiguously found on every surface.
2. Record **t0** = the moment the action is submitted at the origin surface.
3. Poll each *other* surface for the marker and record **t_seen[surface]**.
   - RPC surfaces (S1/S2): tight poll (250–500 ms) on the relevant list method.
   - UI surfaces (S3/S4): poll DOM via `eval` (S3) or periodic screencap (S4);
     record first frame the item is visible. UI adds a client refresh interval
     on top of node propagation — capture both if distinguishable.
4. Report **Δ = t_seen − t0** per surface, and note the phase at which it became
   visible: **mempool** (pre-block) vs **confirmed** (post-block).

Record results in the **Propagation Profile** table (§7). Run each action type
≥3× to get min/median/max; note variance sources (block tick, client poll).

**Timing edge cases to probe explicitly:**
- Visibility of **mempool-only** content (submitted, not yet in a block) on each
  surface — does the feed/list show it? With what treatment (pending badge?)?
- **Reply to / react to mempool-only content** — does it attach correctly, and
  what happens when the parent later confirms in a block?
- **Ordering** when several items land in the same block.
- **Block-formation moment** — does confirmed content flash/reorder/flicker in
  any UI? Does a "pending" item cleanly transition to "confirmed"?
- **Reaction decay** (non-stacking, 5-day) — value present and correctly typed.

## 5. Scenario catalog

Each scenario: **Pre** (preconditions) · **Steps** · **Expect** (pass criteria) ·
**Surfaces** (where to verify) · **Capture** (artifacts/timings to record).

### Group A — Environment & identity

**A1. Local node joins TES4 and syncs with the seed**
- Pre: Windows `sw` built from HEAD; seed live on TES4.
- Steps: start local testnet node; `get_sync_status`; `get_peers`.
- Expect: node reaches `synced`, peer count ≥1 (the seed/bot), chain height
  matches the seed within a few blocks. `network.magic` marker = TES4.
- Surfaces: S1, cross-check height on S2.
- Capture: time-to-first-peer, time-to-synced, final height vs seed.

**A2. Fresh identity creation (PC + mobile)**
- Steps: mint a fresh identity locally (`swim-auto fresh`), and create a new
  identity on the phone via the app's identity flow.
- Expect: identity PoW completes; address (cs1…) shown; `get_identity_info`
  returns it; identity persists across app restart.
- Surfaces: S1/S3 (PC), S4 (phone).
- Capture: PoW duration on each; any UI stall/spinner with no feedback.

**A3. Reputation display sanity (regression on today's fix)**
- Steps: open the fresh identity's profile card on S3 and S4.
- Expect: fresh identity reads **Normal (✓, score 100)**, NOT "Watched"; the ⓘ
  tap-explainer opens and reads clearly on mobile.
- Surfaces: S3, S4; confirm score via `get_reputation` on S1.
- Capture: screenshots of card + open explainer on both surfaces.

### Group B — Sponsorship / faucet

**B1. New identity is unsponsored → blocked from posting**
- Pre: fresh identity, not yet sponsored.
- Steps: attempt to post; inspect `get_sponsorship_status`.
- Expect: post is refused with a *clear* reason; UI explains "needs sponsorship,"
  not a raw error. Status shows unsponsored.
- Surfaces: S3/S4 UI + S1 RPC.
- Capture: exact UI copy on refusal; is it actionable?

**B2. Faucet offer appears and is claimable**
- Pre: bot faucet running on `165.22.47.107`.
- Steps: from the fresh identity, `list_sponsorship_offers` / open the
  Sponsorship screen; wait for a faucet offer.
- Expect: an offer from the faucet appears within a bounded time; UI surfaces it.
- Surfaces: S3/S4 UI + S1 `list_sponsorship_offers`.
- Capture: **latency from identity-created to offer-visible** (per surface).

**B3. Accept sponsorship → identity becomes able to post**
- Steps: accept/claim the offer; re-check `get_sponsorship_status`; then post.
- Expect: sponsorship confirms (may require block formation); after confirmation
  posting succeeds. UI transitions from "pending" to "sponsored" without a
  dead-end.
- Surfaces: all.
- Capture: **latency accept → sponsored-confirmed → first successful post**;
  whether the UI required a manual refresh.

### Group C — Content lifecycle & real-time propagation

**C1. Create a space**
- Steps: create a space with a distinctive name+marker on S3; then repeat origin
  on S4.
- Expect: space appears in `list_spaces` on origin immediately (mempool), then on
  the *other* nodes after propagation/block; **name renders** (not raw space id);
  appears in Discover.
- Surfaces: S1↔S2 (cross-node), S3, S4.
- Capture: propagation profile; **guard against the known "shows space id not
  name / not in Discover" failure** — verify name + Discover explicitly.

**C2. Post to a space (thread/root post)**
- Steps: `submit_post` (or UI compose) with marker; observe across surfaces.
- Expect: visible on origin instantly; propagates to S1/S2/S3/S4; survives block
  formation; author, timestamp, body correct.
- Capture: full propagation profile (mempool Δ and confirmed Δ per surface).

**C3. Reply to a post**
- Steps: reply with marker from a *different* surface than the post origin.
- Expect: reply attaches to correct parent; `get_replies` returns it; thread
  count updates in UIs.
- Capture: propagation profile; correct threading; count-update latency.

**C4. React to content (decaying non-stacking reaction)**
- Steps: add a reaction from S3 and S4; `get_reactions`.
- Expect: reaction stored with correct type; non-stacking (same user re-react
  replaces, doesn't add); value decays (5-day); count reflects across surfaces.
- Capture: propagation profile; non-stacking behavior; any double-count.

**C5. Real-time / live update behavior**
- Steps: with S3 feed and S4 feed both open on the same space, post from S1 (or
  the bot). Do NOT manually refresh.
- Expect: item appears live within the client refresh interval; no need to
  reload. If polling-based, note the interval; if it never appears without
  reload → **bug**.
- Capture: live-update latency per UI; does each surface auto-update at all?

### Group D — Mempool-only timing edges

**D1. Mempool-only visibility**
- Steps: submit a post; before the next block forms, query every surface.
- Expect: define + record actual behavior — is mempool content shown? labeled
  pending? Consistency between RPC and UI.
- Capture: which surfaces show pre-block content; labeling.

**D2. Interacting with mempool-only content**
- Steps: reply to and react to a post that is still mempool-only; then let a
  block form.
- Expect: interactions attach; after the parent confirms, nothing is orphaned or
  duplicated; counts stay correct.
- Capture: any orphan/dupe/reorder at block boundary.

**D3. Block-formation transition**
- Steps: watch a pending item across the block-formation tick on S3/S4.
- Expect: clean pending→confirmed transition; no flicker, disappearance, or
  reordering that looks broken.
- Capture: screenshots before/after; visual glitches.

### Group E — Visual / UX audit (both UIs)

For **every** major screen on **S3 and S4**: Feed, Discover, Space view, Thread,
Compose, Profile card, Identity/Settings, Sponsorship, Node status.

- Expect: text legible (contrast, no clipping/overflow), layouts not broken at
  the surface's viewport, controls labeled and sensible, empty/loading/error
  states present and not confusing, no raw ids/hex where a name belongs, no
  console errors on load (S3 via `logs --errors`).
- Capture: one screenshot per screen per surface; a defect row per issue with
  severity (blocker/major/minor/polish).

## 6. Bug log (fill during execution)

| ID | Surface(s) | Area | Severity | Summary | Repro | Expected | Actual | Screenshot |
|----|-----------|------|----------|---------|-------|----------|--------|------------|
| | | | | | | | | |

Severity: **blocker** (feature unusable) · **major** (wrong result / bad break) ·
**minor** (works, rough) · **polish** (cosmetic).

## 7. Propagation timing profile (fill during execution)

Δ in seconds from action at origin to visibility. `m` = seen while mempool-only,
`c` = only after block confirmation, `—` = never observed.

| Action | Origin | S1 local RPC | S2 droplet CLI | S3 PC UI | S4 phone UI | Confirm (block) | Notes |
|--------|--------|--------------|----------------|----------|-------------|-----------------|-------|
| Create space | | | | | | | |
| Post to space | | | | | | | |
| Reply | | | | | | | |
| Reaction | | | | | | | |
| Sponsorship offer visible | bot | | | | | | |
| Sponsorship accept→confirmed | | | | | | | |
| Live feed update (no refresh) | | | | | | | |

## 8. Exit criteria

- All Group A–D scenarios executed ≥1× (propagation-sensitive ones ≥3×).
- Every Group E screen screenshotted on both UIs and audited.
- Bug log + visual defect log populated; each entry has repro + severity.
- Propagation profile table filled with min/median/max where measured.
- Findings consolidated into a QA report; blockers/majors triaged for fix.

## 9. Execution order

1. **Setup** — build local `sw`; start local node; verify A1. Start swim-auto +
   feed (S3). Confirm phone TES4 + adb (S4). SSH to seed (S2).
2. **A2–A3** identities + reputation regression.
3. **B1–B3** sponsorship/faucet (gates all posting for fresh identities).
4. **C1–C5** content + real-time, capturing the propagation profile.
5. **D1–D3** mempool timing edges.
6. **E** visual/UX audit sweep on both UIs.
7. **Report** — consolidate (§6, §7) into the findings doc; push fixes.
