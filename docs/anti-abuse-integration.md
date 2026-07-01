# Anti-Abuse Integration (Milestone 10.7)

This document describes the unified anti-abuse integration layer that ties together
all moderation components implemented in Phase 10.

## Overview

The `AntiAbuseHandler` in `src/api/anti_abuse.rs` provides a central interface for:

- **Content Creation Checks**: Pre-PoW validation including rate limits, repetition detection, and reputation checks
- **Spam Attestation Submission**: Submitting and tracking spam reports
- **Blocklist Verification**: Checking content against the illegal content blocklist
- **Metrics and Monitoring**: Tracking anti-abuse system performance

## Architecture

```
+-------------------+
|  AntiAbuseHandler |
+-------------------+
        |
        +---> SpamAttestationStore   (Milestone 10.2)
        +---> BlocklistStore          (Milestone 10.3)
        +---> ReputationStore         (Milestone 10.4)
        +---> PatternDetector         (Milestone 10.5)
        +---> RateLimitTracker        (Milestone 10.5)
        +---> RepetitionDetector      (Milestone 10.5)
        +---> CrossPostingTracker     (Milestone 10.5)
        +---> ReviewFlagStore         (Milestone 10.5)
```

## Usage

### Creating an AntiAbuseHandler

```rust
use swimchain::api::anti_abuse::AntiAbuseHandler;
use swimchain::blocklist::MemoryBlocklistStore;
use swimchain::reputation::ReputationStore;
use swimchain::spam_attestation::SpamAttestationStore;
use swimchain::spam_heuristics::ReviewFlagStore;
use std::sync::{Arc, RwLock};

let db = sled::open("data/swimchain").unwrap();
let spam_store = Arc::new(RwLock::new(SpamAttestationStore::open(db.clone())));
let blocklist_store = Arc::new(RwLock::new(MemoryBlocklistStore::new()));
let reputation_store = Arc::new(ReputationStore::open(db.clone()));
let review_flag_store = Arc::new(RwLock::new(ReviewFlagStore::new()));

let handler = AntiAbuseHandler::new(
    spam_store,
    blocklist_store,
    reputation_store,
    review_flag_store,
);
```

### Checking If Content Can Be Posted

Before computing PoW for a new post, check if posting is allowed:

```rust
use swimchain::level::SwimmerLevel;

let author_id = [1u8; 32];
let space_id = [2u8; 16];
let content = b"Hello, Swimchain!";
let current_time = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_secs();

match handler.can_post_content(
    &author_id,
    SwimmerLevel::Regular,
    content,
    &space_id,
    current_time,
) {
    Ok(result) => {
        if result.allowed {
            // Proceed with PoW and posting
            println!("Posting allowed with rate limit: {}", result.adjusted_rate_limit);
            for warning in &result.warnings {
                println!("Warning: {}", warning);
            }
        }
    }
    Err(e) => {
        // Posting rejected
        eprintln!("Cannot post: {}", e);
    }
}
```

### Registering Content After Creation

After content is successfully created, register it for tracking:

```rust
handler.register_content(&author_id, content, &space_id, current_time);
```

### Checking Content Retrieval

Before serving content, verify it's not blocklisted:

```rust
let content_hash = [3u8; 32]; // Content hash to check

match handler.check_retrieval_allowed(&content_hash) {
    Ok(()) => {
        // Safe to serve content
    }
    Err(AntiAbuseError::ContentBlocklisted { reason }) => {
        // Content is blocked - do not serve
        eprintln!("Content blocked: {:?}", reason);
    }
    Err(e) => {
        eprintln!("Error checking content: {}", e);
    }
}
```

### Submitting Spam Attestations

Resident+ level users can submit spam attestations:

```rust
use swimchain::spam_attestation::{SpamAttestation, SpamReason};

let attestation = SpamAttestation {
    content_hash: [4u8; 32],
    attester: [5u8; 32],
    reason: SpamReason::Advertising,
    timestamp: current_time,
    pow_nonce: 12345,
    signature: [0u8; 64], // Ed25519 signature
};

match handler.submit_spam_attestation(attestation, SwimmerLevel::Resident) {
    Ok(result) => {
        println!("Attestation accepted: {}", result.accepted);
        println!("Threshold reached: {}", result.threshold_reached);
        println!("Current attestations: {}/{}", result.current_count, result.required_count);
    }
    Err(e) => {
        eprintln!("Failed to submit attestation: {}", e);
    }
}
```

### Checking Spam Status

