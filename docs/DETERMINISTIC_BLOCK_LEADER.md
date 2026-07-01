# Deterministic Block Leader Election

## Problem Statement

When a space's accumulated PoW crosses the block formation threshold, multiple nodes may attempt to create and submit blocks simultaneously. The current solution (node that pushed threshold waits 5 minutes) is fragile:

- What if that node goes offline?
- Race conditions between nodes
- No deterministic ordering
- Network can't validate "who should have submitted"

## Solution: Identity-Based Leader Election

A deterministic algorithm that:
1. Computes a **block seed** from the previous block
2. Compares each identity's hash distance to the seed
3. Expands eligibility over time (tight → loose)
4. Adjusts starting difficulty based on recent block frequency

All nodes can independently compute and validate eligibility - no synchronization required.

## Core Concepts

### Block Seed

A deterministic value derived from chain state that all nodes agree on:

```rust
fn block_seed(prev_block: &Block, space_id: &[u8; 16]) -> [u8; 32] {
    sha256(prev_block.root_hash || space_id)
}
```

The seed is fixed the moment the previous block is finalized. It cannot be predicted before that block exists, preventing identity pre-generation attacks.

### XOR Distance

The "distance" between an identity and the block seed:

```rust
fn xor_distance(seed: &[u8; 32], identity: &[u8; 32]) -> [u8; 32] {
    let mut result = [0u8; 32];
    for i in 0..32 {
        result[i] = seed[i] ^ identity[i];
    }
    result
}
```

Identities with smaller XOR distance are "closer" to the seed and eligible earlier.

### Threshold-Based Eligibility

An identity is eligible if its XOR distance is below the current threshold:

```rust
fn is_eligible(seed: &[u8; 32], identity: &[u8; 32], threshold: &[u8; 32]) -> bool {
    let distance = xor_distance(seed, identity);
    distance < threshold  // Lexicographic comparison (big-endian)
}
```

The threshold expands over time, making more identities eligible.

## Threshold Calculation

### Percentage to Threshold

To make X% of the keyspace eligible:

```rust
fn threshold_for_percentage(pct: f64) -> [u8; 32] {
    // threshold = (pct / 100) * 2^256
    //
    // Approximation using leading zero bits:
    // 100%   → 0 leading zeros  → 0xFF...
    // 50%    → 1 leading zero   → 0x7F...
    // 1%     → ~7 leading zeros → 0x02...
    // 0.1%   → ~10 leading zeros
    // 0.01%  → ~13 leading zeros
    // 0.001% → ~17 leading zeros

    if pct >= 100.0 {
        return [0xFF; 32];  // Everyone eligible
    }
    if pct <= 0.0 {
        return [0x00; 32];  // Nobody eligible
    }

    // Calculate threshold = (pct / 100) * 2^256
    // log2(threshold) = log2(pct/100) + 256
    // leading_zeros = 256 - log2(threshold) = -log2(pct/100)

    let fraction = pct / 100.0;
    let threshold_f64 = fraction * (u64::MAX as f64);
    let threshold_u64 = threshold_f64 as u64;

    let mut result = [0u8; 32];
    result[24..32].copy_from_slice(&threshold_u64.to_be_bytes());
    result
}
```

### Percentage Reference Table

| Percentage | Approx Threshold | Leading Zero Bits | 1-in-N odds |
|------------|------------------|-------------------|-------------|
| 100%       | 2^256            | 0                 | 1           |
| 50%        | 2^255            | 1                 | 2           |
| 10%        | 2^252            | 4                 | 10          |
| 1%         | 2^249            | 7                 | 100         |
| 0.1%       | 2^246            | 10                | 1,000       |
| 0.01%      | 2^243            | 13                | 10,000      |
| 0.001%     | 2^239            | 17                | 100,000     |
| 0.0001%    | 2^236            | 20                | 1,000,000   |

## Difficulty Adjustment

Starting difficulty scales based on recent block frequency, similar to Bitcoin's difficulty adjustment.

### Inputs

- `recent_blocks`: Last N blocks in this space (e.g., N=10)
- `target_interval`: Desired average block time (e.g., 600 seconds)

### Algorithm

