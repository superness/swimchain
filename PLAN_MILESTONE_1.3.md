# Implementation Plan: Milestone 1.3 - Content & Decay Engine

## Overview

This plan implements the Content & Decay Engine per SPEC_02 v0.4.0, providing:
- Content storage with hash-based addressing
- Engagement-based heat model (extends content life)
- Decay tick processor with adaptive half-life
- Content lifecycle management (creation → active → stale → decayed)
- Inline vs referenced content threshold (1KB)
- Pruning of decayed content with tombstone support

---

## IMPLEMENTATION_PLAN:

### STEP 1: Add Adaptive Decay Constants
**DELIVERABLE:** Content lifecycle parameters

**ACTIONS:**
- Add 9 new constants to `src/types/constants.rs` after line 50:
  - `TARGET_STORAGE_BYTES: u64 = 524_288_000` (500MB per SPEC_02 §4.1.1)
  - `MIN_HALF_LIFE_SECS: u64 = 86_400` (1 day minimum)
  - `MAX_HALF_LIFE_SECS: u64 = 2_592_000` (30 days maximum)
  - `ADAPTATION_INTERVAL_SECS: u64 = 3_600` (1 hour)
  - `ADAPTATION_SMOOTHING: f64 = 0.1` (10% adjustment per interval)
  - `MAX_PRESERVATION_DAYS: u16 = 30` (per item)
  - `MAX_TOTAL_PRESERVATION_DAYS: u16 = 365` (cumulative)
  - `MAX_PINS_PER_SPACE: u32 = 100`
  - `PRUNE_GRACE_PERIOD_MS: u64 = 86_400_000` (24 hours after decay threshold)

**FILES_AFFECTED:**
- `src/types/constants.rs` - modify (add after line 50)

**VERIFICATION:**
- `cargo build` compiles successfully
- Constants are accessible from other modules

---

### STEP 2: Update ContentItem Structure
**DELIVERABLE:** Content storage with hash-based addressing

**ACTIONS:**
- Modify `ContentItem` struct in `src/types/content.rs` (lines 216-251):
  - **ADD:** `last_engagement: u64` - timestamp of last meaningful engagement (initialized to `created_at`)
  - **ADD:** `pow_difficulty: u8` - achieved PoW difficulty for content creation
  - **ADD:** `preservation_pow: Option<u64>` - optional author preservation PoW
  - **ADD:** `content_size: Option<u32>` - size of external content blob (for >1KB)
  - **REMOVE:** `updated_at: u64` - replaced by spec-compliant `last_engagement`
  - **REMOVE:** `reply_count: u64` - not in SPEC_02; use `engagement_count` instead
  - **REMOVE:** `quote_count: u64` - not in SPEC_02; use `engagement_count` instead
  - **CHANGE:** `engagement_count: u64` → `engagement_count: u32` (per SPEC_02 §3.1)
- Add `impl Default for ContentItem` for testing convenience

**FILES_AFFECTED:**
- `src/types/content.rs` - modify (lines 215-251)

**VERIFICATION:**
- `cargo build` compiles successfully
- Existing tests updated to match new struct

---

### STEP 3: Update EngagementRecord Structure
**DELIVERABLE:** Engagement tracking for heat calculation

**ACTIONS:**
- Modify `EngagementRecord` struct in `src/types/content.rs` (lines 280-295):
  - **RENAME:** `target_content_id` → `content_id` (per SPEC_02 §3.5 naming)
  - **ADD:** `pow_work: u64` - work amount in seconds (for pool contributions)
- Update all usages (only 1 usage found in struct definition itself)

**FILES_AFFECTED:**
- `src/types/content.rs` - modify (lines 278-295)

**VERIFICATION:**
- `cargo build` compiles successfully
- `cargo test` passes

---

### STEP 4: Update DecayState Structure
**DELIVERABLE:** Decay calculation support

**ACTIONS:**
- Replace `DecayState` struct in `src/types/content.rs` (lines 297-308) with spec-compliant version:
  ```rust
  pub struct DecayState {
      pub content_id: ContentId,
      pub age_seconds: u64,
      pub time_since_engagement: u64,
      pub half_lives_elapsed: f64,
      pub survival_probability: f64,
      pub is_decayed: bool,
      pub is_protected: bool,
  }
  ```
