//! Storage metrics and usage reporting (SPEC_07 - Milestone 1.6)
//!
//! Provides aggregated metrics across all storage components.

/// Storage metrics across all components
#[derive(Debug, Clone, Default)]
pub struct StorageMetrics {
    /// Total bytes used
    pub total_bytes: u64,
    /// Chain storage bytes (blocks, headers)
    pub chain_bytes: u64,
    /// Blob storage bytes (content files)
    pub blob_bytes: u64,
    /// Content metadata bytes
    pub metadata_bytes: u64,
    /// Cache index size
    pub cache_index_bytes: u64,
    /// Maximum allowed bytes
    pub max_bytes: u64,
    /// Number of root blocks
    pub root_block_count: u64,
    /// Number of space blocks
    pub space_block_count: u64,
    /// Number of content blocks
    pub content_block_count: u64,
    /// Number of blobs
    pub blob_count: u64,
    /// Number of content items
    pub content_item_count: u64,
    /// Number of tombstones
    pub tombstone_count: u64,
    /// Cache entry count
    pub cache_entry_count: u64,
    /// Cache hit rate (0.0-1.0)
    pub cache_hit_rate: f64,
    /// Total cache hits
    pub cache_hits: u64,
    /// Total cache misses
    pub cache_misses: u64,
}

impl StorageMetrics {
    /// Create new empty metrics with max bytes set
    #[must_use]
    pub const fn new(max_bytes: u64) -> Self {
        Self {
            total_bytes: 0,
            chain_bytes: 0,
            blob_bytes: 0,
            metadata_bytes: 0,
            cache_index_bytes: 0,
            max_bytes,
            root_block_count: 0,
            space_block_count: 0,
            content_block_count: 0,
            blob_count: 0,
            content_item_count: 0,
            tombstone_count: 0,
            cache_entry_count: 0,
            cache_hit_rate: 0.0,
            cache_hits: 0,
            cache_misses: 0,
        }
    }

    /// Calculate usage percentage
    #[must_use]
    pub fn usage_percent(&self) -> f64 {
        if self.max_bytes == 0 {
            0.0
        } else {
            (self.total_bytes as f64 / self.max_bytes as f64) * 100.0
        }
    }

    /// Get available bytes
    #[must_use]
    pub fn available_bytes(&self) -> u64 {
        self.max_bytes.saturating_sub(self.total_bytes)
    }

    /// Check if storage is near capacity (>90%)
    #[must_use]
    pub fn is_near_capacity(&self) -> bool {
        self.usage_percent() > 90.0
    }

    /// Check if storage is at capacity (>99%)
    #[must_use]
    pub fn is_at_capacity(&self) -> bool {
        self.usage_percent() > 99.0
    }

    /// Total block count
    #[must_use]
    pub fn total_block_count(&self) -> u64 {
        self.root_block_count + self.space_block_count + self.content_block_count
    }

    /// Human-readable summary
    #[must_use]
    pub fn summary(&self) -> String {
        format!(
            "Storage: {:.2} GB / {:.2} GB ({:.1}%)\n\
             Chain: {} blocks ({:.2} MB)\n\
             Content: {} items, {} blobs ({:.2} MB)\n\
             Cache: {:.1}% hit rate ({} hits, {} misses)",
            self.total_bytes as f64 / 1_073_741_824.0,
            self.max_bytes as f64 / 1_073_741_824.0,
            self.usage_percent(),
            self.total_block_count(),
            self.chain_bytes as f64 / 1_048_576.0,
            self.content_item_count,
            self.blob_count,
            self.blob_bytes as f64 / 1_048_576.0,
            self.cache_hit_rate * 100.0,
            self.cache_hits,
            self.cache_misses,
        )
    }

