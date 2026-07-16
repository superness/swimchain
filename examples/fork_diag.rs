//! Read-only diagnostic: dump fork races — heights with >1 stored root block —
//! and diff the competing blocks' action contents.
//! Usage: cargo run --example fork_diag -- <data_dir> [height]
//!
//! For every contested height (or just [height]), prints each competing root
//! block (creator, timestamp, total_pow, cumulative_pow, canonical or orphan)
//! and its actions (type, pow_work, actor, content hash). Then reports which
//! orphaned actions never appear anywhere on the canonical chain — i.e. were
//! genuinely LOST, not re-included.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use swimchain::storage::chain::ChainStore;

fn hex8(b: &[u8]) -> String {
    b.iter().take(4).map(|x| format!("{x:02x}")).collect()
}

/// Identity of an action for cross-block comparison: content_hash when present
/// (unique per posted content), else the signature (unique per signed action).
fn action_key(a: &swimchain::blocks::Action) -> Vec<u8> {
    match a.content_hash {
        Some(h) => h.to_vec(),
        None => a.signature.to_vec(),
    }
}

fn block_actions(
    store: &ChainStore,
    root: &swimchain::blocks::RootBlock,
) -> Vec<swimchain::blocks::Action> {
    let mut out = Vec::new();
    for sh in &root.space_block_hashes {
        if let Ok(Some(space)) = store.get_space_block(sh) {
            for ch in &space.content_block_hashes {
                if let Ok(Some(content)) = store.get_content_block(ch) {
                    out.extend(content.actions.iter().cloned());
                }
            }
        }
    }
    out
}

fn main() {
    let mut args = std::env::args().skip(1);
    let data_dir = PathBuf::from(args.next().expect("usage: fork_diag <data_dir> [height]"));
    let only_height: Option<u64> = args.next().and_then(|s| s.parse().ok());

    let store = ChainStore::open(&data_dir.join("chain")).expect("open chain store");

    // Canonical chain: walk parent pointers back from the best tip.
    let mut canonical_hashes = HashSet::new();
    let mut canonical_actions = HashSet::new();
    let mut cursor = store.get_best_tip().expect("best tip");
    let tip_height = store
        .get_best_tip_block()
        .ok()
        .flatten()
        .map(|b| b.height)
        .unwrap_or(0);
    while let Some(h) = cursor {
        let Ok(Some(block)) = store.get_root_block(&h) else {
            break;
        };
        canonical_hashes.insert(h);
        for a in block_actions(&store, &block) {
            canonical_actions.insert(action_key(&a));
        }
        if block.prev_root_hash == [0u8; 32] {
            break;
        }
        cursor = Some(block.prev_root_hash);
    }
    println!(
        "canonical chain: tip height {tip_height}, {} blocks, {} distinct actions\n",
        canonical_hashes.len(),
        canonical_actions.len()
    );

    // Group all stored root blocks by height.
    let mut by_height: HashMap<u64, Vec<swimchain::blocks::RootBlock>> = HashMap::new();
    for r in store.iter_root_blocks() {
        if let Ok(block) = r {
            by_height.entry(block.height).or_default().push(block);
        }
    }

    let mut contested: Vec<u64> = by_height
        .iter()
        .filter(|(h, v)| v.len() > 1 && only_height.map_or(true, |oh| **h == oh))
        .map(|(h, _)| *h)
        .collect();
    contested.sort_unstable();

    let total_heights = by_height.len();
    println!(
        "stored heights: {total_heights}; contested (>1 root block): {}\n",
        contested.len()
    );

    let mut tie_count = 0usize;
    let mut lost_total = 0usize;

    for h in &contested {
        let blocks = &by_height[h];
        println!("=== height {h}: {} competing blocks ===", blocks.len());
        let pows: HashSet<u64> = blocks.iter().map(|b| b.cumulative_pow).collect();
        let tied = pows.len() < blocks.len();
        if tied {
            tie_count += 1;
        }
        for b in blocks {
            let hash = b.hash();
            let canon = canonical_hashes.contains(&hash);
            let actions = block_actions(&store, b);
            println!(
                "  block {} creator={} ts={} total_pow={} cum_pow={} actions={} [{}]",
                hex8(&hash),
                hex8(&b.block_creator),
                b.timestamp,
                b.total_pow,
                b.cumulative_pow,
                actions.len(),
                if canon { "CANONICAL" } else { "orphan" }
            );
            for a in &actions {
                let on_canon = canonical_actions.contains(&action_key(a));
                let lost = !canon && !on_canon;
                if lost {
                    lost_total += 1;
                }
                println!(
                    "      {:?} pow_work={} actor={} content={} ts={}{}",
                    a.action_type,
                    a.pow_work,
                    hex8(&a.actor),
                    a.content_hash
                        .map(|c| hex8(&c))
                        .unwrap_or_else(|| "-".into()),
                    a.timestamp,
                    if lost {
                        "  << LOST (never reached canonical chain)"
                    } else if !canon && on_canon {
                        "  (re-included later)"
                    } else {
                        ""
                    }
                );
            }
        }
        if tied {
            println!("  -> TIE on cumulative_pow: decided by lowest-hash coin flip");
        }
        println!();
    }

    println!("summary: {} contested heights, {tie_count} decided by hash tiebreak (equal cumulative_pow), {lost_total} actions LOST", contested.len());
}
