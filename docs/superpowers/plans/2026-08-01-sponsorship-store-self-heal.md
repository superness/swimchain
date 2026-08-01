# A Node Must Recover From A Short Sponsorship Store

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A node whose sponsorship store is missing grants that exist in its own stored history repairs itself on startup, instead of rejecting every block that depends on those grants — forever, silently, while impersonating slow sync.

**Architecture:** Three independent changes, smallest first. (1) Stop reading legacy side-effect marks as "sponsorship applied" — they predate the sponsorship stage, so the claim is false. (2) Add a startup repair sweep that re-runs the *idempotent* sponsorship stage for canonical blocks that never completed it, mirroring the existing `repair_reply_index` / `repair_content_indexes` migrations. (3) Make a wedged node say so, in `get_sync_status`, so this failure can never again look like progress.

**Tech Stack:** Rust, sled (`ChainStore`), `cargo test --all-targets`.

## The incident this plan exists for

Observed live 2026-08-01 on the chips utility node (mainnet), running a binary
built from current `main` that same evening:

- Pinned at height **1156** while mainnet was at **1927**. Never advanced in 45 minutes.
- **3002** × `[BLOCK] VALIDATION FAILED: Block <h> contains Reply by identity 802c2084e5e6f312 not authorized in space 05e148e8ebadb244`
- **3002** × `[BLOCK] Rejecting invalid block <h> - will not store any blocks`
- Exactly **one** identity and **one** space implicated across all 3002.
- A phone that synced the same chain **from genesis** had **zero** validation failures and applied that space's sponsorships fine.

Root cause, `src/storage/chain.rs:3866-3872`:

```rust
pub fn side_effects_state(&self, root_hash: &BlockHash) -> Result<u8, StorageError> {
    match self.applied_side_effects.get(root_hash)? {
        Some(v) if v.len() >= 9 => Ok(v[8]),
        Some(_) => Ok(2), // legacy 8-byte value: treat as fully applied
        None => Ok(0),
    }
}
```

Blocks written by the **pre-two-stage build** carry legacy 8-byte marks. They
predate the sponsorship stage entirely, so reporting them as state 2 asserts
something that never happened. `reconcile_block_side_effects` returns early on
`state >= 2`, so the idempotent sponsorship retry — the mechanism designed for
exactly this — can never run. The store stays short forever, and every block
depending on a missing grant is rejected forever.

