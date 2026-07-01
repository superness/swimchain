# CLI Interface - Feature Documentation

## Overview

The Swimchain CLI (`sw` or `cs` binary) provides a command-line interface for interacting with the Swimchain decentralized social network. Built on the Clap framework with derive macros, it offers a hierarchical subcommand structure with progress indicators, multiple output formats, and comprehensive shell completions.

The CLI serves as the primary user interface for:
- Managing cryptographic identities
- Creating and participating in spaces (communities)
- Posting content with proof-of-work
- Controlling node operations and network synchronization
- Searching local content via Tantivy full-text search
- Managing sponsorships and forks

**Owner Area**: `src/cli/`, `src/bin/`

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      sw (CLI Binary)                          │
│                      src/bin/cs.rs                            │
├──────────────────────────────────────────────────────────────┤
│  Global Flags: --json, --data-dir, --regtest, --testnet      │
│                --seed-node                                    │
├──────────────────────────────────────────────────────────────┤
│                     Command Dispatch                          │
│  ┌─────────┬─────────┬─────────┬─────────┬─────────────────┐ │
│  │identity │  space  │  post   │ search  │   completions   │ │
│  ├─────────┼─────────┼─────────┼─────────┼─────────────────┤ │
│  │  sync   │ config  │  node   │  block  │     branch      │ │
│  ├─────────┼─────────┼─────────┴─────────┴─────────────────┤ │
│  │  fork   │ sponsor │                                      │ │
│  └─────────┴─────────┴──────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                    Supporting Modules                         │
│  ┌──────────┬──────────┬──────────┬────────────────────────┐ │
│  │  config  │  error   │  output  │       progress         │ │
│  │  .rs     │  .rs     │  .rs     │       .rs              │ │
│  └──────────┴──────────┴──────────┴────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    search_index/                         │ │
│  │            (Tantivy full-text search)                    │ │
│  └─────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                    External Connections                       │
│  ┌──────────────────┐  ┌────────────────────────────────────┐│
│  │   RPC Client     │  │      Direct Storage Access         ││
│  │   (node running) │  │      (node not running)            ││
│  └──────────────────┘  └────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

## Data Structures

### Cli
Main CLI struct parsed by Clap. Defined in `src/bin/cs.rs:54-87`.

| Field | Type | Description |
|-------|------|-------------|
| `command` | `Commands` | Subcommand to execute |
| `json` | `bool` | Global flag for JSON output format |
| `data_dir` | `Option<PathBuf>` | Data directory override (env: `SWIMCHAIN_DATA_DIR`) |
| `regtest` | `bool` | Run in regtest mode (local development) |
| `testnet` | `bool` | Run in testnet mode |
| `seed_node` | `bool` | Run as seed node with short-term connections |

### Commands
Enum of all available command groups. Defined in `src/bin/cs.rs:90-223`.

| Variant | Module | Description |
|---------|--------|-------------|
| `Block` | `block` | Query block and action information |
| `Identity` | `identity` | Manage cryptographic identities |
| `Space` | `space` | Create, join, and manage spaces |
| `Post` | `post` | Create and view posts |
| `Search` | `search` | Search local content |
| `Sync` | `sync` | Network synchronization |
| `Branch` | `branch` | Branch-selective sync management |
| `Config` | `config` | Configuration management |
| `Completions` | `completions` | Generate shell completions |
| `Node` | `node` | Node management |
| `Sponsor` | `sponsor` | Sponsorship and identity bootstrap |
| `Fork` | `fork` | Fork management for community escape |

### CliConfig
Persistent configuration stored in `config.toml`. Defined in `src/cli/config.rs:21-60`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `network_mode` | `NetworkMode` | `Mainnet` | Network mode (Mainnet/Testnet/Regtest) |
| `data_dir` | `Option<PathBuf>` | Platform default | Data directory override |
| `network_port` | `u16` | `9735` | Network port for P2P connections |
| `storage_target_mb` | `u64` | `500` | Storage target in MB (100-100000) |
| `pow_parallelism` | `u8` | `0` | PoW threads (0=auto, 2=mobile, 4=desktop) |
| `sync_on_startup` | `bool` | `true` | Whether to sync on startup |
| `followed_spaces` | `Vec<String>` | `[]` | List of followed space IDs |
| `space_names` | `HashMap<String, String>` | `{}` | Space ID to display name mapping |
| `output_format` | `OutputFormat` | `Text` | Default output format |

