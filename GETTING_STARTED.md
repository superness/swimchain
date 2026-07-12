# Getting Started with Swimchain

This guide will walk you through running two local nodes, connecting them, and using the clients to post content, reply, and engage with the network.

## Network Modes

Swimchain supports three network modes, each with isolated networks (different magic bytes, data directories, and rules):

| Mode | Usage | PoW Difficulty | Magic Bytes | Data Dir Suffix |
|------|-------|----------------|-------------|-----------------|
| **Mainnet** | Production | 100% | SWIM | (none) |
| **Testnet** | Public testing | 10% | TEST | `-testnet` |
| **Regtest** | Local development | 0.1% | REGT | `-regtest` |

### Network Isolation

Each mode uses different "magic bytes" in the wire protocol, so nodes on different networks **cannot accidentally connect**:
- A regtest node will reject connections from mainnet nodes (and vice versa)
- Each mode uses a separate data directory (e.g., `~/.swimchain-regtest/` vs `~/.swimchain/`)
- This ensures your local testing never interferes with production data

For local testing, we use **regtest mode** (`--regtest` flag) which:
- Reduces PoW difficulty to 0.1% of mainnet (near-instant posting and space creation)
- Allows self-sponsorship (no need for an existing member)
- Uses isolated data directory and network

## Prerequisites

### Required Software

