use std::path::Path;

#[derive(Debug, Clone)]
pub struct RpcHandoff {
    pub endpoint: String,
    pub cookie: String,
}

/// Read the node's RPC address + cookie from `data_dir` (the same files the CLI uses).
/// Fails when the node isn't running yet (marker files absent).
pub fn read_handoff(data_dir: &Path) -> Result<RpcHandoff, String> {
    let addr = std::fs::read_to_string(data_dir.join(".rpc_addr"))
        .map_err(|_| "node not running: .rpc_addr missing".to_string())?;
    let cookie = std::fs::read_to_string(data_dir.join(".cookie"))
        .map_err(|_| "node not running: .cookie missing".to_string())?;
    Ok(RpcHandoff {
        endpoint: format!("http://{}", addr.trim()),
        cookie: cookie.trim().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_addr_and_cookie_into_endpoint() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".rpc_addr"), "127.0.0.1:19736\n").unwrap();
        std::fs::write(dir.path().join(".cookie"), "secretcookie").unwrap();
        let h = read_handoff(dir.path()).unwrap();
        assert_eq!(h.endpoint, "http://127.0.0.1:19736");
        assert_eq!(h.cookie, "secretcookie");
    }
    #[test]
    fn errors_when_node_not_running() {
        let dir = tempfile::tempdir().unwrap();
        assert!(
            read_handoff(dir.path()).is_err(),
            "missing .rpc_addr => node not ready"
        );
    }
}