### CliError
CLI-specific errors with exit code mapping. Defined in `src/cli/error.rs:8-51`.

| Error | Exit Code | Description |
|-------|-----------|-------------|
| `NoNodeRunning` | 4 | No node running - required for content operations |
| `NoIdentity` | 3 | No identity found in data directory |
| `InvalidIdentityFile` | 3 | Identity file exists but has invalid format |
| `DecryptionFailed` | 3 | Decryption failed (wrong password) |
| `SpaceNotFound` | 2 | Space not found |
| `InvalidSpaceId` | 2 | Invalid space ID format |
| `InvalidContentId` | 2 | Invalid content ID format |
| `NetworkError` | 2 | Network error |
| `ContentNotFound` | 2 | Content not found locally |
| `InsufficientLevel` | 3 | Insufficient contribution level for operation |
| `PowCancelled` | 1 | PoW mining was cancelled by user |
| `InvalidConfig` | 1 | Invalid configuration |
| `Io` | 1 | IO error |
| `Storage` | 1 | Storage error |
| `RpcError` | 1 | RPC error |
| `Other` | 1 | Other error |

### OutputFormat
Output format enum. Defined in `src/cli/output.rs:8-15`.

| Variant | Description |
|---------|-------------|
| `Text` | Human-readable text output (default) |
| `Json` | Machine-readable JSON output |

**Note**: Table output format is documented in MASTER_FEATURES.md but not implemented.

### SearchSchema
Tantivy search index schema. Defined in `src/cli/search_index/schema.rs`.

| Field | Type | Description |
|-------|------|-------------|
| `content_id` | STRING, STORED | Content ID in sha256:hex format |
| `space_id` | STRING, STORED | Space ID in sp1... format |
| `author` | STRING, STORED | Author address in cs1... format |
| `title` | TEXT, STORED | Post title (full-text searchable) |
| `body` | TEXT, STORED | Post body (full-text searchable) |
| `heat` | f64, FAST, INDEXED | Heat percentage (0.0-100.0) |
| `timestamp` | u64, FAST, INDEXED | Unix timestamp |

## Core APIs

### CliConfig::load()
**Signature**: `pub fn load() -> Result<Self>`

**Purpose**: Load configuration from the default config.toml file.

**Returns**: `Result<CliConfig>` - Loaded configuration or default if file doesn't exist.

### CliConfig::load_with_network()
**Signature**: `pub fn load_with_network(network_mode: NetworkMode) -> Result<Self>`

**Purpose**: Load configuration with network mode awareness. Uses network-specific directory suffixes.

**Parameters**:
- `network_mode`: The network mode to load configuration for

**Returns**: Configuration for the specified network mode.

### CliConfig::data_dir()
**Signature**: `pub fn data_dir(&self) -> PathBuf`

**Purpose**: Get the data directory with network-specific suffix applied.

**Returns**: Path to data directory:
- Mainnet: `<base_dir>/`
- Testnet: `<base_dir>-testnet/`
- Regtest: `<base_dir>-regtest/`

### prompt_password()
**Signature**: `pub fn prompt_password(confirm: bool) -> Result<String>`

**Purpose**: Prompt user for password with optional confirmation.

**Parameters**:
- `confirm`: Whether to require password confirmation

**Returns**: The entered password.

**Example**:
```rust
// Simple password prompt
let password = prompt_password(false)?;

// Password with confirmation
let password = prompt_password(true)?;
```

**Note**: Password can be provided via `SWIMCHAIN_PASSWORD` environment variable for automation.

### require_running_node_for_config()
**Signature**: `pub fn require_running_node_for_config(config: &CliConfig) -> Result<()>`

