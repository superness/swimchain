# User Flows - End-to-End Integration Testing

This document describes the four core user flows tested in Milestone 4.1, validating that all Phase 1-3 components work together correctly.

## Overview

| Flow | Description | Key Modules |
|------|-------------|-------------|
| Flow 1 | Identity → Post → Propagate → View | identity, gossip, storage |
| Flow 2 | Join Space → Sync → View → Retrieve | sync, retrieval, storage |
| Flow 3 | Media → Chunk → Upload → Fetch | chunking, retrieval, parallel fetch |
| Flow 4 | Decay → Free Storage → Prune | decay, pruning, storage |

## Flow 1: Identity Creation to Post Viewing

### Sequence Diagram

```
┌──────────┐                         ┌──────────┐                         ┌──────────┐
│  Author  │                         │ Network  │                         │  Viewer  │
└────┬─────┘                         └────┬─────┘                         └────┬─────┘
     │                                    │                                    │
     │ create_identity_with_difficulty(4) │                                    │
     │◄───────────────────────────────────│                                    │
     │                                    │                                    │
     │ Create content + sign              │                                    │
     │◄───────────────────────────────────│                                    │
     │                                    │                                    │
     │ Store in blob_store                │                                    │
     │◄───────────────────────────────────│                                    │
     │                                    │                                    │
     │────────INV(content_hash)──────────►│                                    │
     │                                    │────────INV(content_hash)──────────►│
     │                                    │                                    │
     │                                    │◄───GETDATA([content_hash])─────────│
     │◄────GETDATA([content_hash])────────│                                    │
     │                                    │                                    │
     │────────DATA(content)──────────────►│                                    │
     │                                    │────────DATA(content)──────────────►│
     │                                    │                                    │
     │                                    │           on_data() → store + verify│
     │                                    │◄───────────────────────────────────│
     │                                    │                                    │
     │                                    │           verify(signature)        │
     │                                    │◄───────────────────────────────────│
```

### Timing Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Identity creation (difficulty 4) | <500ms | Test difficulty, production uses 20 |
| Content signing | <1ms | Ed25519 is fast |
| Gossip propagation | <100ms | Local simulation |
| Total flow | <2s | Including all steps |

### Test Functions

- `test_flow1_identity_creation_and_signing` - Basic identity and signing
- `test_flow1_content_propagation` - Content storage and transfer
- `test_flow1_gossip_manager_integration` - Gossip duplicate detection
- `test_flow1_complete_end_to_end` - Full flow validation

## Flow 2: Space Joining and Content Sync

### Sequence Diagram

```
┌──────────┐                         ┌──────────┐                         ┌──────────┐
│  Joiner  │                         │ Seeder 1 │                         │ Seeder 2 │
└────┬─────┘                         └────┬─────┘                         └────┬─────┘
     │                                    │                                    │
     │◄────GETHEADERS(start=0, count=100)─│                                    │
     │                                    │                                    │
     │────────HEADERS([10 blocks])───────►│                                    │
     │                                    │                                    │
     │ Validate header chain              │                                    │
     │◄───────────────────────────────────│                                    │
     │                                    │                                    │
     ├────────────────────────────────────┼────────────────────────────────────┤
     │ loop [For each content hash]       │                                    │
     │                                    │                                    │
     │◄────────WHO_HAS(hash)──────────────│                                    │
     │                                    │                                    │
     │────────I_HAVE(hash)───────────────►│                                    │
     │                                    │                                    │
     │◄────────GET(hash)──────────────────│                                    │
     │                                    │                                    │
     │────────DATA(content)──────────────►│                                    │
     │                                    │                                    │
     │ Store + verify hash                │                                    │
     │◄───────────────────────────────────│                                    │
     │                                    │                                    │
     └────────────────────────────────────┴────────────────────────────────────┘
```

### Timing Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Header sync (10 headers) | <1s | Local simulation |
| Content retrieval (10 posts) | <3s | Sequential for simplicity |
| Total flow | <5s | Including validation |

### Test Functions

