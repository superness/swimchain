//! Storage simulation to answer key questions:
//! - What chain size at 1K, 10K, 100K users?
//! - How does decay rate affect retention?
//! - Storage projections over time

use rand::prelude::*;
use swimchain::content::lifecycle::ContentManager;
use swimchain::types::content::{
    ContentId, ContentItem, ContentType, EngagementRecord, EngagementType, SpaceId,
};
use swimchain::types::identity::{IdentityId, Signature};

const MS_PER_DAY: u64 = 24 * 60 * 60 * 1000;

fn make_content(rng: &mut impl Rng, created_at_ms: u64, avg_size: usize) -> ContentItem {
    let mut id = [0u8; 32];
    rng.fill_bytes(&mut id);

    // Generate body with realistic variation (50% to 200% of avg)
    let size = (avg_size as f64 * rng.gen_range(0.5..2.0)) as usize;
    let body: String = (0..size)
        .map(|_| rng.gen_range(b'a'..=b'z') as char)
        .collect();

    ContentItem {
        content_id: ContentId::from_bytes(id),
        author_id: IdentityId::from_bytes([rng.gen(); 32]),
        content_type: ContentType::Post,
        space_id: SpaceId::from_bytes([1u8; 32]),
        parent_id: None,
        created_at: created_at_ms,
        last_engagement: created_at_ms,
        body_inline: Some(body),
        content_hash: None,
        content_size: None,
        content_type_mime: None,
        media_refs: vec![],
        pin_state: None,
        engagement_count: 0,
        signature: Signature::from_bytes([0u8; 64]),
        pow_nonce: 0,
        pow_difficulty: 0,
        preservation_pow: None,
        display_name: None,
    }
}

fn make_engagement(content_id: ContentId, timestamp: u64, rng: &mut impl Rng) -> EngagementRecord {
    EngagementRecord {
        content_id,
        engager_id: IdentityId::from_bytes([rng.gen(); 32]),
        engagement_type: EngagementType::Reply,
        timestamp,
        pow_nonce: 0,
        pow_work: 0,
        signature: Signature::from_bytes([0u8; 64]),
        emoji: None,
    }
}

struct SimResult {
    posts_created: usize,
    posts_remaining: usize,
    storage_bytes: u64,
    retention_rate: f64,
}

fn run_simulation(
    num_users: usize,
    posts_per_user_per_day: f64,
    days: u64,
    engagement_rate: f64,
    avg_post_size: usize,
) -> SimResult {
    let mut rng = rand::thread_rng();
    let manager = ContentManager::new();

    let total_posts = (num_users as f64 * posts_per_user_per_day * days as f64) as usize;
    let mut content_ids = Vec::with_capacity(total_posts);

    // Create posts distributed over time
    for i in 0..total_posts {
        let day = (i as f64 * days as f64 / total_posts as f64) as u64;
        let created_at = day * MS_PER_DAY + rng.gen_range(0..MS_PER_DAY);
        let content = make_content(&mut rng, created_at, avg_post_size);
        content_ids.push((content.content_id, created_at));
        let _ = manager.create_content(content, created_at);
    }

    // Simulate engagement and decay
    for day in 0..days {
        let current_time = (day + 1) * MS_PER_DAY;

        // Random engagements
        for (content_id, created_at) in &content_ids {
            // Only engage with content from the last 7 days (realistic)
            if current_time - created_at < 7 * MS_PER_DAY && rng.gen::<f64>() < engagement_rate {
                let engagement = make_engagement(*content_id, current_time, &mut rng);
                let _ = manager.process_engagement(engagement, current_time);
            }
        }

        // Weekly prune
        if day % 7 == 6 {
            let _ = manager.prune(current_time);
        }
    }

    // Final prune
    let _ = manager.prune(days * MS_PER_DAY);
    let (storage_bytes, posts_remaining) = manager.storage_stats().unwrap();

    SimResult {
        posts_created: total_posts,
        posts_remaining,
        storage_bytes,
        retention_rate: 100.0 * posts_remaining as f64 / total_posts as f64,
    }
}

