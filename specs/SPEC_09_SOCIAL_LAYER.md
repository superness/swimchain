# SPEC_09: Social Layer

**Version:** 1.0.0
**Status:** Draft
**Created:** 2025-12-25
**Dependencies:** SPEC_01 (Identity), SPEC_02 (Content/Decay), SPEC_07 (Content Distribution), SPEC_12 (Spam Attestation)

---

## 1. Overview

### 1.1 Purpose

The Social Layer makes visible the contribution and participation that keeps the network alive. This is NOT gamification added on top—it is **first-class protocol infrastructure** that:

1. Tracks contribution at the protocol level
2. Recognizes hosting and participation with permanent, non-transferable badges
3. Creates social visibility for participation
4. Surfaces a community-driven reputation signal—without ever granting privileges

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
| **Non-transferable** | Recognition is tied to identity, not tradeable |
| **Non-economic** | No tokens, no markets, no speculation |
| **Non-privileging** | Recognition is a display, never a protocol privilege |
| **Sustainable** | Incentives align with network health |

---

## 2. Contribution Metrics

### 2.1 The Core Exchange

**CRITICAL**: The network needs HOSTING, not just activity. This is the foundation:

```
THE CORE EXCHANGE
═══════════════════════════════════════════════════════════════════════

What the network NEEDS:          What we RECOGNIZE:
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
    └── THIS is what recognition makes visible
```

### 2.2 What Gets Tracked

The protocol tracks **hosting contribution** at the identity level. Tracking feeds badges and profile display—it never grants a privilege:

| Metric | What It Measures | How Tracked | Weight |
|--------|------------------|-------------|--------|
| `bandwidth_served` | Data served to peers (bytes/period) | Peer attestations | **Primary** |
| `content_hosted_hours` | GB-hours of content stored | Local measurement × uptime | **Primary** |
| `uptime_ratio` | Time online vs. offline (0.0-1.0) | Peer observations | **Primary** |
| `peer_requests_served` | Number of peer requests answered | Request logs | **Secondary** |
| `posts_kept_alive` | Content you contributed PoW to | Individual engagement PoW records | Secondary |
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
// Good hosting citizen:
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
// The difference is MASSIVE. Hosting dominates the score.
```

The contribution score is a displayed number. It decides which badges you have earned and how you rank on space contributor lists. It changes nothing about how the protocol treats your posts.

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

## 3. Recognition

Recognition is visible and social. It is never a protocol privilege. Nothing on your profile reduces PoW, extends decay, raises a rate limit, or gates space creation, attestation, or sponsorship. Those are governed entirely by PoW and the anti-abuse rules, flat for everyone.

```
RECOGNITION, NOT RANK
═══════════════════════════════════════════════════════════════════════

There are no levels, no tiers, no ranks.

Two signals live on your profile:
├── Badges — permanent milestones you have achieved
└── Reputation — what the community currently thinks of your posting