- `test_flow2_basic_content_sync` - Simple two-node sync
- `test_flow2_multi_seeder_sync` - Sync from multiple seeders
- `test_flow2_sync_with_integrity` - Signature verification during sync
- `test_flow2_complete_space_sync` - Full space sync with 10 posts

## Flow 3: Media Upload and Retrieval

### Sequence Diagram

```
┌──────────┐                         ┌──────────┐                         ┌──────────┐
│ Uploader │                         │ Network  │                         │ Fetcher  │
└────┬─────┘                         └────┬─────┘                         └────┬─────┘
     │                                    │                                    │
     │ ChunkedContentStore::store(3MB)    │                                    │
     │◄───────────────────────────────────│                                    │
     │                                    │                                    │
     │ [Creates 3 x 1MB chunks + manifest]│                                    │
     │                                    │                                    │
     │────────INV(manifest_hash)─────────►│                                    │
     │                                    │                                    │
     │◄────────WHO_HAS(manifest_hash)─────│◄───────────────────────────────────│
     │                                    │                                    │
     │────────I_HAVE(manifest_hash)──────►│───────────────────────────────────►│
     │                                    │                                    │
     │◄────────GET(manifest_hash)─────────│◄───────────────────────────────────│
     │                                    │                                    │
     │────────DATA(manifest)─────────────►│───────────────────────────────────►│
     │                                    │                                    │
     │                                    │  [ParallelFetcher(max_concurrent=4)]│
     │                                    │                                    │
     ├────────────────────────────────────┼────────────────────────────────────┤
     │ par [Parallel Chunk Fetch]         │                                    │
     │                                    │                                    │
     │◄────────GET(chunk_0)───────────────│◄───────────────────────────────────│
     │◄────────GET(chunk_1)───────────────│◄───────────────────────────────────│
     │◄────────GET(chunk_2)───────────────│◄───────────────────────────────────│
     │                                    │                                    │
     │────DATA(chunk_0, chunk_1, chunk_2)─│───────────────────────────────────►│
     │                                    │                                    │
     │                                    │     Verify hashes + reassemble     │
     │                                    │◄───────────────────────────────────│
     └────────────────────────────────────┴────────────────────────────────────┘
```

### Timing Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Chunking 3MB | <100ms | In-memory |
| Manifest fetch | <100ms | Small metadata |
| Parallel chunk fetch | <1s | 3 chunks, max 4 concurrent |
| Reassembly | <50ms | Sequential read |
| Total flow | <2s | 3MB end-to-end |

### Chunk Size

- `CHUNK_SIZE` = 1,048,576 bytes (1 MB)
- Per SPEC_07 §3, optimal for parallel downloads
- 3MB file → 3 chunks → manifest overhead <0.02%

### Test Functions

- `test_flow3_basic_chunking` - Chunk creation and validation
- `test_flow3_store_and_reassemble` - Store and reassemble roundtrip
- `test_flow3_chunk_transfer` - Transfer between nodes
- `test_flow3_partial_availability` - Missing chunk detection
- `test_flow3_retry_on_missing` - Retry from backup peer
- `test_flow3_complete_media_flow` - Full 3MB transfer
- `test_flow3_chunking_edge_cases` - Edge cases (threshold, sizes)

## Flow 4: Decay and Pruning

### Content Lifecycle Diagram

```
                    ┌─────────────┐
                    │   Created   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
            ┌───────│  Protected  │◄──────────────┐
            │       └──────┬──────┘               │
            │              │ After 48h            │ Engagement
            │              │ (DECAY_FLOOR)        │ within 48h
            │              ▼                      │
            │       ┌─────────────┐               │
            │       │   Active    │───────────────┘
            │       └──────┬──────┘
            │              │ survival < 0.0625
            │              │
            │              ▼
            │       ┌─────────────┐
            │       │   Decayed   │
            │       └──────┬──────┘
            │              │
            │    ┌─────────┴─────────┐
            │    │                   │
            │    ▼                   ▼
            │ ┌─────────┐     ┌───────────┐
            │ │ Deleted │     │Tombstoned │
            │ │(no kids)│     │(has kids) │
            │ └─────────┘     └───────────┘
            │
   ┌────────┴─────────┐
   │ Pin protection   │
   │ (no expiry or    │
   │  not expired)    │
   └──────────────────┘
```

