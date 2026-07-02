//! RPC HTTP Server
//!
//! JSON-RPC 2.0 over HTTP using hyper, with WebSocket support for real-time events.
//! Supports TLS for secure remote connections (H-RPC-3).

use std::convert::Infallible;
use std::fs::File;
use std::io::BufReader;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;

use futures::stream::StreamExt;
use futures::SinkExt;
use http_body_util::{BodyExt, Full};
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use log::{debug, error, info, warn};
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use tokio_rustls::TlsAcceptor;
use tokio_tungstenite::tungstenite::Message;

use super::auth::{AuthCookie, Authenticator};
use super::error::{RpcError, RpcErrorCode};
use super::events::{EventManager, EventType, SubscribeParams};
use super::methods::RpcMethods;
use super::rate_limiter::{RateLimitResult, RpcRateLimiter};
use super::types::{RpcRequest, RpcResponse};

/// TLS configuration for RPC server (H-RPC-3)
#[derive(Debug, Clone, Default)]
pub struct TlsConfig {
    /// Path to PEM-encoded certificate file
    pub cert_path: Option<PathBuf>,
    /// Path to PEM-encoded private key file
    pub key_path: Option<PathBuf>,
}

impl TlsConfig {
    /// Create a new TLS configuration with certificate and key paths
    pub fn new(cert_path: PathBuf, key_path: PathBuf) -> Self {
        Self {
            cert_path: Some(cert_path),
            key_path: Some(key_path),
        }
    }

    /// Check if TLS is configured
    pub fn is_enabled(&self) -> bool {
        self.cert_path.is_some() && self.key_path.is_some()
    }
}

/// RPC server configuration
#[derive(Debug, Clone)]
pub struct RpcServerConfig {
    /// Bind address (default: 127.0.0.1)
    pub bind: String,
    /// Port number
    pub port: u16,
    /// Data directory (for cookie file)
    pub data_dir: PathBuf,
    /// Optional username for credential auth
    pub username: Option<String>,
    /// Optional password for credential auth
    pub password: Option<String>,
    /// Maximum request body size in bytes
    pub max_body_size: usize,
    /// TLS configuration (H-RPC-3)
    pub tls: TlsConfig,
}

impl Default for RpcServerConfig {
    fn default() -> Self {
        Self {
            bind: "127.0.0.1".to_string(),
            port: 9736,
            data_dir: PathBuf::from("."),
            username: None,
            password: None,
            max_body_size: 7 * 1024 * 1024, // 7MB (for 5MB images: 5MB × 4/3 base64 = 6.67MB + JSON overhead)
            tls: TlsConfig::default(),
        }
    }
}

impl RpcServerConfig {
    /// Create config for a specific network mode
    pub fn for_network(network: &str, data_dir: PathBuf) -> Self {
        let port = match network {
            "testnet" => 19736,
            "regtest" => 29736,
            _ => 9736,
        };
        Self {
            port,
            data_dir,
            ..Default::default()
        }
    }

    /// Get the full bind address
    pub fn bind_addr(&self) -> Result<SocketAddr, std::net::AddrParseError> {
        format!("{}:{}", self.bind, self.port).parse()
    }

    /// Check if binding to non-localhost
    pub fn is_exposed(&self) -> bool {
        self.bind != "127.0.0.1" && self.bind != "localhost" && self.bind != "::1"
    }
}

/// RPC server state
struct ServerState {
    auth: Authenticator,
    methods: RpcMethods,
    max_body_size: usize,
    rate_limiter: RpcRateLimiter,
    /// Event manager for WebSocket real-time events (H-RPC-2)
    event_manager: Arc<EventManager>,
}

/// RPC server
pub struct RpcServer {
    config: RpcServerConfig,
    cookie: Option<AuthCookie>,
    shutdown_rx: watch::Receiver<bool>,
}

/// Load TLS certificates from PEM files (H-RPC-3)
fn load_tls_config(tls_config: &TlsConfig) -> Result<rustls::ServerConfig, RpcError> {
    let cert_path = tls_config.cert_path.as_ref()
        .ok_or_else(|| RpcError::TlsConfig("Certificate path not configured".to_string()))?;
    let key_path = tls_config.key_path.as_ref()
        .ok_or_else(|| RpcError::TlsConfig("Private key path not configured".to_string()))?;

    // Load certificate chain
    let cert_file = File::open(cert_path)
        .map_err(|e| RpcError::TlsConfig(format!("Failed to open certificate file: {}", e)))?;
    let mut cert_reader = BufReader::new(cert_file);
    let certs: Vec<CertificateDer<'static>> = rustls_pemfile::certs(&mut cert_reader)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| RpcError::TlsConfig(format!("Failed to parse certificates: {}", e)))?;

    if certs.is_empty() {
        return Err(RpcError::TlsConfig("No certificates found in certificate file".to_string()));
    }

    // Load private key
    let key_file = File::open(key_path)
        .map_err(|e| RpcError::TlsConfig(format!("Failed to open key file: {}", e)))?;
    let mut key_reader = BufReader::new(key_file);
    let key: PrivateKeyDer<'static> = rustls_pemfile::private_key(&mut key_reader)
        .map_err(|e| RpcError::TlsConfig(format!("Failed to parse private key: {}", e)))?
        .ok_or_else(|| RpcError::TlsConfig("No private key found in key file".to_string()))?;

    // Build rustls ServerConfig
    rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|e| RpcError::TlsConfig(format!("Failed to build TLS config: {}", e)))
}

