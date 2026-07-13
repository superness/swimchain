# Swimchain QA Findings — 2026-07-12 (TES4)

Running log. Companion to `2026-07-12-swimchain-qa-test-plan.md`. Severity:
blocker / major / minor / polish. Surfaces: S1 local RPC, S2 seed CLI, S3 PC feed
UI (swim-auto), S4 mobile UI.

## Environment as tested
- Magic **TES4**. Canonical cluster (agree height 6, tip `b42649f5`, cum_pow 4105):
  - Seed `167.71.241.252` (`f95733c9`), Bot `165.22.47.107` (`16db7824`),
    Local qa-user node `d8abca…` (RPC 19746), LAN node `b006114a` @172.22.45.9.
- Fresh local identity: `cs1qq82m0ln0xm7dchk9n2cmyfjdxdz05c0m7cfyllnj5vtk462jedwqa7v72m`.
- Phone `46281FDJG001JN` on cellular (T-Mobile NR / Google Fi).

---

## F0 — CORRECTION (root cause): the phone was a stale TES3 binary, magic-isolated from the TES4 cluster
- The phone `.so` installed earlier today (16:41) was built **before** the concurrent
  session bumped testnet magic TES3→TES4, so the phone spoke **TES3** on the wire
  (`invalid magic bytes … got [54,45,53,33]` = "TES3"). It was therefore magic-isolated
  and could never join the TES4 canonical cluster — independent of any discovery issue.
- The apparent "stale LAN node at 10.0.0.15" was **the phone itself** (its wifi IP is
  10.0.0.15). It was self-connecting via mDNS (`[ACCEPT] Failed to add peer to DHT:
  SelfLookup`), so its "1 peer" was itself, and it stayed on its own old TES3 chain
  with old genesis content.
- **Fix:** rebuild the phone `.so` from current TES4 source + reinstall (the magic
  guard wipes TES3→TES4 on the mismatch, clearing the old content). In progress.
- F1/F1b below are recharacterized in light of this: the seed/DHT-dial gap (F1b) is
  real and still worth fixing, but was *not* why the phone failed here — magic was.
- **RESOLVED:** rebuilt phone `.so` from TES4 source, `pm clear` + reinstall. Phone
  now: "Running · **4 peers · height 8 · 100%**", connected directly to the **seed
  `f95733c9`** and **bot `16db7824`**, old genesis content gone, clean fresh identity.
  Operator flagged "phone doesn't seem like it's tes4" ~1h before this was confirmed —
  correct call; magic should have been the first check.
- **F1b re-assessed:** the fresh TES4 phone *did* dial the seed on its own. The TES3
  phone's failure to reach the seed was the magic mismatch (handshakes rejected),
  and/or older bootstrap code in the TES3 build. Not an open bug on current source.

## Sponsorship / faucet flow (Group B) — mixed: UI great, faucet broken for new users

**B1 — unsponsored state · PASS.** Fresh phone identity shows a clear banner:
"Your identity is not sponsored. You need sponsorship from an existing member to
post, reply, or vote. [Find a Sponsor]". Actionable, not a raw error.

**B2 — offer discovery · PASS (UI).** "Find a Sponsor" shows a "How Sponsorship
Works" explainer, the user's public key with Copy, and an open offer card
(sponsor, type badge "Probationary (180-day trial)", slots, expiry). Offer
propagated to the fresh phone within seconds of joining canonical.

**B3 — claim submission · PASS (UI).** Claim modal (sponsor/type/expiry + optional
application + "public key is shared" note). Submit → ~8s to broadcast → clean
"Claim submitted!" success modal ("pending review… banner updates automatically")
+ a persistent "You have a pending claim" banner. Claim mined into a block
(height 8→9) within ~a minute.

### F5 — Faucet publishes no claimable auto-approving offer; only offer on the network is a dead-end · major
- **Surface:** S4 claim flow + bot faucet (`/opt/swim-bot/run-faucet.sh`) + seed
  `list_sponsorship_offers`.
