//! Deterministic Block Leader Election
//!
//! This module implements a deterministic algorithm for deciding which identity
//! is eligible to create a block at any given time. The system:
//!
//! 1. Computes a "block seed" from the previous block hash and space ID
//! 2. Compares each identity's XOR distance to the seed
//! 3. Expands eligibility over time (strict → permissive)
//! 4. Adjusts starting difficulty based on recent block frequency
//!
//! All nodes independently compute the same eligibility, requiring no coordination.

use sha2::{Digest, Sha256};

/// Target time between blocks (seconds)
pub const TARGET_BLOCK_INTERVAL: u64 = 600; // 10 minutes

/// Number of recent blocks to consider for difficulty adjustment
pub const DIFFICULTY_ADJUSTMENT_WINDOW: usize = 10;

/// Time until anyone becomes eligible (seconds) — mainnet default.
pub const MAX_ELIGIBILITY_TIME: u64 = 480; // 8 minutes

/// Time until anyone becomes eligible, gated by network mode.
///
/// On mainnet this is the full 8-minute expansion (fast eligibility means more
/// nodes eligible at once, i.e. more competing blocks / forks — undesirable at
/// scale). On test networks it is short so a quiet chain still seals blocks
/// promptly for demos/development rather than grinding at ~10 min/block.
pub fn max_eligibility_time() -> u64 {
    match crate::network::NetworkContext::mode() {
        crate::network::NetworkMode::Mainnet => MAX_ELIGIBILITY_TIME,
        _ => 45, // testnet / regtest: lively blocks
    }
}

/// Base starting percentage (before difficulty adjustment)
/// 0.001% = 1 in 100,000
pub const BASE_STARTING_PCT: f64 = 0.001;

/// Minimum starting percentage (cap for very active spaces)
/// 0.00001% = 1 in 10,000,000
pub const MIN_STARTING_PCT: f64 = 0.00001;

/// Maximum starting percentage (cap for very inactive spaces)
/// 10% = 1 in 10
pub const MAX_STARTING_PCT: f64 = 10.0;

/// Compute the XOR distance between two 32-byte values.
/// Returns a 32-byte array representing the distance.
/// Smaller values (lexicographically) mean "closer".
#[inline]
pub fn xor_distance(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut result = [0u8; 32];
    for i in 0..32 {
        result[i] = a[i] ^ b[i];
    }
    result
}

/// Compare two 32-byte values lexicographically (big-endian).
/// Returns true if a < b.
#[inline]
pub fn bytes_less_than(a: &[u8; 32], b: &[u8; 32]) -> bool {
    for i in 0..32 {
        match a[i].cmp(&b[i]) {
            std::cmp::Ordering::Less => return true,
            std::cmp::Ordering::Greater => return false,
            std::cmp::Ordering::Equal => continue,
        }
    }
    false // Equal
}

/// Convert a percentage (0.0 to 100.0) to a threshold value.
/// An identity is eligible if its XOR distance is less than this threshold.
///
/// The threshold represents what fraction of the 2^256 keyspace is eligible.
/// - 100% → [0xFF; 32] (everyone eligible)
/// - 50%  → [0x7F, 0xFF, ...] (half eligible)
/// - 1%   → much smaller value
/// - 0%   → [0x00; 32] (nobody eligible)
pub fn threshold_for_percentage(pct: f64) -> [u8; 32] {
    if pct >= 100.0 {
        return [0xFF; 32]; // Everyone eligible
    }
    if pct <= 0.0 {
        return [0x00; 32]; // Nobody eligible
    }

    // We need to compute: threshold = (pct / 100) * 2^256
    //
    // Since we can't represent 2^256 directly, we work with the fraction.
    // The approach: set the threshold such that (threshold / 2^256) = pct/100
    //
    // For small percentages, we can approximate by setting leading bytes.
    // For a percentage P, the number of leading zero bits is approximately:
    //   leading_zeros ≈ -log2(P/100) = log2(100/P)
    //
    // We'll compute the threshold more precisely using floating point,
    // then convert to bytes.

    let fraction = pct / 100.0;

    // For very small percentages, use bit-based calculation
    if fraction < 1.0 / (u64::MAX as f64) {
        // Extremely small - calculate leading zero bytes
        let log2_fraction = fraction.log2(); // Negative value
        let leading_zero_bits = (-log2_fraction) as usize;
        let leading_zero_bytes = leading_zero_bits / 8;
        let remaining_bits = leading_zero_bits % 8;

        let mut result = [0u8; 32];
        if leading_zero_bytes < 32 {
            // Set the first non-zero byte
            result[leading_zero_bytes] = (0xFF >> remaining_bits) as u8;
            // Fill remaining bytes with 0xFF
            for i in (leading_zero_bytes + 1)..32 {
                result[i] = 0xFF;
            }
        }
        return result;
    }

    // For larger percentages, compute directly
    // We'll fill from the most significant bytes
    let mut result = [0u8; 32];
    let mut remaining = fraction;

    for i in 0..32 {
        let byte_value = (remaining * 256.0).min(255.0);
        result[i] = byte_value as u8;
        remaining = (remaining * 256.0) - (result[i] as f64);
        if remaining <= 0.0 {
            break;
        }
    }

    result
}

