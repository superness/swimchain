//! Space health data types
//!
//! Core types for the space health system per SPEC_09 Section 6.1.

use std::time::Duration;

// === Linear Chain Warning Types ===

/// Warning for linear chain detection in a space
///
/// Represents a flagged identity within a space's sponsorship tree.
/// Used to track and display linear chain warnings in space health dashboards.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LinearChainWarning {
    /// Flagged identity (32-byte public key)
    pub identity: [u8; 32],
    /// Linearity score at time of flagging (scaled by 1000 for integer storage)
    pub linearity_score_scaled: u16,
    /// Subtree depth at time of flagging
    pub depth: u8,
    /// Review status: 0=Pending, 1=Cleared, 2=Confirmed
    pub status: u8,
}

impl LinearChainWarning {
    /// Create from raw values
    pub fn new(identity: [u8; 32], linearity_score: f32, depth: u8, status: u8) -> Self {
        Self {
            identity,
            linearity_score_scaled: (linearity_score * 1000.0).min(65535.0) as u16,
            depth,
            status,
        }
    }

    /// Get linearity score as float
    #[must_use]
    pub fn linearity_score(&self) -> f32 {
        self.linearity_score_scaled as f32 / 1000.0
    }

    /// Check if this warning is pending review
    #[must_use]
    pub fn is_pending(&self) -> bool {
        self.status == 0
    }

    /// Check if this warning was confirmed as suspicious
    #[must_use]
    pub fn is_confirmed(&self) -> bool {
        self.status == 2
    }

    /// Check if this warning was cleared (legitimate)
    #[must_use]
    pub fn is_cleared(&self) -> bool {
        self.status == 1
    }
}

/// Space-level health indicators per SPEC_09 Section 6.1.
///
/// Tracks the health status of a space including active participants,
/// content at risk, top contributors, and an overall health score.
#[derive(Clone, Debug)]
pub struct SpaceHealth {
    /// Space identifier (16 bytes)
    pub space_id: [u8; 16],

    /// Number of identities with Level >= Regular and activity in last 7 days
    pub active_swimmers: u32,

    /// Time since any node in space completed a sync
    pub last_sync_age: Duration,

    /// Number of posts with 6.25% <= survival_probability < 25%
    pub posts_at_risk: u32,

    /// Top N contributors this period, ordered by contribution_score DESC
    pub top_contributors: Vec<SpaceContributor>,

    /// Health score 0-100, computed from 4 components:
    /// - Swimmer score (30%): active_swimmers / 10 * 30, capped at 30
    /// - Risk score (30%): max(0, 30 - posts_at_risk), capped at 30
    /// - Sync score (20%): 20 if last_sync < 5 minutes, else 0
    /// - Contribution score (20%): monthly_bandwidth_gb / 100 * 20, capped at 20
    pub health_score: u8,

    /// Linear chain warnings for this space
    ///
    /// Contains flagged identities within this space's sponsorship tree.
    /// Each warning reduces the health score by 2 points (up to 10 points max).
    pub linear_chain_warnings: Vec<LinearChainWarning>,
}

impl SpaceHealth {
    /// Create a new SpaceHealth with default/empty values
    pub fn new(space_id: [u8; 16]) -> Self {
        Self {
            space_id,
            active_swimmers: 0,
            last_sync_age: Duration::from_secs(0),
            posts_at_risk: 0,
            top_contributors: Vec::new(),
            health_score: 30, // Default score (only risk score if empty space)
            linear_chain_warnings: Vec::new(),
        }
    }

    /// Count of linear chain warnings
    #[must_use]
    pub fn linear_chain_warning_count(&self) -> usize {
        self.linear_chain_warnings.len()
    }

    /// Count of pending linear chain warnings (unreviewed)
    #[must_use]
    pub fn pending_warning_count(&self) -> usize {
        self.linear_chain_warnings.iter().filter(|w| w.is_pending()).count()
    }

    /// Count of confirmed linear chain warnings (verified suspicious)
    #[must_use]
    pub fn confirmed_warning_count(&self) -> usize {
        self.linear_chain_warnings.iter().filter(|w| w.is_confirmed()).count()
    }
}

impl Default for SpaceHealth {
    fn default() -> Self {
        Self::new([0u8; 16])
    }
}

/// Per-space contributor statistics.
///
/// Tracks the contribution of a single identity to a specific space.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpaceContributor {
    /// Ed25519 public key (32 bytes)
    pub identity: [u8; 32],

    /// Bytes served for this space in current period
    pub bandwidth_served_bytes: u64,

    /// Uptime ratio 0-10000 (representing 0.00% - 100.00%)
    pub uptime_ratio: u16,

    /// Computed contribution score: bandwidth_gb * 100 + content_count / 100
    pub contribution_score: u64,
}

