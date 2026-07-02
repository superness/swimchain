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

The node listens on a fixed port per network (see below). If you open multiple windows:
- First window starts the node
- Additional windows connect to the existing node
- All share the same local data

The status bar client selector switches between the bundled clients:
Forum, Chat, Feed, Search, and Wiki (`desktop-app/scripts/build-clients.js`).

## Networks

The network is selectable at onboarding/unlock and from the status bar while
running (switching stops the node). The selection is persisted in
`<config dir>/swimchain-desktop/settings.json` and used on the next launch.

RPC port is always the node's default P2P port + 1 (`src/network/mode.rs`):

| Network | P2P port | RPC port | Data dir suffix |
|---------|----------|----------|-----------------|
| Mainnet | 9735 | 9736 | (none) |
| Testnet (default) | 19735 | 19736 | `-testnet` |
| Regtest | 29735 | 29736 | `-regtest` |

Each network has its own data directory and therefore its own identity - if
you switch to a network you haven't used before, you'll go through onboarding
for that network.

## Identity Model

There are two kinds of identity in the desktop bundle:

1. **Node identity** (managed by the shell): created at onboarding, stored
   encrypted at `<data dir>/identity.enc`, unlocked with your password. It is
   used for node operations (P2P, block signing) and for clients that support
   node-managed remote signing via the `sign_message` RPC (forum-client does
   this). The shell shares only the identity's *public* address and display
   name with embedded clients - the seed/private key never leaves the node.

2. **Per-client keypairs**: clients that manage their own browser-side
   keypair (localStorage) keep doing so. They work independently of the node
   identity.

The shell passes config to each embedded client iframe via `postMessage`:

```js
{
  type: 'SWIMCHAIN_RPC_CONFIG',
  rpcEndpoint: 'http://127.0.0.1:19736',
  rpcAuth: 'Basic ...',          // cookie auth for the local node RPC
  nodeAddress: 'cs1...',         // optional: node identity public address
  nodeDisplayName: 'Alice'       // optional: node identity display name
}
```

Clients consume this through `useParentRpcConfig` (shared implementation in
`swimchain-frontend/src/hooks/useParentRpcConfig.ts`; several clients carry a
local copy). Clients may use `nodeAddress` to display "node identity: cs1..."
and prefer node-managed signing where they support it; otherwise they fall
back to their own keypair.