/// Calculate the eligibility threshold at a given elapsed time.
///
/// The threshold expands from `starting_pct` to 100% over `max_time` seconds.
/// Uses logarithmic interpolation for smooth expansion.
///
/// # Arguments
/// * `elapsed_secs` - Time since the previous block
/// * `starting_pct` - Initial eligible percentage (e.g., 0.001 for 0.001%)
/// * `max_time` - Time at which 100% becomes eligible
pub fn threshold_at_elapsed(elapsed_secs: u64, starting_pct: f64, max_time: u64) -> [u8; 32] {
    if elapsed_secs >= max_time {
        return [0xFF; 32]; // 100% - anyone eligible
    }

    if elapsed_secs == 0 {
        return threshold_for_percentage(starting_pct);
    }

    // Logarithmic interpolation for smoother expansion
    // This gives more time at low percentages and faster growth at high percentages
    let start_log = starting_pct.ln();
    let end_log = 100.0_f64.ln();
    let progress = elapsed_secs as f64 / max_time as f64;

    let current_log = start_log + (end_log - start_log) * progress;
    let current_pct = current_log.exp();

    threshold_for_percentage(current_pct)
}

/// Calculate the starting eligibility percentage based on recent block history.
///
/// Adjusts difficulty similar to Bitcoin:
/// - Blocks too fast → stricter starting threshold (lower percentage)
/// - Blocks too slow → looser starting threshold (higher percentage)
///
/// # Arguments
/// * `block_timestamps` - Timestamps of recent blocks (oldest to newest)
/// * `target_interval` - Desired average time between blocks
pub fn calculate_starting_percentage(block_timestamps: &[u64], target_interval: u64) -> f64 {
    if block_timestamps.len() < 2 {
        return BASE_STARTING_PCT;
    }

    // Calculate actual average interval
    let first_ts = block_timestamps.first().unwrap();
    let last_ts = block_timestamps.last().unwrap();
    let total_time = last_ts.saturating_sub(*first_ts);

    if total_time == 0 {
        return BASE_STARTING_PCT;
    }

    let num_intervals = (block_timestamps.len() - 1) as u64;
    let avg_interval = total_time / num_intervals;

    // Ratio: >1 means blocks too slow, <1 means too fast
    let ratio = avg_interval as f64 / target_interval as f64;

    // Adjust percentage:
    // - Blocks 2x too fast (ratio=0.5) → halve the starting percentage (harder)
    // - Blocks 2x too slow (ratio=2.0) → double the starting percentage (easier)
    let adjusted = BASE_STARTING_PCT * ratio;

    // Clamp to reasonable bounds
    adjusted.clamp(MIN_STARTING_PCT, MAX_STARTING_PCT)
}

/// Compute the deterministic block seed from previous block and space ID.
///
/// The seed determines which identities are "close" and eligible to create blocks.
/// All nodes compute the same seed from the same inputs.
pub fn compute_block_seed(prev_block_hash: &[u8; 32], space_id: &[u8; 16]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(prev_block_hash);
    hasher.update(space_id);

    let result = hasher.finalize();
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&result);
    seed
}

