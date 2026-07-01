# Contributing to Swimchain

## Prerequisites

- Rust 1.70+ (install via [rustup](https://rustup.rs/))
- Git 2.x+

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/swimchain/swimchain.git
   cd swimchain
   ```

2. Build the project:
   ```bash
   cargo build
   ```

3. Run tests:
   ```bash
   cargo test
   ```

4. Run the CLI:
   ```bash
   cargo run -- --help
   ```

## Development Workflow

### Branch Naming
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates

### Commit Messages
Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Adding tests
- `refactor:` Code refactoring

### Pull Request Process
1. Create a feature branch
2. Make changes with tests
3. Ensure CI passes (`cargo fmt --check && cargo clippy && cargo test`)
4. Submit PR with description

## Code Style

- Run `cargo fmt` before committing
- Address all `cargo clippy` warnings
- See `rustfmt.toml` for formatting rules

## Testing Guidelines

- Unit tests go in `src/` alongside the code
- Integration tests go in `tests/`
- Benchmarks go in `benches/`

Run benchmarks:
```bash
cargo bench
```

## Documentation

- Document all public APIs with rustdoc
- Update docs/ for architectural changes
- Keep ROADMAP.md current with milestone status

## Milestone-Based Development

See [ROADMAP.md](ROADMAP.md) for implementation milestones.
See [DEVELOPMENT_PROCESS.md](DEVELOPMENT_PROCESS.md) for the overall development process.
