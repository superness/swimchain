# Public RPC allowlist proxy

This is the service behind `swimchain.io/rpc`. It exists because the node
authorizes **any** method for a validly-signed request, so exposing the raw node
RPC would let the public call admin methods. This proxy forwards **only** an
allowlisted set of read/write methods, and only from allowlisted source IPs.

**It is production-critical and was previously unversioned** (lived only on the
seed droplet at `/opt/chess-rpc-proxy/`). It is now in the repo so the public
attack surface is auditable and change-controlled (launch readiness B5).

## What it enforces (`rpc-allowlist-proxy.mjs`)

- **Method allowlist** (`ALLOWED`): read methods + the writes that carry their
  own self-verifying signature + PoW (`submit_post`/`submit_reply`/
  `submit_engagement`, sponsorship offer/claim). **No admin methods** (`stop`,
  `add_peer`), **no `sign_message`**, **no raw media**. Anything else →
  `-32601 method not allowed via public proxy`.
- **Source allowlist** (`ALLOWED_SOURCES`): localhost + the gateway droplet IP
  only. Listens on `0.0.0.0` so the nginx gateway can use it as an RPC backend;
  the source check (not a firewall) keeps it closed to the world.
- **POST-only**, JSON body required.

## Known launch item still open

`claim_sponsorship_offer` is in the allowlist (needed for one-click onboarding),
which is what makes the auto-approve faucet sybil-drainable while claim PoW is
trivial (launch readiness B6). Tightening claim cost / rate-limiting is the fix;
until then the faucet relies on the genesis/faucet identity reposting offers.

## Deploy

The live copy runs as `chess-rpc-proxy.service` on the seed droplet. To update:
copy this file to `/opt/chess-rpc-proxy/chess-rpc-proxy.mjs` and
`systemctl restart chess-rpc-proxy`. Keep the two in sync — this repo copy is
the source of truth going forward.
