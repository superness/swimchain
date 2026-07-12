# Frequency Isolation — Design

**Status:** design, pending implementation
**Complements:** SPEC_13 behavioral branching (content-layer isolation). This is the **network/discovery-layer** counterpart.
**Network gating:** testnet + regtest on; mainnet off (mirrors `behavioral_branching`).

## Context

SPEC_13 isolates *content*: an insular interaction cluster graduates into its own branch, but it stays on the same chain and the same peer network. There is no counterpart at the **network layer** — a node that exclusively serves or consumes a single space/namespace (a single operator running "their own server," or a client hard-scoped to one ecosystem, e.g. **The Daily Drift** demo) still shares a discovery pool with every main-chain peer, wasting connection slots on both sides.

**Frequency** is a self-computed, deterministic discovery-layer tag. A node whose realized traffic is overwhelmingly concentrated in one namespace **drifts** onto that namespace's frequency and is thereby optimized out of main-chain peering, **without any change to chain validity** — it still builds valid blocks and its PoW still aggregates. It is automatic, reversible, and (critically) it never moves a broad/partial participant.

Gateway operators and client builders must account for this: a hard-scoped client will drift, so its node will not casually find main-chain peers, and vice-versa.

## Model

### Frequency as a set
A node advertises a **set** of frequencies. `BASE = 0` is the main network.

- Frequency **value** is deterministic: `freq(ns) = truncate( sha256("swimchain:freq:v1" || namespace_key) )`. Any node computes the same value for the same namespace — no consensus, no messages (same property that lets SPEC_13 agree without messaging).
- `namespace_key` is the tightest dominant bucket: a bare **space id** (16 bytes) for a single-space operator like Daily Drift, or the **app segment** for an `@app:` ecosystem (via `parse_app_space_name` / `class_of`, `src/types/space_class.rs`).

### Peer eligibility = set intersection (the "hard partition")
Two nodes are discovery-eligible iff their advertised frequency sets **intersect**.

- Random main node → `{BASE}`. Daily-Drift-only operator → `{freq(space)}` (a **singleton** — this is the hard wall: it shares nothing with `{BASE}` and is partitioned out of main churn).
- A subscriber who *deliberately* wants that space tunes `{BASE, freq(space)}` — shares `freq(space)` with the operator (can reach it) while staying on base for everything else.
- **Bootstrap + reversibility are always local:** a node self-computes its set and can always reset to `{BASE}` (the "moved back" / "erroneously moved" path). No peer can push a node onto a frequency, so there is no eclipse-attack surface.

### Drift trigger (self-computed, "by behavior")
Each node computes its own **namespace concentration** from realized traffic it already tracks:
- served bytes/requests per space — `SeedingStatistics::all_space_stats()` (`src/seeding/statistics.rs`)
- stored content per space — `AggregationCache` (`src/storage/aggregation_cache.rs`) / `BranchMetadata.total_size` (`src/branch/metadata.rs`)

Bucket space ids by namespace, take the max-bucket share. If `share >= EXCLUSIVITY_THRESHOLD` (start `0.90`) over a sustained window **and** activity exceeds `MIN_ACTIVITY` (avoid drifting a barely-used node) → self-drift to `{freq(dominant_ns)}`. If share falls below a lower hysteresis bound → reset to `{BASE}`. Partial/broad participants never cross the threshold — exactly the user's "not so isolated → won't drift anyhow."

Computed frequency is persisted locally (survives restart) and recomputed on a timer.

## Change surface

**1. Frequency core — new `src/network/frequency.rs`**
`Frequency(u32)` (`BASE=0`), `FrequencySet`, `derive_frequency(namespace_key)`, `compute_node_frequency(stats) -> FrequencySet`, thresholds/hysteresis/window constants, local persistence. Pure + unit-tested, mirroring `src/branch/behavioral.rs` structure.

**2. Advertise on the wire (no wire-size change)**
- `WireAddr.services: u32` (`src/network/messages.rs:160`, already gossiped through ADDR and copied in `addr_handler.rs:102`): reserve the high 24 bits for the truncated frequency, low 8 bits for existing/future capability flags. Lets peers filter *before dialing*.
- `VersionPayload.node_services: u64` (`messages.rs:189`): carry the authoritative frequency + a "requested namespaces" intent (how a deliberate subscriber signals `{BASE, freq(X)}` at handshake).

**3. Peer eligibility (hard partition) — filter at the choke points**
- `ConnectionManager::select_peers_to_connect()` `candidates.retain(...)` (`src/node/connection_manager.rs:590`) — primary: never dial a peer whose set doesn't intersect ours (seeds always exempt as bootstrap anchors).
- `AddrHandler::handle_addr` / `handle_getaddr` (`src/discovery/addr_handler.rs:72/38`) **and the router twins** (`src/node/router/router.rs:635/679`) — don't ingest/hand out non-intersecting peers.
- `validate_version` (`src/transport/handshake.rs:189`) — authoritative soft check at handshake, modeled on the magic-byte check (`framing.rs:31`) but frequency-aware (reject non-intersecting unless a matching namespace was explicitly requested).
- Deliberate cross-frequency discovery reuses the **already-present, unused** `GetAddrPayload.fork_id` filter (`messages.rs:250`, `peer_exchange.rs:44`) as a namespace-scoped peer request.

