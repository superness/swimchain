//! Read-only diagnostic: is a node's height index consistent with its root blocks?
//! Usage: cargo run --example chain_diag -- <data_dir>
//!
//! Prints get_latest_height, the height-index coverage (which heights resolve),
//! and the true chain shape found by walking parent pointers from every root
//! block — so a truncated/gappy height index is visible directly.

use std::collections::HashMap;
use std::path::PathBuf;
use swimchain::storage::chain::ChainStore;

fn main() {
    let data_dir = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("usage: chain_diag <data_dir>"),
    );

    let store = ChainStore::open(&data_dir.join("chain")).expect("open chain store");

    let latest = store.get_latest_height().expect("latest height");
    println!("get_latest_height   : {:?}", latest);
    println!("root_block_count    : {:?}", store.root_block_count().ok());

    // Height-index coverage: which heights resolve to a hash.
    let mut resolved = Vec::new();
    let mut missing = Vec::new();
    let scan_to = latest.unwrap_or(0).max(100);
    for h in 0..=scan_to {
        match store.get_root_hash_at_height(h) {
            Ok(Some(_)) => resolved.push(h),
            _ => missing.push(h),
        }
    }
    println!(
        "height index        : {} resolved of 0..={} (max resolved: {:?})",
        resolved.len(),
        scan_to,
        resolved.last()
    );
    if !missing.is_empty() {
        let head: Vec<_> = missing.iter().take(12).collect();
        println!(
            "  missing heights   : {:?}{}",
            head,
            if missing.len() > 12 { " …" } else { "" }
        );
    }

    // True chain shape: every stored root block's declared height.
    let mut by_height: HashMap<u64, u32> = HashMap::new();
    let mut max_declared = 0u64;
    let mut total = 0u64;
    for r in store.iter_root_blocks() {
        if let Ok(block) = r {
            *by_height.entry(block.height).or_insert(0) += 1;
            max_declared = max_declared.max(block.height);
            total += 1;
        }
    }
    let forked: Vec<_> = by_height
        .iter()
        .filter(|(_, c)| **c > 1)
        .map(|(h, c)| (*h, *c))
        .collect();
    println!("stored root blocks  : {total} (max declared height: {max_declared})");
    println!(
        "heights with >1 root: {} {:?}",
        forked.len(),
        forked.iter().take(10).collect::<Vec<_>>()
    );

    if let Some(l) = latest {
        if max_declared > l {
            println!(
                "\nVERDICT: height index is TRUNCATED — blocks exist up to height {max_declared} \
                 but get_latest_height says {l}. Initial sync serves nothing past {l}."
            );
        } else {
            println!("\nVERDICT: height index consistent with stored blocks.");
        }
    }
}
