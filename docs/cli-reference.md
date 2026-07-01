# Chainsocial CLI Reference

Complete reference for all `sw` command-line options.

## Global Options

These options work with all commands:

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format |
| `--data-dir <PATH>` | Override data directory |
| `-h, --help` | Print help information |
| `-V, --version` | Print version |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (config, I/O, PoW cancelled) |
| 2 | Resource not found (space, content, network) |
| 3 | Identity error (no identity, wrong password) |

## Commands

### identity

Manage cryptographic identities.

#### identity create

Create a new cryptographic identity.

```bash
sw identity create
```

Generates an Ed25519 keypair, performs proof-of-work, encrypts with your password, and saves to data directory.

**Interactive prompts:**
- Password (hidden)
- Confirm password (hidden)

**Output (text):**
```
Identity created successfully!
Address: sw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq
Data directory: /home/user/.local/share/swimchain
```

**Exit codes:** 0 (success), 1 (cancelled/error)

#### identity show

Show current identity information.

```bash
sw identity show [--json]
```

**Options:**
- `--json` - Output as JSON

**Output (text):**
```
Address: sw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq
Short: sw1qqqq...qqqq
Data directory: /home/user/.local/share/swimchain
```

**Output (JSON):**
```json
{
  "address": "sw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  "data_dir": "/home/user/.local/share/swimchain"
}
```

**Exit codes:** 0 (success), 3 (no identity)

#### identity export

Export identity to a backup file.

```bash
sw identity export [OUTPUT] [--base64]
```

**Arguments:**
- `OUTPUT` - Output file path (optional, stdout if not specified)

**Options:**
- `--base64` - Output as base64 string

**Interactive prompts:**
- Current password (verify access)
- Export password (for backup)
- Confirm export password

**Exit codes:** 0 (success), 3 (no identity/wrong password)

#### identity import

Import identity from a backup file.

```bash
sw identity import <INPUT> [--base64]
```

**Arguments:**
- `INPUT` - Input file path

**Options:**
- `--base64` - Input is base64 string

**Interactive prompts:**
- Backup password
- New local password
- Confirm local password

**Exit codes:** 0 (success), 3 (wrong password), 1 (already exists)

---

### space

Create, join, and manage spaces.

#### space create

Create a new space.

```bash
sw space create --name <NAME>
```

**Options:**
- `--name <NAME>` - Space name (required)

Creates a new space with proof-of-work (~60 seconds).

**Output (text):**
```
Space created successfully!
Space ID: sp1qqqqqqqqqqqqqqqqqqqqqqqqqqqq
Name: My Space
```

**Exit codes:** 0 (success), 3 (no identity), 1 (cancelled)

#### space join

Join a space (add to followed list).

```bash
sw space join <SPACE_ID>
```

**Arguments:**
- `SPACE_ID` - Space ID to join (sp1...)

**Exit codes:** 0 (success), 2 (invalid space ID)

#### space leave

Leave a space (remove from followed list).

```bash
sw space leave <SPACE_ID>
```

**Arguments:**
- `SPACE_ID` - Space ID to leave (sp1...)

**Exit codes:** 0 (success), 2 (invalid space ID)

#### space list

List followed spaces.

```bash
sw space list [--json]
```

**Options:**
- `--json` - Output as JSON

**Output (JSON):**
```json
{
  "spaces": ["sp1abc...", "sp1def..."],
  "count": 2
}
```

**Exit codes:** 0 (success)

---

### post

Create and view posts.

#### post create

Create a new post in a space.

```bash
sw post create --space <SPACE_ID> --title <TITLE> --body <BODY>
```

**Options:**
- `--space <SPACE_ID>` - Space ID to post in (required)
- `--title <TITLE>` - Post title (required)
- `--body <BODY>` - Post body content (required)

Performs proof-of-work (~30 seconds).

**Output (text):**
```
Post created successfully!
Content ID: sha256:abc123...
Space: sp1xxx...
Title: Hello World
```

**Exit codes:** 0 (success), 3 (no identity), 1 (cancelled)

#### post reply

Reply to an existing post.

```bash
sw post reply --parent <CONTENT_ID> --body <BODY>
```

**Options:**
- `--parent <CONTENT_ID>` - Parent content ID (required)
- `--body <BODY>` - Reply body content (required)

Performs proof-of-work (~15 seconds).

**Exit codes:** 0 (success), 3 (no identity), 2 (invalid content ID)

#### post view

View a post by content ID.

```bash
sw post view <CONTENT_ID> [--json]
```

**Arguments:**
- `CONTENT_ID` - Content ID to view (sha256:...)

