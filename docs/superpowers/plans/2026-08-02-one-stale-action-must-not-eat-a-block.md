# One Stale Action Must Not Eat A Block's Worth Of Good Ones

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A block that would contain an already-finalized action forms *without* that action, instead of being discarded and taking every other pending action with it — memory and disk.

**Architecture:** `BlockBuilder::build_root_block` already filters actions that would fail the consensus sponsorship gate, using `retain` over each thread. Add a second filter of exactly the same shape for actions already finalized on-chain. The existing backstop in `tasks.rs` stays as the last line of defence; it should simply stop having anything to catch.

**Tech Stack:** Rust, `ChainStore::is_action_finalized`, `cargo test --lib blocks::builder`.

## The measurement this plan exists for

Mainnet fleet, 3-hour window, 2026-08-02:

| node | binary | leader elected | formed | **rejected own** |
|---|---|---|---|---|
| bot `165.22.47.107` | new (Aug 2 03:00) | 8 | 8 | **5** |
| client2 `167.172.236.60` | old (Aug 1 20:11) | 8 | 8 | **4** |
| seed `167.71.241.252` | old (Aug 1 20:11) | 15 | 6 | **5 of 6** |

Five *distinct* actions, each re-included once — a recurring pattern, not one stuck entry. Identical on both binaries, so this predates 2026-08-01's work.

```
[BLOCKS] VALIDATION FAILED: formed block re-includes action ae9eb62196 already finalized at height N. Block rejected.
[BLOCKS] Skipping invalid block storage, continuing to next tick
```

## Why this is loss, not delay

1. `build_root_block` drains unconditionally — `for thread in self.threads.drain()` (`builder.rs:934`).
2. It then **persists the emptied set** (`builder.rs:1147`): *"Mempool drained into the block — persist the now-empty set so a restart doesn't resurrect already-mined actions."*
3. `tasks.rs:2993` rejects the block with a bare `continue`. **Nothing re-adds the drained actions.**

So every valid action that shared a block with one finalized action is erased from that node's memory *and* its `mempool.bin`. A restart does not recover them. The only recovery path is another peer re-gossiping — and all three fleet nodes exhibit the same behaviour, so an action can be dropped everywhere in the same round.

The backstop itself is correct and must stay: emitting such a block would, per its own comment, "yield a block every synced peer rejects… permanently forking us off the network." The hole is that nothing prevents the situation it catches.

## Global Constraints

- **The backstop in `tasks.rs` is NOT to be removed or weakened.** It is the last line of defence and this plan's success is that it stops firing, not that it stops existing.
- **A store-less builder must not gate.** The sponsorship filter directly above already establishes this rule: *"With no store configured we cannot verify and must NOT gate… a store-less builder is a test/degenerate case that must not silently drop all content."* The finalized filter must follow the same convention or every existing builder unit test loses its actions.
- **Filtering must be per-action, never per-thread and never per-block.** Dropping the thread or the block is the bug.
- **Determinism is load-bearing.** `build_root_block` quantizes its timestamp so two nodes forming at the same instant produce identical hashes. Filtering must not introduce ordering that varies between nodes.

## File Structure

| File | Responsibility |
|---|---|
| `src/blocks/builder.rs` (modify) | Filter already-finalized actions at build time, mirroring the sponsorship filter. |
| `src/blocks/builder.rs` (tests) | Prove one stale action no longer costs its blockmates. |
| `src/node/tasks.rs` (modify, small) | Count and surface backstop firings so a regression is visible rather than silent. |

---

### Task 1: A finalized action must not reach the block

**Files:**
- Modify: `src/blocks/builder.rs` — `build_root_block`, immediately after the sponsorship `retain`
- Test: `src/blocks/builder.rs` tests module

