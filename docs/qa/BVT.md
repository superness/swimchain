# Swimchain BVT — Build Verification Tests

The repeatable go/no-go sweep for the testnet. Run it after any fleet deploy,
before any launch-scope change, or on demand. Two tiers:

- **Tier 1 (automated):** `bash scripts/bvt.sh` — network, consensus, and
  public-funnel checks. Read-only by default; `--e2e` adds the one
  slot-consuming test. Exits non-zero on any FAIL and prints a table.
- **Tier 2 (UI, operator- or agent-driven):** swim-auto checklist below.
  Every item has the exact command and the thing to verify in the screenshot.

Record each run in `docs/qa/bvt-runs/<date>.md`: the Tier-1 table verbatim,
one line per Tier-2 item (pass/fail + shot path), and any new issue filed.
A run PASSES only if every non-optional item passes.

## Environment facts (update here when topology changes)

| Thing | Where |
|---|---|
| Fleet | seed 167.71.241.252 · bot 165.22.47.107 · client2 167.172.236.60 |
| Gateway (stateless web front door) | 167.99.116.63 (`/rpc` → seed:3400, client2:3400 backup) |
| SSH | seed via ssh config; bot/client2/gateway `-i ~/.ssh/swimchain_seed_ed25519` |
| Droplet node data | `/var/lib/swimchain-testnet` (cookie at `.cookie`) |
| Operational sponsor | faucet identity `2fa758fc…` on the bot droplet (swim-faucet.timer, 5 min) |
| Genesis | COLD — never online; not part of any BVT |
| Local QA node | `node tools/app-automation/cli.js fresh qa2` (ports 19745/6, non-genesis) |

## Tier 1 — automated (`scripts/bvt.sh`)

| # | Test | Pass criteria |
|---|---|---|
| A1 | Fleet convergence | all 3 droplets report the same `latest_height` |
| A2 | Chain liveness | tip advanced within the last 2 h (bot posts hourly) |
| A3 | Consensus quiet | no `Rolled back` and <10 `Deep-fork guard` lines in any droplet journal in 24 h |
| A4 | Node sanity | every droplet: `root_blocks >= latest_height`, RPC responds < 5 s |
| A5 | Fork-race health | ≤2 `lower hash tiebreaker` reorgs in 6 h on the seed; rollbacks re-announce orphans (regression: height-365 colliding-creators incident, `docs/CONSENSUS_ACTION_LOSS.md`; unit guard `tests/fork_race_reinclusion.rs`) |
| B1 | Website up | `/`, `/reef/`, `/chess/`, `/example/`, `/download` all 200 via gateway |
| B2 | RPC through gateway | `list_spaces` returns ≥1 space **with a resolved name** |
| B3 | Offer availability | ≥1 auto-approve offer with `slots_remaining > 0` from the faucet identity |
| B4 | Search | `search("commons", types=[space])` returns ≥1 space result |
| B5 | *(--e2e)* Sponsorship end-to-end | throwaway identity → claim via gateway → sponsored < 180 s (consumes one faucet slot) |
| B6 | *(--failover, brief seed-proxy stop)* | `/rpc` still answers (from client2) with seed proxy stopped |

## Tier 2 — UI sweep (swim-auto; Read every screenshot)

Start: `node tools/app-automation/cli.js fresh qa2`, then
`SWIM_AUTO_NODE_RPC=http://127.0.0.1:19746 SWIM_AUTO_NODE_DATADIR=C:\github\swimchain\qa2-testnet node tools/app-automation/cli.js open <client>`.
Gotchas live in `docs/qa/rounds/2026-07-13-night/HANDOFF.md` (stale-cookie
lockout, `clients build` after rebuilds, native `<select>` needs `eval`).

| # | Surface | Steps | Verify |
|---|---|---|---|
| U1 | feed home | `open feed` → screenshot | Your Feed renders; follows rehydrate from the node (not empty on a fresh profile if the identity has follows) |
| U2 | feed Discover | click Discover → screenshot | space names resolve (no raw `sp1…` for named spaces); private-space names decrypt |
| U3 | feed post detail | open any post → screenshot | byline shows display name; space chip shows the space NAME |
| U4 | forum thread | `open forum` → open a thread → screenshot | byline = name + address + copy; health bar; no white-on-dark inputs |
| U5 | chat | `open chat` → screenshot | DM list populated from node state; no literal `**` in messages |
| U6 | search | `open search` → search "commons" → screenshot | The Commons appears as a SPACE card |
| U7 | wiki | `open wiki` → screenshot | loads; empty-state copy does NOT mention follows |
| U8 | hide-space | Discover → right-click a space → Hide → screenshot; Settings → Hidden Spaces → Unhide | menu renders; space vanishes; unhide restores |
| U9 | live reef | `stop` + `goto https://swimchain.io/reef/` → screenshot | landing renders; (with B5) create-identity → sponsored → game view |
| U10 | live chess | `goto https://swimchain.io/chess/` → screenshot | landing renders |
| U11 | launcher | `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` launch exe; `node tools/app-automation/drive-launcher.mjs shot <png>` | unlock renders; after unlock: registry tiles; app tile spawns its exe |
| U12 | phone *(only when its APK ≥ the deep-fork-guard build)* | `adb exec-out screencap` | status bar height matches fleet; top feed item sane |

## Known-red items (do not re-file; check for regressions only)

M1 raw identifiers on unresolved-name surfaces · chat's thread→channel
explosion for content spaces · client-fix distribution gap (feed/forum/chat
fixes reach users only via desktop/mobile releases) · phone offline until a
guarded APK ships.
