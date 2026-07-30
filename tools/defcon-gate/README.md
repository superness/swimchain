# DEF CON 34 gate — operator runbook

DEF CON 34 runs Aug 6-9, 2026 in Las Vegas. This is the start-to-finish
checklist for standing up code-word onboarding for it: a dedicated mainnet
node + keeper daemon (`defcon-gate.mjs`) that auto-approves anyone who submits
the shared gate code, on two tiers (a GLOBAL sponsorship for full-node
attendees, a space-scoped one for browser attendees via `defcon-client`).

Every command below is literal. Where a value can't be known until an earlier
step runs (an IP, a pubkey, a space id), it's a shell variable you set once at
the top of that step and reuse — never a "configure X" hand-wave.

Read alongside (not duplicated here):
- `tools/defcon-gate/defcon-gate.mjs` — the keeper: every env var, decision
  logic, the `GATE_CODE=SET-AT-GO-LIVE` refuse-to-start guard, `PAUSED`,
  `DRY_RUN`, `ONCE`.
- `tools/defcon-gate/mint-space.mjs` — one-shot, idempotent `@defcon34` space
  minter; prints `DEFCON_SPACE_HEX=` / `DEFCON_SPACE_BECH32=` on stdout.
- `tools/defcon-gate/deploy/defcon-gate-mainnet.service` — the keeper's
  systemd unit; its own header has the scp/enable recipe.
- `tools/defcon-gate/rehearse-regtest.sh` — the 9-step scripted regtest E2E
  drill; run it first, and read its comments (the `get_sponsorship_status`
  vs `get_sponsorship_info` finding below comes from here).
- `web-gateway/deploy/nginx-defcon-location.conf` — the nginx snippet for
  `/defcon`.
- `scripts/deploy-web-clients.sh` — builds, verifies, and deploys the client
  bundles (including bake-time marker verification).
- `scripts/bvt.sh` — the fleet smoke test (checks `/defcon/` returns 200).

## Topology

| Host | Role | Notes |
|---|---|---|
| **Operator's own machine** | Holds the vaulted **mainnet genesis** identity | Never deployed to a droplet — same rule as testnet genesis (`docs/TESTNET_DEPLOY_RUNBOOK.md` §1). Dials out when a sponsor action is needed, can go offline otherwise. |
| **Gate droplet — NEW, provisioned in §1** | Runs `defcon34`'s own mainnet node + the gate keeper. Nothing else. | IP assigned in §1; every command below uses `$GATE_IP`. |
| **Seed — 167.71.241.252** | Existing mainnet node + web client host | Also runs `swimchain-mainnet.service` already — the gate droplet's node peers with it. |
| **Gateway — 167.99.116.63** | `swimchain.io` web front door: nginx, `/rpc` proxy, `/var/www` | Second web client host; also fronts `/defcon`. |

Set these once per shell session:
```bash
GATE_IP=<filled in by §1>
SEED=167.71.241.252
GATEWAY=167.99.116.63
GATE_KEY="$HOME/.ssh/swimchain_gate_ed25519"
```

---

## 1. Provision the gate droplet

