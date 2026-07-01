//! Extended simulation scenarios
//!
//! Additional scenarios to answer specific questions:
//! 1. What happens with MORE lanes/spaces?
//! 2. What's the effect of image-heavy content?
//! 3. How does availability change over longer time periods?
//! 4. What's the minimum viable network size?

use std::collections::{HashMap, HashSet, VecDeque};
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;

#[derive(Clone, Debug)]
struct ContentBlob {
    id: u64,
    size_bytes: u64,
    lane_id: u32,
    created_at: u64,
    view_count: u32,
}

struct UserNode {
    id: u32,
    lanes: HashSet<u32>,  // Lanes this user follows
    cache: VecDeque<(u64, u64)>,
    cache_used: u64,
    cache_limit: u64,
    own_content: HashSet<u64>,
    own_content_size: u64,
    is_online: bool,
    activity_level: f64,
}

impl UserNode {
    fn new(id: u32, cache_limit: u64, activity_level: f64) -> Self {
        Self {
            id,
            lanes: HashSet::new(),
            cache: VecDeque::new(),
            cache_used: 0,
            cache_limit,
            own_content: HashSet::new(),
            own_content_size: 0,
            is_online: true,
            activity_level,
        }
    }

    fn join_lane(&mut self, lane_id: u32) {
        self.lanes.insert(lane_id);
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
        if self.own_content.contains(&content_id) {
            return;
        }
        if self.cache.iter().any(|(id, _)| *id == content_id) {
            return;
        }

        while self.cache_used + size > self.cache_limit && !self.cache.is_empty() {
            if let Some((_, evicted_size)) = self.cache.pop_front() {
                self.cache_used -= evicted_size;
            }
        }

        if self.cache_used + size <= self.cache_limit {
            self.cache.push_back((content_id, size));
            self.cache_used += size;
        }
    }

    fn total_storage(&self) -> u64 {
        self.own_content_size + self.cache_used
    }
}

struct LaneSimulation {
    users: Vec<UserNode>,
    content: HashMap<u64, ContentBlob>,
    lanes: HashMap<u32, Vec<u64>>,  // lane_id -> content_ids
    next_content_id: u64,
    current_tick: u64,
    rng: StdRng,
    num_lanes: u32,

    // Content type distribution
    text_ratio: f64,
    image_ratio: f64,

    text_size: u64,
    image_size_avg: u64,

    chain_record_size: u64,
    total_chain_records: u64,
}

impl LaneSimulation {
    fn new(
        num_users: u32,
        num_lanes: u32,
        lanes_per_user: u32,
        cache_limit_mb: u64,
        text_ratio: f64,
        image_size_kb: u64,
        seed: u64,
    ) -> Self {
        let mut rng = StdRng::seed_from_u64(seed);

        let mut users: Vec<UserNode> = (0..num_users)
            .map(|id| {
                let activity = rng.gen::<f64>().powf(2.0);
                UserNode::new(id, cache_limit_mb * 1024 * 1024, activity)
            })
            .collect();

        // Assign lanes to users (each user joins lanes_per_user random lanes)
        let mut lanes: HashMap<u32, Vec<u64>> = (0..num_lanes)
            .map(|id| (id, Vec::new()))
            .collect();

        for user in &mut users {
            let mut assigned = 0;
            while assigned < lanes_per_user {
                let lane_id = rng.gen_range(0..num_lanes);
                if user.lanes.insert(lane_id) {
                    assigned += 1;
                }
            }
        }

        Self {
            users,
            content: HashMap::new(),
            lanes,
            next_content_id: 0,
            current_tick: 0,
            rng,
            num_lanes,
            text_ratio,
            image_ratio: 1.0 - text_ratio,
            text_size: 2_000,
            image_size_avg: image_size_kb * 1024,
            chain_record_size: 226,
            total_chain_records: 0,
        }
    }

    fn generate_content_size(&mut self) -> u64 {
        let roll: f64 = self.rng.gen();
        if roll < self.text_ratio {
            self.text_size
        } else {
            // Image: vary around average
            let size = (self.image_size_avg as f64 * (0.5 + self.rng.gen::<f64>())) as u64;
            size.clamp(100_000, 10_000_000)
        }
    }

