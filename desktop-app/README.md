# Swimchain Desktop

A desktop application for the Swimchain decentralized social network.

## What This Is

When you run Swimchain Desktop:
1. It starts a **local node** that connects to the Swimchain network
2. You browse spaces and posts through a clean UI
3. All data is stored locally on your machine
4. You are running a full node - contributing to the network

**You don't need to know you're running a node. You just use the app.**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Swimchain Desktop                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    React UI                          │    │
│  │         (forum-style interface)                      │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          │ RPC (localhost)                  │
│  ┌───────────────────────▼─────────────────────────────┐    │
│  │              Embedded Node (sw)                      │    │
│  │    • Connects to network peers                       │    │
│  │    • Syncs blockchain                                │    │
│  │    • Validates content                               │    │
│  │    • Performs PoW for your posts                     │    │
│  └───────────────────────┬─────────────────────────────┘    │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   NETWORK    │
                    │  (P2P mesh)  │
                    └──────────────┘
```

## Building

### Prerequisites

- Rust (latest stable)
- Node.js 18+
- npm

### Windows

```powershell
.\build.ps1
```

Output: `src-tauri\target\release\bundle\msi\Swimchain_0.1.0_x64_en-US.msi`

### Linux

```bash
./build.sh
```

Output: `src-tauri/target/release/bundle/deb/swimchain_0.1.0_amd64.deb`

### macOS

```bash
./build.sh
```

Output: `src-tauri/target/release/bundle/macos/Swimchain.app`

## Development

Run in dev mode (hot reload):

```bash
npm install
npm run tauri:dev
```

This requires the `sw` binary to exist. You can build it with:

```bash
cd ..
cargo build --release
mkdir -p desktop-app/src-tauri/binaries
cp target/release/sw desktop-app/src-tauri/binaries/
```

## How It Works

1. **On launch**: Tauri starts the embedded `sw` node as a child process
2. **Node startup**: Node connects to network peers and begins syncing
3. **RPC connection**: React UI connects to node via localhost RPC
4. **Data display**: UI fetches spaces, posts, etc. from local node
5. **On close**: Node is gracefully stopped

## Multiple Clients

The node listens on a fixed port (19736 for testnet). If you open multiple windows:
- First window starts the node
- Additional windows connect to the existing node
- All share the same local data

## Networks

- **Testnet** (default): Port 19736 - For testing
- **Mainnet**: Port 9100 - Production network
- **Regtest**: Port 29100 - Local development

To change networks, modify `src-tauri/src/main.rs` or add a settings UI.