New, smallest tier, dedicated — nothing else runs here. This is deliberately
its own box (see `defcon-gate-mainnet.service`'s header): folding the keeper
into an existing host would mean a DEF CON incident and an unrelated host
outage take each other down together.

**1.1 — SSH key + droplet.**
```bash
ssh-keygen -t ed25519 -f "$GATE_KEY" -C "defcon34 gate droplet" -N ""
doctl compute ssh-key import defcon-gate --public-key-file "$GATE_KEY.pub"
KEY_ID=$(doctl compute ssh-key list --format ID,Name --no-header | grep defcon-gate | awk '{print $1}')
doctl compute droplet create \
  --region nyc1 \
  --size s-1vcpu-1gb \
  --image ubuntu-22-04-x64 \
  --ssh-keys "$KEY_ID" \
  swimchain-defcon-gate
GATE_IP=$(doctl compute droplet get swimchain-defcon-gate --format PublicIPv4 --no-header)
echo "GATE_IP=$GATE_IP"
```
(Any provider/tier works — `s-1vcpu-1gb` is DigitalOcean's smallest. Bump it
later if chain sync/storage needs more; the keeper itself is a few-MB Node
process and doesn't drive the requirement.)

**1.2 — Base packages + firewall.** P2P (9735) open, RPC (9736) never opened —
the node's RPC bind defaults to `127.0.0.1` (`NodeConfig::rpc_bind`,
`src/node/config.rs:232,357`; there is no `--rpc-bind` CLI flag or other way
to set it from anything else), so simply never punching 9736
through the firewall is the whole enforcement:
```bash
ssh -i "$GATE_KEY" root@$GATE_IP <<'EOF'
apt update && apt upgrade -y
apt install -y ufw nodejs npm
ufw allow 22/tcp
ufw allow 9735/tcp
ufw --force enable
ufw status
EOF
```

**1.3 — Build the Linux `sw` binary in WSL** (the existing build-paths
workflow — same recipe `docs/TESTNET_DEPLOY_RUNBOOK.md` §5 step 2 uses,
pointed at `main` instead of a testnet magic bump):
```bash
wsl bash -lc 'cd ~ && rm -rf sb && git clone -q https://github.com/superness/swimchain.git sb && cd sb && cargo build --release'
```
Do **not** reuse a copied `target/` cache (stale-mtime gotcha, same doc) —
build clean.

**1.4 — Ship the binary + data dir.** WSL's `/mnt/c/...` and Git Bash's
`/c/...` are the same underlying `C:\` drive, so hop the binary out of WSL
onto a path Git Bash's `scp` can read directly, then ship it:
```bash
mkdir -p /c/tmp && wsl mkdir -p /mnt/c/tmp
wsl cp ~/sb/target/release/sw /mnt/c/tmp/sw-defcon-gate-linux
scp -i "$GATE_KEY" /c/tmp/sw-defcon-gate-linux root@$GATE_IP:/usr/local/bin/sw
ssh -i "$GATE_KEY" root@$GATE_IP "chmod +x /usr/local/bin/sw && mkdir -p /var/lib/swimchain-mainnet && /usr/local/bin/sw --version"
```

**1.5 — Stage (but do not yet start) the node's own systemd unit.** It needs
`SWIMCHAIN_PASSWORD` and an identity that don't exist yet — both are §2's
job. This unit is intentionally **not** checked into this repo, matching the
existing convention that a droplet's own node unit (e.g. the seed's
`swimchain-mainnet.service`) lives only on the box:
```bash
ssh -i "$GATE_KEY" root@$GATE_IP "cat > /etc/systemd/system/swimchain-mainnet.service" <<'EOF'
[Unit]
Description=Swimchain mainnet node (DEF CON 34 gate droplet)
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/lib/swimchain-mainnet
Environment=SWIMCHAIN_PASSWORD=REPLACE_IN_SECTION_2
ExecStart=/usr/local/bin/sw --data-dir=/var/lib/swimchain-mainnet node start --listen 0.0.0.0:9735 --connect 167.71.241.252:9735
Restart=always
RestartSec=5
NoNewPrivileges=true
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
ssh -i "$GATE_KEY" root@$GATE_IP "systemctl daemon-reload"
```
`--connect 167.71.241.252:9735` peers directly with the seed's existing
mainnet node (same reasoning `docs/TESTNET_DEPLOY_RUNBOOK.md` gives for
dialing a known-good peer rather than sitting at 0 peers).

---

## 2. Mint `defcon34` on the gate node, sponsor it from genesis, verify

**2.1 — Create the identity ON the gate droplet** (this identity IS the node,
and IS the keeper's signing identity later — one identity, three roles).
Pick a password with no `/` or `&` in it (the next step substitutes it
through `sed`, where both are delimiter/replacement-syntax characters):
```bash
ssh -i "$GATE_KEY" root@$GATE_IP "SWIMCHAIN_PASSWORD='<pick a password, record it in the ops vault, never git>' /usr/local/bin/sw --data-dir=/var/lib/swimchain-mainnet identity create"
ssh -i "$GATE_KEY" root@$GATE_IP "SWIMCHAIN_PASSWORD='<same password>' /usr/local/bin/sw --data-dir=/var/lib/swimchain-mainnet identity show"
```
Record the printed `Address:` (`cs1...`) and `Public key:` (64 hex chars) —
`DEFCON34_ADDRESS` / `DEFCON34_PUBKEY` below.

**2.2 — Fill the real password into the unit staged in §1.5, then start the node:**
```bash
ssh -i "$GATE_KEY" root@$GATE_IP "sed -i 's#REPLACE_IN_SECTION_2#<same password>#' /etc/systemd/system/swimchain-mainnet.service && systemctl daemon-reload && systemctl enable --now swimchain-mainnet"
ssh -i "$GATE_KEY" root@$GATE_IP "sleep 5 && journalctl -u swimchain-mainnet -n 30 --no-pager"
```

**2.3 — On the operator's own machine: unvault the mainnet genesis seed and
sponsor `defcon34` directly.** The mainnet genesis identity is
`994fd0af22ebc66fcc5da4cdc1cdb94500d18d2dcec514415edeb975a84809e3` /
`cs1qzv5l590yt4uvm7vtkjvmswdh9zsp5vd9h8v29zptm0tjadgfqy7xccn5ac`
(`src/sponsorship/genesis_list.rs` — only the *public* key lives in the repo;
the seed is vaulted per `docs/MAINNET_LAUNCH_READINESS.md` B1 and must never
touch this repo or the gate droplet). If a local genesis data dir from launch
already exists, reuse it; otherwise:
```bash
GENESIS_DIR=~/mainnet-genesis
SWIMCHAIN_PASSWORD='<vaulted genesis password>' sw --data-dir=$GENESIS_DIR identity import-seed <vaulted genesis seed hex>
```
Start it locally, dialing the gate droplet directly so the Sponsor action
reaches it fast, then run `sponsor direct`:
```bash
SWIMCHAIN_PASSWORD='<vaulted genesis password>' sw --data-dir=$GENESIS_DIR node start --listen 127.0.0.1:9735 --connect $GATE_IP:9735 &
sleep 5
SWIMCHAIN_PASSWORD='<vaulted genesis password>' sw --data-dir=$GENESIS_DIR sponsor direct <DEFCON34_ADDRESS>
```
Do **not** pass `--probationary` — `defcon-gate.mjs` needs `defcon34` to
create sponsorship offers immediately, not after a probation window.

**2.4 — Verify on the GATE node** (not the genesis node), using
`get_sponsorship_status`, **not** `get_sponsorship_info`. Task 9's rehearsal
found `get_sponsorship_info` has an *unconditional regtest bypass*
(`src/rpc/methods.rs:16894-16912`, "In regtest mode, all identities are
considered sponsored") that makes it vacuously true there — irrelevant on
mainnet (no such bypass exists outside regtest), but `get_sponsorship_status`
is what every real client (`ensureSponsored.ts`) and `scripts/bvt.sh` actually
depend on, so standardize on it everywhere for consistency:
```bash
GATE_COOKIE=$(ssh -i "$GATE_KEY" root@$GATE_IP "cat /var/lib/swimchain-mainnet/.cookie")
curl -s --user "__cookie__:$GATE_COOKIE" -X POST http://$GATE_IP:9736/ \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"get_sponsorship_status\",\"params\":{\"identity\":\"<DEFCON34_PUBKEY>\"},\"id\":1}"
```
(RPC binds `127.0.0.1` on the droplet, so this curl only works run *on* the
droplet, or over an SSH tunnel — `ssh -i "$GATE_KEY" -L 9736:127.0.0.1:9736 root@$GATE_IP`
then target `127.0.0.1:9736` locally.)

`get_sponsorship_status`'s own handler treats a Sponsor action sitting in the
gate node's mempool as sponsored already (`has_sponsorship`) — it does not
wait for block formation (`src/rpc/methods.rs:9155-9172`, the same
chain+mempool-is-reality design law as everywhere else). It should flip
`true` within seconds of the two nodes peering. If it doesn't after ~60s,
check the two nodes are actually peered (`node peers` on both sides) before
assuming anything is stuck on block formation — the P2P link, not a missing
block, is almost always the actual blocker.

---

## 3. Mint the `@defcon34` space

Run **on the gate droplet** (RPC is localhost-only, and this needs
`hash-wasm` for the Argon2id action PoW — installing it locally on the
droplet avoids relying on any other host's `node_modules`):
```bash
scp -i "$GATE_KEY" tools/defcon-gate/mint-space.mjs root@$GATE_IP:/opt/defcon-gate/mint-space.mjs
ssh -i "$GATE_KEY" root@$GATE_IP "mkdir -p /opt/defcon-gate && cd /opt/defcon-gate && npm install hash-wasm"
ssh -i "$GATE_KEY" root@$GATE_IP "cd /opt/defcon-gate && RPC_URL=http://127.0.0.1:9736 COOKIE_FILE=/var/lib/swimchain-mainnet/.cookie NODE_PATH=/opt/defcon-gate/node_modules node mint-space.mjs"
```
Record the two stdout lines:
```
DEFCON_SPACE_HEX=<32 lowercase hex chars>
DEFCON_SPACE_BECH32=sp1...
```
Re-running this command is safe (idempotent — prints the same ids and exits 0).

---

## 4. Fill in real values

**4.1 — `defcon-client/.env.production`.** `VITE_DEFCON_SPACE` **must be the
bech32m form** (`sp1...`), not hex, despite the sibling var being hex —
`ensureSponsored`'s `requireExactScope` does a plain `===` against
`offer.space_scope`, and the node always returns a scoped offer's
`space_scope` bech32m-encoded, so the hex form silently fails every
scoped-tier match. Edit:
```
VITE_DEFCON_SPONSOR=<DEFCON34_PUBKEY, 64 hex chars>
VITE_DEFCON_SPACE=<DEFCON_SPACE_BECH32 from §3, the sp1... line — NOT the hex line>
```

**4.2 — `scripts/deploy-web-clients.sh`'s two sentinels (its own step — do
not skip).** The script's `SPEC[defcon]` entry checks that the *built bundle*
contains the same sponsor hex and space bech32m as `.env.production`, using
two variables that are deliberately unsatisfiable placeholders today:
```
DEFCON_SPONSOR_PENDING_TASK10=PENDING-TASK10-DEFCON-SPONSOR-HEX
DEFCON_SPACE_PENDING_TASK10=PENDING-TASK10-DEFCON-SPACE-BECH32M
```
Edit **both lines in `scripts/deploy-web-clients.sh`** so their *values*
match §4.1 exactly (keep the variable *names* — only the assigned string
changes):
```
DEFCON_SPONSOR_PENDING_TASK10=<DEFCON34_PUBKEY, same 64 hex chars as .env.production>
DEFCON_SPACE_PENDING_TASK10=<DEFCON_SPACE_BECH32, same sp1... as .env.production>
```
If you forget this step, `deploy-web-clients.sh defcon` will `FATAL` on every
run (by design — the sentinel is unsatisfiable until edited) even after
`.env.production` is correct, because the two files are checked *against each
other*. Commit both files together.

**4.3 — Pick the real gate code.** Format `WORD-####` (matches
`GATE_CODE=SET-AT-GO-LIVE`'s placeholder shape), not guessable, **never
committed anywhere** — `defcon-gate.mjs` actively refuses to start
(`exit 2`) if `GATE_CODE` still equals the shipped placeholder, specifically
because that placeholder is public and `codeMatches()` is a case-insensitive
equality check. Generate one and keep it only in the ops vault + the deployed
(not the repo) copy of the systemd unit:
```bash
echo "$(shuf -n1 /usr/share/dict/words 2>/dev/null | tr a-z A-Z || echo WORD)-$(shuf -i 1000-9999 -n1)"
```
Both this code and `DEFCON_SPACE_HEX` from §3 get written into the deployed
(not the repo) copy of `defcon-gate-mainnet.service` in §5.1, only after a
`DRY_RUN` pass confirms the keeper's decision logic looks sane — deliberately
after, not before, so a bad value never gets validated by, or leaked into,
the process holding the real code.

---

## 5. Deploy

**5.1 — Keeper, dry run first.** Copy the repo's unit (still carrying the
`SET-AT-GO-LIVE`/`SET-AFTER-TASK-5-MINT-SPACE` placeholders — real values go
in only on the deployed copy, per §4.3):
```bash
scp -i "$GATE_KEY" tools/defcon-gate/gate-logic.mjs tools/defcon-gate/defcon-gate.mjs root@$GATE_IP:/opt/defcon-gate/
scp -i "$GATE_KEY" tools/defcon-gate/deploy/defcon-gate-mainnet.service root@$GATE_IP:/etc/systemd/system/
ssh -i "$GATE_KEY" root@$GATE_IP 'cd /opt/defcon-gate && RPC_URL=http://127.0.0.1:9736 COOKIE_FILE=/var/lib/swimchain-mainnet/.cookie ONCE=1 DRY_RUN=1 GATE_CODE=TEMP-0000 END_AT=2099-01-01T00:00:00Z DEFCON_SPACE_HEX=<hex from §3> node defcon-gate.mjs'
```
Confirm the log lines look sane (tier decisions, no errors), **then** edit
the deployed unit's `Environment=DEFCON_SPACE_HEX=` to the real hex from §3
and `Environment=GATE_CODE=` to the real code from §4.3 (edit the file
*on the droplet*, not in git):
```bash
ssh -i "$GATE_KEY" root@$GATE_IP "sed -i \
  -e 's/DEFCON_SPACE_HEX=SET-AFTER-TASK-5-MINT-SPACE/DEFCON_SPACE_HEX=<hex from §3>/' \
  -e 's/GATE_CODE=SET-AT-GO-LIVE/GATE_CODE=<real code>/' \
  /etc/systemd/system/defcon-gate-mainnet.service"
ssh -i "$GATE_KEY" root@$GATE_IP 'systemctl daemon-reload && systemctl enable --now defcon-gate-mainnet'
ssh -i "$GATE_KEY" root@$GATE_IP 'journalctl -u defcon-gate-mainnet -n 30 --no-pager'
```

