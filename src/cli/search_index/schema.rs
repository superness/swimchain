//! Search index schema definition
//!
//! Defines the tantivy schema for full-text search indexing.

use tantivy::schema::{Field, Schema, SchemaBuilder, FAST, INDEXED, STORED, STRING, TEXT};

/// Schema field references for quick access
pub struct SearchSchema {
    pub schema: Schema,
    pub content_id: Field,
    pub space_id: Field,
    pub author: Field,
    pub title: Field,
    pub body: Field,
    pub heat: Field,
    pub timestamp: Field,
}

impl SearchSchema {
    /// Create the search schema
    #[must_use]
    pub fn new() -> Self {
        let mut builder = SchemaBuilder::new();

        // Content ID - unique identifier, stored and indexed as string
        let content_id = builder.add_text_field("content_id", STRING | STORED);

        // Space ID - for filtering by space, stored and indexed with FAST for sorting
        let space_id = builder.add_text_field("space_id", STRING | STORED);

        // Author - user address, stored and indexed
        let author = builder.add_text_field("author", STRING | STORED);

        // Title - full-text searchable and stored
        let title = builder.add_text_field("title", TEXT | STORED);

        // Body - full-text searchable and stored
        let body = builder.add_text_field("body", TEXT | STORED);

        // Heat - percentage (0.0-100.0), stored with FAST for efficient sorting
        let heat = builder.add_f64_field("heat", STORED | FAST | INDEXED);

        // Timestamp - Unix timestamp, stored with FAST for efficient sorting
        let timestamp = builder.add_u64_field("timestamp", STORED | FAST | INDEXED);

        let schema = builder.build();

        Self {
            schema,
            content_id,
            space_id,
            author,
            title,
            body,
            heat,
            timestamp,
        }
    }
}

impl Default for SearchSchema {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_creation() {
        let search_schema = SearchSchema::new();
        assert!(search_schema.schema.get_field("content_id").is_ok());
        assert!(search_schema.schema.get_field("space_id").is_ok());
        assert!(search_schema.schema.get_field("author").is_ok());
        assert!(search_schema.schema.get_field("title").is_ok());
        assert!(search_schema.schema.get_field("body").is_ok());
        assert!(search_schema.schema.get_field("heat").is_ok());
        assert!(search_schema.schema.get_field("timestamp").is_ok());
    }
}
