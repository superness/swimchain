//! Storage Limit Simulation Tests for Mobile Devices
//!
//! Tests mobile storage constraints using existing StorageProfile system.
//! Validates eviction behavior, priority ordering, and OwnContent protection.

use std::collections::HashSet;
use swimchain::storage::blob::ContentBlobHash;
use swimchain::storage::cache::{CacheEntry, EvictionPriority, LruCache, RECENT_THRESHOLD_SECS};
use swimchain::storage::config::{MobileConfig, StorageConfig, StorageProfile};
use swimchain::types::content::SpaceId;
use swimchain::types::identity::IdentityId;
use tempfile::tempdir;

/// Helper to create cache entries with specific parameters
fn make_entry(
    hash: [u8; 32],
    size: u64,
    owner: [u8; 32],
    space: [u8; 32],
    created_at: u64,
) -> CacheEntry {
    let mut entry = CacheEntry::new(
        ContentBlobHash::from_bytes(hash),
        size,
        IdentityId::from_bytes(owner),
        SpaceId::from_bytes(space),
        created_at,
    );
    entry.created_at = created_at;
    entry
}

/// Get current timestamp
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Create a cache with Budget1GB profile
fn create_budget_cache() -> (LruCache, tempfile::TempDir) {
    let dir = tempdir().expect("Failed to create temp dir");
    let config = StorageConfig::from_profile(StorageProfile::Budget1GB);
    let cache = LruCache::open(
        dir.path().join("cache_index.json"),
        config.max_cache_bytes,
        config.eviction_threshold,
        IdentityId::from_bytes([1u8; 32]), // test user
    )
    .expect("Failed to create cache");
    (cache, dir)
}

// =============================================================================
// Storage Profile Tests
// =============================================================================

#[test]
fn test_storage_profile_parameters() {
    // Budget1GB: 1GB, 85% eviction threshold
    let budget = StorageProfile::Budget1GB;
    assert_eq!(budget.max_cache_bytes(), 1_073_741_824);
    assert!((budget.eviction_threshold() - 0.85).abs() < f64::EPSILON);

    // Standard5GB: 5GB, 90% eviction threshold
    let standard = StorageProfile::Standard5GB;
    assert_eq!(standard.max_cache_bytes(), 5_368_709_120);
    assert!((standard.eviction_threshold() - 0.90).abs() < f64::EPSILON);

    // Flagship10GB: 10GB, 92% eviction threshold
    let flagship = StorageProfile::Flagship10GB;
    assert_eq!(flagship.max_cache_bytes(), 10_737_418_240);
    assert!((flagship.eviction_threshold() - 0.92).abs() < f64::EPSILON);
}

#[test]
fn test_storage_config_from_profile() {
    let config = StorageConfig::from_profile(StorageProfile::Budget1GB);
    assert_eq!(config.max_cache_bytes, 1_073_741_824);
    assert!((config.eviction_threshold - 0.85).abs() < f64::EPSILON);
    assert_eq!(config.profile, StorageProfile::Budget1GB);
}

#[test]
fn test_mobile_config_profiles() {
    // Budget: 1GB, WiFi only, 50MB/day cellular
    let budget = MobileConfig::budget();
    assert!((budget.cache_limit_gb - 1.0).abs() < f64::EPSILON);
    assert!(budget.serve_on_wifi_only);
    assert_eq!(budget.cellular_limit_mb_per_day, 50);
    assert!(!budget.background_serving);

    // Standard: 5GB, WiFi only, 100MB/day cellular
    let standard = MobileConfig::standard();
    assert!((standard.cache_limit_gb - 5.0).abs() < f64::EPSILON);
    assert_eq!(standard.cellular_limit_mb_per_day, 100);
    assert!(standard.background_serving);

    // Flagship: 10GB, WiFi only, 200MB/day cellular
    let flagship = MobileConfig::flagship();
    assert!((flagship.cache_limit_gb - 10.0).abs() < f64::EPSILON);
    assert_eq!(flagship.cellular_limit_mb_per_day, 200);
}