impl RpcServer {
    /// Create a new RPC server
    ///
    /// # Security (H-RPC-3)
    /// Non-localhost bindings require TLS configuration. This prevents accidental
    /// exposure of the RPC API over unencrypted connections.
    pub fn new(config: RpcServerConfig, shutdown_rx: watch::Receiver<bool>) -> Result<Self, RpcError> {
        // Reject non-localhost without TLS (H-RPC-3)
        if config.is_exposed() && !config.tls.is_enabled() {
            return Err(RpcError::TlsRequired);
        }

        // Warn if exposing to network
        if config.is_exposed() {
            warn!("RPC server binding to {} with TLS", config.bind);
            if config.username.is_none() {
                warn!("Consider adding credential auth for additional security");
            }
        }

        Ok(Self {
            config,
            cookie: None,
            shutdown_rx,
        })
    }

    /// Start the RPC server
    ///
    /// Returns the actual bound address (useful when port is 0)
    pub async fn start(mut self, methods: RpcMethods) -> Result<SocketAddr, RpcError> {
        self.start_with_events(methods, Arc::new(EventManager::new())).await
    }

    /// Start the RPC server with a shared event manager
    ///
    /// This allows other parts of the node to publish events that get pushed to WebSocket clients.
    /// If TLS is configured, all connections will be encrypted (H-RPC-3).
    pub async fn start_with_events(
        mut self,
        methods: RpcMethods,
        event_manager: Arc<EventManager>,
    ) -> Result<SocketAddr, RpcError> {
        // Generate authentication cookie
        let cookie = AuthCookie::generate(&self.config.data_dir)?;

        // Build authenticator
        let auth = if let (Some(user), Some(pass)) = (&self.config.username, &self.config.password) {
            Authenticator::with_both(cookie.clone(), user.clone(), pass.clone())
        } else {
            Authenticator::with_cookie(cookie.clone())
        };

        // Store cookie for cleanup
        self.cookie = Some(cookie);

        // Set up TLS acceptor if configured (H-RPC-3)
        let tls_acceptor = if self.config.tls.is_enabled() {
            let tls_config = load_tls_config(&self.config.tls)?;
            info!("TLS enabled for RPC server");
            Some(TlsAcceptor::from(Arc::new(tls_config)))
        } else {
            if self.config.is_exposed() {
                // This should have been caught in new(), but double-check
                return Err(RpcError::TlsRequired);
            }
            None
        };

        // Bind to address
        let addr = self.config.bind_addr()
            .map_err(|e| RpcError::InternalError(format!("Invalid bind address: {}", e)))?;

        let listener = TcpListener::bind(addr).await?;
        let actual_addr = listener.local_addr()?;

        if tls_acceptor.is_some() {
            info!("RPC server listening on {} (TLS)", actual_addr);
        } else {
            info!("RPC server listening on {}", actual_addr);
        }

        // Create shared state
        let state = Arc::new(ServerState {
            auth,
            methods,
            max_body_size: self.config.max_body_size,
            rate_limiter: RpcRateLimiter::new(),
            event_manager,
        });

        // Clone shutdown receiver for the accept loop
        let mut shutdown_rx = self.shutdown_rx.clone();

        // Move cookie into the spawned task for proper cleanup
        let cookie_for_cleanup = self.cookie.take();

        // Spawn accept loop
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    result = listener.accept() => {
                        match result {
                            Ok((stream, peer_addr)) => {
                                debug!("RPC connection from {}", peer_addr);
                                let state = state.clone();
                                let client_ip = peer_addr.ip();
                                let tls_acceptor = tls_acceptor.clone();

                                tokio::spawn(async move {
                                    // Handle TLS handshake if configured (H-RPC-3)
                                    if let Some(acceptor) = tls_acceptor {
                                        match acceptor.accept(stream).await {
                                            Ok(tls_stream) => {
                                                if let Err(e) = handle_tls_connection(tls_stream, state, client_ip).await {
                                                    debug!("RPC TLS connection error: {}", e);
                                                }
                                            }
                                            Err(e) => {
                                                debug!("TLS handshake failed from {}: {}", peer_addr, e);
                                            }
                                        }
                                    } else {
                                        // Plain TCP (localhost only)
                                        if let Err(e) = handle_connection(stream, state, client_ip).await {
                                            debug!("RPC connection error: {}", e);
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                error!("RPC accept error: {}", e);
                            }
                        }
                    }
                    _ = shutdown_rx.changed() => {
                        if *shutdown_rx.borrow() {
                            info!("RPC server shutting down");
                            break;
                        }
                    }
                }
            }

            // Clean up cookie on shutdown
            if let Some(cookie) = cookie_for_cleanup {
                if let Err(e) = cookie.delete() {
                    warn!("Failed to delete RPC cookie: {}", e);
                }
            }
        });

        Ok(actual_addr)
    }
}

