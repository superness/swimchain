mod node_host;

use std::sync::Arc;

use swimchain::network::NetworkMode;
use tauri::Manager;
use tokio::sync::Mutex;

/// The prototype runs testnet only (spec decision). Regtest/mainnet later.
const NETWORK: NetworkMode = NetworkMode::Testnet;

struct AppState {
    node: Arc<Mutex<Option<node_host::NodeHost>>>,
    /// Set when autostart fails, surfaced by the shell's status strip.
    last_error: Arc<Mutex<Option<String>>>,
}

#[derive(serde::Serialize, Clone)]
struct NodeStatusDto {
    running: bool,
    state: String,
    peers: usize,
    chain_height: u64,
    sync_percent: f32,
    uptime_seconds: u64,
    error: Option<String>,
}

#[tauri::command]
async fn node_status(state: tauri::State<'_, AppState>) -> Result<NodeStatusDto, String> {
    let node = state.node.lock().await;
    let error = state.last_error.lock().await.clone();
    Ok(match node.as_ref() {
        Some(host) => {
            let s = host.status();
            NodeStatusDto {
                running: true,
                state: s.state.name().to_string(),
                peers: s.peers,
                chain_height: s.chain_height,
                sync_percent: s.sync_percent,
                uptime_seconds: s.uptime_seconds,
                error,
            }
        }
        None => NodeStatusDto {
            running: false,
            state: "starting".to_string(),
            peers: 0,
            chain_height: 0,
            sync_percent: 0.0,
            uptime_seconds: 0,
            error,
        },
    })
}

#[tauri::command]
async fn get_rpc_auth(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let data_dir = {
        let node = state.node.lock().await;
        node.as_ref().ok_or("node not running")?.data_dir.clone()
    };
    // The RPC server may still be writing .cookie right after start; poll
    // briefly (same approach as desktop-app's get_rpc_auth).
    for _ in 0..20 {
        if let Ok(auth) = node_host::rpc_auth_from_cookie(&data_dir) {
            return Ok(auth);
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err("cookie file not found - node may not be running".to_string())
}

#[tauri::command]
fn get_rpc_endpoint() -> String {
    format!("http://127.0.0.1:{}", NETWORK.default_rpc_port())
}

/// The node identity's public address (cs1...), for desktop parity: without
/// it the embedded feed falls into browser-identity mode and mines its own
/// keypair in the WebView instead of using the node's.
#[tauri::command]
async fn get_node_address(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let node = state.node.lock().await;
    node.as_ref()
        .map(|host| host.address.clone())
        .ok_or_else(|| "node not running".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Default to info so node lifecycle logs ([BOOTSTRAP], seed
            // connections, RPC start) reach logcat; RUST_LOG still overrides.
            env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
                .try_init()
                .ok();

            let state = AppState {
                node: Arc::new(Mutex::new(None)),
                last_error: Arc::new(Mutex::new(None)),
            };
            let node = state.node.clone();
            let last_error = state.last_error.clone();
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir must resolve")
                .join("node");
            app.manage(state);

            // Autostart the node. First launch also mines the identity PoW,
            // so this can take a while - the shell polls node_status meanwhile.
            tauri::async_runtime::spawn(async move {
                log::info!("starting in-process node, data dir {}", data_dir.display());
                match node_host::start(data_dir, NETWORK).await {
                    Ok(host) => {
                        log::info!("node started");
                        *node.lock().await = Some(host);
                    }
                    Err(e) => {
                        log::error!("node failed to start: {e}");
                        *last_error.lock().await = Some(e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            node_status,
            get_rpc_auth,
            get_rpc_endpoint,
            get_node_address
        ])
        .run(tauri::generate_context!())
        .expect("error while running swimchain mobile");
}
