//! Extended peer entry with metadata (SPEC_06 §4.1)
//!
//! PeerEntry extends WireAddr with connection tracking and scoring
//! information for the persistent peer cache.

use crate::network::messages::WireAddr;
use crate::types::constants::{PEER_FAILURE_PENALTY, PEER_INITIAL_SCORE, PEER_SUCCESS_BONUS};
use crate::types::error::SerializeError;
use crate::types::serialize::{ByteReader, ByteWriter, Deserialize, Serialize};

/// Extended peer entry with metadata (95 bytes serialized)
///
/// Wire format:
/// - wire_addr: 75 bytes (transport + address + port + services + last_seen)
/// - last_success: 8 bytes (u64 little-endian, UNIX timestamp)
/// - failures: 2 bytes (u16 little-endian)
/// - score: 2 bytes (i16 little-endian)
/// - first_seen: 8 bytes (u64 little-endian, UNIX timestamp)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeerEntry {
    /// Wire address (75 bytes)
    pub wire_addr: WireAddr,
    /// Last successful connection (UNIX timestamp, 0 if never connected)
    pub last_success: u64,
    /// Consecutive failure count
    pub failures: u16,
    /// Reputation score (-1000 to +1000)
    pub score: i16,
    /// When first discovered (UNIX timestamp)
    pub first_seen: u64,
}

impl PeerEntry {
    /// Serialized size in bytes
    pub const SIZE: usize = 95; // 75 + 8 + 2 + 2 + 8

    /// Create a new PeerEntry from a WireAddr with initial values
    #[must_use]
    pub fn new(wire_addr: WireAddr, now: u64) -> Self {
        Self {
            wire_addr,
            last_success: 0,
            failures: 0,
            score: PEER_INITIAL_SCORE,
            first_seen: now,
        }
    }

    /// Record a successful connection
    ///
    /// Resets failure count, updates last_success, and increases score.
    pub fn record_success(&mut self, now: u64) {
        self.last_success = now;
        self.failures = 0;
        self.score = self.score.saturating_add(PEER_SUCCESS_BONUS).min(1000);
    }

    /// Record a failed connection attempt
    ///
    /// Increments failure count and decreases score.
    pub fn record_failure(&mut self) {
        self.failures = self.failures.saturating_add(1);
        self.score = self.score.saturating_sub(PEER_FAILURE_PENALTY).max(-1000);
    }

    /// Check if peer should be banned based on score
    #[must_use]
    pub fn should_ban(&self, threshold: i16) -> bool {
        self.score < threshold
    }

    /// Check if peer has never successfully connected
    #[must_use]
    pub fn never_connected(&self) -> bool {
        self.last_success == 0
    }

    /// Get age since first seen in seconds
    #[must_use]
    pub fn age_secs(&self, now: u64) -> u64 {
        now.saturating_sub(self.first_seen)
    }
}

impl Serialize for PeerEntry {
    fn to_bytes(&self) -> Vec<u8> {
        let mut w = ByteWriter::with_capacity(Self::SIZE);
        // WireAddr (75 bytes)
        w.write_u8(self.wire_addr.transport);
        w.write_bytes64(&self.wire_addr.address);
        w.write_u16_le(self.wire_addr.port);
        w.write_u32_le(self.wire_addr.services);
        w.write_u32_le(self.wire_addr.last_seen);
        // Extension fields
        w.write_u64_le(self.last_success);
        w.write_u16_le(self.failures);
        w.write_i16_le(self.score);
        w.write_u64_le(self.first_seen);
        w.finish()
    }
}

