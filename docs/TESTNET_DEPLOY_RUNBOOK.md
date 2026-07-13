# Testnet Deploy & Bootstrap Runbook

*How the Swimchain testnet is stood up, from a fresh chain to bots posting. Written 2026-07-12 after the TES3→TES4 cutover (the action-signature-enforcement fork). Read this before the next magic bump — it turns an afternoon of trial-and-error into a checklist.*

---

## 1. Topology (who runs what)

| Host | Role | Data dir | Notes |
|---|---|---|---|
| **Local machine (WSL)** | **Genesis node** — bootstraps the chain, issues sponsorships, then can go offline | `~/tes4-genesis` (`-testnet` suffix appended) | Genesis seed lives **only here** (see `GENESIS_IDENTITY.md`). Never deploy genesis to a droplet. Behind home NAT → it **dials out**. |
| **167.71.241.252** | **Seed node** (`swimchain.service`) + DNS seeder + **Daily Drift** + web gateway (`/browse`) + **a mainnet node** | seed: `/var/lib/swimchain-testnet`; Daily Drift bot: `/root/dispatch-bot-testnet` | ⚠️ Also runs `swimchain-mainnet.service` on the **same** `/usr/local/bin/sw`. Never `pkill -f /usr/local/bin/sw` here — it kills mainnet. Deploy manually, stop only `swimchain.service`. |
| **165.22.47.107** | **Activity bot** (`swim-bot.timer`, hourly) + **sponsorship faucet** (`swim-faucet.timer`, every 5 min) + its own testnet node (`swimchain.service`) | `/var/lib/swimchain-testnet`; bot code `/opt/swim-bot/` | Bot + faucet are the **same** `activity-bot.mjs` (faucet mode = `FAUCET_ONLY=1`). Bot signs via the local node's `sign_message` RPC as the node's own identity. |

**SSH keys:** the droplet key is `~/.ssh/swimchain_seed_ed25519` (Windows side / Git Bash). `~/.ssh/config` maps **167** to it but **not 165** — for 165 pass `-i ~/.ssh/swimchain_seed_ed25519 -o IdentitiesOnly=yes` explicitly. WSL has no key by default; copy it: `cp /mnt/c/Users/super/.ssh/swimchain_seed_ed25519 ~/.ssh/ && chmod 600 ~/.ssh/swimchain_seed_ed25519` and add matching `~/.ssh/config` entries.

**Ports:** testnet P2P `19735`, testnet RPC `19736` (P2P+1). A node started with `--listen 0.0.0.0:19740` puts its RPC on `19741`.

---

## 2. Identity & sponsorship model

- **Genesis** (`cs1qz0v…2kj7`, pubkey `9ec966…0420`) is hardcoded in `src/sponsorship/genesis_list.rs` and is self-valid. Its seed is in `GENESIS_IDENTITY.md` + `scripts/node-manager.sh`. **Local only.** Used to bootstrap sponsorships, then offline.
- **Every node/bot has its own bespoke identity**, sponsored by genesis. Nothing posts *as* genesis.
- **Daily Drift** posts as a dedicated **dispatch-bot** identity so the site can **filter the space to that one author** — otherwise anyone sponsored could post into the space and poison it. (`generate.js` filters `i.author_id === AUTHOR`.)
- **The faucet** (`165`, `FAUCET_ONLY=1`) auto-**opens sponsorship offers + approves pending claims** every 5 min, so new users self-onboard. The faucet identity must itself be sponsored **with sponsor authority** (`sponsor direct` grants `can_sponsor: true`).

### Sponsoring an identity from genesis
`sponsor direct <ADDRESS>` (genesis-only, for bootstrapping — skips the offer/claim flow):
```bash
SWIMCHAIN_PASSWORD=testpass123 \
  ~/tes4-genesis-build/sw --testnet --data-dir ~/tes4-genesis \
  sponsor direct cs1q...address...
```
This writes to genesis's sponsorship store and **propagates to peers via sponsorship-sync (~120s cycle)** — it does **not** need to be on-chain in a block, and the sponsee does **not** need to be online. Confirm from the target node: `sw --testnet --data-dir <dir> sponsor status` → `Sponsorship Status: ACTIVE`.

The **offer → claim → approve** flow (`sponsor offer-create --slots N` → `sponsor claim <OFFER_ID>` → `sponsor approve <OFFER_ID> <CLAIMANT>`) is what the faucet automates for real users. For bootstrapping our own known bots, `sponsor direct` is simpler. Note: a claim needs the claimant's CLI to reach a **running node's RPC** — see the cookie gotcha (§6).

---

## 3. Block production (why the chain looks "stuck")

Block formation is gated (`src/node/tasks.rs` ~2047 + `src/blocks/leader.rs`):

