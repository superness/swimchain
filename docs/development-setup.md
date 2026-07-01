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
