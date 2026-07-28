// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The Shoal's desktop shell.
//!
//! Copied from `trench-client/src-tauri/src/main.rs`, which is the reference this plan
//! names: a Tauri 2 app that bundles `sw` as a **resource** (not a Tauri `externalBin`
//! sidecar — see tauri.windows.conf.json for why the distinction matters), mints an
//! identity on first run, starts the node, and hands the webview a ready-built
//! `Authorization` header through `get_rpc_config`.
//!
//! The webview end of that contract is `shoal-client/src/lib/shoalRpc.ts`'s
//! `resolveAuth`, which reaches this command through `window.__TAURI__.core.invoke` —
//! so `app.withGlobalTauri` MUST stay `true` in tauri.conf.json, and the returned
//! object MUST keep the field names `{ endpoint, auth }`.

mod node_manager;
mod proc;
mod rpc_handoff;

use base64::Engine;
use node_manager::NodeManager;
use rand::Rng;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

/// Shared shell state. One node, one network, for the lifetime of the process.
struct AppState {
    node_manager: Arc<Mutex<NodeManager>>,
    /// The password used to unlock/create the node identity, resolved once at startup
    /// by `ensure_identity` and reused by `restart_node` so a restart never needs to
    /// re-run `sw identity create`.
    password: Arc<Mutex<Option<String>>>,
    /// Set if node startup (identity bootstrap or `start_with_password`) failed, so
    /// `node_status` can surface *why* the sidecar isn't running instead of the view
    /// spinning forever.
    startup_error: Arc<Mutex<Option<String>>>,
}

/// Generate a random 32-hex-char password (16 bytes of OS randomness). Deliberate
/// convenience-over-vault for a game key, not a general-purpose secret: it is written
/// in the clear next to the identity it unlocks, at the path the diagnostics view
/// prints.
fn generate_password() -> String {
    let bytes: [u8; 16] = rand::thread_rng().gen();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Mainnet keeps the plain `node-key-password.txt` name; every other network gets a
/// sibling. This is not tidiness — mainnet and a `SHOAL_NETWORK=regtest` dev run have
/// SEPARATE identity files (`node/identity.enc` vs `node-regtest/identity.enc`)
/// encrypted with DIFFERENT passwords, so a single shared password file would have the
/// second network's first launch silently overwrite the first network's password,
/// locking that identity out on its next launch ("Incorrect password", exit code 5).
/// The Trench reproduced exactly that live; this carries its fix over.
fn password_file_path(app_dir: &Path, network: &str) -> PathBuf {
    if network == "mainnet" {
        app_dir.join("node-key-password.txt")
    } else {
        app_dir.join(format!("node-key-password-{network}.txt"))
    }
}

/// First-run identity bootstrap: if the node has no identity yet, mint one via the CLI
/// with a freshly generated password and remember that password on disk; on subsequent
/// launches, just read it back.
async fn ensure_identity(
    binary_path: &Path,
    data_dir_base: &Path,
    data_dir_with_suffix: &Path,
    network: &str,
) -> Result<String, String> {
    use std::process::Stdio;
    use tokio::process::Command;

    let app_dir = data_dir_base
        .parent()
        .ok_or_else(|| "Invalid data directory (no parent)".to_string())?;
    let password_path = password_file_path(app_dir, network);
    let identity_path = data_dir_with_suffix.join("identity.enc");

    if identity_path.exists() {
        return std::fs::read_to_string(&password_path)
            .map(|s| s.trim().to_string())
            .map_err(|_| {
                format!(
                    "An identity exists at {} but its stored key ({}) is missing. \
                     It cannot be unlocked automatically.",
                    identity_path.display(),
                    password_path.display()
                )
            });
    }

    let password = generate_password();
    if let Some(parent) = password_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    std::fs::write(&password_path, &password)
        .map_err(|e| format!("Failed to write {}: {e}", password_path.display()))?;

    let mut cmd = Command::new(binary_path);
    proc::no_console(&mut cmd); // don't flash a console window for the CLI one-shot
    if network != "mainnet" {
        cmd.arg(format!("--{network}"));
    }
    let output = cmd
        .arg("identity")
        .arg("create")
        .arg("--data-dir")
        .arg(data_dir_base) // base path — the CLI appends the network suffix itself
        .env("SWIMCHAIN_PASSWORD", &password)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run `sw identity create`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Failed to create identity: {stderr} {stdout}"));
    }

    Ok(password)
}

