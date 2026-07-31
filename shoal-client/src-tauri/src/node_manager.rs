//! Spawns and supervises The Shoal's own `sw` node sidecar.
//!
//! Copied from `trench-client/src-tauri/src/node_manager.rs` with only the names
//! changed (that file is itself a trim of `desktop-app/src-tauri/src/node_manager.rs`).
//! This shell only ever runs ONE network at a time, chosen once at startup (mainnet by
//! default, `SHOAL_NETWORK=regtest` for local dev — see main.rs), so the
//! network-switching machinery desktop-app needs is not here. `find_free_port_pair`,
//! the kill-on-drop process management, the sled-lock sniff and the exit-code table are
//! kept verbatim because they are the actual hard-won lessons (see project memory:
//! "desktop login lock orphan", "PoW difficulty units").

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex as AsyncMutex;

/// Networks this shell knows how to run. A shipped build only ever runs mainnet;
/// `regtest` exists purely as a `SHOAL_NETWORK=regtest` dev override (see main.rs) so a
/// contributor can iterate against a throwaway chain — and so Task 7's two-node gossip
/// proof can run two shells side by side without touching mainnet.
pub const VALID_NETWORKS: [&str; 3] = ["mainnet", "testnet", "regtest"];

/// Default RPC port per network. Matches the node (src/network/mode.rs):
/// RPC port = default P2P port + 1 (mainnet 9735+1, testnet 19735+1, regtest 29735+1).
pub fn default_rpc_port(network: &str) -> u16 {
    match network {
        "regtest" => 29736,
        "testnet" => 19736,
        _ => 9736,
    }
}

/// Does this stderr tail say "the chain database is already locked by another process"?
///
/// Sled reports the same condition three different ways depending on platform and code
/// path, and the node's OWN sniff (`src/cli/commands/block.rs:232-234`) tests all three.
/// This shell tested only the first two, and the missing one —
/// `"another process has locked"` — is sled's own message and the one most likely to be
/// what a second Shoal window sees on Windows, where the POSIX `flock` errno text
/// ("Resource temporarily unavailable") does not appear at all.
///
/// The consequence of missing it is not a vaguer message, it is a WRONG one: a real
/// lock falls through to the exit-code table below, where `sw`'s exit code 5 prints
/// **"Incorrect password."** — telling a player their correct password is wrong while
/// an orphaned sidecar holds the lock. That is `project_desktop_login_lock_orphan`
/// reproduced exactly, in a fresh shell, from the same two lines of code.
///
/// Extracted as a free function purely so it can be tested: the call site is inside
/// `start_with_password`, which needs a spawned process to reach.
pub fn is_sled_lock(stderr_tail: &str) -> bool {
    stderr_tail.contains("could not acquire lock")
        || stderr_tail.contains("Resource temporarily unavailable")
        || stderr_tail.contains("another process has locked")
}

/// Find a free port pair `(p2p, p2p+1)` for the node, preferring `preferred_p2p` (the
/// network default). The node derives its RPC port as P2P+1 and binds RPC on
/// 127.0.0.1, so if the default RPC port is already taken (a second Shoal window, a
/// stray dev node, the operator's own node, ...) starting on the default would fail
/// with "address in use". We scan upward for a pair where BOTH ports are bindable and
/// run the node there instead. Returns the chosen P2P port (RPC is that + 1).
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
    if network == "mainnet" {
        return data_dir.clone();
    }
    let base_name = data_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("node");
    data_dir
        .parent()
        .map(|p| p.join(format!("{base_name}-{network}")))
        .unwrap_or_else(|| data_dir.clone())
}

/// Rolling capture of the sidecar's recent stderr, used to sniff the sled-lock trap
/// (see `NodeManager::start_with_password`) since the node has no dedicated exit code
/// for "another process already holds this data dir". Capped so a chatty node can't
/// grow this unbounded.
const STDERR_SNIFF_CAP: usize = 16_384;