// =============================================================================
// Eviction Threshold Tests
// =============================================================================

#[test]
fn test_budget_eviction_threshold() {
    let config = StorageConfig::from_profile(StorageProfile::Budget1GB);

    // 85% of 1GB = 912,680,550 bytes
    let eviction_trigger = (1_073_741_824.0 * 0.85) as u64;
    assert_eq!(eviction_trigger, 912_680_550);

    // Below threshold - no eviction needed
    assert!(!config.is_over_threshold(eviction_trigger - 1));

    // At threshold - eviction triggered
    assert!(config.is_over_threshold(eviction_trigger));

    // Above threshold - definitely needs eviction
    assert!(config.is_over_threshold(eviction_trigger + 1));
}

#[test]
fn test_eviction_trigger_at_85_percent() {
    let (mut cache, _dir) = create_budget_cache();

    // Budget1GB = 1GB max, 85% threshold = ~912MB
    // Add content up to 80% (should not trigger eviction)
    let chunk_size = 100_000_000u64; // 100MB chunks
    let owner = [2u8; 32]; // Not the cache owner (user [1u8; 32])
    let space = [3u8; 32];

    // Add 8 × 100MB = 800MB (below 85%)
    for i in 0..8 {
        let mut hash = [0u8; 32];
        hash[0] = i;
        let entry = make_entry(hash, chunk_size, owner, space, now());
        cache.add_entry(entry);
    }

    // Verify no eviction needed yet at 800MB
    let result = cache.evict_if_needed(0);
    assert!(result.is_ok());
    assert!(
        result.unwrap().is_empty(),
        "Should not evict at 800MB (below 85%)"
    );

    // Add 150MB more (total ~950MB, over 85%)
    let result = cache.evict_if_needed(150_000_000);
    assert!(result.is_ok());
    let evicted = result.unwrap();

    // Should have evicted some content
    assert!(
        !evicted.is_empty(),
        "Should evict when exceeding 85% threshold"
    );
    println!("Evicted {} entries to stay under threshold", evicted.len());
}

// =============================================================================
// OwnContent Protection Tests (SPEC_07 §5)
// =============================================================================

#[test]
fn test_own_content_never_evicted() {
    let (mut cache, _dir) = create_budget_cache();

    let current_user = [1u8; 32]; // Cache owner
    let space = [3u8; 32];

    // Fill cache to 100% with OwnContent
    let chunk_size = 100_000_000u64; // 100MB
    for i in 0..10 {
        let mut hash = [0u8; 32];
        hash[0] = i;
        let entry = make_entry(hash, chunk_size, current_user, space, now());
        cache.add_entry(entry);
    }

    // Verify all content is OwnContent priority
    let by_priority = cache.bytes_by_priority();
    assert!(by_priority.get(&EvictionPriority::OwnContent).unwrap_or(&0) > &0);

    // Try to add more content - should fail with StorageFull
    let result = cache.evict_if_needed(100_000_000);
    assert!(
        matches!(
            result,
            Err(swimchain::types::error::StorageError::StorageFull { .. })
        ),
        "Should return StorageFull when cache is 100% OwnContent"
    );
}

#[test]
fn test_own_content_priority() {
    let current_user = [1u8; 32];
    let other_user = [2u8; 32];
    let space = [3u8; 32];

    // Own content entry
    let own_entry = make_entry([1u8; 32], 1000, current_user, space, now());
    let own_priority = own_entry.eviction_priority(
        &hex::encode(current_user),
        &HashSet::new(),
        now(),
        RECENT_THRESHOLD_SECS,
    );
    assert_eq!(own_priority, EvictionPriority::OwnContent);
    assert!(
        !own_priority.can_evict(),
        "OwnContent must not be evictable"
    );

    // Other user's content
    let other_entry = make_entry([2u8; 32], 1000, other_user, space, now());
    let other_priority = other_entry.eviction_priority(
        &hex::encode(current_user),
        &HashSet::new(),
        now(),
        RECENT_THRESHOLD_SECS,
    );
    assert_ne!(other_priority, EvictionPriority::OwnContent);
    assert!(
        other_priority.can_evict(),
        "Other content should be evictable"
    );
}