- **Rust** (1.70+): [Install Rust](https://rustup.rs/)
- **Node.js** (18+): [Install Node.js](https://nodejs.org/)
- **Git**: For cloning the repository

### Verify Installation

```bash
rustc --version    # Should be 1.70 or higher
node --version     # Should be 18 or higher
cargo --version
npm --version
```

## Step 1: Build the Project

```bash
# Clone the repository
git clone https://github.com/superness/swimchain.git
cd swimchain

# Build the CLI and node in release mode
cargo build --release

# The CLI binary is now at target/release/sw
# Add to PATH for convenience
export PATH="$PWD/target/release:$PATH"

# Verify
sw --version
```

## Step 2: Create Identities for Two Nodes

Each node needs its own identity. Open **two terminals**.

> **Important**: Since we'll use regtest mode for testing, create identities WITH the `--regtest` flag. Each network mode uses a separate data directory (`./node-a-data-regtest/` for regtest, `./node-a-data/` for mainnet).

### Terminal 1 (Node A)

```bash
cd swimchain

# Set base data directory for Node A
# With --regtest, the actual directory will be ./node-a-data-regtest/
export SWIMCHAIN_DATA_DIR="./node-a-data"

# Create identity for Node A in regtest mode
./target/release/sw --regtest identity create

# You'll be prompted:
# - Enter a password (remember this!)
# - Wait briefly for proof-of-work (reduced in regtest mode)
#
# Output will show your address: sw1abc123...
```

### Terminal 2 (Node B)

```bash
cd swimchain

# Set base data directory for Node B
export SWIMCHAIN_DATA_DIR="./node-b-data"

# Create identity for Node B in regtest mode
./target/release/sw --regtest identity create

# Same process - different password for this identity
```

**Save both addresses!** You'll need them later.

## Step 3: Start Both Nodes in Regtest Mode

**Important**: Both nodes must use `--regtest` to communicate. Regtest nodes only connect to other regtest nodes (different magic bytes).

### Terminal 1 (Node A - Port 29735)

```bash
export SWIMCHAIN_DATA_DIR="./node-a-data"

# Start Node A in regtest mode (note the regtest default port 29735)
./target/release/sw --regtest node start --listen 127.0.0.1:29735
```

You should see:
```
╔══════════════════════════════════════════════════════════════════╗
║  REGTEST MODE - Local development network                        ║
║                                                                  ║
║  • Anti-abuse gating relaxed for local development testing       ║
║  • PoW difficulty reduced to 0.1%                                ║
║  • Self-sponsorship allowed                                      ║
║  • Network isolation: regtest nodes only connect to regtest      ║
║  • Magic bytes: REGT (0x52454754)                                ║
╚══════════════════════════════════════════════════════════════════╝

Starting node on 127.0.0.1:29735...
Node started. Press Ctrl+C to stop.
```

### Terminal 2 (Node B - Port 29736)

```bash
export SWIMCHAIN_DATA_DIR="./node-b-data"

# Start Node B in regtest mode, connecting to Node A
./target/release/sw --regtest node start --listen 127.0.0.1:29736 --connect 127.0.0.1:29735
```

You should see both nodes report a connected peer.

## Step 4: Create a Space

With both nodes running, open a **third terminal**:

### Terminal 3 (CLI Operations)

```bash
cd swimchain
export SWIMCHAIN_DATA_DIR="./node-a-data"

# Create a test space using regtest mode
# The --regtest flag reduces PoW difficulty (near-instant space creation)
./target/release/sw --regtest space create --name "Test Space"

# You'll see a banner confirming regtest mode:
# ╔══════════════════════════════════════════════════╗
# ║  REGTEST MODE - For local development only       ║
# ║  Reduced PoW difficulty for fast local testing   ║
# ╚══════════════════════════════════════════════════╝

# Note the space ID (sp1...)
```

The space will propagate to Node B via gossip.

> **Note**: In regtest mode, PoW difficulty is reduced to 0.1% of normal, so space creation is near-instant. On mainnet, space creation is the highest-difficulty PoW action — that computational cost, not any status or level, is what deters spam and ensures space creators have put in real work.

## Step 5: Post Content

```bash
# Create a post in the space (continue using regtest mode)
./target/release/sw --regtest post create \
  --space sp1<your-space-id> \
  --title "Hello Swimchain!" \
  --body "This is my first post on the decentralized network."

# Note the content ID (sha256:...)
```

### View the post on Node B

```bash
export SWIMCHAIN_DATA_DIR="./node-b-data"

# View the post (should have propagated)
./target/release/sw post view sha256:<content-id>
```

## Step 6: Reply to Content

```bash
export SWIMCHAIN_DATA_DIR="./node-b-data"

# Reply from Node B's identity (regtest mode)
./target/release/sw --regtest post reply \
  --parent sha256:<original-post-id> \
  --body "Great first post! Welcome to Swimchain."
```

## Step 7: Engage with Content (Keep it Alive)

Content decays without engagement. To extend a post's life:

```bash
./target/release/sw --regtest post engage sha256:<content-id>

# A single valid engagement is one PoW action.
# It immediately resets the content's decay timer.
# Sockpuppets don't help: each reset costs full engagement PoW
# regardless of identity, so extra identities only multiply your cost.
```

## Using the Forum Client (Web UI)

The forum client provides a full web interface. In a new terminal:

### Build and Run Forum Client

```bash
cd swimchain/forum-client

# Install dependencies
npm install

# Build the WASM bindings first
cd ../swimchain-wasm
cargo build --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/swimchain_wasm.wasm \
  --out-dir ../swimchain-js/pkg \
  --target web

# Back to forum client
cd ../swimchain-js
npm install

cd ../swimchain-react
npm install

cd ../forum-client
npm run dev
```

Open `http://localhost:5173` in your browser.

### Forum Client Features

- **Identity Page**: Create or import your identity
- **Space Browser**: Navigate spaces and view threads
- **Post Composition**: Create posts with PoW progress indicator
- **Reply Tree**: View and reply to discussions
- **Heat Indicator**: See content decay status
- **Engage**: Do a PoW engagement to reset a post's decay timer

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SWIMCHAIN NETWORK                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐                     ┌─────────────┐               │
│   │   Node A    │ ←── Gossip/Sync ──→ │   Node B    │               │
│   │  Port 9735  │                     │  Port 9736  │               │
│   └──────┬──────┘                     └──────┬──────┘               │
│          │                                   │                       │
│          │ Local                             │ Local                 │
│          ↓                                   ↓                       │
│   ┌─────────────┐                     ┌─────────────┐               │
│   │ CLI / Forum │                     │ CLI / Forum │               │
│   │   Client    │                     │   Client    │               │
│   └─────────────┘                     └─────────────┘               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Swimming Metaphor

| Term | Meaning |
|------|---------|
| **Swimming** | Proof of Work (effort to participate) |
| **Strokes** | Posts/replies (each costs energy) |
| **Lanes** | Spaces (communities) |
| **Drift/Decay** | Content fading without engagement |

### Recognition

Hosting and participation earn **achievements** — permanent, non-transferable badges shown on your profile. Your **poster reputation** is a per-identity score that reflects community spam attestations against your content. Both are cosmetic signals: nothing you earn reduces PoW, extends decay, raises rate limits, or gates space creation. Every identity plays by the same rules, and image posting (500KB cap) is available to everyone.

### Content Lifecycle

```
New Post                              Decayed (Gone)
    │                                      ↑
    │  Engagement (one PoW action)         │
    ├───────────────────────────────→ Decay Timer Reset
    │                                      │
    ↓                                      │
Decay Timer Running ──────────────────────→
    (7 day half-life, or 4 hours if spam-flagged)
```

## Troubleshooting

### "Connection refused" when connecting nodes

Make sure Node A is running before starting Node B with `--connect`.

### PoW takes too long

Reduce parallelism for testing:
```bash
./target/release/sw config set pow_parallelism 2
```

### "No identity found"

Make sure `SWIMCHAIN_DATA_DIR` is set and you're using the same network mode as when you created the identity:
```bash
# Check your base directory
echo $SWIMCHAIN_DATA_DIR

# Check the actual directory used (depends on network mode):
# - Mainnet: $SWIMCHAIN_DATA_DIR
# - Testnet: $SWIMCHAIN_DATA_DIR-testnet
# - Regtest: $SWIMCHAIN_DATA_DIR-regtest

# For regtest mode, check:
ls -la "${SWIMCHAIN_DATA_DIR}-regtest"

# If you created identity without --regtest but now using --regtest,
# the identity won't be found. Re-create with --regtest:
./target/release/sw --regtest identity create
```

### Forum client build fails

Ensure you've built the WASM bindings:
```bash
cd swimchain-wasm
cargo build --target wasm32-unknown-unknown --release
```

### Nodes don't see each other's content

Content propagation uses the I_HAVE/GET/DATA protocol. When content is created:
1. It's stored locally and written to `pending_broadcast/`
2. The node's background task broadcasts I_HAVE messages to connected peers
3. Peers that don't have the content send GET requests
4. The original node responds with DATA_CONTENT

Wait 5-10 seconds for propagation (broadcast runs every 5 seconds), then check logs:
```bash
# Check Node A's log for broadcast
grep "CONTENT-BROADCAST\|CONTENT-SYNC" node-a-data-regtest/node.log

# Check Node B's log for receipt
grep "CONTENT-SYNC" node-b-data-regtest/node.log
```

You should see:
- `[CONTENT-BROADCAST] Broadcasting content ... to N peers` - Content announced
- `[CONTENT-SYNC] Received I_HAVE from ...` - Peer received announcement
- `[CONTENT-SYNC] Sending GET to ...` - Peer requesting content
- `[CONTENT-SYNC] Stored content ...` - Content received and stored

### Running automated content sync test

There's a test script for verifying two-node content propagation:

```bash
# Set password (use the password from identity create)
export SWIMCHAIN_PASSWORD="your-password"

# Run the test
./scripts/test-two-node-sync.sh
```

The script:
1. Starts two nodes in regtest mode
2. Connects them together
3. Creates a space and post on Node A
4. Waits for propagation
5. Verifies the content is visible on Node B

## CLI Command Reference

### Identity Commands
```bash
sw identity create           # Create new identity
sw identity show             # Display current identity
sw identity export backup.bin # Backup identity
sw identity import backup.bin # Restore identity
```

### Space Commands
```bash
sw space create --name "My Space"  # Create space (highest-difficulty PoW action)
sw --regtest space create --name "My Space"  # Create in regtest (fast PoW)
sw space join sp1...               # Join existing space
sw space leave sp1...              # Leave space
sw space list                      # List joined spaces
```

### Post Commands
```bash
sw post create --space sp1... --title "Title" --body "Content"
sw --regtest post create --space sp1... --title "Title" --body "Content"  # Fast PoW
sw post reply --parent sha256:... --body "Reply text"
sw post view sha256:...            # View a post
sw post engage sha256:...          # Engage (one PoW action; resets decay timer)
```

### Network Mode Flags
```bash
sw --regtest <command>   # Local development (fast PoW, relaxed anti-abuse)
sw --testnet <command>   # Test network (reduced PoW)
sw <command>             # Mainnet (full PoW)
```

### Node Commands
```bash
sw node start                       # Start on default port
sw node start --listen 0.0.0.0:9735 # Specify listen address
sw node start --connect host:port   # Connect to peer on start
sw node status                      # Show node status
sw node peers                       # List connected peers
sw node sync                        # Show sync status
```

### Utility Commands
```bash
sw search "query"                   # Search local content
sw config show                      # Show configuration
sw config set key value            # Set config option
sw --help                          # Full command list
```

## Next Steps

1. **Run the other clients**: Try `reddit-client/`, `chat-client/` for different UX
2. **Read the specs**: See `specs/` for protocol details
3. **Earn achievements**: Host content to collect hosting badges on your profile
4. **Test attestation**: Flag spam content, see accelerated decay
5. **Try sponsorship**: (Phase 9) Sponsor new identities into the network

## Resources

- [CLI Reference](docs/cli-reference.md) - Full command documentation
- [Vision Document](VISION.md) - Project philosophy and architecture
- [Specifications](specs/) - Protocol specifications
- [Website](https://swimchain.io) - Project homepage

---

*Built with 🏊 by the Swimchain community*
