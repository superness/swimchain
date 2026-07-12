# Launcher Phase 2: registry + app grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the launcher a real launcher: a **registry** (`list_apps` scanning `launcher-apps/*/app.json`) drives an **app-grid home screen** that replaces the iframe client-switcher, and clicking a tile spawns that app as its own window via the existing `launch_app`. Bundle the apps so the packaged launcher finds them.

**Architecture:** Reuses Phase 1's `Supervisor`/`launch_app`/`app_manifest` (already on main). Adds a Rust `registry` module + `list_apps` command in `desktop-app/src-tauri`, an `AppGrid` React component that replaces the `ClientFrame` render in `App.tsx`'s "ready" stage, and Tauri bundle-resource config so `resolve_app_dir`'s prod path resolves.

**Tech Stack:** Rust, Tauri 2, TypeScript/React (Vite), the existing `app_manifest::{AppManifest, parse_manifest}`.

## Global Constraints

- Reuse Phase 1 (on main): `desktop-app/src-tauri/src/app_manifest.rs` (`AppManifest{id,name,icon:Option,exec,version:Option,single_instance}` + `parse_manifest`), `supervisor.rs` (`Supervisor::launch`), and the `launch_app(app: AppHandle, state, app_id)` command + `resolve_app_dir` (dev = repo `launcher-apps/<id>`, prod = `resource_dir()/apps/<id>`).
- Apps launch as SEPARATE processes (Phase 1); the grid only lists + triggers `launch_app`. The launcher UI is NOT an iframe host anymore for the ready stage.
- Do NOT change the node, identity, onboarding, unlock, or network logic in `App.tsx` — only the "ready" stage's main content (the `ClientFrame` + client switcher) is replaced by the grid.
- Manifest icons are optional; the grid must render a default tile when `icon` is absent or unresolved.
- Phase-2 non-goals (defer, do not build): dedup `app_manifest.rs` into a shared crate; per-app shell templating (per-app window title/icon); deep-link routing; migrating chat/forum/search/wiki to their own app exes. Feed is the only app exe that exists yet — the grid lists whatever manifests are present.

## File structure

- Create `desktop-app/src-tauri/src/registry.rs` — scans `launcher-apps/*/app.json` (dev) or `resource_dir()/apps/*/app.json` (prod) → `Vec<AppEntry>`.
- Modify `desktop-app/src-tauri/src/main.rs` — `mod registry;`, add `list_apps` command, register it, and bundle-resource + `resolve_app_dir` prod verification.
- Modify `desktop-app/src-tauri/tauri.conf.json` — bundle `launcher-apps/` (or the built `apps/` tree) as a resource so prod `resource_dir()/apps` exists.
- Create `desktop-app/src/components/AppGrid.tsx` — the grid home (calls `list_apps`, tiles call `launch_app`).
- Modify `desktop-app/src/App.tsx` — replace the ready-stage `ClientFrame`/switcher render with `<AppGrid/>`.

---

### Task 1: Registry module — scan manifests into AppEntry

**Files:**
- Create: `desktop-app/src-tauri/src/registry.rs`
- Test: same file, `#[cfg(test)] mod tests`