**5.2 — Clients:**
```bash
bash scripts/deploy-web-clients.sh defcon
```
This builds `defcon-client`, verifies the built bundle actually contains the
sponsor hex + space bech32m (§4.2's sentinels), ships it to **both** the seed
and the gateway, and re-verifies the live-served asset on each host.

**5.3 — nginx.** Paste `web-gateway/deploy/nginx-defcon-location.conf`'s
`location /defcon { ... }` block into `/etc/nginx/sites-enabled/swimchain.io`
**above** the catch-all `location /`, on both hosts that serve it:
```bash
for host in $SEED $GATEWAY; do
  k=""; [ "$host" = "$GATEWAY" ] && k="-i $HOME/.ssh/swimchain_seed_ed25519"
  scp $k web-gateway/deploy/nginx-defcon-location.conf root@$host:/tmp/nginx-defcon-location.conf
  ssh $k root@$host 'echo "--- paste /tmp/nginx-defcon-location.conf into /etc/nginx/sites-enabled/swimchain.io, above location / ---"'
done
```
(There is no automated splice here on purpose — the same catch-all-ordering
mistake elsewhere in this fleet has bitten before; do it by hand, then
`nginx -t && systemctl reload nginx` on each host.)

**5.4 — Public RPC proxy: verify it points at mainnet, not testnet.** The
allowlist itself already covers every method the DEF CON join flow needs
(`list_sponsorship_offers`, `claim_sponsorship_offer`, `get_sponsorship_status`
are all present in `web-gateway/rpc-proxy/rpc-allowlist-proxy.mjs` — no
allowlist change required). But the *repo copy* of that file hardcodes
`port: 19736` (testnet), while the deployed proxy must talk to the mainnet
node on `9736`. Before go-live, confirm the **live** proxy config, not the
repo file. The deployed path is still `/opt/chess-rpc-proxy/` — a name left
over from before this proxy served every client, not just chess; see
`web-gateway/rpc-proxy/README.md` for the current scope/allowlist behind
that historical name:
```bash
ssh -i "$HOME/.ssh/swimchain_seed_ed25519" root@$SEED "grep -n 'port:' /opt/chess-rpc-proxy/chess-rpc-proxy.mjs"
```
It must read `port: 9736`. If it doesn't, fix the deployed copy (not
necessarily this repo file, which is testnet-flavored) and
`systemctl restart chess-rpc-proxy`.

