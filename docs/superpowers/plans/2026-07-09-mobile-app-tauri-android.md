# Swimchain Mobile (Tauri v2 Android, In-Process Node) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `mobile-client/` with `mobile-app/`: a Tauri v2 Android app that runs the swimchain node in-process (linked as a Rust library), keeps it alive with an Android foreground service, and shows the existing feed-client in the WebView talking JSON-RPC to `127.0.0.1:19736`.

**Architecture:** The Tauri app's Rust core links `swimchain` as a path dependency and starts `NodeManager` on the Tauri async runtime at app launch (testnet). A Kotlin `NodeForegroundService` holds a `dataSync` notification to keep the process alive when backgrounded. A minimal React shell shows node status and embeds the bundled feed-client via iframe, handing it the RPC endpoint + cookie auth with the same `SWIMCHAIN_RPC_CONFIG` postMessage contract the desktop app uses.

**Tech Stack:** Rust (tauri 2, swimchain lib), Kotlin (foreground service), React 18 + Vite 5 + TypeScript (shell), cargo-ndk / Android NDK 25.1.8937393.

**Spec:** `docs/superpowers/specs/2026-07-09-mobile-app-tauri-android-design.md`

## Global Constraints

- Network: **testnet** — P2P port `19735`, RPC port `19736` (`NetworkMode::Testnet`, RPC = P2P + 1).
- App identifier: `com.swimchain.mobile`. Kotlin package: `com.swimchain.mobile`.
- Node data dir: `<tauri app_data_dir>/node`. Identity files inside it: `identity.enc` (CLI-compatible portable format) and `identity.pass` (random passphrase). The WebView never receives seed/private key material — only the RPC endpoint and cookie auth string.
- Root `Cargo.toml` must exclude `mobile-app/src-tauri` from the workspace (same as `desktop-app/src-tauri`).
- Android NDK path on this machine: `$env:LOCALAPPDATA\Android\Sdk\ndk\25.1.8937393`.
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).
- All PowerShell commands below run from `C:\github\swimchain` unless a `cd` is shown. PowerShell 5.1: no `&&` — use `;` or separate commands.
- Before any desktop-mode verification (`tauri dev` on Windows), stop any locally running testnet node (`scripts/node-manager.sh` or Task Manager `sw.exe`) — ports 19735/19736 would collide.

---

### Task 1: Toolchain setup + cross-compile spike

The single biggest unknown: does the `swimchain` lib compile for Android targets? Retire it before scaffolding anything.

**Files:**
- No repo files expected to change. If a dependency needs a feature-gate fix, modify root `Cargo.toml` and/or the affected `src/` module (smallest possible change) and commit it.

**Interfaces:**
- Consumes: nothing.
- Produces: installed Rust targets `aarch64-linux-android` + `x86_64-linux-android`, `cargo-ndk` on PATH, and proof the lib compiles for both.

- [ ] **Step 1: Install Rust Android targets and cargo-ndk**

Run:
```powershell
rustup target add aarch64-linux-android x86_64-linux-android
cargo install cargo-ndk
```
Expected: both commands succeed (`cargo ndk --version` prints a version afterward).

- [ ] **Step 2: Compile the swimchain lib for both Android targets**

Run:
```powershell
$env:ANDROID_NDK_HOME = "$env:LOCALAPPDATA\Android\Sdk\ndk\25.1.8937393"
cargo ndk -t arm64-v8a -t x86_64 build --lib
```
Expected: `Finished` for both targets (this compiles only the `swimchain` library crate, not the CLI binaries).

- [ ] **Step 3: If compilation fails, fix and re-run**

Diagnosis guide: identify the failing crate from the error. Likely categories:
- A crate using desktop-only APIs (e.g. `ctrlc` is a CLI dependency — it should not be in the `--lib` build; if it is, the fix is moving it behind the binary, not the lib).
- A crate needing an Android-specific feature flag: check its docs for an `android` feature.
Make the smallest change that unblocks the lib build. Re-run Step 2 until it passes.

- [ ] **Step 4: Commit (only if repo files changed)**

```powershell
git add -A
git commit -m "fix: make swimchain lib compile for Android targets"
```
If nothing changed, skip the commit.

---

### Task 2: Delete mobile-client, scaffold mobile-app (desktop-runnable Tauri v2 app)

