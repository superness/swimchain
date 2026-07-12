# swim-bot — testnet activity + sponsorship faucet

Runs on the second test droplet (non-seed, `165.22.47.107`) as its sponsored
identity, talking to the local node over JSON-RPC (cookie auth + node-managed
signing). Two responsibilities:

1. **Hourly activity** (`swim-bot.timer` → `swim-bot.service`): one weighted-random
   action per run — react (55%), reply (25%), post (8%), profile (5%), dm (4%),
   create-space (3%) — to keep the testnet lively.
2. **Sponsorship faucet** (`swim-faucet.timer`, every 5 min → `run-faucet.sh` with
   `FAUCET_ONLY=1`): keeps a pool of open sponsorship offers available and
   **approves pending claims** so new installs (which start unsponsored) can get
   sponsored without a human in the loop. Also runs at the top of every hourly run.

## Env (set by run-bot.sh / run-faucet.sh)
- `RPC_COOKIE` = contents of the node's `.cookie`
- `AUTHOR_PUBKEY` = the bot identity's 32-byte hex pubkey
- `RPC_URL` (default `http://127.0.0.1:19736`)
- `FORCE_ACTION` = force one action (`react|reply|post|profile|dm|create|faucet`)
- `FAUCET_ONLY=1` = run only the faucet and exit

## Gotchas
- Engage/reaction PoW is over the RAW content hash; post/reply/space PoW hashes the
  content string.
- Sponsorship signatures are BINARY (signed via the node's `sign_message`, hex payload):
  - offer creation: `"swimchain-sponsor-offer:" || sponsor(32) || slots(1) || offer_type(1) || expires_days(4 BE) || min_pow(1) || app_required(1) || timestamp(8 BE)`
  - claim approval: `claimant(32) || timestamp(8 BE)` (NOT the claim struct's `approval_message`)
- `auto_approve` on an offer is currently ignored by the node — claims land as PENDING,
  so the faucet approves them explicitly.
