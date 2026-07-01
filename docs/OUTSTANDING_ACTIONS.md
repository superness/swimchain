# SWIMCHAIN OUTSTANDING ACTION ITEMS

**Compiled**: 2026-01-14
**Source**: Action log files from automated review pipeline
**Status**: Ready for implementation planning

---

## SUMMARY

| Priority | Estimated Count | Category |
|----------|-----------------|----------|
| CRITICAL | 14+ (11 completed) | Security, core functionality, data loss |
| HIGH | 25+ (11 completed) | Major features, security-adjacent, accessibility |
| MEDIUM | 30+ (6 completed) | Performance, UX, maintainability |
| LOW | 15+ | Quick wins, refinements |
| **TOTAL** | **85+** | |

---

## CRITICAL ISSUES

### ~~C-API-1: Anti-Abuse Module Completely Disabled~~ ✅ COMPLETED
**Source**: `api-layer_ACTION_LOG.md`
**Effort**: L (8+ hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/C-API-1_IMPL_LOG.md`
**Files**:
- `src/api/mod.rs`
- `src/api/anti_abuse.rs`
- `src/spam_attestation/mod.rs`

**Problem**: The `anti_abuse.rs` module depends on `SwimmerLevel` from the removed `level` module. Rate limiting is completely non-functional.

**Fix Applied**: Removed all SwimmerLevel dependencies. Changed rate limiting to use `default_posts_per_day()` (20 posts/day for all users). Refactored `submit_spam_attestation()` with callback-based API for signature verification and sponsor tree lookup. Updated aggregation calls to use new API signature. Re-enabled module in mod.rs. Added `check_attester_eligibility` export. 4/5 tests pass (1 pre-existing test issue unrelated to this fix).

---

### ~~C-BLOCK-1: Signature Verification Gap in Content Blocks~~ ✅ COMPLETED
**Source**: `block-formation-consensus_ACTION_LOG.md`
**Effort**: S (1-2 hours)
**Status**: **IMPLEMENTED** - 2026-01-13
**Implementation Log**: `docs/implementations/C-BLOCK-1_IMPL_LOG.md`

**Problem**: `validate_content_block()` calls `validate_action()` which does NOT verify signatures.

**Fix Applied**: Changed line 387 to use `validate_action_full()` instead of `validate_action()`. This ensures Ed25519 signature and PoW verification for all actions in content blocks.

---

### ~~C-BLOCKLIST-1: Missing Ed25519 Signature Verification~~ ✅ COMPLETED
**Source**: `blocklist-protocol_ACTION_LOG.md`
**Effort**: M (4-6 hours)
**Status**: **IMPLEMENTED** - 2026-01-13
**Implementation Log**: `docs/implementations/C-BLOCKLIST-1_IMPL_LOG.md`

**Problem**: Blocklist updates lack Ed25519 signature verification, enabling malicious injection.

**Fix Applied**: Added Ed25519 signature verification to `validate_update()` using a callback pattern (consistent with `spam_attestation/validation.rs`). The function now accepts a `verify_signature` callback that checks `(pubkey, message, signature) -> bool`. Added `BlocklistError::InvalidSignature` error variant and `BlocklistUpdate::signing_message()` method for canonical signing message construction.

---

### ~~C-BLOCKLIST-2: Router Cannot Store Network Updates~~ ✅ COMPLETED
**Source**: `blocklist-protocol_ACTION_LOG.md`
**Effort**: M (4-6 hours)
**Status**: **IMPLEMENTED** - 2026-01-13
**Implementation Log**: `docs/implementations/C-BLOCKLIST-2_IMPL_LOG.md`

**Problem**: BlocklistStore is `Option<Arc<BlocklistStore>>` but router needs write access.

**Fix Applied**: Changed to `Option<Arc<RwLock<BlocklistStore>>>` across router, NodeManager, and RPC. Added missing wiring to pass blocklist to router builder. Handler now stores updates using `entry_from_update()` and `add_or_update()`.

---

### ~~C-DHT-1: Unsigned Provider Records Enable Content Poisoning~~ ✅ COMPLETED
**Source**: `dht-peer-discovery_ACTION_LOG.md`
**Effort**: M-L (6-10 hours)
**Status**: **IMPLEMENTED** - 2026-01-13
**Implementation Log**: `docs/implementations/C-DHT-1_IMPL_LOG.md`

**Problem**: Provider records are unsigned, allowing false content claims.

**Fix Applied**: Added Ed25519 signature verification for all DHT provider records using callback-based pattern. Changes include: signature fields in ProviderRecord, SignedProviderInfo struct for PROVIDERS messages, verification callback in add_provider() and handle_message(), signed Store messages in RPC methods, and InvalidProviderSignature error handling. All 49 DHT tests pass.

---

### ~~C-DHT-2: Eclipse Attack Vulnerability~~ ✅ COMPLETED
**Source**: `dht-peer-discovery_ACTION_LOG.md`
**Effort**: M (4-8 hours)
**Status**: **IMPLEMENTED** - 2026-01-13
**Implementation Log**: `docs/implementations/C-DHT-2_IMPL_LOG.md`

**Problem**: No subnet-based peer diversity tracking. Attacker can isolate node.

**Fix Applied**: Added subnet-based peer diversity tracking to KBucket with MAX_NODES_PER_SUBNET = 2 per /24 subnet. Added `first_seen` timestamp to NodeEntry for longevity preference. Added SubnetLimitExceeded error variant. Nodes from over-represented subnets are now rejected. All 53 DHT tests pass.

---

### ~~C-ENGAGE-1: Signature Not Verified in submit_engagement RPC~~ ✅ COMPLETED
**Source**: `engagement-social_ACTION_LOG.md`
**Effort**: S (actual: <1 hour)
**Status**: **IMPLEMENTED** - 2026-01-13
**Implementation Log**: `docs/implementations/C-ENGAGE-1_IMPL_LOG.md`

**Problem**: Engagement RPC doesn't verify author signature. Anyone can submit engagements for others.

**Fix Applied**: Added Ed25519 signature verification at `src/rpc/methods.rs:2772-2793`. Message format matches frontend: `engage:{contentId}:{nonce}:{timestamp}[:emoji]`.

---

### ~~C-ENGAGE-2: Unique Engagement Counters Never Increment~~ ✅ COMPLETED
**Source**: `engagement-social_ACTION_LOG.md`
**Effort**: M (actual: <1 hour)
**Status**: **IMPLEMENTED** - 2026-01-13
**Implementation Log**: `docs/implementations/C-ENGAGE-2_IMPL_LOG.md`

**Problem**: Unique engagement counters always zero. Sybil detection broken.

**Fix Applied**: Modified `record_engagement()` in `src/engagement_graph/storage.rs` to track `is_new_edge` and pass it to `update_stats_outgoing()` and `update_stats_incoming()`. These functions now increment `unique_authors_engaged` and `unique_engagers` respectively when a new edge is created.

---

### ~~C-CLIENT-1: Private Keys Stored Unencrypted in localStorage~~ ✅ COMPLETED
**Source**: Multiple client logs
**Effort**: M (4-6 hours for forum-client)
**Status**: **IMPLEMENTED** - 2026-01-13
**Implementation Log**: `docs/implementations/C-CLIENT-1_IMPL_LOG.md`

**Problem**: Private keys stored as plaintext. XSS exposes all keys.

**Fix Applied**: Created `forum-client/src/lib/identity-encryption.ts` with Argon2id key derivation (16 MiB, 3 iterations) and AES-256-GCM encryption. Modified `useStoredIdentity.ts` hook to support encrypted storage with `encryptSeed()`, `decryptSeed()`, `unlockIdentity()`, `lockIdentity()`, and `migrateToEncrypted()` functions. Backward compatible with legacy unencrypted identities. Uses existing `hash-wasm` dependency.

---

### ~~C-ARCHIVER-1: PoW Engagement Completely Mocked~~ ✅ COMPLETED
**Source**: `archiver-client_ACTION_LOG.md`
**Effort**: L (actual: ~2 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/C-ARCHIVER-1_IMPL_LOG.md`
**Files**:
- `archiver-client/src/lib/engagement-pow.ts` (new)
- `archiver-client/src/services/AutoEngageEngine.ts`
- `archiver-client/src/components/EngageButton.tsx`

**Problem**: PoW used `setTimeout(resolve, 1000)` instead of actual Argon2id.

**Fix Applied**: Created `engagement-pow.ts` wrapper around `@swimchain/react`'s action-pow library. Updated `AutoEngageEngine.ts` with `setAuthorPubkey()`, `setTestnetMode()`, `cancelEngagement()` methods and real Argon2id mining. Updated `EngageButton.tsx` with real-time hash rate display, progress tracking, and cancellation support.

---

### ~~C-FORK-1: CLI Fork Create Doesn't Pass secret_key to RPC~~ ✅ COMPLETED
**Source**: `fork-system_ACTION_LOG.md`
**Effort**: M (4-6 hours)
**Status**: **IMPLEMENTED** - 2026-01-13
**Implementation Log**: `docs/implementations/C-FORK-1_IMPL_LOG.md`

**Problem**: CLI fork creation can't sign because secret_key isn't passed.

**Fix Applied**: Added `load_identity()` function that reads encrypted identity file, prompts for password (or uses `SWIMCHAIN_PASSWORD` env var), decrypts the keypair, and extracts 32-byte secret key seed. Modified `create()` function to call `load_identity()` and pass hex-encoded `secret_key` to RPC params.

---

## HIGH PRIORITY ISSUES

### ~~H-BLOCK-1: Unbounded seen_actions Memory Growth~~ ✅ COMPLETED
**Source**: `block-formation-consensus_ACTION_LOG.md`
**Effort**: M (actual: ~1 hour)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-BLOCK-1_IMPL_LOG.md`
**Files**:
- `Cargo.toml`
- `src/blocks/builder.rs`

**Problem**: `seen_actions` HashSet grows ~46MB/day without bound.

**Fix Applied**: Added `lru = "0.12"` dependency and changed `seen_actions` from `HashSet<[u8; 32]>` to `LruCache<[u8; 32], ()>` with 100,000 entry capacity (~3.2MB fixed memory). Memory growth eliminated - bounded to ~3.2MB instead of unbounded ~46MB/day growth.

---

### ~~H-BLOCK-2: No Mempool Size Limits~~ ✅ COMPLETED
**Source**: `block-formation-consensus_ACTION_LOG.md`
**Effort**: M (4-6 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-BLOCK-2_IMPL_LOG.md`
**Files**:
- `src/blocks/builder.rs`

**Problem**: Unbounded mempool enables memory exhaustion attacks.

**Fix Applied**: Added `MAX_MEMPOOL_ACTIONS = 10,000` global limit and `MAX_ACTIONS_PER_SPACE = 2,000` per-space limit. Implemented lowest-PoW eviction policy with `evict_lowest_pow_from_space()` and `evict_lowest_pow_global()` methods. Added count tracking via `space_action_counts` and `total_action_count`. Capacity checks integrated into `add_action()` and `add_create_space_action()`. All 6 H-BLOCK-2 specific tests pass.

---

### ~~H-BLOCKLIST-1: Sybil Resistance Simplified~~ ✅ COMPLETED
**Source**: `blocklist-protocol_ACTION_LOG.md`
**Effort**: M (4-6 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-BLOCKLIST-1_IMPL_LOG.md`
**Files**:
- `src/blocklist/gossip.rs`

**Problem**: Sybil resistance doesn't use sponsor tree per SPEC_12 §4.4.

**Fix Applied**: Added `PendingAttestation` struct to track attestations with sponsor tree roots. Changed Sybil deduplication in `process_attestation()` to compare `sponsor_tree_root` instead of attester public key. Added 2 Sybil resistance tests. All 16 blocklist gossip tests pass.

---

### H-BLOCKLIST-2: Incomplete Gossip Forwarding
**Source**: `blocklist-protocol_ACTION_LOG.md`
**Effort**: M (3-4 hours)
**Files**:
- `src/node/router/router.rs`
- `src/blocklist/gossip.rs`

**Problem**: Blocklist updates aren't forwarded to peers.

**Fix**: After validation, call `peers_to_forward()` and send to selected peers

---

### ~~H-BLOCKLIST-3: Merkle Root Recomputation on Every Write~~ ✅ COMPLETED
**Source**: `blocklist-protocol_ACTION_LOG.md`
**Effort**: L (1-2 days estimated, ~2 hours actual)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-BLOCKLIST-3_IMPL_LOG.md`
**Files**:
- `src/blocklist/merkle.rs`
- `src/blocklist/storage.rs`
- `src/blocklist/mod.rs`

**Problem**: Full Merkle rebuild on every write. Doesn't scale beyond 10K entries.

**Fix Applied**: Added `IncrementalMerkleTree` struct with BTreeSet-based leaves for automatic sorted order, dirty tracking to defer root computation until needed, and batch API (begin_batch, add_batched, commit_batch) for bulk imports. Updated BlocklistStore and MemoryBlocklistStore to use incremental updates. 13 new tests added. All 61 blocklist tests pass.

---

### ~~H-DHT-1: STORE Always Accepts Without Validation~~ ✅ COMPLETED
**Source**: `dht-peer-discovery_ACTION_LOG.md`
**Effort**: M (4-6 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-DHT-1_IMPL_LOG.md`
**Files**:
- `src/dht/store_rate_limiter.rs` (new)
- `src/dht/manager.rs`
- `src/dht/constants.rs`
- `src/dht/error.rs`
- `src/dht/mod.rs`

**Problem**: DHT STORE accepted without rate limiting or proof-of-content.

**Fix Applied**: Added per-sender rate limiting (60 req/min) and provider count limits (100 max) via new `StoreRateLimiter` module. Graceful rejection via `StoreAck { accepted: false }`. Refresh detection allows re-announcing existing content. Automatic cleanup of stale entries. 12 tests added (8 unit + 4 integration). All 65 DHT tests pass.

---

### ~~H-DHT-2: No DHT Persistence~~ ✅ COMPLETED
**Source**: `dht-peer-discovery_ACTION_LOG.md`
**Effort**: M-L (6-10 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-DHT-2_IMPL_LOG.md`
**Files**:
- `src/dht/persistence.rs` (new)
- `src/dht/constants.rs`
- `src/dht/mod.rs`
- `src/dht/manager.rs`

**Problem**: Routing table and provider store lost on restart.

**Fix Applied**: Added sled-based persistence layer with 4 trees (routing_table, providers, local_content, metadata). DhtManager now supports `with_persistence()` constructor for persistent mode. Automatic restoration on startup with version and local_id validation. 16 tests added (11 persistence + 5 manager integration). All 80 DHT tests pass.

---

### ~~H-DHT-3: No Message Authentication~~ ✅ COMPLETED
**Source**: `dht-peer-discovery_ACTION_LOG.md`
**Effort**: M (actual: ~1.5 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-DHT-3_IMPL_LOG.md`
**Files**:
- `src/dht/messages.rs`
- `src/dht/error.rs`
- `src/dht/manager.rs`
- `src/dht/mod.rs`

**Problem**: DHT messages lack authentication. Forged messages possible.

**Fix Applied**: Added `AuthenticatedDhtMessage` envelope wrapper with Ed25519 signature authentication. Domain-separated signing (`"DHT_MESSAGE_V1" || msg_type || payload || timestamp`) prevents cross-protocol attacks. 5-minute timestamp window prevents replay attacks. Added `handle_authenticated_message()` and `create_authenticated_response()` methods to DhtManager. 12 authentication tests added. All 92 DHT tests pass.

---

### H-IDENTITY-1: No Backup Prompt After Identity Creation
**Source**: `identity-cryptography_ACTION_LOG.md`
**Effort**: M (2-4 hours)
**Files**:
- `forum-client/src/pages/Identity.tsx`
- `forum-client/src/components/BackupPromptModal.tsx` (new)

**Problem**: Users can create identity without backup prompt. Permanent loss risk.

**Implementation Plan**:
1. Create BackupPromptModal with export and acknowledge options
2. Show after identity creation
3. Block navigation until dismissed

---

### ~~H-IDENTITY-2: Display Name Limit Inconsistency~~ ✅ COMPLETED
**Source**: `identity-cryptography_ACTION_LOG.md`
**Effort**: M (4-8 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-IDENTITY-2_IMPL_LOG.md`
**Files**:
- `src/types/constants.rs`
- `src/blocks/action.rs`
- `src/rpc/methods.rs`
- `forum-client/src/pages/Identity.tsx`

**Problem**: Backend says 64 bytes, UI shows 31 chars. Inconsistent.

**Fix Applied**: Reconciled all display name limits to 64 bytes per SPEC_01 §3.5. Updated action serialization format (432→465 bytes), RPC validation, and frontend UI. All components now use `MAX_DISPLAY_NAME_BYTES = 64` as the single source of truth.

---

### ~~H-IDENTITY-3: Delete Confirmation Too Weak~~ ✅ COMPLETED
**Source**: `identity-cryptography_ACTION_LOG.md`
**Effort**: M (2-3 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-IDENTITY-3_IMPL_LOG.md`
**Files**:
- `forum-client/src/pages/Identity.tsx`
- `forum-client/src/components/DeleteConfirmModal.tsx` (new)
- `forum-client/src/components/DeleteConfirmModal.css` (new)

**Problem**: `window.confirm()` doesn't convey gravity of permanent deletion.

**Fix Applied**: Created custom `DeleteConfirmModal` requiring user to type "DELETE" to confirm identity deletion. Features include auto-uppercase transformation, focus trap, keyboard navigation (Tab/Escape), ARIA accessibility attributes, danger-themed red styling, and address display showing the identity being deleted. Prevents accidental permanent loss of cryptographic identity.

---

### ~~H-RPC-1: Rate Limiting Only Partially Implemented~~ ✅ COMPLETED
**Source**: `rpc-api_ACTION_LOG.md`
**Effort**: L (8+ hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-RPC-1_IMPL_LOG.md`
**Files**:
- `src/rpc/rate_limiter.rs` (new)
- `src/rpc/server.rs`
- `src/rpc/error.rs`
- `src/rpc/mod.rs`
- `Cargo.toml`

**Problem**: Rate limiting requires per-method implementation across 60+ methods.

**Fix Applied**: Added comprehensive per-method rate limiting using `governor = "0.6"` with GCRA algorithm. Method categorization (Read: 100/min, Write: 20/min, Admin: 10/min), per-client IP tracking, auth failure lockout (10 failures in 5 minutes = 5-minute ban), HTTP 429 responses with Retry-After header. New error codes: RateLimited (-32016), ClientLockedOut (-32017). 7 unit tests pass.

---

### ~~H-RPC-2: No Real-Time Event Support~~ ✅ COMPLETED
**Source**: `rpc-api_ACTION_LOG.md`
**Effort**: L (1-2 days)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-RPC-2_IMPL_LOG.md`
**Files**:
- `src/rpc/events.rs` (new)
- `src/rpc/server.rs`
- `src/rpc/mod.rs`
- `Cargo.toml`

**Problem**: No WebSocket/SSE transport for events.

**Fix Applied**: Added WebSocket-based real-time event streaming using `tokio-tungstenite`. Created events module with 8 event types (content_new, content_engaged, sync_status, peer_connected, peer_disconnected, block_created, space_updated, mempool_changed). EventManager supports broadcast channel (1024 capacity), per-client subscriptions with space filtering, and connection limits (5 per IP, 1000 total). WebSocket endpoint at `ws://localhost:9736/ws` with JSON-RPC 2.0 subscribe/unsubscribe/ping methods. All 8 tests pass.

---

### ~~H-RPC-3: No TLS Support~~ ✅ COMPLETED
**Source**: `rpc-api_ACTION_LOG.md`
**Effort**: M (6-8 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/H-RPC-3_IMPL_LOG.md`
**Files**:
- `Cargo.toml`
- `src/rpc/server.rs`
- `src/rpc/error.rs`
- `src/rpc/mod.rs`
- `src/node/manager.rs`

**Problem**: No TLS for remote deployment.

**Fix Applied**: Added TLS support using rustls/tokio-rustls/rustls-pemfile. Created TlsConfig struct for certificate/key paths. Added security enforcement: non-localhost bindings require TLS (returns TlsRequired error otherwise). Added TLS handlers for HTTPS and WSS (Secure WebSocket). TlsPeekedStream for protocol detection. All connections encrypted when TLS enabled. cargo check passes.

---

## MEDIUM PRIORITY ISSUES

### ~~M-DEVICE-1: Synchronous Sled Flush Blocks UI~~ ✅ COMPLETED
**Source**: `device-constraints_ACTION_LOG.md`
**Effort**: M (2-4 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/M-DEVICE-1_IMPL_LOG.md`
**Files**:
- `src/device_constraints/storage.rs:52,81`

**Problem**: `set_mode()` and `set_settings()` block on sled flush.

**Fix Applied**: Removed synchronous `flush()` calls from `set_mode()`, `set_settings()`, and `clear()` methods. Sled's write-ahead log (WAL) provides durability without blocking the UI thread. Explicit `flush()` method remains available for callers needing immediate persistence. All 13 device_constraints storage tests pass.

---

### M-DEVICE-2: Settings Version Field Missing
**Source**: `device-constraints_ACTION_LOG.md`
**Effort**: M (3-4 hours)
**Files**:
- `src/device_constraints/storage.rs`

**Problem**: No version field. Migration path unclear.

**Fix**: Add version prefix, implement migration logic

---

### ~~M-DHT-1: Sequential Lookup Processing~~ ✅ COMPLETED
**Source**: `dht-peer-discovery_ACTION_LOG.md`
**Effort**: M (3-5 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/M-DHT-1_IMPL_LOG.md`
**Files**:
- `src/dht/lookup.rs:207-245` (do_lookup)
- `src/dht/lookup.rs:334-387` (do_lookup_value)

**Problem**: Lookup waits for all RPCs before processing (`join_all`).

**Fix Applied**: Replaced `join_all` with `FuturesUnordered` from futures crate. Both `do_lookup` and `do_lookup_value` now process RPC results as they arrive. Added early termination when sufficient providers are found (even mid-batch). All 92 DHT tests pass.

---

### ~~M-DHT-2: O(n) Full Table Scans in PeerStore~~ ✅ COMPLETED
**Source**: `dht-peer-discovery_ACTION_LOG.md`
**Effort**: M (3-5 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/M-DHT-2_IMPL_LOG.md`
**Files**:
- `src/discovery/peer_store.rs`

**Problem**: Eviction scans all peers O(n).

**Fix Applied**: Added secondary score index using separate sled tree (`discovery_peers_score_idx`) with offset-encoded composite keys for correct lexicographic ordering. `evict_lowest_scores()` now O(k) instead of O(n log n). `remove_banned()` now O(k) instead of O(n). 12 new tests added. All 25 peer_store tests pass.

---

### ~~M-DHT-3: mDNS Not Implemented~~ ✅ COMPLETED
**Source**: `dht-peer-discovery_ACTION_LOG.md`
**Effort**: L (8-12 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/M-DHT-3_IMPL_LOG.md`
**Files**:
- `src/discovery/mdns.rs` (new)
- `src/discovery/manager.rs`
- `src/discovery/error.rs`
- `src/discovery/mod.rs`
- `Cargo.toml`

**Problem**: mDNS discovery layer not implemented.

**Fix Applied**: Added mDNS-based LAN peer discovery using `mdns = "3.0"` crate. Created mdns module with `MdnsDiscovery` service, `MdnsDiscoveredPeer` struct, and `_swimchain._tcp.local` service name. Supports both one-shot and continuous discovery with channel-based notifications. Integrated with DiscoveryManager as Layer 1 with `discover_mdns()`, `discover_mdns_with_timeout()`, and `create_mdns_discovery()` methods. 5 unit tests pass, 10 manager tests pass.

---

### ~~M-IDENTITY-1: Single-Threaded PoW Mining~~ ✅ COMPLETED
**Source**: `identity-cryptography_ACTION_LOG.md`
**Effort**: M (4-8 hours)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/M-IDENTITY-1_IMPL_LOG.md`
**Files**:
- `src/crypto/pow.rs`
- `Cargo.toml`

**Problem**: PoW mining doesn't use multiple cores.

**Fix Applied**: Added `rayon = "1.10"` dependency and parallel mining functions (`mine_identity_pow_parallel()`, `mine_identity_pow_parallel_with_callback()`). Uses nonce space partitioning with stride pattern across cores, `AtomicBool` for cancellation flag. Returns first solution found. All 16 tests pass (including 5 parallel-specific tests).

---

### M-IDENTITY-2: No Password Strength Indicator
**Source**: `identity-cryptography_ACTION_LOG.md`
**Effort**: M (3-4 hours)
**Files**:
- `forum-client/package.json`
- `forum-client/src/components/PasswordStrengthMeter.tsx` (new)

**Problem**: No guidance on password quality.

**Fix**: Add zxcvbn-ts library, create meter component

---

### ~~M-CLIENT-1: PBKDF2 Blocks Main Thread~~ ✅ COMPLETED
**Source**: `client-applications_ACTION_LOG.md`
**Effort**: M (4-6 hours estimated, ~1 hour actual)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/M-CLIENT-1_IMPL_LOG.md`
**Files**:
- `forum-client/src/lib/encryption-worker.ts` (new)
- `forum-client/src/lib/encryption.ts`

**Problem**: PBKDF2 freezes main thread 500ms+.

**Fix Applied**: Created Web Worker wrapper for PBKDF2 key derivation. Worker handles CPU-intensive computation in background thread. Added lazy initialization, request tracking, 30-second timeout, and automatic fallback to main thread if Worker unavailable. ArrayBuffer transfer for efficient key data passing. Build verified: worker compiled to dist/assets/encryption-worker-C86QY5Uy.js (0.71 kB).

---

### ~~M-FORUM-1: No List Virtualization~~ ✅ COMPLETED
**Source**: `forum-client_ACTION_LOG.md`
**Effort**: M (actual: ~1 hour)
**Status**: **IMPLEMENTED** - 2026-01-14
**Implementation Log**: `docs/implementations/M-FORUM-1_IMPL_LOG.md`
**Files**:
- `forum-client/package.json`
- `forum-client/src/components/ThreadList.tsx`
- `forum-client/src/components/ThreadList.css`

**Problem**: Large lists cause performance issues.

**Fix Applied**: Added react-window v2 virtualization with hybrid rendering strategy (native <50 items, virtualized ≥50). Converted from table-based to CSS Grid layout. Added ResizeObserver for dynamic container sizing. Constant memory O(1) instead of O(n). Build passes.

---

### M-FORUM-2: Argon2id Blocks Main Thread
**Source**: `forum-client_ACTION_LOG.md`
**Effort**: M (4-6 hours)
**Files**:
- `forum-client/src/hooks/useActionPow.ts`

**Problem**: PoW computation blocks UI for 15-60s.

**Fix**: Move to Web Worker

---

## LOW PRIORITY ISSUES

### L-ACCESSIBILITY: Various WCAG Quick Wins
**Effort**: S (1-2 hours each)

- Add `scope="col"` to table headers
- Add skip links to clients
- Add `aria-hidden="true"` to decorative icons
- Add reduced-motion CSS support
- Fix focus management in modals

### L-PERFORMANCE: Memoization Opportunities
**Effort**: S (1-2 hours each)

- Cache parsed HRP for address encoding
- Pre-compile regex patterns
- Memoize repeated calculations

---

## IMPLEMENTATION PRIORITY ORDER

### Phase 1: Critical Security (Immediate)
1. ~~C-ENGAGE-1: Signature verification in RPC~~ ✅ DONE
2. ~~C-CLIENT-1: Private key encryption (forum-client)~~ ✅ DONE
3. ~~C-BLOCKLIST-1: Ed25519 signature verification~~ ✅ DONE
4. ~~C-DHT-1: Signed provider records~~ ✅ DONE
5. ~~C-BLOCK-1: Signature verification in content blocks~~ ✅ DONE

### Phase 2: Security & Stability (Week 1-2)
1. ~~C-API-1: Re-enable anti-abuse module~~ ✅ DONE
2. ~~H-BLOCK-1: Bounded seen_actions~~ ✅ DONE
3. ~~H-BLOCK-2: Mempool limits~~ ✅ DONE
4. ~~C-DHT-2: Eclipse attack mitigation~~ ✅ DONE
5. ~~H-DHT-2: DHT persistence~~ ✅ DONE

### Phase 3: Features & UX (Week 2-4)
1. H-IDENTITY-1: Backup prompt modal
2. ~~H-RPC-1: Rate limiting~~ ✅ DONE
3. ~~H-DHT-1: STORE validation~~ ✅ DONE
4. ~~M-IDENTITY-1: Parallel PoW mining~~ ✅ DONE
5. M-FORUM-2: Web Worker for Argon2id

### Phase 4: Polish (Ongoing)
1. Medium priority items by effort (S first)
2. Low priority accessibility fixes
3. Performance optimizations

---

*Report compiled from 33 action log files*
*Ready for implementation script generation*
