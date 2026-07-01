//! Integration tests for multi-node scenarios
//!
//! This module contains integration tests that verify multi-node network behavior
//! using actual NodeManager instances on ephemeral TCP ports.
//!
//! # Test Categories
//!
//! - `multi_node` - Tests involving multiple networked nodes
//!
//! # Running Tests
//!
//! ```bash
//! # Run all integration tests
//! cargo test --test integration_test
//!
//! # Run specific test
//! cargo test --test integration_test two_node
//! ```

pub mod multi_node;