**5.5 — Browse allowlist (optional — makes `@defcon34` visible at
`/browse`).** `web-gateway/src/lib/config/showcase.ts` reads
`SHOWCASE_SPACE_IDS` / `SHOWCASE_SPACE_NAMES` from the environment, set today
via `Environment=` lines in the `swimchain-gateway.service` unit (see that
unit's own comment: deployed on the seed). To add `@defcon34`, append the new
space id/name to the existing comma-separated values in a systemd override
on whichever host runs `swimchain-gateway.service`:
```bash
ssh -i "$HOME/.ssh/swimchain_seed_ed25519" root@$SEED 'systemctl edit swimchain-gateway'
# Add, merging with whatever is already configured:
#   [Service]
#   Environment=SHOWCASE_SPACE_IDS=<existing ids>,<DEFCON_SPACE_BECH32 from §3>
#   Environment=SHOWCASE_SPACE_NAMES=<existing pairs>,<DEFCON_SPACE_BECH32>=DEFCON 34
ssh -i "$HOME/.ssh/swimchain_seed_ed25519" root@$SEED 'systemctl daemon-reload && systemctl restart swimchain-gateway'
```

**5.6 — BVT:**
```bash
bash scripts/bvt.sh
```
`B1` already probes `/defcon/` (`for path in / /reef/ /chess/ /example/ /download /defcon/`) — must read `200`. All of A1-A5/B1-B4 must pass green.

---

## 6. Rehearsals

**6.1 — Testnet dress rehearsal** (same steps as above, against testnet,
testnet genesis from `GENESIS_IDENTITY.md` — `cs1qz0v…2kj7` /
`9ec9661d…0420`, password `testpass123`). Before hand-running it live, run
the scripted regtest drill once as a fast sanity check that every signature
and flow is byte-correct against the real Rust verifier:
```bash
cd tools/swim-bot && npm install && cd ../..   # once, for hash-wasm
bash tools/defcon-gate/rehearse-regtest.sh
```
All 9 steps must print `PASS`/`ALL 9 STEPS PASSED`. Then repeat the actual
§1-§5 sequence against `--testnet` (a second gate box, or the existing
testnet seed's spare capacity — either way, keep it off the mainnet
identity/space/keeper entirely).

**6.2 — Mainnet rehearsal, capped, before raising limits for the con.** Use a
throwaway test code (never the real one from §4.3) and a small cap so a
mistake can't onboard the whole con's worth of slots:
```bash
REHEARSAL_END_AT=$(date -u -d '+6 hours' +%Y-%m-%dT%H:%M:%SZ)
ssh -i "$GATE_KEY" root@$GATE_IP "sed -i \
  -e 's/GATE_CODE=.*/GATE_CODE=REHEARSAL-0001/' \
  -e 's/TOTAL_CAP=.*/TOTAL_CAP=5/' \
  -e 's/END_AT=.*/END_AT=$REHEARSAL_END_AT/' \
  /etc/systemd/system/defcon-gate-mainnet.service"
ssh -i "$GATE_KEY" root@$GATE_IP 'systemctl daemon-reload && systemctl restart defcon-gate-mainnet'
```
Then, **from a real phone browser**, load `https://swimchain.io/defcon`,
join with `REHEARSAL-0001`, and confirm sponsorship completes end to end
(the same `get_sponsorship_status` check as §2.4, run against the phone's own
generated identity). One real approval against `TOTAL_CAP=5` is harmless —
it's fine to leave it counted rather than reset the state file. When this
passes, proceed straight to §7 (don't leave the rehearsal code/cap live any
longer than needed — the `END_AT` above is a 6-hour backstop, not a reason to
relax).

---

## 7. Go-live (Wed Aug 5, 2026)

```bash
ssh -i "$GATE_KEY" root@$GATE_IP "sed -i \
  -e 's/GATE_CODE=.*/GATE_CODE=<real code from §4.3>/' \
  -e 's/TOTAL_CAP=.*/TOTAL_CAP=500/' \
  -e 's/HOURLY_CAP=.*/HOURLY_CAP=60/' \
  -e 's/END_AT=.*/END_AT=2026-08-10T07:00:00Z/' \
  /etc/systemd/system/defcon-gate-mainnet.service"
ssh -i "$GATE_KEY" root@$GATE_IP 'systemctl daemon-reload && systemctl restart defcon-gate-mainnet'
ssh -i "$GATE_KEY" root@$GATE_IP 'journalctl -u defcon-gate-mainnet -n 20 --no-pager'
bash scripts/bvt.sh
```
`END_AT=2026-08-10T07:00:00Z` is midnight Pacific after the con's last day
(already the shipped default — confirm it wasn't overwritten by §6.2's
rehearsal edit). Once BVT is green, post the announcement (code word,
`https://swimchain.io/defcon`, and the full-node `sw sponsor claim` path for
attendees running their own node).

---

## 8. Kill switches (fastest first)

**8.1 — `PAUSED=1`, seconds.** Skips the tick body entirely; the process
stays alive (still polling, still logging `paused`), so this is the fastest
reversible stop:
```bash
ssh -i "$GATE_KEY" root@$GATE_IP "sed -i '/\[Service\]/a Environment=PAUSED=1' /etc/systemd/system/defcon-gate-mainnet.service && systemctl daemon-reload && systemctl restart defcon-gate-mainnet"
```
Undo:
```bash
ssh -i "$GATE_KEY" root@$GATE_IP "sed -i '/^Environment=PAUSED=1$/d' /etc/systemd/system/defcon-gate-mainnet.service && systemctl daemon-reload && systemctl restart defcon-gate-mainnet"
```

**8.2 — `systemctl stop defcon-gate-mainnet`, fail-closed.** No approvals,
no rejects, no offer upkeep — pending claims just sit pending. This is the
"something is actively wrong, stop touching the chain at all" switch:
```bash
ssh -i "$GATE_KEY" root@$GATE_IP 'systemctl stop defcon-gate-mainnet'
```

**8.3 — Cancel the standing offers.** Stops *new* claims immediately (already
claimed/approved sponsorships are untouched — this only closes the door, it
doesn't revoke anyone already through it). The keeper does this itself once,
automatically, at `END_AT`; to do it manually and immediately:
```bash
ssh -i "$GATE_KEY" root@$GATE_IP '/usr/local/bin/sw --data-dir=/var/lib/swimchain-mainnet sponsor offer-list --json'
# for each offer_id belonging to defcon34:
ssh -i "$GATE_KEY" root@$GATE_IP '/usr/local/bin/sw --data-dir=/var/lib/swimchain-mainnet sponsor offer-cancel <offer_id>'
```

**8.4 — Subtree revocation (the nuclear option — cuts every identity
`defcon34` ever sponsored, not just future claims).**

**This command is not settled yet and must not be invented.** Every
`defcon34`-sponsored identity is a child in its sponsor subtree, and SPEC_11's
consequence-propagation (`src/sponsorship/penalty.rs`,
`SponsorshipManager::on_misbehavior`/`on_spam_flagged_content`,
`src/sponsorship/manager.rs:124-155`) is what would cut that whole subtree at
once via a `MisbehaviorSeverity` penalty on `defcon34` itself. Read closely,
this repo has **no direct CLI/RPC verb** for "genesis, penalize this identity
now" — `on_misbehavior` is only ever reached through
`submit_spam_attestation` (SPEC_12, `src/rpc/methods.rs:10696`, three or more
already-sponsored identities flagging a specific `content_id` as spam/abuse),
not through anything in `src/cli/commands/sponsor.rs`. The closest real,
already-existing `sw sponsor` commands are §8.3's `offer-cancel` (stops new
claims, proven above) and `sw sponsor reject <offer_id> <claimant>`
(per-claim) — neither retroactively de-sponsors an already-approved cohort.

**Before go-live, during the testnet dress rehearsal (§6.1), actually attempt
this path end to end**: from 3+ sponsored testnet identities, call
`submit_spam_attestation` against a `content_id` authored by the testnet
stand-in for `defcon34` (e.g. its `@defcon34` seed post), escalate through
`MisbehaviorSeverity::Spam`/`Abuse`/`Illegal`, and confirm via
`get_sponsorship_status` that the whole downstream cohort's
`has_sponsorship` flips `false`. Record the exact verified RPC calls
(`content_id`, `reason`, attester count/threshold actually observed) here:

```
<< REPLACE THIS BLOCK WITH THE REHEARSAL-VERIFIED COMMAND SEQUENCE >>
<< do not go live without having executed it once on testnet — SPEC_11 >>
```

Until that block is filled in from a real rehearsal, treat 8.1-8.3 as the
only proven kill switches, and budget for the fact that 8.4 may require a
short Rust/RPC change to expose a direct admin verb if the attestation path
turns out impractical to drive fast enough during a live incident (that
would be a follow-up task, not something to invent here).

---

## 9. During-con watch

**Live log — every decision is one line:**
```bash
ssh -i "$GATE_KEY" root@$GATE_IP 'journalctl -fu defcon-gate-mainnet'
```
Each tick logs, per tier: offer count and `needNew`/`ok`, then per pending
claim: `claim <id> on <offer> -> approve|reject|skip (<reason>)`.

**Fleet health:**
```bash
bash scripts/bvt.sh
ssh -i "$GATE_KEY" root@$GATE_IP 'systemctl status swimchain-mainnet defcon-gate-mainnet --no-pager'
```

**State-file counters** (source of truth for the caps, survives restarts —
`{"totalApproved":N,"approvedAtMs":[...],"canceledAtEnd":false}`, small and
human-readable, no parsing required):
```bash
ssh -i "$GATE_KEY" root@$GATE_IP 'cat /opt/defcon-gate/defcon-gate-state.json'
```

**What "hourly-cap pause" looks like:** the log line reads
`claim <id> on <offer> -> skip (hourly-cap)` (`gate-logic.mjs`'s
`gateDecision`, `reason: 'hourly-cap'`) for every pending claim that tick —
not a crash, not a rejection, just parked. It self-clears as the
trailing 1-hour window slides (`gate-logic.mjs`'s `hourlyCount`), no restart
needed. Raise it only if a legitimate registration line is backed up for
more than a few minutes with real attendees waiting — bump
`Environment=HOURLY_CAP=` on the deployed unit, `daemon-reload`, `restart`;
don't raise `TOTAL_CAP` reactively without confirming the increase still
fits inside the con's remaining runway.
