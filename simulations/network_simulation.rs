//! Network-wide content availability simulation
//!
//! This simulation models the actual Swimchain architecture:
//! - Chain layer: Everyone syncs records (small)
//! - Content layer: BitTorrent-style fetch-on-demand
//! - LRU caching on each node
//! - Content availability depends on who's online and who cached it

use std::collections::{HashMap, HashSet, VecDeque};
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;

/// A content blob (image, video, etc.)
#[derive(Clone, Debug)]
struct ContentBlob {
    id: u64,
    size_bytes: u64,
    author_id: u32,
    created_at: u64,  // Simulation tick
    view_count: u32,
}

/// A user node in the network
struct UserNode {
    id: u32,
    cache: VecDeque<(u64, u64)>,  // (content_id, size)
    cache_used: u64,
    cache_limit: u64,
    own_content: HashSet<u64>,  // Content this user created (always stored)
    own_content_size: u64,
    is_online: bool,
    activity_level: f64,  // 0.0-1.0, affects posting and viewing
}

impl UserNode {
    fn new(id: u32, cache_limit: u64, activity_level: f64) -> Self {
        Self {
            id,
            cache: VecDeque::new(),
            cache_used: 0,
            cache_limit,
            own_content: HashSet::new(),
            own_content_size: 0,
            is_online: true,
            activity_level,
        }
    }

    fn add_own_content(&mut self, content_id: u64, size: u64) {
        self.own_content.insert(content_id);
        self.own_content_size += size;
    }

    fn has_content(&self, content_id: u64) -> bool {
        if self.own_content.contains(&content_id) {
            return true;
        }
        self.cache.iter().any(|(id, _)| *id == content_id)
    }

    fn cache_content(&mut self, content_id: u64, size: u64) {
        // Don't cache own content twice
        if self.own_content.contains(&content_id) {
            return;
        }

        // Don't cache if already cached
        if self.cache.iter().any(|(id, _)| *id == content_id) {
            return;
        }

        // Evict LRU items until there's room
        while self.cache_used + size > self.cache_limit && !self.cache.is_empty() {
            if let Some((_, evicted_size)) = self.cache.pop_front() {
                self.cache_used -= evicted_size;
            }
        }

        // Add to cache if it fits
        if self.cache_used + size <= self.cache_limit {
            self.cache.push_back((content_id, size));
            self.cache_used += size;
        }
    }

    fn total_storage(&self) -> u64 {
        self.own_content_size + self.cache_used
    }
}

/// Network-wide simulation state
struct NetworkSimulation {
    users: Vec<UserNode>,
    content: HashMap<u64, ContentBlob>,
    next_content_id: u64,
    current_tick: u64,
    rng: StdRng,

    // Content type distribution
    text_ratio: f64,
    image_ratio: f64,
    video_ratio: f64,

    // Size parameters
    text_size: u64,
    image_size_avg: u64,
    video_size_avg: u64,

    // Chain record size (separate from content)
    chain_record_size: u64,
    total_chain_records: u64,
}

impl NetworkSimulation {
    fn new(
        num_users: u32,
        cache_limit_mb: u64,
        seed: u64,
    ) -> Self {
        let mut rng = StdRng::seed_from_u64(seed);

        let users: Vec<UserNode> = (0..num_users)
            .map(|id| {
                // Activity follows power law - few very active, many casual
                let activity = rng.gen::<f64>().powf(2.0);
                UserNode::new(id, cache_limit_mb * 1024 * 1024, activity)
            })
            .collect();

        Self {
            users,
            content: HashMap::new(),
            next_content_id: 0,
            current_tick: 0,
            rng,
            text_ratio: 0.70,
            image_ratio: 0.25,
            video_ratio: 0.05,
            text_size: 2_000,           // 2 KB
            image_size_avg: 2_000_000,  // 2 MB average (range: 500KB - 5MB)
            video_size_avg: 8_000_000,  // 8 MB average (range: 2MB - 15MB)
            chain_record_size: 226,
            total_chain_records: 0,
        }
    }

