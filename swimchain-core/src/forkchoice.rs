//! Fork choice — the heaviest-work rule + partition reconverge outcome (pure core).
//!
//! Mirrors the node's fork resolution (`src/node/router/router.rs`: compare
//! `cumulative_pow`, tiebreak on lower block hash via `ChainStore::hash_wins`)
//! and the reorg's re-anchor behavior (the losing tip's actions return to the
//! mempool). Used by the partition/reconverge simulation and validated against
//! the real router in `tests/frequency_partition_reconverge.rs`.
//!
//! Fork choice here is deliberately **frequency-agnostic** — this is the
//! *current* global behavior, the baseline the design notes want to measure
//! before considering frequency-scoped fork choice.

use serde::{Deserialize, Serialize};

/// Does chain A win over chain B? Heavier cumulative work wins; on an exact tie,
/// the lower tip hash wins (`hash_a < hash_b`) — identical to the node.
#[must_use]
pub fn a_wins(a_cum: u64, a_hash: &[u8; 32], b_cum: u64, b_hash: &[u8; 32]) -> bool {
    if a_cum > b_cum {
        true
    } else if a_cum < b_cum {
        false
    } else {
        a_hash < b_hash
    }
}

/// One partition's tip, described since the divergence point.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tip {
    /// Blocks built since divergence.
    pub blocks: u32,
    /// Work accumulated since divergence (added on top of the shared prefix).
    pub work: u64,
    /// Total actions carried across those blocks.
    pub actions: u32,
    /// Tiebreak seed (hashed) — stands in for the tip block hash.
    pub tiebreak: u32,
}

/// The outcome of bridging two partitions and running fork choice — exactly what
/// the simulation renders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconvergeOutcome {
    /// "A", "B", or "tie" (resolved by hash).
    pub winner: &'static str,
    pub a_cum: u64,
    pub b_cum: u64,
    /// Blocks orphaned from the losing tip.
    pub orphaned_blocks: u32,
    /// Actions from the losing tip returned to the mempool (re-anchored, not destroyed).
    pub reanchored_actions: u32,
}

/// Bridge two partitions that diverged above a shared prefix of `prefix_work`,
/// and compute which tip becomes canonical and what the loser re-anchors.
#[must_use]
pub fn evaluate_reconverge(prefix_work: u64, a: &Tip, b: &Tip) -> ReconvergeOutcome {
    let a_cum = prefix_work + a.work;
    let b_cum = prefix_work + b.work;
    let a_hash = crate::sha256(&a.tiebreak.to_be_bytes());
    let b_hash = crate::sha256(&b.tiebreak.to_be_bytes());
    let a_is_winner = a_wins(a_cum, &a_hash, b_cum, &b_hash);
    let winner = if a_cum == b_cum { "tie" } else if a_is_winner { "A" } else { "B" };
    let (orphaned_blocks, reanchored_actions) = if a_is_winner {
        (b.blocks, b.actions)
    } else {
        (a.blocks, a.actions)
    };
    ReconvergeOutcome {
        winner,
        a_cum,
        b_cum,
        orphaned_blocks,
        reanchored_actions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heavier_wins_and_loser_reanchors() {
        let a = Tip { blocks: 3, work: 500, actions: 9, tiebreak: 1 };
        let b = Tip { blocks: 2, work: 300, actions: 5, tiebreak: 2 };
        let o = evaluate_reconverge(200, &a, &b);
        assert_eq!(o.winner, "A");
        assert_eq!(o.a_cum, 700);
        assert_eq!(o.orphaned_blocks, 2);
        assert_eq!(o.reanchored_actions, 5); // B's actions come back, not destroyed
    }

    #[test]
    fn exact_tie_breaks_on_hash() {
        let a = Tip { blocks: 1, work: 100, actions: 1, tiebreak: 1 };
        let b = Tip { blocks: 1, work: 100, actions: 1, tiebreak: 2 };
        let o = evaluate_reconverge(0, &a, &b);
        assert_eq!(o.winner, "tie");
        // deterministic: lower hash of the tiebreak seed wins the actual selection
        let win_a = a_wins(100, &crate::sha256(&1u32.to_be_bytes()), 100, &crate::sha256(&2u32.to_be_bytes()));
        assert_eq!(o.orphaned_blocks, if win_a { b.blocks } else { a.blocks });
    }
}