Both are things people SEE. Neither is a thing you SPEND.
The protocol treats every identity's posts by the same rules.
```

### 3.1 Achievements

Achievements are permanent, non-transferable badges awarded for hosting and participation milestones. They are purely cosmetic recognition with **zero protocol effect**—earning a badge never reduces your PoW, extends your decay, or raises any limit.

| Achievement | Trigger | Badge |
|-------------|---------|-------|
| **First Stroke** | First post ever | 🌊 |
| **First Serve** | First content served to a peer | 📡 |
| **Week Swimmer** | 7-day hosting streak | 📅 |
| **Month Swimmer** | 30-day hosting streak | 📆 |
| **Centurion** | 100-day hosting streak | 💯 |
| **Terabyte Club** | Served 1TB lifetime | 🏆 |
| **Bandwidth Baron** | Served 100GB lifetime | 📶 |
| **Always On** | 30 days at 95%+ uptime | ⚡ |
| **Anchor Drop** | Served 200GB in a single month | ⚓ |
| **Lane Opener** | Created your first space | 🏗️ |
| **Keeper of the Flame** | Kept 100+ posts alive | 🔥 |
| **Efficient Swimmer** | High contribution with low battery/data use | 🌱 |

**Achievement Focus**: Most achievements recognize HOSTING behavior, not content creation. "First Stroke" is the only content-focused achievement—after that, it's all about infrastructure contribution.

Achievements are:
- Permanent once earned
- Visible on profile
- Non-transferable
- Social proof, not currency—and never a capability

### 3.2 Poster Reputation

Poster reputation is a per-identity score shown on profiles. It reflects how the community currently regards a poster's content. Like achievements, it is a **displayed signal only**—reputation has zero protocol privileges. It never affects PoW, decay, rate limits, or any gate.

Reputation moves on two forces:

- **It decays** when the community files spam attestations (SPEC_12) against that poster's content.
- **It recovers** over time when no new attestations land, and recovers fast when a flag is cleared by counter-attestation.

Attestations are **weighted by the attester's own reputation**: a well-regarded account's spam report carries more weight than a fresh or low-reputation account's, and filing attestations that the community counter-attests costs the attester reputation. This makes coordinated brigading expensive: a mob of throwaway identities barely dents a score, and burns its own standing trying.

```rust
/// Poster reputation is a displayed signal, not a privilege.
/// It NEVER affects PoW, decay, rate limits, or any protocol gate.
pub struct PosterReputation {
    pub identity: PublicKey,
    pub spam_flags_received: u32,     // spam attestations against this poster's content
    pub spam_flags_countered: u32,    // flags cleared by counter-attestation
    pub attester_countered_count: u32, // attestations this identity filed that got countered
    pub illegal_content_flags: u32,
    pub last_flag_at: Option<Timestamp>,
}

pub const REPUTATION_BASE_SCORE: i32 = 100;   // where every identity starts
pub const REPUTATION_MIN_SCORE: i32 = -1000;  // floor

const SPAM_PENALTY_PER_FLAG: i32 = 20;        // per spam flag received
const ATTESTER_PENALTY_PER_COUNTER: i32 = 30; // per attestation you filed that got countered
const ILLEGAL_PENALTY_PER_FLAG: i32 = 1000;   // per illegal-content flag

pub const REPUTATION_RECOVERY_PER_DAY: i32 = 1;         // per quiet day
pub const REPUTATION_RECOVERY_MAX_DAYS: i32 = 90;       // recovery bonus cap
pub const REPUTATION_FAST_RECOVERY_PER_COUNTER: i32 = 10; // per counter-attested flag

/// score = base
///       - spam_flags_received × 20
///       - attester_countered_count × 30
///       - illegal_content_flags × 1000
///       + min(days_since_last_flag, 90)   // recovery
///       + spam_flags_countered × 10       // fast recovery
/// clamped to REPUTATION_MIN_SCORE.
pub fn calculate_score(rep: &PosterReputation, days_since_last_flag: u64) -> i32 {
    let spam_penalty = (rep.spam_flags_received as i32) * SPAM_PENALTY_PER_FLAG;
    let attester_penalty = (rep.attester_countered_count as i32) * ATTESTER_PENALTY_PER_COUNTER;
    let illegal_penalty = (rep.illegal_content_flags as i32) * ILLEGAL_PENALTY_PER_FLAG;
    let recovery = std::cmp::min(days_since_last_flag as i32, REPUTATION_RECOVERY_MAX_DAYS);
    let fast_recovery = (rep.spam_flags_countered as i32) * REPUTATION_FAST_RECOVERY_PER_COUNTER;

    let score = REPUTATION_BASE_SCORE - spam_penalty - attester_penalty - illegal_penalty
        + recovery + fast_recovery;
    std::cmp::max(score, REPUTATION_MIN_SCORE)
}
```

The displayed score maps to a tier — a label for humans, never a gate:

| Tier | Score | Meaning |
|------|-------|---------|
| Trusted | > 200 | Long history of clean posting |
| Normal | > 100 | Standing at or above baseline |
| Watched | > 50 | Recent spam flags |
| Restricted | > 0 | Repeated flags, still recovering |
| — | ≤ 0 | Heavily flagged |

**Rationale:**
- The signal is community-driven, not system-decreed
- Weighting by attester reputation resists Sybil pile-ons
- Recovery over time keeps mistakes forgivable
- Because it grants nothing, gaming it buys you nothing but a number

### 3.3 Profile Display

Recognition surfaces on the identity profile: badges, reputation, and hosting stats. The struct carries the display data—not any entitlement.

```rust
pub struct IdentityProfile {
    pub public_key: PublicKey,
    pub display_name: Option<String>,