    fn generate_content_size(&mut self) -> (u64, &'static str) {
        let roll: f64 = self.rng.gen();

        if roll < self.text_ratio {
            (self.text_size, "text")
        } else if roll < self.text_ratio + self.image_ratio {
            // Image: 500KB to 5MB, log-normal distribution
            let size = (self.image_size_avg as f64 *
                (0.25 + self.rng.gen::<f64>() * 2.0)) as u64;
            (size.clamp(500_000, 5_000_000), "image")
        } else {
            // Video: 2MB to 15MB
            let size = (self.video_size_avg as f64 *
                (0.25 + self.rng.gen::<f64>() * 1.5)) as u64;
            (size.clamp(2_000_000, 15_000_000), "video")
        }
    }

    fn simulate_tick(&mut self, posts_per_tick: u32, views_per_user_per_tick: f64) {
        self.current_tick += 1;

        // Toggle some users online/offline (80% online at any time)
        for user in &mut self.users {
            user.is_online = self.rng.gen::<f64>() < 0.80;
        }

        // Create new posts
        let mut new_content: Vec<(u64, u64, u32)> = Vec::new(); // (id, size, author)

        for _ in 0..posts_per_tick {
            // Pick a random active user to post (weighted by activity)
            let total_activity: f64 = self.users.iter()
                .filter(|u| u.is_online)
                .map(|u| u.activity_level)
                .sum();

            if total_activity == 0.0 {
                continue;
            }

            let mut pick = self.rng.gen::<f64>() * total_activity;
            let mut author_id = None;

            for user in &self.users {
                if !user.is_online {
                    continue;
                }
                pick -= user.activity_level;
                if pick <= 0.0 {
                    author_id = Some(user.id);
                    break;
                }
            }

            if let Some(aid) = author_id {
                let (size, _content_type) = self.generate_content_size();
                let content_id = self.next_content_id;
                self.next_content_id += 1;

                let blob = ContentBlob {
                    id: content_id,
                    size_bytes: size,
                    author_id: aid,
                    created_at: self.current_tick,
                    view_count: 0,
                };

                self.content.insert(content_id, blob);
                self.total_chain_records += 1;
                new_content.push((content_id, size, aid));
            }
        }

        // Add new content to authors' own storage
        for (content_id, size, author_id) in &new_content {
            self.users[*author_id as usize].add_own_content(*content_id, *size);
        }

        // Simulate views and caching
        let content_ids: Vec<u64> = self.content.keys().cloned().collect();
        if content_ids.is_empty() {
            return;
        }

        for user in &mut self.users {
            if !user.is_online {
                continue;
            }

            // Number of views based on activity level
            let num_views = (views_per_user_per_tick * user.activity_level * 2.0) as u32;

            for _ in 0..num_views {
                // Pick content to view - recent content more likely
                // Zipf-like distribution favoring recent content
                let idx = (self.rng.gen::<f64>().powf(1.5) * content_ids.len() as f64) as usize;
                let idx = content_ids.len().saturating_sub(1).min(idx);
                let content_id = content_ids[idx];

                if let Some(blob) = self.content.get_mut(&content_id) {
                    // Only cache media content (text is tiny, always fetched)
                    if blob.size_bytes > 10_000 {
                        user.cache_content(content_id, blob.size_bytes);
                    }
                    blob.view_count += 1;
                }
            }
        }
    }

    fn content_availability(&self, content_id: u64) -> (u32, u32) {
        // Returns (online_seeders, total_seeders)
        let mut online = 0u32;
        let mut total = 0u32;

        for user in &self.users {
            if user.has_content(content_id) {
                total += 1;
                if user.is_online {
                    online += 1;
                }
            }
        }

        (online, total)
    }

    fn run_availability_analysis(&self) -> AvailabilityReport {
        let mut available_content = 0u64;
        let mut unavailable_content = 0u64;
        let mut total_views = 0u64;
        let mut available_views = 0u64;

        let mut by_age: HashMap<u64, (u64, u64)> = HashMap::new(); // age_bucket -> (available, total)

        for blob in self.content.values() {
            let (online_seeders, _total_seeders) = self.content_availability(blob.id);
            let age = self.current_tick - blob.created_at;
            let age_bucket = age / 24; // Group by days (assuming 24 ticks per day)

            let entry = by_age.entry(age_bucket).or_insert((0, 0));
            entry.1 += 1;

            if online_seeders > 0 {
                available_content += 1;
                available_views += blob.view_count as u64;
                entry.0 += 1;
            } else {
                unavailable_content += 1;
            }
            total_views += blob.view_count as u64;
        }

        AvailabilityReport {
            total_content: self.content.len() as u64,
            available_content,
            unavailable_content,
            availability_rate: available_content as f64 / self.content.len().max(1) as f64,
            total_views,
            available_views,
            by_age_days: by_age,
        }
    }

