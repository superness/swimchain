//! Read-only diagnostic: print every action in the canonical blocks of a height range.
//! Usage: cargo run --example block_dump -- <data_dir> <from_height> <to_height>

use std::path::PathBuf;
use swimchain::storage::chain::ChainStore;

fn hex8(b: &[u8]) -> String {
    b.iter().take(4).map(|x| format!("{x:02x}")).collect()
}

fn main() {
    let mut args = std::env::args().skip(1);
    let data_dir = PathBuf::from(
        args.next()
            .expect("usage: block_dump <data_dir> <from> <to>"),
    );
    let from: u64 = args.next().unwrap().parse().unwrap();
    let to: u64 = args.next().unwrap().parse().unwrap();

    let store = ChainStore::open(&data_dir.join("chain")).expect("open chain store");
    for h in from..=to {
        let Ok(Some(hash)) = store.get_root_hash_at_height(h) else {
            println!("height {h}: <no canonical block>");
            continue;
        };
        let Ok(Some(root)) = store.get_root_block(&hash) else {
            continue;
        };
        println!(
            "height {h}: block {} creator={} ts={} total_pow={}",
            hex8(&hash),
            hex8(&root.block_creator),
            root.timestamp,
            root.total_pow
        );
        for sh in &root.space_block_hashes {
            if let Ok(Some(space)) = store.get_space_block(sh) {
                for ch in &space.content_block_hashes {
                    if let Ok(Some(content)) = store.get_content_block(ch) {
                        for a in &content.actions {
                            println!(
                                "    {:?} pow={} actor={} content={} ts={}",
                                a.action_type,
                                a.pow_work,
                                hex8(&a.actor),
                                a.content_hash
                                    .map(|c| hex8(&c))
                                    .unwrap_or_else(|| "-".into()),
                                a.timestamp
                            );
                        }
                    }
                }
            }
        }
    }
}
