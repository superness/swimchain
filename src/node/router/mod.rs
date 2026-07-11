//! Message routing (SPEC_10 §5)
//!
//! Routes incoming messages to appropriate handlers based on message type.
//! Provides graceful error handling and metrics collection.
//!
//! # Architecture
//!
//! The `MessageRouter` is the central dispatch point for all protocol messages.
//! It receives messages from the transport layer and routes them to:
//! - Internal handlers (PING/PONG, GETADDR/ADDR)
//! - Subsystem managers (GossipManager, ChainSyncer, ContentRetrievalManager, etc.)
//!
//! # Example
//!
//! ```no_run
//! use std::sync::Arc;
//! use swimchain::node::router::MessageRouter;
//! use swimchain::node::NodeMetrics;
//!
//! let metrics = Arc::new(NodeMetrics::new());
//! let router = MessageRouter::builder()
//!     .metrics(metrics)
//!     .build();
//!
//! // Route a message
//! // let response = router.route(&peer_id, msg_type, &fork_id, &payload).await;
//! ```

mod error;
mod router;

#[cfg(test)]
mod tests;

pub use error::RouteError;
pub use router::{HolePunchRequest, MessageRouter, MessageRouterBuilder};