    fn simulate_tick(&mut self, posts_per_tick: u32, views_per_user_per_tick: f64) {
        self.current_tick += 1;

        // Toggle some users online/offline
        for user in &mut self.users {
            user.is_online = self.rng.gen::<f64>() < 0.80;
        }

        // Create new posts
        let mut new_content: Vec<(u64, u64, u32, u32)> = Vec::new(); // (id, size, author, lane)

        for _ in 0..posts_per_tick {
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
                let author = &self.users[aid as usize];
                if author.lanes.is_empty() {
                    continue;
                }

                // Post to one of user's lanes
                let lane_vec: Vec<_> = author.lanes.iter().cloned().collect();
                let lane_id = lane_vec[self.rng.gen_range(0..lane_vec.len())];

                let size = self.generate_content_size();
                let content_id = self.next_content_id;
                self.next_content_id += 1;

                let blob = ContentBlob {
                    id: content_id,
                    size_bytes: size,
                    lane_id,
                    created_at: self.current_tick,
                    view_count: 0,
                };

                self.content.insert(content_id, blob);
                self.lanes.get_mut(&lane_id).unwrap().push(content_id);
                self.total_chain_records += 1;
                new_content.push((content_id, size, aid, lane_id));
            }
        }

        for (content_id, size, author_id, _) in &new_content {
            self.users[*author_id as usize].add_own_content(*content_id, *size);
        }

        // Simulate views - users only view content from their lanes
        for user_idx in 0..self.users.len() {
            let user = &self.users[user_idx];
            if !user.is_online {
                continue;
            }

            let num_views = (views_per_user_per_tick * user.activity_level * 2.0) as u32;
            let user_lanes: Vec<_> = user.lanes.iter().cloned().collect();

            for _ in 0..num_views {
                if user_lanes.is_empty() {
                    continue;
                }

                // Pick a random lane the user follows
                let lane_id = user_lanes[self.rng.gen_range(0..user_lanes.len())];
                let lane_content = &self.lanes[&lane_id];

                if lane_content.is_empty() {
                    continue;
                }

                // View recent content from that lane
                let idx = lane_content.len().saturating_sub(1).min(
                    (self.rng.gen::<f64>().powf(1.5) * lane_content.len() as f64) as usize
                );
                let content_id = lane_content[lane_content.len() - 1 - idx];

                if let Some(blob) = self.content.get_mut(&content_id) {
                    if blob.size_bytes > 10_000 {
                        self.users[user_idx].cache_content(content_id, blob.size_bytes);
                    }
                    blob.view_count += 1;
                }
            }
        }
    }

    fn content_availability(&self, content_id: u64) -> u32 {
        let mut online = 0u32;
        for user in &self.users {
            if user.is_online && user.has_content(content_id) {
                online += 1;
            }
        }
        online
    }

    fn run_analysis(&self) -> (u64, u64, u64, u64, u64, f64) {
        let mut available = 0u64;
        let mut unavailable = 0u64;
        let total_chain = self.total_chain_records * self.chain_record_size;

        let mut total_own = 0u64;
        let mut total_cache = 0u64;
        let mut storage_vals: Vec<u64> = Vec::new();

        for user in &self.users {
            total_own += user.own_content_size;
            total_cache += user.cache_used;
            storage_vals.push(user.total_storage());
        }

        for blob in self.content.values() {
            if self.content_availability(blob.id) > 0 {
                available += 1;
            } else {
                unavailable += 1;
            }
        }

        storage_vals.sort();
        let median = storage_vals[storage_vals.len() / 2];
        let p95 = storage_vals[(storage_vals.len() as f64 * 0.95) as usize];
        let availability = available as f64 / (available + unavailable).max(1) as f64;

        (total_chain, total_own / self.users.len() as u64, median, p95, self.content.len() as u64, availability)
    }
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