/// Block eligibility calculator.
///
/// Determines whether an identity is eligible to create a block based on:
/// - XOR distance from the block seed
/// - Time elapsed since the previous block
/// - Difficulty adjustment from recent block history
#[derive(Debug, Clone)]
pub struct BlockEligibility {
    /// Deterministic seed derived from previous block
    pub block_seed: [u8; 32],
    /// Timestamp of the previous block
    pub prev_block_timestamp: u64,
    /// Starting eligibility percentage (difficulty-adjusted)
    pub starting_pct: f64,
    /// Time at which anyone becomes eligible
    pub max_time: u64,
}

impl BlockEligibility {
    /// Create a new eligibility calculator.
    ///
    /// # Arguments
    /// * `prev_block_hash` - Hash of the previous block
    /// * `prev_block_timestamp` - Timestamp of the previous block
    /// * `space_id` - The space this block is for
    /// * `recent_block_timestamps` - Timestamps of recent blocks for difficulty adjustment
    pub fn new(
        prev_block_hash: &[u8; 32],
        prev_block_timestamp: u64,
        space_id: &[u8; 16],
        recent_block_timestamps: &[u64],
    ) -> Self {
        Self {
            block_seed: compute_block_seed(prev_block_hash, space_id),
            prev_block_timestamp,
            starting_pct: calculate_starting_percentage(
                recent_block_timestamps,
                TARGET_BLOCK_INTERVAL,
            ),
            max_time: max_eligibility_time(),
        }
    }

    /// Create with custom parameters (for testing).
    pub fn with_params(
        block_seed: [u8; 32],
        prev_block_timestamp: u64,
        starting_pct: f64,
        max_time: u64,
    ) -> Self {
        Self {
            block_seed,
            prev_block_timestamp,
            starting_pct,
            max_time,
        }
    }

    /// Get the current eligibility threshold at the given timestamp.
    pub fn threshold_at(&self, now: u64) -> [u8; 32] {
        let elapsed = now.saturating_sub(self.prev_block_timestamp);
        threshold_at_elapsed(elapsed, self.starting_pct, self.max_time)
    }

    /// Get the current eligible percentage at the given timestamp.
    pub fn eligible_percentage_at(&self, now: u64) -> f64 {
        let elapsed = now.saturating_sub(self.prev_block_timestamp);

        if elapsed >= self.max_time {
            return 100.0;
        }
        if elapsed == 0 {
            return self.starting_pct;
        }

        let start_log = self.starting_pct.ln();
        let end_log = 100.0_f64.ln();
        let progress = elapsed as f64 / self.max_time as f64;

        let current_log = start_log + (end_log - start_log) * progress;
        current_log.exp()
    }

    /// Check if an identity is eligible to create a block at the given timestamp.
    pub fn is_eligible(&self, identity: &[u8; 32], now: u64) -> bool {
        let elapsed = now.saturating_sub(self.prev_block_timestamp);

        // At max_time, everyone is eligible (handles edge case where
        // threshold = [0xFF; 32] and distance = [0xFF; 32])
        if elapsed >= self.max_time {
            return true;
        }

        let threshold = self.threshold_at(now);
        let distance = xor_distance(&self.block_seed, identity);
        bytes_less_than(&distance, &threshold)
    }

    /// Check if an identity can create a block (eligible AND PoW threshold met).
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

