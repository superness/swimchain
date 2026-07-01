# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Build
cargo build                    # Debug build
cargo build --release          # Release build (CLI binary at target/release/sw)

# Test
cargo test --all-targets       # Run all tests (unit + integration)
cargo test --lib               # Unit tests only
cargo test --test block_building  # Single integration test by name
cargo test my_test_name        # Run tests matching a name

# Lint & Format (must pass CI)
cargo fmt --all -- --check     # Check formatting
cargo fmt --all                # Auto-format
cargo clippy --all-targets --all-features -- -A clippy::unreadable_literal -A clippy::similar_names -A clippy::redundant_else -W clippy::all

# Benchmarks
cargo bench                    # All benchmarks (in benches/)

# Run the node
cargo run                     # Run node (mainnet)
cargo run -- --regtest node start --listen 127.0.0.1:29735  # Local dev mode

# Client apps (forum-client, chat-client, etc.)
cd forum-client && npm install && npm run dev   # Vite dev server on :5173
cd forum-client && npm run build                # Production build (tsc -b && vite build)
```

## Architecture

Swimchain is a decentralized social media protocol. Users run P2P nodes; there are no servers. Content decays naturally without engagement. Posting requires proof-of-work.

### Workspace Structure

The Cargo workspace has two members:
- **swimchain** (root) — The node, CLI, and library
- **swimchain-wasm** — Minimal WASM bindings (Ed25519, SHA-256, Bech32m) used by browser clients

### Core Rust Modules (`src/`)

The node is structured as a library (`lib.rs`) with two binaries (`main.rs` CLI, `bin/cs.rs` shorthand `sw`).

**Protocol layer:**
- `types/` — Core protocol types: Identity, Block, Content, network structures
- `identity/` — Ed25519 key generation, signing, verification (SPEC_01)
- `crypto/` — Bech32m address encoding, hashing primitives
- `blocks/` — Block building, merkle trees, recursive block hierarchy (root → space → content)
- `content/` — Content chunking, retrieval, decay mechanics (SPEC_02)
- `sponsorship/` — Sponsorship trees, penalty management (SPEC_11)
- `spam_attestation/` — Anti-abuse via attestation aggregation (SPEC_12)
- `fork/` — Fork management and chain selection (SPEC_05)
- `branch/` — Branch management and metadata

**Network layer:**
- `node/` — Node lifecycle, peer connections, router
- `network/` — P2P networking, network modes (mainnet/testnet/regtest)
- `transport/` — TCP framing, connection management
- `sync/` — Chain synchronization, fork detection, initial/continuous sync (SPEC_06)
- `discovery/` — mDNS and DHT peer discovery
- `rpc/` — JSON-RPC 2.0 HTTP server (port = P2P port + 1) with cookie auth

**Storage & indexing:**
- `storage/` — Sled embedded database, caching, aggregation
- `cli/search_index/` — Tantivy full-text search

**Social features:**
- `engagement_graph/` — Contribution tracking, engagement pooling
- `reputation/` — Reputation scoring
- `blocklist/` — Content/peer blocking
- `space_health/` — Space metrics and risk assessment

### Client Apps

Multiple React/Vite/TypeScript clients communicate with the node via JSON-RPC over HTTP:
- `forum-client/` — Discussion forums and threading
- `chat-client/` — Discord-style real-time messaging
- `mobile-client/` — React Native app
- `desktop-app/` — Tauri desktop wrapper
- `analytics-client/`, `archiver-client/`, `bridge-client/`, `feed-client/`, `search-client/`
- `swimchain-react/` — Shared React hooks and utilities for all clients

Clients use `@noble/curves` and `@noble/hashes` for client-side cryptography, or the WASM bindings from `swimchain-wasm/`.

### Network Modes

| Mode | Flag | PoW | Level Checks | Data Dir Suffix | Magic Bytes |
|------|------|-----|--------------|-----------------|-------------|
| Mainnet | (none) | 100% | Full | (none) | SWIM |
| Testnet | `--testnet` | 10% | Full | `-testnet` | TEST |
| Regtest | `--regtest` | 0.1% | Bypassed | `-regtest` | REGT |

Modes are network-isolated via different magic bytes in the wire protocol. Use `--regtest` for local development.

### Recursive Block Hierarchy

The chain uses a recursive structure: Root Block → Space Block → Content Block → Engagement Records. Proof-of-work aggregates upward through this tree. Content decays with a 7-day half-life (4 hours if spam-flagged).

## Specifications

Protocol specs live in `specs/` (SPEC_01 through SPEC_13). Each module references its governing spec. Design philosophy is in `VISION.md`, with supporting thesis documents (THESIS_01 through THESIS_10).

## Conventions

- Commit messages follow conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`
- Branch naming: `feature/`, `fix/`, `docs/`
- Integration tests in `tests/`, benchmarks in `benches/`, unit tests alongside source
- The CLI binary is `sw` (built from `src/bin/cs.rs`)
