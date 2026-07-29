// Surf: the set. In-process mainnet node (mobile-app's model, spec section 2.1)
// + the deck shell in surf-app/web. NodeHost is a struct — no trait until a
// second backend exists.
mod node_host;

use std::sync::Arc;
use swimchain::network::NetworkMode;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

const NETWORK: NetworkMode = NetworkMode::Mainnet;

fn node_subdir() -> &'static str {
    // Network-specific so a future testnet build can never reuse the chain dir.
    "node-mainnet"
}

struct AppState {
    host: Arc<Mutex<Option<node_host::NodeHost>>>,
    // Set when the node task exits with an error; surfaced diegetically (§6).
    start_error: Arc<Mutex<Option<String>>>,
    data_dir: std::path::PathBuf,
}

#[derive(serde::Serialize)]
struct NodeStatusDto {
    running: bool,
    address: Option<String>,
    error: Option<String>,
}

#[tauri::command]
async fn node_status(state: tauri::State<'_, AppState>) -> Result<NodeStatusDto, String> {
    let host = state.host.lock().await;
    let error = state.start_error.lock().await.clone();
    Ok(NodeStatusDto {
        running: host.is_some(),
        address: host.as_ref().map(|h| h.address.clone()),
        error,
    })
}

#[tauri::command]
fn get_rpc_endpoint() -> String {
    format!("http://127.0.0.1:{}", NETWORK.default_rpc_port())
}

#[tauri::command]
async fn get_rpc_auth(state: tauri::State<'_, AppState>) -> Result<String, String> {
    // Wait for THIS run's node, then read the cookie it just regenerated.
    // Two review-confirmed traps this shape avoids: (1) a raw file poll reads
    // the PREVIOUS run's stale cookie after process death (401s everywhere);
    // (2) a fixed ~10s ceiling turns the slow first-launch identity PoW into
    // a false node-dead card. Ceiling here is generous and only for hangs.
    for _ in 0..1200 {
        if state.host.lock().await.is_some() {
            // rpc_auth_from_cookie takes the DATA DIR — it joins ".cookie"
            // itself (see mobile-app lib.rs:78). Never pre-join the filename.
            return node_host::rpc_auth_from_cookie(&state.data_dir).map_err(|e| e.to_string());
        }
        if let Some(e) = state.start_error.lock().await.clone() {
            return Err(e);
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err("node never came up (10-minute ceiling)".into())
}

#[tauri::command]
async fn get_node_address(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.host.lock().await.as_ref().map(|h| h.address.clone()))
}

#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    // Spec section 2.2 (D8): https only, validated here in Rust — mobile-app's
    // unchecked pass-through is deliberately not inherited.
    if !url.starts_with("https://") {
        return Err(format!("refused non-https external open: {url}"));
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("warn,swimchain=info,surf_app_lib=info"),
    )
    .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir")
                .join(node_subdir());
            let state = AppState {
                host: Arc::new(Mutex::new(None)),
                start_error: Arc::new(Mutex::new(None)),
                data_dir: data_dir.clone(),
            };
            let host_slot = state.host.clone();
            let err_slot = state.start_error.clone();
            app.manage(state);
            tauri::async_runtime::spawn(async move {
                // First launch pays the identity PoW here — the section 3.1
                // acquisition static is the diegetic cover for that wait.
                // node_host::start is a FREE FUNCTION, data_dir first (the
                // copied file's actual API — review-verified).
                match node_host::start(data_dir, NETWORK).await {
                    Ok(host) => *host_slot.lock().await = Some(host),
                    Err(e) => {
                        log::error!("node failed to start: {e}");
                        *err_slot.lock().await = Some(e.to_string());
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            node_status,
            get_rpc_endpoint,
            get_rpc_auth,
            get_node_address,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running surf");
}
