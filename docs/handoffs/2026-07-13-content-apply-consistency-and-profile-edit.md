# Handoff: content-plane apply-consistency + profile-edit authorship

**Date:** 2026-07-13
**Author:** prior session (Claude)
**Status:** RESOLVED 2026-07-13 (same-day follow-up session) — see
"Resolution (2026-07-13 evening session)" at the bottom. Original analysis
kept below for the investigation record. All *consensus* fixes
from the prior session are already committed + pushed to `main` (superness/swimchain)
and deployed to the live testnet — see "Session state" at the bottom.

---

## TL;DR

After fixing ~13 consensus/onboarding bugs (double-inclusion → builder desync →
F8 eligibility → mempool re-gossip → timeout-flush → fork-choice pow=0 →
min-PoW onboarding → offer floor → F9 backfill-apply), the remaining problems are
NOT single-line bugs. They live in the **content plane** (content-block bodies +
their side effects), which is decoupled from the **control plane** (block headers
/ tips), and they surface differently depending on whether a node **formed**,
**received**, or **backfilled** a block — amplified by having **3 block-formers**
(seed, genesis, phone) racing. This needs a deliberate redesign, not more
whack-a-mole. Plus a separate, unrelated client bug: profile edits fail authorship.

---

## Issue 1 — Sponsorship (content side-effects) apply inconsistently across nodes

### Symptom (reproduced live, twice, opposite directions)
All nodes converge on the **same canonical chain** (same height, same tip), yet
`get_sponsorship_status(<identity>)` disagrees between nodes:
- Identity `3d823e37…` (mined ~h12): seed=**true**, bot=**true**, phone=**false**.
- Identity `4806eb5a…` (mined ~h13): seed=**false**, bot=**false**, phone=**true**.

Same chain (`h13 tip f73e17ea`, mempool 0 everywhere), different application state.
So the block IS canonical on every node, but the **side effect of processing its
content block** (`apply_sponsorship_actions_from_block`) ran on some nodes and not
others.

### Why it happens (understanding so far)
A block's *header* is adopted via fork-choice/sync in seconds; its *content
blocks* (which carry the Sponsor action and drive `apply_sponsorship_actions_from_block`,
`extract_reactions_from_block`, `extract_engagements_from_block`,
`apply_rename_space_actions_from_block`) arrive/are-processed on a **separate
path**. Whether the side effect runs depends on which path a given node took:

1. **Former** (`src/node/tasks.rs` block-formation loop, ~line 2358 / 2491 — "SPEC_11
   Phase 6: Apply sponsorship actions from locally formed blocks"): applies on the
   node that formed the block.
2. **Full-block receive** (`src/node/router/router.rs` ~2456 hard-reject path, and
   ~3904 sync soft-skip path): applies when a peer receives the full block with
   content, *unless* the duplicate check skips the content block.
3. **Header-first backfill** (`[BACKFILL] Known header … missing claimed
   space/content blocks - storing content from full block`): the header was adopted
   (marking its actions finalized) BEFORE the content arrived; when content
   backfills the dedup used to skip it.

**Fixed this session (F9, commit `e9096c92`):** both duplicate gates in router.rs
(2456 hard-reject, 3904 soft-skip) now only skip when an action is finalized at a
**different** height (a real cross-block re-inclusion). Actions finalized at *this*
block's own height are a backfill of the block's own content → process them so
side effects run. This DID fix the phone (`3d823e37` symptom → phone now applies
`4806eb5a`). But the inverse (`4806eb5a`: seed/bot false) shows the problem is not
fully closed — the apply still isn't deterministic across form/receive/backfill.

### Also observed: a content-backfill LOOP (likely related, maybe the real driver)
On the phone, every ~30s:
```
[SYNC-LOOP] Content backfill: 1 gap heights in 12..12, requesting full blocks
[SYNC-LOOP] Sent GETBLOCKS backfill to peer 10315203…
[BACKFILL] Known header 5f53cc4f… at height 12 is missing claimed space/content blocks - storing content from full block
```
It re-requests the **same** gap (h12) forever — the backfill never marks the gap
"filled," so it loops. Meanwhile the seed only ever logs `Received WHO_HAS … for
<sponsor>` (it relays/serves the content query but there's no `Registered
sponsored` — it never applies). Strong hypothesis: **a block can be canonical with
its content-block bodies missing/unstored, and there's no reliable "content
complete → run side effects" step.** The apply is a one-shot inside the receive/
backfill path; if that path skipped or the content wasn't stored, the side effect
is lost and never retried, even though the header is canonical forever.

### Where to look
- `src/node/router/router.rs`: the two duplicate-check gates (~2456, ~3904); the
  content-block processing loops around them; `[BACKFILL] Known header` handling
  (~3190, the `known_header_backfill` / `content_missing` logic); the WHO_HAS /
  I_HAVE / GET content-sync handlers.
- `src/node/tasks.rs`: block-formation apply (~2358/2491); `[SYNC-LOOP] Content
  backfill` gap detection (search `Content backfill`) — why does the gap never
  clear?
- `apply_sponsorship_actions_from_block` (router.rs ~4718) — it's idempotent
  (checks `ss.exists`), so re-running is safe; the problem is it not running.
- `check_content_block_for_duplicates` / `mark_content_block_actions_finalized`
  (`src/storage/chain.rs` ~3037/3054) — note headers get actions marked finalized
  *before* content is stored, which is what confuses the dedup.

### Recommended approach (redesign, not a patch)
Define ONE deterministic model: "a canonical block's content-block side effects
run exactly once, on every node, once the content bodies are present — regardless
of form vs receive vs backfill order." Concretely, consider:
- Separate **"content stored"** from **"side effects applied"** with an explicit,
  idempotent **reconciliation pass**: when content for a canonical block becomes
  complete (backfill finishes), run `apply_*_from_block` for it (idempotent), and
  mark the block's side-effects-applied flag. Drive it from a single place, not
  three copy-pasted loops.
- Fix the backfill "gap never clears" loop: storing content from the full block
  must actually satisfy the gap check so it stops re-requesting.
- Reduce formers during bring-up (3 formers racing amplifies every ordering bug);
  a `--no-mine` / observer flag would help testing. (There is none today.)

### Concrete repro
1. Have ≥2 nodes converged on a testnet. Onboard a fresh identity from a genesis
   holder: `sw --testnet sponsor direct <cs1…>` (now grinds PoW → pow≥1 block).
2. Poll `get_sponsorship_status(<pubkey>)` on every node. Expect: all `true` within
   ~60s. Bug: some nodes stay `false` on the same chain height/tip.
3. A node that was offline and catches up (backfill) is the most reliable
   reproducer — its `[SYNC-LOOP] Content backfill` will loop on the sponsor's block.

---

## Issue 2 — Profile edit fails "authorship verification failed" (client bug, not consensus)

### Symptom
Editing the profile in the mobile app (and reproducible from the feed-client)
returns RPC error: `Invalid signature: action authorship verification failed`.

### Diagnosis (starting point)
- Profile edit → `submit_edit` (`src/rpc/methods.rs` ~3608) builds an
  `ActionType::Edit` and calls `validate_content_action_authenticity`
  (`src/blocks/validation.rs` ~448), which for Post/Reply/Edit calls
  `validate_action_signature`.
- Server preimage (validation.rs ~360): **v2** `content_hash(32) || timestamp_LE(8)
  || private(1)` (41 bytes), or legacy **v1** `content_hash(32) || timestamp_LE(8)`
  (40 bytes, accepted only when `private == false`).
- Client signer exists and looks correct: `swimchain-react/src/lib/signAction.ts`
  documents the same v2/v1 scheme; `feed-client/src/lib/rpc.ts` has `submit_edit`
  (~739).
- So the failure is almost certainly a **content_hash mismatch** for the edit
  (client computes the edited-content hash differently than the node's
  `new_content_hash`), OR a **node-mode identity** mismatch (mobile uses the node
  identity — the action's `actor`/signature may be signed with the wrong key or the
  node vs browser identity split; see memory `project_node_mode_identity`).

### Where to look
- `feed-client` profile save path (ProfilePage / IdentityPage → the edit call in
  `feed-client/src/lib/rpc.ts` `submit_edit`, and how it derives the content_hash
  and which key signs).
- `src/rpc/methods.rs` `submit_edit` `new_content_hash` derivation vs the client's.
- `swimchain-react/src/lib/signAction.ts` content_hash helpers (POST = sha256(title
  + "\n\n" + body); REPLY = sha256(body)) — what's the EDIT/profile content_hash?

### Concrete repro
Open the mobile app (or feed-client in node-mode), edit the display name/profile,
save → observe the RPC error. Then compare the signed preimage the client produced
against `validate_action_signature`'s expectation for that exact content.

---

## Session state (as handed off)

- **Live testnet:** fresh TES4 chain, converged at ~h13. Nodes: **seed**
  167.71.241.252 (`--seed-node`, forms blocks), **bot** 165.22.47.107 (faucet +
  swim-bot; does not form), **genesis bootstrap** local Windows
  (`SWIMCHAIN_DATA_DIR=genesis-testnet SWIMCHAIN_PASSWORD=testpass123 sw --testnet
  node start --connect 165.22.47.107:19735 --connect 167.71.241.252:19735`, forms
  blocks + holds genesis 9ec9661d…), **phone** 46281FDJG001JN (mobile-app in-process
  node, forms blocks). All on the latest binary incl. F9.
- **Topology gotcha:** the seed runs as `--seed-node` (drops peers after 30s idle),
  which flaps mempool gossip; a bootstrap node connected only to it has no stable
  path — connect to the bot too. See memory `project_consensus_double_inclusion_fix`.
- **All fixes committed + pushed** on `main`: `5164082e`, `e867351c`, `9d331993`,
  `dfd412dc`, `45f8b492`, `58ab10bd`, `04dadd74`, `6f10f199`, `455f6daa`,
  `e9096c92`. Details + verification notes in memory
  `project_consensus_double_inclusion_fix`.
- **Faucet** `activity-bot.mjs` on the bot updated in place to `min_pow 8` (backup
  at `activity-bot.mjs.bak`); the change is NOT in the repo — port it to the repo
  copy if one exists.
- **Build recipes:** node — `cargo build --release --bin sw` (Windows) and
  `CARGO_TARGET_DIR=target-linux cargo build --release --bin sw` in WSL (Linux, for
  droplets). Phone — `cargo ndk -t arm64-v8a build --release --lib` in
  `mobile-app/src-tauri` → cp `.so` to `gen/android/app/src/main/jniLibs/arm64-v8a/`
  → `gradlew assembleArm64Release -x rustBuildArm64Release` → zipalign + apksigner
  (keystore `~/swimchain-release.keystore`, alias `swimchain`, pass `swimchain-alpha`)
  → `adb install -r`. adb at `~/AppData/Local/Android/Sdk/platform-tools/adb.exe`.

---

# Resolution (2026-07-13 evening session)

## Issue 1 — root causes found (six converging holes) and redesigned

The non-determinism was exactly the predicted class: one-shot applies embedded
in transport paths. Full inventory of the holes found:

1. **Five ingest paths, five different side-effect subsets.**
   `process_orphan_block_data` (router.rs) stored content + marked actions
   finalized but applied NOTHING — any block arriving out of order (3 formers
   racing guarantees this) lost all side effects on that node forever. This
   alone explains `4806eb5a` (phone=former=true, seed/bot=orphan-path=false).
   The router-side former (`try_form_block_if_threshold_met`) also applied
   nothing; the tasks.rs former had its own inline sponsorship copy (no
   signature/Active validation, no finalize-marking); `handle_block_data`
   applied sponsorship BEFORE the dup gate and storage; `handle_blocks`
   applied after.
2. **Deep reorgs poisoned the dup gates** — `make_canonical` (chain.rs)
   rewrote the height index without unmarking displaced blocks' finalized
   actions. The same actions in the new canonical chain then read "finalized
   at a different height" and both dup gates skipped the canonical content
   FOREVER: content never stored → `find_content_gap_heights` reports the gap
   → 30s backfill loop (the phone's h12 loop). F9 only handled same-height.
3. `handle_block_data`'s "already have block" early-return lacked the F9
   content-missing fall-through — the gossip path dropped a header-first
   block's content permanently.
4. The GETBLOCKS server silently omits claimed space/content blocks it
   doesn't hold, and the sync-loop backfill only ever asked `peer_ids.first()`
   — one content-less peer wedged the loop permanently.
5. Sponsorship apply is order-dependent (sponsor must already be Active) but
   was one-shot — child-before-parent application dropped the action with no
   retry.
6. Reply-count/engagement/clustering effects ran on some paths and not others
   (cosmetic but same class).

### The redesign (implemented)

**One deterministic apply point:** `MessageRouter::reconcile_block_side_effects(root)`
(router.rs) — the ONLY place content-plane side effects run. Invariant: a
canonical block's side effects run exactly once per node, once its claimed
content bodies are all present, regardless of ingest path. Two-stage state in
a new `applied_side_effects` ChainStore tree (`side_effects_state`): stage 1 =
content effects (space registration, renames, reactions, engagements,
clustering — run exactly once; some are increments), stage 2 = sponsorship
(idempotent, retried until the sponsor chain lands; transient skips hold the
block at stage 1). It also re-marks the block's actions finalized at the
canonical height, healing stale cross-height marks.

**Call sites:** every ingest path calls it after storing (handle_block_data,
handle_blocks per block, process_orphan_block_data, both formers — the
tasks.rs former's inline sponsorship copy is deleted), and the 30s sync loop
runs a **reconciliation pass** (`find_unapplied_heights` → reconcile, height
order) that retries anything left behind. The retry pass is what makes the
outcome deterministic across nodes.

**Supporting fixes:**
- `make_canonical` now unmarks displaced blocks' finalized actions
  (height-guarded via `unmark_actions_for_root`) and clears their applied flag.
- Both dup gates now detect STALE marks: on a different-height hit they check
  `canonical_block_contains_action(h', action)` — provably-absent marks no
  longer block the canonical content (heals already-poisoned testnet nodes).
- `handle_block_data` Check-1 got the F9 content-missing fall-through
  (gossip-path parity with handle_blocks).
- Sync-loop content backfill now asks up to 3 peers, not just the first; the
  GETBLOCKS server logs when it omits blocks it doesn't hold.
- Reply counts stay on the receive path only (submit_reply already counts at
  RPC time on the origin — putting them in reconcile would double-count).

**Tests:** `tests/side_effects_reconcile.rs` (6 storage-level tests: state
tracking, completeness, unapplied scan, reorg unmark + height guard, stale
mark detection) and 3 router-level tests in `src/node/router/tests.rs`
(reconcile applies-once/idempotent, transient sponsor retry, non-canonical
skip). The `build_create_space_blocks_payload` test helper now builds a root
that CLAIMS its space block (reconcile only applies claimed content — content
a root doesn't claim is not part of the block).

## Issue 2 — profile-edit authorship: root cause found

`submit_edit` hashed `Some("") != None` for the title: the node computed
`sha256("\n\n" + body)` for an EMPTY title while every client computes the
signing preimage with JS truthiness (`title ? title\n\nbody : body` →
body-only hash). Every empty-title edit (feed posts, profile posts) therefore
failed `validate_action_signature` with "action authorship verification
failed". Fixed server-side: empty title now hashes like an absent one
(matching all clients; no working flow signed the old way, so nothing breaks).

Note: the feed-client Profile page actually saves via `submit_post` (a new
profile post each time, newest wins) — that path verified consistent
end-to-end in current source (preimage, keys, node-mode sign_message all
match). If a profile save still fails on the phone, the installed APK likely
carries an older feed bundle — rebuild it. The three authorship-failure sites
(`submit_post`/`submit_reply`/`submit_edit`) now WARN-log the exact preimage
components (actor, content_hash, ts, private/title_empty) so any remaining
client divergence is diagnosable from the node log alone.

## Deployed + verified live (2026-07-13 night)

- Fleet upgraded: seed (167.71.241.252), bot (165.22.47.107), **new third
  droplet swimchain-client2 (167.172.236.60** — remote client node, own
  identity, sponsored), local genesis (Windows), phone (release APK, 18MB,
  signed + installed). All formed/synced on the F10 binary.
- **Second live fix (1b47c0fc):** the onboarding repro initially stalled 0/3
  because `apply_sponsorship_actions_from_block` required the SPONSOR to be
  Active in the store — the genesis identity has no store record (it's only
  in the hardcoded genesis list). Same bootstrap deadlock CreateSpace already
  handled; added the genesis-list fallback + regression test.
- **Repro PASSED:** genesis offer `2d57cd66…` → fresh identities on seed+bot
  claimed → genesis approved → `has_sponsorship:true` on ALL nodes (the exact
  check that used to split true/false). client2's direct sponsorship
  converged fleet-wide in one 30s reconcile tick. Seed's first reconcile pass
  healed 7/13 old-chain blocks.
- **Claims gap — FIXED same night (3b9c7ef0):** the true cause wasn't missing
  re-broadcast (a claimant-side re-broadcast task existed since F7) — claims
  were never RELAYED, so they only ever reached the claimant's DIRECT peers;
  a sponsor two hops away (genesis vs client2) saw 0 pending forever.
  `handle_sponsorship_claim` now relays a first-seen valid claim to other
  peers (storage is the dedup, floods terminate); 3-node line-topology
  integration test added. Deployed fleet-wide and verified live: a fresh
  claim from client2 appeared in genesis's pending list within ~5s via the
  seed/bot hop, was approved, and the sponsorship converged on all nodes.
- Demos re-onboarded on the fresh chain: Daily Drift space
  `sp1qqqsqpc0ulf4gsjf620m5lke5h3qu3x0pr` (live, 1 dispatch; generate.js's
  hardcoded AUTHOR was a dead bot address — now genesis), Reef
  `sp1qqqsqr9dfcyugxztn5nrpjd7r82sh9cd62` (genesis garden
  `sha256:362a7acd…`), Chess `sp1qqqsqrsm2rq9fhtvwww9cts9n6wq536c23`;
  reef/chess clients rebuilt + redeployed; chess-rpc-proxy restarted (node
  restarts rotate the RPC cookie).

## Caveats / follow-ups

- Historical blocks (pre-upgrade) have no applied flag; the reconciliation
  pass will re-run stage-1 effects once for complete blocks after upgrade —
  engagement-graph counts can double once for those (~13 blocks on fresh
  TES4). Acceptable; re-seed if it matters.
- Blocks whose content never completes network-wide stay in both the gap scan
  and the unapplied scan (bounded, 64 each) — that's honest, not a loop bug.
- A `--no-mine` observer flag (handoff recommendation) is still unbuilt.
