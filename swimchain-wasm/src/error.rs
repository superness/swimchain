//! Error types for WASM bindings
//!
//! Provides error types that convert cleanly to JavaScript exceptions.

use wasm_bindgen::prelude::*;

/// Error types for WASM operations
#[derive(Debug, Clone)]
pub enum WasmError {
    /// Invalid address format or checksum
    InvalidAddress { reason: String },
    /// Invalid public key format or length
    InvalidPublicKey { reason: String },
    /// Invalid signature format or verification failed
    InvalidSignature { reason: String },
    /// Proof-of-work mining failed after max attempts
    PowFailed { difficulty: u8, attempts: u64 },
    /// Difficulty parameter out of valid range
    InvalidDifficulty { min: u8, max: u8, provided: u8 },
    /// Decay calculation encountered an error
    DecayCalculationError { reason: String },
    /// Invalid input data
    InvalidInput { reason: String },
}

impl std::fmt::Display for WasmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WasmError::InvalidAddress { reason } => write!(f, "Invalid address: {}", reason),
            WasmError::InvalidPublicKey { reason } => write!(f, "Invalid public key: {}", reason),
            WasmError::InvalidSignature { reason } => write!(f, "Invalid signature: {}", reason),
            WasmError::PowFailed {
                difficulty,
                attempts,
            } => {
                write!(
                    f,
                    "PoW failed after {} attempts at difficulty {}",
                    attempts, difficulty
                )
            }
            WasmError::InvalidDifficulty { min, max, provided } => {
                write!(f, "Difficulty {} out of range [{}, {}]", provided, min, max)
            }
            WasmError::DecayCalculationError { reason } => {
                write!(f, "Decay calculation error: {}", reason)
            }
            WasmError::InvalidInput { reason } => write!(f, "Invalid input: {}", reason),
        }
    }
}

impl std::error::Error for WasmError {}

impl From<WasmError> for JsValue {
    fn from(err: WasmError) -> JsValue {
        JsValue::from_str(&err.to_string())
    }
}

/// Create an InvalidAddress error
pub fn invalid_address(reason: impl Into<String>) -> WasmError {
    WasmError::InvalidAddress {
        reason: reason.into(),
    }
}

/// Create an InvalidPublicKey error
pub fn invalid_public_key(reason: impl Into<String>) -> WasmError {
    WasmError::InvalidPublicKey {
        reason: reason.into(),
    }
}

/// Create an InvalidSignature error
pub fn invalid_signature(reason: impl Into<String>) -> WasmError {
    WasmError::InvalidSignature {
        reason: reason.into(),
    }
}

/// Create a PowFailed error
pub fn pow_failed(difficulty: u8, attempts: u64) -> WasmError {
    WasmError::PowFailed {
        difficulty,
        attempts,
    }
}

/// Create an InvalidDifficulty error
pub fn invalid_difficulty(min: u8, max: u8, provided: u8) -> WasmError {
    WasmError::InvalidDifficulty { min, max, provided }
}

/// Create a DecayCalculationError
pub fn decay_error(reason: impl Into<String>) -> WasmError {
    WasmError::DecayCalculationError {
        reason: reason.into(),
    }
}

/// Create an InvalidInput error
pub fn invalid_input(reason: impl Into<String>) -> WasmError {
    WasmError::InvalidInput {
        reason: reason.into(),
    }
}
