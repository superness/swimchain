# Desktop Platform Feature Documentation

**Section**: 25. Desktop Platform
**Owner Area**: `desktop-app/`
**Status**: Partially Complete
**Last Updated**: 2026-01-12 (Revised)

---

## Overview

The Swimchain Desktop Platform is a native desktop application built with Tauri 2.x (Rust + React). It provides a self-contained environment that bundles a full Swimchain node, allowing users to participate in the decentralized network without technical knowledge. The app manages the complete lifecycle of an embedded node while presenting client applications in a clean, integrated UI.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Swimchain Desktop (Tauri)                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    React UI                          │    │
│  │    ┌──────────────────────────────────────────┐     │    │
│  │    │          NodeStatusBar                   │     │    │
│  │    │  [Status] [Network] [Peers] [Identity]   │     │    │
│  │    └──────────────────────────────────────────┘     │    │
│  │    ┌──────────────────────────────────────────┐     │    │
│  │    │          ClientFrame (iframe)            │     │    │
│  │    │    forum-client / chat-client / etc.     │     │    │
│  │    └──────────────────────────────────────────┘     │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          │ postMessage (RPC config)         │
│  ┌───────────────────────▼─────────────────────────────┐    │
│  │              Tauri Rust Backend                      │    │
│  │    ┌────────────────────────────────────────────┐   │    │
│  │    │            NodeManager                      │   │    │
│  │    │  • spawn/stop sw binary                     │   │    │
│  │    │  • read auth cookie                         │   │    │
│  │    │  • monitor process health                   │   │    │
│  │    └────────────────────────────────────────────┘   │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          │ spawn process                    │
│  ┌───────────────────────▼─────────────────────────────┐    │
│  │              Embedded Node (sw binary)               │    │
│  │    • Connects to network peers                       │    │
│  │    • Syncs blockchain                                │    │
│  │    • Exposes JSON-RPC on localhost                   │    │
│  │    • Validates content                               │    │
│  └───────────────────────┬─────────────────────────────┘    │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   NETWORK    │
                    │  (P2P mesh)  │
                    └──────────────┘
```

---

## Data Structures

### AppState (Rust - Tauri Backend)

```rust
// desktop-app/src-tauri/src/main.rs:12-17
struct AppState {
    node_manager: Arc<Mutex<NodeManager>>,  // Controls node process lifecycle
    binary_path: PathBuf,                    // Path to bundled `sw` binary
    data_dir: PathBuf,                       // Actual data dir with network suffix (e.g., swimchain-testnet)
    data_dir_base: PathBuf,                  // Base data dir without suffix (what CLI uses)
}
```

**Purpose**: Central state container passed through Tauri's state management. Thread-safe via Arc<Mutex<>>.

### NodeManager

```rust
// desktop-app/src-tauri/src/node_manager.rs:7-14
pub struct NodeManager {
    binary_path: PathBuf,           // Path to `sw` executable
    data_dir: PathBuf,              // Base path (without network suffix)
    data_dir_with_suffix: PathBuf,  // Actual path with -testnet/-regtest suffix
    network: String,                // "mainnet" | "testnet" | "regtest"
    process: Option<Child>,         // Child process handle when running
    rpc_port: u16,                  // Port for RPC communication
}
```

**Purpose**: Manages the embedded Swimchain node's lifecycle - starting, stopping, and querying status.
**Used by**: `AppState` holds a shared reference.

### NodeStatus

```rust
// desktop-app/src-tauri/src/main.rs:153-159
#[derive(serde::Serialize)]
struct NodeStatus {
    running: bool,       // Whether node process is active
    rpc_port: u16,       // RPC port for localhost connection
    peer_count: usize,   // Number of connected peers
    network: String,     // Current network name
}
```

**Purpose**: Serialized status response sent to frontend via Tauri command.

### IdentityInfo

```rust
// desktop-app/src-tauri/src/main.rs:161-166
#[derive(serde::Serialize)]
struct IdentityInfo {
    exists: bool,              // Whether identity.enc file exists
    name: Option<String>,      // Display name (currently unused)
    address: Option<String>,   // cs1-prefixed address derived from pubkey
}
```

**Purpose**: Identity information extracted from the encrypted identity file.

### Frontend Types (TypeScript)

```typescript
// desktop-app/src/App.tsx:16-30
interface NodeStatus {
  running: boolean;
  rpc_port: number;
  peer_count: number;
  network: string;
}