**Interfaces:**
- Consumes: `crate::app_manifest::parse_manifest` (Phase 1).
- Produces: `#[derive(serde::Serialize)] pub struct AppEntry { pub id: String, pub name: String, pub icon: Option<String>, pub version: Option<String> }` and `pub fn scan_apps(apps_root: &std::path::Path) -> Vec<AppEntry>`. `scan_apps` reads each immediate subdir's `app.json`, parses it, and returns entries sorted by `name`. A subdir without a valid `app.json` is skipped (logged), never panics. `icon` is returned as an ABSOLUTE path string when the manifest's `icon` file exists in that app dir, else `None`.

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_app(root: &std::path::Path, id: &str, json: &str, with_icon: bool) {
        let d = root.join(id);
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("app.json"), json).unwrap();
        if with_icon { fs::write(d.join("icon.png"), b"x").unwrap(); }
    }

    #[test]
    fn scans_valid_apps_sorted_by_name_and_resolves_icon() {
        let dir = tempfile::tempdir().unwrap();
        write_app(dir.path(), "feed",
            r#"{"id":"feed","name":"Swimchain Feed","icon":"icon.png","exec":"feed-app.exe","version":"0.1.0"}"#, true);
        write_app(dir.path(), "aaa",
            r#"{"id":"aaa","name":"Alpha","exec":"a.exe"}"#, false);
        let entries = scan_apps(dir.path());
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "Alpha");           // sorted by name
        assert_eq!(entries[1].name, "Swimchain Feed");
        assert!(entries[0].icon.is_none());             // no icon file
        assert!(entries[1].icon.as_ref().unwrap().ends_with("icon.png")); // resolved abs path
    }

    #[test]
    fn skips_invalid_and_missing_manifests() {
        let dir = tempfile::tempdir().unwrap();
        write_app(dir.path(), "good", r#"{"id":"g","name":"G","exec":"g.exe"}"#, false);
        fs::create_dir_all(dir.path().join("nomanifest")).unwrap();       // no app.json
        write_app(dir.path(), "bad", "not json{", false);                 // invalid
        let entries = scan_apps(dir.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "g");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop-app/src-tauri && cargo test registry`
Expected: FAIL — `scan_apps`/`AppEntry` not found.

- [ ] **Step 3: Write minimal implementation**

```rust
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,   // absolute path when the icon file exists, else None
    pub version: Option<String>,
}

/// Scan `apps_root` for `*/app.json` manifests → sorted `Vec<AppEntry>`.
/// Invalid/missing manifests are skipped (logged), never fatal.
pub fn scan_apps(apps_root: &Path) -> Vec<AppEntry> {
    let mut out = Vec::new();
    let Ok(read) = std::fs::read_dir(apps_root) else { return out; };
    for entry in read.flatten() {
        let dir = entry.path();
        if !dir.is_dir() { continue; }
        let manifest_path = dir.join("app.json");
        let Ok(json) = std::fs::read_to_string(&manifest_path) else { continue; };
        let m = match crate::app_manifest::parse_manifest(&json) {
            Ok(m) => m,
            Err(e) => { log::warn!("[registry] skip {}: {e}", dir.display()); continue; }
        };
        let icon = m.icon.as_ref().and_then(|name| {
            let p = dir.join(name);
            p.exists().then(|| p.to_string_lossy().to_string())
        });
        out.push(AppEntry { id: m.id, name: m.name, icon, version: m.version });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test registry`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop-app/src-tauri/src/registry.rs
git commit -m "feat(launcher): registry module — scan launcher-apps/*/app.json into AppEntry"
```

---

### Task 2: `list_apps` command + apps-root resolution (dev/prod) + bundle resources

**Files:**
- Modify: `desktop-app/src-tauri/src/main.rs`
- Modify: `desktop-app/src-tauri/tauri.conf.json`

**Interfaces:**
- Produces: `#[tauri::command] fn list_apps(app: tauri::AppHandle) -> Vec<registry::AppEntry>` returning the scan of the apps root. Consumed by `AppGrid.tsx` (Task 3).

- [ ] **Step 1: Add `list_apps` + a shared apps-root resolver**

In `main.rs` add `mod registry;`. Factor the apps-root out of `resolve_app_dir` into a helper so both agree:
```rust
/// Root dir that holds per-app folders: dev = repo `launcher-apps`, prod = `<resource_dir>/apps`.
fn apps_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    if cfg!(debug_assertions) {
        Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent().unwrap()          // src-tauri -> desktop-app
            .parent().unwrap()          // desktop-app -> repo root
            .join("launcher-apps"))
    } else {
        app.path().resource_dir().map_err(|e| e.to_string()).map(|r| r.join("apps"))
    }
}

#[tauri::command]
fn list_apps(app: tauri::AppHandle) -> Vec<registry::AppEntry> {
    match apps_root(&app) {
        Ok(root) => registry::scan_apps(&root),
        Err(e) => { log::warn!("[registry] apps_root: {e}"); Vec::new() }
    }
}
```
Refactor `resolve_app_dir` to `apps_root(app)?.join(app_id)` so dev/prod paths are defined in one place. Register `list_apps` in `generate_handler![...]` (next to `launch_app`).

- [ ] **Step 2: Bundle the apps as a resource (prod)**

In `tauri.conf.json` under `bundle`, add `"resources"` so the packaged app ships the apps tree at `resource_dir()/apps`. Because the build stages built app exes under `launcher-apps/<id>/`, bundle that:
```json
"bundle": {
  "resources": { "../../launcher-apps": "apps" }
}
```
(Adjust the source path to the repo-relative location of `launcher-apps` from `desktop-app/src-tauri`; the key maps source dir → the `apps` name under `resource_dir()`. Confirm against Tauri 2 resource-map syntax used elsewhere in the repo, e.g. how `binaries/` is declared.)

- [ ] **Step 3: Build to verify**

Run: `cd desktop-app/src-tauri && cargo build`
Expected: compiles; `generate_handler!` includes `list_apps`.

- [ ] **Step 4: Commit**

```bash
git add desktop-app/src-tauri/src/main.rs desktop-app/src-tauri/tauri.conf.json
git commit -m "feat(launcher): list_apps command + apps-root dev/prod resolver + bundle apps resource"
```

---

### Task 3: `AppGrid` component + wire into App.tsx ready stage

**Files:**
- Create: `desktop-app/src/components/AppGrid.tsx`
- Modify: `desktop-app/src/App.tsx` (ready-stage render only)

**Interfaces:**
- Consumes: Tauri commands `list_apps` → `AppEntry[]` and `launch_app({ appId })`.
- Produces: `<AppGrid />` — default export React component; self-contained (fetches its own list on mount).

- [ ] **Step 1: Write `AppGrid.tsx`**

```tsx
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface AppEntry { id: string; name: string; icon: string | null; version: string | null; }

export default function AppGrid(): JSX.Element {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [launching, setLaunching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppEntry[]>("list_apps")
      .then(setApps)
      .catch((e) => setError(String(e)));
  }, []);

  const open = useCallback(async (id: string) => {
    setLaunching(id); setError(null);
    try { await invoke("launch_app", { appId: id }); }
    catch (e) { setError(`Failed to launch ${id}: ${e}`); }
    finally { setLaunching(null); }
  }, []);

  if (error) return <div className="app-grid-error">{error}</div>;
  if (apps.length === 0) return <div className="app-grid-empty">No apps installed.</div>;

  return (
    <div className="app-grid">
      {apps.map((a) => (
        <button key={a.id} className="app-tile" disabled={launching === a.id} onClick={() => open(a.id)}>
          {a.icon
            ? <img className="app-tile-icon" src={convertFileSrc(a.icon)} alt="" />
            : <div className="app-tile-icon app-tile-icon--default">{a.name.charAt(0)}</div>}
          <span className="app-tile-name">{a.name}</span>
          {launching === a.id && <span className="app-tile-spinner">Opening…</span>}
        </button>
      ))}
    </div>
  );
}
```

Add minimal CSS in the existing App stylesheet (`desktop-app/src/App.css` or wherever App styles live): `.app-grid` (flex/grid of tiles), `.app-tile` (button, column, ~120px), `.app-tile-icon` (64px square), `.app-tile-icon--default` (centered letter), `.app-grid-empty/.app-grid-error` (muted centered text). Follow the existing stylesheet's variables/patterns.

- [ ] **Step 2: Wire into `App.tsx`**

Replace the ready-stage main content. Currently (~line 691) the ready stage renders `<ClientFrame client={selectedClient} .../>` with a client switcher (`onClientChange={setSelectedClient}`, ~line 686). Replace that block with `<AppGrid />`. Remove the now-unused `selectedClient`/`setSelectedClient` state and the `ClientType` switcher UI (Step 3). Import: `import AppGrid from "./components/AppGrid";`. Keep everything else (onboarding/unlock/status/network/invite) untouched.

- [ ] **Step 3: Remove the dead switcher wiring**

Delete `const [selectedClient, setSelectedClient] = useState<ClientType>("forum");` (line ~78), the `ClientType` type (~line 32) if now unused, the `ClientFrame` import (~line 14), and any client-selector JSX that fed `onClientChange`. Run `npx tsc --noEmit` in `desktop-app` — fix any references the removal surfaced.

- [ ] **Step 4: Typecheck**

Run: `cd desktop-app && npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add desktop-app/src/components/AppGrid.tsx desktop-app/src/App.tsx desktop-app/src/App.css
git commit -m "feat(launcher): app-grid home replaces the iframe client switcher"
```

---

### Task 4: End-to-end — grid lists feed, tile launches feed-app window

**Files:**
- Create/append: `docs/superpowers/plans/notes/phase2-smoke.md`

- [ ] **Step 1: Write the smoke procedure**

```md
1. Ensure `launcher-apps/feed/feed-app.exe` exists (Phase 1 Task 6 / build.ps1 step).
2. Run the launcher in dev: `cd desktop-app && npm run tauri dev` (or the packaged build).
3. Unlock/start the node as usual → reach the ready stage.
4. Expect: an app grid showing a "Swimchain Feed" tile (from launcher-apps/feed/app.json),
   not the old iframe/switcher.
5. Click the tile → a SEPARATE "Swimchain Feed" window opens (feed-app.exe), running the
   feed UI in node mode against the launcher's node.
6. Click again → single-instance focuses the existing window (does not open a second).
```

- [ ] **Step 2: Run it (dev) and record the actual result** into the file (headless note: window render is an operator visual check; at minimum confirm `list_apps` returns the feed entry and `launch_app` spawns a feed-app process).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/notes/phase2-smoke.md
git commit -m "test(launcher): phase-2 e2e smoke — grid lists + launches feed-app"
```

---

## Self-review

- **Spec coverage (Phase 2 slice):** registry-scan-of-a-dir ✓ (Task 1), app grid replacing the switcher ✓ (Task 3), wire launch_app to the grid ✓ (Task 3), packaged apps resolution ✓ (Task 2 bundle + prod apps_root). Dedup-manifest-crate, per-app templating, deep-links, and migrating the other 4 clients are explicitly deferred (Global Constraints / non-goals).
- **Placeholders:** none — Rust + React code is complete. The two "confirm against repo/Tauri" notes are Task 2's bundle-resource syntax (verify against the existing `binaries/` declaration) and the App.css class placement (follow the existing stylesheet) — both are "match the existing pattern," not TODOs.
- **Type consistency:** `AppEntry{id,name,icon,version}` is identical in `registry.rs` (Task 1) and `AppGrid.tsx`'s interface (Task 3); `list_apps` (Task 2) returns `Vec<AppEntry>`; `launch_app({appId})` matches Phase 1's `launch_app(app_id: String)` command (Tauri snake→camel arg mapping).

## Follow-ups (separate plans)
- Dedup `app_manifest.rs` into a shared `swim-app-manifest` crate used by both the launcher and app-shell.
- Per-app shell templating (window title/icon/productName per app).
- Phase 3: migrate chat/forum/search/wiki to their own `<id>-app` exes (each gets a `launcher-apps/<id>/`).
- Phase 4: deep-link (`swim://`) routing through the launcher.
- Hardenings: `embed.js` postMessage target origin → `window.location.origin`; `Supervisor::spawn_raw_single` TOCTOU.