impl SpaceContributor {
    /// Create a new SpaceContributor
    pub fn new(identity: [u8; 32]) -> Self {
        Self {
            identity,
            bandwidth_served_bytes: 0,
            uptime_ratio: 0,
            contribution_score: 0,
        }
    }

    /// Wire format size: 32 (identity) + 8 (bandwidth) + 2 (uptime) + 8 (score) = 50 bytes
    pub const WIRE_SIZE: usize = 50;
}

impl Default for SpaceContributor {
    fn default() -> Self {
        Self::new([0u8; 32])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_space_health_new() {
        let space_id = [1u8; 16];
        let health = SpaceHealth::new(space_id);

        assert_eq!(health.space_id, space_id);
        assert_eq!(health.active_swimmers, 0);
        assert_eq!(health.last_sync_age, Duration::from_secs(0));
        assert_eq!(health.posts_at_risk, 0);
        assert!(health.top_contributors.is_empty());
        assert_eq!(health.health_score, 30); // Default risk score only
        assert!(health.linear_chain_warnings.is_empty());
    }

    #[test]
    fn test_space_health_default() {
        let health = SpaceHealth::default();
        assert_eq!(health.space_id, [0u8; 16]);
        assert_eq!(health.health_score, 30);
    }

    #[test]
    fn test_space_contributor_new() {
        let identity = [42u8; 32];
        let contributor = SpaceContributor::new(identity);

        assert_eq!(contributor.identity, identity);
        assert_eq!(contributor.bandwidth_served_bytes, 0);
        assert_eq!(contributor.uptime_ratio, 0);
        assert_eq!(contributor.contribution_score, 0);
    }

    #[test]
    fn test_space_contributor_wire_size() {
        // 32 bytes identity + 8 bytes bandwidth + 2 bytes uptime + 8 bytes score = 50 bytes
        assert_eq!(SpaceContributor::WIRE_SIZE, 50);
    }

    #[test]
    fn test_space_contributor_default() {
        let contributor = SpaceContributor::default();
        assert_eq!(contributor.identity, [0u8; 32]);
    }

    #[test]
    fn test_space_contributor_equality() {
        let c1 = SpaceContributor {
            identity: [1u8; 32],
            bandwidth_served_bytes: 1000,
            uptime_ratio: 9500,
            contribution_score: 100,
        };
        let c2 = c1.clone();
        assert_eq!(c1, c2);

        let c3 = SpaceContributor {
            identity: [2u8; 32],
            ..c1.clone()
        };
        assert_ne!(c1, c3);
    }

    // === Linear Chain Warning Tests ===

    #[test]
    fn test_linear_chain_warning_new() {
        let warning = LinearChainWarning::new([42u8; 32], 2.5, 5, 0);

        assert_eq!(warning.identity, [42u8; 32]);
        assert_eq!(warning.depth, 5);
        assert_eq!(warning.status, 0);
        assert!(warning.is_pending());
    }

    #[test]
    fn test_linear_chain_warning_linearity_score_conversion() {
        let warning = LinearChainWarning::new([1u8; 32], 2.5, 5, 0);
        assert!((warning.linearity_score() - 2.5).abs() < 0.01);
    }

    #[test]
    fn test_linear_chain_warning_status_helpers() {
        let pending = LinearChainWarning::new([1u8; 32], 1.0, 5, 0);
        assert!(pending.is_pending());
        assert!(!pending.is_cleared());
        assert!(!pending.is_confirmed());

        let cleared = LinearChainWarning::new([1u8; 32], 1.0, 5, 1);
        assert!(!cleared.is_pending());
        assert!(cleared.is_cleared());
        assert!(!cleared.is_confirmed());

        let confirmed = LinearChainWarning::new([1u8; 32], 1.0, 5, 2);
        assert!(!confirmed.is_pending());
        assert!(!confirmed.is_cleared());
        assert!(confirmed.is_confirmed());
    }

    #[test]
    fn test_space_health_warning_counts() {
        let mut health = SpaceHealth::new([1u8; 16]);

        // Add warnings with different statuses
        health.linear_chain_warnings.push(LinearChainWarning::new([1u8; 32], 1.0, 5, 0)); // pending
        health.linear_chain_warnings.push(LinearChainWarning::new([2u8; 32], 1.0, 5, 0)); // pending
        health.linear_chain_warnings.push(LinearChainWarning::new([3u8; 32], 1.0, 5, 1)); // cleared
        health.linear_chain_warnings.push(LinearChainWarning::new([4u8; 32], 1.0, 5, 2)); // confirmed

        assert_eq!(health.linear_chain_warning_count(), 4);
        assert_eq!(health.pending_warning_count(), 2);
        assert_eq!(health.confirmed_warning_count(), 1);
    }
}
