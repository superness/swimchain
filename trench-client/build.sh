#!/bin/bash
# Build script for The Trench (TheTrench.exe).
#
# Mirrors desktop-app/build.sh, trimmed to what this shell actually needs: the
# node binary staged as the bundled sidecar, the game UI built into ui/dist, and
# the Tauri bundle. Without steps 1-2 the build dies inside tauri_build with
# "glob pattern binaries/*.exe path not found", which reads like a config bug
# rather than "the sidecar was never staged" — src-tauri/build.rs now catches
# that case up front, and this script is the thing that prevents it.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Building The Trench ==="

# Step 1: Build the Rust node binary — this is the sidecar the shell ships.
echo ""
echo "Step 1: Building swimchain node (sw)..."
cd "$PROJECT_ROOT"
cargo build --release

# Step 2: Stage the sidecar where tauri.windows.conf.json's resource glob
# ("binaries/*.exe") expects it. src-tauri/build.rs hashes this against the
# fresh build and fails if it's stale, so a rebuilt node never ships behind a
# stale bundled copy.
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

# Step 3: Install/build the sibling packages the UI links against
# (@swimchain/core = swimchain-js, @swimchain/react = swimchain-react, both
# `file:` deps). Their dist/ is committed, but that is NOT enough: Vite follows
# the link into swimchain-react/dist and resolves its `@swimchain/core` import
# against swimchain-react's OWN node_modules, which a fresh checkout doesn't
# have. Skipping this fails the UI build with "Rollup failed to resolve import
# @swimchain/core from swimchain-react/dist/hooks/usePow.js" — mirrors
# desktop-app/build.sh steps 3-4.
echo ""
echo "Step 3: Building local packages (@swimchain/core, @swimchain/react)..."
for PKG in swimchain-js swimchain-react; do
    echo ""
    echo "  Building $PKG..."
    cd "$PROJECT_ROOT/$PKG"
    npm install
    npm run build
done

# Step 4: Build the game UI into ui/dist (tauri.conf.json's frontendDist).
# `tauri build` runs this itself via beforeBuildCommand, but a bare
# `cargo build`/`cargo test` in src-tauri does not — so do it explicitly here
# and the crate compiles either way.
echo ""
echo "Step 4: Building game UI..."
cd "$SCRIPT_DIR/ui"
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi
npm run build

# Step 5: Install the shell's own npm deps (@tauri-apps/cli).
echo ""
echo "Step 5: Installing shell dependencies..."
cd "$SCRIPT_DIR"
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi

# Step 6: Bundle.
echo ""
echo "Step 6: Building Tauri application..."
npm run build

echo ""
echo "=== Build Complete ==="
echo ""
echo "Output files:"
ls -la "$SCRIPT_DIR/src-tauri/target/release/bundle/"* 2>/dev/null \
    || echo "Check src-tauri/target/release/bundle/ for output"