**Files:**
- Delete: `mobile-client/` (entire directory)
- Modify: `Cargo.toml` (root, line 3: workspace `exclude`)
- Create: `mobile-app/package.json`
- Create: `mobile-app/vite.config.ts`
- Create: `mobile-app/tsconfig.json`
- Create: `mobile-app/index.html`
- Create: `mobile-app/src/main.tsx`
- Create: `mobile-app/src/App.tsx` (placeholder — real UI in Task 5)
- Create: `mobile-app/src-tauri/Cargo.toml`
- Create: `mobile-app/src-tauri/build.rs`
- Create: `mobile-app/src-tauri/tauri.conf.json`
- Create: `mobile-app/src-tauri/src/main.rs`
- Create: `mobile-app/src-tauri/src/lib.rs` (minimal — commands added in Task 4)
- Create: `mobile-app/src-tauri/icons/` (copied from desktop-app)
- Create: `mobile-app/.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `swimchain_mobile_lib::run()` (the Tauri entry point, extended in Task 4); a `mobile-app` npm project with scripts `dev`, `build:shell`, `tauri`.

- [ ] **Step 1: Remove the legacy mobile client and commit the deletion separately**

```powershell
git rm -r --cached mobile-client 2>$null; Remove-Item -Recurse -Force mobile-client
git commit -m "chore: remove legacy React Native mobile-client (replaced by mobile-app)"
```
Note: `mobile-client/node_modules` is untracked; `git rm -r mobile-client` alone can fail on it, hence the two-step. Verify with `git status` that no `mobile-client/` paths remain tracked.

- [ ] **Step 2: Exclude the new src-tauri crate from the root workspace**

In root `Cargo.toml`, change line 3:
```toml
exclude = ["desktop-app/src-tauri", "tools/dns-seeder", "mobile-app/src-tauri"]
```

- [ ] **Step 3: Create the npm shell project**

`mobile-app/package.json`:
```json
{
  "name": "swimchain-mobile",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "node scripts/build-clients.cjs && npm run build:shell",
    "build:shell": "tsc --noEmit && vite build",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```
(Note: `npm run build` references `scripts/build-clients.cjs`, created in Task 5. Until then use `build:shell`.)

`mobile-app/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5174, strictPort: true },
});
```

`mobile-app/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

`mobile-app/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Swimchain</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`mobile-app/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`mobile-app/src/App.tsx` (placeholder):
```tsx
export default function App() {
  return <div>Swimchain Mobile shell</div>;
}
```

`mobile-app/.gitignore`:
```
node_modules
dist
public/clients
```

- [ ] **Step 4: Create the Tauri crate**

`mobile-app/src-tauri/Cargo.toml`:
```toml
[workspace]

[package]
name = "swimchain-mobile"
version = "0.1.0"
description = "Swimchain Mobile - in-process node + feed client"
edition = "2021"

[lib]
name = "swimchain_mobile_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
base64 = "0.22"
rand = "0.8"
log = "0.4"
env_logger = "0.11"
swimchain = { path = "../.." }

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

`mobile-app/src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`mobile-app/src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Swimchain",
  "version": "0.1.0",
  "identifier": "com.swimchain.mobile",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5174",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{ "title": "Swimchain Mobile", "width": 420, "height": 800 }],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico",
      "icons/icon.png"
    ]
  }
}
```

`mobile-app/src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    swimchain_mobile_lib::run()
}
```

`mobile-app/src-tauri/src/lib.rs`:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running swimchain mobile");
}
```

Copy icons from the desktop app (check what exists first; the icon list in `tauri.conf.json` must match actual files — trim the list if some sizes are missing):
```powershell
Copy-Item -Recurse desktop-app\src-tauri\icons mobile-app\src-tauri\icons
Get-ChildItem mobile-app\src-tauri\icons
```
If desktop-app has no icons dir, generate them: `cd mobile-app; npx tauri icon` (uses default Tauri icon).

- [ ] **Step 5: Verify the scaffold builds**

```powershell
cd mobile-app
npm install
npm run build:shell
cd src-tauri
cargo check
```
Expected: vite build produces `mobile-app/dist/index.html`; `cargo check` passes (first run compiles the whole swimchain lib — several minutes).

- [ ] **Step 6: Commit**

```powershell
cd C:\github\swimchain
git add Cargo.toml mobile-app
git commit -m "feat(mobile): scaffold Tauri v2 mobile-app shell with swimchain lib dependency"
```

---

### Task 3: In-process node host (`node_host.rs`) with tests

**Files:**
- Create: `mobile-app/src-tauri/src/node_host.rs`
- Modify: `mobile-app/src-tauri/src/lib.rs` (add `mod node_host;` at top)
- Test: unit/integration tests inside `node_host.rs` (`#[cfg(test)]`)