    /// Poster reputation (displayed signal; starts at 100, floor -1000)
    pub reputation: i32,

    /// Badges earned (permanent, non-transferable)
    pub achievements: Vec<Achievement>,

    /// Current hosting streak
    pub streak_days: u16,

    /// Spaces where this identity is active
    pub active_spaces: Vec<SpaceId>,

    /// Hosting contribution summary (last 30 days) — shown, not spent
    pub contribution_summary: ContributionSummary,
}
```

A rendered profile emphasizes HOSTING metrics and recognition, not post counts or engagement received. This is a hosting profile, not a content profile:

```
PROFILE: @alice
═══════════════════════════════════════════════════════════════════════

⭐ Reputation: 214 (Trusted)

🏅 BADGES:
   🌊 First Stroke · 📡 First Serve · 📅 Week Swimmer · 📆 Month Swimmer
   📶 Bandwidth Baron · 🔥 Keeper of the Flame

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
```

**Note**: Everything on this profile is for recognition. None of it changes how the protocol treats @alice's posts—her PoW, decay, and limits are identical to any other swimmer's.

---

## 4. Streaks

### 4.1 Swim Streaks

Consecutive days of activity. A streak is a tracked stat that feeds badges and profile display—another purely cosmetic signal:

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

### 4.2 Streak Display

Streaks appear on the profile alongside badges and reputation (see §3.3). They mark consistency; they unlock the streak-based badges in §3.1 (Week Swimmer, Month Swimmer, Centurion) and nothing more.

---

## 5. Space-Level Social Features

### 5.1 Space Health Indicators

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

### 5.1.1 Health Score Calculation

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

### 5.1.2 Posts At Risk Detection

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

### 5.1.3 Active Swimmer Detection

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

### 5.1.4 Protocol Message for Space Health Query

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

### 5.2 Space Display

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
└── 🏆 12 dedicated hosts (sustained high hosting contribution)
```

**Note**: Space health is about HOSTING health, not post activity. An "active" space is one with good hosting coverage, not necessarily high posting volume.

### 5.3 Content Attribution

Posts show who keeps them alive. Attribution is derived from the individual engagement PoW records filed against a post—each contributor is credited for the resets they paid for:

```
POST by @dave (3 days ago)
═══════════════════════════════════════════════════════════════════════

"Here's my tomato harvest this year..."

[image]

👍 34 | 💬 12 | ♻️ 8

KEPT ALIVE BY: @alice, @bob, @carol, and 7 others
└── Decays in 12 days without engagement
```

### 5.4 Collective Achievements

Spaces earn achievements together:

| Achievement | Trigger | Display |
|-------------|---------|---------|
| **Lane Launch** | Space created | 🚀 |
| **Growing Lane** | 100 members | 📈 |
| **Thriving Lane** | 1000 members | 🌱 |
| **Never Dark** | 30 days with 24/7 availability | ☀️ |
| **Centurion Lane** | 100 days old | 💯 |

---

## 6. Notifications and Nudges

### 6.1 Types of Notifications

Light-touch notifications encourage participation:

| Type | When | Message Example |
|------|------|-----------------|
| **Streak** | Streak milestone | "🔥 7-day streak! Keep swimming!" |
| **Reputation** | Notable reputation change | "📉 Your reputation shifted after community spam reports" |
| **Achievement** | Achievement earned | "🎉 Earned: Keeper of the Flame" |
| **Space Health** | Space needs help | "/gardening could use more hosts" |
| **Content Risk** | Your content at risk | "3 of your posts decay tomorrow" |
| **Contribution Thanks** | Significant contribution | "You kept 50 posts alive this week!" |

