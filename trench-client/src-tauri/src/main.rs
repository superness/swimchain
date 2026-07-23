// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod node_manager;
mod rpc_handoff;

use base64::Engine;
use node_manager::NodeManager;
use rand::Rng;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

/// Shared shell state. One node, one network, for the lifetime of the process — see
/// node_manager.rs's doc comment for why this is simpler than desktop-app's
/// multi-network AppState.
struct AppState {
    node_manager: Arc<Mutex<NodeManager>>,
    /// The password used to unlock/create the node identity, resolved once at
    /// startup by `ensure_identity` and reused by `restart_node` so a restart never
    /// needs to re-run `sw identity create`.
    password: Arc<Mutex<Option<String>>>,
    /// Set if node startup (identity bootstrap or `start_with_password`) failed, so
    /// `node_status` can surface *why* the sidecar isn't running instead of the UI
    /// just spinning forever on "connecting...".
    startup_error: Arc<Mutex<Option<String>>>,
}

/// Generate a random 32-hex-char password (16 bytes of OS randomness). This is
/// deliberate convenience-over-vault for a game key, not a general-purpose secret:
/// it's written in the clear next to the identity it unlocks. The UI's fine print
/// says exactly where (`<config>/the-trench/node-key-password.txt`).
fn generate_password() -> String {
    let bytes: [u8; 16] = rand::thread_rng().gen();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Brief's spec names this file `node-key-password.txt` at the shared `the-trench/`
/// level — correct for the one network a shipped build ever runs (mainnet). But
/// mainnet and the `TRENCH_NETWORK=regtest` dev override have SEPARATE identity
/// files (`node/identity.enc` vs `node-regtest/identity.enc`) encrypted with
/// DIFFERENT passwords; a single shared password file would have the second
/// network's first launch silently overwrite the first network's password,
/// locking that identity out on its next launch ("Incorrect password", exit code
/// 5) — reproduced live while verifying this file (regtest, then mainnet, on the
/// same machine). Keeping mainnet's filename exactly as specified (nothing in a
/// real install ever runs regtest) and giving regtest a sibling name closes the
/// collision without changing the shipped path at all.
fn password_file_path(the_trench_dir: &Path, network: &str) -> PathBuf {
    if network == "regtest" {
        the_trench_dir.join("node-key-password-regtest.txt")
    } else {
        the_trench_dir.join("node-key-password.txt")
    }
}

/// First-run identity bootstrap (brief Task 4, Step 2): if the node has no identity
/// yet, mint one via the CLI with a freshly generated password and remember that
/// password on disk; on subsequent launches, just read it back. Mirrors
/// `desktop-app/src-tauri/src/main.rs:342-390` (`create_identity`) but folded into
/// startup instead of being a user-facing onboarding step — The Trench's node IS the
/// player's identity, there's no separate account flow.
async fn ensure_identity(
    binary_path: &Path,
    data_dir_base: &Path,
    data_dir_with_suffix: &Path,
    network: &str,
) -> Result<String, String> {
    use std::process::Stdio;
    use tokio::process::Command;

    let the_trench_dir = data_dir_base
        .parent()
        .ok_or_else(|| "Invalid data directory (no parent)".to_string())?;
    let password_path = password_file_path(the_trench_dir, network);
    let identity_path = data_dir_with_suffix.join("identity.enc");

    if identity_path.exists() {
        return std::fs::read_to_string(&password_path)
            .map(|s| s.trim().to_string())
            .map_err(|_| {
                format!(
                    "Your lantern's identity exists at {} but its stored key ({}) is missing. \
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
    if network == "regtest" {
        cmd.arg("--regtest");
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

/// Tauri command consumed by `trench-client/ui/src/lib/nodeRpc.ts`'s `resolveAuth`
/// (step 2): `{ endpoint, auth }` where `auth`, when present, is a ready-to-send
/// `Authorization` header value. Reads the node's own `.rpc_addr`/`.cookie` handoff
/// files (`rpc_handoff.rs`) rather than computing the port from `NodeManager`, and
/// polls up to 10s since the sidecar may still be starting when the UI's first call
/// lands.
#[tauri::command]
async fn get_rpc_config(state: tauri::State<'_, AppState>) -> Result<RpcConfigDto, String> {
    let data_dir = state.node_manager.lock().await.data_dir_with_suffix().clone();

    let mut attempts = 0;
    let handoff = loop {
        match rpc_handoff::read_handoff(&data_dir) {
            Ok(h) => break h,
            Err(e) => {
                if attempts >= 20 {
                    return Err(e);
                }
                attempts += 1;
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        }
    };

    let token = base64::engine::general_purpose::STANDARD
        .encode(format!("__cookie__:{}", handoff.cookie));
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
        .ok_or_else(|| "Node has not started successfully yet — nothing to restart".to_string())?;

    let mut manager = state.node_manager.lock().await;
    let _ = manager.stop().await;
    // Old cookie/addr files are stale the instant the node stops; drop them so a
    // racing get_rpc_config poll can't hand back a dead endpoint.
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

            // Resolve the bundled sw binary from Tauri resources (mirrors
            // desktop-app/src-tauri/src/main.rs:567-572).
            let resource_path = app_handle.path().resource_dir().map_err(|e| {
                format!(
                    "Failed to get resource directory: {e}. Please reinstall the application."
                )
            })?;
            #[cfg(target_os = "windows")]
            let binary_name = "sw.exe";
            #[cfg(not(target_os = "windows"))]
            let binary_name = "sw";
            let binary_path = resource_path.join("binaries").join(binary_name);

            // TRENCH_NETWORK=regtest is a dev-only override (see node_manager.rs) —
            // any other value, including unset or a typo, means mainnet.
            let network = std::env::var("TRENCH_NETWORK")
                .ok()
                .filter(|n| node_manager::VALID_NETWORKS.contains(&n.as_str()))
                .unwrap_or_else(|| "mainnet".to_string());

            let base_config_dir = dirs::config_dir().ok_or_else(|| {
                "Failed to get config directory. Please ensure your system has a valid config directory."
                    .to_string()
            })?;
            let the_trench_dir = base_config_dir.join("the-trench");
            let data_dir_base = the_trench_dir.join("node");

            let node_manager = NodeManager::new(binary_path.clone(), data_dir_base.clone(), network.clone());
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
            // opens immediately; the UI's resolveAuth/get_rpc_config poll (up to 10s)
            // covers the startup latency.
            tauri::async_runtime::spawn(async move {
                match ensure_identity(&binary_path, &data_dir_base, &data_dir_with_suffix, &network).await {
                    Ok(resolved_password) => {
                        *password.lock().await = Some(resolved_password.clone());
                        let mut manager = node_manager.lock().await;
                        if let Err(e) = manager.start_with_password(&resolved_password).await {
                            eprintln!("The Trench: node failed to start: {e}");
                            *startup_error.lock().await = Some(e.to_string());
                        }
                    }
                    Err(e) => {
                        eprintln!("The Trench: identity bootstrap failed: {e}");
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
            // spawn time is the real safety net (survives a panic too), this just
            // makes the common case (user closes the app normally) prompt too.
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
            eprintln!("Failed to start The Trench: {e}");
            std::process::exit(1);
        });
}
