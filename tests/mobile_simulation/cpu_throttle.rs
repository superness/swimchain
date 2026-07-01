//! CPU Throttling Simulation for Mobile Devices
//!
//! Simulates mobile CPU constraints for PoW mining performance testing.
//! Uses ForkPoWConfig::mobile() for native mobile config (p=2 vs p=4 for desktop).

use std::time::{Duration, Instant};
use swimchain::crypto::action_pow::{compute_pow, ActionType, ForkPoWConfig, PoWChallenge};
use swimchain::crypto::sha256;

/// CPU profile for simulating different device capabilities
#[derive(Debug, Clone, Copy)]
pub enum CpuProfile {
    /// Desktop: Full parallelism (p=4)
    Desktop,
    /// Mobile native: Reduced parallelism for heat management (p=2)
    MobileNative,
    /// Throttled simulation: Adds artificial delay between mining attempts
    MobileThrottled { delay_ms: u64 },
}

impl CpuProfile {
    /// Get the PoW config for this profile
    pub fn pow_config(&self) -> ForkPoWConfig {
        match self {
            CpuProfile::Desktop => ForkPoWConfig::production(),
            CpuProfile::MobileNative => ForkPoWConfig::mobile(),
            CpuProfile::MobileThrottled { .. } => ForkPoWConfig::mobile(),
        }
    }

    /// Get descriptive name for reporting
    pub fn name(&self) -> &'static str {
        match self {
            CpuProfile::Desktop => "Desktop (p=4)",
            CpuProfile::MobileNative => "Mobile Native (p=2)",
            CpuProfile::MobileThrottled { .. } => "Mobile Throttled",
        }
    }
}

/// Metrics collected during mining
#[derive(Debug, Clone, Default)]
pub struct MiningMetrics {
    /// Number of hash attempts
    pub hash_count: u64,
    /// Total time in milliseconds
    pub total_time_ms: u64,
    /// Average time per hash in milliseconds
    pub avg_hash_time_ms: f64,
    /// Whether mining succeeded
    pub success: bool,
}

/// Throttled miner that simulates mobile device constraints
pub struct ThrottledMiner {
    config: ForkPoWConfig,
    profile: CpuProfile,
    metrics: MiningMetrics,
}

impl ThrottledMiner {
    /// Create a new throttled miner with the given profile
    pub fn new(profile: CpuProfile) -> Self {
        Self {
            config: profile.pow_config(),
            profile,
            metrics: MiningMetrics::default(),
        }
    }

    /// Mine a PoW solution for the given challenge
    ///
    /// Returns the solution and updates internal metrics.
    pub fn mine(
        &mut self,
        challenge: &PoWChallenge,
    ) -> Result<swimchain::crypto::action_pow::PoWSolution, swimchain::types::error::ActionPowError>
    {
        let start = Instant::now();
        let mut hash_count = 0u64;

        // For throttled mode, we use the callback version to add delays
        let result = match self.profile {
            CpuProfile::MobileThrottled { delay_ms } => {
                swimchain::crypto::action_pow::compute_pow_with_callback(
                    challenge,
                    &self.config,
                    |nonce| {
                        hash_count = nonce;
                        if delay_ms > 0 {
                            std::thread::sleep(Duration::from_millis(delay_ms));
                        }
                    },
                )
            }
            _ => {
                // For non-throttled modes, use regular compute_pow
                compute_pow(challenge, &self.config)
            }
        };

        let elapsed = start.elapsed();
        let total_ms = elapsed.as_millis() as u64;

        // Estimate hash count from nonce in solution (if successful)
        let final_hash_count = match &result {
            Ok(solution) => solution.nonce + 1,
            Err(_) => hash_count.max(1),
        };

        self.metrics = MiningMetrics {
            hash_count: final_hash_count,
            total_time_ms: total_ms,
            avg_hash_time_ms: if final_hash_count > 0 {
                total_ms as f64 / final_hash_count as f64
            } else {
                0.0
            },
            success: result.is_ok(),
        };

        result
    }

    /// Get the collected metrics
    pub fn metrics(&self) -> &MiningMetrics {
        &self.metrics
    }

    /// Get the CPU profile
    pub fn profile(&self) -> CpuProfile {
        self.profile
    }
}

