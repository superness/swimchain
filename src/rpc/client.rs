//! RPC Client
//!
//! Client for connecting to the node's RPC server from CLI or other tools.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::time::Duration;

use serde_json::Value;

use super::auth::{format_cookie_auth, AuthCookie};
use super::error::RpcError;
use super::types::{RpcRequest, RpcResponse};

/// RPC client configuration
#[derive(Debug, Clone)]
pub struct RpcClientConfig {
    /// Server address
    pub addr: SocketAddr,
    /// Connection timeout
    pub timeout: Duration,
    /// Cookie value (for cookie auth)
    pub cookie: Option<String>,
    /// Username (for credential auth)
    pub username: Option<String>,
    /// Password (for credential auth)
    pub password: Option<String>,
}

impl Default for RpcClientConfig {
    fn default() -> Self {
        Self {
            addr: "127.0.0.1:9736".parse().unwrap(),
            timeout: Duration::from_secs(30),
            cookie: None,
            username: None,
            password: None,
        }
    }
}

impl RpcClientConfig {
    /// Create config for specific network mode using default port
    pub fn for_network(network: &str) -> Self {
        let port = match network {
            "testnet" => 19736,
            "regtest" => 29736,
            _ => 9736,
        };
        Self {
            addr: format!("127.0.0.1:{}", port).parse().unwrap(),
            ..Default::default()
        }
    }

    /// Create config by reading the RPC address from the node's data directory
    /// This is the preferred method as it works with non-default ports
    pub fn from_data_dir(data_dir: &Path) -> Result<Self, RpcError> {
        let addr_file = data_dir.join(".rpc_addr");
        let addr_str = std::fs::read_to_string(&addr_file)
            .map_err(|_| RpcError::NodeNotRunning)?;
        let addr = addr_str.trim().parse()
            .map_err(|e| RpcError::InvalidRequest(format!(
                "Invalid RPC address in {:?}: {}", addr_file, e
            )))?;
        Ok(Self {
            addr,
            ..Default::default()
        })
    }

    /// Load cookie from data directory
    pub fn with_cookie_from(mut self, data_dir: &Path) -> Result<Self, RpcError> {
        let cookie = AuthCookie::load(data_dir)?;
        self.cookie = Some(cookie.value().to_string());
        // Prevent auto-delete since we're just reading
        std::mem::forget(cookie);
        Ok(self)
    }

    /// Set explicit credentials
    pub fn with_credentials(mut self, username: String, password: String) -> Self {
        self.username = Some(username);
        self.password = Some(password);
        self
    }
}

/// RPC client
pub struct RpcClient {
    config: RpcClientConfig,
    next_id: u64,
}

impl RpcClient {
    /// Create new RPC client
    pub fn new(config: RpcClientConfig) -> Self {
        Self { config, next_id: 1 }
    }

    /// Create client with default config and cookie from data dir
    pub fn from_data_dir(data_dir: &Path, network: &str) -> Result<Self, RpcError> {
        let config = RpcClientConfig::for_network(network)
            .with_cookie_from(data_dir)?;
        Ok(Self::new(config))
    }

    /// Call an RPC method
    pub fn call(&mut self, method: &str, params: Value) -> Result<RpcResponse, RpcError> {
        let id = self.next_id;
        self.next_id += 1;

        let request = RpcRequest::with_id(method, params, Value::Number(id.into()));
        self.send_request(&request)
    }

    /// Call an RPC method and extract result
    pub fn call_result<T: serde::de::DeserializeOwned>(
        &mut self,
        method: &str,
        params: Value,
    ) -> Result<T, RpcError> {
        let response = self.call(method, params)?;

        if let Some(err) = response.error {
            return Err(RpcError::InternalError(format!(
                "{} ({})",
                err.message, err.code
            )));
        }

        let result = response.result.ok_or_else(|| {
            RpcError::InternalError("Response has neither result nor error".into())
        })?;

        serde_json::from_value(result)
            .map_err(|e| RpcError::ParseError(format!("Failed to parse result: {}", e)))
    }

