# Mainnet Launch Readiness — Go/No-Go

Status: **NO-GO for immediate launch** — 2026-07-16 (progress tracked inline).

**Progress since first assessment:**
- ✅ **B5 CLOSED** — `sign_message` signing oracle gated (now requires auth);
  the public RPC allowlist proxy brought into the repo and audited
  (`web-gateway/rpc-proxy/`). It was already a real allowlist (method +
  source-IP + POST-only, no admin methods).
- ✅ **R1 ADDRESSED** — `docs/LEGAL_POSTURE.md` (two-layer no-owner posture);
  blocklist now auto-loads an operator seed file at startup AND gates the
  serve paths (P2P `handle_get`, `get_media`, `get_content` RPC), so an
  operator blocklisting a hash stops their node serving it immediately — real
  takedown capability at the swimchain.io gateway without touching the network.
- Remaining blockers: **B1, B2, B3** (genesis identity/seeds/anchor — the
  bootstrap foundation), **B4** (fork-race durability — the protocol long
  pole), **B6** (faucet claim cost), **B7** (clients mainnet flip).

Assessment of the Swimchain node + clients for switching from testnet to a live
public mainnet. Two independent read-only audits (consensus/networking,
security/abuse) plus operational review. Findings are evidence-backed with
file:line; verify before acting on any single line — code moves.

**Verdict: NO-GO.** There is no single fatal flaw, but a cluster of hard
blockers (unsafe genesis key, empty seed list, unfixed action durability,
undefined public RPC surface) each of which would produce either an immediate
failure or a reproducible loss of user content/funds-equivalent under real load.
The path to GO is concrete and mostly mechanical except for one protocol item
(guaranteed re-inclusion). Estimate: the operational blockers are days; the
consensus durability fix is the long pole.

---

## BLOCKERS (must fix before any mainnet)

### B1 — Genesis identity is a publicly-known key
`src/sponsorship/genesis_list.rs:65-77` bakes the **testnet** genesis identity
(`9ec9661d…`) into the hardcoded genesis sponsor list. Its password
(`testpass123`) is in a **code comment** and its recovery seed is in committed
files (`GENESIS_IDENTITY.md`, a skill file). On mainnet this key is the
sponsorship root — anyone with the repo can sponsor/penalize at will and mint
the initial trust graph. **Fix:** generate a fresh mainnet genesis identity
offline, store the seed in a real secrets manager, put ONLY its public key in
the list, and remove the testnet entry from mainnet builds. Never commit its
secret.

### B2 — No mainnet seed nodes
`src/discovery/seed_list.rs:113` `default_mainnet_seeds()` returns `Vec::new()`
("TODO: Add real mainnet seeds before launch"). With no seeds, a fresh node has
no bootstrap peer and the network cannot form. **Fix:** stand up ≥2–3
independent mainnet seed nodes and hardcode them (IP + DNS seed), on the SWIM
port (9735), before launch.

### B3 — No canonical mainnet genesis block anchor
`RootBlock::genesis()` exists (`src/blocks/root_block.rs:124-138`) but node/chain
init never persists a height-0 block. Multiple nodes each forge a *different*
height-1 block off the zero hash → divergent chains with no shared ancestor,
resolved only by accumulated weight (`src/storage/chain.rs:2155-2160`). Bootstrap
correctness depends on operational sequencing (one seed forms height 1 first),
fragile for a "no servers" launch. **Fix:** ship a hardcoded canonical mainnet
genesis block (or genesis hash) all nodes anchor to.

