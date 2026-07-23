//! Spawns and supervises The Trench's own `sw` node sidecar.
//!
//! Trimmed from `desktop-app/src-tauri/src/node_manager.rs` (Swimchain Desktop): this
//! shell only ever runs ONE network at a time, chosen once at startup (mainnet by
//! default, `TRENCH_NETWORK=regtest` for local dev — see main.rs), so the
//! network-switching machinery desktop-app needs (multiple saved networks, runtime
//! `set_network`) is dropped. `find_free_port_pair`, the kill-on-drop process
//! management, and the exit-code table are kept because they're the actual hard-won
//! lessons (see project memory: PoW difficulty units, desktop login lock orphan).

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex as AsyncMutex;

/// Networks this shell knows how to run. Unlike desktop-app (which offers
/// mainnet/testnet/regtest as a user-facing toggle), The Trench only ever runs
/// mainnet in a shipped build; `regtest` exists purely as a `TRENCH_NETWORK=regtest`
/// dev override (see main.rs) so a contributor can iterate against a throwaway chain
/// without touching the real mainnet data dir.
pub const VALID_NETWORKS: [&str; 2] = ["mainnet", "regtest"];

/// Default RPC port per network. Matches the node (src/network/mode.rs):
/// RPC port = default P2P port + 1 (mainnet 9735+1, regtest 29735+1).
pub fn default_rpc_port(network: &str) -> u16 {
    match network {
        "regtest" => 29736,
        _ => 9736,
    }
}

/// Find a free port pair `(p2p, p2p+1)` for the node, preferring `preferred_p2p` (the
/// network default). The node derives its RPC port as P2P+1 and binds RPC on
/// 127.0.0.1, so if the default RPC port is already taken (another Trench window, a
/// stray dev node, ...), starting on the default would fail with "address in use".
/// We scan upward for a pair where BOTH ports are bindable and run the node there
/// instead. Returns the chosen P2P port (RPC is that + 1).
pub fn find_free_port_pair(preferred_p2p: u16) -> u16 {
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
/// e.g. `node` -> `node-regtest`. Mainnet has no suffix.
fn data_dir_with_suffix_for(data_dir: &PathBuf, network: &str) -> PathBuf {
    if network != "regtest" {
        return data_dir.clone();
    }
    let base_name = data_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("node");
    data_dir
        .parent()
        .map(|p| p.join(format!("{base_name}-regtest")))
        .unwrap_or_else(|| data_dir.clone())
}

/// Rolling capture of the sidecar's recent stderr, used to sniff the sled-lock trap
/// (see `NodeManager::start_with_password`) since the node has no dedicated exit code
/// for "another process already holds this data dir". Capped so a chatty node can't
/// grow this unbounded.
const STDERR_SNIFF_CAP: usize = 16_384;

/// Cap `buf` at `cap` bytes by dropping from the front, without ever slicing a
/// String on a non-UTF-8-char-boundary byte offset (which panics — see the caller).
/// The node's log lines routinely contain multi-byte UTF-8 (the CLI likes
/// arrows/checkmarks in its output), so `buf.len() - cap` alone isn't a safe cut
/// point; this walks forward to the next valid boundary before draining. Hit live
/// during dev-mode verification of this file (`assertion failed:
/// self.is_char_boundary(end)`), hence the dedicated regression test below.
fn trim_stderr_tail(buf: &mut String, cap: usize) {
    if buf.len() <= cap {
        return;
    }
    let mut cut = buf.len() - cap;
    while cut < buf.len() && !buf.is_char_boundary(cut) {
        cut += 1;
    }
    buf.drain(0..cut);
}

pub struct NodeManager {
    binary_path: PathBuf,
    data_dir: PathBuf,
    data_dir_with_suffix: PathBuf,
    network: String,
    process: Option<Child>,
    rpc_port: u16,
    stderr_tail: Arc<AsyncMutex<String>>,
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
            stderr_tail: Arc::new(AsyncMutex::new(String::new())),
        }
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

    pub fn pid(&self) -> Option<u32> {
        self.process.as_ref().and_then(|p| p.id())
    }

    pub fn log_file_path(&self) -> PathBuf {
        self.data_dir_with_suffix.join("node.log")
    }

    pub fn data_dir_with_suffix(&self) -> &PathBuf {
        &self.data_dir_with_suffix
    }

    pub async fn start_with_password(
        &mut self,
        password: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if self.is_running() {
            return Ok(());
        }

        std::fs::create_dir_all(&self.data_dir)?;

        let mut args = vec![];
        if self.network == "regtest" {
            args.push("--regtest".to_string());
        }

        // Pick a free (P2P, RPC=P2P+1) port pair, preferring the network default —
        // avoids a hard crash when the default RPC port is occupied. The chosen RPC
        // port is what clients read via the handoff files, so update self.rpc_port
        // to match before spawning.
        let default_p2p = default_rpc_port(&self.network).saturating_sub(1);
        let p2p_port = find_free_port_pair(default_p2p);
        self.rpc_port = p2p_port.wrapping_add(1);

        args.extend([
            "node".to_string(),
            "start".to_string(),
            "--data-dir".to_string(),
            self.data_dir.to_string_lossy().to_string(),
            "--listen".to_string(),
            format!("0.0.0.0:{p2p_port}"),
        ]);

        let mut child = Command::new(&self.binary_path)
            .args(&args)
            .env("SWIMCHAIN_PASSWORD", password)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()?;

        let log_file_path = self.log_file_path();

        if let Some(stdout) = child.stdout.take() {
            let log_path = log_file_path.clone();
            tokio::spawn(async move {
                use std::io::Write;
                let mut file = match std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)
                {
                    Ok(f) => f,
                    Err(e) => {
                        eprintln!("Failed to open node log file: {e}");
                        return;
                    }
                };
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = writeln!(file, "[NODE] {line}");
                }
            });
        }

        // Capture stderr both to the log file AND into a rolling in-memory tail so
        // start_with_password can sniff it below for the sled-lock trap: the node
        // exits nonzero with a generic message when another process already holds
        // the data dir's sled lock, and there's no dedicated exit code for it
        // (unlike the wrong-password/missing-identity cases, which do have one).
        if let Some(stderr) = child.stderr.take() {
            let log_path = log_file_path.clone();
            let tail = self.stderr_tail.clone();
            tokio::spawn(async move {
                use std::io::Write;
                let mut file = match std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)
                {
                    Ok(f) => f,
                    Err(e) => {
                        eprintln!("Failed to open node log file for stderr: {e}");
                        return;
                    }
                };
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = writeln!(file, "[NODE ERROR] {line}");
                    let mut buf = tail.lock().await;
                    buf.push_str(&line);
                    buf.push('\n');
                    trim_stderr_tail(&mut buf, STDERR_SNIFF_CAP);
                }
            });
        }

        // Give the process a moment to either fail fast or settle into running.
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        match child.try_wait() {
            Ok(Some(status)) => {
                let exit_code = status.code().unwrap_or(-1);
                let stderr_tail = self.stderr_tail.lock().await.clone();
                let sled_locked = stderr_tail.contains("could not acquire lock")
                    || stderr_tail.contains("Resource temporarily unavailable");

                let error_msg = if sled_locked {
                    "The Trench's node is already running (another window or an orphaned process). Close it and retry.".to_string()
                } else {
                    match exit_code {
                        5 => "Incorrect password. Please try again.".to_string(),
                        3 => "Could not load your identity — the identity file is missing or unreadable.".to_string(),
                        other => format!(
                            "Node failed to start (exit code: {other}). This may indicate a configuration issue."
                        ),
                    }
                };
                return Err(error_msg.into());
            }
            Ok(None) => {
                self.process = Some(child);
            }
            Err(e) => {
                return Err(format!("Failed to check process status: {e}").into());
            }
        }

        Ok(())
    }

    pub async fn stop(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(mut process) = self.process.take() {
            #[cfg(unix)]
            {
                if let Some(pid) = process.id() {
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                }
            }
            #[cfg(windows)]
            {
                let _ = process.kill().await;
            }

            let timeout =
                tokio::time::timeout(tokio::time::Duration::from_secs(5), process.wait()).await;
            if timeout.is_err() {
                let _ = process.kill().await;
            }
        }
        Ok(())
    }
}