/// Custom header names for signature auth
const HEADER_CS_IDENTITY: &str = "x-cs-identity";
const HEADER_CS_TIMESTAMP: &str = "x-cs-timestamp";
const HEADER_CS_SIGNATURE: &str = "x-cs-signature";

/// Handle an HTTP request
async fn handle_request(
    req: Request<Incoming>,
    state: Arc<ServerState>,
    client_ip: IpAddr,
) -> Result<Response<Full<Bytes>>, Infallible> {
    // Handle CORS preflight
    if req.method() == Method::OPTIONS {
        return Ok(cors_preflight());
    }

    // Handle health check endpoint (unauthenticated, not rate limited)
    if req.method() == Method::GET && req.uri().path() == "/health" {
        let health_json = r#"{"status":"ok","version":"0.1.0"}"#;
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(Full::new(Bytes::from(health_json)))
            .unwrap());
    }

    // Check if client is locked out due to auth failures (before any processing)
    if state.rate_limiter.is_locked_out(client_ip).await {
        return Ok(cors_response(json_response(
            StatusCode::TOO_MANY_REQUESTS,
            &RpcResponse::error(
                RpcErrorCode::ClientLockedOut,
                "Client locked out due to too many authentication failures",
                Value::Null,
            ),
        )));
    }

    // Only accept POST to /
    if req.method() != Method::POST {
        return Ok(cors_response(json_response(
            StatusCode::METHOD_NOT_ALLOWED,
            &RpcResponse::error(
                RpcErrorCode::InvalidRequest,
                "Only POST method allowed",
                Value::Null,
            ),
        )));
    }

    // Extract auth-related headers before consuming the request
    let auth_header = req.headers()
        .get(hyper::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let cs_identity = req.headers()
        .get(HEADER_CS_IDENTITY)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let cs_timestamp = req.headers()
        .get(HEADER_CS_TIMESTAMP)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let cs_signature = req.headers()
        .get(HEADER_CS_SIGNATURE)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Read body
    let body = match read_body(req.into_body(), state.max_body_size).await {
        Ok(b) => b,
        Err(e) => {
            return Ok(cors_response(json_response(
                StatusCode::BAD_REQUEST,
                &RpcResponse::error(RpcErrorCode::ParseError, &e, Value::Null),
            )));
        }
    };

    // Parse JSON-RPC request
    let rpc_req: RpcRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            return Ok(cors_response(json_response(
                StatusCode::BAD_REQUEST,
                &RpcResponse::error(
                    RpcErrorCode::ParseError,
                    &format!("Invalid JSON: {}", e),
                    Value::Null,
                ),
            )));
        }
    };

    // Validate JSON-RPC version
    if rpc_req.jsonrpc != "2.0" {
        return Ok(cors_response(json_response(
            StatusCode::BAD_REQUEST,
            &RpcResponse::error(
                RpcErrorCode::InvalidRequest,
                "Invalid JSON-RPC version (must be 2.0)",
                rpc_req.id.clone(),
            ),
        )));
    }

    // Methods that can be called without authentication (e.g., basic node info for client bootstrap)
    // get_identity_info is exempt because it only returns public key/address which is public information
    // get_sponsorship_info is exempt because sponsorship status is public chain data
    // list_sponsorship_offers is exempt because offers are public for anyone to browse
    // sign_message is exempt for localhost connections to allow browser clients to use node identity
    //   (it only signs messages, doesn't leak private key, and localhost access is already trusted)
    // Sponsorship action methods are exempt because they contain verifiable sponsor/claimant signatures
    // in their parameters - the signature proves the caller's identity without RPC-level auth
    const AUTH_EXEMPT_METHODS: &[&str] = &[
        "get_info",
        "get_identity_info",
        "get_sync_status",
        "get_sponsorship_info",
        "list_sponsorship_offers",
        "sign_message",
        // Read-only content methods - public data, no auth needed
        "list_spaces",
        "list_posts_for_space",
        "get_replies",
        "get_content",
        "get_identity_level",
        "get_identity_name",
        "get_user_profile",
        // Sponsorship actions - these contain verifiable signatures in params
        "create_sponsorship_offer",
        "cancel_sponsorship_offer",
        "claim_sponsorship_offer",
        "approve_sponsorship_claim",
        "reject_sponsorship_claim",
        "list_my_sponsorship_offers",
        "get_sponsorship_offer",        // Alias used by forum-client
    ];

    // In regtest mode, exempt all read-only methods from auth for easier testing
    // This allows browser clients to work without complex auth setup
    let is_regtest = state.methods.network() == "regtest";
    const REGTEST_ADDITIONAL_EXEMPT: &[&str] = &[
        // Read-only methods that are useful for testing UI
        "list_spaces",
        "list_threads",
        "get_space",
        "get_thread",
        // Write methods also exempt in regtest for E2E testing
        "create_space",
        "create_thread",
        "create_reply",
        "create_sponsorship_offer",
        "claim_sponsorship_offer",
        "approve_sponsorship_claim",
        "reject_sponsorship_claim",
        "get_replies",
        "get_content",
        "get_identity_level",
        "get_identity_name",
        "get_user_profile",
        "search_content",
        "search_spaces",
        "search_threads",
        "list_reactions",
        "get_reaction_count",
        "list_blocklist",
        "list_private_spaces",
        "list_dms",
    ];

    let is_auth_exempt = AUTH_EXEMPT_METHODS.contains(&rpc_req.method.as_str())
        || (is_regtest && REGTEST_ADDITIONAL_EXEMPT.contains(&rpc_req.method.as_str()));

    // Authenticate the request
    // Try signature auth first (for browser clients), then fall back to cookie/credential auth
    let has_signature_headers = cs_identity.is_some() && cs_timestamp.is_some() && cs_signature.is_some();

    // Log only presence/absence of auth headers, never values (security: avoid leaking credentials)
    log::debug!(
        "Auth headers - Identity: {}, Timestamp: {}, Signature: {}, AuthHeader: {}",
        if cs_identity.is_some() { "present" } else { "absent" },
        if cs_timestamp.is_some() { "present" } else { "absent" },
        if cs_signature.is_some() { "present" } else { "absent" },
        if auth_header.is_some() { "present" } else { "absent" },
    );

    let auth_result = if has_signature_headers {
        log::info!("Attempting signature authentication for method: {}", rpc_req.method);
        // Signature authentication - extract raw params JSON from body to preserve key ordering.
        // serde_json::Value doesn't preserve key order, so we need to parse with RawValue.
        //
        // Parse body with params as RawValue to preserve original formatting
        #[derive(Deserialize)]
        struct RawParamsRequest<'a> {
            #[serde(borrow)]
            params: Option<&'a serde_json::value::RawValue>,
            #[allow(dead_code)]
            #[serde(default)]
            jsonrpc: Option<&'a str>,
            #[allow(dead_code)]
            #[serde(default)]
            method: Option<&'a str>,
            #[allow(dead_code)]
            #[serde(default)]
            id: Option<serde_json::Value>,
        }
        let params_json = match serde_json::from_slice::<RawParamsRequest>(&body) {
            Ok(raw_req) => {
                if let Some(raw) = raw_req.params {
                    // RawValue.get() returns the raw JSON string
                    raw.get().as_bytes().to_vec()
                } else {
                    // No params field - client might send {} or nothing
                    b"{}".to_vec()
                }
            }
            Err(_) => {
                // Fallback: re-serialize (may break signature, but at least try)
                serde_json::to_vec(&rpc_req.params).unwrap_or_default()
            }
        };
        log::debug!("Params JSON for signature: {}", String::from_utf8_lossy(&params_json));
        let result = state.auth.validate_signature(
            cs_identity.as_deref(),
            cs_timestamp.as_deref(),
            cs_signature.as_deref(),
            &rpc_req.method,
            &params_json,
        );
        if let Err(ref e) = result {
            log::warn!("Signature auth failed: {}", e);
        } else {
            log::info!("Signature auth succeeded");
        }
        result
    } else if auth_header.is_some() {
        log::debug!("Using cookie/credential authentication");
        // Cookie or credential authentication
        state.auth.validate(auth_header.as_deref())
    } else {
        log::warn!("No authentication headers provided");
        // No auth provided
        Err(RpcError::AuthenticationRequired)
    };

    if let Err(e) = auth_result {
        // Only count actual credential failures (wrong password/signature) toward lockout,
        // not missing auth headers (client hasn't created identity yet)
        let is_missing_auth = matches!(e, RpcError::AuthenticationRequired);
        if !is_missing_auth {
            state.rate_limiter.record_auth_failure(client_ip).await;
        }

        if !is_auth_exempt {
            let code = if is_missing_auth {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::FORBIDDEN
            };
            return Ok(cors_response(json_response(
                code,
                &RpcResponse::error(e.code(), &e.to_string(), rpc_req.id.clone()),
            )));
        }
        log::debug!("Allowing auth-exempt method: {}", rpc_req.method);
    } else {
        // Clear auth failures on successful auth
        state.rate_limiter.clear_auth_failures(client_ip).await;
    }

    // Check rate limit for this method
    match state.rate_limiter.check_rate_limit(client_ip, &rpc_req.method).await {
        RateLimitResult::Allowed => {
            // Proceed with method dispatch
        }
        RateLimitResult::RateLimited { category, retry_after_ms } => {
            log::warn!(
                "Rate limit exceeded for {} from {} (category: {:?})",
                rpc_req.method, client_ip, category
            );
            let mut response = json_response(
                StatusCode::TOO_MANY_REQUESTS,
                &RpcResponse::error(
                    RpcErrorCode::RateLimited,
                    &format!("Rate limit exceeded for {:?} methods. Retry after {}ms", category, retry_after_ms),
                    rpc_req.id.clone(),
                ),
            );
            // Add Retry-After header (in seconds)
            response.headers_mut().insert(
                "Retry-After",
                ((retry_after_ms + 999) / 1000).to_string().parse().unwrap(),
            );
            return Ok(cors_response(response));
        }
        RateLimitResult::LockedOut { remaining_secs } => {
            return Ok(cors_response(json_response(
                StatusCode::TOO_MANY_REQUESTS,
                &RpcResponse::error(
                    RpcErrorCode::ClientLockedOut,
                    &format!("Client locked out. Retry after {} seconds", remaining_secs),
                    rpc_req.id.clone(),
                ),
            )));
        }
    }

    // Dispatch to method handler
    let response = state.methods.dispatch(&rpc_req.method, rpc_req.params, rpc_req.id.clone()).await;

    Ok(cors_response(json_response(StatusCode::OK, &response)))
}