### 6.2 Notification Preferences

Users control notification volume:

```rust
pub struct NotificationPreferences {
    /// Show streak notifications
    pub streak_notifications: bool,

    /// Show reputation and achievement notifications
    pub recognition_notifications: bool,

    /// Show space health nudges
    pub space_health_nudges: bool,

    /// Show content decay warnings
    pub decay_warnings: bool,

    /// Minimum streak length to notify
    pub streak_notify_threshold: u16,
}
```

---

## 7. Anti-Gaming Measures

### 7.1 Threat Model

| Attack | Description | Mitigation |
|--------|-------------|------------|
| **Fake bandwidth** | Claim to serve data you didn't | Peer attestation required |
| **Fake uptime** | Claim online when offline | Peer pings verify |
| **Sybil attestations** | Create fake peers to attest | Attesters need contribution too |
| **Streak farming** | Bot maintains streak | Streak is cosmetic; it unlocks nothing but a badge |
| **Reputation brigading** | Mass spam reports to sink a poster | Attestations weighted by attester reputation |

### 7.2 Attestation Requirements

Contribution attestations only count if:
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

### 7.3 Decay of Contribution

Old contribution fades from the displayed score:

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
- The profile reflects who is hosting NOW, not who once did
- Keeps the contributor lists and badges honest

---

## 8. Device Constraints

### 8.1 Good App Citizenship

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

### 8.2 Contribution Modes

Users choose how much they contribute. Modes are presets for hosting behavior, not rungs on a ladder—every mode is treated identically by the protocol:

| Mode | Description | What It Does |
|------|-------------|--------------|
| **Swimmer** | Foreground only, minimal background | Serves while the app is open |
| **Active Swimmer** | Background on WiFi, daily cap | Keeps serving in the background on WiFi |
| **Dedicated Swimmer** | Background always, high cap | Serves continuously within your caps |
| **Anchor Mode** | Always-on, no cap | Runs like a seed node |

Serving more earns more recognition (more bandwidth toward badges, a higher spot on contributor lists). It never earns a privilege.

### 8.3 Efficient Contributor Recognition

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

Badge: **Efficient Swimmer** — high contribution with low resource use.

---

## 9. Integration Points

### 9.1 With Identity (SPEC_01)

```rust
// Identity includes social layer data
pub struct Identity {
    pub keypair: Keypair,
    pub profile: IdentityProfile,      // Includes reputation, badges, streaks
    pub contribution_history: Vec<ContributionRecord>,
    pub achievements: HashSet<Achievement>,
}
```

### 9.2 With Content/Decay (SPEC_02)

Decay is status-independent. Every author's content follows the same half-life; the social layer only *reads* decay state to display it, never modifies it:

```rust
// The social layer reads decay state for display (posts-at-risk, countdowns).
// It does not alter the half-life for any author.
pub fn posts_at_risk_for_display(
    space_id: &SpaceId,
    now: Timestamp,
) -> u32 {
    count_posts_at_risk(space_id, now)
}
```

### 9.3 With Content Distribution (SPEC_07)

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

## 10. Protocol Messages

### 10.1 Message Types

| Type | ID | Purpose | Wire Size |
|------|-----|---------|-----------|
| `CONTRIBUTION_CLAIM` | 0x30 | Publish contribution record | 152+ bytes |
| `CONTRIBUTION_ATTEST` | 0x31 | Attest to peer's contribution | 117 bytes |
| `SPACE_HEALTH_QUERY` | 0x34 | Query space health status | 32 bytes |
| `SPACE_HEALTH_RESPONSE` | 0x35 | Response with health info | 68+ bytes |

### 10.2 Message Structures

