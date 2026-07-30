# Surf A1 — The Set: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the A0 deck into `surf-app/` — a real Tauri v2 Android app with an in-process mainnet node — and hit the spec's A1 milestone: *flip between live channels on a Pixel.*

**Architecture:** `surf-app/` copies `mobile-app`'s proven model exactly (§2.1: standalone Tauri crate, in-process node via `NodeManager`, Kotlin `NodeForegroundService`, loopback-only cleartext, `ring` rustls) with the A0 spike's web shell promoted on top: the same deck/handover/static/measure modules, now fed RPC config by Tauri commands instead of a dev proxy. Channels are baked same-origin bundles (feed + wiki + reef) fetching `http://127.0.0.1:9736` directly — the node's RPC serves `Access-Control-Allow-Origin: *` with `Authorization` allowed (verified below), so no proxy exists in the app. NodeHost is a **struct**, not a trait (§2.1).

**Tech Stack:** Tauri 2 (Android), Rust (swimchain path dep), vanilla ES modules for the shell (no bundler — `frontendDist` is a plain directory), Vite CLI builds for the three channel bundles, node:test for shell units, cargo test for the node host, adb + the A0 sampler for on-device verification.

**Worktree:** `C:\github\swimchain\.claude\worktrees\mobile-app`, branch `feat/surf-a1-set` (fresh off origin/main). Check PR state before the first push.

**Spec:** `docs/superpowers/specs/2026-07-28-surf-channel-app-design.md` (rev 3). A1 scope is §5 A1 plus the parts of §2.1/§2.2/§2.3/§3.1/§3.2/§3.7/§6/§7/§8 that bind it. A0's measured verdict (`surf-app/spike/RESULTS.md`): **N=3**, warm median 67.8ms, §8 ceiling 114 MB (content-light floor).

## Decisions on record for A1 (locked here so tasks don't relitigate)

