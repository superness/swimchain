# Phase 2 Smoke Test Procedure

## Step 1: Launcher Grid + Feed-App Launch

1. Ensure `launcher-apps/feed/feed-app.exe` is built and present on disk
2. Run launcher in dev mode: `npm run dev` (default port 5173)
3. Unlock and start a local node (regtest mode with `--listen 127.0.0.1:29735`)
4. Navigate to launcher home; expect the app grid to render with a "Swimchain Feed" tile
5. Click the tile; expect a separate `feed-app.exe` window to open with the feed client
6. Click the tile again; expect single-instance behavior — focus shifts to the existing feed-app window, no new window opens

## Smoke result (2026-07-12)

**Verifiable now (headless):**

- ✓ `launcher-apps/feed/app.json` exists; `exec` field = `"feed-app.exe"`
- ✗ `launcher-apps/feed/feed-app.exe` **ABSENT** (git-ignored; built by Phase 1 Task 6 `build.ps1`; not present in this fresh worktree)
- ✓ Backend commands `list_apps` and `launch_app` are wired (Tasks 1-2 commits on this branch; verified by recent commit history)

**Not verifiable without GUI:**

- Grid rendering with the Swimchain Feed tile
- Separate window opens on first click
- Single-instance focus on second click

These visual behaviors require an operator running the launcher GUI (or rebuilding the installer) and cannot be verified headlessly or via unit/integration tests.
