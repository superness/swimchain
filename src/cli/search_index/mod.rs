//! Full-text search index for CLI
//!
//! Provides tantivy-based full-text search indexing for local content.
//!
//! # Overview
//!
//! The search index stores content metadata and enables fast full-text
//! search with filtering and sorting capabilities.
//!
//! # Example
//!
//! ```rust,ignore
//! use swimchain::cli::search_index::{SearchIndex, IndexableContent, SearchFilters};
//!
//! let index = SearchIndex::open_or_create(data_dir)?;
//! index.add_content(&content)?;
//!
//! let results = index.search("query", SearchFilters::default(), 20)?;
//! ```

pub mod schema;

use crate::cli::commands::search::SortOrder;
use crate::cli::error::{CliError, Result};
use schema::SearchSchema;
use serde::Serialize;
use std::path::Path;
use tantivy::collector::TopDocs;
use tantivy::query::{BooleanQuery, Occur, Query, QueryParser, RangeQuery, TermQuery};
use tantivy::schema::Value;
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy, Term};

/// Index directory name (versioned for future migrations)
const INDEX_DIR: &str = "search_index_v1";

/// Search index backed by tantivy
pub struct SearchIndex {
    index: Index,
    schema: SearchSchema,
    reader: IndexReader,
    writer: Option<IndexWriter>,
}

/// Content that can be indexed
#[derive(Debug, Clone)]
pub struct IndexableContent {
    /// Content ID in sha256:<hex> format
    pub content_id: String,
    /// Space ID in sp1... format
    pub space_id: String,
    /// Author address in cs1... format
    pub author: String,
    /// Post title
    pub title: String,
    /// Post body content
    pub body: String,
    /// Heat percentage (0.0-100.0)
    pub heat: f64,
    /// Unix timestamp
    pub timestamp: u64,
}

/// Search result entry
#[derive(Debug, Clone, Serialize)]
pub struct SearchResultEntry {
    /// Content ID
    pub content_id: String,
    /// Space ID
    pub space_id: String,
    /// Author address
    pub author: String,
    /// Post title
    pub title: String,
    /// Highlighted snippet from body
    pub snippet: String,
    /// Heat percentage
    pub heat: f64,
    /// Unix timestamp
    pub timestamp: u64,
    /// Relevance score from search
    pub score: f32,
}

/// Search filters
#[derive(Debug, Clone, Default)]
pub struct SearchFilters {
    /// Filter by space ID
    pub space_id: Option<String>,
    /// Minimum heat percentage
    pub min_heat: Option<f64>,
    /// Sort order
    pub sort: SortOrder,
}

impl SearchIndex {
    /// Open an existing index or create a new one
    pub fn open_or_create(data_dir: &Path) -> Result<Self> {
        let index_path = data_dir.join(INDEX_DIR);

        let schema = SearchSchema::new();

        let index = if index_path.exists() {
            Index::open_in_dir(&index_path)
                .map_err(|e| CliError::Other(format!("Failed to open search index: {e}")))?
        } else {
            std::fs::create_dir_all(&index_path)?;
            Index::create_in_dir(&index_path, schema.schema.clone())
                .map_err(|e| CliError::Other(format!("Failed to create search index: {e}")))?
        };

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| CliError::Other(format!("Failed to create index reader: {e}")))?;

