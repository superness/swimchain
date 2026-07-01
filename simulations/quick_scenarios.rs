//! Quick simulation scenarios - 30-day runs, smaller populations

use std::collections::{HashMap, HashSet, VecDeque};
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;

struct UserNode {
    cache: VecDeque<(u64, u64)>,
    cache_used: u64,
    cache_limit: u64,
    own_content: HashSet<u64>,
    own_content_size: u64,
    is_online: bool,
    activity_level: f64,
}

impl UserNode {
    fn new(cache_limit: u64, activity_level: f64) -> Self {
        Self {
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
        self.own_content.contains(&content_id) ||
            self.cache.iter().any(|(id, _)| *id == content_id)
    }

    fn cache_content(&mut self, content_id: u64, size: u64) {
        if self.own_content.contains(&content_id) { return; }
        if self.cache.iter().any(|(id, _)| *id == content_id) { return; }

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
}

struct Simulation {
    users: Vec<UserNode>,
    content: HashMap<u64, (u64, u32)>,  // id -> (size, author_id)
    next_id: u64,
    rng: StdRng,
    text_ratio: f64,
    image_size_avg: u64,
    chain_records: u64,
}

impl Simulation {
    fn new(num_users: u32, cache_mb: u64, text_ratio: f64, image_kb: u64, seed: u64) -> Self {
        let mut rng = StdRng::seed_from_u64(seed);
        let users = (0..num_users)
            .map(|_| UserNode::new(cache_mb * 1024 * 1024, rng.gen::<f64>().powf(2.0)))
            .collect();

        Self {
            users,
            content: HashMap::new(),
            next_id: 0,
            rng,
            text_ratio,
            image_size_avg: image_kb * 1024,
            chain_records: 0,
        }
    }

    fn gen_size(&mut self) -> u64 {
        if self.rng.gen::<f64>() < self.text_ratio {
            2000  // 2KB text
        } else {
            let size = (self.image_size_avg as f64 * (0.5 + self.rng.gen::<f64>())) as u64;
            size.clamp(100_000, 10_000_000)
        }
    }

    fn tick(&mut self, posts: u32, views: f64) {
        // Toggle online status
        for user in &mut self.users {
            user.is_online = self.rng.gen::<f64>() < 0.80;
        }

        // Create posts
        let total_activity: f64 = self.users.iter().filter(|u| u.is_online).map(|u| u.activity_level).sum();
        if total_activity == 0.0 { return; }

        for _ in 0..posts {
            let mut pick = self.rng.gen::<f64>() * total_activity;
            for (idx, user) in self.users.iter().enumerate() {
                if !user.is_online { continue; }
                pick -= user.activity_level;
                if pick <= 0.0 {
                    let size = self.gen_size();
                    let id = self.next_id;
                    self.next_id += 1;
                    self.content.insert(id, (size, idx as u32));
                    self.users[idx].add_own_content(id, size);
                    self.chain_records += 1;
                    break;
                }
            }
        }

        // Simulate views
        let ids: Vec<u64> = self.content.keys().cloned().collect();
        if ids.is_empty() { return; }

        for user in &mut self.users {
            if !user.is_online { continue; }
            let n = (views * user.activity_level * 2.0) as u32;
            for _ in 0..n {
                let idx = (self.rng.gen::<f64>().powf(1.5) * ids.len() as f64) as usize;
                let idx = ids.len().saturating_sub(1).min(idx);
                let id = ids[ids.len() - 1 - idx];
                if let Some((size, _)) = self.content.get(&id) {
                    if *size > 10_000 {
                        user.cache_content(id, *size);
                    }
                }
            }
        }
    }

    fn analyze(&self) -> (u64, u64, u64, u64, f64) {
        let chain_size = self.chain_records * 226;

        let mut avail = 0u64;
        let mut unavail = 0u64;
        for (id, _) in &self.content {
            let has_seeder = self.users.iter().any(|u| u.is_online && u.has_content(*id));
            if has_seeder { avail += 1; } else { unavail += 1; }
        }

        let mut storage: Vec<u64> = self.users.iter()
            .map(|u| u.own_content_size + u.cache_used)
            .collect();
        storage.sort();

        let median = storage[storage.len() / 2];
        let p95 = storage[(storage.len() as f64 * 0.95) as usize];
        let rate = avail as f64 / (avail + unavail).max(1) as f64;

        (chain_size, median, p95, self.content.len() as u64, rate)
    }
}

fn fmt(bytes: u64) -> String {
    if bytes >= 1_000_000_000 { format!("{:.1}GB", bytes as f64 / 1e9) }
    else if bytes >= 1_000_000 { format!("{:.1}MB", bytes as f64 / 1e6) }
    else if bytes >= 1000 { format!("{:.1}KB", bytes as f64 / 1e3) }
    else { format!("{}B", bytes) }
}

fn run(name: &str, users: u32, days: u32, posts_day: u32, views: f64, cache: u64, text: f64, img: u64) {
    let tpd = 24;
    let ppd = posts_day / tpd;
    let vpd = views / tpd as f64;

    let mut sim = Simulation::new(users, cache, text, img, 42);

    for d in 0..(days * tpd) {
        sim.tick(ppd, vpd);
    }

    let (chain, median, p95, posts, avail) = sim.analyze();

    println!("│ {:30} │ {:>6} │ {:>6} │ {:>8} │ {:>8} │ {:>8} │ {:>5.1}% │",
             name, users, days, fmt(chain), fmt(median + chain), fmt(p95 + chain), avail * 100.0);
}

fn main() {
    println!("\n🏊 SWIMCHAIN QUICK SIMULATION RESULTS 🏊");
    println!("═══════════════════════════════════════════════════════════════════════════════════════\n");

    println!("┌────────────────────────────────┬────────┬────────┬──────────┬──────────┬──────────┬────────┐");
    println!("│ Scenario                       │  Users │  Days  │   Chain  │  Median  │   P95    │ Avail  │");
    println!("├────────────────────────────────┼────────┼────────┼──────────┼──────────┼──────────┼────────┤");

    // Baseline scenarios
    run("Small (1K users)", 1000, 30, 500, 20.0, 350, 0.70, 2000);
    run("Medium (5K users)", 5000, 30, 2500, 15.0, 350, 0.70, 2000);
    run("Large (10K users)", 10000, 30, 5000, 15.0, 350, 0.70, 2000);

    println!("├────────────────────────────────┼────────┼────────┼──────────┼──────────┼──────────┼────────┤");

    // Image size variations
    run("Tiny images (500KB avg)", 5000, 30, 2500, 15.0, 350, 0.70, 500);
    run("Normal images (2MB avg)", 5000, 30, 2500, 15.0, 350, 0.70, 2000);
    run("Large images (5MB avg)", 5000, 30, 2500, 15.0, 350, 0.70, 5000);
    run("Huge images (10MB avg)", 5000, 30, 2500, 15.0, 350, 0.70, 10000);

    println!("├────────────────────────────────┼────────┼────────┼──────────┼──────────┼──────────┼────────┤");

    // Text ratio variations
    run("Text-only (95% text)", 5000, 30, 2500, 15.0, 350, 0.95, 2000);
    run("Text-heavy (80% text)", 5000, 30, 2500, 15.0, 350, 0.80, 2000);
    run("Image-heavy (50% text)", 5000, 30, 2500, 15.0, 350, 0.50, 2000);
    run("Image-first (30% text)", 5000, 30, 2500, 15.0, 350, 0.30, 2000);

    println!("├────────────────────────────────┼────────┼────────┼──────────┼──────────┼──────────┼────────┤");

    // Cache size variations
    run("Tiny cache (50MB)", 5000, 30, 2500, 15.0, 50, 0.70, 2000);
    run("Mobile cache (100MB)", 5000, 30, 2500, 15.0, 100, 0.70, 2000);
    run("Standard cache (350MB)", 5000, 30, 2500, 15.0, 350, 0.70, 2000);
    run("Large cache (1GB)", 5000, 30, 2500, 15.0, 1000, 0.70, 2000);

    println!("├────────────────────────────────┼────────┼────────┼──────────┼──────────┼──────────┼────────┤");

    // Engagement variations
    run("Low engagement (5 views/day)", 5000, 30, 2500, 5.0, 350, 0.70, 2000);
    run("Med engagement (15 views/day)", 5000, 30, 2500, 15.0, 350, 0.70, 2000);
    run("High engagement (50 views/day)", 5000, 30, 2500, 50.0, 350, 0.70, 2000);

    println!("├────────────────────────────────┼────────┼────────┼──────────┼──────────┼──────────┼────────┤");

    // Minimum viable
    run("MVP (100 users)", 100, 30, 50, 10.0, 350, 0.70, 2000);
    run("Tiny (500 users)", 500, 30, 250, 15.0, 350, 0.70, 2000);

    println!("├────────────────────────────────┼────────┼────────┼──────────┼──────────┼──────────┼────────┤");

    // Worst case: image-heavy + small cache + low engagement
    run("WORST: img-heavy+small cache", 5000, 30, 2500, 5.0, 100, 0.30, 5000);

    // Best case: text-first + large cache + high engagement
    run("BEST: text+large cache", 5000, 30, 2500, 50.0, 1000, 0.95, 500);

    println!("└────────────────────────────────┴────────┴────────┴──────────┴──────────┴──────────┴────────┘\n");

    println!("Legend:");
    println!("  Chain  = Chain record storage (everyone syncs this)");
    println!("  Median = Median user total storage (chain + own content + cache)");
    println!("  P95    = 95th percentile user storage");
    println!("  Avail  = Content availability (% of content with at least 1 online seeder)\n");
}
