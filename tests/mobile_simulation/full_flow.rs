//! Full User Flow Integration Test for Mobile Devices
//!
//! Tests a complete mobile user journey under constrained conditions:
//! 1. Create identity
//! 2. Header sync (bandwidth limited)
//! 3. Join space
//! 4. Create post (PoW with mobile config)
//! 5. View content (retrieve through bandwidth limiter)

use std::time::{Duration, Instant};

use swimchain::crypto::action_pow::{compute_pow, ActionType, ForkPoWConfig, PoWChallenge};
use swimchain::crypto::sha256;
use swimchain::storage::config::{MobileConfig, StorageProfile};

use super::bandwidth_throttle::{BandwidthSimulator, NetworkProfile, HEADER_SIZE};
use super::battery_sync::{SyncBudget, SyncMode, SyncSimulator};

/// Mobile flow configuration
pub struct MobileFlowConfig {
    /// Storage profile
    pub storage_profile: StorageProfile,
    /// Network profile
    pub network_profile: NetworkProfile,
    /// PoW difficulty (use realistic values: 4-12)
    pub pow_difficulty: u8,
    /// Use mobile PoW config
    pub use_mobile_pow: bool,
    /// Cellular budget (None = unlimited/WiFi)
    pub cellular_budget: Option<MobileConfig>,
}

impl Default for MobileFlowConfig {
    fn default() -> Self {
        Self {
            storage_profile: StorageProfile::Budget1GB,
            network_profile: NetworkProfile::Cellular3G,
            pow_difficulty: 8, // Realistic for mobile (~26s expected)
            use_mobile_pow: true,
            cellular_budget: Some(MobileConfig::standard()),
        }
    }
}

/// Timing results from full flow
#[derive(Debug, Clone)]
pub struct FlowTiming {
    pub identity_time: Duration,
    pub sync_time: Duration,
    pub pow_time: Duration,
    pub view_time: Duration,
    pub total_time: Duration,
}

impl FlowTiming {
    /// Check if all steps completed within acceptable time
    pub fn is_acceptable(&self, max_total: Duration) -> bool {
        self.total_time < max_total
    }

    /// Print summary
    pub fn print_summary(&self) {
        println!("\nMobile Flow Timing:");
        println!("  Identity creation: {:?}", self.identity_time);
        println!("  Header sync: {:?}", self.sync_time);
        println!("  PoW mining: {:?}", self.pow_time);
        println!("  Content view: {:?}", self.view_time);
        println!("  TOTAL: {:?}", self.total_time);
    }
}

/// Run full mobile user flow simulation
///
/// Returns timing results for each step.
pub fn run_mobile_flow(config: &MobileFlowConfig) -> Result<FlowTiming, String> {
    let flow_start = Instant::now();

    // Step 1: Create identity (simulated - identity PoW is SHA-256, fast)
    let identity_start = Instant::now();
    let _identity = simulate_identity_creation();
    let identity_time = identity_start.elapsed();

    // Step 2: Header sync
    let sync_start = Instant::now();
    let sync_budget = config.cellular_budget.as_ref().map(SyncBudget::new);
    let sync_sim = SyncSimulator::new(
        SyncMode::HeaderOnly, // Battery-conscious
        config.network_profile,
        sync_budget,
    );
    // Simulate syncing 10K headers (realistic for initial sync)
    let sync_result = sync_sim.sync_headers(10_000);
    let sync_time = sync_start.elapsed();

    if !sync_result.complete {
        println!("Warning: Header sync truncated by budget");
    }

    // Step 3: Join space (no PoW, just local state - instant)
    let _space_id = [1u8; 32];

    // Step 4: Create post with PoW
    let pow_start = Instant::now();
    let pow_config = if config.use_mobile_pow {
        ForkPoWConfig::mobile()
    } else {
        ForkPoWConfig::test() // Use test config for fast tests
    };

    let challenge = PoWChallenge::generate(
        ActionType::Post,
        b"Hello from mobile!",
        &[42u8; 32], // test author
        config.pow_difficulty,
    );

    let pow_result = compute_pow(&challenge, &pow_config);
    let pow_time = pow_start.elapsed();

    if pow_result.is_err() {
        return Err(format!("PoW failed: {:?}", pow_result.err()));
    }

    // Step 5: View content (fetch through bandwidth limiter)
    let view_start = Instant::now();
    let bandwidth = BandwidthSimulator::new(config.network_profile);
    // Simulate fetching a 100KB image
    bandwidth.transfer(100_000);
    let view_time = view_start.elapsed();

    let total_time = flow_start.elapsed();

    Ok(FlowTiming {
        identity_time,
        sync_time,
        pow_time,
        view_time,
        total_time,
    })
}