**Purpose**: Verify that a node is running before performing content operations.

**Parameters**:
- `config`: CLI configuration

**Returns**: `Ok(())` if node is running, `Err(CliError::NoNodeRunning)` otherwise.

**Example**:
```rust
// Check node before content operation
require_running_node_for_config(&config)?;
// Proceed with content creation...
```

## Behaviors

### Network Mode Selection
The CLI supports three network modes that isolate data and adjust difficulty:

| Mode | Flag | Data Dir Suffix | PoW Difficulty | Level Checks |
|------|------|-----------------|----------------|--------------|
| Mainnet | (default) | none | 100% | Enforced |
| Testnet | `--testnet` | `-testnet` | 10% | Enforced |
| Regtest | `--regtest` | `-regtest` | 0.1% | Bypassed |

Network mode is determined at startup:
1. CLI parses `--regtest` or `--testnet` flags
2. Network context is set globally via `NetworkContext::set_mode()`
3. Configuration is loaded from network-specific directory
4. Magic bytes ensure nodes only connect to same network

### Node Running Requirement
Content operations require a running node (no ephemeral clients). The CLI checks this by:
1. Reading `.rpc_addr` file from data directory
2. Attempting TCP connection with 500ms timeout
3. Returning `CliError::NoNodeRunning` (exit code 4) if connection fails

### RPC Fallback Pattern
When querying data, CLI commands use a dual strategy:
1. **RPC first**: If node is running, use RPC client for real-time data
2. **Direct DB**: If node not running, access storage directly (read-only operations only)

This pattern is implemented in `src/cli/commands/block.rs:260-349` and allows block queries to work offline.

### Progress Indicators
Long-running operations display progress via `indicatif`:

| Type | Class | Location | Usage |
|------|-------|----------|-------|
| Spinner | `PowProgress` | `src/cli/progress.rs:11-82` | PoW mining with cancellation |
| Spinner | `Spinner` | `src/cli/progress.rs:84-124` | Indeterminate progress |
| Bar | `Progress` | `src/cli/progress.rs:137-177` | Determinate progress with ETA |

TTY detection: Progress bars are hidden in non-TTY environments (CI) via `atty::is(atty::Stream::Stderr)`.

### Identity Creation with PoW
Identity creation includes proof-of-work (difficulty 20) for Sybil resistance:
1. User provides password (or `SWIMCHAIN_PASSWORD` env var)
2. Ed25519 keypair generated
3. PoW mined with cancellable progress display
4. Private key encrypted with password (Argon2id)
5. Saved to `identity.enc` in data directory

## Configuration

