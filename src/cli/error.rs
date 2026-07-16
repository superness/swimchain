//! CLI error types and exit codes
//!
//! Provides structured error handling for the CLI with proper exit codes.

use std::fmt;

/// CLI-specific errors with exit code mapping
#[derive(Debug)]
pub enum CliError {
    /// No node running - required for content operations
    NoNodeRunning,
    /// No identity found in data directory
    NoIdentity,
    /// Identity file exists but has invalid format
    InvalidIdentityFile(String),
    /// Decryption failed (wrong password)
    DecryptionFailed,
    /// Space not found
    SpaceNotFound(String),
    /// Invalid space ID format
    InvalidSpaceId(String),
    /// Invalid content ID format
    InvalidContentId(String),
    /// Network error
    NetworkError(String),
    /// PoW mining was cancelled by user
    PowCancelled,
    /// Invalid configuration
    InvalidConfig(String),
    /// Content not found locally
    ContentNotFound(String),
    /// IO error
    Io(std::io::Error),
    /// Identity system error
    Identity(crate::types::error::IdentityError),
    /// Storage error
    Storage(String),
    /// RPC error
    RpcError(String),
    /// Insufficient contribution level for operation (SPEC_09 §4.5)
    InsufficientLevel {
        /// Current swimmer level
        current: String,
        /// Required swimmer level
        required: String,
        /// Helpful tip for advancing
        tip: String,
    },
    /// Other error
    Other(String),
}

impl CliError {
    /// Get the exit code for this error
    ///
    /// Exit codes:
    /// - 0: Success
    /// - 1: General error
    /// - 2: Resource not found (space, content, network)
    /// - 3: Identity-related error (missing or unparseable identity file)
    /// - 4: No node running (actionable)
    /// - 5: Wrong password (decryption failed) — distinct so UIs can say
    ///      "wrong password" rather than "corrupted identity"
    #[must_use]
    pub fn exit_code(&self) -> i32 {
        match self {
            // Wrong password: its OWN code so callers (the desktop launcher)
            // can say "wrong password, try again" instead of the alarming
            // "corrupted identity" that a bare identity-error code implies.
            CliError::DecryptionFailed => 5,

            // Other identity-related errors (missing file, unparseable file):
            // exit code 3
            CliError::NoIdentity | CliError::InvalidIdentityFile(_) => 3,

            // Resource not found errors: exit code 2
            CliError::SpaceNotFound(_)
            | CliError::InvalidSpaceId(_)
            | CliError::InvalidContentId(_)
            | CliError::NetworkError(_)
            | CliError::ContentNotFound(_) => 2,

            // Insufficient level: exit code 3 (like identity errors, but different message)
            CliError::InsufficientLevel { .. } => 3,

            // No node running: exit code 4 (special case - actionable)
            CliError::NoNodeRunning => 4,

            // General errors: exit code 1
            CliError::PowCancelled
            | CliError::InvalidConfig(_)
            | CliError::Io(_)
            | CliError::Identity(_)
            | CliError::Storage(_)
            | CliError::RpcError(_)
            | CliError::Other(_) => 1,
        }
    }
}

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CliError::NoNodeRunning => {
                write!(
                    f,
                    "No node running.\n\n\
                     To participate in ChainSocial, you must run a node.\n\
                     Start with: sw node start\n\n\
                     ChainSocial has no servers - every participant hosts content.\n\
                     Your node connects you to the network and shares what you view."
                )
            }
            CliError::NoIdentity => {
                write!(f, "No identity found. Run 'sw identity create' first.")
            }
            CliError::InvalidIdentityFile(msg) => {
                write!(f, "Invalid identity file: {msg}")
            }
            CliError::DecryptionFailed => {
                write!(f, "Decryption failed - wrong password?")
            }
            CliError::SpaceNotFound(id) => {
                write!(f, "Space not found: {id}")
            }
            CliError::InvalidSpaceId(id) => {
                write!(f, "Invalid space ID format: {id}")
            }
            CliError::InvalidContentId(id) => {
                write!(f, "Invalid content ID format: {id}")
            }
            CliError::NetworkError(msg) => {
                write!(f, "Network error: {msg}")
            }
            CliError::PowCancelled => {
                write!(f, "PoW mining cancelled by user")
            }
            CliError::InvalidConfig(msg) => {
                write!(f, "Invalid configuration: {msg}")
            }
            CliError::ContentNotFound(id) => {
                write!(f, "Content not found locally: {id}")
            }
            CliError::Io(e) => {
                write!(f, "IO error: {e}")
            }
            CliError::Identity(e) => {
                write!(f, "{e}")
            }
            CliError::Storage(msg) => {
                write!(f, "Storage error: {msg}")
            }
            CliError::RpcError(msg) => {
                write!(f, "RPC error: {msg}")
            }
            CliError::InsufficientLevel {
                current,
                required,
                tip,
            } => {
                write!(
                    f,
                    "Space creation requires {} level (you are {}). {}",
                    required, current, tip
                )
            }
            CliError::Other(msg) => {
                write!(f, "{msg}")
            }
        }
    }
}

impl std::error::Error for CliError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CliError::Io(e) => Some(e),
            CliError::Identity(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for CliError {
    fn from(e: std::io::Error) -> Self {
        CliError::Io(e)
    }
}

impl From<crate::types::error::IdentityError> for CliError {
    fn from(e: crate::types::error::IdentityError) -> Self {
        // Map specific identity errors to CLI errors
        match &e {
            crate::types::error::IdentityError::DecryptionError(_) => CliError::DecryptionFailed,
            crate::types::error::IdentityError::StorageError(_) => CliError::Storage(e.to_string()),
            _ => CliError::Identity(e),
        }
    }
}

impl From<crate::rpc::RpcError> for CliError {
    fn from(e: crate::rpc::RpcError) -> Self {
        CliError::RpcError(e.to_string())
    }
}

/// Result type for CLI operations
pub type Result<T> = std::result::Result<T, CliError>;