/// Read request body with size limit
async fn read_body(body: Incoming, max_size: usize) -> Result<Bytes, String> {
    let collected = body.collect().await.map_err(|e| e.to_string())?;
    let bytes = collected.to_bytes();

    if bytes.len() > max_size {
        return Err(format!("Request body too large ({} > {})", bytes.len(), max_size));
    }

    Ok(bytes)
}

/// Create JSON response
fn json_response(status: StatusCode, body: &RpcResponse) -> Response<Full<Bytes>> {
    let json = serde_json::to_vec(body).unwrap_or_else(|_| b"{}".to_vec());

    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(json)))
        .unwrap()
}

/// Add CORS headers to a response
fn cors_response(response: Response<Full<Bytes>>) -> Response<Full<Bytes>> {
    let (mut parts, body) = response.into_parts();
    parts.headers.insert(
        hyper::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        "*".parse().unwrap(),
    );
    parts.headers.insert(
        hyper::header::ACCESS_CONTROL_ALLOW_METHODS,
        "POST, OPTIONS".parse().unwrap(),
    );
    parts.headers.insert(
        hyper::header::ACCESS_CONTROL_ALLOW_HEADERS,
        "Content-Type, Authorization, X-CS-Identity, X-CS-Timestamp, X-CS-Signature".parse().unwrap(),
    );
    Response::from_parts(parts, body)
}

