# Engagement Pool System

> Reference: SPEC_03 §7 (Pooled Engagement), SPEC_08 §3.3 (Pool Data Structures)

The Engagement Pool System implements distributed content persistence through pooled Proof of Work contributions. Multiple users can contribute PoW toward a shared pool, and when the total reaches 60 seconds, the target content's decay timer resets.

## Core Concept: Mining IS Paying

In Swimchain, there is no distinction between "mining" and "paying." All engagement costs PoW:
- **No free self-persistence** - Authors cannot keep their own content alive without ongoing PoW investment
- **Distributed contribution** - Any user can contribute to any pool
- **Total work matters** - Identity count is irrelevant; only total PoW determines completion

## Pool Parameters

| Parameter | Value | Constant |
|-----------|-------|----------|
| Required PoW | 60 seconds | `POOL_REQUIRED_POW_SECS` |
| Pool Window | 10 minutes (600,000ms) | `POOL_WINDOW_MS` |
| Min Contribution | 1 second | `MIN_CONTRIBUTION_SECS` |

## Pool Lifecycle

```
  ┌──────────────┐
  │  INITIATION  │  User creates pool targeting content hash
  │  (Open=0x01) │  Pool ID = sha256(target_content || window_start_be || initiator)
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ CONTRIBUTION │  Users add PoW to pool
  │              │  Minimum 1 second per contribution
  │              │  Same user can contribute multiple times
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ ACCUMULATION │  Work amounts are additive
  │              │  Pool total updated with each valid contribution
  └──────┬───────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────────┐  ┌────────────┐
│ COMPLETION │  │ EXPIRATION │
│ (0x02)     │  │ (0x03)     │
│            │  │            │
│ Total≥60s  │  │ Window     │
│ Decay      │  │ closes     │
│ resets     │  │ Work LOST  │
└────────────┘  └────────────┘
```

### Stage 1: INITIATION (`PoolStatus::Open = 0x01`)
- User creates pool targeting a specific content hash
- Pool ID derived deterministically: `sha256(target_content || window_start_be || initiator)`
- 10-minute contribution window begins
- Pool status set to `Open`

### Stage 2: CONTRIBUTION
- PoW target is content-specific: `sha256(content_hash || pool_id || prev_block_hash)`
- Multiple users can contribute to the same pool
- Same user can contribute multiple times
- Minimum contribution: 1 second of PoW work

### Stage 3: ACCUMULATION
- Work amounts from all contributions are summed
- Pool tracks all contributors and their contributions
- No partial credit - work is either counted or not

### Stage 4: COMPLETION (`PoolStatus::Completed = 0x02`)
- Triggered when total PoW reaches or exceeds 60 seconds
- Target content's decay timer is reset
- All contributors are credited in the pool record
- Pool status transitions to `Completed`

### Stage 5: EXPIRATION (`PoolStatus::Expired = 0x03`)
- Window closes without reaching 60 seconds
- **ALL contributed PoW is LOST** (sunk cost design)
- Pool status transitions to `Expired`
- No partial decay reset or refunds

## Data Structures

### PoolStatus Enum

```rust
#[repr(u8)]
pub enum PoolStatus {
    Open = 0x01,      // Accepting contributions
    Completed = 0x02, // Total met, engagement recorded
    Expired = 0x03,   // Window closed incomplete
}
```

### EngagementPool Structure

From `src/content/pool.rs`:

| Field | Type | Description |
|-------|------|-------------|
| `pool_id` | `[u8; 32]` | Unique identifier (sha256 of pool parameters) |
| `target_content` | `[u8; 32]` | ContentHash of content being engaged |
| `required_pow` | `u64` | Total PoW needed (60 seconds) |
| `window_start` | `u64` | Unix timestamp in milliseconds |
| `window_end` | `u64` | `window_start + POOL_WINDOW_MS` (600,000ms) |
| `contributions` | `Vec<PoolContribution>` | List of all contributions |
| `status` | `PoolStatus` | Current pool status |

### PoolContribution Structure

From `src/content/pool.rs`:

| Field | Type | Description |
|-------|------|-------------|
| `contributor` | `[u8; 32]` | Public key bytes of contributor |
| `pow_nonce` | `u64` | PoW solution nonce |
| `pow_work` | `u64` | Work amount in seconds (NOT milliseconds) |
| `pow_target` | `[u8; 32]` | Content-specific target hash solved against |
| `timestamp` | `u64` | Unix timestamp in milliseconds |
| `signature` | `[u8; 64]` | Ed25519 signature bytes |
| `nonce_space` | `[u8; 8]` | Random bytes for challenge uniqueness |

## Wire Protocol Messages

Per SPEC_08 §10:

| Message | ID | Purpose |
|---------|-----|---------|
| `POOL_INIT` | `0x46` | Initialize a new engagement pool |
| `POOL_CONTRIBUTE` | `0x47` | Submit contribution to existing pool |
| `POOL_STATUS` | `0x48` | Query or report pool completion status |

