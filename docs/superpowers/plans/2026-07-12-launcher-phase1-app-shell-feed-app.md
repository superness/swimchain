# Launcher Phase 1: app-shell + feed-app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a reusable Tauri **`app-shell`** and produce **`feed-app`** — a standalone window that, given `--data-dir`, reads the node's `.rpc_addr`/`.cookie`, embeds feed-client, and runs against the launcher's node — plus a minimal launcher command that spawns it. This is Phase 1 of the launcher decoupling (see spec `docs/superpowers/specs/2026-07-12-swimchain-launcher-app-architecture-design.md`).

**Architecture:** `app-shell` is a thin Tauri 2 app whose Rust side reads `<data-dir>/.rpc_addr` + `<data-dir>/.cookie` and exposes them to its own webview; the webview embeds a bundled client (feed-client `dist`) in an **iframe** and `postMessage`s `SWIMCHAIN_RPC_CONFIG` — reusing feed-client's existing `useParentRpcConfig` path with no client change. Each app is a standalone exe built from this shell + one client bundle + an `app.json` manifest. The launcher spawns `feed-app --data-dir <dir>`.

**Tech Stack:** Rust, Tauri 2 (`tauri-plugin-shell`, `serde`, `tokio`), TypeScript/Vite (client bundles), PowerShell/bash build scripts.

## Global Constraints

- Tauri version: **2** (match `desktop-app/src-tauri/Cargo.toml`: `tauri = "2"`).
- The identity seed never leaves the node; apps authenticate with the node **cookie** (`__cookie__:<cookie>` Basic auth) and sign via the `sign_message` RPC. Apps contain **no** node.
- RPC handoff is **pull**: the launcher passes only `--data-dir <dir>`; the app reads `.rpc_addr` + `.cookie` itself (mirror `src/cli/commands/mod.rs::require_running_node_for_config`). Never put the cookie on argv/env.
- Manifest contract is fixed by the spec: `app.json` = `{ id, name, icon?, exec, version?, deeplink?, singleInstance? }`.
- Follow existing desktop-app patterns; reuse `desktop-app/src-tauri` code rather than reinventing (this phase EXTRACTS, it does not rewrite the node).
- Windows is the primary target (`.exe`); keep paths OS-agnostic (`std::path`, no hardcoded separators).

## File structure (created/modified in this phase)

- Create `launcher-apps/app-shell/` — the shared Tauri app-shell (Rust + minimal web frontend).
  - `app-shell/src-tauri/Cargo.toml`, `tauri.conf.json`, `build.rs`, `src/main.rs`, `src/rpc_handoff.rs`, `src/manifest.rs`
  - `app-shell/web/index.html`, `app-shell/web/embed.js` — the iframe host that posts `SWIMCHAIN_RPC_CONFIG`
- Create `launcher-apps/feed/app.json` — the feed app manifest.
- Modify `desktop-app/src-tauri/src/` — add a `supervisor.rs` module + a `launch_app` command (minimal; full registry/grid is Phase 2).
- Modify `desktop-app/build.ps1` — build `feed-app` from the shell + feed-client dist into `launcher-apps/feed/`.

> Rationale for `launcher-apps/` as a new top-level dir: apps are their own build artifacts, not part of the launcher crate; keeping them separate makes the drop-in `apps/` tree (Phase 2) a straight copy.

---

### Task 1: Manifest type + parser (`app.json`)

**Files:**
- Create: `launcher-apps/app-shell/src-tauri/src/manifest.rs`
- Test: same file, `#[cfg(test)] mod tests`

