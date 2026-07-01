# Benefit System Integration Guide

This guide explains how to integrate the contribution benefits system with other components.

## PoW Integration

### Using Level-Adjusted Difficulty

For new code that knows the author's level:

```rust
use swimchain::crypto::action_pow::{
    ActionType, PoWChallenge, ForkPoWConfig, get_difficulty_for_level,
};
use swimchain::level::SwimmerLevel;

// Get the author's level (from LevelManager)
let author_level = level_manager.get_level(&author_pubkey)
    .unwrap_or(SwimmerLevel::NewSwimmer);

// Option 1: Get adjusted difficulty directly
let config = ForkPoWConfig::production();
let difficulty = get_difficulty_for_level(ActionType::Post, author_level, &config);

// Option 2: Generate challenge with level-adjusted difficulty
let challenge = PoWChallenge::generate_with_level(
    ActionType::Post,
    content,
    &author_pubkey,
    author_level,
    &config,
);
```

### Backward Compatibility

Existing code using `PoWChallenge::generate()` continues to work unchanged:

```rust
// This still works - uses base difficulty without reduction
let challenge = PoWChallenge::generate(
    ActionType::Post,
    content,
    &author_pubkey,
    difficulty::POST,  // 20 bits
);
```

### CLI Integration

The CLI automatically applies level-adjusted difficulty when creating content:

```rust
// In CLI commands, get author level first
let author_level = get_author_level(&identity.public_key)?;

// Use level-aware challenge generation
let challenge = PoWChallenge::generate_with_level(
    ActionType::Post,
    content,
    &identity.public_key,
    author_level,
    &config,
);
```

## Decay Integration

### Using Level-Extended Half-Life

For content owned by a specific author:

```rust
use swimchain::content::calculate_decay_state_with_level;
use swimchain::level::SwimmerLevel;
use swimchain::types::constants::HALF_LIFE_SECS;

// Get the author's level
let author_level = level_manager.get_level(&content.author_id)?;

// Calculate decay with level multiplier
let state = calculate_decay_state_with_level(
    &content,
    author_level,
    current_time_ms,
    HALF_LIFE_SECS,
);

// state.survival_probability accounts for extended half-life
if state.is_decayed {
    // Content should be pruned
}
```

### Backward Compatibility

Existing code using `calculate_decay_state()` is unchanged:

```rust
// This still works - uses base half-life
let state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);
```

### Pruning Integration

When pruning, look up author levels:

```rust
for content in all_content {
    let author_level = level_manager
        .get_level(&content.author_id)
        .unwrap_or(SwimmerLevel::NewSwimmer);

    let state = calculate_decay_state_with_level(
        &content,
        author_level,
        current_time_ms,
        HALF_LIFE_SECS,
    );

    if state.is_decayed {
        prune(content);
    }
}
```

## Space Creation Gating

### Checking Permission

Before allowing space creation:

```rust
use swimchain::benefits::{can_create_space, MIN_LEVEL_FOR_SPACE_CREATION};

let author_level = level_manager.get_level(&author_pubkey)?;

if !can_create_space(author_level) {
    return Err(Error::InsufficientLevel {
        current: author_level.name(),
        required: MIN_LEVEL_FOR_SPACE_CREATION.name(),
    });
}

// Proceed with space creation
```

### Error Handling

Provide helpful error messages:

```rust
CliError::InsufficientLevel {
    current: author_level.name().to_string(),
    required: MIN_LEVEL_FOR_SPACE_CREATION.name().to_string(),
    tip: format!(
        "Advance to {} by contributing bandwidth and uptime. \
         See 'cs status --level' for progress.",
        MIN_LEVEL_FOR_SPACE_CREATION.name()
    ),
}
```

## Sync Priority Queue

### Basic Usage

```rust
use swimchain::sync::SyncPriorityQueue;
use swimchain::benefits::{sync_priority, Priority};

let mut queue: SyncPriorityQueue<SyncRequest> = SyncPriorityQueue::new();

// Add requests with their priority
for peer_request in incoming_requests {
    let peer_level = level_manager.get_level(&peer_request.peer_id)?;
    let priority = sync_priority(peer_level);
    queue.push(peer_request, priority);
}

// Process in priority order (when under load)
while let Some(request) = queue.pop() {
    process(request);
}
```

### Under Load Behavior

```rust
use swimchain::sync::PRIORITY_QUEUE_ACTIVATION_THRESHOLD;

// Queue starts in FIFO mode
assert!(!queue.is_priority_mode());

// After threshold is crossed, switches to priority mode
for _ in 0..PRIORITY_QUEUE_ACTIVATION_THRESHOLD {
    queue.push(request, Priority::Normal);
}
queue.push(high_priority_request, Priority::Highest);

assert!(queue.is_priority_mode());
// high_priority_request will be popped before the earlier Normal requests
```

### Integration with Sync Loop

```rust
// In the sync handler
fn handle_sync_request(&mut self, peer_id: [u8; 32], request: SyncRequest) {
    let peer_level = self.level_manager
        .get_level(&peer_id)
        .unwrap_or(SwimmerLevel::NewSwimmer);

    let priority = sync_priority(peer_level);

    self.request_queue.push(request, priority);

    // Log if we're in priority mode
    if self.request_queue.is_priority_mode() {
        log::info!(
            "Under load: {} pending requests, using priority ordering",
            self.request_queue.len()
        );
    }
}
```

## Error Handling Patterns

### Level Lookup Failure

Always provide fallback behavior:

```rust
// For PoW reduction: no bonus on failure
let level = level_manager.get_level(&author).unwrap_or(SwimmerLevel::NewSwimmer);
let difficulty = get_difficulty_for_level(action, level, &config);

// For decay: base half-life on failure
let level = match level_manager.get_level(&content.author_id) {
    Ok(level) => level,
    Err(_) => {
        // Fail-safe: use base calculation
        return calculate_decay_state(&content, time, half_life);
    }
};

// For space creation: block on failure
let level = level_manager.get_level(&author)?;  // Propagate error
if !can_create_space(level) { ... }
```

## Testing

### Mocking Levels

For tests, you can bypass level checks:

```rust
// CLI has hidden flags for testing
cs space create --name "Test" --skip-level-check

// Or use a mock LevelManager
struct MockLevelManager {
    default_level: SwimmerLevel,
}

impl MockLevelManager {
    fn get_level(&self, _: &[u8; 32]) -> Result<SwimmerLevel> {
        Ok(self.default_level)
    }
}
```

### Test Vectors

Key test cases for each function:

```rust
// adjusted_difficulty
assert_eq!(adjusted_difficulty(20, SwimmerLevel::PoolKeeper), 10);
assert_eq!(adjusted_difficulty(1, SwimmerLevel::PoolKeeper), 1);  // min clamp

// decay_multiplier
assert_eq!(decay_multiplier(SwimmerLevel::PoolKeeper), 2.0);
assert_eq!(decay_multiplier(SwimmerLevel::NewSwimmer), 1.0);

// can_create_space
assert!(!can_create_space(SwimmerLevel::Regular));
assert!(can_create_space(SwimmerLevel::Resident));

// sync_priority
assert_eq!(sync_priority(SwimmerLevel::PoolKeeper), Priority::Highest);
assert_eq!(sync_priority(SwimmerLevel::Resident), Priority::Normal);
```

## See Also

- `docs/contribution-benefits.md` - Overview of all benefits
- `docs/swimmer-levels.md` - Level requirements and computation
- `src/benefits/` - Implementation source