- Add `ContentLifecycle` enum after `DecayState`:
  ```rust
  pub enum ContentLifecycle {
      Protected,  // Within floor or pinned (survival = 1.0)
      Active,     // survival >= 50% (< 1 half-life)
      Stale,      // 6.25% <= survival < 50% (1-4 half-lives)
      Decayed,    // survival < 6.25% (>= 4 half-lives)
  }
  ```
- Add `impl From<&DecayState> for ContentLifecycle`

**FILES_AFFECTED:**
- `src/types/content.rs` - modify (lines 297-320)

**VERIFICATION:**
- `cargo build` compiles successfully
- All lifecycle states correctly map from survival probability

---

### STEP 5: Create Content Module Structure
**DELIVERABLE:** Module organization for decay engine

**ACTIONS:**
- Create `src/content/mod.rs` with submodule declarations:
  ```rust
  pub mod decay;
  pub mod engagement;
  pub mod lifecycle;
  pub mod pruning;
  pub mod storage;
  ```
- Add `pub mod content;` to `src/lib.rs` after line 7
- Export key types from module root

**FILES_AFFECTED:**
- `src/content/mod.rs` - create
- `src/lib.rs` - modify (line 7)

**VERIFICATION:**
- `cargo build` compiles successfully
- Module is accessible as `swimchain::content`

---

### STEP 6: Implement Storage Layer
**DELIVERABLE:** Content storage (key-value by hash)

**ACTIONS:**
- Create `src/content/storage.rs` with:
  - `StorageStats` struct: `item_count`, `total_bytes`, `updated_at`
  - `ContentStore` trait with methods:
    - `put(&mut self, item: ContentItem) -> bool`
    - `get(&self, id: &ContentId) -> Option<&ContentItem>`
    - `get_mut(&mut self, id: &ContentId) -> Option<&mut ContentItem>`
    - `delete(&mut self, id: &ContentId) -> Option<ContentItem>`
    - `contains(&self, id: &ContentId) -> bool`
    - `iter(&self) -> Box<dyn Iterator<Item = &ContentItem> + '_>`
    - `get_by_space(&self, space_id: &SpaceId) -> Vec<&ContentItem>`
    - `get_children(&self, parent_id: &ContentId) -> Vec<&ContentItem>`
    - `stats(&self) -> StorageStats`
  - `InMemoryContentStore` implementation with:
    - `HashMap<ContentId, ContentItem>` for content
    - `HashMap<ContentId, Vec<ContentId>>` for parent→children index (critical for pruning)
  - `estimate_item_size(item: &ContentItem) -> u64` function:
    - Base: ~257 bytes (content_id(32) + author_id(32) + signature(64) + timestamps(16) + pow(9) + counts(4) + overhead)
    - Variable: body_inline length + 64 bytes per media_ref + 50 if pin_state + 32 if content_hash

**FILES_AFFECTED:**
- `src/content/storage.rs` - create

**VERIFICATION:**
- Unit tests for put/get/delete operations
- Unit tests for children index maintenance
- Unit tests for size estimation

---

### STEP 7: Implement Decay Calculation Engine
**DELIVERABLE:** Heat calculation, Decay tick processor

**ACTIONS:**
- Create `src/content/decay.rs` with:
  - `calculate_decay_state(content: &ContentItem, current_time_ms: u64, half_life_secs: u64) -> DecayState`
    - Algorithm per SPEC_02 §4.1:
      1. Check floor protection (age < 48 hours from creation)
      2. Check pin protection (valid unexpired pin)
      3. Calculate `effective_decay_time = max(0, time_since_engagement - DECAY_FLOOR)`
      4. Calculate `half_lives_elapsed = effective_decay_time / half_life`
      5. Calculate `survival_probability = 0.5^half_lives_elapsed`
      6. Set `is_decayed = survival_probability < DECAY_THRESHOLD`
  - `calculate_adaptive_half_life(current_storage: u64, target_storage: u64, current_half_life: u64) -> u64`
    - Algorithm per SPEC_02 §4.1.1:
      1. Calculate storage pressure ratio
      2. Target half-life inversely proportional to pressure
      3. Apply 10% smoothing toward target
      4. Clamp to [MIN_HALF_LIFE, MAX_HALF_LIFE]

