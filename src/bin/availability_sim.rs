//! Content Availability Simulation
//!
//! Models the real Swimchain architecture:
//! - Chain layer: Everyone syncs records (small)
//! - Content layer: BitTorrent-style fetch on demand
//!
//! Run with: cargo run --release --bin availability_sim

use rand::Rng;
use std::collections::{HashMap, HashSet, VecDeque};

/// A content blob (image, video, etc.)
#[derive(Clone, Debug)]
struct ContentBlob {
    id: u64,
    size_bytes: u64,
    #[allow(dead_code)]
    created_at: u64,
    #[allow(dead_code)]
    creator: u64,
    views: u64,
}

/// A user with a cache
#[derive(Debug)]
struct User {
    #[allow(dead_code)]
    id: u64,
    cache: VecDeque<u64>,
    cache_bytes: u64,
    max_cache_bytes: u64,
    own_content: HashSet<u64>,
    online_probability: f64,
}

impl User {
    fn new(id: u64, max_cache_mb: u64) -> Self {
        Self {
            id,
            cache: VecDeque::new(),
            cache_bytes: 0,
            max_cache_bytes: max_cache_mb * 1024 * 1024,
            own_content: HashSet::new(),
            online_probability: 0.3,
        }
    }

    fn view_content(&mut self, content_id: u64, content_size: u64) {
        if let Some(pos) = self.cache.iter().position(|&x| x == content_id) {
            self.cache.remove(pos);
            self.cache_bytes = self.cache_bytes.saturating_sub(content_size);
        }

        self.cache.push_front(content_id);
        self.cache_bytes += content_size;

        while self.cache_bytes > self.max_cache_bytes {
            if self.cache.pop_back().is_some() {
                self.cache_bytes = self.cache_bytes.saturating_sub(content_size);
            } else {
                break;
            }
        }
    }

    fn has_content(&self, content_id: u64) -> bool {
        self.own_content.contains(&content_id) || self.cache.contains(&content_id)
    }

    fn is_online(&self, rng: &mut impl Rng) -> bool {
        rng.gen::<f64>() < self.online_probability
    }
}

struct Network {
    users: HashMap<u64, User>,
    content: HashMap<u64, ContentBlob>,
    next_content_id: u64,
    current_time: u64,
}

impl Network {
    fn new() -> Self {
        Self {
            users: HashMap::new(),
            content: HashMap::new(),
            next_content_id: 0,
            current_time: 0,
        }
    }

    fn add_users(&mut self, count: u64, cache_mb: u64) {
        for i in 0..count {
            self.users.insert(i, User::new(i, cache_mb));
        }
    }

    fn post_content(&mut self, user_id: u64, size_bytes: u64) -> u64 {
        let content_id = self.next_content_id;
        self.next_content_id += 1;

        let blob = ContentBlob {
            id: content_id,
            size_bytes,
            created_at: self.current_time,
            creator: user_id,
            views: 0,
        };

        self.content.insert(content_id, blob);

        if let Some(user) = self.users.get_mut(&user_id) {
            user.own_content.insert(content_id);
        }

        content_id
    }

    fn view_content(&mut self, user_id: u64, content_id: u64) -> bool {
        let size = match self.content.get(&content_id) {
            Some(c) => c.size_bytes,
            None => return false,
        };

        if let Some(user) = self.users.get_mut(&user_id) {
            user.view_content(content_id, size);
        }

        if let Some(content) = self.content.get_mut(&content_id) {
            content.views += 1;
        }

        true
    }

    fn check_availability(&self, content_id: u64, rng: &mut impl Rng) -> (bool, u64) {
        let mut seeders_total = 0u64;
        let mut seeders_online = 0u64;

        for user in self.users.values() {
            if user.has_content(content_id) {
                seeders_total += 1;
                if user.is_online(rng) {
                    seeders_online += 1;
                }
            }
        }

        (seeders_online > 0, seeders_total)
    }

    fn tick(&mut self) {
        self.current_time += 1;
    }
}

#[derive(Debug)]
struct SimulationResult {
    total_content: u64,
    available_content: u64,
    availability_by_views: HashMap<u64, (u64, u64)>,
    avg_seeders_by_views: HashMap<u64, f64>,
}