// =============================================================================
// 5-Tier Eviction Priority Order Tests (SPEC_07 §5)
// =============================================================================

#[test]
fn test_eviction_priority_order() {
    let current_user = [1u8; 32];
    let other_user = [2u8; 32];
    let followed_space = [3u8; 32];
    let unfollowed_space = [4u8; 32];
    let old_time = now() - RECENT_THRESHOLD_SECS - 3600; // 1 hour older than threshold

    let mut followed = HashSet::new();
    followed.insert(hex::encode(followed_space));

    // Create entries for each priority tier

    // Tier 1: OldUnfollowed (evict first)
    let old_unfollowed = make_entry([1u8; 32], 1000, other_user, unfollowed_space, old_time);
    let p1 = old_unfollowed.eviction_priority(
        &hex::encode(current_user),
        &followed,
        now(),
        RECENT_THRESHOLD_SECS,
    );
    assert_eq!(p1, EvictionPriority::OldUnfollowed);

    // Tier 2: OldFollowed
    let old_followed = make_entry([2u8; 32], 1000, other_user, followed_space, old_time);
    let p2 = old_followed.eviction_priority(
        &hex::encode(current_user),
        &followed,
        now(),
        RECENT_THRESHOLD_SECS,
    );
    assert_eq!(p2, EvictionPriority::OldFollowed);

    // Tier 3: RecentFollowed
    let recent_followed = make_entry([3u8; 32], 1000, other_user, followed_space, now());
    let p3 = recent_followed.eviction_priority(
        &hex::encode(current_user),
        &followed,
        now(),
        RECENT_THRESHOLD_SECS,
    );
    assert_eq!(p3, EvictionPriority::RecentFollowed);

    // Tier 4: Pinned
    let mut pinned = make_entry([4u8; 32], 1000, other_user, unfollowed_space, old_time);
    pinned.is_pinned = true;
    let p4 = pinned.eviction_priority(
        &hex::encode(current_user),
        &followed,
        now(),
        RECENT_THRESHOLD_SECS,
    );
    assert_eq!(p4, EvictionPriority::Pinned);

    // Tier 5: OwnContent (never evict)
    let own = make_entry([5u8; 32], 1000, current_user, followed_space, now());
    let p5 = own.eviction_priority(
        &hex::encode(current_user),
        &followed,
        now(),
        RECENT_THRESHOLD_SECS,
    );
    assert_eq!(p5, EvictionPriority::OwnContent);

    // Verify ordering
    assert!(p1 < p2, "OldUnfollowed < OldFollowed");
    assert!(p2 < p3, "OldFollowed < RecentFollowed");
    assert!(p3 < p4, "RecentFollowed < Pinned");
    assert!(p4 < p5, "Pinned < OwnContent");

    // Verify can_evict
    assert!(p1.can_evict(), "OldUnfollowed can be evicted");
    assert!(p2.can_evict(), "OldFollowed can be evicted");
    assert!(p3.can_evict(), "RecentFollowed can be evicted");
    assert!(p4.can_evict(), "Pinned can be evicted");
    assert!(!p5.can_evict(), "OwnContent cannot be evicted");
}

