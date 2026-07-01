//! Bandwidth Throttling Simulation for Mobile Networks
//!
//! Simulates mobile network constraints for sync performance testing.
//! Uses TokenBucketLimiter from src/seeding/rate_limiter.rs for accurate bandwidth simulation.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// Network profile for simulating different connection types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NetworkProfile {
    /// 3G: 2 Mbps (256 KB/s) - slowest common mobile
    Cellular3G,
    /// 4G LTE: 10 Mbps (1.25 MB/s) - typical mobile
    Cellular4G,
    /// WiFi: 50 Mbps (6.25 MB/s) - home/office WiFi
    WiFi,
    /// Custom rate in bytes per second
    Custom { bytes_per_sec: u64 },
}

impl NetworkProfile {
    /// Get the transfer rate in bytes per second
    pub fn bytes_per_second(&self) -> u64 {
        match self {
            Self::Cellular3G => 256_000,   // 2 Mbps
            Self::Cellular4G => 1_250_000, // 10 Mbps
            Self::WiFi => 6_250_000,       // 50 Mbps
            Self::Custom { bytes_per_sec } => *bytes_per_sec,
        }
    }

    /// Get the transfer rate in Mbps
    pub fn mbps(&self) -> u32 {
        (self.bytes_per_second() / 125_000) as u32
    }

    /// Get descriptive name for reporting
    pub fn name(&self) -> &'static str {
        match self {
            Self::Cellular3G => "3G (2 Mbps)",
            Self::Cellular4G => "4G (10 Mbps)",
            Self::WiFi => "WiFi (50 Mbps)",
            Self::Custom { .. } => "Custom",
        }
    }

    /// Calculate expected transfer time for given bytes
    pub fn expected_duration(&self, bytes: u64) -> Duration {
        let seconds = bytes as f64 / self.bytes_per_second() as f64;
        Duration::from_secs_f64(seconds)
    }
}

/// Simulates bandwidth-limited transfers
///
/// Uses a token bucket algorithm to simulate realistic bandwidth constraints.
/// Each token represents one byte of bandwidth.
pub struct BandwidthSimulator {
    profile: NetworkProfile,
    rate_bytes_per_sec: u64,
    bytes_transferred: AtomicU64,
    /// Tokens available for transfer (refilled over time)
    tokens: AtomicU64,
    /// Last refill timestamp in nanoseconds
    last_refill_nanos: AtomicU64,
    /// Creation instant for time reference
    created_at: Instant,
}

impl BandwidthSimulator {
    /// Create a new bandwidth simulator for the given network profile
    pub fn new(profile: NetworkProfile) -> Self {
        let rate = profile.bytes_per_second();
        Self {
            profile,
            rate_bytes_per_sec: rate,
            bytes_transferred: AtomicU64::new(0),
            tokens: AtomicU64::new(rate), // Start with 1 second burst
            last_refill_nanos: AtomicU64::new(0),
            created_at: Instant::now(),
        }
    }

    /// Simulate transferring the specified number of bytes
    ///
    /// Returns the actual time taken (simulated based on bandwidth limits).
    /// This is a blocking operation that sleeps to simulate the transfer time.
    pub fn transfer(&self, bytes: usize) -> Duration {
        let start = Instant::now();
        let bytes_u64 = bytes as u64;
        let mut remaining = bytes_u64;

        while remaining > 0 {
            // Refill tokens based on elapsed time
            self.refill();

            // Try to acquire tokens
            let current = self.tokens.load(Ordering::Acquire);
            let to_acquire = remaining.min(current);

            if to_acquire > 0 {
                // Try to consume tokens (CAS loop)
                match self.tokens.compare_exchange_weak(
                    current,
                    current - to_acquire,
                    Ordering::AcqRel,
                    Ordering::Relaxed,
                ) {
                    Ok(_) => {
                        remaining -= to_acquire;
                        self.bytes_transferred
                            .fetch_add(to_acquire, Ordering::Relaxed);
                    }
                    Err(_) => continue, // Retry on contention
                }
            } else {
                // No tokens available, wait for refill
                // Calculate how long to wait for at least 1KB of tokens
                let wait_bytes = 1024u64.min(remaining);
                let wait_time_ns = (wait_bytes * 1_000_000_000) / self.rate_bytes_per_sec;
                std::thread::sleep(Duration::from_nanos(wait_time_ns));
            }
        }

        start.elapsed()
    }