**4. On-chain audit log (hybrid: derive + log) — action `0x10`**
Clone the RenameSpace end-to-end path (the exploration's confirmed template, stays inside the fixed 466-byte action):
- `ActionType::FrequencyDrift = 0x10` + `TryFrom` + `new_frequency_drift` + domain-tagged signing message (`src/blocks/action.rs`); reuse `parent_id` = namespace key, `content_hash` = packed target frequency (`0` = drift-back).
- `validate_action` / `validate_action_pow` arms (`src/blocks/validation.rs`); **self-authored only** (actor signs its own drift — cannot drift another node).
- RPC `submit_frequency_drift` modeled on `rename_space` (`src/rpc/methods.rs:5831`); `apply_frequency_drift_from_block` handler in `router.rs`; `frequency_drifts` sled tree in `ChainStore`. Rate-limited: one record per direction-change, not continuous — it is audit/notify only and the network effect never waits on it.
- Query RPCs: `get_node_frequency`, `list_frequency_drifts` (so gateways/clients can "keep this in mind").

**5. Config + gating — `src/node/config.rs`**
`frequency_isolation_mode() -> {Off, Observe, Full}` mirroring `behavioral_branching_mode()`. **Observe** computes + advertises + logs but does NOT filter peers (safety valve for a live testnet). Default: testnet/regtest `Full` per your call, with `Observe` one flag away; mainnet `Off`.

**6. Docs — `docs/handoffs/` + gateway-operation page**
A "your node may drift" note for gateway operators and client builders.

**7. Tests — `tests/frequency_isolation.rs`**
Set-intersection eligibility, concentration→drift, hysteresis reset, singleton-vs-additive reachability, self-authored-action-only, seeds-always-exempt, Observe-mode does not filter.

## Guardrails / non-goals
- **No chain-validity change.** Frequency touches discovery/selection only; blocks, PoW aggregation, sync correctness are untouched.
- **Seeds are always eligible** (bootstrap can never be partitioned away).
- **A shared/relay node never drifts** — it serves many namespaces, so concentration stays low. (Note: the current testnet seed co-hosts Daily Drift and serves everything, so it will *not* drift — the feature targets a dedicated single-purpose node, which is what a real operator would run.)
- **Self-computed only** — no peer-assigned frequency, so no eclipse vector.

## Implementation status (as shipped)

**Live:**
- Core `src/network/frequency.rs`: derivation, wire packing, `FrequencyState`,
  the process-global `FrequencyContext` (mirrors `NetworkContext`), eligibility
  (`scalars_compatible` / `dial_eligible`), and `resolve_state` (pin + hysteresis
  drift). Unit-tested; integration tests in `tests/frequency_isolation.rs`.
- Config: `frequency_isolation_mode()` (`Off`/`Observe`/`Full`, testnet+regtest
  `Full`), plus a deterministic operator **pin** `frequency_namespace` (and
  `frequency_requested_namespace` for the subscriber bridge).
- Advertisement: this node's frequency rides `VersionPayload.node_services`
  (high bits, caps preserved in low 16); peers store it (threaded through
  `add_connection_with_discovery`); it relays via `WireAddr.services` in ADDR
  gossip. No wire-format change.
- **Enforcement is at dial time** — `ConnectionManager::select_peers_to_connect`
  drops candidates whose advertised primary isn't in our membership, in `Full`
  mode, with configured seeds exempt (`CAP_SEED`). Because both sides dial-filter,
  base↔operator connections never initiate; the deliberate subscriber (whose
  membership includes the niche) still dials the operator, which accepts. This
  intentionally omits a hard *handshake* rejection (which would risk stranding an
  isolated node from its seeds); handshake-time rejection is available as future
  hardening via `FrequencyContext::handshake_eligible`.
- Timer (`node/manager.rs`): recomputes from `AggregationCache` per-space content
  counts (or the pin) every 120s and updates the context.
- Read RPC `get_node_frequency` (auth-exempt) for gateways/clients.
- On-chain `ActionType::FrequencyDrift = 0x10` + validation + constructor +
  signing message are in place (reserved, inert until produced).

**Follow-up (not yet wired):**
- Auto-emitting the on-chain `FrequencyDrift` audit record on drift, its
  block-apply handler, `frequency_drifts` storage tree, and `submit_/list_`
  RPCs. Live current-state is already observable via `get_node_frequency`, so
  this is auditability/history, not core function.
- App-namespace bucketing (grouping `@app:` spaces): today concentration is
  measured per-space (16-byte id), which covers the single-space operator; app
  ecosystems need name resolution to bucket, a documented extension.
- Auto-populating `requested` from the node's followed spaces (currently set via
  the `frequency_requested_namespace` pin).

## Verification
- Unit + `tests/frequency_isolation.rs` green.
- Regtest: two nodes broad → both `{BASE}`, peer normally. Make one exclusive to a space → it drifts to a singleton and drops main peers; a third node that requests that namespace still reaches it; broaden it again → resets to `{BASE}` and re-peers.
- `get_node_frequency` / `list_frequency_drifts` reflect the drift; `Observe` mode shows the same computed frequency with peering unaffected.