interface IdentityInfo {
  exists: boolean;
  name: string | null;
  address: string | null;
}

type AppStage = "checking" | "onboarding" | "unlock" | "starting" | "ready" | "error";
type ClientType = "forum" | "chat" | "feed" | "search";
```

### ParentRpcConfig (Client Communication)

```typescript
// forum-client/src/hooks/useParentRpcConfig.ts:14-17
interface ParentRpcConfig {
  rpcEndpoint: string;  // e.g., "http://127.0.0.1:19736"
  rpcAuth: string;      // e.g., "Basic <base64>"
}
```

**Purpose**: Configuration sent from desktop app to embedded client apps via postMessage.

---

## Public APIs

### Tauri Commands (Rust -> Frontend)

#### get_node_status()

```rust
// desktop-app/src-tauri/src/main.rs:19-28
#[tauri::command]
async fn get_node_status(state: tauri::State<'_, AppState>) -> Result<NodeStatus, String>
```

**Purpose**: Returns current node status including running state, RPC port, peer count, and network.
**Called from**: `App.tsx` - polled every 5 seconds when in "ready" stage
**Side effects**: Makes RPC call to node for peer count if running

#### start_node()

```rust
// desktop-app/src-tauri/src/main.rs:30-34
#[tauri::command]
async fn start_node(state: tauri::State<'_, AppState>, password: String) -> Result<(), String>
```

**Purpose**: Starts the embedded node with the provided password for identity decryption.
**Called from**: `App.tsx` after unlock or identity creation
**Side effects**:
- Spawns `sw node start` as child process
- Sets `SWIMCHAIN_PASSWORD` environment variable
- Captures stdout/stderr for logging

#### stop_node()

```rust
// desktop-app/src-tauri/src/main.rs:36-40
#[tauri::command]
async fn stop_node(state: tauri::State<'_, AppState>) -> Result<(), String>
```

**Purpose**: Gracefully stops the running node.
**Called from**: Window close event handler
**Side effects**:
- Sends SIGTERM on Unix, kills on Windows
- Waits up to 5 seconds for graceful shutdown
- Force kills if timeout exceeded

#### get_rpc_endpoint()

```rust
// desktop-app/src-tauri/src/main.rs:42-46
#[tauri::command]
async fn get_rpc_endpoint(state: tauri::State<'_, AppState>) -> Result<String, String>
```

**Purpose**: Returns the localhost RPC endpoint URL for the running node.
**Returns**: `"http://127.0.0.1:{port}"` where port is network-dependent

#### get_rpc_auth()

```rust
// desktop-app/src-tauri/src/main.rs:48-69
#[tauri::command]
async fn get_rpc_auth(state: tauri::State<'_, AppState>) -> Result<String, String>
```

**Purpose**: Reads the `.cookie` file and returns HTTP Basic auth header value.
**Returns**: `"Basic {base64(__cookie__:{cookie_value})}"`
**Errors**: If cookie file not found (node not running)

#### check_identity()

```rust
// desktop-app/src-tauri/src/main.rs:71-115
#[tauri::command]
async fn check_identity(state: tauri::State<'_, AppState>) -> Result<IdentityInfo, String>
```

**Purpose**: Checks if encrypted identity file exists and extracts address.
**Process**:
1. Looks for `{data_dir}/identity.enc`
2. Verifies magic bytes (`CSID`) and minimum length (37 bytes)
3. Extracts public key (bytes 5-37)
4. Derives address: SHA256(pubkey)[0..20] as hex with `cs1` prefix

#### create_identity()

```rust
// desktop-app/src-tauri/src/main.rs:117-151
#[tauri::command]
async fn create_identity(
    state: tauri::State<'_, AppState>,
    _name: String,  // Currently unused - metadata feature pending
    password: String,
) -> Result<IdentityInfo, String>
```

**Purpose**: Creates a new cryptographic identity by invoking CLI.
**Process**: Runs `sw --testnet identity create --data-dir {base_dir}` with password in env
**Note**: Display name parameter is accepted but not stored (metadata feature pending)

### NodeManager Methods

#### new()

```rust
// desktop-app/src-tauri/src/node_manager.rs:17-50
pub fn new(binary_path: PathBuf, data_dir: PathBuf, network: String) -> Self
```

**Purpose**: Creates NodeManager with appropriate RPC port for network.
**Port Selection**:
| Network | RPC Port |
|---------|----------|
| Mainnet | 9100 |
| Testnet | 19736 |
| Regtest | 29100 |

#### start_with_password()

```rust
// desktop-app/src-tauri/src/node_manager.rs:64-140
pub async fn start_with_password(&mut self, password: &str)
    -> Result<(), Box<dyn std::error::Error + Send + Sync>>
```

**Purpose**: Starts node process with password in environment variable.
**Process**:
1. Creates data directory if needed
2. Builds args: `[--network] node start --data-dir {path}`
3. Spawns process with `SWIMCHAIN_PASSWORD` env var
4. Captures stdout/stderr in background tasks
5. Waits 500ms and verifies process still running

#### stop()

```rust
// desktop-app/src-tauri/src/node_manager.rs:142-173
pub async fn stop(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
```

**Purpose**: Gracefully stops the node with fallback to force kill.
**Behavior**:
- Unix: Sends SIGTERM, waits 5 seconds, then SIGKILL
- Windows: Calls kill() directly

#### get_peer_count()

```rust
// desktop-app/src-tauri/src/node_manager.rs:175-213
pub async fn get_peer_count(&self) -> Result<usize, Box<dyn std::error::Error + Send + Sync>>
```

**Purpose**: Queries node RPC for current peer count.
**Process**:
1. Reads `.cookie` file for authentication
2. Makes POST to `http://127.0.0.1:{port}` with `get_peers` RPC method
3. Returns array length from result

---

## Behaviors

### Application Lifecycle State Machine

```
                    ┌──────────┐
                    │ checking │ (startup)
                    └────┬─────┘
                         │ check_identity()
            ┌────────────┼────────────┐
            ▼            ▼            ▼
    ┌────────────┐  ┌─────────┐  ┌───────┐
    │ onboarding │  │  unlock │  │ error │
    │ (no id)    │  │ (has id)│  │       │
    └─────┬──────┘  └────┬────┘  └───────┘
          │              │
          │create_       │handleUnlock()
          │identity()    │
          ▼              ▼
    ┌───────────────────────┐
    │       starting        │
    │   (start_node())      │
    └───────────┬───────────┘
                │ success
                ▼
    ┌───────────────────────┐
    │         ready         │◄── poll status every 5s
    │  (NodeStatusBar +     │
    │   ClientFrame shown)  │
    └───────────────────────┘
```

**Trigger**: App launch
**Process**:
1. `checking` - Calls `check_identity()` to see if identity exists
2. If no identity: `onboarding` - Shows create form
3. If identity exists: `unlock` - Shows password form
4. After identity ready: `starting` - Calls `start_node()`
5. Once connected: `ready` - Shows status bar and embedded client

### Client Frame Communication

**Trigger**: Client app loads in iframe
**Process**:
1. Desktop app sends `SWIMCHAIN_RPC_CONFIG` via postMessage on load
2. Resends every 1 second for 10 seconds (reliability)
3. Client app receives via `useParentRpcConfig` hook
4. Client uses RPC endpoint and auth to communicate with local node

```typescript
// Message format (desktop-app/src/components/ClientFrame.tsx:22-27)
iframe.contentWindow?.postMessage({
  type: 'SWIMCHAIN_RPC_CONFIG',
  rpcEndpoint,  // "http://127.0.0.1:19736"
  rpcAuth,      // "Basic <base64>"
}, '*');
```

### Identity File Format

**Location**: `{data_dir}/identity.enc`
**Format**:
| Offset | Size | Content |
|--------|------|---------|
| 0-3 | 4 bytes | Magic `CSID` |
| 4 | 1 byte | Version number |
| 5-36 | 32 bytes | Public key (Ed25519) |
| 37+ | variable | Encrypted private key data |

### Graceful Shutdown

**Trigger**: Window destroyed event (`main.rs:230-239`)
**Process**:
1. Tauri catches `WindowEvent::Destroyed`
2. Spawns async task to call `manager.stop()`
3. NodeManager sends SIGTERM (Unix) or kills process (Windows)
4. Waits up to 5 seconds for graceful exit
5. Force kills if timeout exceeded
6. Drop implementation ensures cleanup even on unexpected termination

### Form Validation

**Password Requirements** (`App.tsx:107-119`):
- Minimum 8 characters
- Must match confirmation field
- Display name required (minimum 1 character)

---

## Configuration Options

### Network Configuration

| Network | RPC Port | Data Dir Suffix | CLI Flag |
|---------|----------|-----------------|----------|
| Mainnet | 9100 | (none) | (default) |
| Testnet | 19736 | -testnet | --testnet |
| Regtest | 29100 | -regtest | --regtest |

**Current Default**: Testnet (hardcoded in `main.rs:204`)

### Tauri Window Configuration (`tauri.conf.json`)

| Option | Value | Description |
|--------|-------|-------------|
| Title | "Swimchain" | Window title |
| Width | 1200 | Default width |
| Height | 800 | Default height |
| Min Width | 800 | Minimum resize width |
| Min Height | 600 | Minimum resize height |
| Resizable | true | Allow window resizing |
| Fullscreen | false | Not fullscreen by default |

### Bundle Configuration

| Option | Value | Description |
|--------|-------|-------------|
| Product Name | Swimchain | Display name |
| Identifier | com.swimchain.desktop | Bundle ID |
| Version | 0.1.0 | Current version |
| Targets | all | Build for all platforms |
| Resources | binaries/* | Bundle sw binary |

### Data Directories (Platform-Specific)

| Platform | Base Path |
|----------|-----------|
| Linux | `~/.local/share/swimchain` |
| macOS | `~/Library/Application Support/swimchain` |
| Windows | `%APPDATA%\swimchain` |

---

## Constants

### CSS Theme Variables (`styles.css`)

| Variable | Value | Purpose |
|----------|-------|---------|
| --bg-primary | #0f0f0f | Main background |
| --bg-secondary | #1a1a1a | Secondary surfaces |
| --bg-tertiary | #252525 | Tertiary elements |
| --text-primary | #e0e0e0 | Primary text |
| --text-secondary | #888888 | Muted text |
| --accent | #3b82f6 | Primary accent (blue) |
| --accent-hover | #60a5fa | Hover state |
| --success | #22c55e | Success indicators |
| --warning | #eab308 | Warning indicators |
| --error | #ef4444 | Error indicators |
| --border | #333333 | Border color |

### Embedded Clients

| Client | Path | Description |
|--------|------|-------------|
| forum | clients/forum-client/index.html | Forum-style discussions |
| chat | clients/chat-client/index.html | Real-time chat |
| feed | clients/feed-client/index.html | Social feed |
| search | clients/search-client/index.html | Content search |

### Timing Constants

| Constant | Duration | Purpose |
|----------|----------|---------|
| Status polling | 5000ms | Refresh node status in ready state |
| RPC config retry | 1000ms | Resend config to iframe |
| Config retry duration | 10000ms | Stop retrying config send |
| Node start wait | 500ms | Wait before checking process alive |
| Node start UI wait | 1000ms | Wait after start_node for RPC |
| Graceful shutdown timeout | 5000ms | Wait before force kill |

---

## Implementation Files

### Primary Files

| File | Lines | Purpose |
|------|-------|---------|
| `src-tauri/src/main.rs` | 244 | Tauri app entry, commands, state |
| `src-tauri/src/node_manager.rs` | 234 | Node process lifecycle |
| `src-tauri/Cargo.toml` | 38 | Rust dependencies |
| `src-tauri/tauri.conf.json` | 53 | Tauri configuration |
| `src/App.tsx` | 369 | React app root, state machine |
| `src/components/NodeStatusBar.tsx` | 80 | Status bar component |
| `src/components/ClientFrame.tsx` | 69 | Iframe client loader |
| `src/styles.css` | ~662 | Global dark theme styles |

### Supporting Files

| File | Purpose |
|------|---------|
| `package.json` | npm scripts and dependencies |
| `vite.config.ts` | Vite bundler config |
| `index.html` | HTML entry point |
| `src/main.tsx` | React entry point |
| `src/context/SwimchainContext.tsx` | React context for RPC (unused) |
| `src/components/SpaceList.tsx` | Space listing component (unused) |
| `src/components/SpaceView.tsx` | Space content view (unused) |

### Build Files

| File | Purpose |
|------|---------|
| `build.sh` | Linux/macOS build script |
| `build.ps1` | Windows PowerShell build script |
| `scripts/build-clients.js` | Build and bundle client apps |
| `src-tauri/build.rs` | Tauri build script |

### Assets

| Path | Purpose |
|------|---------|
| `src-tauri/icons/*.png` | App icons (32x32, 128x128, 256x256) |
| `src-tauri/icons/icon.icns` | macOS icon |
| `src-tauri/icons/icon.ico` | Windows icon |

---

## Integration Points

### Tauri Plugin Usage

```rust
// desktop-app/src-tauri/src/main.rs:170
.plugin(tauri_plugin_shell::init())
```

Enables shell operations for external URL opening.

### Client App Integration

Clients receive RPC configuration via window message listener:

```typescript
// forum-client/src/hooks/useParentRpcConfig.ts:24-41
window.addEventListener('message', (event) => {
  if (event.data?.type === 'SWIMCHAIN_RPC_CONFIG') {
    parentConfig = {
      rpcEndpoint: event.data.rpcEndpoint,
      rpcAuth: event.data.rpcAuth,
    };
    // Notify React components
    listeners.forEach(fn => fn(parentConfig));
  }
});
```

### RPC Methods Used

The desktop app uses these RPC methods to communicate with the embedded node:

#### get_peers

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_peers",
  "params": {},
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": [
    {"peer_id": "...", "address": "..."}
  ],
  "id": 1
}
```

**Used by**: `NodeManager::get_peer_count()` (`node_manager.rs:191-204`)

#### get_info

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_info",
  "params": [],
  "id": 1
}
```

**Used by**: `SwimchainContext` to test connection (`SwimchainContext.tsx:81`)

#### get_spaces

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_spaces",
  "params": [],
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "spaces": [
      {"id": "...", "name": "...", "description": "...", "post_count": 10}
    ]
  },
  "id": 1
}
```

**Used by**: `SwimchainContext.refreshSpaces()` (`SwimchainContext.tsx:101-109`)

#### get_space_content

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "get_space_content",
  "params": ["space_id"],
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {"id": "...", "title": "...", "body": "...", "author": "...", "timestamp": 1234567890}
    ]
  },
  "id": 1
}
```

**Used by**: `SwimchainContext.getSpaceContent()` (`SwimchainContext.tsx:111-119`)

### Dependencies

**Rust Crates** (`src-tauri/Cargo.toml`):
| Crate | Version | Purpose |
|-------|---------|---------|
| tauri | 2.x | Native app framework |
| tauri-plugin-shell | 2 | Shell operations |
| tokio | 1 | Async runtime |
| reqwest | 0.12 | HTTP client for RPC |
| serde/serde_json | 1 | JSON serialization |
| dirs | 5 | Platform data directories |
| sha2 | 0.10 | SHA256 for address derivation |
| hex | 0.4 | Hex encoding |
| base64 | 0.22 | Base64 for auth header |
| libc | 0.2 | Unix signal handling |

**npm Packages** (`package.json`):
| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.2.0 | UI framework |
| react-dom | ^18.2.0 | React DOM bindings |
| react-router-dom | ^6.20.0 | Routing |
| @tauri-apps/api | ^2.0.0 | Tauri frontend API |
| vite | ^5.0.0 | Build tool |
| typescript | ^5.3.0 | Type checking |

---

## Build Process

### Prerequisites

- Rust (latest stable)
- Node.js 18+
- npm

### Build Scripts

**Linux/macOS** (`build.sh`):
1. Build Rust node binary (`cargo build --release`)
2. Copy `sw` binary to `src-tauri/binaries/`
3. Build swimchain-js SDK
4. Build swimchain-react SDK
5. Build forum-client
6. Copy client dist to `public/clients/`
7. Install npm dependencies
8. Run `tauri build`

**Windows** (`build.ps1`): Similar process with PowerShell

**Client Build** (`scripts/build-clients.js`):
- Builds: forum, chat, feed, search clients
- Copies dist folders to `dist/clients/{name}-client/`

### Output Artifacts

| Platform | Output Path |
|----------|-------------|
| Windows | `src-tauri/target/release/bundle/msi/Swimchain_0.1.0_x64_en-US.msi` |
| Linux | `src-tauri/target/release/bundle/deb/swimchain_0.1.0_amd64.deb` |
| macOS | `src-tauri/target/release/bundle/macos/Swimchain.app` |

### Development Mode

```bash
cd desktop-app
npm install
npm run tauri:dev
```

Requires the `sw` binary:
```bash
cargo build --release
mkdir -p desktop-app/src-tauri/binaries
cp target/release/sw desktop-app/src-tauri/binaries/
```

---

## Feature Status

### Implemented Features

| Feature | Status | Details |
|---------|--------|---------|
| Tauri Wrapper | **Complete** | Tauri 2.x with full Rust backend |
| Node Integration | **Complete** | Spawns `sw` binary, lifecycle management, graceful shutdown |
| Identity Management | **Complete** | Create/check identity, password unlock, address derivation |
| Multi-Client UI | **Complete** | Forum, chat, feed, search in iframes with client selector |
| RPC Communication | **Complete** | Cookie-based auth, postMessage to clients |
| Cross-Platform Config | **Complete** | Windows, macOS, Linux builds configured |
| Dark Theme | **Complete** | Modern dark UI with CSS variables |

### Partially Implemented

| Feature | Status | Missing |
|---------|--------|---------|
| Display Name | **Partial** | UI accepts name but CLI doesn't support storing it |
| Network Selection | **Partial** | Hardcoded to testnet, no UI selector |

### Not Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| System Tray | **Not Started** | Documented as "Partial" but no code exists |
| Auto-Updates | **Not Started** | Documented as "Planned" |
| Code Signing | **Not Configured** | `certificateThumbprint: null` in config |
| Crash Reporting | **Not Started** | No crash reporting integration |
| Multiple Windows | **Partial** | README mentions sharing node but not implemented |

### Quality Checklist Status

| Item | Status | Notes |
|------|--------|-------|
| Cross-platform build | Configured | Scripts exist, targets all platforms |
| Installer packages | Configured | MSI, DEB, DMG configurations present |
| Code signing | Not Started | Certificate config empty |
| Crash reporting | Not Started | No integration |
| Memory efficient | Unknown | No profiling done |

---

## CLI Commands

### Development

```bash
# Install dependencies
cd desktop-app
npm install

# Run in development mode (hot reload)
npm run tauri:dev
```

**Note**: Requires the `sw` binary. Build it first:
```bash
cd ..
cargo build --release
mkdir -p desktop-app/src-tauri/binaries
cp target/release/sw desktop-app/src-tauri/binaries/
```

### Building

#### Linux/macOS
```bash
./build.sh
```
**Output**: `src-tauri/target/release/bundle/deb/swimchain_0.1.0_amd64.deb` (Linux) or `src-tauri/target/release/bundle/macos/Swimchain.app` (macOS)

#### Windows
```powershell
.\build.ps1
```
**Output**: `src-tauri\target\release\bundle\msi\Swimchain_0.1.0_x64_en-US.msi`

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "Cookie file not found - node may not be running" | Node hasn't started or crashed | Verify node started successfully, check logs |
| "Failed to read identity: too short" | Corrupted identity file (< 37 bytes) | Delete identity file and recreate |
| "Invalid identity file: bad magic" | File doesn't start with `CSID` | Delete identity file and recreate |
| "Node process exited immediately" | Bad password, missing binary, or permission error | Check password, verify `sw` binary exists and is executable |
| "Passwords don't match" | Confirmation password differs from password | Re-enter matching passwords |
| "Password must be at least 8 characters" | Password too short | Use password with 8+ characters |
| "Please enter a display name" | Empty display name field | Enter at least 1 character |
| "Failed to create identity: ..." | CLI command failed | Check CLI output, verify binary permissions, check disk space |

---

## Testing

### Manual Testing Procedures

1. **First Run (Onboarding)**:
```bash
# Remove existing identity to test fresh install
rm -rf ~/.local/share/swimchain-testnet/identity.enc
npm run tauri:dev
# Expected: Onboarding form appears with display name and password fields
```

2. **Unlock Flow**:
```bash
# With existing identity
npm run tauri:dev
# Expected: Unlock screen shows truncated address
# Enter correct password → node starts → ready state
# Enter wrong password → error message shown
```

3. **Client Switching**:
```bash
# In ready state
# Use dropdown selector in status bar
# Expected: iframe reloads with selected client (forum/chat/feed/search)
```

4. **Node Status Verification**:
```bash
# In ready state, verify:
# - Connection indicator is green
# - Peer count updates every 5 seconds
# - Network badge shows "testnet"
# - Identity address shown in top right
```

5. **Graceful Shutdown**:
```bash
# Close the app window
# Expected: Node process stops within 5 seconds (check with `ps aux | grep sw`)
```

### Test Files

| File | Coverage |
|------|----------|
| N/A | No dedicated test files exist |

**Technical Debt**: The desktop app lacks automated tests. Required coverage:
- Unit tests for NodeManager (process lifecycle)
- Integration tests for Tauri commands (identity operations)
- E2E tests for complete onboarding/unlock flow
- Component tests for React UI (NodeStatusBar, ClientFrame)

---

## Known Limitations

1. **System Tray Not Implemented**: Documented as "Partial" in MASTER_FEATURES.md but no code exists. The app cannot run minimized in the background.

2. **Auto-Updates Not Implemented**: Marked as "Planned". Users must manually download and install new versions.

3. **Network Selection Hardcoded**: Always uses testnet (`main.rs:204`). No UI to switch between mainnet/testnet/regtest networks.

4. **Display Name Not Persisted**: The onboarding form collects a display name but the CLI `identity create` command doesn't support storing it. The `_name` parameter is unused.

5. **Code Signing Not Configured**: `certificateThumbprint: null` in `tauri.conf.json`. Windows builds may trigger SmartScreen warnings.

6. **No Crash Reporting**: No integration with crash reporting services like Sentry.

7. **Post Submission Placeholder**: `SwimchainContext.submitPost()` throws "not yet implemented" error - identity and PoW integration pending.

8. **CSP Disabled**: Content Security Policy is `null` in `tauri.conf.json` - should be configured for production security.

9. **Multiple Windows Not Coordinated**: README mentions multiple windows share the same node, but there's no explicit handling for this case.

---

## Security Considerations

1. **Cookie Authentication**: Node uses file-based auth at `{data_dir}/.cookie`. Cookie is read fresh on each RPC auth request.

2. **Identity Encryption**: Private keys stored encrypted with user password in `identity.enc` using format: `CSID` + version + pubkey + encrypted_data.

3. **Iframe Sandbox**: Client apps run with sandbox: `allow-scripts allow-same-origin allow-forms allow-popups`. Consider restricting further in production.

4. **Password Transmission**: Password passed to node via `SWIMCHAIN_PASSWORD` environment variable (not command line args).

---

## Implementation Gaps

### Documentation vs Reality

| Documented Status | Actual Status | Notes |
|------------------|---------------|-------|
| System Tray: "Partial" | **Not Started** | Zero code exists |
| Node Integration: "Partial" | **Complete** | Fully functional lifecycle |
| Auto-updates: "Planned" | Not Started | Correctly documented |

---

## Future Roadmap

1. Implement system tray for background operation using `tauri-plugin-tray`
2. Add auto-update mechanism with `tauri-plugin-updater`
3. Set up code signing for all platforms
4. Integrate crash reporting (Sentry or similar)
5. Add network selection UI (dropdown to switch mainnet/testnet/regtest)
6. Implement display name via identity metadata RPC
7. Add memory profiling and optimization
8. Create CI/CD pipeline for automated builds
9. Add unit and integration tests

---

## Related Sections

- **Section 14: Frontend SDK** (`swimchain-frontend/`) - Shared React components
- **Section 15: React SDK** (`swimchain-react/`) - React hooks for RPC
- **Section 16: WASM Bindings** (`swimchain-wasm/`) - Browser crypto
- **Section 23: Client Applications** - forum-client, chat-client, etc.
- **Section 24: Mobile Platform** (`mobile-client/`) - React Native mobile app
- **Section 12: RPC API** - Node communication interface