The node is **structurally incapable of recovering**. That is the bug. The
strict rejection is a pre-existing design (2026-07-01); space-scoped
authorization (#84, 2026-07-22) gave it a new way to fire; a node that was
merely *offline for a while* walks into it.

## Global Constraints

- **Stage 1 must never re-run.** It contains non-idempotent increments
  (reactions, engagements, behavioural clustering). It is guarded by
  `if state < 1` in `reconcile_block_side_effects`; mapping legacy marks to 1
  is what keeps that guard closed. Any task that changes this mapping must
  prove stage 1 stays closed.
- **Stage 2 is idempotent by design** and documented as "retried until the
  sponsor chain has landed". Re-running it is the intended recovery.
- **No consensus rule changes in this plan.** Block acceptance rules,
  authorization semantics, and the sybil wall are untouched. This plan only
  repairs local derived state that was never populated. Changing what a node
  *accepts* is a separate decision with separate risk.
- **The repair must be bounded and observable.** It walks stored history; it
  logs what it did; it never blocks startup indefinitely.
- **Keep the reproduction.** The wedged util node (`C:/Users/super/AppData/Roaming/swimchain-chips-util`, pinned at 1156) is the live test case. Do NOT wipe it until Task 4 has verified the fix against it.

## File Structure

| File | Responsibility |
|---|---|
| `src/storage/chain.rs:3866` (modify) | Legacy mark reads as stage 1, not 2. |
| `src/storage/chain.rs` (add) | `blocks_needing_sponsorship_repair()` — canonical heights whose state < 2. |
| `src/node/manager.rs` or startup path (modify) | Call the repair sweep once at startup, after chain validation. |
| `src/node/router/router.rs:4141` (modify) | Distinguish "unresolvable authorization" in the log, and count it. |
| `src/rpc/methods.rs` + `src/rpc/types.rs` (modify) | Surface `blocked_at_height` / rejection count in `get_sync_status`. |
| `tests/sponsorship_store_self_heal.rs` (create) | Regression: a short store must not wedge. |

---

### Task 1: Legacy marks are not a claim of sponsorship

**Files:**
- Modify: `src/storage/chain.rs:3866-3872`
- Test: `src/storage/chain.rs` (unit tests, alongside existing ones)

**Interfaces:**
- Consumes: nothing.
- Produces: `side_effects_state` returns `1` for legacy 8-byte values.

- [ ] **Step 1: Write the failing test**

Add to `chain.rs`'s test module:

```rust
#[test]
fn legacy_side_effect_mark_does_not_claim_sponsorship_applied() {
    let (store, _tmp) = test_store();
    let hash = [7u8; 32];
    // A pre-two-stage build wrote 8 bytes: height only, no stage byte.
    store
        .applied_side_effects
        .insert(&hash, &42u64.to_be_bytes()[..])
        .unwrap();
    // It must NOT read back as "sponsorship applied" — that stage did not
    // exist when this value was written, so claiming it ran is a lie, and it
    // permanently blocks the idempotent retry that would repair the store.
    assert_eq!(store.side_effects_state(&hash).unwrap(), 1);
}

#[test]
fn modern_side_effect_mark_round_trips_its_stage() {
    let (store, _tmp) = test_store();
    let hash = [8u8; 32];
    store.set_side_effects_state(&hash, 42, 2).unwrap();
    assert_eq!(store.side_effects_state(&hash).unwrap(), 2);
    store.set_side_effects_state(&hash, 42, 1).unwrap();
    assert_eq!(store.side_effects_state(&hash).unwrap(), 1);
}
```

If `test_store()` does not exist, use whatever helper the neighbouring
`chain.rs` tests already use to build a temp `ChainStore` — do not invent a
new one.

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test --lib legacy_side_effect_mark -- --nocapture`
Expected: FAIL, `assertion failed: left == 2, right == 1`.

- [ ] **Step 3: Make it pass**

```rust
    pub fn side_effects_state(&self, root_hash: &BlockHash) -> Result<u8, StorageError> {
        match self.applied_side_effects.get(root_hash)? {
            Some(v) if v.len() >= 9 => Ok(v[8]),
            // Legacy 8-byte value, written before side effects were staged.
            // Stage 1 (content effects) DID run for these — that code predates
            // the split — but stage 2 (sponsorship) did not exist, so reporting
            // 2 asserts something that never happened and permanently blocks
            // the idempotent sponsorship retry. Report 1: stage 1 stays closed
            // (`if state < 1`), stage 2 gets to run. This is what lets a node
            // whose store is short repair itself instead of wedging forever.
            Some(_) => Ok(1),
            None => Ok(0),
        }
    }
```

- [ ] **Step 4: Verify, including that stage 1 stays shut**

Run: `cargo test --lib side_effect`
Expected: PASS.

Then confirm by inspection that `reconcile_block_side_effects`
(`router.rs`, "Stage 1: content effects, exactly once") still guards stage 1
with `if state < 1`. With legacy → 1 that branch is skipped, so reactions,
engagements and clustering cannot double-apply. **If that guard is ever
removed, this change becomes a double-counting bug** — note it in the commit.

- [ ] **Step 5: Commit**

```bash
git add src/storage/chain.rs
git commit -m "fix(chain): a legacy side-effect mark is not a claim that sponsorship applied"
```

---

### Task 2: Repair the store on startup

**Files:**
- Modify: `src/storage/chain.rs` (add `blocks_needing_sponsorship_repair`)
- Modify: the node startup path that already calls `repair_reply_index()` / `repair_content_indexes()`
- Test: `tests/sponsorship_store_self_heal.rs`

**Interfaces:**
- Consumes: Task 1's corrected `side_effects_state`.
- Produces:
  - `ChainStore::blocks_needing_sponsorship_repair(&self, limit: usize) -> Result<Vec<(u64, BlockHash)>, StorageError>` — canonical (height, root_hash) pairs whose `side_effects_state < 2`, ascending by height.
  - `Router::repair_sponsorship_store(&self) -> usize` — re-runs `reconcile_block_side_effects` for those blocks; returns how many became fully applied.

- [ ] **Step 1: Find where the existing repairs are called**

Run: `grep -rn "repair_reply_index\|repair_content_indexes" src/ --include=*.rs`

That call site is the startup migration point. The new sweep goes beside it,
**after** chain validation and **before** the node begins accepting blocks, so
the store is repaired before anything is validated against it.

- [ ] **Step 2: Write the failing regression test**

Create `tests/sponsorship_store_self_heal.rs`. The shape (adapt names to the
existing integration-test helpers in `tests/` — e.g. `deep_reorg_reanchors_actions.rs`
already builds a node with a chain, follow its setup rather than inventing one):

```rust
//! A node whose sponsorship store is missing a grant that exists in its own
//! stored history must repair itself, not reject every dependent block forever.
//!
//! Reproduces the 2026-08-01 wedge: 3002 rejections of one identity in one
//! space, pinned at height 1156 against a network at 1927, because legacy
//! side-effect marks claimed the sponsorship stage had already run.

#[test]
fn a_short_sponsorship_store_repairs_itself_instead_of_wedging() {
    // 1. Build a chain containing: a Sponsor action granting identity X scope S,
    //    then a later block with a Reply by X in space S.
    // 2. Mark EVERY block with a LEGACY 8-byte side-effect value (height only),
    //    and clear the sponsorship store — this is exactly the state a July-era
    //    node comes back online in.
    // 3. Assert the pre-condition: X is NOT authorized in S, so the Reply block
    //    would fail validation. (Without this assert the test proves nothing.)
    // 4. Run the startup repair.
    // 5. Assert X IS now authorized in S, and the Reply block validates.
}
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cargo test --test sponsorship_store_self_heal`
Expected: FAIL at step 5 — the grant is never re-derived.

- [ ] **Step 4: Add the store query**

In `chain.rs`, beside `repair_reply_index`:

```rust
    /// Canonical blocks whose side effects never reached stage 2 (sponsorship).
    ///
    /// Ascending by height so the caller re-applies grants in the order the
    /// chain recorded them — a later block's authorization may depend on an
    /// earlier block's grant.
    ///
    /// # Errors
    ///
    /// Returns error if a database read fails.
    pub fn blocks_needing_sponsorship_repair(
        &self,
        limit: usize,
    ) -> Result<Vec<(u64, BlockHash)>, StorageError> {
        let mut out = Vec::new();
        let tip = self.get_chain_height()?;
        for height in 1..=tip {
            if out.len() >= limit {
                break;
            }
            if let Some(hash) = self.get_root_hash_at_height(height)? {
                if self.side_effects_state(&hash)? < 2 {
                    out.push((height, hash));
                }
            }
        }
        Ok(out)
    }
```

(If `get_chain_height` / `get_root_hash_at_height` are named differently, use
the real names — read the file, don't guess.)

- [ ] **Step 5: Add the sweep**

In `router.rs`, next to `reconcile_block_side_effects`:

```rust
    /// Re-run the idempotent sponsorship stage for canonical blocks that never
    /// completed it. This is what lets a node recover from a short sponsorship
    /// store instead of rejecting every dependent block forever (2026-08-01:
    /// 3002 rejections of one identity, pinned 771 blocks behind).
    ///
    /// Safe to run every startup: stage 1 is guarded by `state < 1` and stage 2
    /// is idempotent. Bounded so a large chain cannot stall boot.
    pub(crate) fn repair_sponsorship_store(&self, limit: usize) -> usize {
        let Some(chain_store) = &self.chain_store else {
            return 0;
        };
        let pending = match chain_store.blocks_needing_sponsorship_repair(limit) {
            Ok(p) => p,
            Err(e) => {
                warn!("[REPAIR] Could not scan for unapplied sponsorship: {}", e);
                return 0;
            }
        };
        if pending.is_empty() {
            return 0;
        }
        info!(
            "[REPAIR] {} block(s) never completed the sponsorship stage — re-applying",
            pending.len()
        );
        let mut healed = 0usize;
        for (height, hash) in pending {
            if let Ok(Some(root)) = chain_store.get_root_block(&hash) {
                if self.reconcile_block_side_effects(&root) {
                    healed += 1;
                }
            } else {
                debug!("[REPAIR] Root block missing at height {}", height);
            }
        }
        info!("[REPAIR] Sponsorship repair completed {} block(s)", healed);
        healed
    }
```

- [ ] **Step 6: Call it at startup**

At the call site found in Step 1, after the existing repairs:

```rust
    let healed = router.repair_sponsorship_store(10_000);
    if healed > 0 {
        info!("[STARTUP] Repaired sponsorship for {} block(s)", healed);
    }
```

- [ ] **Step 7: Verify**

Run: `cargo test --test sponsorship_store_self_heal`
Expected: PASS.

Run: `cargo test --all-targets 2>&1 | tail -30`
Expected: no NEW failures. Compare against the 7 known pre-existing `--lib`
failures on main (see `project_main_test_failures`) — do not "fix" those here.

- [ ] **Step 8: Commit**

```bash
git add src/storage/chain.rs src/node/ tests/sponsorship_store_self_heal.rs
git commit -m "fix(node): repair a short sponsorship store on startup instead of wedging forever"
```

---

### Task 3: A wedged node must say so

**Files:**
- Modify: `src/node/router/router.rs:4141` and the `Rejecting invalid block` site
- Modify: `src/rpc/types.rs` (`GetSyncStatusResult`), `src/rpc/methods.rs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `GetSyncStatusResult.rejected_block_height: Option<u64>` and
  `rejected_block_count: u64`.

**Why:** this hid for 45 minutes behind 47,930 lines of `[BOOTSTRAP] Failed to
send I_HAVE` noise, at `WARN`, while `get_sync_status` reported `syncing`. A
node that has rejected the same block thousands of times is not syncing, and
must not be indistinguishable from a node that is.

- [ ] **Step 1: Count rejections and expose the stall**

Add an `AtomicU64` counter plus the height of the most recently rejected block
to the router's shared state (follow whatever pattern `accept_health.rs`
already uses — read it first; it exists precisely for "a node that stops
accepting says so"). Increment at the `Rejecting invalid block` site.

- [ ] **Step 2: Surface them in `get_sync_status`**

Add the two fields to `GetSyncStatusResult` and populate them. Keep the
existing fields untouched so no client breaks.

- [ ] **Step 3: Test**

```rust
#[test]
fn sync_status_reports_a_block_the_node_keeps_rejecting() {
    // Reject the same block twice; status must report a non-zero count and the
    // stalled height — NOT a clean "syncing".
}
```

Run: `cargo test --lib sync_status_reports`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/node/ src/rpc/
git commit -m "feat(rpc): a node that keeps rejecting the same block must not look like it is syncing"
```

---

### Task 4: Prove it against the real wedged node

**Files:** none — this is verification against the live reproduction.

- [ ] **Step 1: Confirm the node is still wedged on the OLD binary**

```powershell
Get-Content <scratchpad>\util2.err.log | Select-String "VALIDATION FAILED" | Measure-Object
```
Expected: thousands, height still 1156.

- [ ] **Step 2: Build the fix and restart that node against the SAME data dir**

Do **not** wipe `C:/Users/super/AppData/Roaming/swimchain-chips-util`. The
whole point is that a node in this state recovers without one.

```powershell
$env:JAVA_HOME=$null
cargo build --release --bin sw
$env:SWIMCHAIN_PASSWORD = "<from the operator's vault>"
.\target\release\sw.exe node start --listen 127.0.0.1:9745 --data-dir C:\Users\super\AppData\Roaming\swimchain-chips-util
```

- [ ] **Step 3: Assert recovery, with evidence**

Expected in the log: `[REPAIR] N block(s) never completed the sponsorship stage`,
then `[REPAIR] Sponsorship repair completed N block(s)`, then the height
advancing past **1156** toward the mainnet tip, and **no further**
`VALIDATION FAILED` for `802c2084e5e6f312`.

Record the before/after heights. If the height does not move, the fix is
incomplete — do not declare success on the presence of the log line alone.

- [ ] **Step 4: Only now consider wiping**

If and only if recovery fails, the wipe (keeping `identity.enc`,
`identity.pass`, `prefs`, `network.magic`) is the fallback — and that failure
is itself the finding.

## Non-goals

Block acceptance rules, authorization semantics, and the sybil wall are
**untouched**. Whether a lagging node should reject blocks the network accepted
at all — arguably it should defer, since a node that unilaterally rejects
accepted history simply removes itself from consensus — is a real question, and
a separate decision with separate risk. This plan makes the node able to repair
the state it already has.