```rust
// Contribution claim (see §2.4)
pub struct ContributionClaimPayload {
    pub record: ContributionRecord,  // 152 bytes base
}

// Contribution attestation (see §7.2)
pub struct ContributionAttestPayload {
    pub target: PublicKey,           // 32 bytes
    pub period: u32,                 // 4 bytes
    pub attestation: Attestation,    // 81 bytes
}
// Total: 117 bytes

// Space health query (see §5.1.4)
pub struct SpaceHealthQueryPayload {
    pub space_id: SpaceId,           // 32 bytes
}
// Total: 32 bytes

// Space health response (see §5.1.4)
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

## 11. Open Questions

### 11.1 Technical

- How to handle attestation spam?
- What's the minimum attestation threshold for a contribution claim?
- How to bootstrap the attestation network?
- Cold start: how do new users get attested?

### 11.2 Social

- Does the displayed reputation create status anxiety or public pile-ons?
- Does streak pressure cause unhealthy usage?
- How should reputation recovery be paced so mistakes stay forgivable?
- Cultural differences in how badges and recognition land?

### 11.3 Recognition Integrity

- How to keep reputation resistant to coordinated spam-attestation brigading beyond attester-weighting?
- Should achievement sets be extensible per client, or fixed by the protocol?
- How to guarantee recognition stays purely cosmetic as clients evolve—never letting a client quietly turn a badge or score into a gate?

---

## 12. Implementation Notes

### 12.1 Phase 1: Basic Tracking ✅ COMPLETE

- Contribution metrics recorded locally
- No attestation yet (trust self-report initially)
- Streak tracking

### 12.2 Phase 2: Attestation Network ✅ COMPLETE

- Peer attestation protocol
- Verified contribution
- Sybil resistance measures

### 12.3 Phase 3: Achievements ✅ COMPLETE

- Badge triggers for the 12-badge set
- Permanent, non-transferable badges
- Profile integration

### 12.4 Phase 4: Poster Reputation ✅ COMPLETE

- Reputation scoring driven by weighted spam attestations
- Recovery over time
- Profile display

### 12.5 Phase 5: Space Health ✅ COMPLETE

- Space health indicators
- Active swimmer detection
- Posts at risk tracking
- Health score calculation
- Space health query messages

### 12.6 Phase 6: Content Attribution ✅ COMPLETE

- Who kept this alive display
- Decay timeline display
- Attribution wire protocol

### 12.7 Phase 7: Device Constraints ✅ COMPLETE

- ContributionSettings with SPEC_09 §8.1 defaults
- Contribution modes (Swimmer → Anchor Mode)
- Battery-aware pause/resume with 5% hysteresis
- Bandwidth limiting with midnight UTC reset
- Efficiency tracking per §8.3 formula

### 12.8 Phase 8: Notifications ✅ COMPLETE

- NotificationType enum with 6 types per §6.1
- NotificationPreferences per §6.2 with streak_notify_threshold
- ThrottleConfig with per-type cooldowns:
  - Streak: PerMilestone (7, 14, 30, 100)
  - Reputation: 24h
  - Achievement: PerAchievement
  - SpaceHealth: 4h per space
  - ContentRisk: 24h
  - ContributionThanks: PerPeriod
- Global daily limit (10) with optional quiet hours
- NotificationStore with 30-day expiry
- API events: NotificationApiEvent (New, Read, Cleared)

---

## 13. Summary

The Social Layer transforms Swimchain from "infrastructure with social features" to "social network where participation matters." Key points:

1. **Contribution is visible** - Your effort is seen and recognized
2. **Recognition is personal** - Non-transferable, tied to identity
3. **Nothing is tradeable** - No tokens, no markets
4. **Nothing is a privilege** - Recognition never touches PoW, decay, or limits
5. **Community is the reward** - Badges and reputation come from peers, not points
6. **Device limits respected** - Good app citizenship built in

This is social media. The social layer makes it feel that way.

---

## Changelog

- **2025-12-26**: Notification System implemented
  - Notification module: `src/notification/` (mod.rs, error.rs, types.rs, preferences.rs, throttle.rs, triggers.rs, storage.rs, service.rs)
  - NotificationType enum (§6.1): 6 types (Streak, Reputation, Achievement, SpaceHealth, ContentRisk, ContributionThanks)
  - NotificationPreferences (§6.2): fields including streak_notify_threshold for milestone control
  - ThrottleConfig with per-type cooldowns:
    - Streak: PerMilestone (7, 14, 30, 100 days)
    - Reputation: 24h cooldown
    - Achievement: PerAchievement
    - SpaceHealth: 4h per space
    - ContentRisk: 24h cooldown
    - ContributionThanks: PerPeriod
  - Global daily limit (default: 10) with optional quiet hours support
  - NotificationStore: key format identity[32]+timestamp[8BE]+id[16] for efficient range scans
  - 30-day notification expiry with automatic cleanup
  - TriggerSources: detect_streak(), detect_reputation_change(), detect_achievement(), etc.
  - NotificationService: coordinates all components with check_* methods
  - API integration: NotificationApiEvent (New, Read, Cleared) in src/api/events.rs
  - Documentation: `docs/notifications.md`
- **2025-12-26**: Device Constraints implemented
  - Device constraints module: `src/device_constraints/` (mod.rs, error.rs, types.rs, battery.rs, bandwidth.rs, efficiency.rs, storage.rs, manager.rs)
  - ContributionSettings (§8.1): wifi_only=true, daily_bandwidth_cap=500MB, battery_threshold=20%, thermal_pause=true
  - ContributionMode enum (§8.2): Swimmer, ActiveSwimmer, DedicatedSwimmer, AnchorMode as hosting-behavior presets
  - BatteryChecker: pause below threshold with 5% hysteresis (resume at threshold+5%)
  - Charging bypass: contribution allowed when device is charging
  - ThermalState handling: Critical always pauses, Serious respects thermal_pause setting
  - DailyBandwidthLimiter: wraps TokenBucketLimiter with midnight UTC reset
  - EfficiencyTracker (§8.3): efficiency_score = bandwidth_served / (battery_consumed + data_used)
  - EFFICIENT_SWIMMER_THRESHOLD = 2.0 for badge qualification
  - DeviceConstraintManager: coordinates all constraints with should_contribute() and try_serve() APIs
  - ConstraintStatus for UI display
  - Sled persistence for mode and settings
  - Documentation: `docs/device-constraints.md`, `docs/contribution-modes.md`
- **2025-12-26**: Content Attribution implemented
  - Attribution module: `src/attribution/` (mod.rs, types.rs, error.rs, compute.rs, manager.rs, handler.rs)
  - AttributionEntry (§5.3): 48-byte wire format (identity:32 + pow_contributed:8 + timestamp:8)
  - ContentAttribution: aggregates contributors from individual engagement PoW records, sorted by PoW DESC
  - ContentAttributionDisplay: format_attribution_display() generates "KEPT ALIVE BY: @alice, @bob, and X others"
  - MAX_DISPLAY_CONTRIBUTORS = 10 limit per display
  - DecayStatus enum: Active (0x01), Protected (0x02), Decayed (0x03)
  - decay_countdown_days(): floor protection, active decay, decayed states
  - extract_contributors(): HashMap-based O(n) deduplication over engagement PoW records
  - IdentityResolver trait: name resolution for display
  - Protocol messages:
    - MSG_ATTRIBUTION_QUERY (0x50): 32 bytes (content_id)
    - MSG_ATTRIBUTION_RESPONSE (0x51): 49-57+ bytes (fixed portion + 48 bytes per contributor)
  - AttributionHandler: handle_query() for wire protocol
  - AttributionManager: 5-minute cache TTL with explicit invalidation
  - Documentation: `docs/content-attribution.md`
- **2025-12-26**: Space Health specification completed
  - Expanded SpaceHealth struct (§5.1): space_id, total_posts, average_uptime, total_bandwidth_served, computed_at
  - SpaceContributor struct: identity, bandwidth_served, uptime_ratio, contribution_score
  - Health score calculation (§5.1.1): Weighted formula with 30% swimmers, 30% uptime, 20% decay risk, 20% freshness
    - Swimmer score: 0 swimmers = 0, 10+ swimmers = 100
    - Uptime score: direct percentage
    - Decay score: inverse of at-risk percentage
    - Freshness score: 0 min = 100, 15+ min = 0
  - Posts at risk detection (§5.1.2): RISK_THRESHOLD = 0.25 (25% survival probability)
  - Active swimmer detection (§5.1.3): ACTIVE_WINDOW_SECS = 300 (5 minutes)
  - Protocol messages (§5.1.4):
    - MSG_SPACE_HEALTH_QUERY (0x34): 32 bytes
    - MSG_SPACE_HEALTH_RESPONSE (0x35): 68 bytes fixed + 50 bytes per contributor
  - Updated message table (§10.1) with the social layer message types and wire sizes
- **2025-12-26**: Poster Reputation implemented
  - Reputation module: `src/reputation/`
  - PosterReputation (§3.2): per-identity score, base 100, floor -1000, tiered display
  - calculate_score(): penalties per spam flag (SPEC_12 spam attestations), recovery per quiet day, fast recovery per counter-attested flag
  - Constants: REPUTATION_BASE_SCORE=100, SPAM_PENALTY_PER_FLAG=20, REPUTATION_RECOVERY_PER_DAY=1 (max 90), REPUTATION_FAST_RECOVERY_PER_COUNTER=10
  - Displayed signal only — no protocol privileges of any kind
  - Profile integration: reputation field on IdentityProfile (§3.3)
  - Documentation: `docs/poster-reputation.md`
- **2025-12-26**: Achievements implemented
  - Achievement module: `src/achievement/`
  - 12-badge set (§3.1): FirstStroke, FirstServe, WeekSwimmer, MonthSwimmer, Centurion, TerabyteClub, BandwidthBaron, AlwaysOn, AnchorDrop, LaneOpener, KeeperOfTheFlame, EfficientSwimmer
  - Badge triggers wired to contribution, streak, and hosting milestones
  - Permanent, non-transferable, cosmetic — zero protocol effect
  - IdentityProfile (§3.3): achievements field, profile display integration
  - Documentation: `docs/achievements.md`
- **2025-12-26**: Attestation Network implemented
  - Attestation data structure (§2.4): `Attestation` struct with attester, attestation_type, observed_value, timestamp, signature
  - `AttestationType` enum: Bandwidth (0x01), Uptime (0x02), ContentAvailability (0x03)
  - CONTRIBUTION_CLAIM message type (0x30) with `ContributionClaimPayload`
  - CONTRIBUTION_ATTEST message type (0x31) with `ContributionAttestPayload`
  - Attestation verification (§7.2): `validate_contribution()` with full anti-gaming measures
  - Median value calculation: `median_value()` in aggregation.rs, resists outliers
  - Variance checking: `compute_variance()` with MAX_ATTESTATION_VARIANCE_PERCENT=20
  - Attester validation: `is_established_identity()` requires MIN_IDENTITY_AGE_SECS=604800 (7 days) + MIN_ATTESTER_CONTRIBUTION_PERIODS=1
  - Attestation recency: `is_attestation_recent()` with ATTESTATION_PERIOD_WINDOW_SECS
  - Sled storage: `AttestationStore` for persistent attestation storage
  - Constants: MIN_ATTESTERS=3 per validation
  - Implementation: `src/attestation/` (types.rs, validation.rs, aggregation.rs, verifier.rs, storage.rs, error.rs)
  - Documentation: `docs/peer-attestation.md`, `docs/attestation-security.md`
- **2025-12-26**: Basic Tracking implemented
  - ContributionRecord structure (§2.4) fully implemented with all fields
  - Local contribution tracking: bandwidth_served, content_served_count, posts_supported, spaces_active
  - UptimeTracker with 5-minute sample-based measurement (ratio 0-10000)
  - StreakTracker with consecutive day tracking, break handling, best streak preservation
  - Period calculation: weeks since GENESIS_EPOCH (Jan 1, 2025 = 1735689600)
  - Hash chain linking via SHA-256
  - Score calculation per §2.3 formula implemented
  - Sled storage with 3 trees (contribution_records, contribution_streaks, contribution_uptime)
  - 152 bytes serialized record size
  - Implementation: `src/contribution/`
  - Documentation: `docs/contribution-tracking.md`
- **2025-12-25**: Initial specification created
