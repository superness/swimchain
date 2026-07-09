# Swimchain Mobile — Tauri v2 Android App with In-Process Node

**Date:** 2026-07-09
**Status:** Approved (prototype scope)

## Goal

A new `mobile-app/` that fully replaces `mobile-client/`: a Tauri v2 Android app
whose Rust process runs the swimchain node in-process, kept alive by an Android
foreground service, with the existing `feed-client` loaded in the WebView talking
JSON-RPC to `127.0.0.1`.

The prototype succeeds when:

1. The app launches on an Android emulator.
2. The node starts on **testnet** in-process and syncs from the live testnet seed.
3. A persistent foreground-service notification shows the node is alive.
4. The embedded feed-client renders live data over local RPC.
5. `adb shell` curl of `127.0.0.1:19736` answers on-device.

## Decisions (made during brainstorming)

- **Replace, don't integrate:** the existing React Native `mobile-client/` is an
  ancient artifact and is deleted; the new app replaces it entirely.
- **Stack:** Tauri v2 Android (not React Native, not Kotlin/Compose). The app core
  is Rust, so the node links in-process with no hand-rolled JNI; the existing web
  clients load in the WebView unchanged; the desktop-app (already Tauri v2)
  provides the architectural template.
- **Embedded client:** feed-client only for the prototype. Others come later.
- **Network:** testnet by default (real sync against the live seed); regtest
  switchable later.

## Architecture

```
Tauri v2 Android app (single Rust process)
├─ swimchain lib linked directly (path dependency)
│   └─ NodeManager::new(config, keypair).start() on a tokio runtime
│       └─ RPC server on 127.0.0.1:19736 (testnet P2P port + 1)
├─ Kotlin: NodeForegroundService
│   └─ dataSync foreground notification keeps the process alive
└─ WebView: Vite shell
    ├─ status strip (state / peers / height, polled via RPC)
    └─ iframe → feed-client (bundled static assets)
```

### 1. Project layout

- New `mobile-app/` directory modeled on `desktop-app/`: Vite shell frontend +
  `src-tauri/`.
- Added to the root Cargo workspace `exclude` list (same as
  `desktop-app/src-tauri`).
- `mobile-app/scripts/build-clients.js`: trimmed copy of the desktop script,
  bundling only `feed-client` into `dist/clients/feed-client/`.
- `mobile-client/` is deleted in the same change.

### 2. In-process node (Rust)

`src-tauri/src/node_host.rs` replicates the CLI start path
(`src/cli/commands/node.rs` around line 392) as a library call:

- `NodeConfig::with_network_defaults(NetworkMode::Testnet)` with
  `data_dir` = Android app-private data dir (from Tauri path resolver),
  `rpc_port` = P2P port + 1.
- Identity: generate on first run. The identity-file encryption password is a
  random string created once and stored beside it in the app-private dir.
  Rationale: Android app-private storage is sandboxed; the password file has the
  same trust level as the identity file itself. Acceptable for the prototype;
  Keystore-backed encryption is a hardening follow-up.
- Node runs on a tokio runtime owned by the Tauri app state.
- Tauri commands exposed to the shell: `node_start`, `node_stop`, `node_status`,
  `get_rpc_cookie`.
- No JNI is written by hand — Tauri's Android glue hosts the Rust process.

### 3. Foreground service (Kotlin)

- Tauri generates an editable Android project under `src-tauri/gen/android`.
- Add `NodeForegroundService.kt`: holds a `dataSync`-type foreground notification
  ("Swimchain node running · syncing"). It does no work itself — its only job is
  to keep the app process (and the in-process node) alive when backgrounded.
- `MainActivity` starts the service when the node starts and stops it on
  `node_stop`.
- Manifest additions: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`,
  `POST_NOTIFICATIONS` (API 33+ runtime prompt).

### 4. Shell frontend + embedded client

- Minimal Vite shell: status strip (node state, peer count, chain height) above
  an iframe hosting feed-client.
- Same embed + RPC-driven-identity pattern as the desktop bundle (no seed
  sharing); RPC cookie handed from Rust to the shell via `get_rpc_cookie`.
- Feed-client may need the same Tauri-origin allowance the search client got in
  commit `9e140424`; expected to be a one-liner.

## Error handling

- `node_start` failures return the error string to the shell; the status strip
  displays it.
- If the node task dies, `node_status` reports the stopped state and the shell
  surfaces it; the foreground service is stopped.

## Risks (ordered)

1. **Cross-compile** — the lib deps look Android-clean (ed25519-dalek, blake3,
   sled, tantivy are pure Rust) but unproven. The implementation plan starts
   with a compile spike (`rustup target add aarch64-linux-android` +
   `cargo ndk build` on the lib) before any app scaffolding.
2. **mDNS discovery** likely won't work on Android (multicast lock, flaky).
   Acceptable: testnet seed entries carry discovery.
3. **Doze / OEM app killers** can still kill foreground services on some
   devices. Out of scope to battle-test in the prototype.

## Out of scope

iOS, WiFi-vs-cellular sync policy, PoW mining UX, multi-client switcher,
Play-Store hardening, battery-optimization exemption flows, Keystore-backed
identity encryption.

## Verification

Emulator run: notification present, `node_status` shows peers > 0 and increasing
chain height against the live testnet seed, feed-client loads and reads content.
Plus `adb shell` curl of `127.0.0.1:19736` on-device.

## Machine prerequisites (this dev box)

- Android NDK 25.1.8937393 present under the Android SDK. ✔
- Rust Android targets (`aarch64-linux-android`, `x86_64-linux-android`) — to
  install.
- `cargo-ndk` — to install.
- Tauri v2 CLI with mobile support — to install/verify.