**Interfaces:**
- Consumes: `swimchain::node::{NodeConfig, NodeManager}`, `swimchain::network::NetworkMode`, `swimchain::types::KeyPair`, `swimchain::identity::{create_identity_with_difficulty, export_identity, import_identity, serialize_portable, deserialize_portable}`.
- Produces (used by Task 4):
  - `node_host::start(data_dir: PathBuf, network: NetworkMode) -> Result<NodeHost, String>` (async)
  - `node_host::start_with_ports(data_dir: PathBuf, network: NetworkMode, p2p_port: u16, rpc_port: u16) -> Result<NodeHost, String>` (async)
  - `NodeHost::status(&self) -> swimchain::node::NodeStatus`
  - `NodeHost::stop(&mut self) -> Result<(), String>` (async)
  - `NodeHost::data_dir: PathBuf` (public field)
  - `node_host::rpc_auth_from_cookie(data_dir: &Path) -> Result<String, String>`
  - `node_host::ensure_identity(data_dir: &Path, pow_difficulty: u8) -> Result<KeyPair, String>`

- [ ] **Step 1: Write the failing tests**

Create `mobile-app/src-tauri/src/node_host.rs` with ONLY the test module first (the `use super::*` will fail to find the functions — that's the failing state):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use swimchain::network::NetworkMode;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("swim-mobile-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn identity_created_once_and_reloaded() {
        let dir = temp_dir("id");
        // Low difficulty (4) keeps identity PoW fast in tests.
        let kp1 = ensure_identity(&dir, 4).expect("create identity");
        let kp2 = ensure_identity(&dir, 4).expect("reload identity");
        assert_eq!(
            kp1.public_key.as_bytes(),
            kp2.public_key.as_bytes(),
            "second call must load the same identity, not create a new one"
        );
        assert!(dir.join("identity.enc").exists());
        assert!(dir.join("identity.pass").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn regtest_node_starts_writes_cookie_and_stops() {
        let dir = temp_dir("node");
        // Pre-create identity at low difficulty so start() loads it.
        ensure_identity(&dir, 4).expect("identity");

        // Non-default ports so a locally running regtest node can't collide.
        let mut host = start_with_ports(dir.clone(), NetworkMode::Regtest, 39735, 39736)
            .await
            .expect("node starts");

        // The RPC server writes .cookie on startup; poll briefly.
        let cookie = dir.join(".cookie");
        let mut waited = 0;
        while !cookie.exists() && waited < 100 {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            waited += 1;
        }
        assert!(cookie.exists(), "RPC server should write {}", cookie.display());

        let auth = rpc_auth_from_cookie(&dir).expect("auth string");
        assert!(auth.starts_with("Basic "), "got: {auth}");

        let status = host.status();
        assert!(status.uptime_seconds < 3600, "sane status: {:?}", status.state);

        host.stop().await.expect("node stops");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

Add `mod node_host;` as the first line of `mobile-app/src-tauri/src/lib.rs`.

- [ ] **Step 2: Run tests to verify they fail**

```powershell
cd mobile-app\src-tauri
cargo test
```
Expected: FAIL — compile errors, `ensure_identity`/`start_with_ports`/`rpc_auth_from_cookie` not found.

- [ ] **Step 3: Write the implementation (above the test module in the same file)**

```rust
//! In-process swimchain node lifecycle for the mobile app.
//!
//! Mirrors the CLI start path (src/cli/commands/node.rs) as a library call:
//! ensure an identity exists, build a NodeConfig, start NodeManager (which
//! brings up P2P, storage, and the RPC server on 127.0.0.1:<rpc_port>).

use std::path::{Path, PathBuf};

use swimchain::identity::{
    create_identity_with_difficulty, deserialize_portable, export_identity, import_identity,
    serialize_portable,
};
use swimchain::network::NetworkMode;
use swimchain::node::{NodeConfig, NodeManager};
use swimchain::types::KeyPair;

/// Production identity PoW difficulty (matches DEFAULT_IDENTITY_POW_DIFFICULTY
/// in src/identity/mod.rs). Creation is a one-time cost on first launch.
pub const IDENTITY_POW_DIFFICULTY: u8 = 20;

pub struct NodeHost {
    manager: NodeManager,
    pub data_dir: PathBuf,
}

/// Load the node identity from `<data_dir>/identity.enc`, creating it (plus a
/// random passphrase at `<data_dir>/identity.pass`) on first run.
///
/// The passphrase file sits beside the identity it decrypts; both live in
/// Android app-private storage, so they share a trust boundary. Keystore-backed
/// encryption is a hardening follow-up (out of scope per the spec).
/// `identity.enc` uses the CLI's portable format, so it is importable elsewhere.
pub fn ensure_identity(data_dir: &Path, pow_difficulty: u8) -> Result<KeyPair, String> {
    std::fs::create_dir_all(data_dir).map_err(|e| format!("create data dir: {e}"))?;
    let id_path = data_dir.join("identity.enc");
    let pass_path = data_dir.join("identity.pass");

    if id_path.exists() && pass_path.exists() {
        let pass =
            std::fs::read_to_string(&pass_path).map_err(|e| format!("read passphrase: {e}"))?;
        let data = std::fs::read(&id_path).map_err(|e| format!("read identity: {e}"))?;
        let portable =
            deserialize_portable(&data).map_err(|e| format!("parse identity: {e}"))?;
        let (keypair, _proof) = import_identity(&portable, pass.trim())
            .map_err(|e| format!("decrypt identity: {e}"))?;
        return Ok(keypair);
    }

    let pass: String = {
        use rand::Rng;
        rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect()
    };
    let (keypair, proof) = create_identity_with_difficulty(pow_difficulty);
    let portable = export_identity(&keypair, Some(&proof), &pass)
        .map_err(|e| format!("encrypt identity: {e}"))?;
    std::fs::write(&id_path, serialize_portable(&portable))
        .map_err(|e| format!("write identity: {e}"))?;
    std::fs::write(&pass_path, &pass).map_err(|e| format!("write passphrase: {e}"))?;
    Ok(keypair)
}

/// Start the node on the network's default ports.
pub async fn start(data_dir: PathBuf, network: NetworkMode) -> Result<NodeHost, String> {
    let p2p = network.default_port();
    let rpc = network.default_rpc_port();
    start_with_ports(data_dir, network, p2p, rpc).await
}

/// Start the node on explicit ports (tests use non-default ports to avoid
/// colliding with a locally running node).
pub async fn start_with_ports(
    data_dir: PathBuf,
    network: NetworkMode,
    p2p_port: u16,
    rpc_port: u16,
) -> Result<NodeHost, String> {
    let keypair = ensure_identity(&data_dir, IDENTITY_POW_DIFFICULTY)?;

    let mut config = NodeConfig::with_network_defaults(network);
    config.data_dir = data_dir.clone();
    config.listen_addr = format!("0.0.0.0:{p2p_port}")
        .parse()
        .map_err(|e| format!("listen addr: {e}"))?;
    config.rpc_port = Some(rpc_port);

    let mut manager =
        NodeManager::new(config, keypair).map_err(|e| format!("create node: {e}"))?;
    manager
        .start()
        .await
        .map_err(|e| format!("start node: {e}"))?;
    Ok(NodeHost { manager, data_dir })
}

impl NodeHost {
    pub fn status(&self) -> swimchain::node::NodeStatus {
        self.manager.status()
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        self.manager
            .stop()
            .await
            .map_err(|e| format!("stop node: {e}"))
    }
}

/// Read `<data_dir>/.cookie` and format it as an HTTP Basic auth header value.
/// Matches desktop-app's get_rpc_auth: base64("__cookie__:<cookie>").
pub fn rpc_auth_from_cookie(data_dir: &Path) -> Result<String, String> {
    use base64::Engine;
    let cookie_path = data_dir.join(".cookie");
    let cookie = std::fs::read_to_string(&cookie_path)
        .map_err(|e| format!("read cookie {}: {e}", cookie_path.display()))?;
    let credentials = format!("__cookie__:{}", cookie.trim());
    let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
    Ok(format!("Basic {encoded}"))
}
```

Note: `ensure_identity` in `start_with_ports` uses difficulty 20 only on first creation; the tests pre-create at difficulty 4 so `start_with_ports` loads instead of mining. If `create_identity_with_difficulty(20)` proves slow in later manual testing that's a UX note, not a correctness issue.

- [ ] **Step 4: Run tests to verify they pass**

```powershell
cd mobile-app\src-tauri
cargo test
```
Expected: both tests PASS. The node test starts a real regtest node in a temp dir (sled + RPC server); allow ~30-60s. If `identity_created_once_and_reloaded` fails on `pass.trim()` semantics or file naming, fix the implementation, not the test.

- [ ] **Step 5: Commit**

```powershell
cd C:\github\swimchain
git add mobile-app/src-tauri/src
git commit -m "feat(mobile): in-process node host - identity bootstrap, start/stop, cookie auth"
```

---

### Task 4: Tauri commands + node autostart

**Files:**
- Modify: `mobile-app/src-tauri/src/lib.rs` (full replacement below)

**Interfaces:**
- Consumes: everything `node_host` produces (Task 3).
- Produces (used by the shell in Task 5, via `invoke`):
  - `node_status() -> NodeStatusDto` — `{ running: bool, state: string, peers: number, chain_height: number, sync_percent: number, uptime_seconds: number, error: string | null }`
  - `get_rpc_auth() -> string` — `"Basic <base64>"` value for the `Authorization` header
  - `get_rpc_endpoint() -> string` — `"http://127.0.0.1:19736"`

- [ ] **Step 1: Replace lib.rs with the full app wiring**

```rust
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            env_logger::try_init().ok();

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
            get_rpc_endpoint
        ])
        .run(tauri::generate_context!())
        .expect("error while running swimchain mobile");
}
```

- [ ] **Step 2: Verify it compiles and tests still pass**

```powershell
cd mobile-app\src-tauri
cargo test
```
Expected: PASS (Task 3's tests) plus clean compile of the new commands.

- [ ] **Step 3: Verify end-to-end on desktop (same app, Windows target)**

Ensure no local testnet node is running (ports 19735/19736 free), then:
```powershell
cd mobile-app
npm run tauri dev
```
Wait for the window (placeholder UI). First launch mines identity PoW then starts the node. Then from another terminal:
```powershell
curl.exe -s -X POST http://127.0.0.1:19736 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getstatus"}'
```
Expected: an HTTP response from the node — a 401/unauthorized JSON-RPC error is SUCCESS here (proves the in-process RPC server is up; auth comes via cookie). If connection refused after ~2 minutes, check the `npm run tauri dev` console for `node failed to start`.

- [ ] **Step 4: Commit**

```powershell
cd C:\github\swimchain
git add mobile-app/src-tauri/src/lib.rs
git commit -m "feat(mobile): tauri commands (node_status, get_rpc_auth, get_rpc_endpoint) + node autostart"
```

---

### Task 5: Shell UI + feed-client bundling

**Files:**
- Create: `mobile-app/scripts/build-clients.js`
- Modify: `mobile-app/src/App.tsx` (full replacement)
- Create: `mobile-app/src/App.css`
- Contingency modify: `feed-client/src/hooks/useParentRpcConfig.ts:33-38` (only if origin rejection observed — see Step 5)

**Interfaces:**
- Consumes: `invoke('node_status')`, `invoke('get_rpc_auth')`, `invoke('get_rpc_endpoint')` from Task 4.
- Produces: the shell sends `{ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint, rpcAuth }` into the feed iframe via postMessage (the contract feed-client's `useParentRpcConfig.ts` already implements). Feed assets land at `public/clients/feed-client/` (vite copies `public/` into `dist/` at build).

- [ ] **Step 1: Create the feed bundling script**

`mobile-app/scripts/build-clients.js`:
```js
/**
 * Build feed-client and copy its dist into mobile-app/public/clients/.
 * Vite copies public/ into dist/ on `npm run build:shell`, so bundled client
 * assets ship inside the Tauri app. Trimmed from desktop-app's build-clients.js
 * (single client, single write target - no dist/public dual-write).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const CLIENTS = ['feed'];
const PUBLIC_CLIENTS_DIR = path.resolve(__dirname, '../public/clients');

function log(msg) {
  console.log(`[build-clients] ${msg}`);
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

for (const client of CLIENTS) {
  const clientDir = path.join(ROOT_DIR, `${client}-client`);
  if (!fs.existsSync(path.join(clientDir, 'node_modules'))) {
    log(`Installing dependencies for ${client}-client...`);
    execSync('npm install', { cwd: clientDir, stdio: 'inherit' });
  }
  log(`Building ${client}-client...`);
  execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });

  const dist = path.join(clientDir, 'dist');
  if (!fs.existsSync(dist)) {
    console.error(`[build-clients] ${dist} missing after build`);
    process.exit(1);
  }
  const dest = path.join(PUBLIC_CLIENTS_DIR, `${client}-client`);
  fs.rmSync(dest, { recursive: true, force: true });
  log(`Copying to ${dest}`);
  copyDirSync(dist, dest);
}
log('Done.');
```
Note: this file uses CommonJS (`require`) but `mobile-app/package.json` has `"type": "module"`, under which Node treats `.js` as ESM — so save the file as `mobile-app/scripts/build-clients.cjs` (the `npm run build` script from Task 2 already references that name).

- [ ] **Step 2: Replace the shell App with status strip + feed iframe**

`mobile-app/src/App.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

interface NodeStatus {
  running: boolean;
  state: string;
  peers: number;
  chain_height: number;
  sync_percent: number;
  uptime_seconds: number;
  error: string | null;
}

export default function App() {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [rpcAuth, setRpcAuth] = useState<string | null>(null);
  const [rpcEndpoint, setRpcEndpoint] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Poll node status every 2s.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await invoke<NodeStatus>('node_status');
        if (alive) setStatus(s);
      } catch {
        /* backend still booting */
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Once the node reports running, fetch RPC endpoint + cookie auth.
  useEffect(() => {
    if (!status?.running || rpcAuth) return;
    (async () => {
      const endpoint = await invoke<string>('get_rpc_endpoint');
      const auth = await invoke<string>('get_rpc_auth');
      setRpcEndpoint(endpoint);
      setRpcAuth(auth);
    })().catch(console.error);
  }, [status, rpcAuth]);

  // Hand RPC config to the feed iframe - same SWIMCHAIN_RPC_CONFIG postMessage
  // contract as desktop-app's ClientFrame (send on load + retry for 10s in
  // case the client's listener mounts after the load event).
  useEffect(() => {
    if (!rpcAuth || !rpcEndpoint) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const send = () =>
      iframe.contentWindow?.postMessage(
        { type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint, rpcAuth },
        window.location.origin
      );
    iframe.addEventListener('load', send);
    send();
    const interval = setInterval(send, 1000);
    const timeout = setTimeout(() => clearInterval(interval), 10000);
    return () => {
      iframe.removeEventListener('load', send);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [rpcAuth, rpcEndpoint]);

  return (
    <div className="shell">
      <header className="status-strip">
        {status?.error ? (
          <span className="err">node error: {status.error}</span>
        ) : status?.running ? (
          <span>
            {status.state} · {status.peers} peers · height {status.chain_height} ·{' '}
            {Math.round(status.sync_percent)}%
          </span>
        ) : (
          <span>starting node… (first launch creates your identity)</span>
        )}
      </header>
      {rpcAuth && rpcEndpoint ? (
        <iframe
          ref={iframeRef}
          className="client-frame"
          src="clients/feed-client/index.html"
          title="feed"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        <div className="boot">waiting for node…</div>
      )}
    </div>
  );
}
```

`mobile-app/src/App.css`:
```css
html,
body,
#root {
  height: 100%;
  margin: 0;
}

.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: system-ui, sans-serif;
}

.status-strip {
  flex: 0 0 auto;
  padding: 6px 10px;
  padding-top: calc(6px + env(safe-area-inset-top));
  font-size: 12px;
  background: #10141a;
  color: #9fb4c8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-strip .err {
  color: #ff7a7a;
}

.client-frame {
  flex: 1 1 auto;
  width: 100%;
  border: 0;
}

.boot {
  flex: 1 1 auto;
  display: grid;
  place-items: center;
  color: #667;
}
```

- [ ] **Step 3: Build with the feed bundled**

```powershell
cd mobile-app
npm run build
```
Expected: feed-client builds, assets copied to `public/clients/feed-client/`, then the shell builds into `dist/` containing `dist/clients/feed-client/index.html`.

- [ ] **Step 4: Verify on desktop**

Ensure ports 19735/19736 are free, then:
```powershell
npm run tauri dev
```
Expected: status strip appears, transitions from "starting node…" to a running state with peer/height numbers (peers > 0 requires the live testnet seed to be reachable), and the feed-client UI renders below it and loads content.

- [ ] **Step 5 (contingency): feed rejects the RPC config message**

Only if the feed stays on its "no connection" state and the console shows `[ParentConfig] Rejected message from untrusted origin`: add the Tauri v2 origins to the allowlist in `feed-client/src/hooks/useParentRpcConfig.ts` (lines 33-38):
```ts
const ALLOWED_ORIGINS: string[] = [
  'http://localhost',       // Local development
  'http://127.0.0.1',       // Local development (IP)
  'tauri://localhost',      // Tauri desktop app (macOS/Linux)
  'http://tauri.localhost', // Tauri v2 (Windows/Android WebView origin)
  'https://localhost',      // Local HTTPS development
];
```
Then rerun from Step 3 (rebuild bundles the fixed feed). This mirrors the search-client fix in commit `9e140424`. Note: shell and iframe are same-origin, so this is expected to be unnecessary — hence contingency.

- [ ] **Step 6: Commit**

```powershell
cd C:\github\swimchain
git add mobile-app feed-client/src/hooks/useParentRpcConfig.ts
git commit -m "feat(mobile): shell UI with node status strip + bundled feed-client"
```
(Drop the feed-client path from `git add` if the contingency wasn't needed.)

---

### Task 6: Android project init + foreground service + cleartext config

**Files:**
- Create (generated): `mobile-app/src-tauri/gen/android/` (via `tauri android init`)
- Create: `mobile-app/src-tauri/gen/android/app/src/main/java/com/swimchain/mobile/NodeForegroundService.kt`
- Modify: `mobile-app/src-tauri/gen/android/app/src/main/java/com/swimchain/mobile/MainActivity.kt`
- Modify: `mobile-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Create: `mobile-app/src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml`

**Interfaces:**
- Consumes: the Tauri app from Tasks 2-5.
- Produces: an installable debug APK with the node kept alive by `NodeForegroundService`.

- [ ] **Step 1: Set Android env vars and initialize the Android project**

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\25.1.8937393"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
Test-Path $env:JAVA_HOME   # must print True; if False, locate the Android Studio JBR or a JDK 17 install and point JAVA_HOME there
cd mobile-app
npm run tauri android init
```
Expected: `gen/android` project generated (Gradle wrapper, `MainActivity.kt` extending `TauriActivity`, manifest). If it complains about a missing tool, install per its message and re-run.

- [ ] **Step 2: Add the foreground service class**

Create `mobile-app/src-tauri/gen/android/app/src/main/java/com/swimchain/mobile/NodeForegroundService.kt`:
```kotlin
package com.swimchain.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Holds a dataSync foreground notification so Android keeps this process -
 * and the in-process swimchain node - alive when the app is backgrounded.
 * The service does no work itself; the node runs in the shared app process.
 */
class NodeForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "swimchain_node"
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(channelId, "Swimchain node", NotificationManager.IMPORTANCE_LOW)
        )
        val notification: Notification = Notification.Builder(this, channelId)
            .setContentTitle("Swimchain node running")
            .setContentText("Syncing with the network")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(1, notification)
        }
        return START_STICKY
    }
}
```

- [ ] **Step 3: Start the service from MainActivity and request notification permission**

Edit the generated `MainActivity.kt` (keep its package line and `TauriActivity` base class exactly as generated; add the imports and `onCreate`):
```kotlin
package com.swimchain.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Node autostarts with the app (Rust setup hook), so the keep-alive
    // service starts with the activity. Notification permission (API 33+)
    // only gates visibility of the notification, not the keep-alive itself.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }
    startForegroundService(Intent(this, NodeForegroundService::class.java))
  }
}
```
Design note (deviation from spec wording): the spec says the service starts "when the node starts / stops on node_stop". Since the node autostarts with the app and the prototype has no stop UI, tying the service to activity creation is equivalent and avoids a Rust→Kotlin bridge. Record this in the commit message.

- [ ] **Step 4: Manifest permissions, service registration, cleartext config**

In `mobile-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml`, ensure these `<uses-permission>` entries exist above `<application>` (the generated manifest already has INTERNET; add the rest):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```
On the `<application>` element add (keep existing attributes):
```xml
android:networkSecurityConfig="@xml/network_security_config"
```
Inside `<application>`, alongside the activity, register the service:
```xml
<service
    android:name=".NodeForegroundService"
    android:exported="false"
    android:foregroundServiceType="dataSync" />
```

Create `mobile-app/src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- The WebView (origin http://tauri.localhost) calls the node's RPC at
         http://127.0.0.1:19736. Android blocks cleartext HTTP by default
         (API 28+), so permit it for loopback only. -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">localhost</domain>
    </domain-config>
</network-security-config>
```
If the generated manifest already sets `android:usesCleartextTraffic`, remove that attribute in favor of the config above (scoped beats global).

- [ ] **Step 5: Build a debug APK (this is the full cross-compile + link test)**

```powershell
cd mobile-app
npm run tauri android build -- --debug --target x86_64
```
Expected: Gradle + cargo build succeed; APK at `src-tauri\gen\android\app\build\outputs\apk\` (path printed by the CLI; typically `universal\debug\app-universal-debug.apk` or `x86_64\debug\app-x86_64-debug.apk`). First build is slow (full swimchain lib for Android). Linker errors here mean a dependency issue Task 1's rlib check couldn't catch — fix in the same spirit as Task 1 Step 3.

- [ ] **Step 6: Commit**

```powershell
cd C:\github\swimchain
git add mobile-app/src-tauri/gen/android Cargo.lock mobile-app
git commit -m "feat(mobile): android project with NodeForegroundService keep-alive + loopback cleartext config

Service starts with MainActivity rather than on node_start: the node
autostarts with the app, so activity-lifetime is equivalent and avoids
a Rust->Kotlin bridge in the prototype."
```
Check `git status` first: if `tauri android init` created build artifacts (`gen/android/app/build/`, `.gradle/`), add a `mobile-app/src-tauri/gen/android/.gitignore` (the generator usually creates one) so only source files are committed.

---

### Task 7: Emulator verification (the spec's success criteria)

**Files:**
- Possibly modify: anything small that verification shakes out (feed origin contingency from Task 5 Step 5, manifest tweaks). Each fix gets its own conventional commit.

**Interfaces:**
- Consumes: debug APK from Task 6.
- Produces: verified prototype; verification results recorded in the final report.

- [ ] **Step 1: Start an emulator**

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -list-avds
```
Pick an x86_64 AVD from the list (mobile-client's old docs suggest `Pixel_6_API_34` exists). Start it in the background:
```powershell
Start-Process "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -ArgumentList "-avd","Pixel_6_API_34"
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" wait-for-device
```
If no AVD exists, create one in Android Studio (Device Manager → Pixel 6, API 34, x86_64) first.

- [ ] **Step 2: Install and launch the APK**

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb install -r (Get-ChildItem mobile-app\src-tauri\gen\android\app\build\outputs\apk -Recurse -Filter *.apk | Select-Object -First 1).FullName
& $adb shell monkey -p com.swimchain.mobile 1
```
Expected: app opens; POST_NOTIFICATIONS prompt appears (grant it); status strip shows "starting node… (first launch creates your identity)" then transitions to running. First launch mines identity PoW — give it a few minutes on an emulator.

Watch node logs while it boots:
```powershell
& $adb logcat -s RustStdoutStderr
```

- [ ] **Step 3: Verify the foreground notification**

```powershell
& $adb shell dumpsys notification --noredact | Select-String -Pattern "swimchain" -Context 2
```
Expected: a posted notification from `com.swimchain.mobile` with the `swimchain_node` channel.

- [ ] **Step 4: Verify RPC is served on-device**

```powershell
& $adb forward tcp:19736 tcp:19736
curl.exe -s -X POST http://127.0.0.1:19736 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getstatus"}'
```
Expected: JSON-RPC response (401/unauthorized error body is success — server is alive). For an authenticated call, read the cookie from the device (debug builds allow `run-as`):
```powershell
& $adb shell run-as com.swimchain.mobile find /data/data/com.swimchain.mobile -name .cookie
# then, using the printed path:
$cookie = (& $adb shell run-as com.swimchain.mobile cat <printed-path>).Trim()
curl.exe -s -X POST http://127.0.0.1:19736 -u "__cookie__:$cookie" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getstatus"}'
```
Expected: a successful `getstatus` result. (If `getstatus` isn't a valid method name, any authenticated response other than "unauthorized" proves auth works; check `docs/api-reference.md` for a valid method.)

- [ ] **Step 5: Verify testnet sync + feed renders**

In the app: status strip should show `peers` ≥ 1 (live testnet seed) and `height` climbing; the feed-client UI below should load and display content. If the feed shows its disconnected state, inspect the WebView console (`chrome://inspect` in Chrome on the host, with the emulator listed) for postMessage origin rejections → apply Task 5 Step 5's contingency, rebuild, reinstall.

- [ ] **Step 6: Verify background keep-alive**

Press Home (backgrounds the app), wait 2 minutes, then:
```powershell
& $adb shell pidof com.swimchain.mobile
curl.exe -s -X POST http://127.0.0.1:19736 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getstatus"}'
```
Expected: PID still present and RPC still answering (adb forward from Step 4 persists) — the foreground service kept the node alive.

- [ ] **Step 7: Commit any fixes made during verification**

Each fix as its own conventional commit, e.g.:
```powershell
git add <files>
git commit -m "fix(mobile): <what verification shook out>"
```

---

## Self-Review Notes

- Spec coverage: replace mobile-client (T2), in-process node via NodeManager (T3/T4), identity generate-on-first-run with stored passphrase (T3), Tauri commands incl. get_rpc_cookie→`get_rpc_auth` (T4), foreground service + manifest permissions (T6), shell status strip + feed iframe + cookie handoff (T5), feed Tauri-origin contingency (T5), compile spike first (T1), emulator verification incl. adb RPC check (T7). Spec's `node_start`/`node_stop` commands were reduced to autostart + no stop UI — deviation documented in Task 6 Step 3 and its commit message; the keep-alive strategy is unaffected.
- Ports/types consistent: 19735/19736 testnet, 39735/39736 in tests; `NodeStatusDto` field names match the TS `NodeStatus` interface (snake_case serialization).
- No placeholders: every code step carries full content; contingent steps state their trigger condition.