**Options:**
- `--json` - Output as JSON

**Output (text):**
```
s/example > Example Post
═══════════════════════════════════════
sw1qqqq...qqqq • 5m ago • Heat: 75%

Post body content here.

Pool: 30s/60s (5 contributors)
Replies: 3
Decays in: 28 days
```

**Exit codes:** 0 (success), 2 (content not found/invalid ID)

#### post engage

Contribute proof-of-work to help a post persist.

```bash
sw post engage <CONTENT_ID> [--seconds <5|15|30>] [--json]
```

**Arguments:**
- `CONTENT_ID` - Content ID to engage (sha256:...)

**Options:**
- `--seconds <5|15|30>` - PoW contribution time (default: 5)
- `--json` - Output as JSON

Posts need 60 seconds of combined PoW engagement to persist past their decay threshold.

**Output (text):**
```
Engagement complete!
Content:      sha256:a...b
Contributed:  5s

Pool status:
  Progress:     35s / 60s (58.3%)
  Contributors: 7
```

**Output (JSON):**
```json
{
  "content_id": "sha256:abc...",
  "contributed_seconds": 5,
  "pool_total_seconds": 35,
  "pool_required_seconds": 60,
  "pool_contributors": 7
}
```

**Exit codes:** 0 (success), 3 (no identity), 2 (invalid content ID)

---

### search

Search local content.

```bash
sw search <QUERY> [OPTIONS]
```

**Arguments:**
- `QUERY` - Search query

**Options:**
- `--space <SPACE_ID>` - Filter by space
- `--min-heat <0-100>` - Minimum heat percentage (default: 0)
- `--sort <heat|newest|oldest>` - Sort order (default: heat)
- `--limit <N>` - Maximum results (default: 20)
- `--json` - Output as JSON

**Note:** Currently searches local content only. Network-wide search planned for future release.

**Exit codes:** 0 (success)

---

### sync

Network synchronization.

#### sync status

Show sync status.

```bash
sw sync status [--json]
```

**Options:**
- `--json` - Output as JSON

**Output (text):**
```
Sync Status
═══════════════════════════════════════

Network:
  Connected peers:    0 (network integration pending)
  Chain height:       0 / 0 (local / network)
  Syncing:            no

Storage:
  Used:               45.2 MB / 500.0 MB
  Usage:              9.0%
```

**Output (JSON):**
```json
{
  "connected_peers": 0,
  "local_chain_height": 0,
  "best_known_height": 0,
  "storage_used_bytes": 47400000,
  "storage_target_bytes": 524288000,
  "syncing": false
}
```

**Exit codes:** 0 (success)

#### sync now

Trigger immediate sync.

```bash
sw sync now
```

**Note:** Full network integration pending.

**Exit codes:** 0 (success)

#### sync peers

List connected peers.

```bash
sw sync peers [--json]
```

**Options:**
- `--json` - Output as JSON

**Exit codes:** 0 (success)

#### sync connect

Connect to a specific peer.

```bash
sw sync connect <ADDRESS>
```

**Arguments:**
- `ADDRESS` - Peer address (host:port)

**Note:** Manual peer connection pending full network integration.

**Exit codes:** 0 (success)

---

### node

Manage the Swimchain node.

#### node start

Start the node in foreground mode.

```bash
sw node start [OPTIONS]
```

**Options:**
- `--listen <ADDR>` - Listen address (default: 0.0.0.0:9735)
- `--connect <ADDR>` - Connect to peer after starting
- `--background` - Run in background (not yet implemented)

**Output (text):**
```
Loading identity...
Enter password to unlock identity:
Password:

Starting node...

Node started successfully!
═══════════════════════════════════════
  Listen address: 0.0.0.0:9735
  Identity:       sw1qqqq...
  Chain height:   0
  State:          Running
═══════════════════════════════════════

Press Ctrl+C to stop the node...
```

**Exit codes:** 0 (success), 1 (error), 3 (identity error)

#### node stop

Stop a running node.

```bash
sw node stop
```

Currently displays usage information. Background node support with IPC is planned for a future release.

**Exit codes:** 0 (success)

#### node status

Show node status.

```bash
sw node status [--json]
```

**Options:**
- `--json` - Output as JSON

**Output (JSON):**
```json
{
  "state": "stopped",
  "uptime_seconds": 0,
  "peers": 0,
  "chain_height": 0,
  "sync_percent": 0.0,
  "storage_used_mb": 0,
  "storage_percent": 0.0,
  "swimmer_level": ""
}
```

**Exit codes:** 0 (success)

#### node peers

List connected peers.