**SPEC TEST VECTOR NOTE:**
- SPEC_02 §11.1 Test Vector 2 has an error in expected values
- The spec states `effective_decay_time: 0` but per the algorithm in §4.1:
  - time_since_engagement = 5 days = 432,000 seconds
  - effective_decay_time = max(0, 432000 - 172800) = 259,200 seconds (NOT 0)
- Implementation follows the ALGORITHM (§4.1), not the incorrect test vector
- Add code comment documenting this discrepancy

**FILES_AFFECTED:**
- `src/content/decay.rs` - create

**VERIFICATION:**
- Test: Floor protection (age=1 day) → is_protected=true, survival=1.0
- Test: Basic decay 32 days → survival≈0.051, is_decayed=true
- Test: Engagement resets decay (engagement day 27, current day 32) → half_lives≈0.428
- Test: Adaptive half-life decreases under storage pressure
- Test: Adaptive half-life increases when under target

---

### STEP 8: Implement Engagement Processing
**DELIVERABLE:** Engagement (views, replies) extends heat

**ACTIONS:**
- Create `src/content/engagement.rs` with:
  - `EngagementResult` enum: `Accepted { new_last_engagement, new_engagement_count }`, `Rejected(EngagementRejection)`
  - `EngagementRejection` enum: `ContentDecayed`, `InvalidPoW(String)`, `PoolIncomplete`, `ContentNotFound`
  - `process_engagement(content: &mut ContentItem, engagement: &EngagementRecord, decay_state: &DecayState) -> EngagementResult`
    - Reject if `decay_state.is_decayed`
    - For REPLY/QUOTE: update `last_engagement` and increment `engagement_count`
    - For ENGAGE: return `PoolIncomplete` (pool handling deferred to Phase 2/SPEC_08)
    - Self-engagement IS allowed (per SPEC_02 v0.3.0) - costs same PoW

**PHASE 1 LIMITATIONS:**
- PoW verification is stubbed (always passes for REPLY/QUOTE)
- ENGAGE type always returns PoolIncomplete (pool handling deferred)

**FILES_AFFECTED:**
- `src/content/engagement.rs` - create

**VERIFICATION:**
- Test: REPLY on active content → Accepted with updated timestamps
- Test: QUOTE on active content → Accepted with updated timestamps
- Test: ENGAGE → Rejected(PoolIncomplete)
- Test: Any engagement on decayed content → Rejected(ContentDecayed)

---

### STEP 9: Implement Pruning System
**DELIVERABLE:** Pruning of decayed content

**ACTIONS:**
- Create `src/content/pruning.rs` with:
  - `PruneStats` struct: `pruned_count`, `tombstone_count`, `bytes_freed`, `protected_count`, `grace_period_count`
  - `prune_decayed_content<S: ContentStore>(store: &mut S, tombstones: &mut Vec<Tombstone>, current_time_ms: u64, half_life_secs: u64) -> PruneStats`
    - Algorithm per SPEC_02 §4.3:
      1. Iterate all content, calculate decay state
      2. Skip protected content (floor or pinned)
      3. Skip non-decayed content
      4. Check grace period (24 hours after reaching decay threshold)
      5. Check for non-decayed children via `has_non_decayed_children()` (uses parent→children index)
      6. If has live children: create tombstone, preserve minimal context
      7. Otherwise: full removal
  - `has_non_decayed_children<S: ContentStore>(store: &S, parent_id: &ContentId, current_time_ms: u64, half_life_secs: u64) -> bool`
    - Recursively check all children for non-decayed state
  - `compute_summary_hash(content: &ContentItem) -> ContentHash`
    - If `body_inline` exists: SHA-256 of first 256 bytes
    - Else if `content_hash` exists: use content_hash directly
    - Else: SHA-256 of empty string

**FILES_AFFECTED:**
- `src/content/pruning.rs` - create

**VERIFICATION:**
- Test: Prune removes fully decayed content with no children
- Test: Prune creates tombstone for decayed parent with active children
- Test: Prune skips protected content
- Test: Prune respects grace period

