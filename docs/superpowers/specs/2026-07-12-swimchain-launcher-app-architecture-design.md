# Swimchain Launcher + Pluggable Apps — Design

**Date:** 2026-07-12
**Status:** Approved (design); implementation to be phased.
**Supersedes:** the monolithic `desktop-app` Tauri bundle that runs the node and swaps 5 clients in/out as iframes.

## Problem

Today `desktop-app/` is one Tauri app: its Rust shell runs the node (`node_manager.rs`) and its UI embeds five React clients (`feed, chat, forum, search, wiki`) as **iframes**, passing RPC config via `postMessage`. Consequences:
- No process isolation — a hung/crashing client webview can affect the whole app.
- Clients can't version, update, or ship independently.
- The client set is effectively hardcoded; adding one means changing the shell.
- Third parties can't add an app.

## Goal

Decouple into a **Swimchain Launcher** (owns the node) that discovers and launches **independent app executables** through an extensible, robust, drop-in pattern.

## Locked decisions (from brainstorming)

1. **Hosting:** separate process per app (crash isolation, independent lifecycle).
2. **Packaging:** each app is a standalone Tauri executable (own version/signing/updates).
3. **Registry:** manifest-based, drop-in — the launcher scans `apps/*/app.json`.
4. **RPC handoff:** launcher passes `--data-dir <dir>`; the app reads `.rpc_addr` + `.cookie` itself (exactly like the CLI), connects with cookie auth, and signs via the node's `sign_message` RPC. The identity seed never leaves the node.

## Architecture

```
Swimchain Launcher (installed product, owns the node)
 ├─ Node host        : runs `sw`, network-magic guard, identity onboarding/unlock,
 │                     network selection, RPC + cookie lifecycle (kept from today)
 ├─ App registry     : scan apps/*/app.json → validated Vec<AppEntry> → app grid
 ├─ Supervisor       : spawn / track / relaunch app processes; single-instance focus;
 │                     surface crashes; optional close-apps-on-quit
 └─ Protocol owner   : registers swim://; routes deep-links to the target app

apps/                         ← the extensible surface (drop-in; third-party-friendly)
  feed/  app.json + feed-app.exe + icon.png
  chat/  app.json + chat-app.exe + icon.png
  …
Each <client>-app.exe : standalone Tauri app built from the shared app-shell template;
  given --data-dir, reads .rpc_addr/.cookie, connects to the launcher's node RPC,
  renders its bundled client. Contains NO node.
```

### Components and boundaries

- **Launcher (Rust/Tauri)** — evolved from `desktop-app/src-tauri`. Owns the node and the app lifecycle. Depends on: the `sw` node binary, the `apps/` directory. Exposes to its own UI: node status/lifecycle, identity, network, and `list_apps` / `launch_app(id)` / app-status commands.
- **App registry (module in the launcher)** — pure function of the `apps/` dir: parse + validate manifests → `Vec<AppEntry>`. No side effects; unit-testable in isolation.
- **Supervisor (module in the launcher)** — owns spawned `Child` handles keyed by app id. `launch_app`, single-instance focus, exit detection, relaunch. Depends on the registry (for `exec` path) and the node data-dir path.
- **app-shell (shared Tauri template/crate)** — the reusable body every client app is built from. Given `--data-dir` (+ optional `--deeplink`), reads `.rpc_addr`/`.cookie`, injects `SWIMCHAIN_RPC_CONFIG` into its webview, and loads its bundled client `dist`. One place for shell logic; produces N standalone binaries. Depends on: a client `dist` bundle + an `app.json` at build time.
- **Client web apps (unchanged UIs)** — `feed-client`, etc. Keep their existing `useParentRpcConfig` config-injection path so the client-side change is minimal.

## App manifest (`app.json`) — the contract

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

- `id` (required, unique, kebab-case) — registry key + deep-link target.
- `name` (required) — grid label / window title.
- `icon` (optional, path relative to the app dir) — grid tile; default icon if absent.
- `exec` (required, path relative to the app dir) — the executable to spawn.
- `version` (optional) — display + future update checks.
- `deeplink` (optional) — the `swim://` sub-scheme/path prefix this app handles.
- `singleInstance` (optional, default true) — focus the existing window instead of spawning a second.

