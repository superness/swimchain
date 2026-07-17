//! Read-only diagnostic: does a node's search index cover its content?
//! Usage: cargo run --example index_diag -- <data_dir>
//! Prints the Tantivy search-index doc count vs. the number of content items on disk.

use std::path::PathBuf;
use swimchain::cli::search_index::SearchIndex;
use swimchain::storage::PersistentContentStore;

fn main() {
    let data_dir = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("usage: index_diag <data_dir>"),
    );

    let idx = SearchIndex::open_or_create(&data_dir).expect("open search index");
    let docs = idx.doc_count();

    let cs = PersistentContentStore::open(data_dir.join("content"), data_dir.join("sync_blobs"))
        .expect("open content store");
    let items = cs.len();

    // Count how many content items actually have inline body text (searchable),
    // and how many carry a title/body mentioning nothing vs. real content.
    let mut with_body = 0usize;
    for r in cs.iter_content() {
        if let Ok(item) = r {
            if item
                .body_inline
                .as_deref()
                .map(|b| !b.is_empty())
                .unwrap_or(false)
            {
                with_body += 1;
            }
        }
    }

    println!("data_dir            : {}", data_dir.display());
    println!("content items       : {items}");
    println!("  ...with inline body: {with_body}");
    println!("search index docs   : {docs}");
    if items > 0 && docs < items as u64 {
        println!(
            "\nVERDICT: search index is MISSING {} of {} content items \
             -> search is blind to them (needs reindex).",
            items as u64 - docs,
            items
        );
    } else if items == 0 {
        println!("\nVERDICT: no content on this node.");
    } else {
        println!("\nVERDICT: index covers content ({docs} docs >= {items} items).");
    }
}
