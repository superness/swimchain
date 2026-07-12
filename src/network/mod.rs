//! Wire protocol implementation (SPEC_06 §5)
//!
//! This module implements the Swimchain wire protocol for peer-to-peer communication.
//! It provides:
//! - Message payload types for all 22 message types
//! - Serialization/deserialization of messages
//! - Message envelope validation
//! - A builder pattern for constructing typed messages
//! - Network mode configuration (Mainnet/Testnet/Regtest)

pub mod builder;
pub mod error;
pub mod messages;
pub mod mode;
pub mod serialize;

pub use builder::Message;
pub use error::WireError;
pub use messages::*;
pub use mode::{NetworkContext, NetworkMode};