    /// Calculate when an identity will become eligible.
    /// Returns None if already eligible, or the timestamp when eligible.
    pub fn when_eligible(&self, identity: &[u8; 32], now: u64) -> Option<u64> {
        if self.is_eligible(identity, now) {
            return None; // Already eligible
        }

        // Binary search for the eligibility time
        let mut low = now;
        let mut high = self.prev_block_timestamp + self.max_time;

        while low < high {
            let mid = low + (high - low) / 2;
            if self.is_eligible(identity, mid) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        Some(low)
    }

    /// Get the XOR distance of an identity from the block seed.
    pub fn distance(&self, identity: &[u8; 32]) -> [u8; 32] {
        xor_distance(&self.block_seed, identity)
    }
}

/// Validate that a block creator was eligible at the claimed timestamp.
///
/// # Arguments
/// * `creator_identity` - The identity that created the block
/// * `block_timestamp` - The timestamp claimed by the block
/// * `prev_block_hash` - Hash of the previous block
/// * `prev_block_timestamp` - Timestamp of the previous block
/// * `space_id` - Space the block belongs to
/// * `recent_block_timestamps` - Recent block timestamps for difficulty calculation
pub fn validate_block_leader(
    creator_identity: &[u8; 32],
    block_timestamp: u64,
    prev_block_hash: &[u8; 32],
    prev_block_timestamp: u64,
    space_id: &[u8; 16],
    recent_block_timestamps: &[u64],
) -> bool {
    let eligibility = BlockEligibility::new(
        prev_block_hash,
        prev_block_timestamp,
        space_id,
        recent_block_timestamps,
    );

    eligibility.is_eligible(creator_identity, block_timestamp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xor_distance() {
        let a = [0u8; 32];
        let b = [0u8; 32];
        assert_eq!(xor_distance(&a, &b), [0u8; 32]);

        let mut a = [0u8; 32];
        let mut b = [0u8; 32];
        a[0] = 0xFF;
        b[0] = 0x00;
        let dist = xor_distance(&a, &b);
        assert_eq!(dist[0], 0xFF);
    }

    #[test]
    fn test_bytes_less_than() {
        let a = [0u8; 32];
        let b = [1u8; 32];
        assert!(bytes_less_than(&a, &b));
        assert!(!bytes_less_than(&b, &a));
        assert!(!bytes_less_than(&a, &a));

        let mut a = [0u8; 32];
        let mut b = [0u8; 32];
        a[31] = 1;
        b[0] = 1;
        // b has a 1 in the most significant byte, a has a 1 in the least significant
        assert!(bytes_less_than(&a, &b)); // a < b
    }

    #[test]
    fn test_threshold_for_percentage() {
        // 100% should be all 0xFF
        let t100 = threshold_for_percentage(100.0);
        assert_eq!(t100, [0xFF; 32]);

        // 0% should be all 0x00
        let t0 = threshold_for_percentage(0.0);
        assert_eq!(t0, [0u8; 32]);

        // 50% should have first byte around 0x7F-0x80
        let t50 = threshold_for_percentage(50.0);
        assert!(t50[0] >= 0x7F && t50[0] <= 0x80);

        // Smaller percentages should have smaller thresholds
        let t10 = threshold_for_percentage(10.0);
        let t1 = threshold_for_percentage(1.0);
        let t01 = threshold_for_percentage(0.1);

        assert!(bytes_less_than(&t01, &t1));
        assert!(bytes_less_than(&t1, &t10));
        assert!(bytes_less_than(&t10, &t50));
    }

    #[test]
    fn test_threshold_at_elapsed() {
        let starting_pct = 0.001;
        let max_time = 480;

        // At t=0, should equal starting percentage
        let t0 = threshold_at_elapsed(0, starting_pct, max_time);
        let t_start = threshold_for_percentage(starting_pct);
        assert_eq!(t0, t_start);

        // At t=max_time, should be 100%
        let t_max = threshold_at_elapsed(max_time, starting_pct, max_time);
        assert_eq!(t_max, [0xFF; 32]);

        // Should monotonically increase
        let t1 = threshold_at_elapsed(60, starting_pct, max_time);
        let t2 = threshold_at_elapsed(120, starting_pct, max_time);
        let t3 = threshold_at_elapsed(240, starting_pct, max_time);

        assert!(bytes_less_than(&t0, &t1));
        assert!(bytes_less_than(&t1, &t2));
        assert!(bytes_less_than(&t2, &t3));
    }

    #[test]
    fn test_calculate_starting_percentage() {
        // With no history, should return base
        let pct = calculate_starting_percentage(&[], TARGET_BLOCK_INTERVAL);
        assert_eq!(pct, BASE_STARTING_PCT);

        // With one block, should return base
        let pct = calculate_starting_percentage(&[1000], TARGET_BLOCK_INTERVAL);
        assert_eq!(pct, BASE_STARTING_PCT);

        // Blocks at target interval should return base
        let timestamps: Vec<u64> = (0..10).map(|i| i * TARGET_BLOCK_INTERVAL).collect();
        let pct = calculate_starting_percentage(&timestamps, TARGET_BLOCK_INTERVAL);
        assert!((pct - BASE_STARTING_PCT).abs() < 0.0001);

        // Blocks 2x too fast should halve the percentage (harder)
        let fast_timestamps: Vec<u64> = (0..10).map(|i| i * TARGET_BLOCK_INTERVAL / 2).collect();
        let fast_pct = calculate_starting_percentage(&fast_timestamps, TARGET_BLOCK_INTERVAL);
        assert!(fast_pct < BASE_STARTING_PCT);
        assert!((fast_pct - BASE_STARTING_PCT * 0.5).abs() < 0.0001);

        // Blocks 2x too slow should double the percentage (easier)
        let slow_timestamps: Vec<u64> = (0..10).map(|i| i * TARGET_BLOCK_INTERVAL * 2).collect();
        let slow_pct = calculate_starting_percentage(&slow_timestamps, TARGET_BLOCK_INTERVAL);
        assert!(slow_pct > BASE_STARTING_PCT);
        assert!((slow_pct - BASE_STARTING_PCT * 2.0).abs() < 0.0001);
    }

    #[test]
    fn test_block_eligibility() {
        let prev_hash = [0x42u8; 32];
        let prev_timestamp = 1000000;
        let space_id = [0x01u8; 16];
        let recent_timestamps = vec![prev_timestamp - 600, prev_timestamp];

        let eligibility =
            BlockEligibility::new(&prev_hash, prev_timestamp, &space_id, &recent_timestamps);

        // The seed should be deterministic
        let seed2 = compute_block_seed(&prev_hash, &space_id);
        assert_eq!(eligibility.block_seed, seed2);

        // Create an identity that's very close to the seed (should be eligible early)
        let mut close_identity = eligibility.block_seed;
        close_identity[31] ^= 0x01; // Flip one bit in the last byte

        // Create an identity that's far from the seed
        let far_identity = [0xFF; 32];

        // At t=0, close identity might be eligible, far identity probably not
        // At t=max_time, both should be eligible
        let now_max = prev_timestamp + MAX_ELIGIBILITY_TIME;
        assert!(eligibility.is_eligible(&close_identity, now_max));
        assert!(eligibility.is_eligible(&far_identity, now_max));
    }

    #[test]
    fn test_validate_block_leader() {
        let prev_hash = [0x42u8; 32];
        let prev_timestamp = 1000000;
        let space_id = [0x01u8; 16];
        let recent_timestamps = vec![prev_timestamp - 600, prev_timestamp];

        // At max eligibility time, any identity should be valid
        let block_timestamp = prev_timestamp + MAX_ELIGIBILITY_TIME;
        let any_identity = [0xAB; 32];

        assert!(validate_block_leader(
            &any_identity,
            block_timestamp,
            &prev_hash,
            prev_timestamp,
            &space_id,
            &recent_timestamps,
        ));
    }

    #[test]
    fn test_when_eligible() {
        let eligibility = BlockEligibility::with_params(
            [0u8; 32], // seed
            1000000,   // prev_timestamp
            0.001,     // starting_pct
            480,       // max_time
        );

        // An identity that's [0xFF; 32] is maximally far from [0; 32]
        let far_identity = [0xFF; 32];
        let now = 1000000;

        // Should not be eligible at t=0
        assert!(!eligibility.is_eligible(&far_identity, now));

        // Should have a future eligibility time
        let when = eligibility.when_eligible(&far_identity, now);
        assert!(when.is_some());
        let eligible_time = when.unwrap();

        // At that time, should be eligible
        assert!(eligibility.is_eligible(&far_identity, eligible_time));

        // Just before, should not be eligible
        if eligible_time > now {
            assert!(!eligibility.is_eligible(&far_identity, eligible_time - 1));
        }
    }
}
