# E2E Write-Path Validation (SWIM-Q2)

Proves each client's **write path** produces node-accepted content against a
**real regtest node**: post → PoW → sign → accepted on chain → readable back
via `get_content` / `get_replies` / reaction queries. This is the suite that
catches writes a real node rejects (PoW byte/config mismatches, missing auth
headers) that mocked tests cannot see.

## What it covers

| Client   | Write paths                                                        |
|----------|--------------------------------------------------------------------|
| forum    | `create_space`, `submit_post`, `submit_reply`, `submit_engagement` (raw-hash), bogus-PoW rejection |
| feed     | `submit_post`, `submit_engagement` (pre-fix string-hash pinned as rejected; fixed raw-hash accepted) |
| chat     | channel via `submit_post`, message via `submit_reply`, pre-fix message composition pinned as rejected |
| wiki     | page via `submit_post`, revision reply via `submit_reply` (PR #45 byte contract), body-only PoW pinned as rejected |
| archiver | `sign_message` → `submit_engagement` → `get_pool_for_content` re-poll (PR #39 sequence) |
| bridge   | inbound message → `submit_post` / threaded `submit_reply` (SWIM-B7), pre-fix composition pinned as rejected |

Tests import the clients' **own** rpc / action-pow / wasm modules (no
re-implemented crypto). Where composition lives in React hooks/pages, the
exact strings are mirrored 1:1 with file references in test comments.

## Running

```bash
# one-time setup
cargo build --release                                  # sw binary
for d in forum-client feed-client chat-client wiki-client archiver-client \
         bridge-client swimchain-frontend swimchain-react swimchain-js; do
  (cd $d && npm install)
done
(cd swimchain-react && npm run build)                  # dist/ is consumed by archiver
(cd tests/e2e-write-paths && npm install)

# run everything (harness boots + tears down its own regtest node)
cd tests/e2e-write-paths && npm test

# single client
npm run test:forum   # / test:feed / test:chat / test:wiki / test:archiver / test:bridge
```

`SW_BIN` overrides the node binary path (default `target/release/sw[.exe]`,
falling back to `target/debug`).

## Runtime

- Node boot to healthy: ~2–3 s; teardown removes the temp data dir.
- Full suite: **~30 s** wall clock on a typical dev machine (19 tests;
  Argon2id mining at regtest params, difficulty 6, is a few hundred ms per
  action). Each `vitest run` boots one node on `127.0.0.1:39735` (RPC 39736)
  with an isolated temp data dir; test files run sequentially against it.

## Harness

- `harness/node-harness.ts` — locate binary, temp data dir, `identity create`,
  `node start --regtest`, `/health` polling, process-tree kill + dir cleanup.
- `harness/global-setup.ts` — one node per vitest run.
- `harness/browser-shims.ts` — minimal `window`/`localStorage` so client
  modules import under Node (no jsdom; real fetch/crypto from Node ≥ 18).

## Regtest PoW contract (why some client defaults can't pass here)

The node verifies action PoW by **recomputing Argon2id with its own network
config** (`ForkPoWConfig`): regtest = 1 MiB/1 iter/1 lane (`TEST_CONFIG`),
testnet = 8 MiB (`TESTNET_CONFIG`). Client UI flows hardcode
`getConfig(isTestnet=true)`, which matches testnet nodes (the deploy target)
but not regtest. These tests therefore mine with the clients' own
`TEST_CONFIG` export. Minimum accepted difficulty on regtest is 4 bits.