Validation rules: `id`/`name`/`exec` present; `exec` exists and is inside the app dir; `id` unique across the scan (first wins, dup logged). Invalid/missing manifest → app skipped + logged; never aborts the scan.

## Data flow — launching an app

1. Launcher scans `apps/*/app.json` at startup (and on a manual refresh) → grid.
2. User clicks an app (or a `swim://` deep-link arrives).
3. Supervisor: if `singleInstance` and already running → focus it; else spawn
   `exec --data-dir <node-data-dir> [--deeplink <url>]`, record the child.
4. app-shell reads `<dir>/.rpc_addr` + `<dir>/.cookie`, connects to `http://127.0.0.1:PORT`
   with cookie auth, injects `SWIMCHAIN_RPC_CONFIG`, renders the client.
5. Client operates over RPC; signing goes through the node's `sign_message` (seed stays in node).

Prerequisite: the launcher's node must be running/unlocked (apps depend on `.rpc_addr`/cookie). If not, the app-shell shows a clear "start the node in the launcher" state and retries; the launcher UI likewise gates launching on node-ready.

## Deep links

The launcher owns the `swim://` protocol registration (generalizing today's `take_pending_deeplink`). On a link it resolves the target app by `deeplink`/`id` from the manifests, launches (or focuses) it, and forwards the URL via `--deeplink`. Unknown target → launcher surfaces it (no silent drop).

## Packaging & build

`build.ps1` (and `build.sh`) become:
1. Build the node (`sw` / `sw.exe`).
2. For each client: build its web bundle.
3. For each client: build `<id>-app` from the `app-shell` template + that bundle.
4. Assemble `apps/<id>/{app.json, <id>-app.exe, icon}`.
5. Build the launcher.
6. Package one installer containing the launcher + `apps/` + the node binary.

Extensibility: a new app is a new `apps/<id>/` entry produced by step 3–4; the launcher and installer logic are unchanged. (A future "remote catalog / app store" can layer on top of this same manifest + apps-dir model, but is out of scope here.)

## Error handling & robustness

- **Process isolation:** an app crash/hang cannot take down the launcher or sibling apps; the supervisor detects non-zero/unexpected exit and surfaces it in the grid (with a relaunch affordance).
- **Bad manifest:** skipped + logged; scan continues.
- **Node not ready:** launcher gates launching; app-shell shows a retryable "node unreachable" state instead of a blank/broken window.
- **Duplicate launch:** `singleInstance` focuses the existing window.
- **Launcher quit:** optional setting to close child apps on exit (default: leave them running).

## Testing

- **Registry:** manifest parse/validate — valid, missing-required-field, `exec`-outside-dir, duplicate `id`, absent icon; scan of a temp `apps/` tree.
- **Supervisor:** spawn + track; single-instance focus; exit/crash detection; relaunch. (Use a trivial stub "app" binary in tests.)
- **app-shell:** `.rpc_addr`/`.cookie` discovery from a temp data dir; "node unreachable" fallback.
- **e2e smoke:** launcher (with a running node) spawns a real app → app connects to RPC and issues one authenticated call.

## Migration path (incremental, each step shippable)

1. **app-shell + first app:** extract the shared `app-shell`; stand up `feed-app` end-to-end (reads data-dir, connects, renders feed-client) alongside the existing bundle.
2. **Launcher core:** registry + supervisor + app grid, replacing the iframe switcher; launch `feed-app`.
3. **Migrate remaining clients:** `chat/forum/search/wiki` → `<id>-app` via the template.
4. **Deep-link routing:** move `swim://` ownership to the launcher; forward to apps.
5. **Remove old embedding:** delete the iframe-embedding path from the shell.

## Naming

- Installed product / node host: **Swimchain Launcher** (window title "Swimchain").
- Apps: **Swimchain Feed**, **Swimchain Chat**, etc.

## Non-goals (this design)

- Remote app catalog / downloadable app store (the manifest + apps-dir model is forward-compatible with it, but not built here).
- Per-app scoped RPC tokens / permissions (apps use the node cookie like the CLI; a brokered-token model can be added later without changing the manifest contract).
- Any change to the node's protocol, RPC methods, or identity model.
- Mobile (`mobile-app` in-process node) is unaffected.