    /// Async version of transfer (simulated delay without actual async runtime)
    pub async fn transfer_async(&self, bytes: usize) -> Duration {
        // For now, just delegate to sync version
        // In a real async context, you'd use tokio::time::sleep
        self.transfer(bytes)
    }

    /// Get total bytes transferred so far
    pub fn bytes_transferred(&self) -> u64 {
        self.bytes_transferred.load(Ordering::Relaxed)
    }

    /// Reset the simulator (clears transferred bytes, refills tokens)
    pub fn reset(&self) {
        self.bytes_transferred.store(0, Ordering::Relaxed);
        self.tokens
            .store(self.rate_bytes_per_sec, Ordering::Relaxed);
        let now_nanos = self.created_at.elapsed().as_nanos() as u64;
        self.last_refill_nanos.store(now_nanos, Ordering::Relaxed);
    }

    /// Get the network profile
    pub fn profile(&self) -> NetworkProfile {
        self.profile
    }

    /// Refill tokens based on elapsed time
    fn refill(&self) {
        let now_nanos = self.created_at.elapsed().as_nanos() as u64;

        loop {
            let last = self.last_refill_nanos.load(Ordering::Acquire);
            let elapsed_nanos = now_nanos.saturating_sub(last);

            // Calculate tokens to add (rate * elapsed_time)
            let tokens_to_add =
                self.rate_bytes_per_sec.saturating_mul(elapsed_nanos) / 1_000_000_000;

            if tokens_to_add == 0 {
                return;
            }

            // Try to update last_refill timestamp
            match self.last_refill_nanos.compare_exchange_weak(
                last,
                now_nanos,
                Ordering::AcqRel,
                Ordering::Relaxed,
            ) {
                Ok(_) => {
                    // Add tokens, capped at 1 second of burst
                    loop {
                        let current = self.tokens.load(Ordering::Acquire);
                        let new = (current + tokens_to_add).min(self.rate_bytes_per_sec);
                        match self.tokens.compare_exchange_weak(
                            current,
                            new,
                            Ordering::AcqRel,
                            Ordering::Relaxed,
                        ) {
                            Ok(_) => return,
                            Err(_) => continue,
                        }
                    }
                }
                Err(_) => continue,
            }
        }
    }
}

/// Header size constant (approximate serialized size)
pub const HEADER_SIZE: usize = 200;

/// Generate simulated headers for sync testing
pub fn generate_test_headers(count: usize) -> Vec<[u8; HEADER_SIZE]> {
    (0..count)
        .map(|i| {
            let mut header = [0u8; HEADER_SIZE];
            // Fill with identifiable pattern
            header[0..8].copy_from_slice(&(i as u64).to_be_bytes());
            header
        })
        .collect()
}