    fn run_storage_analysis(&self) -> StorageReport {
        let mut total_own_content = 0u64;
        let mut total_cache_used = 0u64;
        let mut min_storage = u64::MAX;
        let mut max_storage = 0u64;
        let mut storage_distribution: Vec<u64> = Vec::new();

        for user in &self.users {
            let storage = user.total_storage();
            total_own_content += user.own_content_size;
            total_cache_used += user.cache_used;
            min_storage = min_storage.min(storage);
            max_storage = max_storage.max(storage);
            storage_distribution.push(storage);
        }

        storage_distribution.sort();

        let chain_size = self.total_chain_records * self.chain_record_size;

        StorageReport {
            chain_records: self.total_chain_records,
            chain_size_bytes: chain_size,
            avg_own_content: total_own_content / self.users.len() as u64,
            avg_cache_used: total_cache_used / self.users.len() as u64,
            min_storage,
            max_storage,
            median_storage: storage_distribution[storage_distribution.len() / 2],
            p95_storage: storage_distribution[(storage_distribution.len() as f64 * 0.95) as usize],
            total_content_blobs: self.content.len() as u64,
            total_content_size: self.content.values().map(|c| c.size_bytes).sum(),
        }
    }
}

#[derive(Debug)]
struct AvailabilityReport {
    total_content: u64,
    available_content: u64,
    unavailable_content: u64,
    availability_rate: f64,
    total_views: u64,
    available_views: u64,
    by_age_days: HashMap<u64, (u64, u64)>, // day -> (available, total)
}

#[derive(Debug)]
struct StorageReport {
    chain_records: u64,
    chain_size_bytes: u64,
    avg_own_content: u64,
    avg_cache_used: u64,
    min_storage: u64,
    max_storage: u64,
    median_storage: u64,
    p95_storage: u64,
    total_content_blobs: u64,
    total_content_size: u64,
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_000_000_000 {
        format!("{:.2} GB", bytes as f64 / 1_000_000_000.0)
    } else if bytes >= 1_000_000 {
        format!("{:.2} MB", bytes as f64 / 1_000_000.0)
    } else if bytes >= 1_000 {
        format!("{:.2} KB", bytes as f64 / 1_000.0)
    } else {
        format!("{} B", bytes)
    }
}

