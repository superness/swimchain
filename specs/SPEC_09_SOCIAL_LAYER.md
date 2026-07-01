# SPEC_09: Social Layer

**Version:** 1.0.0
**Status:** Draft
**Created:** 2025-12-25
**Dependencies:** SPEC_01 (Identity), SPEC_02 (Content/Decay), SPEC_07 (Content Distribution)

---

## 1. Overview

### 1.1 Purpose

The Social Layer makes visible the contribution and participation that keeps the network alive. This is NOT gamification added on top—it is **first-class protocol infrastructure** that:

1. Tracks contribution at the protocol level
2. Provides non-transferable, identity-bound benefits
3. Creates social visibility for participation
4. Incentivizes network health without creating an economy

### 1.2 Core Philosophy

```
IT'S SOCIAL MEDIA, NOT INFRASTRUCTURE
═══════════════════════════════════════════════════════════════════════

We're not building servers that happen to have social features.
We're building a social network where participation keeps lights on.

The social layer makes this visible:
├── Your contribution is seen
├── Your effort is recognized
├── Your participation matters
├── You're not anonymous infrastructure
└── You're a swimmer in the pool
```

### 1.3 Design Principles

| Principle | Meaning |
|-----------|---------|
| **Visible** | Contribution is shown, not hidden |
| **Social** | Recognition comes from community, not system |
| **Non-transferable** | Benefits are tied to identity, not tradeable |
| **Non-economic** | No tokens, no markets, no speculation |
| **Capability-based** | Contribution earns abilities, not currency |
| **Sustainable** | Incentives align with network health |

---

## 2. Contribution Metrics

### 2.1 The Core Exchange

**CRITICAL**: The network needs HOSTING, not just activity. This is the foundation:

```
THE CORE EXCHANGE
═══════════════════════════════════════════════════════════════════════

What the network NEEDS:          What we REWARD:
├── Content to be HOSTED         ├── Hosting other people's content
├── Bandwidth to be SERVED       ├── Serving bandwidth to peers
├── Nodes to be ONLINE           ├── Being online when others need you
├── Peers to be AVAILABLE        ├── Keeping the network alive
└── This is infrastructure       └── NOT just "being active" or "posting"

THE DISTINCTION:
├── Chain contributions (posting, engaging):
│   ├── Already have incentive: you want to participate
│   ├── PoW is the cost, not the reward
│   └── Your content living = your reward → No extra incentive needed
│
└── Hosting contributions (serving, seeding):
    ├── NO natural incentive
    ├── Uses YOUR resources for OTHERS
    ├── Battery, bandwidth, storage
    └── THIS is what needs rewarding
```

### 2.2 What Gets Tracked

The protocol tracks **hosting contribution** at the identity level:

| Metric | What It Measures | How Tracked | Weight |
|--------|------------------|-------------|--------|
| `bandwidth_served` | Data served to peers (bytes/period) | Peer attestations | **Primary** |
| `content_hosted_hours` | GB-hours of content stored | Local measurement × uptime | **Primary** |
| `uptime_ratio` | Time online vs. offline (0.0-1.0) | Peer observations | **Primary** |
| `peer_requests_served` | Number of peer requests answered | Request logs | **Secondary** |
| `posts_kept_alive` | Content you contributed PoW to | Engagement pool records | Secondary |
| `streak_days` | Consecutive days with hosting activity | Daily heartbeat | Tertiary |

**Note**: `spaces_active` and post counts are NOT contribution metrics. Those are participation, not infrastructure.

### 2.3 Contribution Score Formula

```rust
/// Primary hosting contribution score (per period)
pub fn contribution_score(metrics: &HostingMetrics) -> u64 {
    // Primary: actual hosting work
    let bandwidth_score = metrics.bandwidth_served_gb as u64 * 100;  // 100 points per GB served
    let hosting_score = (metrics.content_hosted_gb as f64 * metrics.uptime_ratio * 10.0) as u64;  // GB × uptime × 10
    let request_score = metrics.peer_requests_served / 100;  // 1 point per 100 requests

    // Secondary: engagement (much lower weight)
    let engagement_score = metrics.posts_kept_alive as u64;  // 1 point each

    bandwidth_score + hosting_score + request_score + engagement_score
}

// Example calculations:
//
// Good hosting citizen (Lifeguard candidate):
// ├── Served 50GB this month: 5000 points
// ├── Hosted 5GB × 70% uptime × 10: 35 points
// ├── 5000 requests / 100: 50 points
// └── 20 posts kept alive: 20 points
// Total: 5105 points
//
// Active poster but not hosting:
// ├── Served 1GB: 100 points
// ├── Hosted 0.5GB × 20% uptime × 10: 1 point
// ├── 100 requests / 100: 1 point
// └── 50 posts kept alive: 50 points
// Total: 152 points
//
// The difference is MASSIVE. Hosting dominates.
```

### 2.4 Contribution Record Structure

```rust
/// On-chain contribution record (per identity, per period)
pub struct ContributionRecord {
    /// Identity this record belongs to
    pub identity: PublicKey,

    /// Period this covers (e.g., week number since genesis)
    pub period: u32,

    /// Bandwidth served in this period (bytes)
    pub bandwidth_served: u64,

    /// Uptime ratio (0-10000 representing 0.00-100.00%)
    pub uptime_ratio: u16,

    /// Unique content blobs served
    pub content_served_count: u32,

    /// Posts/content kept alive via engagement PoW
    pub posts_supported: u32,

    /// Spaces with activity this period
    pub spaces_active: u16,

    /// Attestations from peers confirming this
    pub attestations: Vec<Attestation>,

    /// Hash of previous contribution record (chain)
    pub previous_hash: Hash256,

    /// Signature proving this identity claims this record
    pub signature: Signature,
}

/// Peer attestation confirming contribution
pub struct Attestation {
    /// Peer providing attestation
    pub attester: PublicKey,

    /// What they're attesting (bandwidth, uptime, etc.)
    pub attestation_type: AttestationType,

    /// Value they observed
    pub observed_value: u64,

    /// Signature
    pub signature: Signature,
}
```

### 2.5 Verification Model

Contribution is **peer-verified**, not self-reported:

```
CONTRIBUTION VERIFICATION
═══════════════════════════════════════════════════════════════════════

Self-claim: "I served 10GB this week"
├── Meaningless without verification

Peer attestation:
├── @alice requested 500MB from you → attests 500MB served
├── @bob requested 300MB from you → attests 300MB served
├── @carol requested 200MB from you → attests 200MB served
└── Total attested: 1GB (verifiable)

Uptime:
├── Peers ping you periodically
├── Respond = online, no response = offline
├── Multiple peers create redundancy
└── Uptime ratio computed from observations

Anti-gaming:
├── Can't fake bandwidth (peers verify receipt)
├── Can't fake uptime (peers observe presence)
├── Sybil attestations = same resources required
└── Diminishing returns prevent gaming
```

---

## 3. Swimmer Levels

### 3.1 Level Definitions

Levels are computed from **hosting contribution**, not activity or post counts:

| Level | Name | Icon | Hosting Requirements |
|-------|------|------|----------------------|
| 0 | **New Swimmer** | 🏊 | Just joined, no hosting history yet |
| 1 | **Regular** | 🏊‍♂️ | 7+ days, any bandwidth served |
| 2 | **Resident** | 🏊‍♀️ | 30+ days, 10GB+ served lifetime, 50%+ uptime |
| 3 | **Lifeguard** | 🛟 | 50GB+/month served, 70%+ uptime, background sync enabled |
| 4 | **Anchor** | ⚓ | 200GB+/month served, 90%+ uptime |
| 5 | **Pool Keeper** | 🏛️ | 500GB+/month served, 95%+ uptime, basically a seed node |

**Key insight**: Levels are about HOSTING, not posting. An active poster with no hosting stays at Regular. A silent node that serves 500GB/month is a Pool Keeper.

### 3.2 Level Computation

```rust
// Hosting thresholds (per month)
const POOL_KEEPER_BANDWIDTH_GB: u64 = 500;
const ANCHOR_BANDWIDTH_GB: u64 = 200;
const LIFEGUARD_BANDWIDTH_GB: u64 = 50;
const RESIDENT_LIFETIME_GB: u64 = 10;

/// Compute swimmer level from HOSTING contribution (not activity)
pub fn compute_level(history: &[ContributionRecord]) -> SwimmerLevel {
    let total_days = count_active_days(history);
    let avg_uptime = average_uptime_ratio(history);
    let monthly_bandwidth_gb = bandwidth_served_last_30_days(history);
    let lifetime_bandwidth_gb = total_bandwidth_served(history);
    let recent_hosting = has_served_anything(history, 7); // last 7 days

    // Must have recent hosting activity to maintain high level
    if !recent_hosting {
        // Cap at Regular if not actively hosting
        return SwimmerLevel::Regular.min(
            compute_base_level(total_days, lifetime_bandwidth_gb)
        );
    }

    // Pool Keeper: 500GB+/month, 95%+ uptime
    if monthly_bandwidth_gb >= POOL_KEEPER_BANDWIDTH_GB && avg_uptime >= 0.95 {
        return SwimmerLevel::PoolKeeper;
    }

    // Anchor: 200GB+/month, 90%+ uptime
    if monthly_bandwidth_gb >= ANCHOR_BANDWIDTH_GB && avg_uptime >= 0.90 {
        return SwimmerLevel::Anchor;
    }

    // Lifeguard: 50GB+/month, 70%+ uptime
    if monthly_bandwidth_gb >= LIFEGUARD_BANDWIDTH_GB && avg_uptime >= 0.70 {
        return SwimmerLevel::Lifeguard;
    }

    // Resident: 30+ days, 10GB+ lifetime, 50%+ uptime
    if total_days >= 30 && lifetime_bandwidth_gb >= RESIDENT_LIFETIME_GB && avg_uptime >= 0.50 {
        return SwimmerLevel::Resident;
    }

    // Regular: 7+ days with any hosting
    if total_days >= 7 && lifetime_bandwidth_gb > 0 {
        return SwimmerLevel::Regular;
    }

    SwimmerLevel::NewSwimmer
}
```

**What matters for levels:**
- Bandwidth served (primary - how much did you help others?)
- Uptime (primary - are you available when needed?)
- Time in network (secondary - trust builds over time)

**What does NOT matter for levels:**
- Number of posts created
- Engagement received
- Spaces joined
- Follower count

### 3.3 Level Display

Levels are visible on identity in protocol:

```rust
pub struct IdentityProfile {
    pub public_key: PublicKey,
    pub display_name: Option<String>,

    /// Current swimmer level (protocol-computed)
    pub swimmer_level: SwimmerLevel,

    /// Current streak
    pub streak_days: u16,

    /// Spaces where this identity is active
    pub active_spaces: Vec<SpaceId>,

    /// Contribution summary (last 30 days)
    pub contribution_summary: ContributionSummary,
}
```

---

## 4. Contribution Benefits

### 4.1 The Fair Exchange

Benefits are **personal and non-transferable**. The trade is explicit:

```
THE BENEFIT EXCHANGE
═══════════════════════════════════════════════════════════════════════

YOU GIVE                      →  YOU GET
────────────────────────────────────────────────────────────────────
Bandwidth (serving others)    →  Reduced PoW (post faster)
Storage (hosting content)     →  Extended decay (your content lives longer)
Uptime (being available)      →  Priority sync (served first when busy)
Consistency (streaks)         →  Space creation rights

This is FAIR EXCHANGE:
├── Not charity
├── Not altruism
├── You give network resources
├── You get personal benefits
└── Everyone wins
```

### 4.2 Benefit Types

| Benefit | What It Does | Who Gets It | Rationale |
|---------|--------------|-------------|-----------|
| **PoW Reduction** | Faster posting | Hosts | You gave compute to network, get compute back |
| **Decay Extension** | Your content lives longer | Hosts | You keep content alive, yours lives longer |
| **Space Creation** | Ability to create new spaces | Residents+ | Earned capability, prevents spam |
| **Priority Sync** | Your requests served first when busy | Lifeguards+ | You serve others, you get served |
| **Governance Weight** | More say in space decisions | Active hosts | Skin in the game |

### 4.3 PoW Reduction

Contributors spend less compute to post:

```rust
/// Calculate PoW difficulty for an identity
pub fn adjusted_difficulty(base: Difficulty, level: SwimmerLevel) -> Difficulty {
    let reduction = match level {
        SwimmerLevel::NewSwimmer => 0,     // 0% reduction
        SwimmerLevel::Regular => 0,         // 0% reduction
        SwimmerLevel::Resident => 10,       // 10% reduction
        SwimmerLevel::Lifeguard => 20,      // 20% reduction
        SwimmerLevel::Anchor => 35,         // 35% reduction
        SwimmerLevel::PoolKeeper => 50,     // 50% reduction (max)
    };

    base.reduce_by_percent(reduction)
}
```

**Rationale:**
- Contribution = bandwidth/compute given to network
- Reduced PoW = compute returned
- Fair trade, not currency

### 4.4 Decay Extension

Your content survives longer:

```rust
/// Calculate decay multiplier for content author
pub fn decay_multiplier(level: SwimmerLevel) -> f32 {
    match level {
        SwimmerLevel::NewSwimmer => 1.0,   // Normal decay
        SwimmerLevel::Regular => 1.0,       // Normal decay
        SwimmerLevel::Resident => 1.2,      // 20% longer
        SwimmerLevel::Lifeguard => 1.5,     // 50% longer
        SwimmerLevel::Anchor => 1.8,        // 80% longer
        SwimmerLevel::PoolKeeper => 2.0,    // 2x longer (max)
    };
}
```

**Rationale:**
- You keep content alive for others → yours lives longer
- Reciprocity without currency

### 4.5 Space Creation Rights

Only engaged users can create spaces:

```rust
/// Check if identity can create a new space
pub fn can_create_space(level: SwimmerLevel) -> bool {
    level >= SwimmerLevel::Resident
}
```

**Rationale:**
- Prevents space spam
- Rewards engagement with capability
- Not purchasable

### 4.6 Priority Sync

When network is congested, contributors get priority:

```rust
/// Priority tier for request handling
pub fn sync_priority(level: SwimmerLevel) -> Priority {
    match level {
        SwimmerLevel::PoolKeeper => Priority::Highest,
        SwimmerLevel::Anchor => Priority::High,
        SwimmerLevel::Lifeguard => Priority::AboveNormal,
        _ => Priority::Normal,
    }
}
```

**Rationale:**
- You help serve others → you get served faster
- Only matters under load
- Fair priority, not gatekeeping

---

## 5. Streaks and Achievements

### 5.1 Swim Streaks

Consecutive days of activity:

```rust
pub struct StreakTracker {
    /// Current streak length in days
    pub current_streak: u16,

    /// Longest streak ever
    pub best_streak: u16,

    /// Last day activity was recorded
    pub last_active_day: u32, // days since genesis

    /// Total lifetime active days
    pub total_active_days: u32,
}

impl StreakTracker {
    /// Record activity for today
    pub fn record_activity(&mut self, today: u32) {
        if today == self.last_active_day {
            // Already recorded today
            return;
        }

        if today == self.last_active_day + 1 {
            // Consecutive day - extend streak
            self.current_streak += 1;
            if self.current_streak > self.best_streak {
                self.best_streak = self.current_streak;
            }
        } else {
            // Streak broken - restart
            self.current_streak = 1;
        }

        self.last_active_day = today;
        self.total_active_days += 1;
    }
}
```

### 5.2 Streak Display

```
PROFILE: @alice
═══════════════════════════════════════════════════════════════════════

🛟 Lifeguard

🔥 14-day hosting streak
   Best: 42 days | Total: 156 days active

📡 HOSTING STATS (Last 30 days):
   ├── Bandwidth served: 67GB
   ├── Content hosted: 12GB
   ├── Uptime: 73%
   ├── Peer requests served: 8,234
   └── Posts kept alive: 47

📈 LIFETIME:
   ├── Total bandwidth served: 892GB
   ├── Hosting streak record: 42 days
   └── Contribution score: 89,247

💪 EARNED BENEFITS:
   ├── PoW reduction: 20%
   ├── Decay extension: 1.5x
   └── Can create spaces: Yes
```

**Note**: The profile emphasizes HOSTING metrics, not post counts or engagement received. This is a hosting profile, not a content profile.

### 5.3 Achievements

Protocol-tracked accomplishments (mostly hosting-focused):

| Achievement | Trigger | Badge |
|-------------|---------|-------|
| **First Stroke** | First post ever | 🌊 |
| **First Serve** | First content served to a peer | 📡 |
| **Week Swimmer** | 7-day hosting streak | 📅 |
| **Month Swimmer** | 30-day hosting streak | 📆 |
| **Centurion** | 100-day hosting streak | 💯 |
| **Terabyte Club** | Served 1TB lifetime | 🏆 |
| **Bandwidth Baron** | Served 100GB lifetime | 📡 |
| **Always On** | 30 days at 95%+ uptime | ⚡ |
| **Anchor Drop** | First time reaching Anchor level | ⚓ |
| **Lane Opener** | Created first space (requires Resident+) | 🏗️ |
| **Keeper of the Flame** | Kept 100+ posts alive | 🔥 |
| **Efficient Swimmer** | High contribution with low battery/data use | 🌱 |

**Achievement Focus**: Most achievements reward HOSTING behavior, not content creation. "First Stroke" is the only content-focused achievement - after that, it's all about infrastructure contribution.

Achievements are:
- Permanent once earned
- Visible on profile
- Non-transferable
- Social proof, not currency

---

## 6. Space-Level Social Features

### 6.1 Space Health Indicators

Each space displays its health:

```rust
pub struct SpaceHealth {
    /// Space identifier
    pub space_id: SpaceId,

    /// Number of currently active swimmers (online in last 5 minutes)
    pub active_swimmers: u32,

    /// Time since last sync was available from any peer
    pub last_sync_age: Duration,

    /// Number of posts at risk of decay (survival_probability < 25%)
    pub posts_at_risk: u32,

    /// Total posts in this space
    pub total_posts: u32,

    /// Average uptime of swimmers in this space
    pub average_uptime: f32,

    /// Total bandwidth served by all swimmers in this space (this period)
    pub total_bandwidth_served: u64,

    /// Top contributors this period (sorted by contribution score)
    pub top_contributors: Vec<SpaceContributor>,

    /// Health score (0-100)
    pub health_score: u8,

    /// Computed at timestamp
    pub computed_at: Timestamp,
}

pub struct SpaceContributor {
    pub identity: PublicKey,
    pub bandwidth_served: u64,
    pub uptime_ratio: f32,
    pub contribution_score: u64,
}
```

### 6.1.1 Health Score Calculation

The health score is a weighted composite of space health factors:

```rust
/// Calculate space health score (0-100)
pub fn calculate_space_health(
    active_swimmers: u32,
    average_uptime: f32,
    posts_at_risk_percent: f32,
    last_sync_age_minutes: u64,
) -> u8 {
    // Component weights (must sum to 100)
    const SWIMMER_WEIGHT: f32 = 30.0;
    const UPTIME_WEIGHT: f32 = 30.0;
    const DECAY_RISK_WEIGHT: f32 = 20.0;
    const FRESHNESS_WEIGHT: f32 = 20.0;

    // Swimmer score: 0 swimmers = 0, 10+ swimmers = 100
    let swimmer_score = (active_swimmers as f32 / 10.0).min(1.0) * 100.0;

    // Uptime score: direct percentage (0.0-1.0 → 0-100)
    let uptime_score = average_uptime * 100.0;

    // Decay risk score: inverse of risk percentage (0% at risk = 100)
    let decay_score = (1.0 - posts_at_risk_percent) * 100.0;

    // Freshness score: 0 min = 100, 15+ min = 0
    let freshness_score = (1.0 - (last_sync_age_minutes as f32 / 15.0).min(1.0)) * 100.0;

    // Weighted sum
    let total = (swimmer_score * SWIMMER_WEIGHT / 100.0)
        + (uptime_score * UPTIME_WEIGHT / 100.0)
        + (decay_score * DECAY_RISK_WEIGHT / 100.0)
        + (freshness_score * FRESHNESS_WEIGHT / 100.0);

    total.round() as u8
}

// Example calculations:
//
// Healthy space:
// ├── 12 active swimmers: (12/10).min(1) * 100 = 100 → 30 points
// ├── 68% average uptime: 68 → 20.4 points
// ├── 5% posts at risk: (1-0.05) * 100 = 95 → 19 points
// └── 3 min since sync: (1-0.2) * 100 = 80 → 16 points
// Total: 85.4 → 85
//
// Struggling space:
// ├── 2 active swimmers: 20 → 6 points
// ├── 45% uptime: 45 → 13.5 points
// ├── 30% posts at risk: 70 → 14 points
// └── 20 min since sync: 0 → 0 points
// Total: 33.5 → 34
```

### 6.1.2 Posts At Risk Detection

A post is "at risk" when its survival probability falls below 25%:

```rust
const RISK_THRESHOLD: f32 = 0.25; // 25% survival probability

/// Check if a post is at risk of decay
pub fn is_post_at_risk(content: &ContentItem, now: Timestamp) -> bool {
    let state = calculate_decay_state(content, now);
    state.survival_probability < RISK_THRESHOLD
}

/// Count posts at risk in a space
pub fn count_posts_at_risk(space_id: &SpaceId, now: Timestamp) -> u32 {
    get_space_content(space_id)
        .iter()
        .filter(|c| is_post_at_risk(c, now))
        .count() as u32
}
```

### 6.1.3 Active Swimmer Detection

A swimmer is "active" if they've been online in the last 5 minutes:

```rust
const ACTIVE_WINDOW_SECS: u64 = 300; // 5 minutes

/// Check if a swimmer is currently active
pub fn is_swimmer_active(identity: &PublicKey, space_id: &SpaceId, now: Timestamp) -> bool {
    if let Some(last_seen) = get_last_seen(identity, space_id) {
        now.as_secs() - last_seen.as_secs() < ACTIVE_WINDOW_SECS
    } else {
        false
    }
}

/// Count active swimmers in a space
pub fn count_active_swimmers(space_id: &SpaceId, now: Timestamp) -> u32 {
    get_space_members(space_id)
        .iter()
        .filter(|id| is_swimmer_active(id, space_id, now))
        .count() as u32
}
```

### 6.1.4 Protocol Message for Space Health Query

```rust
/// MSG_SPACE_HEALTH_QUERY (0x34)
/// Request health information for a space
pub struct SpaceHealthQueryPayload {
    pub space_id: SpaceId,              // 32 bytes
}
// Total: 32 bytes

/// MSG_SPACE_HEALTH_RESPONSE (0x35)
/// Response with space health information
pub struct SpaceHealthResponsePayload {
    pub space_id: SpaceId,              // 32 bytes
    pub health_score: u8,               // 1 byte
    pub active_swimmers: u32,           // 4 bytes
    pub last_sync_age_secs: u32,        // 4 bytes
    pub posts_at_risk: u32,             // 4 bytes
    pub total_posts: u32,               // 4 bytes
    pub average_uptime: u16,            // 2 bytes (0-10000 for 0.00%-100.00%)
    pub total_bandwidth_served: u64,    // 8 bytes
    pub computed_at: u64,               // 8 bytes (timestamp)
    pub contributor_count: u8,          // 1 byte (0-255)
    // Followed by contributor_count * SpaceContributorPayload
}
// Fixed portion: 68 bytes

pub struct SpaceContributorPayload {
    pub identity: PublicKey,            // 32 bytes
    pub bandwidth_served: u64,          // 8 bytes
    pub uptime_ratio: u16,              // 2 bytes (0-10000)
    pub contribution_score: u64,        // 8 bytes
}
// Per contributor: 50 bytes
// Max with 10 contributors: 68 + 500 = 568 bytes
```

### 6.2 Space Display

```
SPACE: /gardening
═══════════════════════════════════════════════════════════════════════

Health: ██████████░░ 85/100

📡 HOSTING STATUS:
├── Active hosts: 12 swimmers online now
├── Total hosting capacity: 892GB combined
├── Average uptime: 68%
├── Content availability: 99.2%
└── Last sync available: 3 minutes ago

⚠️ 5 posts need engagement (PoW) to survive

TOP HOSTS THIS WEEK:
├── @alice (47GB served, 73% uptime) 🥇
├── @bob (38GB served, 81% uptime) 🥈
├── @carol (29GB served, 65% uptime) 🥉
└── and 23 others contributing...

📈 SPACE MILESTONES:
├── ☀️ Never Dark (24/7 availability for 30 days)
├── 🌱 Thriving Lane (1000+ total members)
└── 🏆 12 Anchors (high-contribution hosts)
```

**Note**: Space health is about HOSTING health, not post activity. An "active" space is one with good hosting coverage, not necessarily high posting volume.

### 6.3 Content Attribution

Posts show who keeps them alive:

```
POST by @dave (3 days ago)
═══════════════════════════════════════════════════════════════════════

"Here's my tomato harvest this year..."

[image]

👍 34 | 💬 12 | ♻️ 8

KEPT ALIVE BY: @alice, @bob, @carol, and 7 others
└── Decays in 12 days without engagement
```

### 6.4 Collective Achievements

Spaces earn achievements together:

| Achievement | Trigger | Display |
|-------------|---------|---------|
| **Lane Launch** | Space created | 🚀 |
| **Growing Lane** | 100 members | 📈 |
| **Thriving Lane** | 1000 members | 🌱 |
| **Never Dark** | 30 days with 24/7 availability | ☀️ |
| **Centurion Lane** | 100 days old | 💯 |

---

## 7. Notifications and Nudges

### 7.1 Types of Notifications

Light-touch notifications encourage participation:

| Type | When | Message Example |
|------|------|-----------------|
| **Streak** | Streak milestone | "🔥 7-day streak! Keep swimming!" |
| **Level Up** | Level increases | "⬆️ You're now a Resident!" |
| **Achievement** | Achievement earned | "🎉 Earned: Keeper of the Flame" |
| **Space Health** | Space needs help | "/gardening could use an anchor" |
| **Content Risk** | Your content at risk | "3 of your posts decay tomorrow" |
| **Contribution Thanks** | Significant contribution | "You kept 50 posts alive this week!" |

### 7.2 Notification Preferences

Users control notification volume:

```rust
pub struct NotificationPreferences {
    /// Show streak notifications
    pub streak_notifications: bool,

    /// Show level/achievement notifications
    pub achievement_notifications: bool,

    /// Show space health nudges
    pub space_health_nudges: bool,

    /// Show content decay warnings
    pub decay_warnings: bool,

    /// Minimum streak length to notify
    pub streak_notify_threshold: u16,
}
```

---

## 8. Anti-Gaming Measures

### 8.1 Threat Model

| Attack | Description | Mitigation |
|--------|-------------|------------|
| **Fake bandwidth** | Claim to serve data you didn't | Peer attestation required |
| **Fake uptime** | Claim online when offline | Peer pings verify |
| **Sybil attestations** | Create fake peers to attest | Attesters need contribution too |
| **Streak farming** | Bot maintains streak | Streak alone doesn't give benefits |
| **Contribution selling** | Sell account with level | Identity = keys, non-transferable |

### 8.2 Attestation Requirements

Attestations only count if:
- Attester is a known identity (not new)
- Attester has own contribution history
- Attestation is recent (within period)
- Multiple attesters agree (not just one)

```rust
/// Validate a contribution claim
pub fn validate_contribution(
    claim: &ContributionRecord,
    attestations: &[Attestation],
) -> Result<ValidatedContribution, ValidationError> {
    // Require minimum attesters
    if attestations.len() < MIN_ATTESTERS {
        return Err(ValidationError::InsufficientAttestations);
    }

    // Attesters must be established
    for att in attestations {
        if !is_established_identity(&att.attester) {
            return Err(ValidationError::UnestablishedAttester);
        }
    }

    // Values must be consistent
    let variance = compute_variance(attestations);
    if variance > MAX_ATTESTATION_VARIANCE {
        return Err(ValidationError::InconsistentAttestations);
    }

    // Use median value (resists outliers)
    let confirmed_value = median_value(attestations);

    Ok(ValidatedContribution {
        identity: claim.identity,
        period: claim.period,
        confirmed_bandwidth: confirmed_value,
        attestation_count: attestations.len() as u32,
    })
}
```

### 8.3 Decay of Contribution

Old contribution fades:

```rust
/// Contribution value decays over time
pub fn contribution_weight(record: &ContributionRecord, now: Period) -> f32 {
    let age = now - record.period;

    // Full weight for last 4 weeks
    if age <= 4 {
        return 1.0;
    }

    // Linear decay over next 8 weeks
    if age <= 12 {
        return 1.0 - ((age - 4) as f32 / 8.0);
    }

    // Minimal weight after 12 weeks
    0.1
}
```

**Rationale:**
- Recent contribution matters more
- Can't coast on old reputation forever
- Must keep swimming to keep level

---

## 9. Device Constraints

### 9.1 Good App Citizenship

The social layer respects device limits:

```rust
pub struct ContributionSettings {
    /// Contribute only on WiFi
    pub wifi_only: bool,

    /// Maximum bandwidth per day (bytes)
    pub daily_bandwidth_cap: u64,

    /// Pause contribution below battery level
    pub battery_threshold: u8,

    /// Pause during system thermal throttling
    pub thermal_pause: bool,
}

impl Default for ContributionSettings {
    fn default() -> Self {
        Self {
            wifi_only: true,              // Conservative default
            daily_bandwidth_cap: 500_000_000, // 500MB/day default
            battery_threshold: 20,        // Pause below 20%
            thermal_pause: true,          // Respect device health
        }
    }
}
```

### 9.2 Contribution Modes

Users choose their commitment:

| Mode | Description | Benefits |
|------|-------------|----------|
| **Swimmer** | Foreground only, minimal background | Base level only |
| **Active Swimmer** | Background on WiFi, daily cap | Can reach Lifeguard |
| **Dedicated Swimmer** | Background always, high cap | Can reach Anchor |
| **Anchor Mode** | Always-on, no cap | Pool Keeper eligible |

### 9.3 Efficient Contributor Recognition

Efficiency is celebrated, not just volume:

```rust
/// Efficiency = contribution per resource consumed
pub fn efficiency_score(
    bandwidth_served: u64,
    battery_consumed: u64, // mAh equivalent
    data_used: u64,
) -> f32 {
    // Reward high contribution with low resource use
    let output = bandwidth_served as f32;
    let input = (battery_consumed + data_used) as f32;

    output / input.max(1.0)
}
```

Badge: **Efficient Swimmer** - high contribution with low resource use.

---

## 10. Integration Points

### 10.1 With Identity (SPEC_01)

```rust
// Identity includes social layer data
pub struct Identity {
    pub keypair: Keypair,
    pub profile: IdentityProfile,      // Includes level, streaks
    pub contribution_history: Vec<ContributionRecord>,
    pub achievements: HashSet<Achievement>,
}
```

### 10.2 With Content/Decay (SPEC_02)