fn run_simulation(
    num_users: u64,
    cache_mb: u64,
    posts_per_user: u64,
    image_probability: f64,
    image_size_bytes: u64,
    text_size_bytes: u64,
    views_per_post_avg: f64,
    days_to_simulate: u64,
) -> SimulationResult {
    let mut rng = rand::thread_rng();
    let mut network = Network::new();

    network.add_users(num_users, cache_mb);

    let posts_per_day = (num_users * posts_per_user) / days_to_simulate.max(1);

    for _ in 0..days_to_simulate {
        network.tick();

        for _ in 0..posts_per_day {
            let user_id = rng.gen_range(0..num_users);
            let is_image = rng.gen::<f64>() < image_probability;
            let size = if is_image {
                image_size_bytes
            } else {
                text_size_bytes
            };

            let content_id = network.post_content(user_id, size);

            let view_count = {
                let base = rng.gen::<f64>();
                let views = (base.powf(0.5) * views_per_post_avg * 3.0) as u64;
                views.min(num_users)
            };

            for _ in 0..view_count {
                let viewer_id = rng.gen_range(0..num_users);
                if viewer_id != user_id {
                    network.view_content(viewer_id, content_id);
                }
            }
        }
    }

    let mut available = 0u64;
    let mut total = 0u64;
    let mut by_views: HashMap<u64, (u64, u64)> = HashMap::new();
    let mut seeders_by_views: HashMap<u64, Vec<u64>> = HashMap::new();

    for content in network.content.values() {
        total += 1;
        let (is_available, seeder_count) = network.check_availability(content.id, &mut rng);

        if is_available {
            available += 1;
        }

        let view_bucket = match content.views {
            0 => 0,
            1..=5 => 5,
            6..=20 => 20,
            21..=100 => 100,
            _ => 1000,
        };

        let entry = by_views.entry(view_bucket).or_insert((0, 0));
        entry.1 += 1;
        if is_available {
            entry.0 += 1;
        }

        seeders_by_views
            .entry(view_bucket)
            .or_default()
            .push(seeder_count);
    }

    let avg_seeders: HashMap<u64, f64> = seeders_by_views
        .iter()
        .map(|(&bucket, seeders)| {
            let avg = seeders.iter().sum::<u64>() as f64 / seeders.len() as f64;
            (bucket, avg)
        })
        .collect();

    SimulationResult {
        total_content: total,
        available_content: available,
        availability_by_views: by_views,
        avg_seeders_by_views: avg_seeders,
    }
}

fn main() {
    println!();
    println!("==============================================================================");
    println!("              SWIMCHAIN CONTENT AVAILABILITY SIMULATION");
    println!("==============================================================================");
    println!();

    let scenarios = [
        ("Small Network (100 users)", 100u64, 500u64, 50u64, 30u64),
        ("Medium Network (1K users)", 1000, 500, 50, 30),
        ("Large Network (10K users)", 10000, 500, 20, 30),
    ];

    for (name, users, cache_mb, posts_per_user, days) in scenarios {
        println!("------------------------------------------------------------------------------");
        println!(" Scenario: {}", name);
        println!(
            " Users: {} | Cache: {}MB | Posts/user: {} | Days: {}",
            users, cache_mb, posts_per_user, days
        );
        println!("------------------------------------------------------------------------------");

        let result = run_simulation(
            users,
            cache_mb,
            posts_per_user,
            0.20,
            2_000_000,
            2_000,
            (users as f64 * 0.05).max(5.0),
            days,
        );

        let availability_pct =
            result.available_content as f64 / result.total_content as f64 * 100.0;

        println!(
            " Overall: {}/{} content available ({:.1}%)",
            result.available_content, result.total_content, availability_pct
        );
        println!();
        println!(" Availability by engagement:");

        let buckets = [0u64, 5, 20, 100, 1000];
        let bucket_names = [
            "0 views",
            "1-5 views",
            "6-20 views",
            "21-100 views",
            "100+ views",
        ];

        for (i, &bucket) in buckets.iter().enumerate() {
            if let Some((avail, total)) = result.availability_by_views.get(&bucket) {
                if *total > 0 {
                    let pct = *avail as f64 / *total as f64 * 100.0;
                    let seeders = result.avg_seeders_by_views.get(&bucket).unwrap_or(&0.0);
                    println!(
                        "   {:12}: {:>5}/{:<5} ({:>5.1}%) - avg {:.1} seeders",
                        bucket_names[i], avail, total, pct, seeders
                    );
                }
            }
        }
        println!();
    }

    println!("==============================================================================");
    println!("                    IMAGE SIZE IMPACT (1K users, 500MB cache)");
    println!("==============================================================================");

    for (size_name, size_bytes) in [
        ("500KB", 500_000u64),
        ("2MB", 2_000_000),
        ("5MB", 5_000_000),
    ] {
        let result = run_simulation(1000, 500, 50, 0.20, size_bytes, 2000, 50.0, 30);
        let pct = result.available_content as f64 / result.total_content as f64 * 100.0;
        println!(
            " Image size {}: {:.1}% overall availability",
            size_name, pct
        );
    }
    println!();

    println!("==============================================================================");
    println!("                    CACHE SIZE IMPACT (1K users, 2MB images)");
    println!("==============================================================================");

    for cache_mb in [100u64, 250, 500, 1000] {
        let result = run_simulation(1000, cache_mb, 50, 0.20, 2_000_000, 2000, 50.0, 30);
        let pct = result.available_content as f64 / result.total_content as f64 * 100.0;
        println!(" Cache {}MB: {:.1}% overall availability", cache_mb, pct);
    }
    println!();
}