fn main() {
    println!("\n╔════════════════════════════════════════════════════════════════════╗");
    println!("║               🏊 SWIMCHAIN STORAGE SIMULATION 🏊                   ║");
    println!("╚════════════════════════════════════════════════════════════════════╝\n");

    println!("Parameters:");
    println!("  - 60-day simulation period");
    println!("  - 1 post per user per day");
    println!("  - 5% daily engagement rate (within 7 days of post)");
    println!("  - 300 byte average post size");
    println!("  - Weekly pruning\n");

    println!("┌──────────────────────────────────────────────────────────────────────┐");
    println!("│                          SIMULATION RESULTS                          │");
    println!("├──────────┬─────────────┬─────────────┬────────────┬─────────────────┤");
    println!("│  Users   │   Posts     │  Remaining  │  Retention │    Storage      │");
    println!("├──────────┼─────────────┼─────────────┼────────────┼─────────────────┤");

    for num_users in [100, 1_000, 10_000] {
        let result = run_simulation(num_users, 1.0, 60, 0.05, 300);

        let storage_str = if result.storage_bytes > 1024 * 1024 {
            format!("{:.2} MB", result.storage_bytes as f64 / 1024.0 / 1024.0)
        } else if result.storage_bytes > 1024 {
            format!("{:.2} KB", result.storage_bytes as f64 / 1024.0)
        } else {
            format!("{} B", result.storage_bytes)
        };

        println!(
            "│  {:>6}  │  {:>9}  │  {:>9}  │   {:>5.1}%   │  {:>13}  │",
            num_users,
            result.posts_created,
            result.posts_remaining,
            result.retention_rate,
            storage_str
        );
    }

    println!("└──────────┴─────────────┴─────────────┴────────────┴─────────────────┘\n");

    // More aggressive engagement scenario
    println!("High engagement scenario (20% daily engagement):\n");
    println!("┌──────────┬─────────────┬─────────────┬────────────┬─────────────────┐");
    println!("│  Users   │   Posts     │  Remaining  │  Retention │    Storage      │");
    println!("├──────────┼─────────────┼─────────────┼────────────┼─────────────────┤");

    for num_users in [1_000, 10_000] {
        let result = run_simulation(num_users, 1.0, 60, 0.20, 300);

        let storage_str = if result.storage_bytes > 1024 * 1024 {
            format!("{:.2} MB", result.storage_bytes as f64 / 1024.0 / 1024.0)
        } else {
            format!("{:.2} KB", result.storage_bytes as f64 / 1024.0)
        };

        println!(
            "│  {:>6}  │  {:>9}  │  {:>9}  │   {:>5.1}%   │  {:>13}  │",
            num_users,
            result.posts_created,
            result.posts_remaining,
            result.retention_rate,
            storage_str
        );
    }

    println!("└──────────┴─────────────┴─────────────┴────────────┴─────────────────┘\n");

    // Projection to target users
    println!("╔════════════════════════════════════════════════════════════════════╗");
    println!("║                    STORAGE PROJECTIONS                             ║");
    println!("╚════════════════════════════════════════════════════════════════════╝\n");

    println!("Assuming 300 bytes/post, 5% engagement, 30-day half-life:\n");

    let bytes_per_retained_post = 500; // Conservative (metadata + body)

    for (users, label) in [
        (1_000, "Early adopters"),
        (10_000, "Growing community"),
        (100_000, "Established network"),
    ] {
        let daily_posts = users;
        let retained_posts = (daily_posts as f64 * 30.0 * 0.15) as usize; // ~15% retention at 30 days
        let storage_mb = (retained_posts * bytes_per_retained_post) as f64 / 1024.0 / 1024.0;

        println!(
            "  {:20} ({:>6} users): ~{:.0} MB steady state",
            label, users, storage_mb
        );
    }

    println!("\n✅ All simulations use REAL Swimchain decay engine");
    println!("✅ Adaptive half-life adjusts based on storage target (500MB default)");
    println!("✅ Content without engagement decays naturally\n");
}