```rust
// Decay considers author's level
pub fn calculate_decay(
    content: &Content,
    author_level: SwimmerLevel,
    base_half_life: Duration,
) -> Duration {
    let multiplier = decay_multiplier(author_level);
    base_half_life.mul_f32(multiplier)
}
```

### 10.3 With Content Distribution (SPEC_07)

```rust
// Serving content creates attestable contribution
impl ContentServer {
    pub fn serve_blob(&self, blob: &Blob, requester: &PublicKey) -> ServeResult {
        // Serve the content
        let bytes_served = self.send(blob, requester)?;

        // Record for attestation
        self.contribution_log.record_serve(
            requester,
            blob.hash(),
            bytes_served,
            Timestamp::now(),
        );

        Ok(ServeResult::success(bytes_served))
    }
}
```

---

## 11. Protocol Messages

### 11.1 New Message Types

| Type | ID | Purpose | Wire Size |
|------|-----|---------|-----------|
| `CONTRIBUTION_CLAIM` | 0x30 | Publish contribution record | 152+ bytes |
| `CONTRIBUTION_ATTEST` | 0x31 | Attest to peer's contribution | 117 bytes |
| `LEVEL_QUERY` | 0x32 | Query identity's current level | 32 bytes |
| `LEVEL_RESPONSE` | 0x33 | Response with level info | 53 bytes |
| `SPACE_HEALTH_QUERY` | 0x34 | Query space health status | 32 bytes |
| `SPACE_HEALTH_RESPONSE` | 0x35 | Response with health info | 68+ bytes |

### 11.2 Message Structures

```rust
// Contribution claim (see §2.4)
pub struct ContributionClaimPayload {
    pub record: ContributionRecord,  // 152 bytes base
}

// Contribution attestation (see §8.2)
pub struct ContributionAttestPayload {
    pub target: PublicKey,           // 32 bytes
    pub period: u32,                 // 4 bytes
    pub attestation: Attestation,    // 81 bytes
}
// Total: 117 bytes

// Level query
pub struct LevelQueryPayload {
    pub identity: PublicKey,         // 32 bytes
}
// Total: 32 bytes

// Level response
pub struct LevelResponsePayload {
    pub identity: PublicKey,         // 32 bytes
    pub level: u8,                   // 1 byte (SwimmerLevel as u8)
    pub streak_days: u16,            // 2 bytes
    pub bandwidth_30d_gb: u16,       // 2 bytes
    pub uptime_ratio: u16,           // 2 bytes (0-10000)
    pub lifetime_bandwidth_gb: u64,  // 8 bytes
    pub active_days: u16,            // 2 bytes
    pub contribution_score: u32,     // 4 bytes
}
// Total: 53 bytes

// Space health query (see §6.1.4)
pub struct SpaceHealthQueryPayload {
    pub space_id: SpaceId,           // 32 bytes
}
// Total: 32 bytes

// Space health response (see §6.1.4)
pub struct SpaceHealthResponsePayload {
    pub space_id: SpaceId,           // 32 bytes
    pub health_score: u8,            // 1 byte
    pub active_swimmers: u32,        // 4 bytes
    pub last_sync_age_secs: u32,     // 4 bytes
    pub posts_at_risk: u32,          // 4 bytes
    pub total_posts: u32,            // 4 bytes
    pub average_uptime: u16,         // 2 bytes (0-10000)
    pub total_bandwidth_served: u64, // 8 bytes
    pub computed_at: u64,            // 8 bytes
    pub contributor_count: u8,       // 1 byte
    // Followed by contributor_count * SpaceContributorPayload (50 bytes each)
}
// Fixed: 68 bytes + (contributor_count * 50)
```

---

## 12. Open Questions

### 12.1 Technical

- How to handle attestation spam?
- What's the minimum attestation threshold?
- How to bootstrap attestation network?
- Cold start: how do new users get attested?

### 12.2 Social

- Do levels create status anxiety?
- Does streak pressure cause unhealthy usage?
- How to handle level loss gracefully?
- Cultural differences in gamification reception?

### 12.3 Economic

- Do benefits create perverse incentives?
- Is PoW reduction enough motivation?
- Should there be more/fewer benefit tiers?
- How to prevent benefit "inflation"?

---

## 13. Implementation Notes

### 13.1 Phase 1: Basic Tracking ✅ COMPLETE (Milestone 7.1)

- Contribution metrics recorded locally
- No attestation yet (trust self-report initially)
- Level display only (no benefits)
- Streak tracking

### 13.2 Phase 2: Attestation Network ✅ COMPLETE (Milestone 7.2)

- Peer attestation protocol
- Verified contribution
- Sybil resistance measures

### 13.3 Phase 3: Swimmer Levels ✅ COMPLETE (Milestone 7.3)

- Level computation from contribution
- Level caching and queries
- Profile integration

### 13.4 Phase 4: Contribution Benefits ✅ COMPLETE (Milestone 7.4)

- PoW reduction based on level
- Decay extension for contributors
- Space creation gating
- Sync priority

### 13.5 Phase 5: Streaks and Achievements ✅ COMPLETE (Milestone 7.5)

- Streak tracking
- Achievement triggers
- Profile display

### 13.6 Phase 6: Space Health ✅ COMPLETE (Milestone 7.6)

- Space health indicators
- Active swimmer detection
- Posts at risk tracking
- Health score calculation
- Space health query messages

### 13.7 Phase 7: Content Attribution ✅ COMPLETE (Milestone 7.7)

- Who kept this alive display
- Engagement pool attribution
- Decay timeline display
- Wire protocol (MSG_ATTRIBUTION_QUERY 0x50, MSG_ATTRIBUTION_RESPONSE 0x51)

### 13.8 Phase 8: Device Constraints ✅ COMPLETE (Milestone 7.8)

- ContributionSettings with SPEC_09 §9.1 defaults
- Contribution modes (Swimmer → AnchorMode) with level gating
- Battery-aware pause/resume with 5% hysteresis
- Bandwidth limiting with midnight UTC reset
- Efficiency tracking per §9.3 formula

### 13.9 Phase 9: Notifications (Milestone 7.9) ✓ COMPLETE

**Implemented 2025-12-26** in `src/notification/` (8 files):

- NotificationType enum with 6 types per §7.1
- NotificationPreferences per §7.2 with streak_notify_threshold
- ThrottleConfig with per-type cooldowns:
  - Streak: PerMilestone (7, 14, 30, 100)
  - LevelUp: PerLevelChange
  - Achievement: PerAchievement
  - SpaceHealth: 4h per space
  - ContentRisk: 24h
  - ContributionThanks: PerPeriod