### B4 — Fork-race action durability is unsolved
The testnet reef-wipe root cause is intact on the code path mainnet will run.
`pow_work` is a per-difficulty constant, so competing same-height blocks tie
*exactly* on work; the tie breaks by **content-blind lowest hash**
(`router.rs` `hash_wins`), which can orphan a legitimately-mined, signed action.
The only mitigation shipped is best-effort re-gossip at **normal** mempool
priority (`requeue_and_regossip_orphans`) — NOT the guaranteed next-block
re-inclusion the protocol's own reliability principle demands
(`docs/CONSENSUS_ACTION_LOSS.md:68-70, 251-258`). On mainnet's 10-minute cadence,
"orphan limbo" stretches to minutes–hours of a user watching their post vanish
and reappear out of order. Counterintuitively, 100% mainnet PoW does **not** fix
this: more identities → more simultaneously eligible forgers per round → races
as frequent as (or worse than) testnet. **Fix (protocol, the long pole):**
content-aware tie handling (never let a tie drop the loser's unique actions)
and/or true guaranteed re-inclusion (merge-at-N+1 top-priority sweep).

### B5 — Public RPC surface is undefined-in-repo and fronts unauthenticated writes
The public `swimchain.io/rpc` allowlist is an **unversioned** node service on the
droplet (`/opt/chess-rpc-proxy`, port 3400) — not in the repo, not auditable
from source. Meanwhile the node auth-exempts state-changing methods
(`src/rpc/server.rs:461-495` `AUTH_EXEMPT_METHODS`), including
`claim_sponsorship_offer` (see B6) and **`sign_message`** — a signing oracle
whose "exempt for localhost" comment (`server.rs:458`) is NOT enforced: `dispatch`
receives no client IP (`methods.rs:1060`), and CORS is `*` (`server.rs:792`). A
malicious web page in a user's browser can reach their localhost node and coax
its identity into signing attacker-chosen bytes. **Fix:** bring the proxy
allowlist into the repo and audit it; hard-gate `sign_message` to authenticated
localhost (or drop it from the exempt list); scope CORS to known client origins.

### B6 — Onboarding faucet is sybil-drainable
Auto-approve claim PoW defaults to `min_pow_difficulty = 0`
(`src/sponsorship/auto_approve.rs:229`; faucet uses difficulty 1 = trivial). Each
claim is a throwaway keypair with trivial identity PoW, and claims are
RPC-auth-exempt through the public proxy. One actor mints unlimited identities
and drains all 10 slots (`MAX_OFFER_SPONSEES`) of any offer instantly; the atomic
cap is the only limit. **Fix:** meaningful per-claim PoW cost and/or per-actor
rate limiting before opening onboarding to the public.

### B7 — Clients hardwired to testnet
reef/chess/feed/forum/chat/wiki + mobile all carry testnet ports, config, and
space ids. A mainnet launch needs a config flip (endpoints, magic, ports 9735/6)
and a rebuild + redeploy of every web client and the APK, plus fresh mainnet
game spaces founded by a mainnet operational identity. **Fix:** parameterize and
rebuild all clients for mainnet; re-found reef/chess spaces on mainnet.

---

## RISKS (fix before, or accept with a documented plan)

- **R1 — No global content takedown (architectural, not a defect).** This is
  inherent to any serverless P2P network (Nostr, BitTorrent, IPFS): no node can
  purge content network-wide; each only refuses to store/serve locally. The
  blocklist works for exactly that — rejects on store+retrieve
  (`src/blocklist/mod.rs:24`), and an operator running seed/gateway nodes can
  pre-seed known-illegal hash lists (`blocklist/import.rs`) so THOSE nodes won't
  relay them. Automatic flagging needs 3 independent sponsor trees
  (`blocklist/types.rs:20`), impractical on a small net, so practical moderation
  = per-node local refusal + operator hash-list seeding.
  **Whose concern:** this is the *infrastructure operator's* consideration (the
  person/entity running the public seed + gateway), not a contributor's or the
  protocol's — the same way running a public relay is. Not an engineering
  blocker; a "who runs the public nodes, and do they pre-seed a blocklist"
  operational decision. Right-sized to the actual deployment: an invite-only
  network among known people needs little here; a wide-open public one warrants
  the operator pre-seeding a CSAM hash list and having a takedown-request path.
- **R2 — No forward secrecy in private spaces.** The wrapping key is derived
  deterministically from the ed25519 identity seed
  (`crypto/private_space.rs:58`); leaking the seed once decrypts all past+future
  private content. `KeyRotation` rotates the space key, not the identity key; no
  AAD binding on GCM frames. Acceptable ONLY if the product never advertises
  forward secrecy — that claim must not be made.
- **R3 — Tip-level fork resolution uses the untrusted stored `cumulative_pow`
  field** (`router.rs:2076-2117`), not the walk-parents `chain_weight` that
  `chain.rs` uses below the tip — an inconsistency between the two fork-choice
  paths. No data-loss path, but it should be unified.
- **R4 — Difficulty controller has no node-count awareness**
  (`src/blocks/leader.rs:186-213`); it reacts to cadence after the fact and
  cannot prevent the many-eligible-forgers burst. Compounds B4.

---

## READY (audited launch-safe)

- **Network isolation** — mainnet magic `SWIM` distinct from testnet/regtest,
  frames rejected cross-net (`src/network/mode.rs:150-156`). No poisoning path.
- **Reorg data safety** — non-destructive rollback (blocks never deleted), deep-
  fork guard against below-tip cascades, two-phase apply
  (`src/storage/chain.rs:2138-2218`).
- **PoW enforcement on the RPC path** — real Argon2id, production params,
  mainnet 100% (`crypto/action_pow.rs`, `methods.rs:329-341`). Content can't be
  submitted without valid PoW; gossip path backstopped by signature authenticity
  + cumulative block difficulty.
- **Authorship** — every action ingest validates signature authenticity
  (`router.rs:2473, 5724`), closing "post as you."
- **Game integrity model** — replicated-client referee is data-pollution, not
  consensus corruption, and self-limiting via PoW cost × 7-day decay. Acceptable.
- **RPC default bind** — localhost-only; refuses public bind without TLS
  (`server.rs:188`). Cookie/signature auth with constant-time compare.

---

## Path to GO (suggested order)

1. **B1, B2, B3** (genesis key, seeds, genesis anchor) — mechanical, do first;
   nothing else matters without a safe bootstrap.
2. **B5, B6** (public RPC allowlist in-repo + audited, `sign_message` gated,
   faucet cost) — the exposed-surface fixes.
3. **B7** (client mainnet flip + rebuilds) — parallelizable with 1–2.
4. **B4** (guaranteed re-inclusion / content-aware ties) — the protocol long
   pole; without it, expect reproducible content loss under load. This is the
   one that likely gates a *quality* launch even after everything else is green.
5. **R1** (moderation process + CSAM pre-seed) before the network is *public*.
6. Re-run the full BVT + a multi-node fork-race soak on a mainnet-config staging
   network before flipping DNS.

Nothing here is a dead end. The operational blockers are days of careful work;
B4 is the item to start designing now because it's the one that can't be rushed.
