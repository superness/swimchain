# Development Environment Setup

## System Requirements

| Component | Requirement | Notes |
|-----------|-------------|-------|
| Rust | 1.70+ | Edition 2021 features |
| Cargo | (comes with Rust) | Build system |
| Git | 2.x+ | Version control |

### Optional

- Docker - For multi-node testing (Phase 4)
- VS Code with rust-analyzer - Recommended IDE

## Installing Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

Verify:
```bash
rustc --version  # Should be 1.70+
cargo --version
```

## IDE Setup

### VS Code

1. Install [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
2. Optional: Install [Even Better TOML](https://marketplace.visualstudio.com/items?itemName=tamasfe.even-better-toml)

### JetBrains (IntelliJ/CLion)

1. Install Rust plugin from Marketplace

## Dependencies

Swimchain uses these core libraries (from ROADMAP Appendix B):

| Crate | Purpose | Specification |
|-------|---------|---------------|
| `tokio` | Async runtime | - |
| `ed25519-dalek` | Ed25519 signatures | SPEC_01 |
| `blake3` | PoW hashing | SPEC_03 |
| `sha2` | Content hashing | SPEC_01 |
| `bech32` | Address encoding (Bech32m) | SPEC_01 Section 3.3 |
| `bincode` | Binary serialization | - |
| `clap` | CLI argument parsing | - |

## Working in a git worktree

`git worktree add` copies tracked files only, and three things the JS clients
need are gitignored — so a fresh worktree cannot build any client until you
bootstrap it:

```bash
scripts/setup-worktree.sh                 # shared libs, WASM, .claude hooks
scripts/setup-worktree.sh reef-client     # ...and that client's own deps
scripts/setup-worktree.sh --all-clients   # ...or every client that links them
```

What it fixes, and why each is easy to miss:

| Missing | Why it bites |
|---|---|
| `node_modules/` in `swimchain-js`, `swimchain-react`, `swimchain-frontend` | Eleven clients link these via npm `file:`, which is a *symlink* — the linked package resolves its own imports (`@noble/curves`, `@noble/hashes`, `@noble/ciphers`) from its own directory, so an empty one breaks every client that signs anything. |
| `swimchain-js/pkg/` | Ignored by its own generated `swimchain-js/pkg/.gitignore` containing `*`, so it is invisible in the root `.gitignore` and the directory looks tracked. `@swimchain/core`'s loader dynamically imports `../pkg/swimchain_wasm.js` from `swimchain-js/dist/`. |
| `.claude/` | Gitignored, so repo-local hooks and settings do not follow a worktree. |

The first two fail **after a clean `tsc -b`** — TypeScript resolves types through
the symlink and never follows the dynamic WASM import, so the error surfaces only
at bundle time and names a package nobody in the worktree declared. Verify a
worktree with a real build, never a typecheck alone:

```bash
cd reef-client && npm install && npm run build
```

## Building

```bash
# Debug build
cargo build

# Release build
cargo build --release

# Check without building
cargo check
```

## Testing

```bash
# Run all tests
cargo test

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test test_name
```

## Troubleshooting

### Common Issues

**Error: linker not found**
```bash
# Ubuntu/Debian
sudo apt install build-essential

# macOS
xcode-select --install
```

**Error: openssl not found**
```bash
# Ubuntu/Debian
sudo apt install libssl-dev pkg-config

# macOS
brew install openssl
```

### Platform Notes

- **Windows**: Use WSL2 for best experience
- **macOS**: Xcode command line tools required
- **Linux**: Build essentials package required