- **Observed:** the network has exactly **one** sponsorship offer, from sponsor
  **`9ec9661d`** (3 slots, offer `6a1de61e`). The phone claimed it; the claim was
  broadcast, mined (confirmed height 9), and the faucet ran twice (manually) — both
  times **`approved=0 created=0 free_slots=10`**. The faucet's own author identity
  is **`2fa758fc`**, not `9ec9661d`, so it never approves claims to that offer, and
  it never publishes an offer of its own. Net: a new user's only visible offer is a
  dead-end that never auto-approves.
- **Also:** faucet runs on an **hourly** systemd cadence, so even a valid faucet
  claim would wait up to ~1h to be approved — poor first-run UX (can't post until
  approved).
- **Open:** who is `9ec9661d`? (only offer publisher; not the faucet, not any known
  node identity here). Whether the faucet is meant to publish an offer vs
  direct-sponsor. Whether `free_slots=10` reflects an unpublished capacity.
- **Impact:** the advertised path to onboard (claim faucet offer) does not complete
  for a new user on the current testnet.
- **ROOT CAUSE FOUND + FIXED (code):** `create_sponsorship_offer`
  (`src/rpc/methods.rs`) verified the sponsor signature over the client's
  `params.timestamp`, but then stored the offer with `created_at = current_time`
  (server clock). Peers re-verify a propagated offer via
  `PublicSponsorshipOffer::signature_message()`, which derives the signed
  timestamp from `created_at` — so with server time stored there, the signature
  never re-verifies on any other node and the offer is silently dropped
  (`handle_sponsorship_offer` / `handle_sponsorship_offer_list` both `continue`).
  The creating node keeps it (it verified against `params.timestamp`), which is
  exactly why the faucet offer was marooned on the bot. Fix: anchor
  `created_at`/`expires_at` to `params.timestamp`. Regression test added:
  `offer_signature_reverifies_only_when_created_at_is_the_signed_timestamp`.
- **Deploy note:** the pre-fix offer already stored on the bot keeps its bad
  `created_at`, so after deploying the fix the bot's offer store must be cleared
  (or the offer left to expire) so the faucet republishes a correctly-signed,
  propagating offer.
- **SECOND bug, same class (claim path):** `claim_sponsorship_offer` verified the
  claimant signature over `params.timestamp` but stored the claim with
  `claimed_at = current_time`. `SponsorshipClaim::signature_message()` derives the
  signed timestamp from `claimed_at`, so propagated claims failed signature
  re-verification on every peer — the sponsor saw **0 pending claims** and
  auto-approve onboarding stalled even once offers propagated. Fixed: anchor
  `claimed_at` to `params.timestamp`. Regression test
  `claim_signature_reverifies_only_when_claimed_at_is_the_signed_timestamp`.
- **VERIFIED end-to-end (with fixed binary on bot + local claimant):**
  1. Faucet publishes Open offer `67097611` → propagates bot→seed→local→phone
     (all nodes list it; before the fix only the creating node had it).
  2. qa-user claims it → claim reaches the **bot** (`pending_claims=1`, was 0).
  3. Faucet run → **`approved=1`** (bot auto-approves).
  4. On-chain Sponsor action mines + propagates → claimant becomes sponsored.
- **Both fixes committed** (`a2b7785d` offer, `2147d8c3` claim) with unit tests.
- **Remaining rollout for real users:** clients that create offers/claims need the
  fixed binary (the fix is on the *creating* node). Seed already on a post-fix
  build; local rebuilt; **phone `.so` still needs a rebuild+reinstall** with these
  two fixes for mobile onboarding to complete on-device (the mobile claim UI works,
  but a pre-fix phone's claim won't propagate).

## Visual / UX audit (Group E) — running notes