- Global daily limit (10) with optional quiet hours
- NotificationStore with 30-day expiry
- API events: NotificationApiEvent (New, Read, Cleared)
- Documentation: `docs/notifications.md`

---

## 14. Summary

The Social Layer transforms Swimchain from "infrastructure with social features" to "social network where participation matters." Key points:

1. **Contribution is visible** - Your effort is seen and recognized
2. **Benefits are personal** - Non-transferable, tied to identity
3. **Nothing is tradeable** - No tokens, no markets
4. **Reciprocity is fair** - Give bandwidth → get faster posting
5. **Community is the reward** - Recognition from peers, not points
6. **Device limits respected** - Good app citizenship built in

This is social media. The social layer makes it feel that way.

---

*Last updated: 2025-12-26*
*Status: Draft - Phase 7 (Social Layer) COMPLETE. All 9 milestones implemented. Ready for Phase 8: Node Operations.*

---

## Changelog

- **2025-12-26**: Phase 9 (Notification System) implemented in Milestone 7.9 - **PHASE 7 COMPLETE**
  - Notification module: `src/notification/` (8 files: mod.rs, error.rs, types.rs, preferences.rs, throttle.rs, triggers.rs, storage.rs, service.rs)
  - NotificationType enum (§7.1): 6 types (Streak, LevelUp, Achievement, SpaceHealth, ContentRisk, ContributionThanks)
  - NotificationPreferences (§7.2): 5 fields with streak_notify_threshold for milestone control
  - ThrottleConfig with per-type cooldowns:
    - Streak: PerMilestone (7, 14, 30, 100 days)
    - LevelUp: PerLevelChange
    - Achievement: PerAchievement
    - SpaceHealth: 4h per space
    - ContentRisk: 24h cooldown
    - ContributionThanks: PerPeriod
  - Global daily limit (default: 10) with optional quiet hours support
  - NotificationStore: key format identity[32]+timestamp[8BE]+id[16] for efficient range scans
  - 30-day notification expiry with automatic cleanup
  - TriggerSources: detect_streak(), detect_level_up(), detect_achievement(), etc.
  - NotificationService: coordinates all components with check_* methods
  - API integration: NotificationApiEvent (New, Read, Cleared) in src/api/events.rs
  - Tests: 66 passing (12 types, 22 throttle, 27 triggers, 5 service)
  - Documentation: `docs/notifications.md`
- **2025-12-26**: Phase 8 (Device Constraints) implemented in Milestone 7.8
  - Device constraints module: `src/device_constraints/` (8 files: mod.rs, error.rs, types.rs, battery.rs, bandwidth.rs, efficiency.rs, storage.rs, manager.rs)
  - ContributionSettings (§9.1): wifi_only=true, daily_bandwidth_cap=500MB, battery_threshold=20%, thermal_pause=true
  - ContributionMode enum (§9.2): Swimmer, ActiveSwimmer, DedicatedSwimmer, AnchorMode with level gating
    - Swimmer→Regular, ActiveSwimmer→Lifeguard, DedicatedSwimmer→Anchor, AnchorMode→PoolKeeper
  - BatteryChecker: pause below threshold with 5% hysteresis (resume at threshold+5%)
  - Charging bypass: contribution allowed when device is charging
  - ThermalState handling: Critical always pauses, Serious respects thermal_pause setting
  - DailyBandwidthLimiter: wraps TokenBucketLimiter with midnight UTC reset
  - EfficiencyTracker (§9.3): efficiency_score = bandwidth_served / (battery_consumed + data_used)
  - EFFICIENT_SWIMMER_THRESHOLD = 2.0 for badge qualification
  - DeviceConstraintManager: coordinates all constraints with should_contribute() and try_serve() APIs
  - ConstraintStatus for UI display
  - Sled persistence for mode and settings
  - Tests: 95 passing covering all constraint scenarios
  - Documentation: `docs/device-constraints.md`, `docs/contribution-modes.md`
- **2025-12-26**: Phase 7 (Content Attribution) implemented in Milestone 7.7
  - Attribution module: `src/attribution/` (6 files: mod.rs, types.rs, error.rs, compute.rs, manager.rs, handler.rs)
  - AttributionEntry (§6.3): 48-byte wire format (identity:32 + pow_contributed:8 + timestamp:8)
  - ContentAttribution: aggregates contributors from engagement pools, sorted by PoW DESC
  - ContentAttributionDisplay: format_attribution_display() generates "KEPT ALIVE BY: @alice, @bob, and X others"
  - MAX_DISPLAY_CONTRIBUTORS = 10 limit per display
  - DecayStatus enum: Active (0x01), Protected (0x02), Decayed (0x03)
  - decay_countdown_days(): floor protection, active decay, decayed states
  - decay_countdown_days_with_level(): level multipliers per §4.4 (1.0x→2.0x for NewSwimmer→PoolKeeper)
  - extract_contributors_from_pool(): HashMap-based O(n) deduplication
  - IdentityResolver trait: name resolution for display
  - Protocol messages (§11.1):
    - MSG_ATTRIBUTION_QUERY (0x50): 32 bytes (content_id)
    - MSG_ATTRIBUTION_RESPONSE (0x51): 49-57+ bytes (fixed portion + 48 bytes per contributor)
  - AttributionHandler: handle_query() for wire protocol
  - AttributionManager: 5-minute cache TTL with explicit invalidation
  - Tests: 50 passing (contributor extraction, decay countdown, wire format roundtrip, display formatting)
  - Documentation: `docs/content-attribution.md` (190 lines)