- **D1 — No RPC proxy in the app.** The node's RPC layer serves CORS (`src/rpc/server.rs:774-810`: `Access-Control-Allow-Origin: *`, `Authorization` in allowed headers, OPTIONS preflight with 86400 max-age), which is how the shipped mobile app already works. Channels fetch `http://127.0.0.1:9736` directly with the cookie auth from the config handover. *(This corrects the A0 plan's "verified fact" that the RPC has no CORS — that grep missed the typed-constant header construction. The spike's proxy remains justified by its other two purposes: one-origin renderer measurement and dev-cookie custody.)*
- **D2 — Fixed default mainnet ports (9735/9736), no port scan.** §2.1 mandates mobile-app's model unchanged; ports are that model. Bind failure (e.g. the old Swimchain mobile app running on the same phone) surfaces as the §6 node-failure state — full-screen static, diegetic line, details toggle — never a crash. README warns: stop/uninstall the old app when testing Surf on the same device.
- **D3 — Identity model copied verbatim, including `identity.pass`.** §1 explicitly accepts filesystem-level protection on Android app-private storage for v1. First-launch identity PoW (difficulty 20) runs during the §3.1 acquisition static — the wait is diegetic.
- **D4 — Real CSP.** §2.2: `mobile-app`'s `"csp": null` is not inherited. The shell ships `default-src 'self'; frame-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:9736 http://localhost:9736; font-src 'self' data:`. Channels are same-origin baked, so `frame-src 'self'` is sufficient and no remote origin ever loads.
- **D5 — The flip strip stays for A1.** Native full-surface gesture arbitration (vertical dial swipe vs channels' own scrolling) is real design work the spec assigns nowhere before B; the A0 strip (56px right edge, wheel on desktop) is proven and ships in A1. Documented as accepted debt in the README.
- **D6 — Instrumentation ships, hidden.** measure.mjs + HUD stay (keys `m`/`r`/`e`, invisible corners) — A1's device verification includes re-running the G2 background check on the **real WebView**, the explicit obligation RESULTS.md carries.
- **D7 — A1 ends at a debug arm64 APK sideloaded on the Pixel.** Release signing/size gates are Phase C (§5). The Dev-Mode gradle workaround from `mobile-app/README.md:40-81` is the documented build path.
- **D8 — External opens are https-only, checked in Rust.** §2.2: mobile-app's unchecked opener is not inherited. Surf's `open_external` command validates `^https://` before `opener().open_url`; the shell's message handler additionally requires `event.source` to be the current channel's frame (exact-origin, foreground-only).

## Verified facts this plan builds on

| Fact | Where |
|---|---|
| RPC serves CORS `*` + `Authorization` + OPTIONS preflight | `src/rpc/server.rs:351-353, 774-810` |
| mobile-app node host: `NodeManager` + `NodeConfig::with_network_defaults`, ports from `NetworkMode::default_port()/default_rpc_port()` (mainnet 9735/9736), data dir `app_data_dir()/node-mainnet`, cookie → `Basic base64(__cookie__:hex)` | `mobile-app/src-tauri/src/node_host.rs:86-152`, `src/network/mode.rs:129-145`, `mobile-app/src-tauri/src/lib.rs:135-139` |
| Identity bootstrap: both-files import / enc-only fail-closed / generate 32-char pass, PoW difficulty 20, `identity.pass` written before `identity.enc` | `node_host.rs:19,37-84` |
| Tauri commands pattern: `get_rpc_auth` polls cookie 20×/500ms; `get_rpc_endpoint`; `get_node_address`; `node_status` | `mobile-app/src-tauri/src/lib.rs:29-100` |
| Android glue tracked set: NodeForegroundService.kt (dataSync FGS + MulticastLock), MainActivity.kt (edge-to-edge, POST_NOTIFICATIONS, starts FGS), manifest with FGS registration + `networkSecurityConfig`, cleartext scoped to 127.0.0.1/localhost | `mobile-app/src-tauri/gen/android/app/src/main/...` (51 tracked files; recon report) |
| Gitignored gen/ glue that `tauri android init` must regenerate: `tauri.settings.gradle`, `tauri.build.gradle.kts`, `tauri.properties`, `assets/tauri.conf.json`, `jniLibs/**.so`, `.tauri/` | `gen/android/.gitignore`, `gen/android/app/.gitignore` |
| Root workspace excludes the app crates — surf-app must be added | root `Cargo.toml:3` |
| Android rustls pin: `cfg(target_os="android")` → rustls `ring` backend (aws-lc can't cross-compile from Windows) | root `Cargo.toml:113-147` |
| Dev-Mode build workaround (symlink privilege): tauri android build dies at jniLibs symlink → manual `.so` + conf copy → `gradlew assembleArm64Debug -x rustBuild...` | `mobile-app/README.md:40-81` |
| A0 spike modules to promote: deck.mjs (62), handover.mjs (105), static-shader.mjs (100), measure.mjs (138), shell.mjs (181), index.html (105) + their node:test suites (31 tests) | `surf-app/spike/` |
| Clients accept same-origin `SWIMCHAIN_RPC_CONFIG` unconditionally; all five mount `#root`; reef bakes `VITE_RPC_ENDPOINT` at build (`.env.production` pins the mainnet gateway — env override needed every rebuild) | A0 plan verified-facts + reviews |
| mobile-app's shell posts config on iframe load + 1s×10 retry — Surf does NOT copy the retry loop (spec §2.4 killed it); single post on `load` is the spike's proven model | `mobile-app/src/App.tsx:73-96` vs spike `shell.mjs` |

## Global Constraints

- **Android only; mainnet hardcoded; the `network.magic` guard applies unchanged** (§2.1, §10).
- **No home screen, ever** (§1): power-on lands on a channel or on §3.1 first-signal acquisition static — never a menu, never an empty-state card (§6: "node started, nothing synced" = acquisition state).
- **Seam rule** (§3.2): static persists exactly until the incoming channel's readiness; 2s cold gate → SIGNAL LOST; never a blank frame.
- **Warm deck N=3** (measured, A0); occluded warm frames keep running (occlusion, not display:none).
- **postMessage discipline**: exact targetOrigin, never `'*'`; inbound requires exact `event.source` + `event.origin` (§2.2). Frames carry `allow=""`, no `allow-top-navigation`.
- **No dialed/remote channels; no client source modifications** — baked bundles only, built with CLI flags (§2.4 hardening is Phase C).
- **NodeHost is a struct** — no trait until a second backend exists (§2.1).
- **Power-on bloom ~700ms; power-off CRT collapse → lantern-point "Still broadcasting."** — and §3.7's line must be true: the foreground service keeps the node running when the app backgrounds; power-off inside the app does not stop the node.
- **Node-side follow-and-fetch while the app is closed is explicitly out of scope** (§2.3 names it a separate work item). Liveness while running = the tuner driver: tune → `followed_spaces` add + `request_content` recent + periodic refresh of moored channels.
- **Tests**: node:test for shell logic (promoted suites must stay green byte-for-byte where modules are unchanged), cargo test for the node host (regtest), mutation-test rule for any NEW load-bearing test.
- **Commit convention**: conventional commits + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; never push to a merged branch.

## File structure

```
surf-app/
  spike/                     (exists — untouched, stays as the A0 record)
  package.json               tauri CLI + channel build script (Task 1)
  .gitignore                 node_modules, web/channels, gen artifacts (Task 1)
  README.md                  build recipe incl. Dev-Mode workaround, D1-D8 (Task 6)
  scripts/build-channels.cjs feed/wiki/reef → web/channels/<id>/ (Task 4)
  web/                       frontendDist — plain files, no bundler
    index.html               promoted spike page + acquisition line + node-dead card (Task 3)
    shell.mjs                promoted shell: Tauri config handover, acquisition,
                             last-channel restore, power, flip (Task 3)
    deck.mjs                 byte-identical promotion of spike deck.mjs (Task 3)
    handover.mjs             byte-identical promotion of spike handover.mjs (Task 3)
    static-shader.mjs        spike module with rpc() injected instead of fetch('/rpc') (Task 3)
    measure.mjs              byte-identical promotion of spike measure.mjs (Task 3)
    channels.json            dial: feed 2, wiki 4, reef 50; warmSize 3 (Task 3)
    channels/                baked bundles (gitignored, Task 4)
  test/                      node:test suites for the promoted modules (Task 3)
  src-tauri/
    Cargo.toml               standalone crate, swimchain path dep (Task 1)
    tauri.conf.json          CSP per D4, frontendDist ../web (Task 1)
    build.rs, src/main.rs    tauri boilerplate (Task 1)
    src/lib.rs               commands: get_rpc_auth/endpoint/address, node_status,
                             node_error, open_external (https-only) (Task 2)
    src/node_host.rs         the struct — mobile-app's copied, surf-adapted (Task 2)
    gen/android/             copied tracked glue, package com.swimchain.surf (Task 5)
Modified: root Cargo.toml (exclude += "surf-app/src-tauri") (Task 1)
```

---

### Task 1: Scaffold `surf-app` — crate, config, desktop-dev smoke

**Files:**
- Create: `surf-app/package.json`, `surf-app/.gitignore`, `surf-app/src-tauri/Cargo.toml`, `surf-app/src-tauri/tauri.conf.json`, `surf-app/src-tauri/build.rs`, `surf-app/src-tauri/src/main.rs`, `surf-app/src-tauri/src/lib.rs` (skeleton — Task 2 fills it), `surf-app/web/index.html` (placeholder — Task 3 replaces it)
- Modify: root `Cargo.toml:3` (exclude list)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run tauri dev` (desktop) opens a window serving `surf-app/web/` with the CSP of D4 applied; the crate builds standalone; the root workspace still builds untouched.

- [ ] **Step 1: root Cargo.toml exclude**

In the root `Cargo.toml` `exclude = [...]` list (line 3), append `"surf-app/src-tauri"` alongside the existing app crates. Run `cargo metadata --no-deps -q > $null` from the repo root to prove the workspace still parses.

- [ ] **Step 2: `surf-app/package.json`**

```json
{
  "name": "surf-app",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "tauri": "tauri",
    "build:channels": "node scripts/build-channels.cjs",
    "test": "node --test \"test/*.test.mjs\""
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2"
  }
}
```

No `@tauri-apps/api` dependency: the shell is plain files served by Tauri and uses `window.__TAURI__.core.invoke` via the global (see Step 4 `withGlobalTauri`). Run `npm install` (creates only the CLI dep).

- [ ] **Step 3: `surf-app/.gitignore`**

```
node_modules
web/channels/
```

- [ ] **Step 4: `surf-app/src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Surf",
  "version": "0.1.0",
  "identifier": "com.swimchain.surf",
  "build": {
    "frontendDist": "../web"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "Surf",
        "width": 420,
        "height": 900,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; frame-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:9736 http://localhost:9736; font-src 'self' data:"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"]
  }
}
```

Copy `mobile-app/src-tauri/icons/` wholesale to `surf-app/src-tauri/icons/` for now (placeholder branding; Surf's own icon is not A1 scope — note it in the README as debt). No `devUrl`/`beforeDevCommand`: there is no dev server; `tauri dev` serves `frontendDist` directly.

- [ ] **Step 5: `surf-app/src-tauri/Cargo.toml`**

```toml
[workspace]