**Mobile (S4):**
- **V1 · polish** — Profile header uses a large, full-width **bright-lime band**
  (the identity's avatar color painted as the whole header background) that clashes
  hard with the otherwise dark theme. The saturated block is jarring; dim/desaturate
  it or restrict the color to the avatar circle.
- Positives: unsponsored banner, "How Sponsorship Works" explainer, pending-claim
  banner, claim modal, and success states are all clear, well-contrasted, and
  readable. Status strip ("Running · N peers · height H · 100%") is a nice touch.

**PC feed (S3):** audit pending (node-identity mode confirmed working; feed empty
for the fresh identity — Discover is the content surface).

### F5 CONFIRMED FIXED — full onboarding verified on-chain
qa-user claimed the faucet offer, the bot approved (`approved=1`), the Sponsor
action mined into block 21, and **local + on-chain both report
`has_sponsorship=true`**; the PC feed UI's "not sponsored" banner cleared and the
Post action became available. The two propagation fixes (offer `created_at`, claim
`claimed_at`) are what unblocked it.

## F6 — Block-formation stalls at threshold; unsponsored node forms rejected blocks · major
- **Surface:** bot + local nodes.
- **Observed:** with the approval action in mempool and `mempool_actions=3 ==
  threshold=3`, the canonical cluster sat at height 20 for 2+ minutes without
  forming a block, even though the bot reported `leader_eligible=true, eta=0s`.
  Meanwhile the **unsponsored local node (`d8abca`) formed block 21 as an
  "ineligible leader"**, which the bot/seed rejected
  (`[BLOCK] REJECTED: … created by ineligible leader d8abca…`), leaving local on a
  1-block fork. Restarting the bot's node unstuck formation (20→21, mempool
  cleared, approval mined) within ~40s.
- **Two issues:** (1) an eligible leader can sit at a met threshold without
  forming a block until nudged (restart) — a formation stall; (2) an
  unsponsored/ineligible node still runs block formation and emits blocks the
  network rejects, creating fork churn. Both delay/disrupt confirmation of
  otherwise-valid actions (here, a sponsorship approval).
- **Impact:** even after the faucet approves, a new user's on-chain sponsorship
  can be delayed indefinitely if no eligible leader forms the block.

## F4 — Magic-mismatch error message hardcodes "expected SWIM" on all networks · minor
- **Surface:** node log (`src/network/error.rs:11`).
- **Observed:** `#[error("invalid magic bytes: expected SWIM, got {0:02x?}")]` always
  says "SWIM" (mainnet) even when the node is testnet/regtest. A TES4 node rejecting a
  TES3 peer logs "expected SWIM", which is misleading and cost real debugging time here.
- **Fix:** use the existing `NetworkContext::expected_magic_display()` (mode.rs:71) in
  the message instead of the literal "SWIM".

## F1 — (superseded by F0 as the phone's blocker) mDNS self-discovery + no seed/DHT dial · major
- **Surface:** S4 (+ cross-checked S1/S2/bot). Phone is on **wifi** (not cellular).
- **Observed:**
  - Phone status bar: "Running · 1 peers · height 8 · 100%", while the canonical
    cluster (seed, bot, local — 3 independent nodes) is stable at height 6.
  - The phone's *only* peer `1ec64e5…` resolves to **`10.0.0.15:19735`** — a node
    on the local wifi LAN, discovered via **mDNS**. It announces
    `height=3 hash=f40babe1 pow=30`, `spaces=2`.
  - Canonical chain cumulative pow is ~4104–4105 at height 5–6; the LAN node's
    chain is `pow=30` at height 3. **These are two different genesis chains**, not
    two forks of one chain.
  - Phone log: `[DHT-DISCOVERY] No nodes in DHT routing table to query`. The phone
    never dials the public DNS seed (`167.71.241.252`) — it only has the mDNS LAN
    peer, and it adopts that peer's (lighter) chain.
  - On app restart the phone's height went **8 → 3** (followed the LAN peer's tip
    `f40babe1`), i.e. its previous chain state did not survive restart / was
    replaced by the LAN peer's chain.