### Config File Location
Configuration stored in `config.toml`:
- Linux: `~/.local/share/swimchain/config.toml`
- macOS: `~/Library/Application Support/io.swimchain.swimchain/config.toml`
- Windows: `%APPDATA%\swimchain\swimchain\config.toml`

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `network_port` | `u16` | `9735` | P2P network port (1024-65535) |
| `storage_target_mb` | `u64` | `500` | Storage budget in MB (100-100000) |
| `pow_parallelism` | `u8` | `0` | PoW threads: 0=auto, 2=mobile, 4=desktop |
| `sync_on_startup` | `bool` | `true` | Auto-sync when node starts |
| `output_format` | `OutputFormat` | `Text` | Default output format |
| `followed_spaces` | `Vec<String>` | `[]` | Spaces to follow (sp1... format) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SWIMCHAIN_DATA_DIR` | Override data directory (used as-is, no suffix added) |
| `SWIMCHAIN_PASSWORD` | Provide password for automation (skips interactive prompt) |
| `RUST_LOG` | Logging level (default: `swimchain=info`) |

## CLI Commands

### sw identity
Identity management commands.

```bash
sw identity create              # Create a new cryptographic identity
sw identity show                # Show current identity information
sw identity show --seed         # Show identity including private seed
sw identity show --json         # Output in JSON format
sw identity export backup.json  # Export identity to backup file
sw identity export --base64     # Export as base64 string
sw identity import backup.json  # Import identity from backup
```

### sw space
Space (community) management commands.

```bash
sw space create --name "My Space"      # Create a new space (~60s PoW)
sw space join sp1xxx...                # Join (follow) a space
sw space leave sp1xxx...               # Leave (unfollow) a space
sw space list                          # List followed spaces
sw space browse                        # Browse all spaces on chain
sw space view sp1xxx...                # View content in a space
sw space view sp1xxx... --fetch        # Fetch from network if needed
```

### sw post
Post/content management commands.

```bash
sw post create --space sp1xxx --title "Hello" --body "World"
sw post reply --parent sha256:xxx --body "Great post!"
sw post view sha256:abc123...
sw post view sha256:abc123... --fetch
sw post engage sha256:xxx --seconds 5
sw post engage sha256:xxx --emoji heart
sw post list
sw post list --limit 50 --json
```

### sw search
Local content search using Tantivy full-text indexing.

```bash
sw search "query"                      # Basic search
sw search "query" --space sp1xxx       # Filter by space
sw search "query" --min-heat 50        # Filter by minimum heat
sw search "query" --sort newest        # Sort by newest
sw search "query" --limit 50           # Limit results
sw search "query" --json               # JSON output
```

### sw sync
Network synchronization commands.

```bash
sw sync status                         # Show sync status
sw sync now                            # Trigger immediate sync
sw sync peers                          # List connected peers
sw sync connect 192.168.1.100:9735     # Connect to peer
```

### sw config
Configuration management commands.

```bash
sw config show                         # Show all settings
sw config get network_port             # Get specific value
sw config set network_port 9736        # Set specific value
sw config path                         # Show data directory path
sw config reset                        # Reset to defaults
```

### sw node
Node management commands.

```bash
sw node start                          # Start node in foreground
sw node start --listen 0.0.0.0:9735    # Specify listen address
sw node start --connect peer:9735      # Connect to peer on start
sw node stop                           # Stop instructions (use Ctrl+C)
sw node status                         # Show node status
sw node peers                          # List connected peers
sw node sync                           # Show sync status
sw node contribution                   # Show contribution metrics
```

### sw block
Block and action query commands.

```bash
sw block view 42                       # View block by height
sw block view abc123...                # View block by hash
sw block action abc123...              # View action by hash
sw block stats                         # Show chain statistics
sw block content 128fbb91...           # View content block details
sw block engagements                   # List engagement actions
```

### sw branch
Branch-selective sync management (BRANCH_SELECTIVE_SYNC.md).

```bash
sw branch subscribe --space abc123...         # Subscribe to space root
sw branch subscribe --space abc123... --branch left/right
sw branch unsubscribe --space abc123...       # Unsubscribe
sw branch list                                # List subscriptions
sw branch status                              # Show sync status
sw branch budget 10GB                         # Set storage budget
```

### sw fork
Fork management for community escape (VISION 5).

```bash
sw fork create --name "community-v2"          # Create new fork
sw fork create --name "clean" --exclude cs1bad...  # Exclude identities
sw fork list                                  # List all forks
sw fork switch main                           # Switch to main chain
sw fork switch fk1abc123...                   # Switch to fork
sw fork info fk1abc123...                     # Get fork information
sw fork active                                # Show active fork
```

### sw sponsor
Sponsorship and identity bootstrap (SPEC_11).

```bash
sw sponsor genesis-claim --slot 0             # Claim genesis slot
sw sponsor genesis-status                     # Check genesis status
sw sponsor offer-create --slots 3             # Create sponsorship offer
sw sponsor offer-list                         # List your offers
sw sponsor claim abc123                       # Claim an offer
sw sponsor approve abc123 sw1abc...           # Approve claim
sw sponsor status                             # View sponsorship status
```

### sw completions
Shell completion generation.

```bash
sw completions generate bash > ~/.bash_completion.d/sw
sw completions generate zsh > ~/.zsh/completions/_sw
sw completions generate fish > ~/.config/fish/completions/sw.fish
sw completions generate powershell >> $PROFILE
sw completions generate elvish
```

**Supported Shells**: Bash, Zsh, Fish, PowerShell, Elvish

## RPC Methods

The CLI uses JSON-RPC to communicate with running nodes:

| Command | RPC Method |
|---------|------------|
| `block view` | `get_block` |
| `block stats` | `get_chain_stats` |
| `sync status` | `get_sync_status`, `get_info` |
| `sync peers` | `get_peers` |
| `space create` | `create_space` |
| `space browse` | `list_spaces` |
| `space view` | `list_space_content` |
| `post create` | `submit_post` |
| `post reply` | `submit_reply` |
| `post engage` | `submit_engagement` |
| `branch subscribe` | `branch_subscribe` |
| `fork create` | `create_fork` |

## Error Handling

| Exit Code | Category | Examples |
|-----------|----------|----------|
| 0 | Success | Operation completed |
| 1 | General error | Invalid config, IO error, PoW cancelled |
| 2 | Resource not found | Space not found, content not found |
| 3 | Identity error | No identity, wrong password, insufficient level |
| 4 | No node running | Content operations require running node |

Error messages include actionable suggestions:
```
Error: No node running.

