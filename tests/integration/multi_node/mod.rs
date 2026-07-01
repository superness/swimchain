//! Multi-node test infrastructure and tests
//!
//! This module provides the test harness for running multiple Swimchain nodes
//! in a local test environment with ephemeral ports for CI compatibility.
//!
//! # Components
//!
//! - `harness` - MultiNodeTestHarness for managing multiple nodes
//! - `error` - Test-specific error types
//! - `helpers` - Utility functions for test scenarios
//!
//! # Tests
//!
//! - `two_node_tests` - Two-node connection and sync
//! - `three_node_tests` - Three-node gossip propagation
//! - `content_tests` - Content creation and propagation
//! - `sync_tests` - Sync from scratch scenarios
//! - `partition_tests` - Network partition and recovery

mod error;
mod harness;
mod helpers;

// Test modules
mod content_tests;
mod locator_sync_tests;
mod partition_tests;
mod sponsorship_tests;
mod sync_tests;
mod three_node_tests;
mod two_node_tests;

pub use error::TestError;
pub use harness::{MultiNodeTestHarness, RunningNode};
pub use helpers::*;