**Interfaces:**
- Consumes: `ChainStore::is_action_finalized(&action_hash) -> Result<Option<u64>, _>`
- Produces: `build_root_block` gains a `chain_store: Option<&ChainStore>` parameter (all existing callers pass `None` except the node's formation site).

- [ ] **Step 1: Write the failing test**

In `builder.rs`'s test module. This is the whole point of the plan, so it must fail for the right reason before the fix:

```rust
    #[test]
    fn one_already_finalized_action_does_not_cost_its_blockmates() {
        let dir = tempfile::tempdir().unwrap();
        let store = crate::storage::chain::ChainStore::open(dir.path().join("chain")).unwrap();

        // Form a block carrying ONE action, and mark it finalized so it is
        // genuinely on-chain.
        let mut b = BlockBuilder::new();
        let stale = make_test_action(1);
        b.add_action([0xDDu8; 32], [0xDDu8; 32], stale.clone(), BranchPath::root());
        let (root, _spaces, contents) = b.build_root_block(1000, [0u8; 32], None, None);
        for c in &contents {
            store
                .mark_content_block_actions_finalized(c, root.height)
                .unwrap();
        }
        assert!(
            store
                .is_action_finalized(&BlockBuilder::action_hash(&stale))
                .unwrap()
                .is_some(),
            "precondition: the stale action must be finalized, or this test proves nothing"
        );

        // A fresh builder holding that SAME stale action plus two good ones.
        let mut b2 = BlockBuilder::new();
        let good_a = make_test_action(1);
        let good_b = make_test_action(1);
        b2.add_action([0xDDu8; 32], [0xDDu8; 32], stale.clone(), BranchPath::root());
        b2.add_action([0xDDu8; 32], [0xDDu8; 32], good_a.clone(), BranchPath::root());
        b2.add_action([0xDDu8; 32], [0xDDu8; 32], good_b.clone(), BranchPath::root());

        let (_r2, _s2, c2) = b2.build_root_block(2000, [0u8; 32], None, Some(&store));
        let hashes: Vec<[u8; 32]> = c2
            .iter()
            .flat_map(|c| c.actions.iter())
            .map(BlockBuilder::action_hash)
            .collect();

        assert!(
            !hashes.contains(&BlockBuilder::action_hash(&stale)),
            "the already-finalized action must be filtered out"
        );
        assert!(
            hashes.contains(&BlockBuilder::action_hash(&good_a))
                && hashes.contains(&BlockBuilder::action_hash(&good_b)),
            "the two GOOD actions must survive — losing them is the bug this fixes"
        );
    }

    #[test]
    fn a_store_less_builder_still_emits_everything() {
        // Mirrors the sponsorship filter's own rule: with no store we cannot
        // verify and must NOT gate, or every store-less test silently loses
        // its content.
        let mut b = BlockBuilder::new();
        b.add_action([0xEEu8; 32], [0xEEu8; 32], make_test_action(1), BranchPath::root());
        let (_r, _s, c) = b.build_root_block(3000, [0u8; 32], None, None);
        assert_eq!(
            c.iter().flat_map(|x| x.actions.iter()).count(),
            1,
            "no store means no gating"
        );
    }
```

VERIFIED against the real code before writing: the test helper is `make_test_action(pow_work)` (there is no `make_post_action`); `tempfile::tempdir()` is already used at `builder.rs:1668`; `ChainStore::open`, `mark_content_block_actions_finalized(&ContentBlock, height)` and `is_action_finalized` all exist with these signatures. Confirm `BranchPath::root()` and the exact `add_action` argument order against a neighbouring test before running —  read them first rather than inventing new ones.

- [ ] **Step 2: Run it and watch it fail for the RIGHT reason**

Run: `cargo test --lib one_already_finalized_action_does_not_cost_its_blockmates -- --nocapture`

Expected: a compile error on the new `build_root_block` parameter. That is the correct first failure. Add the parameter (Step 3) and re-run — it must then fail on `the already-finalized action must be filtered out`. **If it fails on the precondition assert instead, the test is wrong, not the code — fix the test first.**

- [ ] **Step 3: Add the parameter and the filter**

Extend the signature:

```rust
    pub fn build_root_block(
        &mut self,
        timestamp: u64,
        block_creator: [u8; 32],
        sponsorship_store: Option<&crate::sponsorship::SponsorshipStore>,
        chain_store: Option<&crate::storage::chain::ChainStore>,
    ) -> (RootBlock, Vec<SpaceBlock>, Vec<ContentBlock>) {
```

Immediately AFTER the existing sponsorship `retain` block, mirroring its shape:

```rust
        // Drop actions already finalized on-chain, BEFORE they can reach a block.
        //
        // tasks.rs has a backstop that rejects a formed block containing one of
        // these — correctly, because emitting it "yields a block every synced
        // peer rejects... permanently forking us off the network". But that
        // backstop discards the WHOLE block, and `build_root_block` has already
        // drained the mempool AND persisted the emptied set (see the persist()
        // at the end of this function). So one stale action erased every valid
        // action that shared its block, from memory and from disk, with no
        // re-add on the rejection path.
        //
        // Measured on mainnet 2026-08-02 before this filter existed: the seed
        // formed 6 blocks in 3 hours and rejected 5 of them; the bot rejected 5
        // of 8. Five distinct actions, both binaries — a recurring pattern, not
        // one stuck entry.
        //
        // Same store-less convention as the sponsorship filter above: with no
        // store we cannot verify and must NOT gate.
        if let Some(cs) = chain_store {
            for threads in space_threads.values_mut() {
                for thread in threads {
                    thread.actions.retain(|action| {
                        let h = Self::action_hash(action);
                        match cs.is_action_finalized(&h) {
                            Ok(Some(height)) => {
                                log::info!(
                                    "[BLOCKS] Dropping already-finalized action {} (height {}) from the block being formed",
                                    hex::encode(&h[..8]),
                                    height
                                );
                                false
                            }
                            // Unknown or unreadable: keep it. The tasks.rs
                            // backstop still stands behind this.
                            _ => true,
                        }
                    });
                }
            }
            // A thread emptied by this filter must not emit an empty content block.
            for threads in space_threads.values_mut() {
                threads.retain(|t| !t.actions.is_empty());
            }
            space_threads.retain(|_, threads| !threads.is_empty());
        }
```

- [ ] **Step 4: Update every call site**

Run: `grep -rn "build_root_block(" src/ --include=*.rs | grep -v "fn build_root_block"`

Pass `None` everywhere except the node's formation site in `src/node/tasks.rs`, which passes `Some(&chain_store)`. Do not guess the binding name there — read the surrounding lines.

- [ ] **Step 5: Verify**

Run: `cargo test --lib blocks::builder`
Expected: PASS, including both new tests and every pre-existing builder test.

- [ ] **Step 6: Mutation-test the filter**

Change `Ok(Some(height)) => { ... false }` to `... true`. Run the tests.
Expected: `one_already_finalized_action_does_not_cost_its_blockmates` FAILS. **Revert.** If it still passes, the test is vacuous — fix it before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/blocks/builder.rs src/node/tasks.rs
git commit -m "fix(blocks): filter already-finalized actions before they can eat a block"
```

---

### Task 2: A firing backstop must be countable

**Files:**
- Modify: `src/node/tasks.rs` around the `formed block re-includes` warning

**Why:** after Task 1 this should never fire. If it does, something upstream regressed, and "a WARN line every ~35 minutes" is exactly the shape of signal that hid this for months. Make it countable so a regression is visible in `get_sync_status` rather than only in journald.

- [ ] **Step 1: Count the firings**

Add an `AtomicU64` beside the existing node metrics (follow `accept_health.rs`'s pattern — read it first), incremented where `block_is_valid = false` is set by the finalized check. Surface it as `blocks_rejected_own` in `GetSyncStatusResult`.

- [ ] **Step 2: Test**

```rust
#[test]
fn sync_status_reports_blocks_we_rejected_of_our_own_making() {
    // Increment twice; status must report 2, not silence.
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(rpc): surface locally-rejected blocks so a silent regression cannot hide"
```

---

### Task 3: Prove it on the fleet

**Files:** none — verification.

- [ ] **Step 1: Record the before**

Already measured (table above). Re-run immediately before deploying so the comparison is same-day:

```bash
journalctl -u swimchain-mainnet.service --since "3 hours ago" --no-pager | awk '
  /Leader election passed/ {l++} /\[BLOCKS\] Formed block/ {f++}
  /formed block re-includes/ {v++}
  END {printf "leader %d | formed %d | rejected-own %d\n", l, f, v}'
```

- [ ] **Step 2: Deploy to ONE node and watch for 3 hours**

The bot. Backup-and-swap as before.

- [ ] **Step 3: Assert**

Expected on the new binary: `rejected-own` **0**, `formed` unchanged or higher, and `[BLOCKS] Dropping already-finalized action` appearing instead — proving the filter is doing the work the backstop used to.

Do **not** declare success on the absence of the warning alone; a node that formed no blocks also shows zero. Compare `formed` counts too.

## Non-goals

Why finalized actions linger in the mempool at all is not addressed here — this plan stops one of them destroying a block. The upstream question (reorg re-add? stale persisted mempool? both, per the backstop's own comment) deserves its own investigation, and the `[BLOCKS] Dropping already-finalized action` log line added here is the instrument that will show how often it happens and for which actions.
