//! Space health query handler
//!
//! Handles SPACE_HEALTH_QUERY messages and generates SPACE_HEALTH_RESPONSE.

use std::sync::Arc;

use crate::network::messages::{
    SpaceContributorPayload, SpaceHealthQueryPayload, SpaceHealthResponsePayload,
};

use super::error::SpaceHealthError;
use super::manager::SpaceHealthManager;

/// Handles SPACE_HEALTH_QUERY messages.
///
/// Receives queries for space health and returns appropriate responses.
pub struct SpaceHealthQueryHandler {
    manager: Arc<SpaceHealthManager>,
}

impl SpaceHealthQueryHandler {
    /// Create a new handler.
    pub fn new(manager: Arc<SpaceHealthManager>) -> Self {
        Self { manager }
    }

    /// Handle a space health query.
    ///
    /// # Arguments
    /// * `query` - The query payload
    ///
    /// # Returns
    /// Response payload with space health data, or error if query fails.
    pub fn handle(
        &self,
        query: &SpaceHealthQueryPayload,
    ) -> Result<SpaceHealthResponsePayload, SpaceHealthError> {
        let health = self.manager.get_health(&query.space_id)?;

        Ok(SpaceHealthResponsePayload {
            space_id: health.space_id,
            active_swimmers: health.active_swimmers,
            last_sync_age_secs: health.last_sync_age.as_secs(),
            posts_at_risk: health.posts_at_risk,
            health_score: health.health_score,
            contributors: health
                .top_contributors
                .into_iter()
                .map(|c| SpaceContributorPayload {
                    identity: c.identity,
                    bandwidth_served_bytes: c.bandwidth_served_bytes,
                    uptime_ratio: c.uptime_ratio,
                    contribution_score: c.contribution_score,
                })
                .collect(),
        })
    }

    /// Handle a space health query from raw bytes.
    ///
    /// # Arguments
    /// * `bytes` - Raw query payload bytes
    ///
    /// # Returns
    /// Response payload bytes, or error if query fails.
    pub fn handle_bytes(&self, bytes: &[u8]) -> Result<Vec<u8>, SpaceHealthError> {
        let query = SpaceHealthQueryPayload::from_bytes(bytes)
            .ok_or_else(|| SpaceHealthError::InvalidSpaceId("invalid query payload".to_string()))?;

        let response = self.handle(&query)?;
        Ok(response.to_bytes())
    }

    /// Get the space health manager reference.
    pub fn manager(&self) -> &Arc<SpaceHealthManager> {
        &self.manager
    }
}

#[cfg(test)]
mod tests {
    use crate::network::messages::SpaceHealthQueryPayload;

    #[test]
    fn test_query_payload_size() {
        assert_eq!(SpaceHealthQueryPayload::SIZE, 16);
    }

    // Integration tests require SpaceHealthManager setup with dependencies.
    // The handler logic is straightforward - it delegates to manager and converts types.
}
