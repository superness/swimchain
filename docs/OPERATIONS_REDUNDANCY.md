# Network Redundancy Assessment — 2026-07-31

Assessed the night of the fd-leak outage (seed EMFILE'd 21:17-23:14 UTC; nobody
could join the network for ~2 hours while every health check read green).
Facts verified live unless marked otherwise.

## Current topology

| Host | IP | Role | Region |
|---|---|---|---|
| seed | 167.71.241.252 | Mainnet seed (only baked introduction point), genesis identity, testnet seed, downloads mirror | nyc3 |
| bot | 165.22.47.107 | Mainnet node, game-sponsor identity + auto-approve loop, reef/chess/swim bots | nyc3 |
| client2 | 167.172.236.60 | Mainnet node, RPC proxy failover | nyc3 |
| gateway | 167.99.116.63 | Website, downloads, public /rpc proxy | nyc3 |

All four are one DigitalOcean account, one operator, one datacenter.

## Single points of failure, ranked by blast radius

1. **The DO account / NYC3 region.** Any account-level event (billing lapse,
   suspension, compromise) or a regional outage removes 100% of the network
   and 100% of the web tier at once. Nothing else on this list matters while
   this is true.
   *Mitigation:* one node at a second provider (Hetzner ~€4/mo) or minimally a
   second DO region ($6/mo). Even one out-of-blast-radius node keeps the
   network alive and re-seedable.

2. **The single baked seed** (until the 3-seeds PR lands). A fresh install has
   exactly one door; tonight it was locked for two hours.
   *Mitigation:* in flight — bake all three droplets. Attach DO reserved IPs
   (free while attached) to seed addresses first, so droplets can be
   rebuilt/replaced without invalidating addresses shipped in binaries.

3. **The gateway.** Sole web front door: website, downloads, and the /rpc
   proxy every browser user rides. Native apps survive its death; browser
   users and games do not. (RPC proxies also exist on seed + client2 :3400,
   but DNS points one way.)
   *Mitigation:* documented DNS flip procedure + low TTL now; second gateway
   later.

4. **The auto-approve sponsor identity lives only on bot.** If 165 dies,
   onboarding approval dies with it — a newcomer claims and waits forever
   (exactly the funnel stage the canary watches).
   *Mitigation:* import the game-sponsor identity on client2 as warm standby
   (open design question: verify double-approval is idempotent before running
   two live approvers).

5. **Genesis identity.** On the seed node + operator's vault. Loss ends
   genesis-sponsored operations permanently (this already happened once,
   2026-07-16). Operator should confirm the vaulted seed is where they think
   it is — tonight is a good night for that 30-second check.

6. **The operator's dev machine.** Builds, deploys, and SSH keys originate
   from one Windows laptop. Repo + scripts reproduce most of it; the SSH key
   and signing keystores are the unrecoverable parts.
   *Mitigation:* confirm the Android release keystore and seed SSH key have
   off-machine copies.

## What detection looks like (companion work)

The mainnet canary (task #7) is the detection layer for all of the above:
a synthetic user exercising connect → claim → approve → post → public-read
hourly, alerting via SendGrid email (every incident) and SMS (consecutive
failures / connect failure), with a best-effort on-chain status mirror.
Tonight's outage would have alerted at 21:18 instead of being discovered by a
human at 23:07.

## Cost of the recommended posture

| Item | Cost |
|---|---|
| Reserved IPs on 3 seed droplets | $0 (attached) |
| 4th node, other region or provider | ~$6/mo |
| DNS low-TTL + flip runbook | $0, one hour of writing |
| Sponsor identity standby on client2 | $0, one import + design check |
| Canary on gateway | $0 (existing droplet) |

Total: ~$6/mo and an afternoon to remove every single-region and
single-process failure mode short of "the operator disappears."
