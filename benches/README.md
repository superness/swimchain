# Benchmarks

Criterion benchmark suites covering the protocol, storage, and node/RPC layers.

## Suites

| Suite | Covers |
|-------|--------|
| `benchmarks` | Core protocol hot paths (hashing, blocks, merkle) |
| `chunking` | Content chunking |
| `branching` | Branch management |
| `sync` | Chain sync planning |
| `decay_simulation` | Content decay math |
| `storage_benchmarks` | Sled store operations |
| `cache_benchmark` | Aggregation/cache layer |
| `multi_node` | Node startup/shutdown, multi-node harness |
| `rpc_scenarios` | End-to-end JSON-RPC calls against a live regtest node |
| `mobile_pow` / `mobile_sync` / `mobile_storage` | Mobile performance profile |

Run locally:

```bash
cargo bench                          # everything
cargo bench --bench rpc_scenarios    # one suite
cargo bench --bench rpc_scenarios -- --test   # smoke-run each bench once
```

## RPC scenarios (`rpc_scenarios.rs`)

Starts a real regtest node with an ephemeral RPC port and measures full
client round-trips (new TCP connection per call + cookie auth — the same path
the CLI and browser clients use):

- `rpc_read/*` — hot read methods (`get_info`, `list_spaces`, ...)
- `rpc_use_case/feed_poll` — one feed-client polling tick
- `rpc_use_case/create_space`, `rpc_use_case/submit_post` — full write flows
  including client-side PoW mining and signing
- `rpc_use_case/list_space_content_populated` — listing a space with content

The suite lifts the localhost RPC rate-limit backstop via
`SWIMCHAIN_RPC_READ_PER_MINUTE` / `SWIMCHAIN_RPC_WRITE_PER_MINUTE`
(see `src/rpc/rate_limiter.rs`).

## Performance CI

`.github/workflows/perf.yml` runs all suites (grouped into three parallel
jobs) on every push to `main` and on PRs touching node code:

- Results are stored on the `gh-pages` branch under `dev/bench/` — trend
  charts are served at `https://<owner>.github.io/<repo>/dev/bench/`.
- A benchmark that slows down more than 50% vs the previous `main` data point
  gets an automatic alert comment on the commit/PR.
- CI uses short measurement windows (`--measurement-time 3 --sample-size 10`)
  because runners are noisy; treat alerts as regression signals, not
  microsecond-accurate numbers.
