//! Diff the ACTION SETS of two chain stores.
//!
//! Written 2026-08-01 to settle a specific question after the fleet split was
//! reconciled: table "Corner Rail 684" indexed 1698 replies on the abandoned
//! chain and 493 on the adopted one. Reply COUNTS are not evidence — the
//! duplicate-reply bug (#237) inflated them, and per-node content availability
//! moves them too. The only honest test is which signed actions each chain's
//! blocks actually contain.
//!
//! Read-only. Point it at two chain-store directories:
//!
//!   cargo run --example chain_action_diff -- <chainA-dir> <chainB-dir> [parent-hex-prefix]
//!
//! With a parent prefix it reports only actions replying to that content id.

use std::collections::{BTreeMap, HashSet};
use swimchain::blocks::{Action, ContentBlock};
use swimchain::storage::ChainStore;

/// Identity of an action, independent of which block carried it: actor +
/// timestamp + content hash. Two chains that included the same signed action
/// agree on all three.
type ActionKey = (String, u64, String);

fn key_of(a: &Action) -> ActionKey {
    (
        hex::encode(a.actor),
        a.timestamp,
        a.content_hash.map(hex::encode).unwrap_or_default(),
    )
}

fn collect(
    dir: &str,
    parent_filter: Option<&str>,
) -> (HashSet<ActionKey>, BTreeMap<String, usize>) {
    let store = ChainStore::open(std::path::Path::new(dir)).expect("open chain store");
    let mut keys = HashSet::new();
    let mut by_parent: BTreeMap<String, usize> = BTreeMap::new();

    for result in store.iter_content_blocks() {
        let Ok(cb): Result<ContentBlock, _> = result else {
            continue;
        };
        for action in &cb.actions {
            let parent = action.parent_id.map(hex::encode).unwrap_or_default();
            *by_parent.entry(parent.clone()).or_insert(0) += 1;
            if let Some(want) = parent_filter {
                if !parent.starts_with(want) {
                    continue;
                }
            }
            keys.insert(key_of(action));
        }
    }
    (keys, by_parent)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: chain_action_diff <chainA-dir> <chainB-dir> [parent-hex-prefix]");
        std::process::exit(2);
    }
    let filter = args.get(3).map(String::as_str);

    let (a_keys, a_parents) = collect(&args[1], filter);
    let (b_keys, b_parents) = collect(&args[2], filter);

    println!("chain A ({}): {} actions", args[1], a_keys.len());
    println!("chain B ({}): {} actions", args[2], b_keys.len());

    let only_a: Vec<_> = a_keys.difference(&b_keys).collect();
    let only_b: Vec<_> = b_keys.difference(&a_keys).collect();
    println!("\nin A but NOT in B: {}", only_a.len());
    println!("in B but NOT in A: {}", only_b.len());

    for k in only_a.iter().take(10) {
        println!(
            "  A-only  actor {} ts {} content {}",
            &k.0[..8],
            k.1,
            &k.2[..16.min(k.2.len())]
        );
    }

    if filter.is_none() {
        // Per-thread totals, biggest gaps first — shows WHICH threads differ.
        let mut rows: Vec<(String, usize, usize)> = a_parents
            .keys()
            .chain(b_parents.keys())
            .collect::<HashSet<_>>()
            .into_iter()
            .map(|p| {
                (
                    p.clone(),
                    *a_parents.get(p).unwrap_or(&0),
                    *b_parents.get(p).unwrap_or(&0),
                )
            })
            .collect();
        rows.sort_by_key(|(_, a, b)| *b as i64 - *a as i64);
        println!("\nper-thread action counts (A vs B), largest shortfalls first:");
        for (parent, a, b) in rows.iter().take(12) {
            if a == b {
                continue;
            }
            let label = if parent.is_empty() {
                "(top-level posts)".to_string()
            } else {
                parent[..16.min(parent.len())].to_string()
            };
            println!(
                "  {label:20} A:{a:>6}  B:{b:>6}  diff {:>6}",
                *b as i64 - *a as i64
            );
        }
    }
}
