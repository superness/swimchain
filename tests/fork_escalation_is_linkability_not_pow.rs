//! A too-far-ahead block escalates to a locator sync when we cannot LINK it —
//! never on a claimed weight.
//!
//! THE 2026-08-01 RECOVERY FAILURE. With fork assembly (#252), the sticky
//! formation gate (#254) and deep-reorg re-anchoring (#256) all deployed, a
//! seed holding a 1562-block fork was offered the fleet's 1901-block chain and
//! still never converged. The logs showed the reason: zero escalations to a
//! locator sync, thousands of "requesting backfill" lines, and a root-block
//! count frozen at 1801. The height-range backfill it fell back to cannot
//! cross a fork point by construction (it asks for our_height+1.., whose
//! ancestors reference blocks we never request — the "stuck at height 12"
//! bug), so the fork was never fetched, never weighed, never adopted.
//!
//! The gate was `root_block.cumulative_pow > our_tip_pow` — the field the
//! 2026-07-14 chain poisoning proved is NOT chain-cumulative. Canonical blocks
//! carry per-block-ish values, so the comparison is noise: it can fire for a
//! junk fork and, as here, stay silent for the real chain. It failed CLOSED,
//! which is the quiet kind.
//!
//! The honest signal is whether we hold the block's parent. These tests pin
//! the decision itself, so the next reader cannot reintroduce a weight
//! comparison without a test turning red.

use swimchain::blocks::RootBlock;
use swimchain::storage::ChainStore;
use tempfile::tempdir;

fn block(height: u64, prev: [u8; 32], cumulative_pow: u64, tag: u8) -> RootBlock {
    RootBlock {
        version: RootBlock::CURRENT_VERSION,
        prev_root_hash: prev,
        timestamp: 1_700_000_000 + height,
        merkle_root: [tag; 32],
        space_block_hashes: vec![],
        space_block_count: 0,
        total_pow: 1,
        cumulative_pow,
        difficulty_target: swimchain::blocks::INITIAL_DIFFICULTY,
        height,
        block_creator: [tag; 32],
    }
}

/// THE ROUTER'S OWN DECISION — imported, not reimplemented. An earlier draft
/// of this file copied the condition, which would have passed happily while
/// the router still asked about `cumulative_pow`.
use swimchain::node::router::should_escalate_to_locator as escalates;

#[test]
fn a_fork_block_we_cannot_link_escalates_however_light_it_claims_to_be() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    // Our chain, with a deliberately LARGE claimed weight at the tip — the
    // shape that silenced the old gate.
    let mut prev = [0u8; 32];
    for h in 0..=5u64 {
        let b = block(h, prev, 60_000 + h, 0x11);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }

    // A block from a competing chain, far ahead, whose parent we do not hold,
    // and which claims LESS weight than our tip. The old gate refused to
    // escalate here; that refusal is the 2026-08-01 stall.
    let orphan = block(40, [0xEE; 32], 1, 0xBB);
    assert!(
        escalates(&store, &orphan),
        "an unlinkable block must trigger a locator sync no matter what weight \
         it claims — a range backfill can never cross a fork point"
    );
}

#[test]
fn a_block_we_can_link_does_not_escalate_however_heavy_it_claims_to_be() {
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    let mut prev = [0u8; 32];
    let mut tip_hash = prev;
    for h in 0..=5u64 {
        let b = block(h, prev, h, 0x11);
        prev = b.hash();
        tip_hash = prev;
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }

    // Extends a block we hold, and claims an absurd weight. Linkable, so the
    // ordinary path applies — a forged weight must not buy extra machinery.
    let child = block(6, tip_hash, u64::MAX, 0x11);
    assert!(
        !escalates(&store, &child),
        "a block whose parent we hold is ordinary lag, not a fork, whatever it claims"
    );
}

#[test]
fn plain_lag_on_our_own_chain_still_escalates_safely() {
    // A peer far ahead on OUR chain also sends blocks whose parents we lack.
    // Escalating there is correct and cheap: the peer finds our tip as the
    // common ancestor and streams forward. This test exists so nobody
    // "optimises" the linkability test back into a weight comparison to avoid
    // locator syncs during ordinary catch-up.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path().join("chain")).unwrap();

    let mut prev = [0u8; 32];
    for h in 0..=2u64 {
        let b = block(h, prev, h, 0x11);
        prev = b.hash();
        store.put_root_block_with_fork_resolution(&b).unwrap();
    }

    // Height 9 of the same chain: we never received 3..=8, so its parent is
    // unknown to us.
    let far_ahead = block(9, [0xAB; 32], 9, 0x11);
    assert!(escalates(&store, &far_ahead));
}
