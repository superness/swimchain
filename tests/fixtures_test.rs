//! Test data fixtures module and tests
//!
//! This test runner includes the fixtures module which provides factory functions
//! for creating test data: spaces, threads (content items), and users (identities).
//!
//! # Running Tests
//!
//! ```bash
//! # Run fixtures tests
//! cargo test --test fixtures_test
//!
//! # Run with verbose output
//! cargo test --test fixtures_test -- --nocapture
//! ```
//!
//! # Using Fixtures in Other Tests
//!
//! Import the fixtures module in your test file:
//!
//! ```rust,ignore
//! mod fixtures;
//! use fixtures::{TestUser, TestSpace, TestThread, TestFixtures};
//! ```

mod fixtures;

// Re-export for other tests
pub use fixtures::*;