### Decay Calculation

```
effective_decay_time = max(0, time_since_engagement - DECAY_FLOOR_SECS)
half_lives_elapsed = effective_decay_time / HALF_LIFE_SECS
survival_probability = 0.5^half_lives_elapsed
is_decayed = survival_probability < DECAY_THRESHOLD
```

### Constants (from `src/types/constants.rs`)

| Constant | Value | Description |
|----------|-------|-------------|
| DECAY_FLOOR_SECS | 172,800 | 48 hours - protection period |
| HALF_LIFE_SECS | 604,800 | 7 days - decay rate |
| DECAY_THRESHOLD | 0.0625 | 6.25% - below this is decayed |

### Example Decay Calculations

| Content Age | Last Engagement | Effective Decay | Half-lives | Survival | Status |
|-------------|-----------------|-----------------|------------|----------|--------|
| 1 day | 1 day ago | 0 | 0 | 100% | Protected |
| 10 days | 10 days ago | 8 days | 1.14 | 45% | Active |
| 20 days | 20 days ago | 18 days | 2.57 | 17% | Stale |
| 32 days | 32 days ago | 30 days | 4.29 | 5.1% | Decayed |
| 60 days | 1 day ago | 0 | 0 | 100% | Protected |

### Timing Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Decay calculation (100 items) | <100ms | O(1) per item |
| Prune operation | <1s | Including tombstone creation |

### Test Functions

- `test_flow4_decay_floor_protection` - 48h protection period
- `test_flow4_decay_after_floor` - Decay calculation after floor
- `test_flow4_engagement_resets_decay` - Engagement extends life
- `test_flow4_prune_decayed_content` - Basic pruning
- `test_flow4_tombstone_for_parent_with_children` - Thread coherence
- `test_flow4_decay_calculation_performance` - Performance benchmark
- `test_flow4_complete_decay_prune_flow` - Full flow with all states

## Integration Points

| Module | Flow 1 | Flow 2 | Flow 3 | Flow 4 |
|--------|--------|--------|--------|--------|
| identity | ✓ | ✓ | | |
| gossip | ✓ | ✓ | ✓ | |
| sync | | ✓ | | |
| retrieval | | ✓ | ✓ | |
| chunking | | | ✓ | |
| storage | ✓ | ✓ | ✓ | ✓ |
| decay | | | | ✓ |
| pruning | | | | ✓ |

## Test Execution

```bash
# Run all e2e flow tests
cargo test --test e2e_flows

# Run specific flow
cargo test --test e2e_flows test_flow1
cargo test --test e2e_flows test_flow2
cargo test --test e2e_flows test_flow3
cargo test --test e2e_flows test_flow4

# Run with timing output
cargo test --test e2e_flows -- --nocapture

# Run complete flow tests only
cargo test --test e2e_flows complete
```

## Test Coverage Summary

| Flow | Tests | Status | Key Validations |
|------|-------|--------|-----------------|
| Flow 1 | 4 | ✓ | Identity PoW, signing, gossip propagation |
| Flow 2 | 4 | ✓ | Multi-seeder sync, signature verification |
| Flow 3 | 7 | ✓ | 1MB chunking, partial availability, retry |
| Flow 4 | 7 | ✓ | Decay floor, engagement reset, tombstones |
| **Total** | **22** | ✓ | **All flows validated** |

## Acceptance Criteria Verification

| Criterion | Flow 1 | Flow 2 | Flow 3 | Flow 4 |
|-----------|--------|--------|--------|--------|
| All flows complete successfully | ✓ | ✓ | ✓ | ✓ |
| Timing is acceptable | <2s | <5s | <2s | <1s |
| No data loss | ✓ | ✓ | ✓ | ✓ |

## Related Documentation

- `specs/SPEC_01_IDENTITY.md` - Identity system
- `specs/SPEC_02_CONTENT_DECAY.md` - Content decay model
- `specs/SPEC_06_NETWORK_SYNC.md` - Network protocol
- `specs/SPEC_07_CONTENT_DISTRIBUTION.md` - Content distribution
