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

/// Last window geometry the user left this app at (logical px).
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy)]
struct WindowGeom {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

/// Per-app window-state file: keyed by --app-id (falls back to the exe stem
/// so dev runs without the launcher still get their own slot).
fn window_state_path(app_id: &str) -> PathBuf {
    let key = if app_id.is_empty() {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().into_owned()))
            .unwrap_or_else(|| "app".to_string())
    } else {
        app_id.to_string()
    };
    dirs::config_dir()
        .unwrap_or_default()
        .join("swimchain")
        .join("app-windows")
        .join(format!("{key}.json"))
}

fn load_window_geom(path: &PathBuf) -> Option<WindowGeom> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn save_window_geom(path: &PathBuf, g: &WindowGeom) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(g) {
        let _ = std::fs::write(path, json);
    }
}

/// True if the saved top-left lands on (or near) some connected monitor — a
/// remembered position from an unplugged monitor must not open off-screen.
fn geom_visible(win: &tauri::WebviewWindow, g: &WindowGeom) -> bool {
    let Ok(monitors) = win.available_monitors() else {
        return false;
    };
    monitors.iter().any(|m| {
        let scale = m.scale_factor();
        let pos = m.position();
        let size = m.size();
        let (mx, my) = (pos.x as f64, pos.y as f64);
        let (mw, mh) = (size.width as f64, size.height as f64);
        let (px, py) = (g.x * scale, g.y * scale);
        // Top-left within the monitor, with a small tolerance margin.
        px >= mx - 50.0 && px < mx + mw - 100.0 && py >= my - 20.0 && py < my + mh - 100.0
    })
}

/// Open ON-SCREEN at a sane size: restore the user's last geometry when it is
/// still visible, otherwise size to ~min(1000x680, 80% of the monitor) and
/// center. Without this, Windows cascades each new 1200x800 window further
/// down-right until apps open half off the viewport.
fn apply_initial_geometry(win: &tauri::WebviewWindow, state_path: &PathBuf) {
    if let Some(g) = load_window_geom(state_path) {
        if g.w >= 300.0 && g.h >= 200.0 && geom_visible(win, &g) {
            let _ = win.set_size(tauri::LogicalSize::new(g.w, g.h));
            let _ = win.set_position(tauri::LogicalPosition::new(g.x, g.y));
            return;
        }
    }
    let (mut w, mut h) = (1000.0_f64, 680.0_f64);
    if let Ok(Some(m)) = win.current_monitor() {
        let scale = m.scale_factor();
        let avail_w = m.size().width as f64 / scale;
        let avail_h = m.size().height as f64 / scale;
        w = w.min(avail_w * 0.8);
        h = h.min(avail_h * 0.8);
    }
    let _ = win.set_size(tauri::LogicalSize::new(w, h));
    let _ = win.center();
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
    let state_path = window_state_path(&app_id);
    let state_path_for_setup = state_path.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(AppState { data_dir, app_id }))
        .invoke_handler(tauri::generate_handler![
            get_rpc_config,
            request_navigate,
            poll_route,
            focus_self
        ])
        .setup(move |app| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                apply_initial_geometry(&win, &state_path_for_setup);
            }
            Ok(())
        })
        .on_window_event(move |window, event| {
            // Remember where the user leaves the window (skip the minimized
            // sentinel position Windows reports, roughly -32000,-32000).
            if matches!(
                event,
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)
            ) {
                if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
                    if pos.x > -20000 && pos.y > -20000 && size.width > 200 && size.height > 150 {
                        let scale = window.scale_factor().unwrap_or(1.0);
                        let g = WindowGeom {
                            x: pos.x as f64 / scale,
                            y: pos.y as f64 / scale,
                            w: size.width as f64 / scale,
                            h: size.height as f64 / scale,
                        };
                        // Off the event thread: a drag emits a stream of Moved
                        // events and a sync write per event would stutter it.
                        let path = state_path.clone();
                        tauri::async_runtime::spawn(async move {
                            save_window_geom(&path, &g);
                        });
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running app-shell");
}