- **2025-12-26**: Phase 6 (Space Health) specification completed for Milestone 7.6
  - Expanded SpaceHealth struct (§6.1): Added space_id, total_posts, average_uptime, total_bandwidth_served, computed_at
  - SpaceContributor struct: identity, bandwidth_served, uptime_ratio, contribution_score
  - Health score calculation (§6.1.1): Weighted formula with 30% swimmers, 30% uptime, 20% decay risk, 20% freshness
    - Swimmer score: 0 swimmers = 0, 10+ swimmers = 100
    - Uptime score: direct percentage
    - Decay score: inverse of at-risk percentage
    - Freshness score: 0 min = 100, 15+ min = 0
  - Posts at risk detection (§6.1.2): RISK_THRESHOLD = 0.25 (25% survival probability)
  - Active swimmer detection (§6.1.3): ACTIVE_WINDOW_SECS = 300 (5 minutes)
  - Protocol messages (§6.1.4):
    - MSG_SPACE_HEALTH_QUERY (0x34): 32 bytes
    - MSG_SPACE_HEALTH_RESPONSE (0x35): 68 bytes fixed + 50 bytes per contributor
  - Updated message table (§11.1) with all 6 social layer message types and wire sizes
  - Implementation phases (§13) updated to show progress through 7.5 complete, 7.6 in progress
- **2025-12-26**: Phase 4 (Contribution Benefits) implemented in Milestone 7.4
  - Benefits module: `src/benefits/` (6 files: mod.rs, types.rs, pow_reduction.rs, decay_extension.rs, space_rights.rs, sync_priority.rs)
  - Priority enum (§4.6): Highest, High, AboveNormal, Normal
  - PoW reduction (§4.3): `adjusted_difficulty()` with reductions 0%/0%/10%/20%/35%/50% for NewSwimmer→PoolKeeper
  - Decay extension (§4.4): `decay_multiplier()` with multipliers 1.0x/1.0x/1.2x/1.5x/1.8x/2.0x
  - Space creation gating (§4.5): `can_create_space()` requires Resident+, MIN_LEVEL_FOR_SPACE_CREATION constant
  - Sync priority (§4.6): `sync_priority()` maps level to Priority
  - SyncPriorityQueue in `src/sync/priority_queue.rs`: Binary heap with FIFO fallback under 50 requests
  - Integration: `get_difficulty_for_level()` in action_pow.rs, `calculate_decay_state_with_level()` in decay.rs
  - CLI integration: Level check in space.rs with `--skip-level-check` flag, `InsufficientLevel` error variant
  - Tests: 12 PoW, 11 decay, 8 space rights, 8 sync priority unit tests; integration tests passing
  - Documentation: `docs/contribution-benefits.md`, `docs/benefit-integration.md`, updated `docs/swimmer-levels.md`
- **2025-12-26**: Phase 3 (Swimmer Levels) implemented in Milestone 7.3
  - SwimmerLevel enum (§3.1): 6 levels (NewSwimmer=0, Regular=1, Resident=2, Lifeguard=3, Anchor=4, PoolKeeper=5)
  - Threshold constants: POOL_KEEPER_BANDWIDTH_GB=500, ANCHOR_BANDWIDTH_GB=200, LIFEGUARD_BANDWIDTH_GB=50, RESIDENT_LIFETIME_GB=10
  - Uptime thresholds: 95% (PoolKeeper), 90% (Anchor), 70% (Lifeguard), 50% (Resident)
  - compute_level() function per §3.2 algorithm
  - Contribution weight decay per §8.3: full weight 4 weeks, linear decay to 0.1 over weeks 5-12
  - Inactivity cap: min(base_level, Regular) when no recent hosting (7 days)
  - LevelCache with sled "swimmer_levels" tree, period-based freshness check
  - LevelManager coordinates caching and computation
  - LEVEL_QUERY message (0x32): 32 bytes (identity only)
  - LEVEL_RESPONSE message (0x33): 53 bytes (identity + level + streak + bandwidth_30d_gb + uptime_ratio + lifetime_bandwidth_gb)
  - IdentityProfile (§3.3): build() method integrates LevelManager and ContributionStore, meets_level() for requirements checking
  - LevelQueryHandler for message handling
  - Implementation: `src/level/` (8 modules: mod.rs, types.rs, compute.rs, cache.rs, manager.rs, handler.rs, profile.rs, error.rs)
  - Tests: 23 tests covering all threshold transitions, inactivity capping, cache behavior, decay warnings
  - Documentation: `docs/swimmer-levels.md`
- **2025-12-26**: Phase 2 (Attestation Network) implemented in Milestone 7.2
  - Attestation data structure (§2.4): `Attestation` struct with attester, attestation_type, observed_value, timestamp, signature
  - `AttestationType` enum: Bandwidth (0x01), Uptime (0x02), ContentAvailability (0x03)
  - CONTRIBUTION_CLAIM message type (0x30) with `ContributionClaimPayload`
  - CONTRIBUTION_ATTEST message type (0x31) with `ContributionAttestPayload`
  - Attestation verification (§8.2): `validate_contribution()` with full anti-gaming measures
  - Median value calculation: `median_value()` in aggregation.rs, resists outliers
  - Variance checking: `compute_variance()` with MAX_ATTESTATION_VARIANCE_PERCENT=20
  - Attester validation: `is_established_identity()` requires MIN_IDENTITY_AGE_SECS=604800 (7 days) + MIN_ATTESTER_CONTRIBUTION_PERIODS=1
  - Attestation recency: `is_attestation_recent()` with ATTESTATION_PERIOD_WINDOW_SECS
  - Sled storage: `AttestationStore` for persistent attestation storage
  - Constants: MIN_ATTESTERS=3 per validation
  - Sybil resistance tests: fresh identity rejection, self-attestation blocked, duplicate attester blocked, high variance rejected
  - Implementation: `src/attestation/` (6 modules: types.rs, validation.rs, aggregation.rs, verifier.rs, storage.rs, error.rs)
  - Documentation: `docs/peer-attestation.md` (200 lines), `docs/attestation-security.md` (224 lines)
- **2025-12-26**: Phase 1 (Basic Tracking) implemented in Milestone 7.1
  - ContributionRecord structure (§2.4) fully implemented with all fields
  - Local contribution tracking: bandwidth_served, content_served_count, posts_supported, spaces_active
  - UptimeTracker with 5-minute sample-based measurement (ratio 0-10000)
  - StreakTracker with consecutive day tracking, break handling, best streak preservation
  - Period calculation: weeks since GENESIS_EPOCH (Jan 1, 2025 = 1735689600)
  - Hash chain linking via SHA-256
  - Score calculation per §2.3 formula implemented
  - Sled storage with 3 trees (contribution_records, contribution_streaks, contribution_uptime)
  - 79 tests passing, 152 bytes serialized record size
  - Implementation: `src/contribution/` (9 modules)
  - Documentation: `docs/contribution-tracking.md`
- **2025-12-25**: Initial specification created