fn run_lane_scenario(
    name: &str,
    num_users: u32,
    num_lanes: u32,
    lanes_per_user: u32,
    days: u32,
    posts_per_day: u32,
    views_per_user_per_day: f64,
    cache_mb: u64,
    text_ratio: f64,
    image_size_kb: u64,
) {
    println!("\n═══════════════════════════════════════════════════════════════════════════");
    println!("  {}", name);
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  Users: {}  Lanes: {}  Lanes/user: {}  Days: {}",
             num_users, num_lanes, lanes_per_user, days);
    println!("  Posts/day: {}  Views/user/day: {:.0}  Cache: {} MB",
             posts_per_day, views_per_user_per_day, cache_mb);
    println!("  Text: {:.0}%  Image avg: {} KB", text_ratio * 100.0, image_size_kb);
    println!("───────────────────────────────────────────────────────────────────────────");

    let ticks_per_day = 24;
    let total_ticks = days * ticks_per_day;
    let posts_per_tick = posts_per_day / ticks_per_day;
    let views_per_tick = views_per_user_per_day / ticks_per_day as f64;

    let mut sim = LaneSimulation::new(
        num_users,
        num_lanes,
        lanes_per_user,
        cache_mb,
        text_ratio,
        image_size_kb,
        42,
    );

    for tick in 0..total_ticks {
        sim.simulate_tick(posts_per_tick, views_per_tick);

        if (tick + 1) % (14 * ticks_per_day) == 0 {
            let (chain, _own, median, _p95, posts, avail) = sim.run_analysis();
            println!("  Day {:>3}: {:>6} posts, {:.1}% avail, chain: {}, median: {}",
                     (tick + 1) / ticks_per_day, posts, avail * 100.0,
                     format_bytes(chain), format_bytes(median + chain));
        }
    }

    let (chain, own_avg, median, p95, total_posts, availability) = sim.run_analysis();

    println!("───────────────────────────────────────────────────────────────────────────");
    println!("  FINAL: {} posts, {:.1}% available", total_posts, availability * 100.0);
    println!("  Chain: {}  Own avg: {}  Median: {}  P95: {}",
             format_bytes(chain), format_bytes(own_avg),
             format_bytes(median + chain), format_bytes(p95 + chain));
}

fn main() {
    println!("\n🏊 SWIMCHAIN EXTENDED SCENARIOS 🏊\n");

    // Scenario A: Many lanes (12 like original spec)
    run_lane_scenario(
        "A: 12 LANES PER USER (Original spec)",
        5000, 100, 12, 60, 2500, 15.0, 350, 0.70, 2000,
    );

    // Scenario B: Fewer lanes (8)
    run_lane_scenario(
        "B: 8 LANES PER USER",
        5000, 100, 8, 60, 2500, 15.0, 350, 0.70, 2000,
    );

    // Scenario C: Very few lanes (4)
    run_lane_scenario(
        "C: 4 LANES PER USER",
        5000, 100, 4, 60, 2500, 15.0, 350, 0.70, 2000,
    );

    // Scenario D: Image-heavy content (50% images)
    run_lane_scenario(
        "D: IMAGE-HEAVY (50% images, 3MB avg)",
        5000, 50, 8, 60, 2500, 15.0, 350, 0.50, 3000,
    );

    // Scenario E: Massive images (5MB avg)
    run_lane_scenario(
        "E: MASSIVE IMAGES (30% images, 5MB avg)",
        5000, 50, 8, 60, 2500, 15.0, 350, 0.70, 5000,
    );

    // Scenario F: Minimum viable network
    run_lane_scenario(
        "F: MINIMUM VIABLE (100 users)",
        100, 10, 5, 60, 50, 10.0, 350, 0.70, 2000,
    );

    // Scenario G: Long duration (180 days)
    run_lane_scenario(
        "G: LONG DURATION (180 days)",
        5000, 50, 8, 180, 2500, 15.0, 350, 0.70, 2000,
    );

    // Scenario H: High posting rate
    run_lane_scenario(
        "H: HIGH POSTING (10K posts/day)",
        10000, 100, 8, 60, 10000, 20.0, 350, 0.70, 2000,
    );
}
