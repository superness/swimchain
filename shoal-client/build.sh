#!/bin/bash
# Build script for The Shoal desktop shell.
#
# Mirrors trench-client/build.sh, trimmed to what this shell needs. Without steps 1-2
# the build dies inside tauri_build with "glob pattern binaries/sw* path not found",
# which reads like a config bug rather than "the sidecar was never staged" —
# src-tauri/build.rs catches that case up front, and this script is what prevents it.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Building The Shoal ==="

# Step 1: Build the Rust node binary — this is the sidecar the shell ships.
echo ""
echo "Step 1: Building swimchain node (sw)..."
cd "$PROJECT_ROOT"
cargo build --release

# Step 2: Stage the sidecar where tauri.conf.json's BASE resource glob ("binaries/sw*",
# so it matches `sw` and `sw.exe` alike and does NOT sweep up binaries/.gitignore)
# expects it. src-tauri/build.rs hashes this
# against the fresh build and fails if it is stale OR if it cannot check — so a rebuilt
# node never ships behind a stale bundled copy, and a build with nothing to compare
# against stops rather than shipping an unverified one. The one deliberate escape is
# SHOAL_ALLOW_UNVERIFIED_SIDECAR=1, for a downstream packager that stages a prebuilt
# binary and never checks out target/release at all.
#
# NOTE: this is a Tauri *resource*, not a Tauri `externalBin` sidecar — which is why the
# file keeps its plain name. `externalBin` is the mechanism that demands a
# `-<target-triple>` suffix; resources are copied verbatim and looked up by
# `resource_dir().join("binaries").join("sw.exe")` in src-tauri/src/main.rs. Renaming it
# to `sw-x86_64-pc-windows-msvc.exe` would BREAK that lookup.
echo ""
echo "Step 2: Staging bundled node binary..."
mkdir -p "$SCRIPT_DIR/src-tauri/binaries"

case "$(uname -s)" in
    Linux*|Darwin*)
        cp "$PROJECT_ROOT/target/release/sw" "$SCRIPT_DIR/src-tauri/binaries/sw"
        chmod +x "$SCRIPT_DIR/src-tauri/binaries/sw"
        ;;
    MINGW*|CYGWIN*|MSYS*)
        cp "$PROJECT_ROOT/target/release/sw.exe" "$SCRIPT_DIR/src-tauri/binaries/sw.exe"
        ;;
    *)
        echo "Unknown OS: $(uname -s)"
        exit 1
        ;;
esac

# Step 3: Install deps and build the web view into dist/ (tauri.conf.json's
# frontendDist). `tauri build` runs the build itself via beforeBuildCommand, but a bare
# `cargo build`/`cargo test` in src-tauri does not — so do it explicitly here and the
# crate compiles either way.
echo ""
echo "Step 3: Installing dependencies and building the view..."
cd "$SCRIPT_DIR"
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi
npm run build

# Step 4: Bundle.
echo ""
echo "Step 4: Building Tauri application..."
npm run app:build

echo ""
echo "=== Build Complete ==="
ls -la "$SCRIPT_DIR/src-tauri/target/release/bundle/"* 2>/dev/null \
    || echo "Check src-tauri/target/release/bundle/ for output"
