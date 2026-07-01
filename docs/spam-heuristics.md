# Spam Detection Heuristics

This document describes Swimchain's automated spam detection heuristics as specified in SPEC_12 Section 7.

## Design Philosophy

These heuristics are **advisory, not authoritative**. They trigger review flags rather than automatic content removal. Human attestation through the spam attestation system is still required to trigger accelerated decay of content.

The goal is to assist community moderation by surfacing potentially problematic content for review while avoiding false positives that would harm legitimate users.

## Heuristic Categories

### 1. Repetition Detection

Detects duplicate and near-duplicate content within a configurable time window.

**Configuration:**
- `REPETITION_WINDOW_SECS`: 3,600 (1 hour)
- `MAX_EXACT_DUPLICATES`: 1 (flag on second identical post)
- `SIMILARITY_THRESHOLD`: 0.85 (85% similarity for near-duplicates)

**Detection Methods:**
- **Exact duplicates**: SHA-256 hash of normalized content
- **Near-duplicates**: SimHash with Hamming distance comparison

**Normalization:**
- Convert to lowercase
- Collapse whitespace
- Trim leading/trailing spaces

### 2. Cross-Posting Limits

Limits how many spaces the same content can be posted to within a time window.

**Configuration:**
- `MAX_CROSS_POST_SPACES`: 3
- `CROSS_POST_WINDOW_SECS`: 86,400 (24 hours)

**Rationale:**
Cross-posting the same content to many spaces is a common spam pattern. Limiting to 3 spaces allows legitimate sharing while preventing spam floods.

### 3. Rate Limits by Swimmer Level

Different posting limits based on the user's swimmer level (contribution standing).

**Daily Post Limits:**

| Level | Posts/Day |
|-------|-----------|
| NewSwimmer | 0 (cannot post) |
| Regular | 5 |
| Resident | 20 |
| Lifeguard+ | 50 |

**Space Flooding Protection:**
- `POSTS_PER_SPACE_PER_HOUR`: 5 (per author, per space)

**Rationale:**
- New users must contribute (host content) before posting
- Higher levels earned through contribution get more posting capacity
- Space-specific limits prevent flooding individual communities

### 4. Pattern Detection

Identifies suspicious patterns in content that correlate with spam.

**Patterns Detected:**

| Pattern | Threshold | Weight |
|---------|-----------|--------|
| High link density | >25% links/words | 0.6 |
| Excessive mentions | >10 @mentions | 0.5 |
| All caps | >80% uppercase | 0.3 |
| Repeated characters | 5+ in sequence | 0.5 |

**Link Density Example:**
```
"Check out https://spam.com and https://more.com in this short post"
= 2 links / 8 words = 25% density (flagged)
```

### 5. Review Flags

When heuristics trigger, content is flagged for review rather than removed.

**Flag Severity Levels:**

| Reason | Severity |
|--------|----------|
| Rate limit exceeded | 1.0 |
| Repetition | 0.9 |
| Cross-posting | 0.8 |
| Near-duplicate | 0.7 |
| High link density | 0.6 |
| Excessive mentions | 0.5 |
| All caps | 0.3 |

**Review Outcomes:**
- `Legitimate`: Content confirmed as non-spam
- `ConfirmedSpam`: Content confirmed as spam (triggers attestation)
- `Suspicious`: Warrants monitoring but not action
- `Inconclusive`: Unable to determine

## Integration with Spam Attestation

The heuristics system feeds into the spam attestation system:

1. Heuristics flag content for review
2. Moderators review flagged content
3. If confirmed spam, attestation is created
4. 3 attestations from independent sponsor trees trigger accelerated decay
5. 5 Lifeguard+ counter-attestations can restore content

## API Usage

```rust
use swimchain::spam_heuristics::{
    RepetitionDetector, CrossPostingTracker, RateLimitTracker,
    PatternDetector, ReviewFlagStore, HeuristicResult,
};

// Create detectors
let mut repetition = RepetitionDetector::new();
let mut cross_posting = CrossPostingTracker::new();
let mut rate_limits = RateLimitTracker::new();
let pattern = PatternDetector::new();
let mut flags = ReviewFlagStore::new();

// Check content
let content = b"This is a post";
let space_id = [0u8; 16];
let author = [0u8; 32];
let timestamp = 1000u64;
let level = SwimmerLevel::Regular;

// Run heuristics
let mut result = repetition.check(content, &space_id, &author, timestamp);
result.merge(cross_posting.check(content, &space_id, &author, timestamp));
result.merge(rate_limits.check(&author, &space_id, level, timestamp));
result.merge(pattern.check(content));

// Flag if needed
if result.should_flag {
    if let Some(flag) = ReviewFlag::from_heuristic_result(
        content_hash, space_id, author, &result, timestamp
    ) {
        flags.add_flag(flag);
    }
}
```

## Configuration

All constants can be overridden via the `*Config` structs:

```rust
let config = RepetitionConfig {
    window_secs: 7200,          // 2 hours
    max_exact_duplicates: 2,    // Allow 2 duplicates
    similarity_threshold: 0.90, // 90% similarity
};
let detector = RepetitionDetector::with_config(config);
```

## Performance Considerations

- **Memory**: Trackers keep recent entries in memory, cleaned up on access
- **CPU**: SimHash computation uses SHA-256 on 3-grams
- **Storage**: Review flags persist; cleanup old reviewed entries periodically

Recommended cleanup:
```rust
// Clean up entries older than current window
repetition.cleanup(current_time);
cross_posting.cleanup(current_time);
rate_limits.cleanup(current_time);

// Clean up old reviewed flags
flags.cleanup_reviewed(current_time - 86400 * 7); // 7 days
```

## Attack Resistance

See RESEARCH_06 (Contribution-Based Access Economics) for detailed attack analysis.

Key defenses:
1. **Sybil attacks**: Rate limits tied to swimmer level, which requires hosting contribution
2. **Spam floods**: Multi-layer limits (daily, hourly, per-space)
3. **Evasion**: Near-duplicate detection catches minor variations
4. **False positives**: Human review required before action

## Related Documentation

- [SPEC_12: Anti-Abuse Mechanisms](../specs/SPEC_12_ANTIABUSE.md)
- [Spam Attestation System](./spam-attestation.md)
- [Swimmer Levels](./swimmer-levels.md)
