# Vision Parity Audit — VISION.md claims vs. `src/` reality

**Date:** 2026-07-11
**Method:** 3 parallel code audits of the Rust node source, treating `src/` as ground truth. Every VISION.md mechanical claim graded with file:line evidence, including whether the code is *wired into live node paths* (`node/manager.rs`, `node/tasks.rs`, `rpc/`, router) versus merely existing as a tested module.
**Companion doc:** `STATE_OF_SWIMCHAIN.md` covers frontend/client parity; this doc covers protocol/vision parity.
**Verdicts:** ✅ IMPLEMENTED · 🟡 PARTIAL (real but incomplete/unwired/disabled) · 💥 DIVERGES (code contradicts the vision) · ❌ NOT IMPLEMENTED

## Executive summary

Of 23 mechanical claims in VISION.md: **10 implemented, 11 partial, 2 direct contradictions.** The dominant failure mode is not fiction — it's **"implemented-but-unwired"**: subsystems fully built with passing tests that no live node path ever instantiates. VISION.md (and anything written from it) reads these as shipped.

**The implemented-but-unwired list (the big finding):**

| Subsystem | State | Evidence |
|---|---|---|
| Achievements (SPEC_09) | 12 badges + storage + service + tracker exist; **never awarded live** | `AchievementService::new` only in tests (`achievement/service.rs:195`) |
| Poster reputation (SPEC_12 §3.4/4.5) | decay/recovery logic complete; **never constructed in node/rpc/cli** | `AntiAbuseManager`/`ReputationStore` only in `api/anti_abuse.rs:669` (test) |
| Sponsorship penalty propagation | `on_misbehavior`/`propagate_consequences` exist; **only called from unit tests** | `sponsorship/mod.rs:530-593` |
| mDNS discovery | module real; only reachable via `DiscoveryManager`, **which the node never instantiates** | `discovery/mdns.rs` |
| Size-based binary fracturing | 50MB threshold + hash-split correct; **production write path bypasses it** | live writes use `store.put_content_block()` directly (`rpc/methods.rs:886`), not `BranchAwareStore` |
| Parent-anchored threading | inheritance logic exists; **every live call passes `BranchPath::root()`**; `from_thread_root` is a stub | `blocks/branch_path.rs:53-61`, `rpc/methods.rs:1827,2543,3273` |
| 60s engagement pool (local enforcement) | pool logic + gossip wiring real; **RPC `submit_engagement` resets decay on a single engagement, no pool required**; RPC pool methods deprecated stubs | `rpc/methods.rs:3207-3221, 7739-7742` |
| Behavioral branching consensus (SPEC_13 §7) | detection wired into block processing with exact thresholds; **off by default outside regtest, no cross-node consensus messages** | `node/config.rs:428`, `branch/behavioral.rs:27-32` |

**Direct contradictions:**
1. **Video tier.** VISION.md: video allowed at 60s/480p/5MB/10× PoW with 7-day decay. Code: **video prohibited at protocol level** (`content/content_format.rs:1-5,146,209-245`); no content-type PoW multipliers exist at all (PoW is per-action only); text is capped at 10KB, not "unlimited."
2. **Progressive trust sync.** Vision: "trust headers/peers day 1, verify eventually." Code: headers are verified up front (`sync/header_sync.rs verify_header_chain`); no trust-then-verify/checkpoint mechanism exists. (The *spirit* — header-first + on-demand content — is real.)