[package]
name = "surf-app"
version = "0.1.0"
description = "Surf — the channel-surfing entry to Swimchain"
edition = "2021"

[lib]
name = "surf_app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
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

This is mobile-app's manifest with only the names changed — the `ring` rustls pin rides in from the root crate's `cfg(target_os = "android")` dependency table exactly as it does for mobile-app.

- [ ] **Step 6: boilerplate**

`surf-app/src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`surf-app/src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    surf_app_lib::run()
}
```

`surf-app/src-tauri/src/lib.rs` (Task 1 skeleton — Task 2 replaces the body):
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running surf");
}
```

`surf-app/web/index.html` (placeholder):
```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SURF</title></head>
<body style="background:#000;color:#4f8;font-family:monospace">
<p>surf scaffold — replaced in Task 3</p>
</body></html>
```

- [ ] **Step 7: desktop-dev smoke**

From `surf-app/`: `npm install; npm run tauri dev`. Expected: a 420×900 window titled Surf showing the placeholder on black. In its devtools (right-click → Inspect), confirm the CSP is active: `document.querySelector('meta')`—Tauri injects CSP via headers; instead check `fetch('https://example.com').catch(e => e)` rejects with a CSP violation logged in the console, while `fetch('http://127.0.0.1:9736', {method:'POST'})` is *not* CSP-blocked (it will connection-refuse — no node yet — which proves connect-src allows it; a CSP block reads differently in the console). Close the window. If `cargo` rebuilds the whole swimchain lib here, that is expected one-time cost (same as mobile-app).

- [ ] **Step 8: Commit**

```bash
git add surf-app/package.json surf-app/.gitignore surf-app/src-tauri surf-app/web/index.html Cargo.toml
git commit -m "feat(surf): A1 scaffold - standalone Tauri crate with real CSP, desktop-dev smoke"
```

---

### Task 2: The node host struct + Tauri commands

**Files:**
- Create: `surf-app/src-tauri/src/node_host.rs`
- Modify: `surf-app/src-tauri/src/lib.rs` (full implementation)

