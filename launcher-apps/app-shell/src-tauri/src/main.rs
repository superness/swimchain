#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]
mod manifest;
mod rpc_handoff;

use base64::Engine as _;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;

struct AppState { data_dir: PathBuf }

#[derive(Serialize)]
struct RpcConfigDto {
    endpoint: String,
    auth: String,          // "Basic <base64(__cookie__:cookie)>"
    #[serde(rename = "nodeAddress")]
    node_address: String,  // filled by the client via get_identity_info; empty is OK here
    #[serde(rename = "nodeDisplayName")]
    node_display_name: String,
}

#[tauri::command]
fn get_rpc_config(state: tauri::State<'_, Mutex<AppState>>) -> Result<RpcConfigDto, String> {
    let dir = state.lock().unwrap().data_dir.clone();
    let h = rpc_handoff::read_handoff(&dir)?;
    let token = base64::engine::general_purpose::STANDARD
        .encode(format!("__cookie__:{}", h.cookie));
    Ok(RpcConfigDto {
        endpoint: h.endpoint,
        auth: format!("Basic {token}"),
        node_address: String::new(),
        node_display_name: String::new(),
    })
}

fn parse_data_dir() -> PathBuf {
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        if a == "--data-dir" {
            if let Some(v) = args.next() { return PathBuf::from(v); }
        }
    }
    // Fallback: platform config dir + swimchain-testnet (dev convenience).
    dirs::config_dir().unwrap_or_default().join("swimchain-testnet")
}

fn main() {
    let data_dir = parse_data_dir();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(AppState { data_dir }))
        .invoke_handler(tauri::generate_handler![get_rpc_config])
        .run(tauri::generate_context!())
        .expect("error while running app-shell");
}
