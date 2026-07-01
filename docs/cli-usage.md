# Chainsocial CLI Usage Guide

The `sw` command-line tool is your interface to the Chainsocial decentralized social network.

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/swimchain/swimchain.git
cd swimchain

# Build and install
cargo install --path .

# Verify installation
cs --version
```

### From Crates.io (when published)

```bash
cargo install swimchain
```

## Quick Start

### 1. Create Your Identity

Your identity is an Ed25519 keypair that represents you on the network. There is no password recovery, so choose a strong password and back up your identity.

```bash
sw identity create
```

This will:
- Generate a new Ed25519 keypair
- Perform proof-of-work (~30 seconds)
- Encrypt your private key with your password
- Display your permanent address (starts with `sw1`)

### 2. Create or Join a Space

Spaces are communities where content is posted.

```bash
# Create a new space
sw space create --name "Rust Programming"

# Or join an existing space
sw space join sp1qqqqqqqqqqqqqqqqqqqqqqqqqqqq
```

### 3. Post Content

Create posts in spaces you've joined:

```bash
sw post create --space sp1xxx... --title "Hello World" --body "My first post!"
```

### 4. View Posts

View a post by its content ID:

```bash
sw post view sha256:abc123...
```

### 5. Check Sync Status

Monitor network synchronization:

```bash
sw sync status
```

## Common Workflows

### Backup Your Identity

Always keep a backup of your identity:

```bash
# Export to a file
sw identity export backup.bin

# Export as base64 (for email/chat)
sw identity export --base64 > backup.txt
```

### Restore Identity on New Device

```bash
# From file
sw identity import backup.bin

# From base64
sw identity import --base64 < backup.txt
```

### Configure Storage Limits

```bash
# Set storage target to 1GB
sw config set storage_target_mb 1000

# Check current settings
sw config show
```

### Search Local Content

Search for posts stored locally:

```bash
# Basic search
sw search "rust programming"

# Filter by space
sw search --space sp1xxx... "async"

# Sort by newest
sw search --sort newest "tutorial"
```

## Configuration

Configuration is stored in `config.toml` in your data directory.

### Data Directory Locations

- **Linux**: `~/.local/share/swimchain/`
- **macOS**: `~/Library/Application Support/io.swimchain.swimchain/`
- **Windows**: `%APPDATA%\swimchain\swimchain\`

You can override this with the `CHAINSOCIAL_DATA_DIR` environment variable.

### Configuration Options

| Key | Default | Description |
|-----|---------|-------------|
| `network_port` | 9735 | Network listening port |
| `storage_target_mb` | 500 | Target storage size in MB |
| `pow_parallelism` | 0 | PoW threads (0=auto, 2=mobile, 4=desktop) |
| `sync_on_startup` | true | Sync when starting |
| `output_format` | text | Default output format (text/json) |

### Example config.toml

```toml
network_port = 9735
storage_target_mb = 1000
pow_parallelism = 4
sync_on_startup = true
output_format = "text"
followed_spaces = ["sp1abc...", "sp1def..."]
```

## Troubleshooting

### "No identity found"

You need to create an identity first:
```bash
sw identity create
```

### "Decryption failed - wrong password?"

Double-check your password. If you've forgotten it, you'll need to restore from a backup.

### PoW takes too long

Try using mobile parallelism:
```bash
sw config set pow_parallelism 2
```

### Low disk space

Reduce your storage target:
```bash
sw config set storage_target_mb 200
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CHAINSOCIAL_DATA_DIR` | Override data directory location |

## Getting Help

```bash
# General help
cs --help

# Command-specific help
sw identity --help
sw space create --help
```

## Shell Completions

Enable tab completion for faster command entry:

```bash
# For bash
cs completions generate bash > ~/.local/share/bash-completion/completions/sw

# For zsh
cs completions generate zsh > ~/.zfunc/_cs

# For fish
cs completions generate fish > ~/.config/fish/completions/sw.fish
```

See [Shell Completion Setup](cli-completions.md) for detailed installation instructions.

## Scripting

The CLI supports JSON output for scripting and automation:

```bash
# Use --json flag for machine-readable output
sw identity show --json
sw sync status --json | jq '.connected_peers'
```

See [CLI Scripting Guide](cli-scripting.md) for examples and best practices.

## Next Steps

- Read the [CLI Reference](cli-reference.md) for detailed command documentation
- Set up [Shell Completions](cli-completions.md) for faster command entry
- Learn [CLI Scripting](cli-scripting.md) for automation
- Check the [Architecture](../ARCHITECTURE.md) to understand how Chainsocial works
- Join the community on Discord (coming soon)