**Interfaces:**
- Consumes: `swimchain::node::{NodeConfig, NodeManager}`, `swimchain::identity::*`, `swimchain::network::NetworkMode` — the identical API surface `mobile-app/src-tauri/src/node_host.rs` uses.
- Produces (Task 3's shell invokes these commands via `window.__TAURI__.core.invoke`):
  - `get_rpc_endpoint() -> String` — `http://127.0.0.1:9736`
  - `get_rpc_auth() -> Result<String, String>` — `"Basic ..."`; polls the cookie file 20×/500ms
  - `get_node_address() -> Option<String>` — `cs1...`
  - `node_status() -> NodeStatusDto { running: bool, address: Option<String>, error: Option<String> }`
  - `open_external(url: String) -> Result<(), String>` — **https-only** (D8)

- [ ] **Step 1: copy and adapt `node_host.rs`**

Copy `mobile-app/src-tauri/src/node_host.rs` to `surf-app/src-tauri/src/node_host.rs` **byte-for-byte**, then apply exactly these edits and nothing else:

1. In the doc header, replace the mobile-app references with `surf-app` (comment text only).
2. No other code change — the file is network-generic (mode arrives as a parameter) and the identity/cookie/start logic is precisely what §2.1 mandates copying. Keep `IDENTITY_POW_DIFFICULTY = 20`, keep the `identity.pass`-before-`identity.enc` write order, keep the fail-closed enc-without-pass branch, keep the module's `#[cfg(test)]` suite (it exercises `ensure_identity` on temp dirs and must pass unchanged).

- [ ] **Step 2: write `surf-app/src-tauri/src/lib.rs`**

```rust
// Surf: the set. In-process mainnet node (mobile-app's model, spec section 2.1)
// + the deck shell in surf-app/web. NodeHost is a struct — no trait until a
// second backend exists.
mod node_host;

use node_host::NodeHost;
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
    host: Arc<Mutex<Option<NodeHost>>>,
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
        address: host.as_ref().map(|h| h.address().to_string()),
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
```

Adaptation notes — the copied `node_host.rs` is the source of truth and its ACTUAL API (review-verified against mobile-app's file) is: **`node_host::start(data_dir, network)` is a free async function, data_dir first**, returning a `NodeHost` whose **`address` is a `pub String` field** (not a method); **`rpc_auth_from_cookie(&data_dir)` takes the DATA DIR and joins `.cookie` internally** — pre-joining the filename produces `.cookie/.cookie` and auth that can never succeed. The lib.rs above is written to that API; if the copy drifts in any further detail, adjust `lib.rs` to the copied file, never the reverse. `node_status`'s `error` field is the §6 surface — the shell polls it rather than inferring node death from cookie timing (bind failures write the cookie *before* failing).

- [ ] **Step 3: cargo tests**

Run from `surf-app/src-tauri/`: `cargo test` — the copied `node_host.rs` test suite (identity bootstrap on temp dirs, fail-closed branch) must pass unchanged. Expected first-compile time is long (full swimchain build); tests themselves are fast.

- [ ] **Step 4: desktop-dev live smoke against the real node**

`npm run tauri dev` from `surf-app/`. In devtools console:

```js
await window.__TAURI__.core.invoke('get_rpc_endpoint')      // "http://127.0.0.1:9736"
await window.__TAURI__.core.invoke('get_rpc_auth')          // "Basic ..." (within ~10s of node start)
await window.__TAURI__.core.invoke('node_status')           // { running: true, address: "cs1...", error: null }
await window.__TAURI__.core.invoke('open_external', { url: 'http://evil.test' }) // rejects: refused non-https
```

Then prove the D1 no-proxy path from the page realm: `await fetch('http://127.0.0.1:9736', {method:'POST', headers:{'content-type':'application/json', authorization: await window.__TAURI__.core.invoke('get_rpc_auth')}, body: JSON.stringify({jsonrpc:'2.0',id:1,method:'get_sync_status',params:{}})}).then(r => r.json())` — must return a result object (CORS `*` + Authorization allowed, from `src/rpc/server.rs:774-810`).

**Windows port note:** if the desktop launcher/mainnet node is already running on this machine, 9735/9736 are taken and `node_status` will report the bind error — that is D2 behaving correctly; stop the other node for this smoke or verify the error surfaces cleanly instead.

- [ ] **Step 5: Commit**

```bash
git add surf-app/src-tauri/src
git commit -m "feat(surf): A1 node host struct + commands - mainnet in-process node, https-only opener"
```

---

### Task 3: Promote the shell — deck, handover, static, acquisition, power

**Files:**
- Create: `surf-app/web/deck.mjs`, `surf-app/web/handover.mjs`, `surf-app/web/measure.mjs` (byte-identical promotions), `surf-app/web/static-shader.mjs` (one parameterization), `surf-app/web/shell.mjs`, `surf-app/web/channels.json`, replace `surf-app/web/index.html`
- Create: `surf-app/test/deck.test.mjs`, `surf-app/test/handover.test.mjs`, `surf-app/test/static-shader.test.mjs`, `surf-app/test/measure.test.mjs` (spike suites, import paths adjusted)

**Interfaces:**
- Consumes: Task 2's commands via `window.__TAURI__.core.invoke`; the spike modules' exact APIs (unchanged): `Deck`, `buildConfigMessage`/`watchReadiness`, `createStatic`, `createFlipTimer`/`attachFrameProbes`/`createHud`/`exportResults`.
- Produces: the set as a web app inside Tauri — power-on with §3.1 acquisition (items-based lock, driver-first), flip via strip/keys, OSD, SIGNAL LOST, D8 external-open relay, power-off that leaves the node running (long-press strip on touch), last-channel restore, hidden instrumentation (D6).

**Promotion rules (byte-identical is load-bearing — the A0 suites prove these modules):**
- `deck.mjs`, `handover.mjs`, `measure.mjs`: copy from `surf-app/spike/` **unchanged**. Their test files copy with only the import path changed (`./deck.mjs` → `../web/deck.mjs` etc.).
- `static-shader.mjs`: copy, then ONE change — `createStatic(canvas, { pollMs = 2000, rpc } = {})` takes an injected async `rpc(method, params)` and uses it in `tick()` instead of the spike's hardcoded `fetch('/rpc', ...)`; delete the exported `rpcCall`. `mapStats` untouched; its test copies unchanged.

**Acquisition design (§3.1, corrected by review — this is the binding shape):**
The A0-plan draft revealed on `peer_count ≥ 1 && chain_height > 0`, which exposes the feed's forbidden empty-state card (chain sync ≠ content bodies; design law: content getting needs a driver). The corrected sequence, all BEFORE any reveal:
1. Wait for this run's node (Task 2's `get_rpc_auth` blocks until the host is up or errors — no fixed ceiling; the first-launch identity PoW happens under the static).
2. `tuneDriver('feed')` FIRST: `follow_space` each bootstrap space (with the node identity's pubkey as `user`) + `request_content` for the newest items so bodies actually land.
3. Poll the feed's own listing verb until **≥ N=3 items are locally retrievable** (peers/height feed the static's visuals only, never the lock).
4. Set `acquired`, **persist it** (`localStorage`) — relaunches never replay acquisition; an offline relaunch reveals cached content instead of static-forever.
5. Reload the feed frame (its prefs sync and initial load are once-per-session — they must run AFTER the follows exist), then settle it through the normal 2s readiness gate and reveal.
Flips are disabled until `acquired` — the dial exists once there is signal; this also removes any race between acquisition polling and flip-away.

- [ ] **Step 1: copy modules + tests, adjust static-shader**

Do the copies per the promotion rules. Run `npm test` from `surf-app/` — the promoted suites must pass (spike counts: deck 11, handover 6, static 4, measure 4 = 25; the server suite stays behind in spike/ — it has no A1 counterpart).

- [ ] **Step 2: `surf-app/web/channels.json` + the MANDATORY feed follow-set discovery**

```json
{
  "warmSize": 3,
  "channels": [
    { "id": "feed", "number": 2,  "name": "FEED", "spaces": ["<MANDATORY - see below>"] },
    { "id": "wiki", "number": 4,  "name": "WIKI", "spaces": [] },
    { "id": "reef", "number": 50, "name": "REEF", "spaces": [] }
  ]
}
```

**Discovery sub-step (mandatory, feed cannot ship `[]` — §3.1's "default follow-set bootstraps the first tune"):**
1. Grep `feed-client/src` + `swimchain-react` for the RPC verbs it calls: the follow verb and its full param shape (known from review: `follow_space` requires `user` = node identity pubkey hex), the recent-content listing verb its Recent tab uses, and `request_content`'s shape.
2. Obtain at least one **verified live mainnet space id** for the feed bootstrap set: the /browse showcase spaces (101, Daily Drift, Bot talk) are known-good candidates — query the public gateway (`https://swimchain.io/rpc`) or a local mainnet-synced node for their ids and verify each returns content. Put the verified hex ids in `spaces`.
3. wiki/reef may stay `[]` (driver no-ops; receive-only per §2.5 is designed, not an error).
4. Record verbs, shapes, and ids with evidence in your report — Step 4's shell code marks every RPC callsite that discovery must confirm.

- [ ] **Step 3: `surf-app/web/index.html`**

Copy `surf-app/spike/index.html`, then apply exactly:
1. `<title>SURF</title>`.
2. Add after `#osd`: `<div id="acquire" hidden>FIRST SIGNAL ACQUISITION</div>` — bottom-center, small monospace, phosphor green, 2s opacity pulse (`@keyframes acq { 0%,100%{opacity:.35} 50%{opacity:.9} }`).
3. Add a node-failure card (§6) after `#signal-lost`:
```html
<div id="node-dead" hidden>
  <div class="sl-card">
    <div>THE SET CANNOT REACH THE WATER</div>
    <button id="node-details">DETAILS</button>
    <pre id="node-error" hidden></pre>
  </div>
</div>
```
styled like `#signal-lost` (`z-index: 5600`; `#node-error` plain-text, scrollable, max-height 40vh).
4. Everything else (deck, static canvas, OSD burn, SIGNAL LOST card, flip strip, bloom, off-screen, HUD + corner buttons) unchanged from the spike.

- [ ] **Step 4: `surf-app/web/shell.mjs`**

Full file. Every RPC callsite marked `// DISCOVERY:` must be reconciled with Step 2's findings — adjust the marked lines to the real verbs/shapes, never invent:

```js
// Surf A1 shell: the set, inside Tauri. Differences from the A0 spike shell:
// config comes from Tauri commands; power-on includes the section-3.1
// first-signal acquisition (driver first, items-based lock, persisted);
// external opens relay through Rust https-only (D8); power-off leaves the
// node running — the foreground service holds it, so "Still broadcasting."
// is literally true. Last channel restores across renderer death (section 6).
import { Deck } from './deck.mjs';
import { buildConfigMessage, watchReadiness } from './handover.mjs';
import { createStatic } from './static-shader.mjs';
import { createFlipTimer, attachFrameProbes, createHud, exportResults } from './measure.mjs';

if (!window.__TAURI__) {
  document.body.innerHTML = '<pre style="color:#f66;padding:2em">not inside the set (no Tauri runtime)</pre>';
  throw new Error('surf shell requires the Tauri runtime');
}
const invoke = window.__TAURI__.core.invoke;
const cfg = await (await fetch('/channels.json')).json();
const byId = new Map(cfg.channels.map((c) => [c.id, c]));
const deck = new Deck(cfg.channels.map((c) => c.id), cfg.warmSize);

// --- RPC plumbing (D1: no proxy; direct loopback fetch with cookie auth) ---
const rpcEndpoint = await invoke('get_rpc_endpoint');
let rpcAuth = null;
let myPk = null; // node identity pubkey hex; follow_space requires it as `user`
async function rpc(method, params = {}) {
  if (!rpcAuth) throw new Error('rpc not ready');
  const res = await fetch(rpcEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: rpcAuth },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'rpc error');
  return json.result;
}

const deckEl = document.getElementById('deck');
const staticCtl = createStatic(document.getElementById('static'), { rpc: (m, p) => rpc(m, p) });
const timer = createFlipTimer();
const hud = createHud(document.getElementById('hud'), timer);

const frames = new Map();
const painted = new Set();
let z = 1;
let gate = null;
let powered = false;
let lastFlipAt = 0;
let rpcConfig = null;

const LAST_CHANNEL_KEY = 'surf.lastChannel';
const ACQUIRED_KEY = 'surf.acquired';
let acquired = localStorage.getItem(ACQUIRED_KEY) === '1';

function mount(id) {
  const f = document.createElement('iframe');
  f.className = 'channel';
  f.setAttribute('allow', '');
  f.src = `/channels/${id}/`;
  f.addEventListener('load', () => {
    if (rpcConfig) f.contentWindow.postMessage(rpcConfig, location.origin);
    attachFrameProbes(id, f, hud.sink);
    try { f.contentWindow.addEventListener('keydown', onKey); } catch { /* gone */ }
  });
  deckEl.appendChild(f);
  frames.set(id, f);
  return f;
}

function unmount(id) {
  frames.get(id)?.remove();
  frames.delete(id);
  painted.delete(id);
  hud.sink.dropChannel(id);
}

function advisory(id, type) {
  frames.get(id)?.contentWindow?.postMessage({ type }, location.origin);
}

// Section 2.3: the tuner is the driver. Best-effort; a channel with no
// declared spaces, or a receive-only identity, just plays (section 2.5).
async function tuneDriver(id) {
  const ch = byId.get(id);
  if (!myPk || !(ch.spaces ?? []).length) return;
  for (const space of ch.spaces) {
    try {
      await rpc('follow_space', { user: myPk, space_id: space }); // DISCOVERY: verb + param shape
    } catch { /* policy call; receive-only is fine */ }
  }
  try {
    const recent = await rpc('list_space_content', { space_id: ch.spaces[0], limit: 5 }); // DISCOVERY: the feed's listing verb + shape
    for (const item of recent ?? []) {
      rpc('request_content', { hash: item.content_hash ?? item.hash }).catch(() => {}); // DISCOVERY: request_content shape
    }
  } catch { /* nothing listable yet — acquisition poll keeps watching */ }
}

// DISCOVERY: same listing verb as tuneDriver; returns how many items are
// locally retrievable for the bootstrap spaces right now.
async function localItemCount(spaces) {
  let n = 0;
  for (const space of spaces) {
    try { n += ((await rpc('list_space_content', { space_id: space, limit: 5 })) ?? []).length; }
    catch { /* keep counting others */ }
  }
  return n;
}

function settle(target, tuneResult, from, kindOverride = null) {
  const cold = tuneResult.mounted.includes(target) || !painted.has(target);
  timer.start(target, kindOverride ?? (cold ? 'cold' : 'warm'));
  staticCtl.show();
  document.getElementById('signal-lost').hidden = true;
  for (const id of tuneResult.evicted) unmount(id);
  const frame = frames.get(target) ?? mount(target);
  gate = watchReadiness(frame, {
    timeoutMs: 2000,
    onReady: (via) => {
      const rec = timer.end(via);
      painted.add(target);
      frame.style.zIndex = ++z;
      staticCtl.hide();
      document.getElementById('acquire').hidden = true;
      if (from && from !== target) advisory(from, 'SWIMCHAIN_CHANNEL_HIDDEN');
      advisory(target, 'SWIMCHAIN_CHANNEL_VISIBLE');
      showOsd(byId.get(target), rec);
      localStorage.setItem(LAST_CHANNEL_KEY, target);
      tuneDriver(target);
    },
    onTimeout: () => {
      timer.abort();
      hud.signalLost(target);
      staticCtl.hide();
      showSignalLost(byId.get(target));
    },
  });
}

function flip(dir) {
  if (!powered || !acquired) return; // the dial exists once there is signal
  const now = performance.now();
  if (now - lastFlipAt < 250) return;
  lastFlipAt = now;
  const from = deck.current;
  gate?.cancel();
  const r = dir > 0 ? deck.next() : deck.prev();
  settle(r.current, r, from);
}

function showOsd(ch, rec) {
  const osd = document.getElementById('osd');
  osd.textContent = `CH ${ch.number} ${ch.name}`;
  osd.classList.remove('burn'); void osd.offsetWidth; osd.classList.add('burn');
  if (rec) hud.note(`flip ${rec.kind} ${Math.round(rec.ms)}ms via ${rec.via}`);
}

function showSignalLost(ch) {
  const el = document.getElementById('signal-lost');
  el.querySelector('.sl-name').textContent = `CH ${ch.number} ${ch.name}`;
  el.hidden = false;
}

function showNodeDead(msg) {
  staticCtl.start();
  staticCtl.show();
  const el = document.getElementById('node-dead');
  el.hidden = false;
  document.getElementById('node-error').textContent = msg;
}
document.getElementById('node-details').addEventListener('click', () => {
  const pre = document.getElementById('node-error');
  pre.hidden = !pre.hidden;
});

document.getElementById('retune').addEventListener('click', () => {
  gate?.cancel();
  const id = deck.current;
  unmount(id);
  document.getElementById('signal-lost').hidden = true;
  settle(id, { mounted: [id], evicted: [] }, null);
});

// --- D8 shell half: external opens relayed from the CURRENT channel only ---
// Baked channels post open requests with targetOrigin '*' (feed MainLayout:
// SWIMCHAIN_OPEN_EXTERNAL; linkify: SWIMCHAIN_OPEN_URL). Accept only from the
// current channel's own frame, exact-origin, while powered; Rust re-validates
// https-only. Everything else drops silently (spec section 2.2 inbound rule).
window.addEventListener('message', (e) => {
  const t = e.data?.type;
  if (t !== 'SWIMCHAIN_OPEN_EXTERNAL' && t !== 'SWIMCHAIN_OPEN_URL') return;
  if (!powered || typeof e.data?.url !== 'string') return;
  const cur = frames.get(deck.current);
  if (!cur || e.source !== cur.contentWindow || e.origin !== location.origin) return;
  invoke('open_external', { url: e.data.url }).catch((err) => hud.note(`open refused: ${err}`));
});

// --- power (sections 3.1 / 3.7) ---
function powerOn() {
  powered = true;
  document.getElementById('off-screen').hidden = true;
  const bloom = document.getElementById('bloom');
  bloom.hidden = false;
  bloom.classList.remove('blooming'); void bloom.offsetWidth; bloom.classList.add('blooming');
  setTimeout(() => { bloom.hidden = true; }, 750);
  staticCtl.start();
  if (!acquired) { acquisitionBoot(); return; }
  const stored = localStorage.getItem(LAST_CHANNEL_KEY);
  const target = deck.current ?? (byId.has(stored) ? stored : cfg.channels[0].id);
  const r = deck.tune(target);
  settle(target, r, null, 'power');
}

function powerOff() {
  powered = false;
  gate?.cancel();
  staticCtl.stop();
  const off = document.getElementById('off-screen');
  off.hidden = false;
  off.classList.remove('collapsing'); void off.offsetWidth; off.classList.add('collapsing');
}

// --- section 3.1: first-signal acquisition (runs once, then persisted) ---
async function acquisitionBoot() {
  staticCtl.show();
  document.getElementById('acquire').hidden = false;
  try {
    await rpcReady; // rpcAuth + myPk + rpcConfig (boot section below)
    const feed = cfg.channels[0].id;
    deck.tune(feed);
    mount(feed); // paints its own loading UI behind the static; NOT revealed
    await tuneDriver(feed); // driver FIRST: follows + request_content
    const N = 3;
    await new Promise((resolve) => {
      const wait = setInterval(async () => {
        try {
          if ((await localItemCount(byId.get(feed).spaces)) >= N) { clearInterval(wait); resolve(); }
          else tuneDriver(feed); // keep nudging request_content as sync progresses
        } catch { /* node still syncing */ }
      }, 2000);
    });
    acquired = true;
    localStorage.setItem(ACQUIRED_KEY, '1');
    // The feed's prefs sync and first load ran before the follows existed —
    // reload it so this session sees them, then reveal through the normal gate.
    unmount(feed);
    settle(feed, { mounted: [feed], evicted: [] }, null, 'power');
  } catch (e) {
    const status = await invoke('node_status').catch(() => null);
    showNodeDead(String(status?.error ?? e));
  }
}

// --- input (spike model: strip + keys; D5). Long-press strip = power (touch). ---
function onKey(e) {
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (e.key === 'ArrowDown') flip(+1);
  else if (e.key === 'ArrowUp') flip(-1);
  else if (e.key === 'p') (powered ? powerOff : powerOn)();
  else if (e.key === 'm') hud.toggle();
  else if (e.key === 'r') hud.drift.reset();
  else if (e.key === 'e') exportResults(timer, hud);
}
window.addEventListener('keydown', onKey);
document.getElementById('export-btn').addEventListener('click', () => exportResults(timer, hud));
document.getElementById('hud-toggle').addEventListener('click', () => hud.toggle());
document.getElementById('off-screen').addEventListener('click', () => { if (!powered) powerOn(); });

const strip = document.getElementById('flip-strip');
let touchY = null;
let pressTimer = null;
strip.addEventListener('touchstart', (e) => {
  touchY = e.touches[0].clientY;
  pressTimer = setTimeout(() => { pressTimer = null; (powered ? powerOff : powerOn)(); touchY = null; }, 800);
}, { passive: true });
strip.addEventListener('touchmove', () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true });
strip.addEventListener('touchend', (e) => {
  clearTimeout(pressTimer);
  if (pressTimer === null && touchY == null) return; // long-press already fired
  pressTimer = null;
  if (touchY == null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  touchY = null;
  if (Math.abs(dy) > 60) flip(dy < 0 ? +1 : -1);
});
strip.addEventListener('wheel', (e) => { e.preventDefault(); flip(e.deltaY > 0 ? +1 : -1); }, { passive: false });

// --- boot: static immediately; node plumbing resolves behind it ---
const rpcReady = (async () => {
  rpcAuth = await invoke('get_rpc_auth'); // blocks until THIS run's node is up, or errors
  myPk = (await rpc('get_identity_info')).public_key; // DISCOVERY: confirm field name
  rpcConfig = buildConfigMessage({
    rpcEndpoint,
    rpcAuth,
    nodeAddress: (await invoke('get_node_address')) ?? undefined,
  });
  for (const [, f] of frames) {
    try { f.contentWindow?.postMessage(rpcConfig, location.origin); } catch { /* not loaded */ }
  }
})();
// Node-dead is detected by status, not inferred from cookie timing: bind
// failures write the cookie BEFORE failing, so cookie success can mask a
// dead node. Poll until acquired; stop on first error shown.
const statusPoll = setInterval(async () => {
  const s = await invoke('node_status').catch(() => null);
  if (s?.error) { clearInterval(statusPoll); showNodeDead(s.error); }
  else if (acquired) clearInterval(statusPoll);
}, 1000);

powerOn();
rpcReady.catch(async (e) => {
  const status = await invoke('node_status').catch(() => null);
  showNodeDead(String(status?.error ?? e));
});
```

**Adaptation notes (resolve during implementation, never by guessing):**
- Every `// DISCOVERY:` line must match Step 2's verified verbs and shapes exactly; if the listing verb differs (e.g. the feed uses a different recent-content call), `tuneDriver` and `localItemCount` change together.
- `get_identity_info`'s response field for the pubkey must be confirmed (review evidence says `public_key` at `src/rpc/methods.rs` ~8477 — verify).
- On a warm relaunch (`acquired` persisted) with the phone offline, the set reveals cached content through the normal gates — static-forever only ever happens on a true first run with no reachable sea, which is honest (§3.2).

- [ ] **Step 5: unit suite green**

`npm test` from `surf-app/`: 25 tests pass. The shell itself is DOM-wired (verified live — same stance the A0 reviews accepted).

- [ ] **Step 6: desktop-dev verification (channels not yet baked — scope the checks to what CAN happen)**

`npm run tauri dev`:
1. Power-on: bloom → static with the ACQUISITION line pulsing. Without baked channels the feed mount 404s and acquisition cannot complete — the static persists with live params (peers/height from mainnet sync visibly move it). That IS the §3.1 honest state; SIGNAL LOST and reveal checks belong to Task 4 when channels exist.
2. Node-dead path: launch a second dev instance while the first holds 9735/9736 → THE SET CANNOT REACH THE WATER card with DETAILS showing the bind error (driven by the `node_status` poll, not cookie timing). Close it.
3. `m` HUD; static params move with the real node.
4. D8 dry-run from devtools: `window.postMessage({type:'SWIMCHAIN_OPEN_EXTERNAL', url:'https://example.com'}, '*')` from the SHELL console must be DROPPED (source is the shell window, not a channel frame) — verify no browser opens and a `open refused` note never appears (it was filtered before the invoke).

- [ ] **Step 7: Commit**

```bash
git add surf-app/web surf-app/test
git commit -m "feat(surf): A1 shell - driver-first acquisition, D8 open relay, node-dead by status, persisted lock"
```

---

### Task 4: Bake the channels — feed, wiki, reef

**Files:**
- Create: `surf-app/scripts/build-channels.cjs`
- Create (gitignored artifacts): `surf-app/web/channels/{feed,wiki,reef}/`

**Interfaces:**
- Consumes: `feed-client/`, `wiki-client/`, `reef-client/` sources; the A0 build lessons (npm install not ci; reef env trap).
- Produces: `node scripts/build-channels.cjs` populates `web/channels/<id>/` with bundles whose asset URLs are rooted at `/channels/<id>/` and whose RPC behavior is: feed/wiki configured by `SWIMCHAIN_RPC_CONFIG` handover; reef baked to `http://127.0.0.1:9736` (it has no config handling until Phase C).

- [ ] **Step 1: write `surf-app/scripts/build-channels.cjs`**

Model on `mobile-app/scripts/build-clients.cjs` (same repo pattern), generalized:

```js
#!/usr/bin/env node
// Bakes the A1 lineup into surf-app/web/channels/<id>/.
// npm install (NOT npm ci - package-lock.json is gitignored repo-wide).
// reef trap: reef-client/.env.production pins the mainnet GATEWAY endpoint;
// the in-app node is loopback, so VITE_RPC_ENDPOINT must be forced on EVERY
// build - and grep-verified after (A0 rule: never trust an unverified bundle).
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'web', 'channels');
const RPC = 'http://127.0.0.1:9736';

const CHANNELS = [
  { id: 'feed', dir: 'feed-client', env: {} },
  { id: 'wiki', dir: 'wiki-client', env: {} },
  { id: 'reef', dir: 'reef-client', env: { VITE_RPC_ENDPOINT: RPC } },
];

for (const ch of CHANNELS) {
  const cwd = path.join(REPO, ch.dir);
  console.log(`\n=== ${ch.id} (${ch.dir}) ===`);
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
    execSync('npm install', { cwd, stdio: 'inherit', env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' } });
  }
  const outDir = path.join(OUT, ch.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  execSync(`npx vite build --base=/channels/${ch.id}/ --outDir ${JSON.stringify(outDir)} --emptyOutDir`, {
    cwd, stdio: 'inherit', env: { ...process.env, ...ch.env },
  });
  // verify the bake
  const idx = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  if (!idx.includes(`/channels/${ch.id}/`)) {
    throw new Error(`${ch.id}: index.html assets are not rooted at /channels/${ch.id}/`);
  }
}
// reef endpoint verification: the loopback endpoint must be in the bundle and
// the production gateway must NOT be.
const reefAssets = path.join(OUT, 'reef', 'assets');
const js = fs.readdirSync(reefAssets).filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(reefAssets, f), 'utf8')).join('');
if (!js.includes('127.0.0.1:9736')) throw new Error('reef: loopback endpoint not baked');
if (js.includes('swimchain.io/rpc')) throw new Error('reef: PRODUCTION GATEWAY LEAKED INTO THE BAKE');
console.log('\nall channels baked and verified');
```

- [ ] **Step 2: run it and verify by hand once**

`node surf-app/scripts/build-channels.cjs` — expect three builds and the final `all channels baked and verified`. Spot-check `web/channels/wiki/index.html` asset URLs by eye. If wiki-client's install needs pnpm (tracked pnpm-lock.yaml), `npm install` is the accepted spike-era fallback — note it in the report.

- [ ] **Step 3: mutation-check the verifier**

The bake-verifier is a load-bearing test. Temporarily set reef's env to `{}` in CHANNELS, rerun → the script must THROW at the loopback check (reef falls back to `.env.production`'s gateway). Restore, rerun, green. This proves the trap-guard actually guards.

- [ ] **Step 4: desktop-dev full loop**

`npm run tauri dev`: power-on → acquisition (if the node syncs mainnet with peers, it satisfies) → FEED reveals with real mainnet content → flip WIKI → flip REEF (its board renders against the in-app node) → flip wraps. SIGNAL LOST only if a channel genuinely fails. OSD burns on each flip. Verify in devtools that feed's fetches hit `http://127.0.0.1:9736` with `Authorization: Basic ...` and get 200s (D1 in practice).

- [ ] **Step 5: Commit**

```bash
git add surf-app/scripts/build-channels.cjs
git commit -m "feat(surf): A1 channel bake - feed/wiki/reef with verified loopback endpoints"
```

---

### Task 5: Android — glue, build, and the milestone on the Pixel

**Files:**
- Create: `surf-app/src-tauri/gen/android/**` — the tracked-glue set copied from `mobile-app/src-tauri/gen/android/**` with the package renamed `com.swimchain.mobile` → `com.swimchain.surf` (Kotlin package + dirs, manifest, gradle namespace/appid, res strings/themes app name → Surf)
- The gitignored glue (`tauri.settings.gradle`, `tauri.build.gradle.kts`, `tauri.properties`, `assets/tauri.conf.json`, `jniLibs/*.so`, `.tauri/`) is REGENERATED by `tauri android init`, never copied.

**Interfaces:**
- Consumes: everything above; a USB Pixel 8 Pro with developer mode; `JAVA_HOME` = Android Studio JBR, `ANDROID_HOME` set (values in `mobile-app/README.md:51-53`).
- Produces: `app-arm64-debug.apk` installed on the Pixel; **the A1 milestone: flip between live channels on a Pixel**; the G2-on-real-WebView re-check RESULTS.md obligates.

- [ ] **Step 1: `tauri android init`, then overlay the copied glue**

From `surf-app/`: `npm run tauri android init`. This generates `gen/android` fresh for `com.swimchain.surf`. THEN overlay the mobile-app tracked customizations on top of the generated tree, renaming as you go — the delta to carry (from the recon of mobile-app's tracked set):
1. `NodeForegroundService.kt` → package `com.swimchain.surf` — dataSync foreground service + MulticastLock, verbatim otherwise.
2. `MainActivity.kt` — keep the generated Tauri one, add mobile-app's customizations: edge-to-edge + insets padding + background `0xFF000000` (Surf is black, not mobile's `0xFF10141A`), POST_NOTIFICATIONS request, `startForegroundService` on create and after grant.
3. Manifest: add the service registration, the FGS/notification/multicast permissions, `networkSecurityConfig` reference.
4. `res/xml/network_security_config.xml`: cleartext scoped to `127.0.0.1` + `localhost` only (fix the stale comment: the port here is 9736).
5. `app/build.gradle.kts`: mobile-app's shape (minSdk 26, `usesCleartextTraffic` true for debug only, rust rootDirRel) with namespace/applicationId `com.swimchain.surf`.
Commit the tracked set; confirm `git status` shows no gitignored glue staged.

- [ ] **Step 2: build the debug arm64 APK (Dev-Mode workaround path)**

Follow `mobile-app/README.md:40-81` adapted to surf-app, target `aarch64`:
```powershell
cd surf-app
npm run build:channels          # bake before the APK — web/ is the frontendDist
npm run tauri android build -- --debug --target aarch64
# expect the jniLibs symlink failure; then:
Copy-Item src-tauri\target\aarch64-linux-android\debug\libsurf_app_lib.so src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a\ -Force
Copy-Item src-tauri\tauri.conf.json src-tauri\gen\android\app\src\main\assets\tauri.conf.json -Force
cd src-tauri\gen\android
.\gradlew.bat assembleArm64Debug -x rustBuildArm64Debug
```
APK at `gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk`. If the symlink failure does NOT occur (Developer Mode on), the straight build output is fine — use whichever completes.

- [ ] **Step 3: install and run the milestone**

```powershell
adb install -r <apk>
adb shell am start -n com.swimchain.surf/.MainActivity
```
**Milestone checklist (screenshots as evidence, like the A0 run):**
1. First launch: bloom → acquisition static (identity PoW + first sync happening underneath, §3.1) — the static's flecks visibly change as mainnet peers connect. No empty-state card at any point.
2. Acquisition locks: FEED reveals with real mainnet content.
3. Strip-swipe to WIKI, then REEF: live flips, OSD burns, static seams. **This is the A1 milestone.**
4. Warm flips back: near-instant. HUD (`adb shell input text m` or corner tap) shows warm timings and all-channel rAF.
5. Power-off (`p` via keyboard or add it to the checklist via tap: off-screen collapse) → "Still broadcasting." → `adb shell ps -A | grep surf` shows the process and service alive; power back on → warm.
6. §6 renderer-death restore: `adb shell am crash com.swimchain.surf` → relaunch → last channel restores as a warm power-on. (Under wry, renderer death takes the whole app with it — `onRenderProcessGone` is unhandled — so `am crash` reproduces the §6 scenario exactly.)
7. Foreground-service truth: home-button the app, `dumpsys activity services com.swimchain.surf` shows NodeForegroundService running (§3.7's caption is true).

- [ ] **Step 4: the G2-on-WebView re-check (RESULTS.md obligation)**

**Sampler caveat (review-confirmed):** the WebView renderer process is named by the WebView *provider* package (`com.google.android.webview:sandboxed_processN:...`), so `meminfo-sampler.ps1 -Package com.swimchain.surf` can NEVER see it — and other apps' renderers carry identical names. Sample by PID instead:
1. With the app foregrounded on FEED, find the renderer: `adb shell dumpsys activity processes com.swimchain.surf` — the sandboxed ProcessRecord bound to the app (isolated-UID suffix matches the app's uid). Record that PID.
2. Loop `adb shell dumpsys meminfo <pid>` every 30–60s to a CSV (a five-line PowerShell loop; the spike sampler's TOTAL-PSS regex applies).
3. Home-button the app, leave it 60 minutes (screen on; phone otherwise usable — the renderer riding the foreground service's priority is exactly the claim under test), return via recents.
4. Record: renderer PID continuity, PSS trend, reload-or-not (HUD uptime). Append the outcome to `surf-app/spike/RESULTS.md` under `## A1 addendum — G2 on the real WebView`. This closes the A0 caveat's inference with a measurement.

- [ ] **Step 5: Commit**

```bash
git add surf-app/src-tauri/gen surf-app/spike/RESULTS.md
git commit -m "feat(surf): A1 android - foreground-service node, debug APK, milestone flips on Pixel + WebView G2 addendum"
```

---

### Task 6: README + debt register

**Files:**
- Create: `surf-app/README.md`

Contents, in order: what Surf is (one paragraph + spec pointer); A1 status (what ships, the milestone evidence pointer); the decisions D1–D8 verbatim from this plan's "Decisions on record"; build recipe (desktop dev; channel bake; the Android Dev-Mode workaround with surf paths; port-conflict warning incl. "stop the old Swimchain mobile app when testing on the same device"); controls (strip swipe = flip, **strip long-press 800ms = power toggle — the only touch power control**, keys p/m/r/e, both invisible corners); accepted debt, each with its phase: native gesture arbitration (B), Surf's own icon (C), `SWIMCHAIN_CHANNEL_READY` in clients (C), config-handover hardening (C), release signing + size gate (C), dial (D), `get_space_health` + dead-air/flare/dwell (B), node-side follow-and-fetch while closed (named, unscheduled).

- [ ] **Step 1: write it** (pull exact commands from Tasks 2/4/5 — the file must be a runnable run book for someone who has never seen this plan)
- [ ] **Step 2: Commit**

```bash
git add surf-app/README.md
git commit -m "docs(surf): A1 README - run book, decisions on record, debt register"
```

---

## What A1 explicitly does not do

No dial, registry, capability tokens, or purpose-scoped signing (D); no config-handover hardening or client source changes (C); no dwell-engage, flare, `get_space_health`, Chart, Interference, Night Swim (B); no release signing, size gates, sourcemap stripping, or store distribution (C); no desktop build (E); no node-side background fetch (named work item, unscheduled); no keystore passphrase wrapping (Android data dir is app-private — §1's requirement binds only where it isn't); no new consensus or node-side RPC work of any kind.

## Execution notes

- Tasks strictly in order — each consumes the previous task's artifacts. Task 5 requires the physical Pixel; if the device is unavailable when Task 5 arrives, complete Steps 1–2 (glue + APK) and report the on-device checklist as the operator's hand-off rather than blocking.
- Rust compile of the swimchain lib inside surf-app is a one-time ~long build per target (desktop + aarch64); budget it, don't fight it.
- Every task ends with its verification step run and evidence in the report; `npm test` (shell suites) and `cargo test` (node host) stay green throughout.