## Pool API

### Core Functions

```rust
// Create a new engagement pool targeting content
pub fn create_pool(
    target_content: [u8; 32],
    initiator: [u8; 32],
    current_time_ms: u64
) -> PoolId

// Add contribution to existing pool
pub fn add_contribution(
    pool_id: PoolId,
    contribution: PoolContribution,
    current_time_ms: u64,
    config: &ForkPoWConfig
) -> Result<(), PoolError>

// Check if pool has completed
pub fn check_completion(pool_id: PoolId) -> CompletionResult

// Get pool information
pub fn get_pool_info(
    pool_id: PoolId,
    current_time_ms: u64
) -> PoolInfo

// Expire pools past their window
pub fn expire_pools(current_time_ms: u64) -> Vec<PoolId>
```

### Pool ID Generation

```rust
// Pool ID is deterministic from parameters
fn generate_pool_id(
    target_content: &[u8; 32],
    window_start: u64,
    initiator: &[u8; 32]
) -> PoolId {
    let mut data = Vec::with_capacity(72);
    data.extend_from_slice(target_content);
    data.extend_from_slice(&window_start.to_be_bytes());
    data.extend_from_slice(initiator);
    sha256(&data)
}
```

### Content-Specific PoW Target

```rust
// PoW target is bound to content and pool
fn compute_pow_target(
    content_hash: &[u8; 32],
    pool_id: &PoolId,
    prev_block_hash: &[u8; 32]
) -> [u8; 32] {
    let mut data = Vec::with_capacity(96);
    data.extend_from_slice(content_hash);
    data.extend_from_slice(pool_id);
    data.extend_from_slice(prev_block_hash);
    sha256(&data)
}
```

## Benchmarks

Performance measurements (2025-12-25):

| Operation | Time | Notes |
|-----------|------|-------|
| Contribution overhead | 150ns | Per contribution validation |
| Completion check | 46ns | Per completion verification |
| Storage per pool | 1-10KB | Depends on contributor count |

### Performance Characteristics

- Pool creation: O(1) - constant time hash operation
- Contribution addition: O(1) amortized - append to vector
- Completion check: O(1) - simple comparison
- Pool expiry scan: O(n) where n = active pools

## Usage Example

```rust
use swimchain::content::pool::{
    PoolManager, PoolContribution, PoolStatus
};

let mut manager = PoolManager::new();

// Create pool targeting content
let pool_id = manager.create_pool(
    content_hash,
    author_pubkey,
    current_time_ms()
)?;

// Add contributions
let contribution = PoolContribution {
    contributor: user_pubkey,
    pow_nonce: nonce,
    pow_work: 15,  // 15 seconds of PoW
    pow_target: target,
    timestamp: current_time_ms(),
    signature: sig,
    nonce_space: challenge_nonce,
};

manager.add_contribution(pool_id, contribution, current_time_ms(), &config)?;

// Check status
match manager.get_status(pool_id) {
    PoolStatus::Open => println!("Pool accepting contributions"),
    PoolStatus::Completed => println!("Pool complete! Decay reset."),
    PoolStatus::Expired => println!("Pool expired, work lost"),
}
```

## Integration with Decay System

When a pool completes:
1. The `ContentManager` receives notification via `on_pool_complete(pool_id)`
2. Target content's `last_engagement` timestamp is updated to current time
3. Decay timer effectively resets, giving content another full decay cycle
4. All contributors are recorded for attribution

See [Content & Decay Engine](content-decay.md) for decay mechanics.

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `PoolNotFound` | Invalid pool ID | Check pool exists before contributing |
| `PoolNotOpen` | Contributing to completed/expired pool | Cannot add to non-open pools |
| `PoolExpired` | Window has closed | Create new pool if persistence still desired |
| `ContributionTooSmall` | Work < 1 second | Increase PoW duration |
| `InvalidPoW` | PoW verification failed | Recompute PoW with correct target |
| `InvalidSignature` | Signature doesn't verify | Sign contribution correctly |
| `ContentMismatch` | Wrong PoW target | Use pool's content-specific target |
| `ContributionAfterDeadline` | Timestamp past window_end | Submit within 10-minute window |

## See Also

- **Implementation:** `src/content/pool.rs`
- **Spec:** `specs/SPEC_03_PROOF_OF_WORK.md` §7 (Pooled Engagement)
- **Spec:** `specs/SPEC_08_RECURSIVE_BLOCKS.md` §3 (Pool Data Structures)
- **Related:** [Content & Decay Engine](content-decay.md) (decay reset mechanics)
- **Related:** [Proof of Work System](proof-of-work.md) (Argon2id algorithm)
- **Economics:** [Pool Economics and Attack Analysis](pool-economics.md)