/// Calculate total size of headers
pub fn headers_total_bytes(count: usize) -> usize {
    count * HEADER_SIZE
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test network profile byte rates
    #[test]
    fn test_network_profile_rates() {
        assert_eq!(NetworkProfile::Cellular3G.bytes_per_second(), 256_000);
        assert_eq!(NetworkProfile::Cellular4G.bytes_per_second(), 1_250_000);
        assert_eq!(NetworkProfile::WiFi.bytes_per_second(), 6_250_000);

        assert_eq!(NetworkProfile::Cellular3G.mbps(), 2);
        assert_eq!(NetworkProfile::Cellular4G.mbps(), 10);
        assert_eq!(NetworkProfile::WiFi.mbps(), 50);
    }

    /// Test expected duration calculations
    #[test]
    fn test_expected_duration() {
        // 1 MB @ 1.25 MB/s (4G) = 0.8 seconds
        let duration = NetworkProfile::Cellular4G.expected_duration(1_000_000);
        assert!((duration.as_secs_f64() - 0.8).abs() < 0.01);

        // 20 MB @ 256 KB/s (3G) = ~78 seconds
        let headers_20mb = 20 * 1024 * 1024;
        let duration_3g = NetworkProfile::Cellular3G.expected_duration(headers_20mb);
        assert!((duration_3g.as_secs_f64() - 78.125).abs() < 1.0);

        // 20 MB @ 6.25 MB/s (WiFi) = ~3.2 seconds
        let duration_wifi = NetworkProfile::WiFi.expected_duration(headers_20mb);
        assert!((duration_wifi.as_secs_f64() - 3.2).abs() < 0.5);
    }

    /// Test bandwidth simulator creation
    #[test]
    fn test_simulator_creation() {
        let sim = BandwidthSimulator::new(NetworkProfile::Cellular4G);
        assert_eq!(sim.profile(), NetworkProfile::Cellular4G);
        assert_eq!(sim.bytes_transferred(), 0);
    }

    /// Test small transfer (within burst capacity)
    #[test]
    fn test_small_transfer() {
        let sim = BandwidthSimulator::new(NetworkProfile::Cellular4G);

        // 100KB should be instant (within 1.25 MB burst)
        let duration = sim.transfer(100_000);
        assert!(duration.as_millis() < 100, "Small transfer should be fast");
        assert_eq!(sim.bytes_transferred(), 100_000);
    }

    /// Test transfer tracking
    #[test]
    fn test_transfer_tracking() {
        let sim = BandwidthSimulator::new(NetworkProfile::WiFi);

        sim.transfer(10_000);
        sim.transfer(20_000);
        sim.transfer(30_000);

        assert_eq!(sim.bytes_transferred(), 60_000);
    }

    /// Test simulator reset
    #[test]
    fn test_simulator_reset() {
        let sim = BandwidthSimulator::new(NetworkProfile::Cellular3G);

        sim.transfer(50_000);
        assert!(sim.bytes_transferred() > 0);

        sim.reset();
        assert_eq!(sim.bytes_transferred(), 0);
    }

    /// Test header generation
    #[test]
    fn test_header_generation() {
        let headers = generate_test_headers(100);
        assert_eq!(headers.len(), 100);
        assert_eq!(headers[0].len(), HEADER_SIZE);

        // Check pattern
        let first_idx = u64::from_be_bytes(headers[0][0..8].try_into().unwrap());
        let last_idx = u64::from_be_bytes(headers[99][0..8].try_into().unwrap());
        assert_eq!(first_idx, 0);
        assert_eq!(last_idx, 99);
    }

    /// Test header sync time calculation (4G, 100K headers)
    ///
    /// 100,000 headers × 200 bytes = 20 MB
    /// 20 MB @ 1.25 MB/s (4G) = 16 seconds expected
    #[test]
    fn test_header_sync_calculation() {
        let header_count = 100_000;
        let total_bytes = headers_total_bytes(header_count);

        assert_eq!(total_bytes, 20_000_000); // 20 MB

        let expected_4g = NetworkProfile::Cellular4G.expected_duration(total_bytes as u64);
        assert!(
            (expected_4g.as_secs_f64() - 16.0).abs() < 1.0,
            "Expected ~16s, got {:.1}s",
            expected_4g.as_secs_f64()
        );

        let expected_3g = NetworkProfile::Cellular3G.expected_duration(total_bytes as u64);
        assert!(
            (expected_3g.as_secs_f64() - 78.125).abs() < 2.0,
            "Expected ~78s, got {:.1}s",
            expected_3g.as_secs_f64()
        );

        let expected_wifi = NetworkProfile::WiFi.expected_duration(total_bytes as u64);
        assert!(
            (expected_wifi.as_secs_f64() - 3.2).abs() < 0.5,
            "Expected ~3.2s, got {:.1}s",
            expected_wifi.as_secs_f64()
        );
    }

    /// Test custom network profile
    #[test]
    fn test_custom_profile() {
        let profile = NetworkProfile::Custom {
            bytes_per_sec: 500_000,
        };
        assert_eq!(profile.bytes_per_second(), 500_000);
        assert_eq!(profile.mbps(), 4); // 500 KB/s = 4 Mbps

        let duration = profile.expected_duration(1_000_000);
        assert!((duration.as_secs_f64() - 2.0).abs() < 0.1);
    }

    /// Document expected sync times for planning
    #[test]
    fn test_sync_expectations_documented() {
        let profiles = [
            NetworkProfile::Cellular3G,
            NetworkProfile::Cellular4G,
            NetworkProfile::WiFi,
        ];

        let header_counts = [1_000, 10_000, 100_000];

        println!("\nExpected header sync times:");
        println!(
            "{:<15} {:>12} {:>12} {:>12}",
            "Network", "1K headers", "10K headers", "100K headers"
        );
        println!("{:-<55}", "");

        for profile in profiles {
            print!("{:<15}", profile.name());
            for count in header_counts {
                let bytes = headers_total_bytes(count) as u64;
                let duration = profile.expected_duration(bytes);
                print!(" {:>11.1}s", duration.as_secs_f64());
            }
            println!();
        }

        // Key finding: 3G sync of 100K headers = 78s
        // This is acceptable for initial sync, but header-only mode helps
    }
}