/// Create CORS preflight response
fn cors_preflight() -> Response<Full<Bytes>> {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(hyper::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(hyper::header::ACCESS_CONTROL_ALLOW_METHODS, "POST, GET, OPTIONS")
        .header(hyper::header::ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, Authorization, X-CS-Identity, X-CS-Timestamp, X-CS-Signature")
        .header(hyper::header::ACCESS_CONTROL_MAX_AGE, "86400")
        .body(Full::new(Bytes::new()))
        .unwrap()
}

/// Handle a TCP connection - routes to HTTP or WebSocket based on request
async fn handle_connection(
    stream: TcpStream,
    state: Arc<ServerState>,
    client_ip: IpAddr,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use tokio::io::AsyncReadExt;

    // Peek at the first bytes to check for WebSocket upgrade
    let mut peek_buf = [0u8; 128];
    let stream = stream.into_std()?;
    stream.set_nonblocking(false)?;

    // Peek at the data without consuming it
    let n = {
        use std::io::Read;
        let mut stream_ref = &stream;
        match stream_ref.read(&mut peek_buf) {
            Ok(n) => n,
            Err(_) => 0,
        }
    };

    // Convert back to tokio stream and put peeked data back
    stream.set_nonblocking(true)?;
    let stream = TcpStream::from_std(stream)?;

    // Check if this looks like a WebSocket upgrade request to /ws
    let is_ws_upgrade = if n > 0 {
        let request_start = String::from_utf8_lossy(&peek_buf[..n]);
        request_start.starts_with("GET /ws") && request_start.contains("Upgrade: websocket")
    } else {
        false
    };

    if is_ws_upgrade {
        // Handle WebSocket connection
        handle_websocket(stream, state, client_ip, &peek_buf[..n]).await
    } else {
        // Handle regular HTTP connection - we need to replay the peeked data
        // Since we consumed data, we need to create a custom reader
        handle_http_with_peeked(stream, state, client_ip, &peek_buf[..n]).await
    }
}

/// Handle a TLS-wrapped TCP connection (H-RPC-3)
///
/// Similar to handle_connection but works with TLS streams.
async fn handle_tls_connection(
    mut stream: tokio_rustls::server::TlsStream<TcpStream>,
    state: Arc<ServerState>,
    client_ip: IpAddr,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use tokio::io::AsyncReadExt;

    // For TLS connections, we read the first bytes directly
    let mut peek_buf = [0u8; 128];
    let n = match stream.read(&mut peek_buf).await {
        Ok(n) => n,
        Err(_) => 0,
    };

    // Check if this looks like a WebSocket upgrade request to /ws
    let is_ws_upgrade = if n > 0 {
        let request_start = String::from_utf8_lossy(&peek_buf[..n]);
        request_start.starts_with("GET /ws") && request_start.contains("Upgrade: websocket")
    } else {
        false
    };

    if is_ws_upgrade {
        // Handle WebSocket over TLS (WSS)
        handle_tls_websocket(stream, state, client_ip, &peek_buf[..n]).await
    } else {
        // Handle regular HTTPS connection
        handle_tls_http_with_peeked(stream, state, client_ip, &peek_buf[..n]).await
    }
}

/// Handle HTTP connection with already-peeked data
async fn handle_http_with_peeked(
    stream: TcpStream,
    state: Arc<ServerState>,
    client_ip: IpAddr,
    peeked: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Create a buffered stream that replays peeked data
    let peeked_vec = peeked.to_vec();
    let combined = PeekedStream::new(peeked_vec, stream);
    let io = TokioIo::new(combined);

    let service = service_fn(move |req| {
        let state = state.clone();
        async move { handle_request(req, state, client_ip).await }
    });

    http1::Builder::new()
        .serve_connection(io, service)
        .await
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
}

/// Handle HTTPS connection with already-peeked data (H-RPC-3)
async fn handle_tls_http_with_peeked(
    stream: tokio_rustls::server::TlsStream<TcpStream>,
    state: Arc<ServerState>,
    client_ip: IpAddr,
    peeked: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Create a buffered stream that replays peeked data
    let peeked_vec = peeked.to_vec();
    let combined = TlsPeekedStream::new(peeked_vec, stream);
    let io = TokioIo::new(combined);

    let service = service_fn(move |req| {
        let state = state.clone();
        async move { handle_request(req, state, client_ip).await }
    });

    http1::Builder::new()
        .serve_connection(io, service)
        .await
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
}

/// A stream that prepends peeked data before the actual stream
struct PeekedStream {
    peeked: std::io::Cursor<Vec<u8>>,
    stream: TcpStream,
    peeked_done: bool,
}

impl PeekedStream {
    fn new(peeked: Vec<u8>, stream: TcpStream) -> Self {
        Self {
            peeked: std::io::Cursor::new(peeked),
            stream,
            peeked_done: false,
        }
    }
}

impl tokio::io::AsyncRead for PeekedStream {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        use std::io::Read;

        if !self.peeked_done {
            // Read from peeked buffer first
            let peeked = &mut self.peeked;
            let remaining = peeked.get_ref().len() - peeked.position() as usize;
            if remaining > 0 {
                let to_read = std::cmp::min(remaining, buf.remaining());
                let mut temp = vec![0u8; to_read];
                if let Ok(n) = peeked.read(&mut temp) {
                    buf.put_slice(&temp[..n]);
                    return std::task::Poll::Ready(Ok(()));
                }
            }
            self.peeked_done = true;
        }

        // Read from actual stream
        std::pin::Pin::new(&mut self.stream).poll_read(cx, buf)
    }
}

impl tokio::io::AsyncWrite for PeekedStream {
    fn poll_write(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        std::pin::Pin::new(&mut self.stream).poll_write(cx, buf)
    }

    fn poll_flush(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.stream).poll_flush(cx)
    }

    fn poll_shutdown(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.stream).poll_shutdown(cx)
    }
}

