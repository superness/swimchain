//! Integration tests for Swimchain
//!
//! This test runner includes multi-node integration tests
//! that verify network behavior with actual NodeManager instances.
//!
//! # Running Tests
//!
//! ```bash
//! # Run all integration tests
//! cargo test --test integration_tests
//!
//! # Run with verbose output
//! cargo test --test integration_tests -- --nocapture
//!
//! # Run specific test module
//! cargo test --test integration_tests two_node
//! cargo test --test integration_tests three_node
//! cargo test --test integration_tests partition
//! ```
//!
//! # Test Isolation
//!
//! Each test uses:
//! - Ephemeral ports (port 0) to avoid CI conflicts
//! - Temporary directories for storage
//! - Independent node instances

mod integration;

// Re-export for test usage
pub use integration::multi_node::*;
