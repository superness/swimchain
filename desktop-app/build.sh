#!/bin/bash
# Build script for Swimchain Desktop App

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Building Swimchain Desktop App ==="

# Step 1: Build the Rust node binary
echo ""
echo "Step 1: Building swimchain node (sw)..."
cd "$PROJECT_ROOT"
cargo build --release

# Step 2: Prepare binaries directory
echo ""
echo "Step 2: Preparing bundled binaries..."
mkdir -p "$SCRIPT_DIR/src-tauri/binaries"

# Detect platform and copy appropriate binary
case "$(uname -s)" in
    Linux*)
        cp "$PROJECT_ROOT/target/release/sw" "$SCRIPT_DIR/src-tauri/binaries/sw"
        chmod +x "$SCRIPT_DIR/src-tauri/binaries/sw"
        ;;
    Darwin*)
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

# Step 3: Build swimchain-js (@swimchain/core)
echo ""
echo "Step 3: Building swimchain-js..."
cd "$PROJECT_ROOT/swimchain-js"
npm install
npm run build

# Step 4: Build swimchain-react (@swimchain/react)
echo ""
echo "Step 4: Building swimchain-react..."
cd "$PROJECT_ROOT/swimchain-react"
npm install
npm run build

# Step 5: Build swimchain-frontend (@swimchain/frontend)
echo ""
echo "Step 5: Building swimchain-frontend..."
cd "$PROJECT_ROOT/swimchain-frontend"
npm install
npm run build

# Step 6: Build all clients
echo ""
echo "Step 6: Building all clients..."

CLIENTS=("forum-client" "chat-client" "feed-client" "search-client")

for CLIENT in "${CLIENTS[@]}"; do
    echo ""
    echo "  Building $CLIENT..."
    CLIENT_DIR="$PROJECT_ROOT/$CLIENT"

    if [ -d "$CLIENT_DIR" ]; then
        cd "$CLIENT_DIR"
        npm install
        npm run build

        # Copy to desktop-app public/clients
        DEST_DIR="$SCRIPT_DIR/public/clients/$CLIENT"
        rm -rf "$DEST_DIR"
        mkdir -p "$DEST_DIR"
        cp -r "$CLIENT_DIR/dist/"* "$DEST_DIR/"
        echo "  Copied $CLIENT to public/clients/$CLIENT"
    else
        echo "  Warning: $CLIENT directory not found, skipping..."
    fi
done

# Step 7: Install desktop-app npm dependencies
echo ""
echo "Step 7: Installing desktop-app npm dependencies..."
cd "$SCRIPT_DIR"
npm install

# Step 8: Build the Tauri app
echo ""
echo "Step 8: Building Tauri application..."
npm run tauri:build

echo ""
echo "=== Build Complete ==="
echo ""
echo "Clients bundled:"
for CLIENT in "${CLIENTS[@]}"; do
    echo "  - $CLIENT"
done
echo ""
echo "Output files:"
ls -la "$SCRIPT_DIR/src-tauri/target/release/bundle/"* 2>/dev/null || echo "Check src-tauri/target/release/bundle/ for output"
