//! Cross-app navigation (launcher side).
//!
//! Each app runs in its own window/process, so a client that wants to open
//! content in ANOTHER app (e.g. search → forum thread) can't switch clients the
//! way the old monolithic shell did. Instead the app writes a request file into
//! the shared node data dir; the launcher polls it here, drops a per-target route
//! file the target app polls, and ensures the target app is running.
//!
//! Files (all in the node data dir shared by launcher + apps):
//!   `.nav_request`      JSON `{ "app": "forum", "path": "/spaces/.../thread/..." }`
//!   `.route_<app>`      the pending route for `<app>` (consumed by that app-shell)

use crate::AppState;
use std::path::Path;
use std::time::Duration;
use tauri::Manager;

#[derive(serde::Deserialize)]
struct NavRequest {
    app: String,
    path: String,
}

fn is_safe_app_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Read, consume (delete), parse, and validate a pending `.nav_request`, then drop
/// the per-target `.route_<app>` file the target app-shell polls. Returns the target
/// app id on success so the caller can ensure that app is running. Pure file I/O —
/// no Tauri — so it can be unit-tested.
fn process_nav_request(data_dir: &Path) -> Option<String> {
    let req_path = data_dir.join(".nav_request");
    let raw = std::fs::read_to_string(&req_path).ok()?;
    // Consume first so a malformed request can't wedge the poll loop.
    let _ = std::fs::remove_file(&req_path);

    let req: NavRequest = match serde_json::from_str(&raw) {
        Ok(r) => r,
        Err(e) => {
            log::warn!("[nav] bad .nav_request: {e}");
            return None;
        }
    };
    // app id lands in a filename — keep it to a safe charset.
    if !is_safe_app_id(&req.app) {
        log::warn!("[nav] rejected unsafe app id: {:?}", req.app);
        return None;
    }
    let route_file = data_dir.join(format!(".route_{}", req.app));
    if let Err(e) = std::fs::write(&route_file, req.path.as_bytes()) {
        log::warn!("[nav] write {route_file:?} failed: {e}");
        return None;
    }
    Some(req.app)
}

/// Poll `<data_dir>/.nav_request` forever, routing each request to the target app.
pub async fn run_nav_poller(app: tauri::AppHandle) {
    loop {
        tokio::time::sleep(Duration::from_millis(300)).await;

        let data_dir = {
            let state = app.state::<AppState>();
            state.current_data_dir().await
        };
        if let Some(target) = process_nav_request(&data_dir) {
            // Make sure the target app is running so it picks the route up.
            if let Err(e) = crate::launch_app_internal(&app, &target).await {
                log::warn!("[nav] launch '{}' failed: {e}", target);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_app_id_charset() {
        assert!(is_safe_app_id("forum"));
        assert!(is_safe_app_id("feed-2"));
        assert!(!is_safe_app_id(""));
        assert!(!is_safe_app_id("../etc"));
        assert!(!is_safe_app_id("Forum")); // uppercase rejected
        assert!(!is_safe_app_id("a/b"));
    }

    #[test]
    fn processes_request_into_route_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(".nav_request"),
            r#"{"app":"forum","path":"/spaces/x/thread/y"}"#,
        )
        .unwrap();

        let target = process_nav_request(dir.path());
        assert_eq!(target.as_deref(), Some("forum"));
        // request consumed
        assert!(!dir.path().join(".nav_request").exists());
        // route dropped for the target
        let route = std::fs::read_to_string(dir.path().join(".route_forum")).unwrap();
        assert_eq!(route, "/spaces/x/thread/y");
    }

    #[test]
    fn rejects_unsafe_app_and_consumes_request() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(".nav_request"),
            r#"{"app":"../evil","path":"/x"}"#,
        )
        .unwrap();
        assert_eq!(process_nav_request(dir.path()), None);
        // still consumed so it can't wedge the loop
        assert!(!dir.path().join(".nav_request").exists());
        assert!(!dir.path().join(".route_../evil").exists());
    }

    #[test]
    fn no_request_is_none() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(process_nav_request(dir.path()), None);
    }
}
