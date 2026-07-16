---
name: deploy-web-clients
description: Use when deploying reef-client, chess-client, or any hosted web client bundle to swimchain.io — enforces build-time env verification so localhost dev fallbacks never ship to production
---

# Deploying hosted web clients (reef, chess, …)

**Never hand-roll `npm run build` + scp for hosted clients. Run:**

```bash
bash scripts/deploy-web-clients.sh          # both reef and chess
bash scripts/deploy-web-clients.sh reef     # one client
```

## Why this exists (2026-07-16 incident)

Vite bakes `import.meta.env.VITE_*` at **build time**. The clients fall back to
`http://127.0.0.1:19746` (LOCAL_TESTNET) when `VITE_RPC_ENDPOINT` is unset, and
show "No reef space configured" when `VITE_REEF_SPACE` / `VITE_CHESS_SPACE` is
unset. A bare `npm run build` shipped exactly that: visitors got Chrome's
local-network permission prompt ("wants to access apps or services on this
device") and onboarding hung at "Setting up your access".

## The rules

1. Every hosted client needs a committed `.env.production` with its production
   values. reef and chess have them; if you add a new hosted client, add one
   and register it in `scripts/deploy-web-clients.sh` (SPEC map).
2. A built bundle that does not contain `swimchain.io/rpc` and the client's
   `sp1…` space id MUST NOT be deployed. The script greps for both, pre- and
   post-deploy (live asset).
3. Web hosts are the seed (167.71.241.252, ssh-config key) and the gateway
   (167.99.116.63, `-i ~/.ssh/swimchain_seed_ed25519`); roots are
   `/var/www/reef` and `/var/www/chess` on both.
4. After deploy, users need a hard refresh (Ctrl+Shift+R) to drop the cached
   old bundle.