**Where the vision is accurate (and the constants match to the digit):**
- Adaptive decay: 7d default, 1d/30d clamp, 500MB target, 6.25% prune threshold, hourly adaptation task (`types/constants.rs:50-64`, `content/decay_integration.rs:457`, `node/tasks.rs:565`)
- Argon2id PoW on every action, difficulty ordered space(22) > post(20) > reply(18) > engage(16) (`crypto/action_pow.rs:91-106`), verified in every RPC write path
- Recursive block hierarchy with PoW summing upward (`blocks/content_block.rs:138`, `space_block.rs:117`, `root_block.rs:21`)
- Hybrid chain/blob split: authoritative records vs. content-addressed chunked blobs, record survives blob loss (`content/addressing.rs`, `content/chunking.rs`)
- No tokens, rewards, coinbase, or balances anywhere
- Network PoW scaling exactly 1.0/0.1/0.001 (`network/mode.rs:196-202`)
- View-to-host with explicit no-RELAY capability note (`node/router/router.rs:1000-1014`, `types/network.rs:78-87`) — the strongest-supported claim
- Swimmer-level protocol privileges fully removed (level messages ignored `router.rs:412-422`; flat rate limits; capacity constants dead)
- CSAM hash blocklist enforced on the receive/store path with peer gossip (`blocklist/`, `router.rs:1176-1188`) — though the NCMEC/IWF feed pipeline is aspirational; it's a peer-gossiped list

## Full verdict table

### Content & storage

| Claim | Verdict | Evidence | Note |
|---|---|---|---|
| Adaptive decay (7d default, 1d–30d, 500MB target, 4h spam) | ✅ | `constants.rs:50-64,576`; `decay.rs:108`; wired `tasks.rs:565` | Caveat: 4h spam half-life affects *displayed* decay state only; the prune loop uses the normal half-life (`decay_integration.rs:375,520`) |
| Prune below 6.25% survival | ✅ | `constants.rs:53`; `pruning.rs:45`; wired `tasks.rs:545` (60s tick) | Exact |
| Content tiers (text unlimited; image 500KB/2×; video 60s/5MB/10×) | 💥 | `content_format.rs:16,19,146,209-245` | Image 500KB ✓; video **banned**; no PoW multipliers; text capped 10KB |
| External URLs are plain text | ✅ | `content_format.rs:38,339-342` | No embed/preview code exists |
| Bounded storage + space-scoped sync + ~20MB global index | 🟡 | `constants.rs:58,540`; `sync/subscription.rs`; `tasks.rs:400-434` | 500MB target + branch-selective sync real; **global index doesn't exist**; branch budget default 400MB |
| Binary fracturing at 50MB by content hash | 🟡 | `branch/mod.rs:67`; `manager.rs:275,649` | Logic correct; **dead in production** (write path bypasses size tracking) |
| Behavioral branching (SPEC_13) | 🟡 | `behavioral.rs:62-75,441`; wired `router.rs:2405,4199-4240` | Thresholds exact and in the live block path; **disabled by default outside regtest; §7 consensus deferred (local-only)** |

### PoW, engagement, blocks

| Claim | Verdict | Evidence | Note |
|---|---|---|---|
| Argon2id PoW on all actions, action-scaled | ✅ | `action_pow.rs:39,91-106,364`; RPC verifies at `methods.rs:1674,2330,3144,2933,5164` | Ordering matches vision |
| 60s pooled engagement, Sybil-neutral, resets decay | 🟡💥 | pool: `content/pool.rs`, `constants.rs:211`; gossip wired `router.rs:4888-5061` | **Local RPC path resets decay per single engagement without a pool** (`methods.rs:3207-3221`); RPC pool methods deprecated stubs; live PoolManager in-memory only |
| Recursive blocks, PoW sums up, ~30s cadence | ✅ (cadence 💥) | sums: `content_block.rs:138` etc.; `root_block.rs:32` | "30" is a PoW-seconds threshold, not wall clock; `leader.rs:16` says 600s target — two contradictory cadence constants; formation check every 300s |
| Parent-anchored threading | 🟡 | `branch_path.rs:53-120` | Dead in live path — everything passes `BranchPath::root()` |
| Hybrid chain/blob architecture | ✅ | `addressing.rs:38-60`; `chunking.rs`; `retrieval.rs`; WHO_HAS/GET | Matches vision; record survives blob loss |
| No rewards/tokens | ✅ | no coinbase/balance/mint anywhere | Achievements explicitly non-transferable |
| Network PoW scaling 100/10/0.1% | ✅ | `mode.rs:196-202,234,270-282` | Exact |

### Network, identity, safety