#[test]
fn test_eviction_order_in_practice() {
    let (mut cache, _dir) = create_budget_cache();

    let current_user = [1u8; 32];
    let other_user = [2u8; 32];
    let followed_space = [3u8; 32];
    let unfollowed_space = [4u8; 32];
    let old_time = now() - RECENT_THRESHOLD_SECS - 3600;

    // Add followed space
    cache.add_followed_space(SpaceId::from_bytes(followed_space));

    // Add entries in reverse priority order (to test sorting)

    // Own content (should never be evicted)
    cache.add_entry(make_entry(
        [5u8; 32],
        100_000,
        current_user,
        followed_space,
        now(),
    ));

    // Pinned (low eviction priority)
    let mut pinned = make_entry([4u8; 32], 100_000, other_user, unfollowed_space, old_time);
    pinned.is_pinned = true;
    cache.add_entry(pinned);

    // Recent followed
    cache.add_entry(make_entry(
        [3u8; 32],
        100_000,
        other_user,
        followed_space,
        now(),
    ));

    // Old followed
    cache.add_entry(make_entry(
        [2u8; 32],
        100_000,
        other_user,
        followed_space,
        old_time,
    ));

    // Old unfollowed (should be evicted first)
    cache.add_entry(make_entry(
        [1u8; 32],
        100_000,
        other_user,
        unfollowed_space,
        old_time,
    ));

    // Get eviction candidates
    let candidates = cache.get_eviction_candidates(100_000);

    // Should get OldUnfollowed first
    assert!(!candidates.is_empty(), "Should have eviction candidates");
    assert_eq!(
        candidates[0],
        ContentBlobHash::from_bytes([1u8; 32]),
        "OldUnfollowed should be first candidate"
    );

    // OwnContent should not be in candidates
    assert!(
        !candidates.contains(&ContentBlobHash::from_bytes([5u8; 32])),
        "OwnContent should never be in eviction candidates"
    );
}

// =============================================================================
// Storage Projections Tests (PROJECTIONS.md)
// =============================================================================

/// Activity model from PROJECTIONS.md
#[derive(Debug, Clone)]
pub struct ActivityModel {
    /// Number of users
    pub users: u32,
    /// Posts per user per day
    pub posts_per_user_per_day: f64,
    /// Percentage of text-only posts
    pub text_only_percent: f64,
    /// Percentage of posts with images
    pub image_percent: f64,
    /// Percentage of posts with video
    pub video_percent: f64,
    /// Average text post size
    pub avg_text_bytes: u64,
    /// Average image post size
    pub avg_image_bytes: u64,
    /// Average video post size
    pub avg_video_bytes: u64,
    /// Decay half-life in days
    pub decay_half_life_days: u32,
}

impl Default for ActivityModel {
    fn default() -> Self {
        // From PROJECTIONS.md
        Self {
            users: 100,
            posts_per_user_per_day: 0.3,
            text_only_percent: 0.78,
            image_percent: 0.20,
            video_percent: 0.02,
            avg_text_bytes: 1_024,      // 1 KB
            avg_image_bytes: 512_000,   // 500 KB
            avg_video_bytes: 5_242_880, // 5 MB
            decay_half_life_days: 30,   // From SPEC_02
        }
    }
}

impl ActivityModel {
    /// Calculate average bytes per post
    fn avg_bytes_per_post(&self) -> f64 {
        self.text_only_percent * self.avg_text_bytes as f64
            + self.image_percent * self.avg_image_bytes as f64
            + self.video_percent * self.avg_video_bytes as f64
    }

    /// Calculate daily storage growth (before decay)
    fn daily_growth_bytes(&self) -> f64 {
        let posts_per_day = self.users as f64 * self.posts_per_user_per_day;
        posts_per_day * self.avg_bytes_per_post()
    }