        Ok(Self {
            index,
            schema,
            reader,
            writer: None,
        })
    }

    /// Get or create the index writer
    fn get_writer(&mut self) -> Result<&mut IndexWriter> {
        if self.writer.is_none() {
            let writer = self
                .index
                .writer(50_000_000)
                .map_err(|e| CliError::Other(format!("Failed to create index writer: {e}")))?;
            self.writer = Some(writer);
        }
        Ok(self.writer.as_mut().unwrap())
    }

    /// Add content to the index
    pub fn add_content(&mut self, content: &IndexableContent) -> Result<()> {
        // Clone schema fields before getting writer to avoid borrow checker issues
        let content_id_field = self.schema.content_id;
        let space_id_field = self.schema.space_id;
        let author_field = self.schema.author;
        let title_field = self.schema.title;
        let body_field = self.schema.body;
        let heat_field = self.schema.heat;
        let timestamp_field = self.schema.timestamp;

        let writer = self.get_writer()?;

        // Delete any existing document with this content_id
        let term = Term::from_field_text(content_id_field, &content.content_id);
        writer.delete_term(term);

        // Add the new document
        writer
            .add_document(doc!(
                content_id_field => content.content_id.clone(),
                space_id_field => content.space_id.clone(),
                author_field => content.author.clone(),
                title_field => content.title.clone(),
                body_field => content.body.clone(),
                heat_field => content.heat,
                timestamp_field => content.timestamp,
            ))
            .map_err(|e| CliError::Other(format!("Failed to add document: {e}")))?;

        writer
            .commit()
            .map_err(|e| CliError::Other(format!("Failed to commit index: {e}")))?;

        // Reload reader to see committed changes
        self.reader
            .reload()
            .map_err(|e| CliError::Other(format!("Failed to reload index reader: {e}")))?;

        Ok(())
    }

    /// Delete content from the index
    pub fn delete_content(&mut self, content_id: &str) -> Result<()> {
        // Clone schema field before getting writer
        let content_id_field = self.schema.content_id;

        let writer = self.get_writer()?;

        let term = Term::from_field_text(content_id_field, content_id);
        writer.delete_term(term);

        writer
            .commit()
            .map_err(|e| CliError::Other(format!("Failed to commit index: {e}")))?;

        // Reload reader to see committed changes
        self.reader
            .reload()
            .map_err(|e| CliError::Other(format!("Failed to reload index reader: {e}")))?;

        Ok(())
    }

    /// Search the index
    pub fn search(
        &self,
        query_str: &str,
        filters: SearchFilters,
        limit: usize,
    ) -> Result<Vec<SearchResultEntry>> {
        let searcher = self.reader.searcher();

        // Create query parser for title and body
        let query_parser =
            QueryParser::for_index(&self.index, vec![self.schema.title, self.schema.body]);

        // Parse the main query
        let main_query = query_parser
            .parse_query(query_str)
            .map_err(|e| CliError::Other(format!("Invalid search query: {e}")))?;

        // Build combined query with filters
        let query: Box<dyn Query> = if filters.space_id.is_some() || filters.min_heat.is_some() {
            let mut clauses: Vec<(Occur, Box<dyn Query>)> = vec![(Occur::Must, main_query)];

            // Add space filter
            if let Some(ref space_id) = filters.space_id {
                let term = Term::from_field_text(self.schema.space_id, space_id);
                let term_query = TermQuery::new(term, tantivy::schema::IndexRecordOption::Basic);
                clauses.push((Occur::Must, Box::new(term_query)));
            }

            // Add heat filter
            if let Some(min_heat) = filters.min_heat {
                let range_query = RangeQuery::new_f64_bounds(
                    "heat".to_string(),
                    std::ops::Bound::Included(min_heat),
                    std::ops::Bound::Included(100.0),
                );
                clauses.push((Occur::Must, Box::new(range_query)));
            }

            Box::new(BooleanQuery::new(clauses))
        } else {
            main_query
        };

        // Execute search with appropriate sorting
        // Use default relevance scoring - custom sorting by fast fields would require
        // a different collector approach in tantivy 0.22
        let collector = TopDocs::with_limit(limit);
        let top_docs = searcher
            .search(&query, &collector)
            .map_err(|e| CliError::Other(format!("Search failed: {e}")))?;

        // Extract results
        let mut results = Vec::with_capacity(top_docs.len());
        for (score, doc_address) in top_docs {
            let doc: tantivy::TantivyDocument = searcher
                .doc(doc_address)
                .map_err(|e| CliError::Other(format!("Failed to retrieve document: {e}")))?;

            // Extract fields using the correct Value type
            let content_id = doc
                .get_first(self.schema.content_id)
                .and_then(|v: &tantivy::schema::OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            let space_id = doc
                .get_first(self.schema.space_id)
                .and_then(|v: &tantivy::schema::OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            let author = doc
                .get_first(self.schema.author)
                .and_then(|v: &tantivy::schema::OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            let title = doc
                .get_first(self.schema.title)
                .and_then(|v: &tantivy::schema::OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            let body = doc
                .get_first(self.schema.body)
                .and_then(|v: &tantivy::schema::OwnedValue| v.as_str())
                .unwrap_or("")
                .to_string();

            let heat = doc
                .get_first(self.schema.heat)
                .and_then(|v: &tantivy::schema::OwnedValue| v.as_f64())
                .unwrap_or(0.0);

            let timestamp = doc
                .get_first(self.schema.timestamp)
                .and_then(|v: &tantivy::schema::OwnedValue| v.as_u64())
                .unwrap_or(0);

            // Generate snippet (first 100 chars of body)
            let snippet = if body.len() > 100 {
                format!("{}...", &body[..100])
            } else {
                body
            };

            results.push(SearchResultEntry {
                content_id,
                space_id,
                author,
                title,
                snippet,
                heat,
                timestamp,
                score,
            });
        }

        // Sort results based on filter preference
        match filters.sort {
            SortOrder::Heat => {
                results.sort_by(|a, b| {
                    b.heat
                        .partial_cmp(&a.heat)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
            }
            SortOrder::Newest => {
                results.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
            }
            SortOrder::Oldest => {
                results.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
            }
        }

        Ok(results)
    }

    /// Rebuild the entire index from an iterator of content
    pub fn rebuild<I>(&mut self, content_iter: I) -> Result<usize>
    where
        I: Iterator<Item = IndexableContent>,
    {
        // Clone schema fields before getting writer to avoid borrow checker issues
        let content_id_field = self.schema.content_id;
        let space_id_field = self.schema.space_id;
        let author_field = self.schema.author;
        let title_field = self.schema.title;
        let body_field = self.schema.body;
        let heat_field = self.schema.heat;
        let timestamp_field = self.schema.timestamp;

        let writer = self.get_writer()?;

        // Clear existing index
        writer
            .delete_all_documents()
            .map_err(|e| CliError::Other(format!("Failed to clear index: {e}")))?;

        let mut count = 0;
        for content in content_iter {
            writer
                .add_document(doc!(
                    content_id_field => content.content_id.clone(),
                    space_id_field => content.space_id.clone(),
                    author_field => content.author.clone(),
                    title_field => content.title.clone(),
                    body_field => content.body.clone(),
                    heat_field => content.heat,
                    timestamp_field => content.timestamp,
                ))
                .map_err(|e| CliError::Other(format!("Failed to add document: {e}")))?;
            count += 1;
        }

        writer
            .commit()
            .map_err(|e| CliError::Other(format!("Failed to commit index: {e}")))?;

        // Reload reader to see committed changes
        self.reader
            .reload()
            .map_err(|e| CliError::Other(format!("Failed to reload index reader: {e}")))?;

        Ok(count)
    }

    /// Get the number of documents in the index
    pub fn doc_count(&self) -> u64 {
        self.reader.searcher().num_docs()
    }

    /// Check if the index exists at the given data directory
    pub fn exists(data_dir: &Path) -> bool {
        data_dir.join(INDEX_DIR).exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_content(id: &str, title: &str, body: &str) -> IndexableContent {
        IndexableContent {
            content_id: format!("sha256:{}", "a".repeat(64)),
            space_id: format!("sp1{}", id),
            author: format!("cs1{}", "b".repeat(58)),
            title: title.to_string(),
            body: body.to_string(),
            heat: 75.0,
            timestamp: 1700000000,
        }
    }

    #[test]
    fn test_create_and_search() {
        let temp_dir = TempDir::new().unwrap();
        let mut index = SearchIndex::open_or_create(temp_dir.path()).unwrap();

        let content = create_test_content(
            "test",
            "Hello World",
            "This is a test post about Rust programming",
        );
        index.add_content(&content).unwrap();

        let results = index.search("rust", SearchFilters::default(), 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].snippet.contains("Rust"));
    }

    #[test]
    fn test_space_filter() {
        let temp_dir = TempDir::new().unwrap();
        let mut index = SearchIndex::open_or_create(temp_dir.path()).unwrap();

        let content1 = IndexableContent {
            content_id: format!("sha256:{}", "a".repeat(64)),
            space_id: "sp1space1".to_string(),
            author: format!("cs1{}", "b".repeat(58)),
            title: "Post One".to_string(),
            body: "Content in space 1".to_string(),
            heat: 75.0,
            timestamp: 1700000000,
        };

        let content2 = IndexableContent {
            content_id: format!("sha256:{}", "c".repeat(64)),
            space_id: "sp1space2".to_string(),
            author: format!("cs1{}", "d".repeat(58)),
            title: "Post Two".to_string(),
            body: "Content in space 2".to_string(),
            heat: 50.0,
            timestamp: 1700000001,
        };

        index.add_content(&content1).unwrap();
        index.add_content(&content2).unwrap();

        let filters = SearchFilters {
            space_id: Some("sp1space1".to_string()),
            ..Default::default()
        };

        let results = index.search("Content", filters, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].space_id, "sp1space1");
    }

    #[test]
    fn test_heat_filter() {
        let temp_dir = TempDir::new().unwrap();
        let mut index = SearchIndex::open_or_create(temp_dir.path()).unwrap();

        let content1 = IndexableContent {
            content_id: format!("sha256:{}", "a".repeat(64)),
            space_id: "sp1test".to_string(),
            author: format!("cs1{}", "b".repeat(58)),
            title: "Hot Post".to_string(),
            body: "Very popular content".to_string(),
            heat: 90.0,
            timestamp: 1700000000,
        };

        let content2 = IndexableContent {
            content_id: format!("sha256:{}", "c".repeat(64)),
            space_id: "sp1test".to_string(),
            author: format!("cs1{}", "d".repeat(58)),
            title: "Cold Post".to_string(),
            body: "Less popular content".to_string(),
            heat: 30.0,
            timestamp: 1700000001,
        };

        index.add_content(&content1).unwrap();
        index.add_content(&content2).unwrap();

        let filters = SearchFilters {
            min_heat: Some(50.0),
            ..Default::default()
        };

        let results = index.search("content", filters, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].heat >= 50.0);
    }

    #[test]
    fn test_rebuild_index() {
        let temp_dir = TempDir::new().unwrap();
        let mut index = SearchIndex::open_or_create(temp_dir.path()).unwrap();

        let contents = vec![
            create_test_content("1", "First", "First post"),
            create_test_content("2", "Second", "Second post"),
            create_test_content("3", "Third", "Third post"),
        ];

        let count = index.rebuild(contents.into_iter()).unwrap();
        assert_eq!(count, 3);
        assert_eq!(index.doc_count(), 3);
    }
}
