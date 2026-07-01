//! CLI module for Swimchain
//!
//! Provides command-line interface functionality for the `sw` binary.
//!
//! # Overview
//!
//! The CLI supports the following command groups:
//! - `identity`: Manage cryptographic identities
//! - `space`: Create, join, and manage spaces
//! - `post`: Create and view posts
//! - `search`: Search local content
//! - `sync`: Network synchronization
//! - `config`: Configuration management
//!
//! # Example
//!
//! ```bash
//! # Create a new identity
//! sw identity create
//!
//! # Create a new space
//! sw space create --name "My Space"
//!
//! # Create a post
//! sw post create --space <space_id> --title "Hello" --body "World"
//! ```

pub mod commands;
pub mod config;
pub mod error;
pub mod output;
pub mod progress;
pub mod reporting;
pub mod search_index;

pub use config::CliConfig;
pub use error::{CliError, Result};
pub use output::OutputFormat;