- **Root cause (hypothesis):** discovery prefers/settles on a single mDNS LAN peer
  and does not also establish DNS-seeded connections to the public canonical
  network, so a stale LAN node at `10.0.0.15` (separate genesis, pow=30) captures
  the phone. Chain selection can't help because the phone never *sees* the heavier
  canonical chain.
- **Why it matters:** A user on the same wifi as any stale/old swimchain node gets
  silently captured onto that node's chain and shown "100% synced," never joining
  the real network. Posts won't propagate; network content won't appear.
- **Repro:** with a stale/old testnet node running on the LAN (here `10.0.0.15`,
  a separate genesis), launch the phone app on the same wifi. Observe: single mDNS
  peer, DHT empty, height tracks the LAN node not the public seed, status "100%".
- **Open items:** identify the `10.0.0.15` node (operator's other machine / leftover
  test node); decide whether mDNS peers should supplement rather than replace
  DNS-seed dialing; whether "100% synced" should be suppressed when only an mDNS
  peer on a minority-pow chain is present.
- **Note:** per operator, "something is going on there" — documented; not fixing
  live. Phone excluded from cross-surface propagation runs until it can reach
  canonical; mobile UI still audited for visuals + local functional flows.

### F1b — Mobile node bootstrap uses mDNS/PeerStore only; never dials the DNS seed or DHT · major (fix later)
- **Surface:** S4. Confirmed after a full `pm clear` wipe (fresh identity, empty
  PeerStore, height 0).
- **Observed:** the fresh phone's discovery loop *only* logs
  `[GETADDR-DISCOVERY] Trying to connect to stored peer 10.0.0.202:19745`
  (a LAN peer learned via mDNS) and `[DHT-DISCOVERY] No nodes in DHT routing table
  to query`. It **never** attempts the public DNS seed `167.71.241.252`. With no
  reachable canonical LAN node it stays at **0 peers / height 0** indefinitely.
- **Consequence:** a fresh mobile install on a LAN with no reachable swimchain
  node never joins the network at all; on a LAN with a *stale* node it joins that
  node's chain (F1). The public seed is never used as a fallback.
- **Two sub-issues:** (1) no DNS-seed dial / DHT bootstrap on mobile; (2) mDNS
  advertises the local dev node by LAN IP (`10.0.0.202:19745`) even though that
  node is bound to loopback, so the advertised address is unreachable — the phone
  burns its only lead on a dead address.
- **Fix later:** mobile discovery should always also bootstrap from the DNS seed /
  hardcoded testnet seeds, not rely on mDNS. mDNS should advertise only reachable
  bind addresses.
- **Repro:** `adb shell pm clear com.swimchain.mobile`; relaunch on a LAN with no
  reachable canonical node; observe 0 peers / height 0 and no seed dial in logcat.

## F2 — Fresh node shows spaces with unresolved names (name: null) · major (to confirm)
- **Surface:** S1 (local `list_spaces`).
- **Observed:** local `list_spaces` returned a space with `post_count: 2` but
  `name: null, name_unresolved: true`, while the seed resolves space names
  (`pump-1`…). Matches the known "skeleton syncs but content bodies / space names
  don't" pattern.
- **Status:** to be rigorously verified in scenario C1 (cross-node name
  resolution).

## F3 — swim-auto `/rpc-config` mangles a Windows backslash data-dir · minor (harness)
- **Surface:** tooling (swim-auto on Windows).
- **Observed:** `SWIM_AUTO_NODE_DATADIR=C:\github\swimchain\qa-user-testnet` →
  `/rpc-config` tried to open `...\githubswimchainqa-user-testnet\.cookie` (drive
  colon + backslashes stripped), so the node-identity handoff failed and the
  framed client fell back to browser mode ("Create Identity", empty feed).
  Forward-slash path works.
- **Fix:** normalize/resolve the data-dir path in swim-auto (accept backslashes on
  Windows). Not a product bug, but blocks node-mode QA on Windows by default.