```rust
let status = handler.get_spam_status(&content_hash);

if status.is_flagged {
    println!("Content flagged with {} attestations", status.attestation_count);
    if status.is_cleared {
        println!("Flag was cleared by {} counter-attestations", status.counter_count);
    }
}
```

### Checking Reputation

```rust
let reputation_effect = handler.get_reputation_effect(&author_id);

match reputation_effect {
    ReputationEffect::Trusted => println!("Trusted user - content decays slower"),
    ReputationEffect::Normal => println!("Normal user"),
    ReputationEffect::Watched => println!("Watched user - reduced rate limits"),
    ReputationEffect::Restricted => println!("Restricted user - severely limited"),
    ReputationEffect::Untrusted => println!("Untrusted user - blocked from posting"),
}
```

### Monitoring Metrics

```rust
let metrics = handler.get_metrics();

println!("Content created: {}", metrics.content_created);
println!("Spam attestations: {}", metrics.spam_attestations);
println!("Rate limit hits: {}", metrics.rate_limit_hits);
println!("Blocklist hits: {}", metrics.blocklist_hits);
println!("Total violations: {}", metrics.total_violations());
```

## Error Handling

The `AntiAbuseError` enum covers all error cases:

| Error | Description |
|-------|-------------|
| `RateLimitExceeded` | User has exceeded posting rate limit |
| `RepetitiveContent` | Content is duplicate or near-duplicate |
| `CrossPostLimitExceeded` | Content posted to too many spaces |
| `NotEligibleToAttest` | User level insufficient for attestation |
| `PoorReputation` | Reputation score too low to post |
| `ContentBlocklisted` | Content is on illegal content blocklist |
| `Storage` | Database storage error |
| `Validation` | Validation error |

## Events

The module exports `AntiAbuseEvent` for subscription-based notification:

- `SpamAttestationSubmitted` - New spam attestation received
- `SpamThresholdReached` - Content flagged (3+ attestations)
- `CounterAttestationSubmitted` - Counter-attestation received
- `SpamFlagCleared` - Flag cleared by counter-attestations
- `ContentBlocklisted` - Content added to blocklist
- `ReputationPenalty` - User reputation reduced

## Wire Protocol

Integration with the gossip layer uses these message types:

| Message | Code | Description |
|---------|------|-------------|
| `MSG_SPAM_ATTESTATION` | `0x80` | Submit spam attestation |
| `MSG_COUNTER_ATTESTATION` | `0x81` | Submit counter-attestation |
| `MSG_QUALITY_ATTESTATION` | `0x82` | Quality attestation (future) |
| `MSG_REPUTATION_QUERY` | `0x83` | Query poster reputation |
| `MSG_REPUTATION_RESPONSE` | `0x84` | Reputation response |

## Integration Points

### Content Creation Flow

1. Client calls `can_post_content()` before computing PoW
2. If allowed, client computes PoW and submits content
3. On success, client calls `register_content()` to update trackers
4. Pattern detection may add review flags for moderator attention

### Content Retrieval Flow

1. Before serving content, call `check_retrieval_allowed()`
2. Check `is_spam_flagged()` to apply accelerated decay
3. Use `get_reputation_effect()` for author reputation context

### Decay System Integration

Spam-flagged content uses accelerated decay (4-hour half-life vs 7-day normal):

```rust
if handler.is_spam_flagged(&content_hash) {
    // Use accelerated decay calculation
    decay.calculate_decay_state_spam_flagged(content_hash, timestamp)
} else {
    decay.calculate_decay_state_normal(content_hash, timestamp)
}
```

### Gossip Integration

Spam attestations and blocklist updates propagate via gossip:

```rust
// On receiving gossip message
match message_type {
    MSG_SPAM_ATTESTATION => {
        let attestation = parse_spam_attestation(payload)?;
        handler.submit_spam_attestation(attestation, attester_level)?;
    }
    MSG_BLOCKLIST_UPDATE => {
        // Handle blocklist sync via BlocklistGossip
    }
    // ...
}
```

## Testing

Run the anti-abuse tests:

```bash
cargo test --lib api::anti_abuse
```

## See Also

- [Spam Attestation](spam-attestation.md) - Milestone 10.2
- [Blocklist Protocol](blocklist-protocol.md) - Milestone 10.3
- [Poster Reputation](poster-reputation.md) - Milestone 10.4
- [Spam Heuristics](spam-heuristics.md) - Milestone 10.5
- SPEC_12 - Full specification