    /// Detailed breakdown
    #[must_use]
    pub fn detailed_summary(&self) -> String {
        format!(
            "=== Storage Metrics ===\n\
             \n\
             Usage: {:.2} GB / {:.2} GB ({:.1}%)\n\
             Available: {:.2} GB\n\
             \n\
             Chain Storage:\n\
               Root blocks:    {:>8}\n\
               Space blocks:   {:>8}\n\
               Content blocks: {:>8}\n\
               Total size:     {:>8.2} MB\n\
             \n\
             Content Storage:\n\
               Items:      {:>8}\n\
               Blobs:      {:>8}\n\
               Tombstones: {:>8}\n\
               Blob size:  {:>8.2} MB\n\
             \n\
             Cache:\n\
               Entries:   {:>8}\n\
               Hit rate:  {:>7.1}%\n\
               Hits:      {:>8}\n\
               Misses:    {:>8}",
            self.total_bytes as f64 / 1_073_741_824.0,
            self.max_bytes as f64 / 1_073_741_824.0,
            self.usage_percent(),
            self.available_bytes() as f64 / 1_073_741_824.0,
            self.root_block_count,
            self.space_block_count,
            self.content_block_count,
            self.chain_bytes as f64 / 1_048_576.0,
            self.content_item_count,
            self.blob_count,
            self.tombstone_count,
            self.blob_bytes as f64 / 1_048_576.0,
            self.cache_entry_count,
            self.cache_hit_rate * 100.0,
            self.cache_hits,
            self.cache_misses,
        )
    }

    /// Format bytes for display
    #[must_use]
    pub fn format_bytes(bytes: u64) -> String {
        const KB: u64 = 1024;
        const MB: u64 = 1024 * KB;
        const GB: u64 = 1024 * MB;

        if bytes >= GB {
            format!("{:.2} GB", bytes as f64 / GB as f64)
        } else if bytes >= MB {
            format!("{:.2} MB", bytes as f64 / MB as f64)
        } else if bytes >= KB {
            format!("{:.2} KB", bytes as f64 / KB as f64)
        } else {
            format!("{} B", bytes)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_usage_percent() {
        let mut metrics = StorageMetrics::new(1_073_741_824); // 1GB
        metrics.total_bytes = 536_870_912; // 512MB

        assert!((metrics.usage_percent() - 50.0).abs() < 0.01);
    }

    #[test]
    fn test_available_bytes() {
        let mut metrics = StorageMetrics::new(1_073_741_824); // 1GB
        metrics.total_bytes = 536_870_912; // 512MB

        assert_eq!(metrics.available_bytes(), 536_870_912);
    }

    #[test]
    fn test_capacity_checks() {
        let mut metrics = StorageMetrics::new(1000);

        metrics.total_bytes = 850;
        assert!(!metrics.is_near_capacity());

        metrics.total_bytes = 910;
        assert!(metrics.is_near_capacity());
        assert!(!metrics.is_at_capacity());

        metrics.total_bytes = 995;
        assert!(metrics.is_at_capacity());
    }

    #[test]
    fn test_total_block_count() {
        let mut metrics = StorageMetrics::default();
        metrics.root_block_count = 10;
        metrics.space_block_count = 20;
        metrics.content_block_count = 30;

        assert_eq!(metrics.total_block_count(), 60);
    }

    #[test]
    fn test_format_bytes() {
        assert_eq!(StorageMetrics::format_bytes(500), "500 B");
        assert_eq!(StorageMetrics::format_bytes(1536), "1.50 KB");
        assert_eq!(StorageMetrics::format_bytes(1_572_864), "1.50 MB");
        assert_eq!(StorageMetrics::format_bytes(1_610_612_736), "1.50 GB");
    }

    #[test]
    fn test_summary() {
        let mut metrics = StorageMetrics::new(5_368_709_120); // 5GB
        metrics.total_bytes = 1_073_741_824; // 1GB
        metrics.chain_bytes = 104_857_600; // 100MB
        metrics.blob_bytes = 943_718_400; // 900MB
        metrics.root_block_count = 100;
        metrics.content_item_count = 1000;
        metrics.blob_count = 500;
        metrics.cache_hit_rate = 0.85;
        metrics.cache_hits = 8500;
        metrics.cache_misses = 1500;

        let summary = metrics.summary();
        assert!(summary.contains("1.00 GB"));
        assert!(summary.contains("5.00 GB"));
        assert!(summary.contains("85.0%"));
    }
}
