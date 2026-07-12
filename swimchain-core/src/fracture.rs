//! Size-based branch fracture — SPEC_08 §4 (pure core).
//!
//! When a space's content exceeds the fracture threshold it deepens by one
//! level and every item re-places by the next bit of its content hash, so each
//! leaf branch stays bounded. Same threshold and same hash-bit placement the
//! node uses (`src/blocks/branch_path.rs`), lifted out for the simulation.

use serde::{Deserialize, Serialize};

/// Default fracture threshold: 50 MiB (SPEC_08, `BRANCH_FRACTURE_THRESHOLD`).
pub const BRANCH_FRACTURE_THRESHOLD: u64 = 50 * 1024 * 1024;

/// Maximum tree depth the simulation will deepen to (keeps the viz sane; the
/// node's cap is 255).
pub const SIM_MAX_DEPTH: u8 = 8;

/// One unit of content: an id (hashed for placement) and a byte size.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FractureItem {
    pub id: u32,
    pub size: u64,
}

/// Left/Right at `depth`, from bit `(7 - depth%8)` of byte `depth/8` of the
/// content hash — identical to `BranchPath::direction_at`. `1` = Right.
#[must_use]
fn direction_at(hash: &[u8; 32], depth: u8) -> u8 {
    let byte_index = (depth / 8) as usize;
    let bit_index = 7 - (depth % 8);
    if byte_index >= hash.len() {
        return 0;
    }
    (hash[byte_index] >> bit_index) & 1
}

/// Placement path (as an "LRLR" string) for a content hash at a given tree
/// depth — mirrors `BranchPath::from_thread_root`.
#[must_use]
fn placement_path(hash: &[u8; 32], depth: u8) -> String {
    let mut s = String::with_capacity(depth as usize);
    for d in 0..depth {
        s.push(if direction_at(hash, d) == 1 { 'R' } else { 'L' });
    }
    s
}

/// A leaf branch at the final fracture depth.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchLeaf {
    /// "LRL…" path from the root (empty at depth 0).
    pub path: String,
    pub item_count: u64,
    pub bytes: u64,
    /// Still over threshold (e.g. a single item larger than the threshold that
    /// can't be split further).
    pub over_threshold: bool,
}

/// The result of fracturing a space's content: the tree depth reached and the
/// resulting leaves. Exactly what the simulation draws.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FractureResult {
    pub depth: u8,
    pub threshold: u64,
    pub total_bytes: u64,
    pub leaves: Vec<BranchLeaf>,
}

fn hash_of(id: u32) -> [u8; 32] {
    crate::sha256(&id.to_be_bytes())
}

/// Bucket `items` by their placement at `depth`, summing sizes.
fn buckets_at(items: &[FractureItem], depth: u8) -> Vec<BranchLeaf> {
    use std::collections::BTreeMap;
    let mut map: BTreeMap<String, (u64, u64)> = BTreeMap::new();
    for it in items {
        let path = placement_path(&hash_of(it.id), depth);
        let e = map.entry(path).or_insert((0, 0));
        e.0 += 1;
        e.1 += it.size;
    }
    map.into_iter()
        .map(|(path, (item_count, bytes))| BranchLeaf {
            path,
            item_count,
            bytes,
            over_threshold: bytes > BRANCH_FRACTURE_THRESHOLD,
        })
        .collect()
}

/// Compute the fracture outcome for a space's `items`. Deepens uniformly (the
/// node keeps a single per-space `max_depth`) until no leaf exceeds the
/// threshold, or deepening stops helping (a single oversized item), or the sim
/// depth cap is hit.
#[must_use]
pub fn fracture(items: &[FractureItem]) -> FractureResult {
    let total_bytes: u64 = items.iter().map(|i| i.size).sum();
    let mut depth: u8 = 0;
    let mut leaves = buckets_at(items, depth);

    loop {
        let max_leaf = leaves.iter().map(|l| l.bytes).max().unwrap_or(0);
        if max_leaf <= BRANCH_FRACTURE_THRESHOLD || depth >= SIM_MAX_DEPTH {
            break;
        }
        let deeper = buckets_at(items, depth + 1);
        let deeper_max = deeper.iter().map(|l| l.bytes).max().unwrap_or(0);
        // Deepening didn't reduce the worst leaf → an unsplittable oversized
        // item dominates; stop rather than spin to the depth cap.
        if deeper_max >= max_leaf {
            break;
        }
        depth += 1;
        leaves = deeper;
    }

    FractureResult {
        depth,
        threshold: BRANCH_FRACTURE_THRESHOLD,
        total_bytes,
        leaves,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_space_stays_root() {
        let items = vec![FractureItem { id: 1, size: 1024 }];
        let r = fracture(&items);
        assert_eq!(r.depth, 0);
        assert_eq!(r.leaves.len(), 1);
    }

    #[test]
    fn oversized_space_fractures() {
        // 8 items × 10 MiB = 80 MiB > 50 MiB → must deepen at least once.
        let items: Vec<_> = (0..8)
            .map(|id| FractureItem {
                id,
                size: 10 * 1024 * 1024,
            })
            .collect();
        let r = fracture(&items);
        assert!(r.depth >= 1);
        assert!(r.leaves.iter().all(|l| l.bytes <= BRANCH_FRACTURE_THRESHOLD || l.item_count == 1));
    }
}