    /// Send a request and get response
    fn send_request(&self, request: &RpcRequest) -> Result<RpcResponse, RpcError> {
        // Connect with timeout
        let stream = TcpStream::connect_timeout(&self.config.addr, self.config.timeout)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::ConnectionRefused {
                    RpcError::ConnectionRefused
                } else {
                    RpcError::Io(e)
                }
            })?;

        stream.set_read_timeout(Some(self.config.timeout))?;
        stream.set_write_timeout(Some(self.config.timeout))?;

        self.send_http_request(stream, request)
    }

    /// Send HTTP request over TCP stream
    fn send_http_request(
        &self,
        mut stream: TcpStream,
        request: &RpcRequest,
    ) -> Result<RpcResponse, RpcError> {
        // Serialize request body
        let body = serde_json::to_vec(request)
            .map_err(|e| RpcError::InternalError(format!("Failed to serialize request: {}", e)))?;

        // Build auth header
        let auth_header = if let Some(ref cookie) = self.config.cookie {
            format_cookie_auth(cookie)
        } else if let (Some(ref user), Some(ref pass)) = (&self.config.username, &self.config.password)
        {
            super::auth::format_auth_header(user, pass)
        } else {
            return Err(RpcError::AuthenticationRequired);
        };

        // Build HTTP request
        let http_request = format!(
            "POST / HTTP/1.1\r\n\
             Host: {}\r\n\
             Authorization: {}\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\
             \r\n",
            self.config.addr, auth_header, body.len()
        );

        // Send request
        stream.write_all(http_request.as_bytes())?;
        stream.write_all(&body)?;
        stream.flush()?;

        // Read response
        let mut response_bytes = Vec::new();
        stream.read_to_end(&mut response_bytes)?;

        // Parse HTTP response
        self.parse_http_response(&response_bytes)
    }

    /// Parse HTTP response
    fn parse_http_response(&self, response: &[u8]) -> Result<RpcResponse, RpcError> {
        let response_str = String::from_utf8_lossy(response);

        // Find body (after \r\n\r\n)
        let body_start = response_str
            .find("\r\n\r\n")
            .ok_or_else(|| RpcError::ParseError("Invalid HTTP response".into()))?
            + 4;

        // Check status code
        let first_line = response_str
            .lines()
            .next()
            .ok_or_else(|| RpcError::ParseError("Empty response".into()))?;

        if !first_line.contains("200") {
            // Extract status code for better error message
            let status = first_line
                .split_whitespace()
                .nth(1)
                .unwrap_or("unknown");

            // Try to parse body as JSON error
            if let Ok(rpc_response) = serde_json::from_str::<RpcResponse>(&response_str[body_start..])
            {
                if let Some(err) = rpc_response.error {
                    return Err(RpcError::InternalError(format!(
                        "{} ({})",
                        err.message, err.code
                    )));
                }
            }

            return Err(RpcError::Http(format!("HTTP {}", status)));
        }

        // Parse JSON body
        let body = &response_str[body_start..];
        serde_json::from_str(body)
            .map_err(|e| RpcError::ParseError(format!("Invalid JSON response: {}", e)))
    }
}

// ============================================================================
// Convenience methods for common operations
// ============================================================================

impl RpcClient {
    /// Get node info
    pub fn get_info(&mut self) -> Result<super::types::GetInfoResult, RpcError> {
        self.call_result("get_info", serde_json::json!({}))
    }

    /// Get connected peers
    pub fn get_peers(&mut self) -> Result<Vec<super::types::PeerInfoResult>, RpcError> {
        self.call_result("get_peers", serde_json::json!({}))
    }

    /// Get sync status
    pub fn get_sync_status(&mut self) -> Result<super::types::GetSyncStatusResult, RpcError> {
        self.call_result("get_sync_status", serde_json::json!({}))
    }

    /// Get chain statistics
    pub fn get_chain_stats(&mut self) -> Result<super::types::GetChainStatsResult, RpcError> {
        self.call_result("get_chain_stats", serde_json::json!({}))
    }

    /// Get block by height
    pub fn get_block(&mut self, height: u64) -> Result<super::types::GetBlockResult, RpcError> {
        self.call_result("get_block", serde_json::json!({
            "height": height
        }))
    }

    /// Stop the node
    pub fn stop(&mut self) -> Result<(), RpcError> {
        self.call("stop", serde_json::json!({}))?;
        Ok(())
    }

    /// Get content by ID
    pub fn get_content(&mut self, content_id: &str) -> Result<super::types::GetContentResult, RpcError> {
        self.call_result("get_content", serde_json::json!({
            "content_id": content_id
        }))
    }

    /// Request content from network
    pub fn request_content(&mut self, content_id: &str) -> Result<serde_json::Value, RpcError> {
        self.call_result("request_content", serde_json::json!({
            "content_id": content_id
        }))
    }

    /// Submit a post
    pub fn submit_post(
        &mut self,
        space_id: &str,
        title: &str,
        body: &str,
        pow_nonce: u64,
        pow_difficulty: u8,
        signature: &str,
        timestamp: u64,
    ) -> Result<super::types::SubmitPostResult, RpcError> {
        self.call_result("submit_post", serde_json::json!({
            "space_id": space_id,
            "title": title,
            "body": body,
            "pow_nonce": pow_nonce,
            "pow_difficulty": pow_difficulty,
            "signature": signature,
            "timestamp": timestamp,
        }))
    }

    /// Submit a reply
    pub fn submit_reply(
        &mut self,
        parent_id: &str,
        body: &str,
        pow_nonce: u64,
        pow_difficulty: u8,
        signature: &str,
        timestamp: u64,
    ) -> Result<super::types::SubmitPostResult, RpcError> {
        self.call_result("submit_reply", serde_json::json!({
            "parent_id": parent_id,
            "body": body,
            "pow_nonce": pow_nonce,
            "pow_difficulty": pow_difficulty,
            "signature": signature,
            "timestamp": timestamp,
        }))
    }

    /// Check if node is running (by attempting connection)
    pub fn ping(&mut self) -> bool {
        self.get_info().is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_for_network() {
        let mainnet = RpcClientConfig::for_network("mainnet");
        assert_eq!(mainnet.addr.port(), 9736);

        let testnet = RpcClientConfig::for_network("testnet");
        assert_eq!(testnet.addr.port(), 19736);

        let regtest = RpcClientConfig::for_network("regtest");
        assert_eq!(regtest.addr.port(), 29736);
    }
}
