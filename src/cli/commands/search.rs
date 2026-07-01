//! Local search commands
//!
//! Implements local-only search functionality for content using tantivy full-text search.

use crate::cli::config::CliConfig;
use crate::cli::error::Result;
use crate::cli::output::short_address;
use crate::cli::search_index::{SearchFilters, SearchIndex};
use clap::Args;
use serde::Serialize;

/// Search command arguments
#[derive(Args, Debug)]
pub struct SearchArgs {
    /// Search query
    #[arg()]
    pub query: String,

    /// Filter by space ID
    #[arg(long)]
    pub space: Option<String>,

    /// Minimum heat percentage (0-100)
    #[arg(long, default_value = "0")]
    pub min_heat: u8,

    /// Sort order
    #[arg(long, value_enum, default_value = "heat")]
    pub sort: SortOrder,

    /// Maximum number of results
    #[arg(long, default_value = "20")]
    pub limit: usize,

    /// Output in JSON format
    #[arg(long)]
    pub json: bool,
}

/// Sort order for search results
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, clap::ValueEnum)]
pub enum SortOrder {
    /// Sort by heat (survival probability)
    #[default]
    Heat,
    /// Sort by newest first
    Newest,
    /// Sort by oldest first
    Oldest,
}

/// Search result entry
#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub content_id: String,
    pub space_id: String,
    pub author: String,
    pub title: String,
    pub snippet: String,
    pub heat: f64,
    pub timestamp: u64,
}

/// JSON output for search
#[derive(Serialize)]
struct SearchOutput {
    query: String,
    results: Vec<SearchResult>,
    count: usize,
    note: String,
}

/// Execute a search command
pub fn execute(args: SearchArgs, config: &CliConfig) -> Result<()> {
    let data_dir = config.data_dir();

    // Check if search index exists
    if !SearchIndex::exists(&data_dir) {
        if args.json {
            let output = SearchOutput {
                query: args.query.clone(),
                count: 0,
                results: Vec::new(),
                note: "No content indexed. Run 'sw sync now' to build index.".to_string(),
            };
            crate::cli::output::print_json(&output)?;
        } else {
            println!("No content indexed.");
            println!();
            println!("Run 'sw sync now' to sync content and build the search index.");
        }
        return Ok(());
    }

    // Open the search index
    let index = match SearchIndex::open_or_create(&data_dir) {
        Ok(idx) => idx,
        Err(e) => {
            if args.json {
                let output = SearchOutput {
                    query: args.query.clone(),
                    count: 0,
                    results: Vec::new(),
                    note: format!(
                        "Index error: {e}. Delete the 'search_index' folder in your data directory and run 'sw sync now' to rebuild."
                    ),
                };
                crate::cli::output::print_json(&output)?;
            } else {
                eprintln!("Error opening search index: {e}");
                eprintln!();
                eprintln!("Delete the 'search_index' folder in your data directory and run 'sw sync now' to rebuild the index.");
            }
            return Err(e);
        }
    };

    // Build search filters
    let filters = SearchFilters {
        space_id: args.space.clone(),
        min_heat: if args.min_heat > 0 {
            Some(f64::from(args.min_heat))
        } else {
            None
        },
        sort: args.sort,
    };

    // Execute search
    let search_results = index.search(&args.query, filters, args.limit)?;

    // Convert to output format
    let results: Vec<SearchResult> = search_results
        .into_iter()
        .map(|r| SearchResult {
            content_id: r.content_id,
            space_id: r.space_id,
            author: r.author,
            title: r.title,
            snippet: r.snippet,
            heat: r.heat,
            timestamp: r.timestamp,
        })
        .collect();

    if args.json {
        let output = SearchOutput {
            query: args.query.clone(),
            count: results.len(),
            results,
            note: "Local search only.".to_string(),
        };
        crate::cli::output::print_json(&output)?;
    } else {
        println!("Searching for: \"{}\"", args.query);
        println!();

        if results.is_empty() {
            println!("No results found.");
            println!();
            println!("Note: Searches indexed local content only.");
        } else {
            for result in &results {
                println!(
                    "[{:.0}%] {} - {}",
                    result.heat,
                    short_address(&result.space_id),
                    result.title
                );
                println!("      {}", result.snippet);
                println!(
                    "      by {} | {}",
                    short_address(&result.author),
                    result.content_id
                );
                println!();
            }
            println!("{} result(s) found", results.len());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sort_order() {
        assert_eq!(SortOrder::default(), SortOrder::Heat);
    }
}