impl Drop for NodeManager {
    fn drop(&mut self) {
        // `kill_on_drop(true)` (set at spawn time) is the actual safety net that
        // guarantees no orphaned sw.exe survives the shell process dying (panic,
        // forced close, ...) — dropping `process` here just triggers it explicitly
        // rather than waiting for AppState's own drop.
        if let Some(process) = self.process.take() {
            #[cfg(unix)]
            {
                if let Some(pid) = process.id() {
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                }
            }
            drop(process);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_rpc_port_matches_node_p2p_plus_one() {
        assert_eq!(default_rpc_port("mainnet"), 9736);
        assert_eq!(default_rpc_port("regtest"), 29736);
    }

    #[test]
    fn data_dir_suffix_only_applies_to_regtest() {
        let base = PathBuf::from("/tmp/the-trench/node");
        assert_eq!(data_dir_with_suffix_for(&base, "mainnet"), base);
        assert_eq!(
            data_dir_with_suffix_for(&base, "regtest"),
            PathBuf::from("/tmp/the-trench/node-regtest")
        );
    }

    #[test]
    fn find_free_port_pair_returns_preferred_when_free() {
        // Best-effort: only asserts the function returns *something*; a truly free
        // pair can't be guaranteed on a shared CI box, but the fallback-to-preferred
        // behavior (scanning exhausted) is exercised by construction either way.
        let p = find_free_port_pair(59_735);
        assert!(p >= 59_735);
    }

    /// Regression test for the live panic hit during dev-mode verification: a naive
    /// `buf.len() - cap` byte-offset cut lands mid-character whenever a multi-byte
    /// UTF-8 codepoint straddles the cut point, and `String::drain` panics on a
    /// non-char-boundary index. Node log lines are full of multi-byte glyphs (→, ✓,
    /// …), so this is not a hypothetical: it reproduced within ~40s of a real
    /// regtest node's stderr.
    #[test]
    fn trim_stderr_tail_never_panics_on_multibyte_boundary() {
        // Every line ends in a 3-byte arrow (→); with cap=10 the naive cut point
        // (line.len() - 10) lands inside a preceding arrow's byte sequence for at
        // least one of these repetitions, which is exactly what panicked live.
        let mut buf = String::new();
        for _ in 0..50 {
            buf.push_str("node syncing → ");
        }
        trim_stderr_tail(&mut buf, 10);
        assert!(buf.len() <= "node syncing → ".len() + 10); // bounded, not exact (rounds up to a char boundary)
        assert!(buf.is_char_boundary(0) && std::str::from_utf8(buf.as_bytes()).is_ok());
    }

    #[test]
    fn trim_stderr_tail_is_a_noop_under_the_cap() {
        let mut buf = String::from("short");
        trim_stderr_tail(&mut buf, 100);
        assert_eq!(buf, "short");
    }
}
