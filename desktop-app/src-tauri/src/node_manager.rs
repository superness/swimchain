use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use base64::Engine;

pub struct NodeManager {
    binary_path: PathBuf,
    data_dir: PathBuf,
    data_dir_with_suffix: PathBuf, // Actual data dir with network suffix
    network: String,
    process: Option<Child>,
    rpc_port: u16,
}

/// Valid network names accepted by the desktop shell.
pub const VALID_NETWORKS: [&str; 3] = ["mainnet", "testnet", "regtest"];

/// Default RPC port per network. Matches the node (src/network/mode.rs):
/// RPC port = default P2P port + 1 (mainnet 9735+1, testnet 19735+1, regtest 29735+1).
pub fn default_rpc_port(network: &str) -> u16 {
    match network {
        "mainnet" => 9736,
        "testnet" => 19736,
        "regtest" => 29736,
        _ => 19736,
    }
}

/// Find a free port pair `(p2p, p2p+1)` for the node, preferring `preferred_p2p` (the
/// network default). The node derives its RPC port as P2P+1 and binds RPC on 127.0.0.1,
/// so if the default RPC port is already taken (e.g. an `adb forward` for mobile dev, or a
/// second node), starting on the default would fail with "address in use" and the app
/// would appear to crash. We scan upward for a pair where BOTH ports are bindable and run
/// the node there instead. Returns the chosen P2P port (RPC is that + 1).
fn find_free_port_pair(preferred_p2p: u16) -> u16 {
    use std::net::TcpListener;
    let mut p = preferred_p2p;
    for _ in 0..64 {
        // Hold both listeners simultaneously so the pair is verified free at the same
        // instant, then drop them (freeing the ports) just before the node binds.
        let p2p_ok = TcpListener::bind(("127.0.0.1", p)).is_ok();
        let rpc_ok = TcpListener::bind(("127.0.0.1", p.wrapping_add(1))).is_ok();
        if p2p_ok && rpc_ok {
            return p;
        }
        p = p.wrapping_add(2);
    }
    preferred_p2p // give up scanning; let the node surface the bind error
}

/// Compute the actual data dir with network suffix (what the CLI creates),
/// e.g. `swimchain` -> `swimchain-testnet`. Mainnet has no suffix.
fn data_dir_with_suffix_for(data_dir: &PathBuf, network: &str) -> PathBuf {
    let suffix = match network {
        "testnet" => "-testnet",
        "regtest" => "-regtest",
        _ => "",
    };
    if suffix.is_empty() {
        data_dir.clone()
    } else {
        let base_name = data_dir.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("swimchain");
        data_dir.parent()
            .map(|p| p.join(format!("{}{}", base_name, suffix)))
            .unwrap_or_else(|| data_dir.clone())
    }
}

impl NodeManager {
    pub fn new(binary_path: PathBuf, data_dir: PathBuf, network: String) -> Self {
        let rpc_port = default_rpc_port(&network);
        let data_dir_with_suffix = data_dir_with_suffix_for(&data_dir, &network);

        Self {
            binary_path,
            data_dir,
            data_dir_with_suffix,
            network,
            process: None,
            rpc_port,
        }
    }

    /// Switch to a different network. The node must be stopped first.
    pub fn set_network(&mut self, network: &str) -> Result<(), String> {
        if !VALID_NETWORKS.contains(&network) {
            return Err(format!("Invalid network: {}", network));
        }
        if self.is_running() {
            return Err("Cannot switch networks while the node is running".to_string());
        }
        self.network = network.to_string();
        self.rpc_port = default_rpc_port(network);
        self.data_dir_with_suffix = data_dir_with_suffix_for(&self.data_dir, network);
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.process.is_some()
    }

    pub fn rpc_port(&self) -> u16 {
        self.rpc_port
    }

    pub fn network(&self) -> &str {
        &self.network
    }

    pub fn log_file_path(&self) -> PathBuf {
        self.data_dir_with_suffix.join("node.log")
    }

    pub fn data_dir_with_suffix(&self) -> &PathBuf {
        &self.data_dir_with_suffix
    }

