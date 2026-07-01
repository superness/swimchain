# Swimchain

**Website:** [swimchain.io](https://swimchain.io)

[![CI](https://github.com/swimchain/swimchain/actions/workflows/ci.yml/badge.svg)](https://github.com/swimchain/swimchain/actions/workflows/ci.yml)

Decentralized social media protocol. No servers, no algorithms, no ads.

> Every user runs a node. Content decays naturally without engagement. Posting requires proof-of-work friction. Communities can fork away from capture.

## Why "Swimchain"?

**Swimming requires effort.** You can't passively float through this network.

| Metaphor | Reality |
|----------|---------|
| **Swim** | Proof of work - you put in effort to participate |
| **Lanes** | Spaces - stay in your lane, respect community boundaries |
| **Pool** | The network - everyone's in it together |
| **Strokes** | Posts - each one takes effort |
| **Drift** | Decay - without engagement, content fades away |

**"Have you checked your swimchain?"**

See [VISION.md](VISION.md) for the full design philosophy and [GLOSSARY.md](GLOSSARY.md) for complete terminology.

## Quick Start

### Prerequisites

- Rust 1.70+ ([install via rustup](https://rustup.rs/))
- Git

### Build

```bash
git clone https://github.com/swimchain/swimchain.git
cd swimchain
cargo build
```

### Test

```bash
cargo test
```

### Run

```bash
cargo run
```

## Project Structure

```
swimchain/
├── src/              # Source code
│   ├── lib.rs        # Library root
│   ├── main.rs       # CLI entry point
│   ├── identity/     # Identity system (SPEC_01)
│   └── crypto/       # Cryptographic primitives
├── tests/            # Integration tests
├── benches/          # Benchmarks
└── docs/             # Documentation
```

## Documentation

- [Vision Document](VISION.md) - Core philosophy and architecture
- [Roadmap](ROADMAP.md) - Implementation milestones
- [Development Setup](docs/development-setup.md) - Detailed environment setup
- [Contributing](CONTRIBUTING.md) - How to contribute

## Specifications

- [SPEC_01: Identity](specs/SPEC_01_IDENTITY.md) - Key generation, signing, verification
- [SPEC_02: Content & Decay](specs/SPEC_02_CONTENT_DECAY.md) - Heat model, decay mechanics
- [SPEC_03: Proof of Work](specs/SPEC_03_PROOF_OF_WORK.md) - PoW computation, pooled engagement

## License

MIT OR Apache-2.0