---

### STEP 10: Implement Content Lifecycle Manager
**DELIVERABLE:** Content lifecycle (creation → active → stale → decayed)

**ACTIONS:**
- Create `src/content/lifecycle.rs` with:
  - `DecayConfig` struct: `target_storage_bytes`, `current_half_life_secs`, `last_adaptation`
  - `ContentManager<S: ContentStore>` struct with:
    - `store: Arc<RwLock<S>>`
    - `tombstones: Arc<RwLock<Vec<Tombstone>>>`
    - `config: Arc<RwLock<DecayConfig>>`
  - Methods:
    - `new(store: S) -> Self`
    - `create_content(item: ContentItem) -> ContentId`
      - Enforce inline threshold: if `body_inline.len() > 1024`, compute hash and set `body_inline = None`
      - **PHASE 1 NOTE:** Large content (>1KB) is NOT fully supported. The body is lost since SPEC_07 content layer doesn't exist. Log warning and store hash only.
    - `get_content(id: &ContentId) -> Option<ContentItem>`
    - `get_decay_state(id: &ContentId, current_time_ms: u64) -> Option<DecayState>`
    - `get_lifecycle(id: &ContentId, current_time_ms: u64) -> Option<ContentLifecycle>`
    - `process_engagement(engagement: &EngagementRecord, current_time_ms: u64) -> Option<EngagementResult>`
    - `adapt_half_life(current_time_ms: u64)` - only adapts if ADAPTATION_INTERVAL passed
    - `prune(current_time_ms: u64) -> PruneStats`
    - `stats() -> StorageStats`
    - `config() -> DecayConfig`
    - `tombstone_count() -> usize`

**FILES_AFFECTED:**
- `src/content/lifecycle.rs` - create

**VERIFICATION:**
- Integration test: Full lifecycle from creation through decay
- Test: Inline threshold enforcement
- Test: Adaptive decay responds to storage pressure
- Test: Prune integrates correctly with manager

---

### STEP 11: Add Decay Simulation Benchmark
**DELIVERABLE:** Critical measurements (storage projections)

**ACTIONS:**
- Create `benches/decay_simulation.rs` using Criterion:
  - Simulation parameters:
    - **Content creation:** 10K posts, then 100K posts
    - **Engagement distribution:** 10% high (5-10 engagements over days 1-14), 30% medium (1-4 engagements in first 5 days), 60% none
    - **Engagement timing:** Random within first 14 days, weighted toward early days (70% in first 3 days)
    - **Content size:** 80% inline (100-900 bytes), 15% at threshold (~1024 bytes), 5% over threshold (1025-4096 bytes, stored as hash only in Phase 1)
    - **Spaces:** 50 spaces, Zipf distribution (few spaces get most content)
    - **Decay ticks:** Every simulated hour
    - **Simulation duration:** 60 simulated days
  - Measurements:
    - Storage after 10K posts (CM-1)
    - Storage after 100K posts (CM-2)
    - CPU cost of decay tick per item in nanoseconds (CM-3)

**FILES_AFFECTED:**
- `benches/decay_simulation.rs` - create

**VERIFICATION:**
- Benchmark runs to completion
- Results documented with actual measurements

---

### STEP 12: Create Documentation
**DELIVERABLE:** Documentation with formulas and benchmarks

**ACTIONS:**
- Create `docs/content-decay.md`:
  - Overview of decay philosophy (from THESIS_06)
  - Decay formula with examples
  - Content lifecycle diagram
  - Engagement types and their effects
  - Adaptive decay explanation
  - Pruning and tombstone behavior
- Create `docs/benchmarks/decay.md`:
  - Benchmark methodology
  - Storage projections at 10K, 100K, 1M posts
  - CPU cost per decay tick
  - Adaptive decay behavior under pressure
  - Comparison with target metrics

**FILES_AFFECTED:**
- `docs/content-decay.md` - create
- `docs/benchmarks/decay.md` - create

**VERIFICATION:**
- Documentation is complete and accurate
- All formulas match implementation

---

## TEST_PLAN:

### TEST 1: Floor Protection
**CRITERION:** Content decays according to formula
**METHOD:** Unit test in `decay.rs`
**INPUT:** Content age = 1 day, no pin
**EXPECTED:** `is_protected=true`, `survival_probability=1.0`

### TEST 2: Basic Decay After 32 Days
**CRITERION:** Content decays according to formula
**METHOD:** Unit test in `decay.rs`
**INPUT:** Content age = 32 days, `last_engagement = created_at`
**EXPECTED:** `survival_probability ≈ 0.051`, `is_decayed=true`

### TEST 3: Engagement Resets Decay Timer
**CRITERION:** Engagement (views, replies) extends heat
**METHOD:** Unit test in `decay.rs`
**INPUT:** Engagement on day 27, current time day 32 (5 days later)
**EXPECTED:** `half_lives_elapsed ≈ 0.428`, `is_decayed=false`
**NOTE:** SPEC_02 §11.1 Test Vector 2 has incorrect expected values; implementation follows algorithm

### TEST 4: Cannot Engage Decayed Content
**CRITERION:** Engagement (views, replies) extends heat
**METHOD:** Unit test in `engagement.rs`
**INPUT:** REPLY engagement on decayed content
**EXPECTED:** `Rejected(ContentDecayed)`

### TEST 5: Prune Removes Decayed Content
**CRITERION:** Decayed content is pruned
**METHOD:** Unit test in `pruning.rs`
**INPUT:** Decayed content with no children, past grace period
**EXPECTED:** `pruned_count=1`, content removed from store

### TEST 6: Tombstone for Parent with Live Children
**CRITERION:** Decayed content is pruned (with thread coherence)
**METHOD:** Unit test in `pruning.rs`
**INPUT:** Decayed parent with active child
**EXPECTED:** `tombstone_count=1`, minimal context preserved

### TEST 7: Adaptive Half-Life Decreases Under Pressure
**CRITERION:** Storage is bounded
**METHOD:** Unit test in `decay.rs`
**INPUT:** `current_storage = 1.5 * TARGET_STORAGE_BYTES`
**EXPECTED:** New half-life < current half-life

### TEST 8: Adaptive Half-Life Increases Under Target
**CRITERION:** Storage is bounded
**METHOD:** Unit test in `decay.rs`
**INPUT:** `current_storage = 0.5 * TARGET_STORAGE_BYTES`
**EXPECTED:** New half-life > current half-life

### TEST 9: Inline Content ≤1024 Bytes
**CRITERION:** Inline vs referenced content threshold (1KB)
**METHOD:** Unit test in `lifecycle.rs`
**INPUT:** Content with `body_inline` = 1024 bytes
**EXPECTED:** `body_inline = Some(...)`, `content_hash = None`

### TEST 10: Referenced Content >1024 Bytes
**CRITERION:** Inline vs referenced content threshold (1KB)
**METHOD:** Unit test in `lifecycle.rs`
**INPUT:** Content with `body_inline` = 1025 bytes
**EXPECTED:** `body_inline = None`, `content_hash = Some(...)`, `content_size = Some(1025)`

### TEST 11: Storage After 10K Posts (Benchmark)
**CRITERION:** Critical measurement
**METHOD:** Benchmark in `benches/decay_simulation.rs`
**INPUT:** 10K posts with realistic engagement and 60-day simulation
**EXPECTED:** Document actual measurement in `docs/benchmarks/decay.md`

### TEST 12: Storage After 100K Posts (Benchmark)
**CRITERION:** Critical measurement
**METHOD:** Benchmark in `benches/decay_simulation.rs`
**INPUT:** 100K posts with realistic engagement and 60-day simulation
**EXPECTED:** Document actual measurement in `docs/benchmarks/decay.md`

### TEST 13: CPU Cost of Decay Tick (Benchmark)
**CRITERION:** Critical measurement
**METHOD:** Benchmark in `benches/decay_simulation.rs`
**INPUT:** 1000 content items, measure decay calculation time
**EXPECTED:** Document ns/item in `docs/benchmarks/decay.md`

---

## RISKS:

### Risk 1: SPEC_02 Test Vector Error
**Issue:** Test Vector 2 in §11.1 has incorrect expected values for `effective_decay_time`
**Mitigation:**
- Implement per algorithm (§4.1), not per test vector
- Add code comment documenting discrepancy
- File issue against spec for correction
- Test expects algorithm-correct behavior (half_lives≈0.428), not spec-stated (0)

### Risk 2: Large Content Loss in Phase 1
**Issue:** Content >1KB stored as hash only; actual body lost without SPEC_07 content layer
**Mitigation:**
- Log warning when large content is created
- Store content_hash and content_size for future retrieval
- Document as known limitation in Phase 1
- Alternative: Keep body_inline even for large content, defer threshold enforcement to Phase 2

### Risk 3: Thread Index Memory Overhead
**Issue:** Parent→children index duplicates ContentId storage
**Mitigation:**
- Acceptable for in-memory Phase 1 implementation
- Production would use database with indexed foreign key

### Risk 4: Recursive Children Check Performance
**Issue:** `has_non_decayed_children` is O(n) per content item during pruning
**Mitigation:**
- Acceptable for Phase 1 with <100K items
- Production would use materialized descendant count or iterative approach

### Risk 5: Floating Point Precision in Decay Calculation
**Issue:** `0.5^half_lives` may have precision issues for very large half_lives
**Mitigation:**
- Use f64 which has sufficient precision for realistic values
- Half-lives clamped to [1 day, 30 days] limiting exponent range
- Add test for boundary conditions

---

## SPEC_COMPLIANCE_SUMMARY:

| Requirement | Addressed | Notes |
|-------------|-----------|-------|
| ContentItem fields (§3.1) | ✓ | Adding: last_engagement, pow_difficulty, preservation_pow, content_size |
| EngagementRecord fields (§3.5) | ✓ | Renaming: target_content_id→content_id; Adding: pow_work |
| DecayState fields (§3.6) | ✓ | Complete replacement with spec fields |
| DECAY_FLOOR = 48h (§4.1) | ✓ | Already in constants.rs |
| HALF_LIFE = 7d adaptive (§4.1.1) | ✓ | Adding adaptive decay constants and algorithm |
| DECAY_THRESHOLD = 6.25% (§4.1) | ✓ | Already in constants.rs |
| Inline threshold 1024 bytes (§3.1) | ✓ | Already in constants.rs; enforced in ContentManager |
| Engagement costs PoW (§3.5) | Partial | PoW verification stubbed for Phase 1 |
| ENGAGE requires pool (§3.5) | ✓ | Returns PoolIncomplete; deferred to Phase 2 |
| Tombstones for thread coherence (§4.3) | ✓ | Implemented in pruning.rs |
| Adaptive decay (§4.1.1) | ✓ | Implemented in decay.rs |
| Test Vector 1 (§11.1) | ✓ | Unit test in decay.rs |
| Test Vector 2 (§11.1) | ✓* | *Spec has error; implementing per algorithm |
| Test Vector 3 (§11.1) | ✓ | Unit test in decay.rs |

---

## ESTIMATED_COMPLEXITY: Medium

**REASON:**
- Well-defined algorithms from SPEC_02
- No external dependencies beyond sha2 (already in Cargo.toml)
- Clear data structure changes with minimal ripple effects (target_content_id rename has only 1 usage)
- Phase 1 simplifications (stubbed PoW, no pool handling) reduce scope
- Main complexity is in decay calculation edge cases and thread coherence during pruning
- Benchmark implementation requires careful simulation design

---

## IMPLEMENTATION_ORDER:

1. **Steps 1-4** (Constants + Type Updates) - Foundation, must be first
2. **Step 5** (Module Structure) - Required before implementing modules
3. **Step 6** (Storage Layer) - Required by all other modules
4. **Step 7** (Decay Calculation) - Core algorithm, no dependencies on other content modules
5. **Step 8** (Engagement Processing) - Depends on decay for state checking
6. **Step 9** (Pruning) - Depends on decay and storage
7. **Step 10** (Lifecycle Manager) - Integrates all components
8. **Step 11** (Benchmarks) - Requires complete implementation
9. **Step 12** (Documentation) - Final step, requires benchmark results

---

## DECISION: plan_ready
