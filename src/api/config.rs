//! API configuration
//!
//! Configuration options for the API layer.

/// Configuration for the API client
#[derive(Debug, Clone)]
pub struct ApiConfig {
    /// Event buffer size for broadcast channel (default: 100)
    pub event_buffer_size: usize,
    /// Query timeout in milliseconds (default: 5000)
    pub query_timeout_ms: u64,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            event_buffer_size: 100,
            query_timeout_ms: 5000,
        }
    }
}

impl ApiConfig {
    /// Create a new config with custom event buffer size
    #[must_use]
    pub fn with_buffer_size(mut self, size: usize) -> Self {
        self.event_buffer_size = size;
        self
    }

    /// Create a new config with custom query timeout
    #[must_use]
    pub fn with_query_timeout(mut self, timeout_ms: u64) -> Self {
        self.query_timeout_ms = timeout_ms;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ApiConfig::default();
        assert_eq!(config.event_buffer_size, 100);
        assert_eq!(config.query_timeout_ms, 5000);
    }

    #[test]
    fn test_builder_pattern() {
        let config = ApiConfig::default()
            .with_buffer_size(200)
            .with_query_timeout(10000);

        assert_eq!(config.event_buffer_size, 200);
        assert_eq!(config.query_timeout_ms, 10000);
    }
}