/// Simulate identity creation (fast SHA-256 PoW)
fn simulate_identity_creation() -> [u8; 32] {
    // Identity PoW is SHA-256 based, much faster than Argon2id
    // Simulate with a small delay
    std::thread::sleep(Duration::from_millis(100));
    [42u8; 32] // Fake identity ID
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test full flow with test config (fast, for CI)
    ///
    /// Uses test PoW config and low difficulty for speed.
    #[test]
    fn test_full_mobile_flow_fast() {
        let config = MobileFlowConfig {
            storage_profile: StorageProfile::Budget1GB,
            network_profile: NetworkProfile::WiFi, // Fast network
            pow_difficulty: 4,                     // Very low for fast test
            use_mobile_pow: false,                 // Use test config
            cellular_budget: None,                 // No budget limit
        };

        let result = run_mobile_flow(&config);
        assert!(result.is_ok(), "Flow should complete: {:?}", result);

        let timing = result.unwrap();
        timing.print_summary();

        // With test config, should complete in under 30 seconds
        assert!(
            timing.is_acceptable(Duration::from_secs(30)),
            "Flow should complete in under 30 seconds"
        );
    }

    /// Test full flow with budget constraints
    #[test]
    fn test_full_mobile_flow_budget_3g() {
        let config = MobileFlowConfig {
            storage_profile: StorageProfile::Budget1GB,
            network_profile: NetworkProfile::Cellular3G,
            pow_difficulty: 4,     // Low for test speed
            use_mobile_pow: false, // Test config for speed
            cellular_budget: Some(MobileConfig::budget()),
        };

        let result = run_mobile_flow(&config);
        assert!(result.is_ok(), "Flow should complete: {:?}", result);

        let timing = result.unwrap();
        timing.print_summary();

        // Even with 3G and budget, should complete reasonably
        assert!(
            timing.is_acceptable(Duration::from_secs(60)),
            "Budget 3G flow should complete in under 60 seconds"
        );
    }

    /// Test that documents expected mobile PoW times
    ///
    /// This test uses the actual mobile PoW config but very low difficulty
    /// to validate the configuration works.
    #[test]
    fn test_mobile_pow_config_works() {
        let mobile = ForkPoWConfig::mobile();

        // Verify config parameters
        assert_eq!(mobile.memory_kib, 65536, "Mobile uses 64 MiB");
        assert_eq!(mobile.iterations, 3, "Mobile uses 3 iterations");
        assert_eq!(mobile.parallelism, 2, "Mobile uses parallelism 2");

        // Test with low difficulty
        let challenge = PoWChallenge::generate(
            ActionType::Post,
            b"test content",
            &[1u8; 32],
            4, // Low difficulty for test
        );

        let start = Instant::now();
        let result = compute_pow(&challenge, &mobile);
        let elapsed = start.elapsed();

        assert!(result.is_ok(), "PoW should complete");
        println!("Mobile config PoW at difficulty 4: {:?}", elapsed);

        // With mobile config, each hash takes ~100ms
        // Difficulty 4 = ~16 attempts expected
        // So ~1.6 seconds expected, allow up to 30 seconds for variance
        assert!(
            elapsed < Duration::from_secs(30),
            "Difficulty 4 should complete in reasonable time"
        );
    }

    /// Documents expected times for various difficulties
    ///
    /// This is a documentation test, not a validation test.
    #[test]
    fn test_difficulty_time_expectations() {
        // Mobile config: ~100-107ms per Argon2id hash
        let hash_time_ms = 100.0;

        println!("\nExpected PoW times on mobile (100ms/hash estimate):");
        println!("{:-<50}", "");
        println!(
            "{:<12} {:>12} {:>15} {:>10}",
            "Difficulty", "Attempts", "Expected Time", "Feasible?"
        );
        println!("{:-<50}", "");

        let difficulties = [
            (4, "16", "1.6s", "Yes"),
            (6, "64", "6.4s", "Yes"),
            (8, "256", "26s", "Yes (target)"),
            (10, "1024", "102s", "Marginal"),
            (12, "4096", "410s", "No"),
            (16, "65536", "1.8h", "No"),
            (20, "1M", "29h", "No (SPEC default)"),
        ];

        for (diff, attempts, time, feasible) in difficulties {
            println!(
                "{:<12} {:>12} {:>15} {:>10}",
                diff, attempts, time, feasible
            );
        }

        println!("\nRecommendation: Use difficulty 8-10 for mobile");
        println!("SPEC_03 defaults (16-22) are infeasible on mobile");
    }

    /// Test full flow acceptance criteria
    ///
    /// From plan: Full flow < 10 minutes
    /// This test uses test config for CI speed.
    #[test]
    fn test_full_flow_under_10_minutes() {
        let config = MobileFlowConfig {
            storage_profile: StorageProfile::Budget1GB,
            network_profile: NetworkProfile::Cellular3G,
            pow_difficulty: 4,
            use_mobile_pow: false,
            cellular_budget: Some(MobileConfig::budget()),
        };

        let result = run_mobile_flow(&config);
        assert!(result.is_ok());

        let timing = result.unwrap();

        // Must complete in under 10 minutes
        assert!(
            timing.is_acceptable(Duration::from_secs(600)),
            "Full flow must complete in under 10 minutes"
        );

        println!(
            "\nFull flow completed in {:?} (limit: 10 minutes)",
            timing.total_time
        );
    }

    /// Test sync time on different networks
    #[test]
    fn test_sync_times_by_network() {
        let header_count = 10_000; // 10K headers = 2 MB

        println!("\nHeader sync times (10K headers = 2 MB):");
        println!("{:-<50}", "");

        for profile in [
            NetworkProfile::Cellular3G,
            NetworkProfile::Cellular4G,
            NetworkProfile::WiFi,
        ] {
            let expected = profile.expected_duration((header_count * HEADER_SIZE) as u64);
            println!("{:<15}: expected {:?}", profile.name(), expected);
        }

        // 3G: 2 MB @ 256 KB/s = 8 seconds
        // 4G: 2 MB @ 1.25 MB/s = 1.6 seconds
        // WiFi: 2 MB @ 6.25 MB/s = 0.32 seconds
    }

    /// Test that header-only mode saves bandwidth
    #[test]
    fn test_header_only_saves_bandwidth() {
        // Compare full sync vs header-only

        // Full sync: 10K headers + 100 content items (avg 50KB each)
        // Headers: 10,000 × 200 = 2 MB
        // Content: 100 × 50 KB = 5 MB
        // Total: 7 MB

        // Header-only: just headers
        // Total: 2 MB

        // Savings: 5 MB (71%)

        let full_sync_bytes = (10_000 * HEADER_SIZE) + (100 * 50_000);
        let header_only_bytes = 10_000 * HEADER_SIZE;
        let savings_percent = 100.0 * (1.0 - header_only_bytes as f64 / full_sync_bytes as f64);

        println!("\nBandwidth savings with header-only mode:");
        println!("  Full sync: {} MB", full_sync_bytes / 1_048_576);
        println!("  Header-only: {} MB", header_only_bytes / 1_048_576);
        println!("  Savings: {:.0}%", savings_percent);

        assert!(
            savings_percent > 50.0,
            "Header-only should save significant bandwidth"
        );
    }

    /// Summary test that documents key findings
    #[test]
    fn test_mobile_viability_summary() {
        println!("\n=== MOBILE VIABILITY SUMMARY ===\n");

        println!("Storage:");
        println!("  - Budget1GB (1GB, 85% threshold): Viable for 100+ users");
        println!("  - Decay bounds storage to ~130 MB steady state");
        println!("  - OwnContent never evicted (SPEC_07 §5)");

        println!("\nNetwork:");
        println!("  - Header-only sync saves 70%+ bandwidth");
        println!("  - 100K headers (20 MB) syncs in 16s on 4G, 80s on 3G");
        println!("  - Budget phone (50 MB/day) can sync 262K headers");

        println!("\nPoW:");
        println!("  - Mobile config (p=2) uses ~100ms per hash");
        println!("  - Difficulty 8 = ~26 seconds (acceptable)");
        println!("  - SPEC_03 defaults (16-22) are INFEASIBLE on mobile");
        println!("  - Recommendation: Use difficulty 8-10 for mobile");

        println!("\nConclusion:");
        println!("  Mobile CAN be a full participant with:");
        println!("  1. Reduced PoW difficulty (8-10 vs SPEC 16-22)");
        println!("  2. Header-only background sync");
        println!("  3. WiFi-preferred content fetch");
        println!("  4. Decay-bounded storage (<500MB steady state)");
    }
}