| Claim | Verdict | Evidence | Note |
|---|---|---|---|
| Six-layer discovery | 🟡 | cached `manager.rs:1115`; seeds `:1125-1191`; DHT `tasks.rs:2474`; PXP `tasks.rs:1094-1258` | 4 of 6 wired. **mDNS unwired** (DiscoveryManager never instantiated); social bootstrap is external, not a node path. Vision *undersells* DHT (mod.rs comment says "future" but it's live) |
| View-to-host, no prefetch, no RELAY | ✅ | `router.rs:1000-1014`; `seeding/config.rs:21`; `network.rs:78-87` | Strongest claim in the doc |
| Ed25519/Bech32m identity + sponsorship trees + penalties | 🟡 | `identity/mod.rs:208`; `address.rs:9-45`; sponsorship wired `manager.rs:580-711` | Identity + trees real and wired; **penalty propagation only called from tests** |
| Spam attestation + poster reputation | 🟡 | attest/counter wired `router.rs:6668,6755`; accelerated decay wired `decay_integration.rs:251` | Attestation side real; **reputation module never constructed live**; "attestation decay" is a 24h validity window, not gradual weight decay |
| 12 achievements; no status privileges | 🟡 | `achievement/types.rs:61-72`; level msgs no-op `router.rs:412-422` | Privilege removal ✅ complete; **achievements never awarded live** |
| CSAM hash blocklist at protocol level | ✅ | `blocklist/types.rs:36-100`; enforced `router.rs:1176-1188`; gossip `router.rs:6106+` | Mechanism real (refuse-to-store + gossip); NCMEC/IWF feed pipeline aspirational |
| Fork ecosystem incl. fork-away-with-content | 🟡 | creation wired `manager.rs:704-711`, `fork/genesis.rs:100-135`, `fork/registry.rs` | Creation + identity exclusion + param overrides real; **content migration is an estimate only; fork network messages return `SubsystemUnavailable`** — forks can't be discovered/joined over the wire |
| Progressive trust sync | 🟡💥 | `sync/header_sync.rs`; `sync/initial_sync.rs` | Header-first + on-demand content real; literal "trust now verify later" not implemented (headers verified up front) |
| Client discretion (mempool-style policy) | 🟡 | blocklist refusal; seeding filters `seeding/config.rs:88-127` | Narrower than vision: no user-configurable ignore-identity/content-policy layer |

## Impact on public materials

Written from VISION.md before this audit, these now need corrections:

1. **swimchain.io/protocol + /browse/protocol** ("everything described here is implemented and running"):
   - *Pooled engagement defeats Sybils* — overclaims; not enforced on the local engagement path
   - *Communities form themselves* — overclaims; disabled by default outside regtest, no cross-node consensus
   - *Recognition without an economy* — achievements are defined but never awarded live
   - *Forks are the escape hatch* — fork creation is real, but fork discovery/join over the network is unavailable and content doesn't migrate
   - Solid as written: view-to-host, adaptive decay, mining-is-paying, friction, no-tokens
2. **VISION.md** — needs status annotations like the 2026-07-11 Social Layer note, at minimum for: video tier (contradicted), pool enforcement, behavioral branching status, achievements/reputation unwired, fork limitations, 20MB global index, progressive trust.

## Dating changes

Current `main` history starts at the 2026-07-01 squash ("Clean repository restart"). The full pre-restart history lives on the `adminwizard-legacy/main` remote ref — use `git log -S <symbol> adminwizard-legacy/main` to date and explain divergences (e.g. `a2e6934f` "Remove level system - PoW-only gating").

## Suggested reconciliation lanes

Two distinct kinds of work; keep them separate:

- **Doc-truth lanes (cheap):** annotate VISION.md claim-by-claim from this table; correct the protocol pages; fix the "30s block" framing anywhere it appears.
- **Wire-up lanes (engineering, pick deliberately):** each unwired subsystem is a product decision — wire it (achievements, reputation, penalties, pool enforcement, mDNS, size fracture, thread anchoring, fork network messages) or delete it and update specs. The pool-enforcement gap is the most consequential: it undermines the flagship Sybil-neutrality claim.
