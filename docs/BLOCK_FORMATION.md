# Block Formation Design

## Overview

Swimchain uses a **PoW-driven block formation** model inspired by Bitcoin. Blocks form naturally when cumulative proof-of-work from pending actions reaches a threshold, rather than being forced on a fixed timer.

## Key Principles

1. **Work determines block timing** - Blocks form when accumulated PoW meets threshold
2. **No timer-based forcing** - Unlike traditional approaches, we don't force blocks every N seconds
3. **Mempool gossip for instant updates** - Users see changes immediately via mempool
4. **Blocks provide finality** - Blocks are the permanent record, mempool is ephemeral

## How It Works

### Action Flow

```
User submits action via RPC
         │
         ▼
┌─────────────────────────┐
│  Add to local mempool   │
│  (BlockBuilder)         │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Broadcast to peers     │
│  (MSG_ACTION_ANNOUNCE)  │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Check PoW threshold    │
│  should_form_root()?    │
└──────────┬──────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
  Below        Threshold
threshold        met!
    │             │
    ▼             ▼
  Wait for     Form block
more actions   immediately
```

### Mempool Gossip (MSG_ACTION_ANNOUNCE)

When a node receives an action (via RPC or peer gossip):

1. **Validate** - Check action signature, PoW, timestamps
2. **Deduplicate** - Skip if already in mempool (via action hash)
3. **Add to mempool** - Store in BlockBuilder with PoW work value
4. **Forward to peers** - Broadcast to all connected peers
5. **Check threshold** - If cumulative PoW >= difficulty_target, form block

### Block Formation Trigger

```rust
// In router::try_form_block_if_threshold_met()
if block_builder.should_form_root() {
    let (root, spaces, contents) = block_builder.build_root_block(timestamp);
    chain_store.put_root_block(&root);
    connection_pool.broadcast(BlockAnnounce);
}
```

### Cumulative PoW Calculation

Each action carries a `pow_work` value representing seconds of computational work:

```rust
total_pow = sum(action.pow_work for action in mempool)

should_form_root = total_pow >= difficulty_target  // default: 30 seconds
```

## Configuration

| Constant | Default | Description |
|----------|---------|-------------|
| `INITIAL_DIFFICULTY` | 30 | Seconds of cumulative PoW to trigger block |
| `BLOCK_FORMATION_CHECK_INTERVAL_SECS` | 300 | Backup check interval (5 min) |

## Benefits

### vs Timer-Based Block Formation

| Aspect | Timer-Based | PoW-Driven |
|--------|-------------|------------|
| Block timing | Fixed interval | Natural, based on activity |
| Low activity | Empty blocks | No blocks until work accumulates |
| High activity | Blocks fill up, overflow to next | More frequent blocks |
| Fork probability | High (multiple nodes form at same time) | Low (first to hit threshold wins) |

### Fork Reduction

The mempool gossip + PoW threshold model reduces forks because:

1. **Shared mempool** - All nodes have the same pending actions
2. **Deterministic threshold** - First node to hit threshold forms block
3. **Block propagation** - Other nodes receive block and clear their mempool
4. **No race condition** - Not all nodes trying to form blocks simultaneously

## Implementation Files

- `src/blocks/builder.rs` - BlockBuilder with `should_form_root()`, `total_pow()`
- `src/node/router/router.rs` - `handle_action_announce()`, `try_form_block_if_threshold_met()`
- `src/node/tasks.rs` - Backup check task (not primary formation)
- `src/network/messages.rs` - `ActionAnnouncePayload`
- `src/types/constants.rs` - `MSG_ACTION_ANNOUNCE` (0x93)

## Message Types

| Type | Code | Purpose |
|------|------|---------|
| `MSG_ACTION_ANNOUNCE` | 0x93 | Share pending action with peers |
| `MSG_BLOCK_ANNOUNCE` | 0x15 | Announce newly formed block |

## Future Considerations

### Fork Choice Rule

When forks do occur (rare), nodes need a rule to pick the canonical chain:
- Most cumulative PoW
- Most content blocks
- Longest chain

### Block Validation

Blocks should include actions that were in shared mempool:
- Prevents nodes from skipping known actions
- Ensures all nodes produce equivalent blocks
- Invalid blocks (missing known actions) can be rejected

---

*Last updated: 2026-01-05*