To participate in ChainSocial, you must run a node.
Start with: sw node start

ChainSocial has no servers - every participant hosts content.
Your node connects you to the network and shares what you view.
```

## Testing

### Running CLI Integration Tests
```bash
# Run all CLI tests
cargo test --test cli_integration

# Run specific test
cargo test --test cli_integration test_identity_create
```

### Testing Commands Manually
```bash
# Use regtest mode for fast testing (reduced PoW)
sw --regtest identity create
sw --regtest space create --name "Test Space"
sw --regtest post create --space sp1xxx --title "Test" --body "Hello"

# Use SWIMCHAIN_PASSWORD for automation
SWIMCHAIN_PASSWORD=testpass sw --regtest identity create

# Test with custom data directory
SWIMCHAIN_DATA_DIR=/tmp/test-node sw identity show
```

### Test Coverage
The CLI has 27 integration tests in `tests/cli_integration.rs` covering:
- Identity create/roundtrip
- Wrong password handling
- Missing identity error
- JSON output validation
- Help text presence
- Space join/leave
- Config persistence
- Exit codes
- Shell completions (all 5 shells)
- Search index operations
- Sync status/peers
- Post engage help

## Known Limitations

1. **No Table Output Format**: Despite documentation in MASTER_FEATURES.md, only Text and JSON output formats are implemented in `OutputFormat` enum.

2. **Foreground Node Only**: Background daemon mode with IPC is planned but not yet implemented. Use Ctrl+C to stop nodes.

3. **Local Search Only**: The `search` command only searches locally indexed content. Network-wide search is planned for future release.

4. **No Interactive Commands**: Git-style interactive modes (`-i` flag) are not supported as they require interactive input.

5. **Single Task at a Time**: CLI operations are blocking. Run multiple terminals for parallel operations.

## Future Work

1. **Table Output Format**: Implement `OutputFormat::Table` variant for structured tabular display.

2. **Background Daemon Mode**: Implement IPC for querying background nodes (SPEC_10 14.2).

3. **Network-Wide Search**: Extend search to query network peers for content not stored locally.

4. **Command Aliases**: Add short aliases for common commands (e.g., `sw id` for `sw identity`).

5. **Better Progress for Sync**: Add progress bar for block synchronization showing percentage complete.

## Related Features

- **RPC API** (Section 12) - RPC methods used by CLI commands
- **Identity & Cryptography** (Section 1) - Identity management internals
- **Block Formation** (Section 3) - Block creation and consensus
- **Synchronization** (Section 7) - Sync and branch commands
- **Sponsorship System** (Section 8) - Sponsorship lifecycle
- **Fork System** (Section 18) - Fork management internals
- **Branch Selective Sync** (BRANCH_SELECTIVE_SYNC.md) - Branch subscription architecture

---

*Generated: 2026-01-12*
*Source: MASTER_FEATURES.md Section 13 (lines 704-758)*
*Owner Area: src/cli/, src/bin/*