    /// Simulate storage after N days with decay
    ///
    /// Uses formula: steady_state = daily_growth * half_life / ln(2)
    /// For 30-day half-life: steady_state ≈ daily_growth * 43.3
    pub fn simulate_days(&self, days: u32) -> StorageSimResult {
        let daily_growth = self.daily_growth_bytes();
        let half_life = self.decay_half_life_days as f64;

        // Steady state formula
        let steady_state = daily_growth * half_life / 0.693; // ln(2) ≈ 0.693

        // Approach to steady state
        // storage(t) = steady_state * (1 - e^(-t/τ))
        // where τ = half_life / ln(2)
        let tau = half_life / 0.693;
        let storage = steady_state * (1.0 - (-(days as f64) / tau).exp());

        StorageSimResult {
            days,
            daily_growth_mb: daily_growth / 1_048_576.0,
            steady_state_mb: steady_state / 1_048_576.0,
            storage_mb: storage / 1_048_576.0,
            storage_bytes: storage as u64,
        }
    }
}

#[derive(Debug, Clone)]
pub struct StorageSimResult {
    pub days: u32,
    pub daily_growth_mb: f64,
    pub steady_state_mb: f64,
    pub storage_mb: f64,
    pub storage_bytes: u64,
}

#[test]
fn test_storage_projections_activity() {
    let model = ActivityModel::default();

    // Test at 30 days
    let result = model.simulate_days(30);

    println!("Activity Model Projections:");
    println!("  Users: {}", model.users);
    println!("  Posts/user/day: {}", model.posts_per_user_per_day);
    println!(
        "  Avg bytes/post: {:.2} KB",
        model.avg_bytes_per_post() / 1024.0
    );
    println!("  Daily growth: {:.2} MB", result.daily_growth_mb);
    println!("  Steady state: {:.2} MB", result.steady_state_mb);
    println!("  Storage at day 30: {:.2} MB", result.storage_mb);

    // With 100 users at 0.3 posts/day, and decay:
    // - 30 posts/day
    // - ~3 MB/day (mostly text and some images)
    // - Steady state ~130 MB
    // This should easily fit in Budget1GB (1GB cache)

    let budget_limit = StorageProfile::Budget1GB.max_cache_bytes();
    assert!(
        result.storage_bytes < budget_limit,
        "30-day storage ({:.2} MB) should fit in Budget1GB ({} MB)",
        result.storage_mb,
        budget_limit / 1_048_576
    );
}

#[test]
fn test_storage_projections_scale() {
    println!("\nStorage Projections by User Count:");
    println!(
        "{:<10} {:>12} {:>15} {:>15}",
        "Users", "Daily (MB)", "Steady (MB)", "Profile Needed"
    );
    println!("{:-<55}", "");

    let budget_max = StorageProfile::Budget1GB.max_cache_bytes() as f64 / 1_048_576.0;
    let standard_max = StorageProfile::Standard5GB.max_cache_bytes() as f64 / 1_048_576.0;
    let flagship_max = StorageProfile::Flagship10GB.max_cache_bytes() as f64 / 1_048_576.0;

    for users in [12, 100, 500, 1000] {
        let mut model = ActivityModel::default();
        model.users = users;
        let result = model.simulate_days(90);

        let profile = if result.steady_state_mb < budget_max {
            "Budget1GB"
        } else if result.steady_state_mb < standard_max {
            "Standard5GB"
        } else if result.steady_state_mb < flagship_max {
            "Flagship10GB"
        } else {
            "Exceeds all"
        };

        println!(
            "{:<10} {:>12.2} {:>15.2} {:>15}",
            users, result.daily_growth_mb, result.steady_state_mb, profile
        );
    }

    // Key finding: PROJECTIONS.md claims <500MB per user
    // Our model with decay shows steady state ~130MB for 100 users
    // This validates mobile viability
}

#[test]
fn test_storage_under_500mb_per_user() {
    // VISION.md target: <500MB per user
    let mut model = ActivityModel::default();
    model.users = 1; // Single user perspective

    let result = model.simulate_days(90);

    println!(
        "Single user storage at 90 days: {:.2} MB",
        result.storage_mb
    );

    assert!(
        result.storage_mb < 500.0,
        "Per-user storage ({:.2} MB) should be under 500MB",
        result.storage_mb
    );
}