impl Deserialize for PeerEntry {
    fn from_bytes(bytes: &[u8]) -> Result<Self, SerializeError> {
        if bytes.len() < Self::SIZE {
            return Err(SerializeError::InvalidLength {
                expected: Self::SIZE,
                actual: bytes.len(),
            });
        }
        let mut r = ByteReader::new(bytes);
        // WireAddr
        let transport = r.read_u8()?;
        let address = r.read_bytes64()?;
        let port = r.read_u16_le()?;
        let services = r.read_u32_le()?;
        let last_seen = r.read_u32_le()?;
        // Extension fields
        let last_success = r.read_u64_le()?;
        let failures = r.read_u16_le()?;
        let score = r.read_i16_le()?;
        let first_seen = r.read_u64_le()?;

        Ok(Self {
            wire_addr: WireAddr {
                transport,
                address,
                port,
                services,
                last_seen,
            },
            last_success,
            failures,
            score,
            first_seen,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_wire_addr() -> WireAddr {
        let mut address = [0u8; 64];
        address[0] = 127;
        address[1] = 0;
        address[2] = 0;
        address[3] = 1;
        WireAddr {
            transport: 0x01,
            address,
            port: 9735,
            services: 0x01,
            last_seen: 1700000000,
        }
    }

    #[test]
    fn test_peer_entry_size() {
        let entry = PeerEntry::new(make_wire_addr(), 1700000000);
        let bytes = entry.to_bytes();
        assert_eq!(bytes.len(), PeerEntry::SIZE);
        assert_eq!(bytes.len(), 95);
    }

    #[test]
    fn test_peer_entry_roundtrip() {
        let entry = PeerEntry {
            wire_addr: make_wire_addr(),
            last_success: 1700000100,
            failures: 5,
            score: 75,
            first_seen: 1700000000,
        };
        let bytes = entry.to_bytes();
        let recovered = PeerEntry::from_bytes(&bytes).unwrap();
        assert_eq!(entry, recovered);
    }

    #[test]
    fn test_peer_entry_negative_score_roundtrip() {
        let entry = PeerEntry {
            wire_addr: make_wire_addr(),
            last_success: 0,
            failures: 10,
            score: -500,
            first_seen: 1700000000,
        };
        let bytes = entry.to_bytes();
        let recovered = PeerEntry::from_bytes(&bytes).unwrap();
        assert_eq!(entry.score, recovered.score);
        assert_eq!(entry, recovered);
    }

    #[test]
    fn test_record_success() {
        let mut entry = PeerEntry::new(make_wire_addr(), 1700000000);
        let initial_score = entry.score;
        entry.record_failure(); // Add some failures
        entry.record_failure();
        assert!(entry.failures > 0);

        entry.record_success(1700000100);
        assert_eq!(entry.last_success, 1700000100);
        assert_eq!(entry.failures, 0);
        // Score should be initial + bonus - 2*penalty + bonus = 100 + 10 - 40 + 10 = 80
        // Wait, record_success resets after failures, so:
        // Start: 100, -20, -20 = 60, then +10 = 70
        assert_eq!(
            entry.score,
            initial_score - 2 * PEER_FAILURE_PENALTY + PEER_SUCCESS_BONUS
        );
    }

    #[test]
    fn test_record_failure() {
        let mut entry = PeerEntry::new(make_wire_addr(), 1700000000);
        let initial_score = entry.score;

        for i in 1..=5 {
            entry.record_failure();
            assert_eq!(entry.failures, i);
        }

        assert_eq!(entry.score, initial_score - 5 * PEER_FAILURE_PENALTY);
    }

    #[test]
    fn test_score_clamps() {
        let mut entry = PeerEntry::new(make_wire_addr(), 1700000000);
        entry.score = 990;

        // Should clamp to 1000
        for _ in 0..10 {
            entry.record_success(1700000000);
        }
        assert_eq!(entry.score, 1000);

        // Now test negative clamping
        entry.score = -990;
        for _ in 0..10 {
            entry.record_failure();
        }
        assert_eq!(entry.score, -1000);
    }

    #[test]
    fn test_should_ban() {
        let mut entry = PeerEntry::new(make_wire_addr(), 1700000000);
        entry.score = -499;
        assert!(!entry.should_ban(-500));

        entry.score = -500;
        assert!(!entry.should_ban(-500)); // Equal is not less than

        entry.score = -501;
        assert!(entry.should_ban(-500));
    }

    #[test]
    fn test_never_connected() {
        let entry = PeerEntry::new(make_wire_addr(), 1700000000);
        assert!(entry.never_connected());

        let mut entry2 = entry.clone();
        entry2.record_success(1700000100);
        assert!(!entry2.never_connected());
    }

    #[test]
    fn test_age_secs() {
        let entry = PeerEntry::new(make_wire_addr(), 1700000000);
        assert_eq!(entry.age_secs(1700000100), 100);
        assert_eq!(entry.age_secs(1700000000), 0);
        // Should not underflow
        assert_eq!(entry.age_secs(1699999900), 0);
    }

    #[test]
    fn test_from_bytes_too_short() {
        let short_bytes = [0u8; 50];
        assert!(PeerEntry::from_bytes(&short_bytes).is_err());
    }
}