fn run_simulation(
    num_users: u32,
    days: u32,
    posts_per_day: u32,
    views_per_user_per_day: f64,
    cache_limit_mb: u64,
    seed: u64,
) {
    println!("\n╔══════════════════════════════════════════════════════════════════════════╗");
    println!("║            SWIMCHAIN NETWORK SIMULATION                                  ║");
    println!("╠══════════════════════════════════════════════════════════════════════════╣");
    println!("║  Users: {:>6}    Days: {:>3}    Posts/day: {:>5}    Cache: {:>4} MB       ║",
             num_users, days, posts_per_day, cache_limit_mb);
    println!("╚══════════════════════════════════════════════════════════════════════════╝\n");

    let ticks_per_day = 24;
    let total_ticks = days * ticks_per_day;
    let posts_per_tick = posts_per_day / ticks_per_day;
    let views_per_user_per_tick = views_per_user_per_day / ticks_per_day as f64;

    let mut sim = NetworkSimulation::new(num_users, cache_limit_mb, seed);

    // Run simulation with progress updates
    for tick in 0..total_ticks {
        sim.simulate_tick(posts_per_tick, views_per_user_per_tick);

        if (tick + 1) % (7 * ticks_per_day) == 0 {
            let day = (tick + 1) / ticks_per_day;
            let storage = sim.run_storage_analysis();
            let avail = sim.run_availability_analysis();

            println!("Day {:>3}: {:>6} posts, {:.1}% available, median storage: {}",
                     day,
                     storage.total_content_blobs,
                     avail.availability_rate * 100.0,
                     format_bytes(storage.median_storage));
        }
    }

    // Final reports
    println!("\n────────────────────────────────────────────────────────────────────────────");
    println!("                           FINAL RESULTS");
    println!("────────────────────────────────────────────────────────────────────────────\n");

    let storage = sim.run_storage_analysis();
    let avail = sim.run_availability_analysis();

    println!("CHAIN LAYER (synced by everyone):");
    println!("  Records:          {:>10}", storage.chain_records);
    println!("  Chain size:       {:>10}", format_bytes(storage.chain_size_bytes));
    println!();

    println!("CONTENT LAYER:");
    println!("  Total blobs:      {:>10}", storage.total_content_blobs);
    println!("  Total size:       {:>10}", format_bytes(storage.total_content_size));
    println!("  Per-blob avg:     {:>10}",
             format_bytes(storage.total_content_size / storage.total_content_blobs.max(1)));
    println!();

    println!("USER STORAGE:");
    println!("  Chain (all users): {:>9}", format_bytes(storage.chain_size_bytes));
    println!("  Own content avg:   {:>9}", format_bytes(storage.avg_own_content));
    println!("  Cache used avg:    {:>9}", format_bytes(storage.avg_cache_used));
    println!("  ─────────────────────────────");
    println!("  Total avg:         {:>9}",
             format_bytes(storage.chain_size_bytes + storage.avg_own_content + storage.avg_cache_used));
    println!();
    println!("  Median user:       {:>9}", format_bytes(storage.median_storage + storage.chain_size_bytes));
    println!("  95th percentile:   {:>9}", format_bytes(storage.p95_storage + storage.chain_size_bytes));
    println!("  Max user:          {:>9}", format_bytes(storage.max_storage + storage.chain_size_bytes));
    println!();

    println!("CONTENT AVAILABILITY:");
    println!("  Available now:    {:>6} ({:.1}%)",
             avail.available_content,
             avail.availability_rate * 100.0);
    println!("  Unavailable:      {:>6} ({:.1}%)",
             avail.unavailable_content,
             (1.0 - avail.availability_rate) * 100.0);
    println!();

    println!("AVAILABILITY BY AGE:");
    let mut ages: Vec<_> = avail.by_age_days.iter().collect();
    ages.sort_by_key(|(age, _)| *age);

    for (age_days, (available, total)) in ages.iter().take(10) {
        if *total > 0 {
            let rate = *available as f64 / *total as f64 * 100.0;
            println!("  Day {:>2}: {:>5}/{:>5} available ({:>5.1}%)",
                     age_days, available, total, rate);
        }
    }
}

fn main() {
    println!("\n🏊 SWIMCHAIN NETWORK SIMULATION 🏊");
    println!("═══════════════════════════════════════════════════════════════════════════\n");

    // Scenario 1: Small community (1,000 users)
    println!("SCENARIO 1: SMALL COMMUNITY");
    run_simulation(
        1_000,      // users
        60,         // days
        500,        // posts per day (0.5 per user)
        20.0,       // views per user per day
        350,        // cache limit MB
        42,         // seed
    );

    // Scenario 2: Medium community (10,000 users)
    println!("\n\nSCENARIO 2: MEDIUM COMMUNITY");
    run_simulation(
        10_000,     // users
        60,         // days
        5_000,      // posts per day
        15.0,       // views per user per day
        350,        // cache limit MB
        42,         // seed
    );

    // Scenario 3: What if cache is smaller? (mobile users)
    println!("\n\nSCENARIO 3: MOBILE USERS (100MB cache)");
    run_simulation(
        5_000,      // users
        60,         // days
        2_500,      // posts per day
        10.0,       // views per user per day
        100,        // cache limit MB (mobile)
        42,         // seed
    );

    // Scenario 4: Low engagement
    println!("\n\nSCENARIO 4: LOW ENGAGEMENT");
    run_simulation(
        5_000,      // users
        60,         // days
        1_000,      // posts per day (0.2 per user)
        5.0,        // views per user per day (low!)
        350,        // cache limit MB
        42,         // seed
    );
}
