//! # swimchain-core
//!
//! The **pure decision cores** of the Swimchain protocol's self-organizing
//! systems, with no storage, network, or async dependencies — so the exact same
//! code compiles into the native node *and* into browser WASM for the live
//! simulations on swimchain.io.
//!
//! This is deliberately a single source of truth: the node and the "how it
//! works" visualizations run the *same* functions and constants, so the sims
//! are real, not re-implementations.
//!
//! - [`frequency`] — network/discovery-layer isolation (frequency drift).
//! - [`behavioral`] — content-layer community detection (SPEC_13 gates).
//! - [`fracture`] — size-based branch fracture (SPEC_08 threshold + split).

pub mod behavioral;
pub mod fracture;
pub mod frequency;

/// SHA-256 helper shared by the cores (keeps the crate dependency-light).
#[must_use]
pub fn sha256(bytes: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().into()
}
