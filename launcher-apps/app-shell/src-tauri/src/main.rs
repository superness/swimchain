#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]
mod manifest;
mod rpc_handoff;

use base64::Engine as _;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;

struct AppState {
    data_dir: PathBuf,
    /// This app's id (feed/forum/...), passed by the launcher via --app-id. Used to
    /// find this app's cross-app route file (`<data_dir>/.route_<app_id>`).
    app_id: String,
}

#[derive(Serialize)]
struct RpcConfigDto {
    endpoint: String,
    auth: String, // "Basic <base64(__cookie__:cookie)>"
    #[serde(rename = "nodeAddress")]
    node_address: String, // filled by the client via get_identity_info; empty is OK here
    #[serde(rename = "nodeDisplayName")]
    node_display_name: String,
}

#[tauri::command]
fn get_rpc_config(state: tauri::State<'_, Mutex<AppState>>) -> Result<RpcConfigDto, String> {
    let dir = state.lock().unwrap().data_dir.clone();
    let h = rpc_handoff::read_handoff(&dir)?;
    let token = base64::engine::general_purpose::STANDARD.encode(format!("__cookie__:{}", h.cookie));
    Ok(RpcConfigDto {
        endpoint: h.endpoint,
        auth: format!("Basic {token}"),
        node_address: String::new(),
        node_display_name: String::new(),
    })
}

/// Ask the launcher to open/route another app (cross-app navigation). Writes a
/// request file the launcher's nav poller consumes; see desktop-app/src/nav.rs.
#[tauri::command]
fn request_navigate(
    state: tauri::State<'_, Mutex<AppState>>,
    app: String,
    path: String,
) -> Result<(), String> {
    let dir = state.lock().unwrap().data_dir.clone();
    let body = serde_json::json!({ "app": app, "path": path }).to_string();
    std::fs::write(dir.join(".nav_request"), body).map_err(|e| e.to_string())
}

/// Bring this app's window to the front. Called by the shell page when a
/// cross-app route arrives (someone navigated to us) — without this the target
/// window opens/stays BEHIND the app the user clicked in and goes unseen.
#[tauri::command]
fn focus_self(window: tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Return (and clear) a pending cross-app route for THIS app, dropped by the
/// launcher into `<data_dir>/.route_<app_id>`. None if there's nothing pending.
#[tauri::command]
fn poll_route(state: tauri::State<'_, Mutex<AppState>>) -> Option<String> {
    let (dir, app_id) = {
        let s = state.lock().unwrap();
        (s.data_dir.clone(), s.app_id.clone())
    };
    if app_id.is_empty() {
        return None;
    }
    let f = dir.join(format!(".route_{app_id}"));
    match std::fs::read_to_string(&f) {
        Ok(s) => {
            let _ = std::fs::remove_file(&f);
            let t = s.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        }
        Err(_) => None,
    }
}

fn parse_arg(name: &str) -> Option<String> {
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        if a == name {
            return args.next();
        }
    }
    None
}

fn parse_data_dir() -> PathBuf {
    parse_arg("--data-dir")
        .map(PathBuf::from)
        // Fallback: platform config dir + swimchain-testnet (dev convenience).
        .unwrap_or_else(|| dirs::config_dir().unwrap_or_default().join("swimchain-testnet"))
}

fn main() {
    let data_dir = parse_data_dir();
    let app_id = parse_arg("--app-id").unwrap_or_default();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(AppState { data_dir, app_id }))
        .invoke_handler(tauri::generate_handler![
            get_rpc_config,
            request_navigate,
            poll_route,
            focus_self
        ])
        .run(tauri::generate_context!())
        .expect("error while running app-shell");
}
