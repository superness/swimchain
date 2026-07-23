//! Copied from `launcher-apps/app-shell/src-tauri/src/rpc_handoff.rs` verbatim (the
//! brief's preferred mechanism over port math): reads the node's own `.rpc_addr` /
//! `.cookie` handoff files from its data dir. These are written by the node itself
//! once RPC is actually listening, so — unlike computing the port from
//! `NodeManager::rpc_port()` before the node has necessarily bound it — this can
//! never hand back a stale or not-yet-live endpoint.

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
        let dir = std::env::temp_dir().join(format!(
            "trench-rpc-handoff-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(".rpc_addr"), "127.0.0.1:29736\n").unwrap();
        std::fs::write(dir.join(".cookie"), "secretcookie").unwrap();
        let h = read_handoff(&dir).unwrap();
        assert_eq!(h.endpoint, "http://127.0.0.1:29736");
        assert_eq!(h.cookie, "secretcookie");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn errors_when_node_not_running() {
        let dir = std::env::temp_dir().join(format!(
            "trench-rpc-handoff-test-missing-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(
            read_handoff(&dir).is_err(),
            "missing .rpc_addr => node not ready"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
