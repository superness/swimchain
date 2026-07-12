//! Swimchain WASM Library
//!
//! Provides WebAssembly bindings for Swimchain core operations:
//! - Cryptographic operations (SHA-256, Ed25519)
//! - Identity management (keypair generation, address encoding)
//! - Content decay calculations
//! - Identity proof-of-work mining and verification
//!
//! Note: This library focuses on identity PoW (SHA-256 based) and does NOT
//! include Argon2id action PoW due to memory constraints in WASM environments.

use wasm_bindgen::prelude::*;

pub mod crypto;
pub mod decay;
pub mod error;
pub mod identity;
pub mod pow;
pub mod sims;

// Re-export main types for convenience
pub use crypto::{content_id, leading_zeros, sha256};
pub use decay::{calculate_decay, WasmDecayState};
pub use error::WasmError;
pub use identity::{decode_address, encode_address, verify_signature, WasmKeypair};
pub use pow::{mine_identity_pow, verify_identity_pow, WasmPowSolution};

/// Initialize the WASM module
///
/// Sets up panic hook for better error messages in browser console.
/// This is called automatically when the module loads.
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Get the library version
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