**Interfaces:**
- Produces: `pub struct AppManifest { pub id: String, pub name: String, pub icon: Option<String>, pub exec: String, pub version: Option<String>, pub deeplink: Option<String>, pub single_instance: bool }` and `pub fn parse_manifest(json: &str) -> Result<AppManifest, String>`. Consumed by the launcher supervisor (Task 5) and Phase 2 registry.

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_full_manifest_and_defaults_single_instance() {
        let json = r#"{"id":"feed","name":"Swimchain Feed","icon":"icon.png",
            "exec":"feed-app.exe","version":"0.1.0","deeplink":"swim+feed"}"#;
        let m = parse_manifest(json).unwrap();
        assert_eq!(m.id, "feed");
        assert_eq!(m.name, "Swimchain Feed");
        assert_eq!(m.exec, "feed-app.exe");
        assert_eq!(m.deeplink.as_deref(), Some("swim+feed"));
        assert!(m.single_instance, "single_instance defaults to true when omitted");
    }

    #[test]
    fn rejects_missing_required_fields() {
        assert!(parse_manifest(r#"{"name":"x","exec":"y"}"#).is_err(), "missing id");
        assert!(parse_manifest(r#"{"id":"x","exec":"y"}"#).is_err(), "missing name");
        assert!(parse_manifest(r#"{"id":"x","name":"y"}"#).is_err(), "missing exec");
        assert!(parse_manifest("not json").is_err());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd launcher-apps/app-shell/src-tauri && cargo test manifest`
Expected: FAIL — `parse_manifest` / `AppManifest` not found.

- [ ] **Step 3: Write minimal implementation**

```rust
use serde::Deserialize;

fn default_true() -> bool { true }

#[derive(Debug, Clone, Deserialize)]
pub struct AppManifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub exec: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub deeplink: Option<String>,
    #[serde(default = "default_true", rename = "singleInstance")]
    pub single_instance: bool,
}

/// Parse an `app.json` manifest. `id`, `name`, `exec` are required (serde errors if absent).
pub fn parse_manifest(json: &str) -> Result<AppManifest, String> {
    serde_json::from_str::<AppManifest>(json).map_err(|e| e.to_string())
}
```

Ensure `serde` (derive) and `serde_json` are in `Cargo.toml` (added in Task 2).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test manifest`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add launcher-apps/app-shell/src-tauri/src/manifest.rs
git commit -m "feat(app-shell): app.json manifest type + parser"
```

---

### Task 2: app-shell Tauri crate scaffold + RPC-handoff module

**Files:**
- Create: `launcher-apps/app-shell/src-tauri/Cargo.toml`, `build.rs`, `src/main.rs`, `src/rpc_handoff.rs`
- Test: `rpc_handoff.rs` `#[cfg(test)] mod tests`

**Interfaces:**
- Consumes: `manifest.rs` (Task 1).
- Produces: `pub struct RpcHandoff { pub endpoint: String, pub cookie: String }` and `pub fn read_handoff(data_dir: &std::path::Path) -> Result<RpcHandoff, String>` (reads `.rpc_addr` + `.cookie`, builds `http://<addr>`). Consumed by `main.rs` command `get_rpc_config`.

- [ ] **Step 1: Write the failing test** (`rpc_handoff.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_addr_and_cookie_into_endpoint() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".rpc_addr"), "127.0.0.1:19736\n").unwrap();
        std::fs::write(dir.path().join(".cookie"), "secretcookie").unwrap();
        let h = read_handoff(dir.path()).unwrap();
        assert_eq!(h.endpoint, "http://127.0.0.1:19736");
        assert_eq!(h.cookie, "secretcookie");
    }
    #[test]
    fn errors_when_node_not_running() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_handoff(dir.path()).is_err(), "missing .rpc_addr => node not ready");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test rpc_handoff`
Expected: FAIL — `read_handoff` not found.

- [ ] **Step 3: Write minimal implementation** (`rpc_handoff.rs`)

```rust
use std::path::Path;

#[derive(Debug, Clone)]
pub struct RpcHandoff {
    pub endpoint: String,
    pub cookie: String,
}

/// Read the node's RPC address + cookie from `data_dir` (the same files the CLI uses).
/// Fails when the node isn't running yet (marker files absent).
pub fn read_handoff(data_dir: &Path) -> Result<RpcHandoff, String> {
    let addr = std::fs::read_to_string(data_dir.join(".rpc_addr"))
        .map_err(|_| "node not running: .rpc_addr missing".to_string())?;
    let cookie = std::fs::read_to_string(data_dir.join(".cookie"))
        .map_err(|_| "node not running: .cookie missing".to_string())?;
    Ok(RpcHandoff {
        endpoint: format!("http://{}", addr.trim()),
        cookie: cookie.trim().to_string(),
    })
}
```

- [ ] **Step 4: Create the crate manifest + entrypoint so it compiles**

`Cargo.toml`:
```toml
[package]
name = "app-shell"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[dev-dependencies]
tempfile = "3.10"

[features]
custom-protocol = ["tauri/custom-protocol"]
```

`build.rs`:
```rust
fn main() { tauri_build::build(); }
```

`src/main.rs` (minimal, expanded in Task 3):
```rust
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]
mod manifest;
mod rpc_handoff;

fn main() {
    // Full Tauri wiring is added in Task 3; keep a valid entrypoint for now.
    println!("app-shell placeholder");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test`
Expected: PASS (manifest + rpc_handoff tests).

- [ ] **Step 6: Commit**

```bash
git add launcher-apps/app-shell/src-tauri/
git commit -m "feat(app-shell): crate scaffold + .rpc_addr/.cookie handoff reader"
```

---

### Task 3: app-shell Tauri wiring — `--data-dir` arg, `get_rpc_config` command, embed frontend

**Files:**
- Modify: `launcher-apps/app-shell/src-tauri/src/main.rs`
- Create: `launcher-apps/app-shell/src-tauri/tauri.conf.json`
- Create: `launcher-apps/app-shell/web/index.html`, `launcher-apps/app-shell/web/embed.js`

**Interfaces:**
- Produces: a runnable window. Tauri command `get_rpc_config() -> Result<RpcConfigDto, String>` returning `{ endpoint, auth (base64 "__cookie__:cookie"), nodeAddress, nodeDisplayName }`. The frontend calls it and posts `SWIMCHAIN_RPC_CONFIG` into the embedded client iframe.

- [ ] **Step 1: Implement `main.rs`** (parse `--data-dir`, expose `get_rpc_config`)

```rust
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
```

Add deps to `Cargo.toml`: `base64 = "0.22"`, `dirs = "5"`.

- [ ] **Step 2: Create `tauri.conf.json`** (adapt from `desktop-app/src-tauri/tauri.conf.json`)

Copy `desktop-app/src-tauri/tauri.conf.json`, then change: `productName` → `"Swimchain Feed"` (placeholder; templated per-app in Task 6), `identifier` → `"io.swimchain.app.feed"`, `build.frontendDist` → `"../web"` (points at `app-shell/web`), `build.devUrl`/`beforeBuildCommand` removed (static frontend, no Vite for the shell itself), and a single `app.windows[0]` with `{ "title": "Swimchain Feed", "width": 1200, "height": 800 }`. Keep the CSP permissive enough to allow the embedded client iframe and `http://127.0.0.1:*` XHR (copy the `security.csp` from desktop-app, which already allows the clients).

- [ ] **Step 3: Create the embed frontend** (`web/index.html` + `web/embed.js`)

`web/index.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Swimchain App</title>
    <style>html,body,iframe{margin:0;height:100%;width:100%;border:0}</style>
  </head>
  <body>
    <iframe id="client" src="./client/index.html"></iframe>
    <script type="module" src="./embed.js"></script>
  </body>
</html>
```

`web/embed.js` (reads config from Tauri, posts it to the client iframe — mirrors `desktop-app/src/components/ClientFrame.tsx`):
```js
const { invoke } = window.__TAURI__.core;
const iframe = document.getElementById('client');

async function pushConfig() {
  try {
    const cfg = await invoke('get_rpc_config');
    iframe.contentWindow?.postMessage({
      type: 'SWIMCHAIN_RPC_CONFIG',
      rpcEndpoint: cfg.endpoint,
      rpcAuth: cfg.auth,
      nodeAddress: cfg.nodeAddress,
      nodeDisplayName: cfg.nodeDisplayName,
    }, '*');
  } catch (e) {
    console.warn('[app-shell] node not ready:', e);
  }
}
// Client asks for config on load; also push every 1s for 10s like the desktop shell.
iframe.addEventListener('load', pushConfig);
let n = 0; const t = setInterval(() => { pushConfig(); if (++n >= 10) clearInterval(t); }, 1000);
```

> The client bundle is expected at `web/client/` — the build (Task 6) copies feed-client `dist` there. `enableTauri` in tauri.conf must allow `invoke`.

- [ ] **Step 4: Verify it builds**

Run: `cd launcher-apps/app-shell/src-tauri && cargo build`
Expected: compiles (frontend is static; no Vite step). A full `tauri build` is exercised in Task 6.

- [ ] **Step 5: Commit**

```bash
git add launcher-apps/app-shell/
git commit -m "feat(app-shell): --data-dir arg, get_rpc_config command, iframe embed frontend"
```

---

### Task 4: feed app manifest

**Files:**
- Create: `launcher-apps/feed/app.json`

- [ ] **Step 1: Write the manifest**

```json
{
  "id": "feed",
  "name": "Swimchain Feed",
  "icon": "icon.png",
  "exec": "feed-app.exe",
  "version": "0.1.0",
  "deeplink": "swim+feed",
  "singleInstance": true
}
```

- [ ] **Step 2: Validate it parses** (reuse Task 1)

Add a test in `manifest.rs`:
```rust
#[test]
fn feed_manifest_file_parses() {
    let json = include_str!("../../../feed/app.json");
    let m = parse_manifest(json).unwrap();
    assert_eq!(m.id, "feed");
    assert_eq!(m.exec, "feed-app.exe");
}
```
Run: `cargo test feed_manifest_file_parses` → PASS.

- [ ] **Step 3: Commit**

```bash
git add launcher-apps/feed/app.json launcher-apps/app-shell/src-tauri/src/manifest.rs
git commit -m "feat(feed): app.json manifest + parse test"
```

---

### Task 5: Launcher supervisor — spawn an app by manifest

**Files:**
- Create: `desktop-app/src-tauri/src/supervisor.rs`
- Modify: `desktop-app/src-tauri/src/main.rs` (register module + `launch_app` command)
- Test: `supervisor.rs` `#[cfg(test)] mod tests`

**Interfaces:**
- Consumes: the node data-dir path (from the existing `AppState`/`node_manager`); an app's `exec` absolute path.
- Produces: `pub struct Supervisor { /* Mutex<HashMap<String, Child>> */ }` with `pub fn launch(&self, app_id: &str, exec: &Path, data_dir: &Path, single_instance: bool) -> Result<(), String>` (spawns `exec --data-dir <dir>`; if `single_instance` and a live child exists for `app_id`, no-op). Tauri command `launch_app(app_id)` resolves the manifest under `launcher-apps/<id>/app.json` (dev) or the bundled `apps/` dir (prod) and calls it.

- [ ] **Step 1: Write the failing test** (spawn a trivial process, assert tracked; single-instance no-ops)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    // Use the OS "sleep-like" no-op: on all platforms `std::process::Command` can run the
    // Rust test binary is overkill; instead spawn a portable long-lived process.
    #[cfg(windows)]
    const NOOP: (&str, &[&str]) = ("cmd", &["/C", "ping", "127.0.0.1", "-n", "30"]);
    #[cfg(not(windows))]
    const NOOP: (&str, &[&str]) = ("sleep", &["30"]);

    #[test]
    fn launch_tracks_child_and_single_instance_noops() {
        let sup = Supervisor::new();
        let dir = tempfile::tempdir().unwrap();
        // spawn_raw is a test seam that runs an arbitrary command instead of exec.
        sup.spawn_raw("feed", NOOP.0, NOOP.1, dir.path()).unwrap();
        assert!(sup.is_running("feed"));
        // single-instance: second launch must NOT spawn a new child.
        let before = sup.running_count();
        sup.spawn_raw_single("feed", NOOP.0, NOOP.1, dir.path(), true).unwrap();
        assert_eq!(sup.running_count(), before, "single_instance should no-op");
        sup.kill_all();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop-app/src-tauri && cargo test supervisor`
Expected: FAIL — `Supervisor` not found.

- [ ] **Step 3: Write minimal implementation** (`supervisor.rs`)

```rust
use std::collections::HashMap;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::Mutex;

pub struct Supervisor {
    children: Mutex<HashMap<String, Child>>,
}

impl Supervisor {
    pub fn new() -> Self { Self { children: Mutex::new(HashMap::new()) } }

    /// Live == process hasn't exited. Reaps exited children lazily.
    pub fn is_running(&self, app_id: &str) -> bool {
        let mut map = self.children.lock().unwrap();
        if let Some(child) = map.get_mut(app_id) {
            match child.try_wait() {
                Ok(Some(_)) => { map.remove(app_id); false } // exited
                Ok(None) => true,                             // still running
                Err(_) => true,
            }
        } else { false }
    }

    pub fn running_count(&self) -> usize {
        let ids: Vec<String> = self.children.lock().unwrap().keys().cloned().collect();
        ids.into_iter().filter(|id| self.is_running(id)).count()
    }

    /// Spawn `program args... --data-dir <dir>` and track it under `app_id`.
    pub fn spawn_raw(&self, app_id: &str, program: &str, args: &[&str], data_dir: &Path) -> Result<(), String> {
        let child = Command::new(program)
            .args(args)
            .arg("--data-dir").arg(data_dir)
            .spawn().map_err(|e| e.to_string())?;
        self.children.lock().unwrap().insert(app_id.to_string(), child);
        Ok(())
    }

    /// Single-instance-aware spawn: no-op if already running.
    pub fn spawn_raw_single(&self, app_id: &str, program: &str, args: &[&str], data_dir: &Path, single: bool) -> Result<(), String> {
        if single && self.is_running(app_id) { return Ok(()); }
        self.spawn_raw(app_id, program, args, data_dir)
    }

    /// Public API: launch an app executable.
    pub fn launch(&self, app_id: &str, exec: &Path, data_dir: &Path, single_instance: bool) -> Result<(), String> {
        let program = exec.to_string_lossy().to_string();
        self.spawn_raw_single(app_id, &program, &[], data_dir, single_instance)
    }

    pub fn kill_all(&self) {
        for (_, mut c) in self.children.lock().unwrap().drain() { let _ = c.kill(); }
    }
}

impl Default for Supervisor { fn default() -> Self { Self::new() } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test supervisor`
Expected: PASS.

- [ ] **Step 5: Wire the `launch_app` Tauri command** (`main.rs`)

Add `mod supervisor;`, put a `Supervisor` in the managed app state, and:
```rust
#[tauri::command]
async fn launch_app(state: tauri::State<'_, AppStateHandle>, app_id: String) -> Result<(), String> {
    // Resolve manifest dir: dev = <repo>/launcher-apps/<id>; prod = <resource_dir>/apps/<id>.
    let app_dir = resolve_app_dir(&app_id)?;                // helper: dev vs bundled
    let manifest_json = std::fs::read_to_string(app_dir.join("app.json")).map_err(|e| e.to_string())?;
    let m = crate::app_manifest::parse_manifest(&manifest_json)?; // reuse Task 1 parser (see note)
    let exec = app_dir.join(&m.exec);
    let data_dir = state.current_data_dir();               // existing node data dir
    state.supervisor.launch(&m.id, &exec, &data_dir, m.single_instance)
}
```

> Note: the launcher reuses the manifest parser. To avoid duplicating it, add a tiny `app_manifest.rs` in the launcher that is a copy of `manifest.rs` OR (preferred) extract the manifest type into a shared crate in Phase 2. For Phase 1, copy `manifest.rs` into the launcher as `app_manifest.rs` and note the dedup as a Phase-2 task. `resolve_app_dir` returns `<repo>/launcher-apps/<id>` when `cfg!(debug_assertions)`, else `tauri::path resource_dir()/apps/<id>`.

Register `launch_app` in `invoke_handler` and add `kill_all()` on window-close if the "close apps on quit" setting is on (default off — leave running).

- [ ] **Step 6: Run the launcher build**

Run: `cd desktop-app/src-tauri && cargo build`
Expected: compiles.

- [ ] **Step 7: Commit**

```bash
git add desktop-app/src-tauri/src/supervisor.rs desktop-app/src-tauri/src/app_manifest.rs desktop-app/src-tauri/src/main.rs
git commit -m "feat(launcher): supervisor + launch_app command (spawn app by manifest)"
```

---

### Task 6: Build `feed-app` from the shell + feed-client dist

**Files:**
- Modify: `desktop-app/build.ps1` (add a "build apps" step)
- Create: `launcher-apps/feed/icon.png` (copy an existing feed-client icon)

**Interfaces:**
- Produces: `launcher-apps/feed/feed-app.exe` next to `app.json`, ready for the supervisor to spawn.

- [ ] **Step 1: Add the build step** (PowerShell) — build feed-client, stage it into the shell, `tauri build`, copy the exe

```powershell
Write-Step "Building feed-app (app-shell + feed-client)"
# 1. feed-client web bundle
Push-Location "$ProjectRoot/feed-client"; npm run build; Pop-Location
# 2. stage the client into the shell's web/client
$shellWeb = "$ProjectRoot/launcher-apps/app-shell/web/client"
Remove-Item -Recurse -Force $shellWeb -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $shellWeb | Out-Null
Copy-Item -Recurse "$ProjectRoot/feed-client/dist/*" $shellWeb
# 3. build the shell exe (release)
Push-Location "$ProjectRoot/launcher-apps/app-shell/src-tauri"
cargo build --release
Pop-Location
# 4. place the exe next to the manifest as feed-app.exe
Copy-Item "$ProjectRoot/launcher-apps/app-shell/src-tauri/target/release/app-shell.exe" `
          "$ProjectRoot/launcher-apps/feed/feed-app.exe" -Force
Write-Success "feed-app.exe built"
```

> The shell exe is generic (`app-shell.exe`); per-app identity/title differences (productName, window title) are cosmetic in Phase 1 and templated in Phase 2. Phase 1 ships one shell binary copied to `feed-app.exe`.

- [ ] **Step 2: Run the app build**

Run: `pwsh desktop-app/build.ps1 -SkipNode -SkipWasm` (node/clients unaffected; this exercises the new step)
Expected: `launcher-apps/feed/feed-app.exe` exists.

- [ ] **Step 3: Commit**

```bash
git add desktop-app/build.ps1 launcher-apps/feed/icon.png
git commit -m "build: produce feed-app.exe from app-shell + feed-client"
```

---

### Task 7: End-to-end smoke — launcher spawns feed-app, feed-app reaches the node

**Files:**
- Create: `docs/superpowers/plans/notes/phase1-smoke.md` (manual smoke steps recorded as the test artifact; no framework exists for GUI e2e here)

**Interfaces:** none (verification task).

- [ ] **Step 1: Write the smoke procedure**

```md
1. Start the node via the launcher (or `sw --testnet --data-dir <DD> node start`) so
   <DD>/.rpc_addr and <DD>/.cookie exist.
2. Run: launcher-apps/feed/feed-app.exe --data-dir <DD>
3. Expect: a window titled "Swimchain Feed" showing the feed UI (not the browser-keypair
   onboarding) — i.e. it received SWIMCHAIN_RPC_CONFIG and is in node mode.
4. In the feed UI, confirm the node identity/address shows and a feed load succeeds
   (an authenticated list_spaces round-trip).
5. Stop the node; feed-app should show the "node not ready" state and recover when
   restarted (embed.js retries for 10s).
```

- [ ] **Step 2: Run the smoke manually and record the result** (paste actual outcome into the file). If node mode doesn't engage, check: iframe `src` resolves to `./client/index.html`, `get_rpc_config` returns a valid endpoint, and the client origin is allowed by `useParentRpcConfig`'s `ALLOWED_ORIGINS`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/notes/phase1-smoke.md
git commit -m "test(launcher): phase-1 e2e smoke procedure + result"
```

---

## Self-review

- **Spec coverage (Phase 1 slice):** app-shell ✓ (Tasks 2–3), manifest contract ✓ (Task 1/4), `.rpc_addr`/`.cookie` handoff ✓ (Task 2), separate-process launch ✓ (Task 5), standalone exe packaging ✓ (Task 6), node-not-ready state ✓ (Task 3 embed retry + Task 7 smoke). Registry-scan-of-a-dir, deep-link routing, the app grid UI, and migrating the other 4 clients are explicitly **Phase 2+** (below).
- **Placeholders:** none — every code step has full code; the only "adapt from existing" is `tauri.conf.json` (Task 3 Step 2), with the exact fields to change listed.
- **Type consistency:** `AppManifest`/`parse_manifest` (Task 1) reused in Tasks 4 & 5; `read_handoff`/`RpcHandoff` (Task 2) consumed by `get_rpc_config` (Task 3); `Supervisor::launch` (Task 5) matches its test seams `spawn_raw*`. The `SWIMCHAIN_RPC_CONFIG` fields (`rpcEndpoint`, `rpcAuth`, `nodeAddress`, `nodeDisplayName`) match `desktop-app/src/components/ClientFrame.tsx` and feed-client's `useParentRpcConfig`.

## Phases 2–5 (separate plans, written against Phase 1's real code)

- **Phase 2 — Launcher core:** registry module (scan `launcher-apps/*/app.json` → grid), replace the iframe switcher UI with an app grid + node-status home, wire `launch_app` to the grid, dedup the manifest type into a shared crate, per-app shell templating (productName/title/icon).
- **Phase 3 — Migrate remaining clients:** `chat/forum/search/wiki` → `<id>-app` via the shell + build steps.
- **Phase 4 — Deep-link routing:** move `swim://` ownership to the launcher; resolve target app by manifest; forward `--deeplink`.
- **Phase 5 — Remove old embedding:** delete the iframe-embedding path from the old shell; installer bundles launcher + `apps/` only.