```bash
sw node peers [--json]
```

**Options:**
- `--json` - Output as JSON

**Output (JSON):**
```json
{
  "peers": [],
  "count": 0
}
```

**Exit codes:** 0 (success)

#### node connect

Connect to a specific peer.

```bash
sw node connect <ADDR>
```

**Arguments:**
- `ADDR` - Peer address (host:port)

**Note:** Live connection commands require the node to be running. IPC support for runtime commands is planned for a future release.

**Exit codes:** 0 (success)

#### node disconnect

Disconnect from a peer.

```bash
sw node disconnect <PEER_ID>
```

**Arguments:**
- `PEER_ID` - Peer ID (hex string, at least 8 characters)

**Exit codes:** 0 (success), 1 (invalid peer ID)

#### node sync

Show sync status.

```bash
sw node sync [--json]
```

**Options:**
- `--json` - Output as JSON

**Output (JSON):**
```json
{
  "state": "idle",
  "headers_synced": 0,
  "blocks_synced": 0,
  "best_known_height": 0
}
```

**Exit codes:** 0 (success)

#### node contribution

Show contribution metrics.

```bash
sw node contribution [--json]
```

**Options:**
- `--json` - Output as JSON

**Output (JSON):**
```json
{
  "enabled": false,
  "bandwidth_served_30d": 0,
  "bandwidth_served_formatted": "0 B",
  "uptime_ratio": 0.0,
  "uptime_percent": "0.0%"
}
```

**Exit codes:** 0 (success)

---

### config

Configuration management.

#### config show

Show all configuration settings.

```bash
sw config show [--json]
```

**Options:**
- `--json` - Output as JSON

**Exit codes:** 0 (success)

#### config get

Get a specific configuration value.

```bash
sw config get <KEY>
```

**Arguments:**
- `KEY` - Configuration key

**Available keys:**
- `network_port` - Network port (1024-65535)
- `storage_target_mb` - Storage target in MB (100-100000)
- `pow_parallelism` - PoW parallelism (0=auto, 2=mobile, 4=desktop)
- `sync_on_startup` - Sync on startup (true/false)
- `output_format` - Default output format (text/json)
- `data_dir` - Data directory path
- `followed_spaces` - Comma-separated list of followed spaces

**Exit codes:** 0 (success), 1 (unknown key)

#### config set

Set a configuration value.

```bash
sw config set <KEY> <VALUE>
```

**Arguments:**
- `KEY` - Configuration key
- `VALUE` - Value to set

**Exit codes:** 0 (success), 1 (invalid key/value)

#### config path

Show the data directory path.

```bash
sw config path
```

**Exit codes:** 0 (success)

#### config reset

Reset configuration to defaults.

```bash
sw config reset [--yes]
```

**Options:**
- `-y, --yes` - Skip confirmation prompt

Does not affect identity.

**Exit codes:** 0 (success)

---

### completions

Generate shell completion scripts.

#### completions generate

Generate a completion script for your shell.

```bash
cs completions generate <SHELL>
```

**Arguments:**
- `SHELL` - Shell to generate completions for: `bash`, `zsh`, `fish`, `powershell`, `elvish`

**Examples:**
```bash
# Bash
cs completions generate bash > ~/.local/share/bash-completion/completions/sw

# Zsh (add ~/.zfunc to fpath first)
cs completions generate zsh > ~/.zfunc/_cs

# Fish
cs completions generate fish > ~/.config/fish/completions/sw.fish

# PowerShell
cs completions generate powershell >> $PROFILE
```

**Exit codes:** 0 (success)

See [Shell Completion Setup](cli-completions.md) for detailed installation instructions.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CHAINSOCIAL_DATA_DIR` | Override data directory location |

## Files

| File | Location | Description |
|------|----------|-------------|
| `identity.enc` | `<data_dir>/` | Encrypted identity (private key) |
| `config.toml` | `<data_dir>/` | Configuration file |

## Data Directory Locations

| Platform | Default Path |
|----------|--------------|
| Linux | `~/.local/share/swimchain/` |
| macOS | `~/Library/Application Support/io.swimchain.swimchain/` |
| Windows | `%APPDATA%\swimchain\swimchain\` |

## See Also

- [CLI Usage Guide](cli-usage.md) - Getting started and common workflows
- [CLI Scripting Guide](cli-scripting.md) - Automation and scripting examples
- [Shell Completion Setup](cli-completions.md) - Tab completion installation
- [Identity System](../SPEC_01_IDENTITY.md) - Identity specification
- [Content System](../SPEC_02_CONTENT.md) - Content and decay specification