/// Create a test challenge with given difficulty
pub fn create_test_challenge(action: ActionType, difficulty: u8) -> PoWChallenge {
    PoWChallenge::generate(
        action,
        b"test content for mobile simulation",
        &[42u8; 32], // test author
        difficulty,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test that mobile config has correct parameters (p=2 vs p=4)
    #[test]
    fn test_mobile_config_parameters() {
        let mobile = ForkPoWConfig::mobile();
        let desktop = ForkPoWConfig::production();

        // Both use same memory (64 MiB)
        assert_eq!(mobile.memory_kib, 65536);
        assert_eq!(desktop.memory_kib, 65536);

        // Both use same iterations
        assert_eq!(mobile.iterations, 3);
        assert_eq!(desktop.iterations, 3);

        // Mobile has reduced parallelism
        assert_eq!(mobile.parallelism, 2);
        assert_eq!(desktop.parallelism, 4);
    }

    /// Test CPU profile enum produces correct configs
    #[test]
    fn test_cpu_profile_configs() {
        let desktop = CpuProfile::Desktop.pow_config();
        assert_eq!(desktop.parallelism, 4);

        let mobile = CpuProfile::MobileNative.pow_config();
        assert_eq!(mobile.parallelism, 2);

        let throttled = CpuProfile::MobileThrottled { delay_ms: 10 }.pow_config();
        assert_eq!(throttled.parallelism, 2);
    }

    /// Test PoW at difficulty 4 (very fast, ~16 attempts expected)
    #[test]
    fn test_pow_difficulty_4() {
        let mut miner = ThrottledMiner::new(CpuProfile::MobileNative);
        let challenge = create_test_challenge(ActionType::Post, 4);

        let result = miner.mine(&challenge);
        assert!(result.is_ok(), "PoW at difficulty 4 should complete");

        let metrics = miner.metrics();
        assert!(metrics.success);
        assert!(
            metrics.hash_count <= 100,
            "Expected <100 attempts for difficulty 4, got {}",
            metrics.hash_count
        );
        println!(
            "Difficulty 4: {} hashes in {}ms (avg {:.2}ms/hash)",
            metrics.hash_count, metrics.total_time_ms, metrics.avg_hash_time_ms
        );
    }

    /// Test PoW at difficulty 8 (realistic mobile difficulty)
    ///
    /// Expected: ~256 attempts × ~100ms = ~26 seconds on mobile config
    /// Note: On test config this is much faster
    #[test]
    fn test_pow_difficulty_8_mobile() {
        // Use test config for speed, but this validates the flow works
        let config = ForkPoWConfig::test();
        let challenge = create_test_challenge(ActionType::Post, 8);

        let start = Instant::now();
        let result = compute_pow(&challenge, &config);
        let elapsed = start.elapsed();

        assert!(result.is_ok(), "PoW at difficulty 8 should complete");

        let solution = result.unwrap();
        println!(
            "Difficulty 8 (test config): {} attempts in {:?}",
            solution.nonce + 1,
            elapsed
        );

        // With test config (1 MiB, p=1, t=1), each hash is ~1ms
        // So difficulty 8 (256 expected attempts) should be <10 seconds
        assert!(
            elapsed < Duration::from_secs(10),
            "Difficulty 8 should complete quickly with test config"
        );
    }

    /// Test throttled miner with artificial delay
    #[test]
    fn test_throttled_miner_delay() {
        let mut miner = ThrottledMiner::new(CpuProfile::MobileThrottled { delay_ms: 1 });
        let challenge = create_test_challenge(ActionType::Post, 4);

        let result = miner.mine(&challenge);
        assert!(result.is_ok());

        let metrics = miner.metrics();
        assert!(metrics.success);
        // With delay, avg hash time should be measurable
        println!(
            "Throttled (1ms delay): {} hashes in {}ms",
            metrics.hash_count, metrics.total_time_ms
        );
    }

    /// Test that mining metrics are recorded correctly
    #[test]
    fn test_mining_metrics_recorded() {
        let mut miner = ThrottledMiner::new(CpuProfile::Desktop);
        let challenge = create_test_challenge(ActionType::Engage, 4);

        let result = miner.mine(&challenge);
        assert!(result.is_ok());

        let metrics = miner.metrics();
        assert!(metrics.hash_count > 0, "Hash count should be recorded");
        assert!(metrics.total_time_ms > 0, "Time should be recorded");
        assert!(
            metrics.avg_hash_time_ms > 0.0,
            "Avg time should be calculated"
        );
        assert!(metrics.success, "Success should be true");
    }

    /// Validate expected times for different difficulty levels
    ///
    /// This documents expected behavior based on SPEC_03 and benchmarks:
    /// - Difficulty 8: ~26 seconds on mobile (256 attempts × ~100ms)
    /// - Difficulty 10: ~102 seconds on mobile (1024 attempts × ~100ms)
    /// - Difficulty 12: ~410 seconds on mobile (4096 attempts × ~100ms)
    #[test]
    fn test_difficulty_expectations_documented() {
        // Mobile config: 64 MiB, t=3, p=2 → ~100-107ms per hash
        let hash_time_ms = 100.0; // Conservative estimate

        // Expected attempts = 2^difficulty (on average)
        let expectations = [(4, 16.0), (6, 64.0), (8, 256.0), (10, 1024.0), (12, 4096.0)];

        for (difficulty, expected_attempts) in expectations {
            let expected_time_s = (expected_attempts * hash_time_ms) / 1000.0;
            println!(
                "Difficulty {}: ~{:.0} attempts × {:.0}ms = ~{:.1}s expected",
                difficulty, expected_attempts, hash_time_ms, expected_time_s
            );
        }

        // Key finding: SPEC_03 difficulties (16-22) are infeasible on mobile
        // - Difficulty 16: ~6554s = ~109 minutes
        // - Difficulty 20: ~104857s = ~29 hours
        // Recommendation: Use difficulty 8-12 for mobile
    }
}