/// A TLS stream that prepends peeked data before the actual stream (H-RPC-3)
struct TlsPeekedStream {
    peeked: std::io::Cursor<Vec<u8>>,
    stream: tokio_rustls::server::TlsStream<TcpStream>,
    peeked_done: bool,
}

impl TlsPeekedStream {
    fn new(peeked: Vec<u8>, stream: tokio_rustls::server::TlsStream<TcpStream>) -> Self {
        Self {
            peeked: std::io::Cursor::new(peeked),
            stream,
            peeked_done: false,
        }
    }
}

impl tokio::io::AsyncRead for TlsPeekedStream {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        use std::io::Read;

        if !self.peeked_done {
            // Read from peeked buffer first
            let peeked = &mut self.peeked;
            let remaining = peeked.get_ref().len() - peeked.position() as usize;
            if remaining > 0 {
                let to_read = std::cmp::min(remaining, buf.remaining());
                let mut temp = vec![0u8; to_read];
                if let Ok(n) = peeked.read(&mut temp) {
                    buf.put_slice(&temp[..n]);
                    return std::task::Poll::Ready(Ok(()));
                }
            }
            self.peeked_done = true;
        }

        // Read from actual TLS stream
        std::pin::Pin::new(&mut self.stream).poll_read(cx, buf)
    }
}

impl tokio::io::AsyncWrite for TlsPeekedStream {
    fn poll_write(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        std::pin::Pin::new(&mut self.stream).poll_write(cx, buf)
    }

    fn poll_flush(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.stream).poll_flush(cx)
    }

    fn poll_shutdown(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.stream).poll_shutdown(cx)
    }
}