```rust
fn calculate_starting_percentage(
    recent_blocks: &[Block],
    target_interval: u64,
) -> f64 {
    const BASE_PCT: f64 = 0.001;  // 0.001% = 1 in 100,000

    if recent_blocks.len() < 2 {
        return BASE_PCT;
    }

    // Calculate actual average interval
    let first_ts = recent_blocks.first().unwrap().timestamp;
    let last_ts = recent_blocks.last().unwrap().timestamp;
    let total_time = last_ts - first_ts;
    let avg_interval = total_time / (recent_blocks.len() - 1) as u64;

    // Ratio: >1 means blocks too slow, <1 means too fast
    let ratio = avg_interval as f64 / target_interval as f64;

    // Adjust percentage:
    // - Blocks 2x too fast → halve the starting percentage (harder)
    // - Blocks 2x too slow → double the starting percentage (easier)
    let adjusted = BASE_PCT * ratio;

    // Clamp to reasonable bounds
    adjusted.clamp(0.00001, 10.0)  // Between 1-in-10M and 1-in-10
}
```

### Examples

| Scenario | Avg Interval | Target | Ratio | Starting % | ~Eligible |
|----------|--------------|--------|-------|------------|-----------|
| Very active | 1 min | 10 min | 0.1 | 0.0001% | 1 in 1M |
| Active | 5 min | 10 min | 0.5 | 0.0005% | 1 in 200K |
| Normal | 10 min | 10 min | 1.0 | 0.001% | 1 in 100K |
| Slow | 20 min | 10 min | 2.0 | 0.002% | 1 in 50K |
| Very slow | 60 min | 10 min | 6.0 | 0.006% | 1 in 17K |

## Time-Based Threshold Expansion

The eligibility threshold expands from `starting_pct` to 100% over `max_time` seconds.

```rust
fn threshold_at_elapsed(
    elapsed_secs: u64,
    starting_pct: f64,
    max_time: u64,  // e.g., 480 seconds (8 minutes)
) -> [u8; 32] {
    if elapsed_secs >= max_time {
        return [0xFF; 32];  // 100% - anyone eligible
    }

    // Linear interpolation in log space for smoother expansion
    let start_log = starting_pct.ln();
    let end_log = 100.0_f64.ln();
    let progress = elapsed_secs as f64 / max_time as f64;

    let current_log = start_log + (end_log - start_log) * progress;
    let current_pct = current_log.exp();

    threshold_for_percentage(current_pct)
}
```

### Expansion Timeline Example

Starting at 0.001% (1 in 100K), expanding over 8 minutes:

| Elapsed | Percentage | ~Eligible (100K network) |
|---------|------------|--------------------------|
| 0 sec   | 0.001%     | ~1 identity              |
| 1 min   | 0.006%     | ~6 identities            |
| 2 min   | 0.04%      | ~40 identities           |
| 3 min   | 0.2%       | ~200 identities          |
| 4 min   | 1.3%       | ~1,300 identities        |
| 5 min   | 6%         | ~6,000 identities        |
| 6 min   | 25%        | ~25,000 identities       |
| 7 min   | 60%        | ~60,000 identities       |
| 8 min   | 100%       | everyone                 |

## Complete Eligibility Check

```rust
pub struct BlockEligibility {
    block_seed: [u8; 32],
    prev_block_timestamp: u64,
    starting_pct: f64,
    max_time: u64,
}

impl BlockEligibility {
    pub fn new(
        prev_block: &Block,
        space_id: &[u8; 16],
        recent_blocks: &[Block],
        target_interval: u64,
    ) -> Self {
        Self {
            block_seed: sha256(prev_block.root_hash || space_id),
            prev_block_timestamp: prev_block.timestamp,
            starting_pct: calculate_starting_percentage(recent_blocks, target_interval),
            max_time: 480,  // 8 minutes to reach 100%
        }
    }

    pub fn is_eligible(&self, identity: &[u8; 32], now: u64) -> bool {
        let elapsed = now.saturating_sub(self.prev_block_timestamp);
        let threshold = threshold_at_elapsed(elapsed, self.starting_pct, self.max_time);
        let distance = xor_distance(&self.block_seed, identity);

        distance < threshold
    }

    pub fn can_create_block(
        &self,
        identity: &[u8; 32],
        pow_accumulated: u64,
        pow_threshold: u64,
        now: u64,
    ) -> bool {
        // Both conditions must be met:
        // 1. Content is ready (enough PoW accumulated)
        // 2. This identity is eligible to create the block
        pow_accumulated >= pow_threshold && self.is_eligible(identity, now)
    }
}
```

## Block Validation

When receiving a block, nodes validate the creator was eligible:

```rust
fn validate_block_leader(
    block: &Block,
    chain_store: &ChainStore,
) -> Result<bool, Error> {
    // Get chain state (all nodes have this)
    let prev_block = chain_store.get_block(&block.prev_hash)?;
    let recent_blocks = chain_store.get_recent_blocks(&block.space_id, 10)?;

    // Compute eligibility (deterministic from chain state)
    let eligibility = BlockEligibility::new(
        &prev_block,
        &block.space_id,
        &recent_blocks,
        TARGET_BLOCK_INTERVAL,
    );

    // Verify creator was eligible at block's timestamp
    Ok(eligibility.is_eligible(&block.creator_identity, block.timestamp))
}
```

