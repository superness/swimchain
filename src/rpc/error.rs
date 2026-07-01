//! RPC error types

use thiserror::Error;

/// RPC error codes following JSON-RPC 2.0 specification
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RpcErrorCode {
    // Standard JSON-RPC errors
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,

    // Server errors (-32000 to -32099)
    ServerError = -32000,
    AuthenticationRequired = -32001,
    AuthenticationFailed = -32002,
    NodeNotRunning = -32003,
    ContentNotFound = -32004,
    PeerNotFound = -32005,
    InvalidContentId = -32006,
    InvalidSignature = -32007,
    StorageError = -32008,
    NetworkError = -32009,
    PowInvalid = -32010,
    SubsystemUnavailable = -32011,
    ContentBlocked = -32012,
    PermissionDenied = -32013,
    SpaceNotFound = -32014,
    IdentityNotSponsored = -32015,
    RateLimited = -32016,
    ClientLockedOut = -32017,
}

impl RpcErrorCode {
    pub fn code(self) -> i32 {
        self as i32
    }

    pub fn message(self) -> &'static str {
        match self {
            Self::ParseError => "Parse error",
            Self::InvalidRequest => "Invalid Request",
            Self::MethodNotFound => "Method not found",
            Self::InvalidParams => "Invalid params",
            Self::InternalError => "Internal error",
            Self::ServerError => "Server error",
            Self::AuthenticationRequired => "Authentication required",
            Self::AuthenticationFailed => "Authentication failed",
            Self::NodeNotRunning => "Node not running",
            Self::ContentNotFound => "Content not found",
            Self::PeerNotFound => "Peer not found",
            Self::InvalidContentId => "Invalid content ID",
            Self::InvalidSignature => "Invalid signature",
            Self::StorageError => "Storage error",
            Self::NetworkError => "Network error",
            Self::PowInvalid => "Proof of work invalid",
            Self::SubsystemUnavailable => "Subsystem unavailable",
            Self::ContentBlocked => "Content blocked",
            Self::PermissionDenied => "Permission denied",
            Self::SpaceNotFound => "Space not found",
            Self::IdentityNotSponsored => "Identity not sponsored",
            Self::RateLimited => "Rate limit exceeded",
            Self::ClientLockedOut => "Client locked out due to auth failures",
        }
    }
}

/// RPC error type
#[derive(Debug, Error)]
pub enum RpcError {
    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Method not found: {0}")]
    MethodNotFound(String),

    #[error("Invalid params: {0}")]
    InvalidParams(String),

    #[error("Internal error: {0}")]
    InternalError(String),

    #[error("Authentication required")]
    AuthenticationRequired,

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Node not running")]
    NodeNotRunning,

    #[error("Content not found: {0}")]
    ContentNotFound(String),

    #[error("Peer not found: {0}")]
    PeerNotFound(String),

    #[error("Invalid content ID: {0}")]
    InvalidContentId(String),

    #[error("Invalid signature")]
    InvalidSignature,

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Proof of work invalid: {0}")]
    PowInvalid(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Connection refused")]
    ConnectionRefused,

    #[error("Timeout")]
    Timeout,

    #[error("TLS required for non-localhost connections")]
    TlsRequired,

    #[error("TLS configuration error: {0}")]
    TlsConfig(String),
}

impl RpcError {
    pub fn code(&self) -> RpcErrorCode {
        match self {
            Self::ParseError(_) => RpcErrorCode::ParseError,
            Self::InvalidRequest(_) => RpcErrorCode::InvalidRequest,
            Self::MethodNotFound(_) => RpcErrorCode::MethodNotFound,
            Self::InvalidParams(_) => RpcErrorCode::InvalidParams,
            Self::InternalError(_) => RpcErrorCode::InternalError,
            Self::AuthenticationRequired => RpcErrorCode::AuthenticationRequired,
            Self::AuthenticationFailed(_) => RpcErrorCode::AuthenticationFailed,
            Self::NodeNotRunning => RpcErrorCode::NodeNotRunning,
            Self::ContentNotFound(_) => RpcErrorCode::ContentNotFound,
            Self::PeerNotFound(_) => RpcErrorCode::PeerNotFound,
            Self::InvalidContentId(_) => RpcErrorCode::InvalidContentId,
            Self::InvalidSignature => RpcErrorCode::InvalidSignature,
            Self::StorageError(_) => RpcErrorCode::StorageError,
            Self::NetworkError(_) => RpcErrorCode::NetworkError,
            Self::PowInvalid(_) => RpcErrorCode::PowInvalid,
            Self::Io(_) | Self::Http(_) | Self::ConnectionRefused | Self::Timeout
            | Self::TlsRequired | Self::TlsConfig(_) => {
                RpcErrorCode::ServerError
            }
        }
    }
}