#[derive(serde::Serialize)]
struct RpcConfigDto {
    endpoint: String,
    auth: Option<String>,
}

/// How long `get_rpc_config` will wait for the node to publish its handoff files before
/// giving up. A backstop against a wedged node, NOT the expected wait — a node that is
/// simply starting is detected by `startup_error` staying `None`, and a node that
/// failed reports that error immediately (see the loop below).
///
/// The reference shell's flat 10s cap is measurably too short and cost this task an
/// hour. Measured on this machine, first launch, mainnet, warm disk:
///   09:46:42  sw spawned, begins init
///   09:46:52  "RPC server listening on 127.0.0.1:9736" + ".cookie" written
/// — ten seconds of sled/index/DHT init BEFORE the handoff files exist, against a
/// budget of exactly ten seconds (20 x 500ms). It lost by a hair. `resolveAuth` then
/// swallowed the error (it has three more sources to try), waited its 10s for an
/// app-shell envelope that was never coming, and settled on the unauthenticated
/// `http://127.0.0.1:9736` fallback — which the node ANSWERS for read methods, so the
/// whole thing looked healthy right up until the first write.
const HANDOFF_WAIT: tokio::time::Duration = tokio::time::Duration::from_secs(120);

/// The command `shoalRpc.resolveAuth` invokes. Returns `{ endpoint, auth }` where
/// `auth`, when present, is a ready-to-send `Authorization` header value — exactly the
/// shape `tauriConfig()` in shoalRpc.ts destructures. Reads the node's own
/// `.rpc_addr`/`.cookie` handoff files rather than computing the port, so it can never
/// hand back an endpoint the node has not actually bound.
///
/// Waits on node READINESS rather than a fixed deadline (see `HANDOFF_WAIT`): it keeps
/// polling while startup is merely slow, and returns the real reason the moment startup
/// is known to have failed. Failing fast on a genuine failure is what makes the long
/// backstop safe — this can only hang if the node neither binds RPC nor exits.
#[tauri::command]
async fn get_rpc_config(state: tauri::State<'_, AppState>) -> Result<RpcConfigDto, String> {
    let data_dir = state.node_manager.lock().await.data_dir_with_suffix().clone();

    let deadline = tokio::time::Instant::now() + HANDOFF_WAIT;
    let handoff = loop {
        // Read the handoff FIRST each iteration: a node that bound RPC and only later
        // recorded some unrelated startup error should still hand back a live endpoint.
        if let Ok(h) = rpc_handoff::read_handoff(&data_dir) {
            break h;
        }
        if let Some(err) = state.startup_error.lock().await.clone() {
            return Err(err);
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(format!(
                "The node did not publish its RPC address within {}s (looked in {}).",
                HANDOFF_WAIT.as_secs(),
                data_dir.display()
            ));
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
    };

    let token =
        base64::engine::general_purpose::STANDARD.encode(format!("__cookie__:{}", handoff.cookie));
    Ok(RpcConfigDto {
        endpoint: handoff.endpoint,
        auth: Some(format!("Basic {token}")),
    })
}

#[derive(serde::Serialize)]
struct NodeStatusDto {
    running: bool,
    pid: Option<u32>,
    port: u16,
    network: String,
    data_dir: String,
    error: Option<String>,
}

#[tauri::command]
async fn node_status(state: tauri::State<'_, AppState>) -> Result<NodeStatusDto, String> {
    let manager = state.node_manager.lock().await;
    let error = state.startup_error.lock().await.clone();
    Ok(NodeStatusDto {
        running: manager.is_running(),
        pid: manager.pid(),
        port: manager.rpc_port(),
        network: manager.network().to_string(),
        data_dir: manager.data_dir_with_suffix().to_string_lossy().to_string(),
        error,
    })
}

/// Stop and restart the sidecar with the same (already-resolved) identity password.
/// Does NOT re-run identity bootstrap — that only ever happens once, at first launch.
#[tauri::command]
async fn restart_node(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let password = state
        .password
        .lock()
        .await
        .clone()
        .ok_or_else(|| "The node has not started successfully yet — nothing to restart".to_string())?;

    let mut manager = state.node_manager.lock().await;
    let _ = manager.stop().await;
    // Old cookie/addr files are stale the instant the node stops; drop them so a racing
    // get_rpc_config poll can't hand back a dead endpoint.
    let stale = manager.data_dir_with_suffix().clone();
    let _ = std::fs::remove_file(stale.join(".cookie"));
    let _ = std::fs::remove_file(stale.join(".rpc_addr"));

    match manager.start_with_password(&password).await {
        Ok(()) => {
            *state.startup_error.lock().await = None;
            Ok(())
        }
        Err(e) => {
            let msg = e.to_string();
            *state.startup_error.lock().await = Some(msg.clone());
            Err(msg)
        }
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Resolve the bundled sw binary from Tauri resources.
            let resource_path = app_handle.path().resource_dir().map_err(|e| {
                format!("Failed to get resource directory: {e}. Please reinstall the application.")
            })?;
            #[cfg(target_os = "windows")]
            let binary_name = "sw.exe";
            #[cfg(not(target_os = "windows"))]
            let binary_name = "sw";
            let binary_path = resource_path.join("binaries").join(binary_name);

            // SHOAL_NETWORK is a dev-only override — any other value, including unset
            // or a typo, means mainnet.
            let network = std::env::var("SHOAL_NETWORK")
                .ok()
                .filter(|n| node_manager::VALID_NETWORKS.contains(&n.as_str()))
                .unwrap_or_else(|| "mainnet".to_string());

            let base_config_dir = dirs::config_dir().ok_or_else(|| {
                "Failed to get config directory. Please ensure your system has a valid config directory."
                    .to_string()
            })?;
            let app_dir = base_config_dir.join("the-shoal");
            let data_dir_base = app_dir.join("node");

            let node_manager =
                NodeManager::new(binary_path.clone(), data_dir_base.clone(), network.clone());
            let data_dir_with_suffix = node_manager.data_dir_with_suffix().clone();

            let node_manager = Arc::new(Mutex::new(node_manager));
            let password: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
            let startup_error: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

            app.manage(AppState {
                node_manager: node_manager.clone(),
                password: password.clone(),
                startup_error: startup_error.clone(),
            });

            // Bootstrap identity + start the node off the setup thread so the window
            // opens immediately; the view's get_rpc_config poll covers the latency.
            tauri::async_runtime::spawn(async move {
                match ensure_identity(
                    &binary_path,
                    &data_dir_base,
                    &data_dir_with_suffix,
                    &network,
                )
                .await
                {
                    Ok(resolved_password) => {
                        *password.lock().await = Some(resolved_password.clone());
                        let mut manager = node_manager.lock().await;
                        if let Err(e) = manager.start_with_password(&resolved_password).await {
                            eprintln!("The Shoal: node failed to start: {e}");
                            *startup_error.lock().await = Some(e.to_string());
                        }
                    }
                    Err(e) => {
                        eprintln!("The Shoal: identity bootstrap failed: {e}");
                        *startup_error.lock().await = Some(e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_rpc_config,
            node_status,
            restart_node,
        ])
        .on_window_event(|window, event| {
            // Stop the sidecar the moment the window closes — kill_on_drop(true) at
            // spawn time is the real safety net (it survives a panic too), this just
            // makes the common case prompt.
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<AppState>();
                let manager = state.node_manager.clone();
                tauri::async_runtime::spawn(async move {
                    let mut manager = manager.lock().await;
                    let _ = manager.stop().await;
                });
            }
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Failed to start The Shoal: {e}");
            std::process::exit(1);
        });
}
