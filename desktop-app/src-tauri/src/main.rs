// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod node_manager;

use node_manager::NodeManager;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

struct AppState {
    node_manager: Arc<Mutex<NodeManager>>,
    binary_path: PathBuf,
    data_dir: PathBuf,      // Actual data dir with network suffix (e.g., swimchain-testnet)
    data_dir_base: PathBuf, // Base data dir without suffix (what we pass to CLI)
    cached_cookie: Arc<Mutex<Option<String>>>, // Cached RPC auth to avoid file reads
}

#[tauri::command]
async fn get_node_status(state: tauri::State<'_, AppState>) -> Result<NodeStatus, String> {
    let manager = state.node_manager.lock().await;
    Ok(NodeStatus {
        running: manager.is_running(),
        rpc_port: manager.rpc_port(),
        peer_count: manager.get_peer_count().await.unwrap_or(0),
        network: manager.network().to_string(),
    })
}

#[tauri::command]
async fn start_node(state: tauri::State<'_, AppState>, password: String) -> Result<(), String> {
    // Clear cached cookie before starting (in case of restart or stale cache)
    {
        let mut cache = state.cached_cookie.lock().await;
        *cache = None;
    }

    // Delete old cookie file so we don't read a stale cookie
    // The new node will write a fresh one when it starts
    let cookie_path = state.data_dir.join(".cookie");
    if cookie_path.exists() {
        let _ = std::fs::remove_file(&cookie_path);
    }

    let mut manager = state.node_manager.lock().await;
    manager.start_with_password(&password).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_node(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut manager = state.node_manager.lock().await;
    let result = manager.stop().await.map_err(|e| e.to_string());
    // Clear cached cookie on node stop
    {
        let mut cache = state.cached_cookie.lock().await;
        *cache = None;
    }
    result
}

#[tauri::command]
async fn get_rpc_endpoint(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let manager = state.node_manager.lock().await;
    Ok(format!("http://127.0.0.1:{}", manager.rpc_port()))
}

#[tauri::command]
async fn get_log_file_path(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let manager = state.node_manager.lock().await;
    Ok(manager.log_file_path().to_string_lossy().to_string())
}

#[tauri::command]
async fn write_client_log(
    state: tauri::State<'_, AppState>,
    client: String,
    level: String,
    message: String,
) -> Result<(), String> {
    use std::io::Write;

    std::fs::create_dir_all(&state.data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    let log_file = state.data_dir.join(format!("{}.log", client));

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    writeln!(file, "[{} {} {}] {}", timestamp, level.to_uppercase(), client, message)
        .map_err(|e| format!("Failed to write log: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_data_dir(state: tauri::State<'_, AppState>) -> Result<String, String> {
    Ok(state.data_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn get_rpc_auth(state: tauri::State<'_, AppState>) -> Result<String, String> {
    // Check cache first to avoid file reads on every poll
    {
        let cache = state.cached_cookie.lock().await;
        if let Some(ref auth) = *cache {
            return Ok(auth.clone());
        }
    }

    // Read the .cookie file from data_dir
    let cookie_path = state.data_dir.join(".cookie");

    // Wait for cookie file to exist (node may still be starting)
    // Poll for up to 10 seconds
    let mut attempts = 0;
    while !cookie_path.exists() && attempts < 20 {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        attempts += 1;
    }

    if !cookie_path.exists() {
        return Err("Cookie file not found - node may not be running".to_string());
    }

    let cookie = std::fs::read_to_string(&cookie_path)
        .map_err(|e| format!("Failed to read cookie: {}", e))?;

    let cookie = cookie.trim();

    // Format as HTTP Basic auth header value
    // Format: base64("__cookie__:<cookie_value>")
    use base64::Engine;
    let credentials = format!("__cookie__:{}", cookie);
    let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);

    let auth = format!("Basic {}", encoded);

    // Cache the result
    {
        let mut cache = state.cached_cookie.lock().await;
        *cache = Some(auth.clone());
    }

    Ok(auth)
}

/// Encode a raw 32-byte Ed25519 public key as a Swimchain Bech32m address.
///
/// Mirrors the node's `encode_address_from_pubkey` (src/crypto/address.rs,
/// SPEC_01 §4.2) exactly: Bech32m, HRP "cs", payload = version byte (0)
/// followed by the raw 32-byte public key. Uses the same bech32 crate ("0.11")
/// as the node so the encoding is byte-for-byte identical.
fn encode_cs_address(pubkey: &[u8]) -> Result<String, String> {
    use bech32::{Bech32m, Hrp};

    if pubkey.len() != 32 {
        return Err(format!("Invalid public key length: {}", pubkey.len()));
    }

    let hrp = Hrp::parse("cs").expect("valid HRP");
    let mut payload = Vec::with_capacity(33);
    payload.push(0u8); // ADDRESS_VERSION per SPEC_01 §3.3
    payload.extend_from_slice(pubkey);
    bech32::encode::<Bech32m>(hrp, &payload)
        .map_err(|e| format!("Failed to encode address: {}", e))
}

#[tauri::command]
async fn check_identity(state: tauri::State<'_, AppState>) -> Result<IdentityInfo, String> {
    // Identity is stored at data_dir/identity.enc
    // Binary format: CSID(4) + version(1) + pubkey(32) + ...
    let identity_path = state.data_dir.join("identity.enc");

    if identity_path.exists() {
        // Read the binary file
        let data = std::fs::read(&identity_path)
            .map_err(|e| format!("Failed to read identity: {}", e))?;

        // Verify magic bytes and extract public key
        if data.len() < 37 {
            return Err("Invalid identity file: too short".to_string());
        }
        if &data[0..4] != b"CSID" {
            return Err("Invalid identity file: bad magic".to_string());
        }

        // Extract public key (bytes 5-37)
        let pubkey = &data[5..37];

        let address = encode_cs_address(pubkey)?;

        Ok(IdentityInfo {
            exists: true,
            name: None, // Display name is not stored in identity file
            address: Some(address),
        })
    } else {
        Ok(IdentityInfo {
            exists: false,
            name: None,
            address: None,
        })
    }
}

#[tauri::command]
async fn create_identity(
    state: tauri::State<'_, AppState>,
    _name: String, // Display name will be set separately via metadata
    password: String,
) -> Result<IdentityInfo, String> {
    use std::process::Stdio;
    use tokio::process::Command;

    // Run: sw --testnet identity create --data-dir DATA_DIR_BASE
    // Note: CLI auto-appends network suffix to data-dir (swimchain -> swimchain-testnet)
    // Note: --name is not supported for identity create (it's a cryptographic operation)
    // Display name would be set later via identity metadata
    let output = Command::new(&state.binary_path)
        .arg("--testnet")
        .arg("identity")
        .arg("create")
        .arg("--data-dir")
        .arg(&state.data_dir_base) // Pass base path, CLI adds -testnet suffix
        .env("SWIMCHAIN_PASSWORD", &password)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run identity create: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Failed to create identity: {} {}", stderr, stdout));
    }

    // Now check the identity was created
    check_identity(state).await
}

#[tauri::command]
async fn take_screenshot(
    state: tauri::State<'_, AppState>,
    window: tauri::Window,
    label: String,
) -> Result<String, String> {
    use screenshots::Screen;

    // Bring window to focus before capturing
    window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;

    // Small delay to ensure window is rendered in foreground
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Get window position and size
    let pos = window.outer_position().map_err(|e| format!("Failed to get window position: {}", e))?;
    let size = window.outer_size().map_err(|e| format!("Failed to get window size: {}", e))?;

    // Get the screen that contains this window
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    let screen = screens.first().ok_or("No screens found")?;

    // Capture just the window area
    let image = screen.capture_area(
        pos.x,
        pos.y,
        size.width,
        size.height,
    ).map_err(|e| format!("Failed to capture: {}", e))?;

    // Generate filename with timestamp and label
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let safe_label = label.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
    let filename = format!("screenshot_{}_{}.png", timestamp, safe_label);
    let path = state.data_dir.join(&filename);

    std::fs::create_dir_all(&state.data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    // Save as PNG
    image.save(&path).map_err(|e| format!("Failed to save screenshot: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
struct NodeStatus {
    running: bool,
    rpc_port: u16,
    peer_count: usize,
    network: String,
}

#[derive(serde::Serialize)]
struct IdentityInfo {
    exists: bool,
    name: Option<String>,
    address: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::encode_cs_address;

    /// Vectors generated with an independent BIP-350 reference implementation
    /// of Bech32m (hrp "cs", payload = 0x00 version byte || 32-byte pubkey),
    /// matching the node's encode_address_from_pubkey (src/crypto/address.rs).
    #[test]
    fn encodes_known_vectors() {
        assert_eq!(
            encode_cs_address(&[0xAB; 32]).unwrap(),
            "cs1qz46h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46kfp5fks"
        );
        let sequential: Vec<u8> = (0..32).collect();
        assert_eq!(
            encode_cs_address(&sequential).unwrap(),
            "cs1qqqqzqsrqszsvpcgpy9qkrqdpc83qygjzv2p29shrqv35xcur50p7wdd7la"
        );
        assert_eq!(
            encode_cs_address(&[0x00; 32]).unwrap(),
            "cs1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0x36sr"
        );
    }

    #[test]
    fn rejects_bad_length() {
        assert!(encode_cs_address(&[0u8; 20]).is_err());
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Get the path to the bundled sw binary
            let resource_path = app_handle
                .path()
                .resource_dir()
                .map_err(|e| format!("Failed to get resource directory: {}. Please reinstall the application.", e))?;

            #[cfg(target_os = "windows")]
            let binary_name = "sw.exe";
            #[cfg(not(target_os = "windows"))]
            let binary_name = "sw";

            let binary_path = resource_path.join("binaries").join(binary_name);

            // Get data directory for node storage
            // Note: CLI auto-appends network suffix, so we pass "swimchain" and it becomes "swimchain-testnet"
            // But for check_identity, we need the ACTUAL path where files are stored
            // Use config_dir() (AppData/Roaming on Windows) to match CLI default behavior
            let base_data_dir = dirs::config_dir()
                .ok_or_else(|| "Failed to get config directory. Please ensure your system has a valid config directory.".to_string())?;

            let data_dir_base = base_data_dir.join("swimchain");

            // The actual path with network suffix (what CLI creates)
            let data_dir = base_data_dir.join("swimchain-testnet");

            // Create node manager
            // Pass the BASE path (without -testnet) because CLI auto-appends the network suffix
            let node_manager = NodeManager::new(
                binary_path.clone(),
                data_dir_base.clone(), // Pass base path, CLI adds -testnet suffix
                "testnet".to_string(), // Default to testnet for now
            );

            let state = AppState {
                node_manager: Arc::new(Mutex::new(node_manager)),
                binary_path,
                data_dir,           // With -testnet suffix (for check_identity)
                data_dir_base,      // Without suffix (for CLI commands)
                cached_cookie: Arc::new(Mutex::new(None)), // Will be populated on first get_rpc_auth call
            };

            app.manage(state);

            // Node will be started by frontend after identity check
            // See App.tsx: check_identity -> onboarding if needed -> start_node

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_node_status,
            start_node,
            stop_node,
            get_rpc_endpoint,
            get_rpc_auth,
            get_log_file_path,
            get_data_dir,
            write_client_log,
            check_identity,
            create_identity,
            take_screenshot,
        ])
        .on_window_event(|window, event| {
            // Stop node when app closes
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
            eprintln!("Failed to start Swimchain: {}", e);
            std::process::exit(1);
        });
}
