# Launch-blockers handoff — remaining work after 2026-07-14 evening

> **STATUS UPDATE (2026-07-15 early AM):** items 1–3 are implemented,
> tested, and committed on main:
> - #1 solo-block formation gate → `e333e4c9` (guarded at THREE sites —
>   the periodic `spawn_block_formation` backstop in tasks.rs was a third
>   formation site this doc missed; regtest grace is zero so dev flows
>   are unchanged)
> - #3 reorg loop → `b94516eb` (real chain weight `ChainStore::chain_weight`
>   replaced the garbage `cumulative_pow` comparison in fork choice; the
>   hot loop dies by construction, so no separate negative cache was
>   needed; deep displacement guard unchanged)
> - #2 auth lockout → `9cb2dda8` (loopback exempt + per-credential dedupe;
>   client-side cookie re-read on 401 [fix shape 2.3] NOT done — optional
>   now that loopback is exempt)
> - bonus `516a9eba`: clients hide spaces with no resolved name (operator
>   request).
> **NOT done:** fleet deploy of the new binary (blocked on operator
> authorization — binary ready at `target-linux/release/sw`), the
> post-deploy `bvt.sh --e2e --failover` gate, and Tier-2 UI sweep.
> #4 guarded APK: in progress this session — check git/adb for outcome.
> Known-red: `cargo test --lib` has 7 PRE-EXISTING stale-test failures
> (old error strings, node_id sha256 semantics, lazy-wait never reflected
> in should_form_root tests, sled-lock restart flake) plus 3 eternal PoW
> tests (`api::commands`) that run 25+ min — none related to these fixes.

Context: the 2026-07-14 evening session closed the two consensus **correctness**
blockers (deep-fork guard `fbaba8e9`, non-destructive rollback `26952890`),
took genesis cold, stood up the gateway droplet, moved game sponsorship to the
faucet identity, and formalized the BVT suite (`docs/qa/BVT.md`,
`scripts/bvt.sh`). Fleet is healthy at height 76+ on the guarded binary.

Four items remain before a friendly (~10-user) launch. **Only #1 is a true
correctness blocker**; #2–4 are friction/reach and can be sequenced around the
launch. Each below has the code anchor, the exact problem, the fix shape, how
to verify, and the trap to avoid.

Standing environment facts are in `docs/qa/BVT.md` (fleet IPs, gateway, SSH
keys, faucet identity, the qa2 local QA node). Genesis is COLD — never start it
routinely. Windows-locked-exe trap: kill the running `sw.exe` before every
`cargo build --release` or the link fails with "failed to remove file"; check
the exe mtime after. WSL builds the Linux binary
(`cargo build --release --target-dir target-linux`).

---

## 1. Solo-block formation guard  (TRUE BLOCKER — do first)

**Why it matters.** This is the root cause of the chain-poisoning incident. A
node that restarts isolated (fresh, wiped, or just faster than its peers) forms
blocks *alone* the moment its bot/faucet/user acts. That solo block competes
with the real chain. The deep-fork guard now stops it from *poisoning* peers,
but the stub still creates junk forks, stuck states, and wasted reorg churn.
The fix: **don't form blocks until synced with ≥1 peer (or a short grace
period elapses).**

**Anchors — two block-formation sites, both need the guard:**
- `src/node/router/router.rs:6491` `try_form_block_if_threshold_met` (gossip-triggered)
- `src/rpc/methods.rs:846` `try_form_block_if_threshold_met` (RPC-submit-triggered)

**Peer count is already available:**
- `src/node/manager.rs:2145` `pub fn peer_count(&self)`
- `connection_pool.count().await` (used in `src/node/tasks.rs:2756`)

**Fix shape.** At the top of both `try_form_block_if_threshold_met`, bail early
unless one of: (a) connected peer count > 0 AND initial sync has progressed
past the peer's tip (i.e. we're not the lone height-authority), or (b) a
`node_start_grace` window (e.g. 90 s from process start, or from first peer
connect) has expired — so a genuinely-first node (bootstrapping a new network)
can still make progress. Log a one-liner when skipping
(`[BLOCKS] Deferring block formation: no synced peer yet`). Keep it a guard on
*formation*, not on *accepting* actions into the mempool — actions should still
queue so they seal once a peer appears.

