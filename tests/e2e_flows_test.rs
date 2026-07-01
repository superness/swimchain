//! End-to-End Integration Tests for Swimchain (Milestone 4.1)
//!
//! Tests core user flows to validate that all Phase 1-3 components
//! work together correctly:
//!
//! - Flow 1: Identity → Post → Propagate → View
//! - Flow 2: Join Space → Sync → View → Retrieve
//! - Flow 3: Media → Chunk → Upload → Fetch
//! - Flow 4: Decay → Free Storage → Prune

// Include the test modules
mod e2e_flows;

// Include integration module for MultiNodeTestHarness access
mod integration;