**Key properties:**
- No extra fields needed in the block
- No synchronization between nodes
- Fully deterministic from existing chain state
- Cheating is impossible - invalid leaders are rejected by all nodes

## Block Creation Flow

```rust
async fn block_creation_loop(node: &Node) {
    loop {
        for (space_id, pending) in node.get_pending_actions_by_space() {
            let pow_accumulated = calculate_pow(&pending);
            let pow_threshold = get_space_threshold(&space_id);

            if pow_accumulated < pow_threshold {
                continue;  // Not enough PoW yet
            }

            // Check eligibility
            let prev_block = node.get_latest_block(&space_id)?;
            let recent = node.get_recent_blocks(&space_id, 10)?;
            let eligibility = BlockEligibility::new(
                &prev_block, &space_id, &recent, TARGET_INTERVAL
            );

            let now = current_timestamp();
            if eligibility.is_eligible(&node.identity, now) {
                // We're eligible! Create and broadcast block
                let block = create_block(&pending, &node.identity, now);
                node.broadcast_block(block);
            }
        }

        sleep(Duration::from_secs(1)).await;
    }
}
```

## Security Considerations

### Identity Grinding

**Attack:** Generate many identities hoping one is close to future block seeds.

**Mitigation:**
- Block seed includes previous block hash (unpredictable)
- Identity creation requires PoW (expensive to generate many)
- Even with many identities, only provides earlier eligibility (not exclusive rights)

### Timestamp Manipulation

**Attack:** Claim a future timestamp to appear eligible earlier.

**Mitigation:**
- Nodes reject blocks with timestamps too far in the future
- Block must also meet PoW threshold (can't just claim any time)
- Other nodes will become eligible and submit competing blocks

### Eclipse Attack

**Attack:** Isolate a node and feed it fake chain history to manipulate difficulty.

**Mitigation:**
- Same as general eclipse attack mitigations
- Multiple peer connections
- Checkpoint validation

## Implementation Plan

### Phase 1: Core Algorithm
- [ ] Implement `xor_distance()` function
- [ ] Implement `threshold_for_percentage()` function
- [ ] Implement `threshold_at_elapsed()` function
- [ ] Implement `BlockEligibility` struct
- [ ] Unit tests for all functions

### Phase 2: Difficulty Adjustment
- [ ] Add method to ChainStore: `get_recent_blocks(space_id, count)`
- [ ] Implement `calculate_starting_percentage()`
- [ ] Integration tests with varying block histories

### Phase 3: Block Creation Integration
- [ ] Update block creation loop to check eligibility
- [ ] Add `creator_identity` field to Block (if not present)
- [ ] Update block builder to include creator identity

### Phase 4: Validation Integration
- [ ] Add `validate_block_leader()` to block validation pipeline
- [ ] Reject blocks from ineligible creators
- [ ] Log/metric for rejected invalid-leader blocks

### Phase 5: Testing
- [ ] Simulation with multiple nodes
- [ ] Test difficulty adjustment convergence
- [ ] Test leader election fairness over time
- [ ] Test graceful degradation when leader is offline

## Configuration Constants

```rust
/// Target time between blocks (seconds)
pub const TARGET_BLOCK_INTERVAL: u64 = 600;  // 10 minutes

/// Number of recent blocks to consider for difficulty adjustment
pub const DIFFICULTY_ADJUSTMENT_WINDOW: usize = 10;

/// Time until anyone becomes eligible (seconds)
pub const MAX_ELIGIBILITY_TIME: u64 = 480;  // 8 minutes

/// Base starting percentage (before difficulty adjustment)
pub const BASE_STARTING_PCT: f64 = 0.001;  // 1 in 100,000

/// Minimum starting percentage (cap for very active spaces)
pub const MIN_STARTING_PCT: f64 = 0.00001;  // 1 in 10,000,000

/// Maximum starting percentage (cap for very inactive spaces)
pub const MAX_STARTING_PCT: f64 = 10.0;  // 1 in 10
```

## Summary

This system provides:

1. **Deterministic leader election** - all nodes agree on who should create blocks
2. **Graceful degradation** - if preferred leader is offline, others become eligible
3. **Self-regulating difficulty** - adjusts to network activity automatically
4. **No coordination required** - each node independently computes eligibility
5. **Fully verifiable** - invalid leaders are rejected by all nodes
6. **Sybil resistant** - identity PoW makes grinding expensive