/// Handle WebSocket connection for real-time events
async fn handle_websocket(
    stream: TcpStream,
    state: Arc<ServerState>,
    client_ip: IpAddr,
    _peeked: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Check connection limits
    if !state.event_manager.can_accept_connection(client_ip).await {
        warn!("WebSocket connection rejected: too many connections from {}", client_ip);
        return Ok(());
    }

    // Accept WebSocket connection
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            debug!("WebSocket handshake failed: {}", e);
            return Ok(());
        }
    };

    info!("WebSocket connection established from {}", client_ip);
    state.event_manager.record_connection(client_ip).await;

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Subscribe to events
    let mut event_rx = state.event_manager.subscribe();
    let mut subscribed_events: std::collections::HashSet<EventType> = std::collections::HashSet::new();
    let mut subscription_id: Option<String> = None;

    // Send welcome message
    let welcome = json!({
        "jsonrpc": "2.0",
        "method": "welcome",
        "params": {
            "message": "Connected to Swimchain RPC WebSocket",
            "available_events": [
                "content_new", "content_engaged", "sync_status",
                "peer_connected", "peer_disconnected", "block_created",
                "space_updated", "mempool_changed"
            ]
        }
    });
    if let Err(e) = ws_sender.send(Message::Text(welcome.to_string())).await {
        debug!("Failed to send welcome: {}", e);
        state.event_manager.record_disconnection(client_ip).await;
        return Ok(());
    }

    loop {
        tokio::select! {
            // Handle incoming messages from client
            msg = ws_receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        // Parse JSON-RPC request
                        match serde_json::from_str::<Value>(&text) {
                            Ok(request) => {
                                let method = request.get("method").and_then(|m| m.as_str());
                                let params = request.get("params").cloned().unwrap_or(Value::Null);
                                let id = request.get("id").cloned().unwrap_or(Value::Null);

                                let response = match method {
                                    Some("subscribe") => {
                                        // Parse subscription params
                                        match serde_json::from_value::<SubscribeParams>(params) {
                                            Ok(sub_params) => {
                                                let result = state.event_manager
                                                    .create_subscription(sub_params, client_ip)
                                                    .await;

                                                // Update local tracking
                                                for event_str in &result.subscribed {
                                                    if let Some(et) = EventType::from_str(event_str) {
                                                        subscribed_events.insert(et);
                                                    }
                                                }
                                                subscription_id = Some(result.subscription_id.clone());

                                                json!({
                                                    "jsonrpc": "2.0",
                                                    "result": result,
                                                    "id": id
                                                })
                                            }
                                            Err(e) => {
                                                json!({
                                                    "jsonrpc": "2.0",
                                                    "error": {
                                                        "code": -32602,
                                                        "message": format!("Invalid params: {}", e)
                                                    },
                                                    "id": id
                                                })
                                            }
                                        }
                                    }
                                    Some("unsubscribe") => {
                                        if let Some(ref sub_id) = subscription_id {
                                            state.event_manager.remove_subscription(sub_id).await;
                                            subscribed_events.clear();
                                            subscription_id = None;
                                        }
                                        json!({
                                            "jsonrpc": "2.0",
                                            "result": { "success": true },
                                            "id": id
                                        })
                                    }
                                    Some("ping") => {
                                        json!({
                                            "jsonrpc": "2.0",
                                            "result": "pong",
                                            "id": id
                                        })
                                    }
                                    Some(unknown) => {
                                        json!({
                                            "jsonrpc": "2.0",
                                            "error": {
                                                "code": -32601,
                                                "message": format!("Method not found: {}", unknown)
                                            },
                                            "id": id
                                        })
                                    }
                                    None => {
                                        json!({
                                            "jsonrpc": "2.0",
                                            "error": {
                                                "code": -32600,
                                                "message": "Invalid request: missing method"
                                            },
                                            "id": id
                                        })
                                    }
                                };

                                if let Err(e) = ws_sender.send(Message::Text(response.to_string())).await {
                                    debug!("Failed to send response: {}", e);
                                    break;
                                }
                            }
                            Err(e) => {
                                let error_response = json!({
                                    "jsonrpc": "2.0",
                                    "error": {
                                        "code": -32700,
                                        "message": format!("Parse error: {}", e)
                                    },
                                    "id": null
                                });
                                if let Err(e) = ws_sender.send(Message::Text(error_response.to_string())).await {
                                    debug!("Failed to send error: {}", e);
                                    break;
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        if let Err(e) = ws_sender.send(Message::Pong(data)).await {
                            debug!("Failed to send pong: {}", e);
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        debug!("WebSocket close received from {}", client_ip);
                        break;
                    }
                    Some(Err(e)) => {
                        debug!("WebSocket error: {}", e);
                        break;
                    }
                    None => {
                        break;
                    }
                    _ => {}
                }
            }

            // Forward events to client
            event = event_rx.recv() => {
                match event {
                    Ok(event) => {
                        // Only forward if subscribed to this event type
                        if subscribed_events.contains(&event.event_type) {
                            let notification = event.to_notification();
                            if let Err(e) = ws_sender.send(Message::Text(notification.to_string())).await {
                                debug!("Failed to send event: {}", e);
                                break;
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        warn!("WebSocket client {} lagged {} events", client_ip, n);
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
        }
    }

    // Cleanup
    if let Some(ref sub_id) = subscription_id {
        state.event_manager.remove_subscription(sub_id).await;
    }
    state.event_manager.record_disconnection(client_ip).await;
    info!("WebSocket connection closed from {}", client_ip);

    Ok(())
}

/// Handle WebSocket over TLS connection for real-time events (H-RPC-3)
///
/// Same functionality as handle_websocket but for TLS-wrapped streams.
async fn handle_tls_websocket(
    stream: tokio_rustls::server::TlsStream<TcpStream>,
    state: Arc<ServerState>,
    client_ip: IpAddr,
    _peeked: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Check connection limits
    if !state.event_manager.can_accept_connection(client_ip).await {
        warn!("WebSocket TLS connection rejected: too many connections from {}", client_ip);
        return Ok(());
    }

    // Accept WebSocket connection over TLS
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            debug!("WebSocket TLS handshake failed: {}", e);
            return Ok(());
        }
    };

    info!("Secure WebSocket connection established from {}", client_ip);
    state.event_manager.record_connection(client_ip).await;

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Subscribe to events
    let mut event_rx = state.event_manager.subscribe();
    let mut subscribed_events: std::collections::HashSet<EventType> = std::collections::HashSet::new();
    let mut subscription_id: Option<String> = None;

    // Send welcome message
    let welcome = json!({
        "jsonrpc": "2.0",
        "method": "welcome",
        "params": {
            "message": "Connected to Swimchain RPC WebSocket (TLS)",
            "available_events": [
                "content_new", "content_engaged", "sync_status",
                "peer_connected", "peer_disconnected", "block_created",
                "space_updated", "mempool_changed"
            ]
        }
    });
    if let Err(e) = ws_sender.send(Message::Text(welcome.to_string())).await {
        debug!("Failed to send welcome: {}", e);
        state.event_manager.record_disconnection(client_ip).await;
        return Ok(());
    }

    loop {
        tokio::select! {
            // Handle incoming messages from client
            msg = ws_receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        // Parse JSON-RPC request
                        match serde_json::from_str::<Value>(&text) {
                            Ok(request) => {
                                let method = request.get("method").and_then(|m| m.as_str());
                                let params = request.get("params").cloned().unwrap_or(Value::Null);
                                let id = request.get("id").cloned().unwrap_or(Value::Null);

                                let response = match method {
                                    Some("subscribe") => {
                                        // Parse subscription params
                                        match serde_json::from_value::<SubscribeParams>(params) {
                                            Ok(sub_params) => {
                                                let result = state.event_manager
                                                    .create_subscription(sub_params, client_ip)
                                                    .await;

                                                // Update local tracking
                                                for event_str in &result.subscribed {
                                                    if let Some(et) = EventType::from_str(event_str) {
                                                        subscribed_events.insert(et);
                                                    }
                                                }
                                                subscription_id = Some(result.subscription_id.clone());

                                                json!({
                                                    "jsonrpc": "2.0",
                                                    "result": result,
                                                    "id": id
                                                })
                                            }
                                            Err(e) => {
                                                json!({
                                                    "jsonrpc": "2.0",
                                                    "error": {
                                                        "code": -32602,
                                                        "message": format!("Invalid params: {}", e)
                                                    },
                                                    "id": id
                                                })
                                            }
                                        }
                                    }
                                    Some("unsubscribe") => {
                                        if let Some(ref sub_id) = subscription_id {
                                            state.event_manager.remove_subscription(sub_id).await;
                                            subscribed_events.clear();
                                            subscription_id = None;
                                        }
                                        json!({
                                            "jsonrpc": "2.0",
                                            "result": { "success": true },
                                            "id": id
                                        })
                                    }
                                    Some("ping") => {
                                        json!({
                                            "jsonrpc": "2.0",
                                            "result": "pong",
                                            "id": id
                                        })
                                    }
                                    Some(unknown) => {
                                        json!({
                                            "jsonrpc": "2.0",
                                            "error": {
                                                "code": -32601,
                                                "message": format!("Method not found: {}", unknown)
                                            },
                                            "id": id
                                        })
                                    }
                                    None => {
                                        json!({
                                            "jsonrpc": "2.0",
                                            "error": {
                                                "code": -32600,
                                                "message": "Invalid request: missing method"
                                            },
                                            "id": id
                                        })
                                    }
                                };

                                if let Err(e) = ws_sender.send(Message::Text(response.to_string())).await {
                                    debug!("Failed to send response: {}", e);
                                    break;
                                }
                            }
                            Err(e) => {
                                let error_response = json!({
                                    "jsonrpc": "2.0",
                                    "error": {
                                        "code": -32700,
                                        "message": format!("Parse error: {}", e)
                                    },
                                    "id": null
                                });
                                if let Err(e) = ws_sender.send(Message::Text(error_response.to_string())).await {
                                    debug!("Failed to send error: {}", e);
                                    break;
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        if let Err(e) = ws_sender.send(Message::Pong(data)).await {
                            debug!("Failed to send pong: {}", e);
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        debug!("WebSocket TLS close received from {}", client_ip);
                        break;
                    }
                    Some(Err(e)) => {
                        debug!("WebSocket TLS error: {}", e);
                        break;
                    }
                    None => {
                        break;
                    }
                    _ => {}
                }
            }

            // Forward events to client
            event = event_rx.recv() => {
                match event {
                    Ok(event) => {
                        // Only forward if subscribed to this event type
                        if subscribed_events.contains(&event.event_type) {
                            let notification = event.to_notification();
                            if let Err(e) = ws_sender.send(Message::Text(notification.to_string())).await {
                                debug!("Failed to send event: {}", e);
                                break;
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        warn!("WebSocket TLS client {} lagged {} events", client_ip, n);
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
        }
    }

    // Cleanup
    if let Some(ref sub_id) = subscription_id {
        state.event_manager.remove_subscription(sub_id).await;
    }
    state.event_manager.record_disconnection(client_ip).await;
    info!("Secure WebSocket connection closed from {}", client_ip);

    Ok(())
}