**Watch for:** the regtest/single-node dev flow and a legitimately-new network
must NOT deadlock (that's what the grace window is for). Genesis bootstrap of a
brand-new chain is the one case where forming alone is correct.

**Verify.** Regression test in `router.rs` tests: builder with actions + zero
peers + pre-grace → no block; +1 peer OR post-grace → block. Live: `fresh qa9`
a wiped node with no `--connect`, confirm it does NOT advance height alone;
then connect it and confirm it forms. BVT A3 (cascading rollbacks) should stay
0 across a deploy-restart cycle afterward.

---

## 2. Auth lockout  (friction — high annoyance/effort ratio)

**Why it matters.** Hit us 3× on 2026-07-14 during node restarts, each time
curable only by *another* restart. The RPC cookie rotates on node restart; any
client still polling with the stale cookie burns 10 failures in seconds and
locks the IP for 5 min — valid credentials included. Two compounding cases:
(a) real desktop users updating their node see every app go "not connected" for
5 min; (b) the web proxy connects to the node from localhost, so the node sees
every web visitor as `127.0.0.1` — 10 bad authed requests from ONE browser
would lock out ALL web traffic globally (latent; today's game methods are
auth-exempt so normal traffic makes 0 failures).

**Anchors:**
- `src/rpc/rate_limiter.rs:61,63` — `auth_failure_threshold: 10`, `lockout_duration_secs: 300`
- `src/rpc/rate_limiter.rs:228` `check_rate_limit`, `:291` the lockout trip
- `src/rpc/server.rs:367` `is_locked_out`, `:647` `record_auth_failure`, `:664` `clear_auth_failures`

**Fix shape (smallest-first):**
1. **Exempt localhost from lockout entirely.** Anyone on 127.0.0.1/::1 can read
   the cookie file anyway — locking them out protects nothing and causes both
   (a) and (b). In `server.rs:367`/`:647`, skip the limiter when `client_ip` is
   loopback. (One-line-ish; kills the two worst cases.)
2. **Dedupe failures by credential.** Count one *distinct* bad credential once,
   not 10× for the same stale cookie hammering — so a rotated cookie is one
   failure, not ten. (Track a small set of recent bad-credential hashes per IP;
   only novel ones increment.)
3. **Client-side (feed/forum/chat shells):** on the first 401, re-read and
   re-inject the node cookie instead of polling into the wall. Anchor: the
   embed.js / `useParentRpcConfig` cookie-injection path (see memory
   `node-mode-identity`).

**Verify.** Restart the node with a client tab open; the tab must recover
without a second restart and without `-32017`. For (b): from a browser console,
fire 15 bad-auth requests at `/rpc`; other web traffic must stay up.

**Watch for:** don't loosen the mainnet/public posture — keep the limiter for
non-loopback, signature-authed write floods. The exemption is specifically
loopback + the stale-cookie dedupe.

---

## 3. Reorg-apply loop  (correctness-adjacent — lower urgency post-guard)

**Why it matters.** A node that decides an incoming chain is heavier but can't
*complete* the switch (missing ancestry it can't fetch, or apply fails) never
records the failure, so every re-announcement re-runs the comparison from
scratch — genesis logged the SAME block 6,823× in 7 min on 2026-07-14. The
deep-fork guard defanged the common trigger, but partitioned nodes still can't
rejoin a diverged-heavier chain without a manual wipe.

**Anchors:**
- `src/node/router/router.rs:2123` "too far ahead → GETBLOCKS_LOCATOR" escalation
- `:1711`, `:2141` `generate_locator` + `GetBlocksLocatorPayload` (the fetch path)
- `deep_fork_blocked` (search router.rs) — the guard that now blocks same-height
  displacement; the legit deep reorg must go through the orphan/common-ancestor
  path instead
- `ChainStore::make_canonical` + `update_best_tip_if_heavier` (chain.rs) — the
  deep-reorg apply; unit tests `test_deep_reorg_below_tip_adopts_heavier_chain`,
  `test_deep_reorg_defers_when_ancestry_missing`

**Fix shape.** Two parts. (1) **Negative/pending cache:** when a reorg can't
complete because ancestry is missing, record "this block is waiting on parent
X" and do NOT re-evaluate it until X arrives — stops the hot loop. (2) **Real
chain weight:** `RootBlock.cumulative_pow` is per-block, NOT chain-cumulative
(the reason both first guards failed — see the deep-fork memory), so genuine
"is this chain heavier" decisions need a walk-parents-and-sum recompute
(SPEC_05). Only then can a legit heavier fork win a deep reorg safely; until
then, deep displacement stays disabled and partitioned-node recovery is
**documented wipe-to-rejoin** (network.magic trick, see
`project_desktop_bundle` / `project_deep_fork_reorg_bug` memories).

**Verify.** Partition a node below a divergence, feed it the heavier chain,
confirm it reorgs ONCE (no repeated `[REORG] ... heavier than tip` for the same
hash) and lands on the right tip — or, if punting the recompute, confirm the
loop is silenced and document the wipe path in node UX.

**Watch for:** the deep-fork memory (`project_deep_fork_reorg_bug`) has the full
incident writeup and the earlier stuck-at-height-12 reorg fix — read it first;
this is the same subsystem and it's subtle.

---

## 4. Guarded APK  (reach — build/release step, no code)

**Why it matters.** The phone's in-process node still runs a pre-guard build
carrying the (now-extinct) stub chain. It can no longer poison the guarded
fleet, but it can't heal itself and shouldn't rejoin until it ships tonight's
consensus fixes. Until then the phone is the one P0 surface that's offline.

**Anchors:**
- `mobile-app/README.md` — the Android build flow (`npm run tauri android build`)
- `mobile-app/src-tauri/gen/android/` — the gradle project
- Release keystore: memory `reference_android_release_keystore` — SAME key must
  sign every update; do not lose it. Debug build is ~679 MB (memory
  `project_mobile_distribution`); a release/stripped build is needed for
  distribution.

**Steps.** Rebuild the mobile app on `main` at/after commit `26952890` (has the
deep-fork guard + non-destructive rollback), sign with the release keystore,
install to the phone (`46281FDJG001JN` via adb), let it wipe+resync (its in-
process node data dir; force-stop `com.swimchain.mobile` first to reset any
cached chain — memory `project_consensus_double_inclusion_fix` notes the phone
re-seeds old chains after wipes). Then run BVT U12 (phone parity).

**Watch for:** distribution is still deferred (memory
`project_mobile_distribution`: website APK + install guide, no F-Droid). This
item is just "get a guarded build onto the test phone," not "ship to users."

---

## Suggested order

1 (solo-block guard) → 2 (auth lockout; quick wins 2.1+2.2) → 4 (guarded APK,
independent, can parallel) → 3 (reorg loop; largest, needs the chain-weight
recompute or an explicit decision to document wipe-to-rejoin). Re-run
`bash scripts/bvt.sh --e2e --failover` after each; all green + Tier-2 UI pass =
launch-ready per `docs/qa/BVT.md`.