1. **PoW threshold:** `mempool.total_pow() >= difficulty_target()`. `total_pow` = Σ `action.pow_work`. A testnet action contributes only a few units, so a *quiet* chain accumulates slowly.
2. **Leader eligibility expands over time:** a node may only seal once its identity is "close enough" to the block seed, and that window **widens over `MAX_ELIGIBILITY_TIME = 480s` (8 min)**. After 8 min since the previous block, **any** identity is eligible.
3. The backup formation task checks every `BLOCK_FORMATION_CHECK_INTERVAL_SECS = 300s`; decisions log at **DEBUG** (invisible at INFO — that's why the logs look silent).

**Consequence:** on a fresh, quiet 2-node chain, blocks can take **many minutes** each, and posts sit in the mempool until a block seals. This is normal — **it is not a bug, it just needs activity.** The **activity bot + faucet are what keep blocks flowing** (steady PoW crosses the threshold; steady blocks finalize posts). Bring them up early. To force progress during bootstrap, submit a burst of actions (e.g. several `space create`s).

---

## 4. Action signing — the canonical preimage (enforced since TES4)

The node now verifies per-action Ed25519 signatures on ingest (`validate_content_action_authenticity`). **Post / Reply / Edit** must sign exactly:
```
content_hash(32) || timestamp.to_le_bytes()(8) || private(1)     # 41 bytes, v2
```
- `content_hash` = `sha256(`${title}\n\n${body}`)` for POST; `sha256(body)` for REPLY; edit is conditional.
- `timestamp` **must equal the timestamp submitted to the RPC** (the PoW timestamp). Signing a different timestamp than you submit = silent rejection. (This bit the CLI, the web clients, and the activity bot.)
- `private` = 1 only for `[PRIVATE:v1:]` encrypted content, else 0.

**Engage** keeps its own scheme (`engage:{content_id}:{nonce}:{timestamp}[:emoji]`) — leave it. **CreateSpace / private-space / DM admin actions** are pass-through (no ingest-enforced signature yet; deferred to private-space Phase 2–4). **Sponsor / GenesisRegister** are verified separately in the router's sponsorship apply path.

Where signing lives:
- **CLI** (`sw post`): `sign_content` in `src/cli/commands/post.rs` — fixed to sign the submitted timestamp.
- **Web clients**: shared `signAction()` in `swimchain-react/src/lib/signAction.ts`; all six clients converged onto it.
- **Activity bot** (`165:/opt/swim-bot/activity-bot.mjs`): `actionSigPreimage()` helper; post/reply switched to `signBytesWithNode(actionSigPreimage(...))`.

---

## 5. Fresh-chain deploy runbook (a TES-magic bump)

Ad-hoc but reliable order: **stop nodes → wipe data → deploy binaries → start genesis locally → create sponsorships → start remote nodes with bespoke identities → (claim) → start bots.**

1. **Bump the magic** in `src/network/mode.rs` (`Testnet` arm, e.g. `TES3`→`TES4`) and land the enforcement/code change on `main`. The banner in `src/bin/cs.rs` now derives from `magic_bytes()`, so it won't go stale.
2. **Build the Linux binary in WSL** from `main`:
   ```bash
   wsl bash -lc 'cd ~ && git clone -q https://github.com/superness/swimchain.git sb && cd sb && cargo build --release'
   ```
   ⚠️ **Do NOT reuse a copied `target/` cache** — mtime confusion can serve a *stale* `mode.rs` (the binary reported TES3 despite TES4 source). Build clean, or `cargo clean -p swimchain` first. Verify: the fresh node writes `network.magic` = the new magic in its data dir.
3. **167 (manual, preserve mainnet):** `systemctl stop swimchain`; `cp /usr/local/bin/sw sw.backup`; `mv sw.new sw`; `rm -rf /var/lib/swimchain-testnet /root/dispatch-bot-testnet`; `cp sw /opt/daily-drift/sw`; create the seed identity; `systemctl start swimchain`. Never touch `swimchain-mainnet`.
4. **Start local genesis**, dialing 167 so its chain propagates:
   ```bash
   sw --testnet --data-dir ~/tes4-genesis node start --listen 0.0.0.0:19740 --connect 167.71.241.252:19735
   ```
5. **Sponsor** the bespoke identities from genesis (`sponsor direct <addr>`): the 167 seed, the dispatch-bot, the 165 bot/faucet. Confirm each shows `ACTIVE` on its node (wait ~120s for sponsorship-sync).
6. **Deploy bot identities:** copy each bot's `identity.enc` to its droplet data dir (`/root/dispatch-bot-testnet`, `165:/var/lib/swimchain-testnet`). For Daily Drift the dispatch-bot is a **dedicated** identity, not genesis.
7. **Daily Drift** (`/opt/daily-drift`): point `publish.sh` `SPACE=` and `generate.js` `SPACE` at the space dispatch-bot creates, and set `generate.js` `AUTHOR` = dispatch-bot pubkey with `.filter(i => !i.parent_id && i.author_id === AUTHOR)`.
8. **165:** upload the fixed `activity-bot.mjs`, deploy the binary, restart the node **with `--connect 167.71.241.252:19735`** (the seed node drops idle peers after 30s — a plain start ends up with 0 peers), then enable `swim-bot.timer` + `swim-faucet.timer`.
9. **Let it run.** With bot + faucet active, blocks flow and posts finalize.

---

## 6. Gotchas (each one cost real time)

- **Mainnet on 167 shares `/usr/local/bin/sw`.** `deploy-to-seeds.sh --wipe` does `pkill -f /usr/local/bin/sw` → kills mainnet. Deploy 167 manually; use `mv` (not `cp`) to swap the binary so the running mainnet process keeps its open inode.
- **CLI→node RPC needs a cookie.** A bot data dir with no running node (e.g. `/root/dispatch-bot`) has no `.cookie`, so `sw --data-dir X <cmd>` fails "Failed to read RPC cookie." Share the seed node's cookie — but **symlink, don't copy**: `ln -sf /var/lib/swimchain-testnet/.cookie /root/dispatch-bot-testnet/.cookie`. A **copied** cookie goes stale the moment the seed node restarts (it regenerates its cookie), and the repeated auth failures then **lock the client out** ("too many authentication failures" — looks like a height-0 wipe but isn't). A symlink always reads the current cookie.
- **Daily Drift author filter uses the bech32 ADDRESS, not the pubkey.** `list_space_posts` returns `author_id` as `cs1q…` (bech32), so `generate.js`'s `AUTHOR` must be the dispatch-bot **address**, not its 32-byte pubkey hex — otherwise the filter matches nothing and the page renders 0 items even though the posts are finalized.
- **Restarting a node regenerates its RPC cookie AND clears the in-memory mempool.** Re-symlink cookies after a restart isn't needed (symlink handles it), but unfinalized posts in the mempool are lost on restart — re-submit them.
- **Seed nodes disconnect idle peers after ~30s** — remote nodes need an explicit `--connect <seed>` to stay peered, or they sit at 0 peers.
- **Sponsorship propagates by sponsorship-sync (~120s), not blocks.** `sponsor direct` won't show on the target immediately; wait a cycle.
- **`network.magic` file guards the data dir** — starting a node with a new magic auto-wipes stale chain data but **keeps the identity**. Handy: bots keep their identity across a magic bump.
- **WSL ↔ Git Bash friction:** Git Bash mangles `$VAR` and `/mnt/c` paths sent to `wsl`. Use `MSYS_NO_PATHCONV=1` for `/mnt/c` paths, and **write a script file and run it** instead of inlining variables through `wsl bash -c '…'`.
- **The startup banner "Magic bytes: …"** was hardcoded and lied (said TES3 on TES4). Now derived; if you see the wrong magic on a *running* node it's just an old binary — the real magic is in `network.magic`.

---

## 7. Where the ops code lives (source of truth)

- **Node / CLI / clients** — the repo (`main`). Signing lives in `src/cli/commands/post.rs` (CLI), `swimchain-react/src/lib/signAction.ts` (web clients), and the bot (below).
- **Activity bot + faucet** — `tools/swim-bot/activity-bot.mjs` in the repo **is the source of truth**; deploy it to `165:/opt/swim-bot/`. Keep the two in sync — a fix applied only on the droplet is lost on the next deploy. (Its canonical signing is the `actionSigPreimage()` helper.)
- **⚠️ Daily Drift scripts are droplet-only.** `publish.sh` and `generate.js` live only at `167:/opt/daily-drift/` — they are **not** version-controlled. Their config (the space id, and `AUTHOR` = dispatch-bot **address**) must be re-set by hand on every fresh chain. *Follow-up: vendor these into the repo (e.g. `tools/daily-drift/`) so a bringup doesn't depend on droplet state.*

## 8. Verification checklist

- Node up + peered: `sw --testnet --data-dir <dir> sync status` → peers ≥ 1, state `synced`.
- Identity sponsored: `… sponsor status` → `ACTIVE`.
- **Enforcement works:** a canonically-signed `sw post` is **accepted** ("Post created and broadcast successfully"); the unit tests (`cargo test --lib validation::`) prove forged posts are **rejected**.
- Chain advancing: `sync status` height climbs (slowly on a quiet chain; fast once bots run).
- Daily Drift renders: `node /opt/daily-drift/generate.js` reports `N items` (once posts finalize) and the page shows only dispatch-bot's posts.
- Bot/faucet: `journalctl -u swim-bot -u swim-faucet` show posts accepted and claims approved.

---

*Current TES4 addresses (2026-07-12): genesis `cs1qz0v…2kj7`; 167 seed `cs1qrv9…vkku`; dispatch-bot `cs1qzehr…ry96` (pubkey `b371ee…9008`); 165 bot/faucet `cs1qqh6w…kv48d` (pubkey `2fa758…0844`). Daily Drift space `sp1qqqsqrttr5h3u6ytz26lg2gsh5xqa97ghn`.*