/// Cap `buf` at `cap` bytes by dropping from the front, without ever slicing a String
/// on a non-UTF-8-char-boundary byte offset (which panics). The node's log lines
/// routinely contain multi-byte UTF-8 (arrows/checkmarks), so `buf.len() - cap` alone
/// isn't a safe cut point; this walks forward to the next valid boundary before
/// draining. This panicked live in The Trench during dev-mode verification, hence the
/// dedicated regression test below.
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

        // DROP THE PREVIOUS RUN'S HANDOFF FILES BEFORE SPAWNING, ALWAYS.
        //
        // `.rpc_addr`/`.cookie` are written by the node and are stale the instant it
        // stops — but nothing deletes them when it stops, so they survive a clean exit
        // and sit there for the NEXT launch to find. `get_rpc_config` polls
        // `read_handoff` and breaks on the FIRST success, so on a relaunch it reads the
        // dead cookie milliseconds after the window opens, long before the new node has
        // written its own. `resolveAuth` caches that, and from then on every write is
        // `403 Forbidden — Authentication failed: Invalid cookie`, forever, with nothing
        // on screen: the player watches a sea they cannot join.
        //
        // MEASURED on the installed 0.1.0 build, 2026-07-30 (plan 4d, Task 3), twice
        // each way: relaunch with these files present -> the client's swimmer never
        // appears in the room while two other clients on the same node write normally;
        // delete them first and the same build writes on its first emit.
        //
        // `restart_node` (main.rs) already did exactly this, with exactly this argument
        // in its comment. It belongs here instead, because the startup path is the one
        // every returning player takes.
        let _ = std::fs::remove_file(self.data_dir_with_suffix.join(".cookie"));
        let _ = std::fs::remove_file(self.data_dir_with_suffix.join(".rpc_addr"));

        let mut args = vec![];
        if self.network != "mainnet" {
            args.push(format!("--{}", self.network));
        }

        // Pick a free (P2P, RPC=P2P+1) port pair, preferring the network default —
        // avoids a hard crash when the default RPC port is occupied. The chosen RPC
        // port is what clients read via the handoff files, so update self.rpc_port to
        // match before spawning.
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

        let mut cmd = Command::new(&self.binary_path);
        // `sw` is a console binary; without this it pops a blank command prompt next to
        // the game on Windows. Its output already goes to the log file.
        crate::proc::no_console(&mut cmd);
        let mut child = cmd
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
        // start_with_password can sniff it below for the sled-lock trap: the node exits
        // nonzero with a generic message when another process already holds the data
        // dir's sled lock, and there's no dedicated exit code for it (unlike the
        // wrong-password/missing-identity cases, which do have one).
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
                let sled_locked = is_sled_lock(&stderr_tail);

                let error_msg = if sled_locked {
                    "The sea is already open in another window (or an orphaned process holds it). Close it and retry.".to_string()
                } else {
                    match exit_code {
                        5 => "Incorrect password.".to_string(),
                        3 => "Could not load the stored identity — the file is missing or unreadable.".to_string(),
                        other => format!(
                            "The sidecar failed to start (exit code: {other})."
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
        // WHAT `kill_on_drop(true)` (set at spawn time) ACTUALLY BUYS, corrected: it is
        // NOT a safety net against the shell process dying. It is a `Drop` impl on
        // tokio's `Child`, and a `Drop` impl runs only if the process unwinds or exits
        // normally through Rust. Neither happens here:
        //
        //   - `[profile.release] panic = "abort"` (Cargo.toml) — a panic aborts, it
        //     does not unwind, so no destructor anywhere in the program runs.
        //   - tao's event loop terminates the process with `std::process::exit`, which
        //     runs no destructors either.
        //   - A forced close (Task Manager, SIGKILL) obviously runs nothing.
        //
        // So the only paths on which this `Drop` fires are ones where the shell is
        // already tearing down in an orderly way — and on Windows tokio's own
        // `kill_on_drop` is what does the killing there, which is why this impl only
        // signals on unix. `main.rs`'s `WindowEvent::Destroyed` handler is therefore the
        // REAL stop, and it now blocks on it rather than spawning it into a race with
        // process exit. This impl is a last-resort tidy-up, not the guarantee.
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
        assert_eq!(default_rpc_port("testnet"), 19736);
        assert_eq!(default_rpc_port("regtest"), 29736);
    }

    #[test]
    fn data_dir_suffix_only_applies_to_non_mainnet() {
        let base = PathBuf::from("/tmp/the-shoal/node");
        assert_eq!(data_dir_with_suffix_for(&base, "mainnet"), base);
        assert_eq!(
            data_dir_with_suffix_for(&base, "regtest"),
            PathBuf::from("/tmp/the-shoal/node-regtest")
        );
        assert_eq!(
            data_dir_with_suffix_for(&base, "testnet"),
            PathBuf::from("/tmp/the-shoal/node-testnet")
        );
    }

    #[test]
    fn find_free_port_pair_returns_preferred_when_free() {
        // Best-effort: only asserts the function returns *something* at or above the
        // preferred port. A truly free pair can't be guaranteed on a shared box.
        let p = find_free_port_pair(59_735);
        assert!(p >= 59_735);
    }

    /// Regression test carried over from The Trench, where this panicked live within
    /// ~40s of a real node's stderr: a naive `buf.len() - cap` byte-offset cut lands
    /// mid-character whenever a multi-byte UTF-8 codepoint straddles the cut point, and
    /// `String::drain` panics on a non-char-boundary index.
    #[test]
    fn trim_stderr_tail_never_panics_on_multibyte_boundary() {
        let mut buf = String::new();
        for _ in 0..50 {
            buf.push_str("node syncing → ");
        }
        trim_stderr_tail(&mut buf, 10);
        assert!(buf.len() <= "node syncing → ".len() + 10);
        assert!(buf.is_char_boundary(0) && std::str::from_utf8(buf.as_bytes()).is_ok());
    }

    #[test]
    fn trim_stderr_tail_is_a_noop_under_the_cap() {
        let mut buf = String::from("short");
        trim_stderr_tail(&mut buf, 100);
        assert_eq!(buf, "short");
    }

    /// All THREE substrings the node's own sniff tests
    /// (`src/cli/commands/block.rs:232-234`). The third was missing here, and it is the
    /// one sled itself emits — so on Windows, where the POSIX errno text never appears,
    /// a real lock was falling through to the exit-code table and printing "Incorrect
    /// password." at a player who had typed it correctly.
    #[test]
    fn is_sled_lock_matches_all_three_reported_forms() {
        assert!(is_sled_lock(
            "Error: could not acquire lock on \"C:\\\\Users\\\\p\\\\shoal\\\\chain/db\""
        ));
        assert!(is_sled_lock(
            "Error: os error 11: Resource temporarily unavailable"
        ));
        assert!(is_sled_lock(
            "Error: another process has locked this database"
        ));
    }

    /// The tail is a rolling buffer of many lines, so the match has to survive the lock
    /// line being surrounded by ordinary startup chatter rather than being the whole
    /// string.
    #[test]
    fn is_sled_lock_finds_the_line_inside_a_full_stderr_tail() {
        let tail = "[NODE] loading config\n\
                    [NODE] opening chain store\n\
                    Error: another process has locked this database\n\
                    [NODE] shutting down\n";
        assert!(is_sled_lock(tail));
    }

    /// The failure this must NOT produce: a genuine bad password is exit code 5, and it
    /// has to stay reachable. A sniff that matched everything would swap one wrong
    /// message for another.
    #[test]
    fn is_sled_lock_does_not_claim_an_ordinary_failure() {
        assert!(!is_sled_lock("Error: incorrect password"));
        assert!(!is_sled_lock("Error: address already in use"));
        assert!(!is_sled_lock(""));
    }

    /// THE PREVIOUS RUN'S CREDENTIAL MUST NOT SURVIVE INTO THIS ONE.
    ///
    /// Measured on the installed build before this was fixed: a plain relaunch left
    /// `.cookie`/`.rpc_addr` from the previous node on disk, `get_rpc_config` read them
    /// before the new node had written its own, and every subsequent write answered
    /// `403 Forbidden — Authentication failed: Invalid cookie`. Silently: the sea drew
    /// the other swimmers and the player was simply never in it.
    ///
    /// The spawn itself is expected to FAIL here (the binary path is deliberately
    /// nonsense, so no `sw` is started and no test needs one). That is the point: the
    /// removal happens BEFORE the spawn, so the files must be gone even on the failing
    /// path — and the assertion is on the files, not on the result.
    #[tokio::test]
    async fn start_removes_the_previous_runs_handoff_files() {
        let dir = std::env::temp_dir().join(format!(
            "shoal-stale-handoff-test-{}-{:?}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        // `NodeManager::new` appends the network suffix; regtest -> `<dir>-regtest`.
        let with_suffix = PathBuf::from(format!("{}-regtest", dir.display()));
        std::fs::create_dir_all(&with_suffix).unwrap();
        std::fs::write(with_suffix.join(".cookie"), "deadcookiefromthelastrun").unwrap();
        std::fs::write(with_suffix.join(".rpc_addr"), "127.0.0.1:29736").unwrap();

        let mut manager = NodeManager::new(
            PathBuf::from("this-binary-does-not-exist-and-must-not"),
            dir.clone(),
            "regtest".to_string(),
        );
        assert_eq!(manager.data_dir_with_suffix(), &with_suffix);

        let started = manager.start_with_password("irrelevant").await;
        assert!(started.is_err(), "the fake binary must not have spawned");

        assert!(
            !with_suffix.join(".cookie").exists(),
            "the previous run's .cookie survived into this launch — \
             get_rpc_config will hand the webview a dead credential"
        );
        assert!(
            !with_suffix.join(".rpc_addr").exists(),
            "the previous run's .rpc_addr survived into this launch"
        );

        let _ = std::fs::remove_dir_all(&with_suffix);
    }
}