    pub async fn start_with_password(&mut self, password: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if self.is_running() {
            return Ok(());
        }

        // Ensure data directory exists
        std::fs::create_dir_all(&self.data_dir)?;

        // Build command arguments
        // Note: for testnet, --testnet must come BEFORE the subcommand
        let mut args = vec![];

        // Add network flag first (before subcommand)
        match self.network.as_str() {
            "testnet" => args.push("--testnet".to_string()),
            "regtest" => args.push("--regtest".to_string()),
            _ => {} // mainnet is default
        }

        // Note: --log-file option removed as bundled binary may not have it
        // The node logs to stderr which we capture

        // Pick a free (P2P, RPC=P2P+1) port pair, preferring the network default. This
        // avoids a hard crash when the default RPC port is occupied (e.g. an adb forward
        // from mobile-app dev, or a second node). The chosen RPC port is what the client
        // will connect to, so update self.rpc_port to match before spawning.
        let default_p2p = default_rpc_port(&self.network).saturating_sub(1);
        let p2p_port = find_free_port_pair(default_p2p);
        self.rpc_port = p2p_port.wrapping_add(1);

        args.extend([
            "node".to_string(),
            "start".to_string(),
            "--data-dir".to_string(),
            self.data_dir.to_string_lossy().to_string(),
            "--listen".to_string(),
            format!("0.0.0.0:{}", p2p_port),
        ]);

        // Spawn the node process with SWIMCHAIN_PASSWORD env var
        let mut child = Command::new(&self.binary_path)
            .args(&args)
            .env("SWIMCHAIN_PASSWORD", password)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()?;

        // Write node logs to file
        let log_file_path = self.log_file_path();

        // Capture stdout for logging
        if let Some(stdout) = child.stdout.take() {
            let log_path = log_file_path.clone();
            tokio::spawn(async move {
                use std::io::Write;
                let mut file = match std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path) {
                    Ok(f) => f,
                    Err(e) => {
                        eprintln!("Failed to open node log file: {}", e);
                        return;
                    }
                };
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
                    let _ = writeln!(file, "[{} NODE] {}", timestamp, line);
                }
            });
        }

        // Capture stderr for error logging
        if let Some(stderr) = child.stderr.take() {
            let log_path = log_file_path.clone();
            tokio::spawn(async move {
                use std::io::Write;
                let mut file = match std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path) {
                    Ok(f) => f,
                    Err(e) => {
                        eprintln!("Failed to open node log file for stderr: {}", e);
                        return;
                    }
                };
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
                    let _ = writeln!(file, "[{} NODE ERROR] {}", timestamp, line);
                }
            });
        }

        // Wait a moment for the node to start
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Check if process is still running
        match child.try_wait() {
            Ok(Some(status)) => {
                // Process exited immediately - likely wrong password or corrupted identity
                let exit_code = status.code().unwrap_or(-1);
                let error_msg = if exit_code == 1 {
                    // Exit code 1 typically indicates authentication/decryption failure
                    "Incorrect password. Please try again.".to_string()
                } else {
                    format!("Node failed to start (exit code: {}). This may indicate a corrupted identity or configuration issue.", exit_code)
                };
                return Err(error_msg.into());
            }
            Ok(None) => {
                // Still running, good!
                self.process = Some(child);
            }
            Err(e) => {
                return Err(format!("Failed to check process status: {}", e).into());
            }
        }

        Ok(())
    }

    pub async fn stop(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(mut process) = self.process.take() {
            // Try graceful shutdown first
            #[cfg(unix)]
            {
                // Send SIGTERM
                unsafe {
                    libc::kill(process.id().unwrap() as i32, libc::SIGTERM);
                }
            }

            #[cfg(windows)]
            {
                // On Windows, just kill the process
                let _ = process.kill().await;
            }

            // Wait for process to exit (with timeout)
            let timeout = tokio::time::timeout(
                tokio::time::Duration::from_secs(5),
                process.wait(),
            )
            .await;

            if timeout.is_err() {
                // Force kill if graceful shutdown didn't work
                let _ = process.kill().await;
            }
        }

        Ok(())
    }

    pub async fn get_peer_count(&self) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        if !self.is_running() {
            return Ok(0);
        }

        // Read cookie for authentication
        let cookie_path = self.data_dir_with_suffix.join(".cookie");
        let cookie = match std::fs::read_to_string(&cookie_path) {
            Ok(c) => c.trim().to_string(),
            Err(_) => return Ok(0), // Cookie not available yet
        };

        // Format as HTTP Basic auth: base64("__cookie__:<cookie_value>")
        let credentials = format!("__cookie__:{}", cookie);
        let auth_header = format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(&credentials));

        // Make RPC call to get peer count with timeout to prevent UI hangs
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()?;
        let response = client
            .post(format!("http://127.0.0.1:{}", self.rpc_port))
            .header("Authorization", &auth_header)
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "get_peers",
                "params": {},
                "id": 1
            }))
            .send()
            .await?;

        let result: serde_json::Value = response.json().await?;

        if let Some(peers) = result.get("result").and_then(|r| r.as_array()) {
            Ok(peers.len())
        } else {
            Ok(0)
        }
    }
}

impl Drop for NodeManager {
    fn drop(&mut self) {
        // Ensure node is stopped when manager is dropped
        if let Some(process) = self.process.take() {
            // Blocking stop - we're dropping so can't be async
            #[cfg(unix)]
            {
                if let Some(pid) = process.id() {
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                }
            }
            // Process will be killed on drop due to kill_on_drop(true)
            drop(process);
        }
    }
}
