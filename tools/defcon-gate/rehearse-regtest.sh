#!/usr/bin/env bash
# tools/defcon-gate/rehearse-regtest.sh
#
# Scripted regtest end-to-end rehearsal for DEF CON 34 onboarding (Task 9).
# This is the proof that every signature and flow in tools/defcon-gate/ is
# accepted by the REAL Rust verifier — unit tests (gate-logic.test.mjs) can
# only prove the pure decision logic; this script proves the byte layouts.
#
# Hand-rolls two --regtest nodes directly (does NOT drive them through
# scripts/node-manager.sh). node-manager.sh was read first: it DOES support
# --regtest, but it hardcodes node names/ports into a fixed table shared
# across every network mode, always assumes a fixed "genesis" node name for
# its special-cased identity import, and is oriented around long-lived,
# interactively-managed dev nodes (list/status/logs/chaos/simulate) rather
# than a single self-contained, disposable rehearsal run. Tasks 6 and 7 (the
# two prior tasks that needed a live two-node regtest for their own
# verification) both hand-rolled their nodes for the same reason and their
# reports document it working cleanly — this script follows that established,
# already-verified pattern rather than re-deriving a new one. Every data
# directory here lives under a fresh `mktemp -d`, so this script can run
# concurrently with (and never collides with) any node-manager.sh-managed
# dev node on the same machine.
#
# Node A = "gate": imports the repo's documented dev genesis seed
#   (GENESIS_IDENTITY.md / src/sponsorship/genesis_list.rs's
#   TESTNET_GENESIS_LIST, which covers testnet AND regtest — see
#   genesis_list.rs's `active_genesis_list()`), runs the keeper, mints the
#   space, holds every sponsorship offer.
# Node B = "attendee": fresh identity, connects to node A as a peer, claims
#   the GLOBAL tier via the real `sw sponsor claim` CLI (Step 5) — this is
#   the one step that needs a second, independent node/RPC/offer_store, since
#   a real DEF CON attendee running their own node is exactly what that step
#   proves. Steps 6-9 talk directly to node A's RPC (mirroring how a browser
#   client — and this script's own rehearse-claim.mjs helper — always talks
#   straight to the gate node, never through a second peer).
#
# Prerequisites:
#   - A built `sw`/`sw.exe` under target/release or target/debug.
#   - tools/swim-bot/node_modules/hash-wasm installed (`cd tools/swim-bot &&
#     npm install`), needed by mint-space.mjs's Argon2id action PoW.
#   - bash, curl, jq, node on PATH.
#
# set -e (required by the brief) + pipefail so a failing jq/curl mid-pipe is
# never silently swallowed. Deliberately NOT set -u: this script tracks
# background PIDs as a plain space-separated string (not a bash array)
# specifically to avoid the `set -u` + empty-array interaction that differs
# across bash versions — the goal is a script that behaves identically here
# and on an older bash on a droplet, not one that merely passes on this box.
set -e -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── prerequisites ────────────────────────────────────────────────────────
for tool in curl jq node; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FATAL: '$tool' is required on PATH" >&2; exit 1; }
done

SW_BIN=""
for candidate in \
  "$REPO_ROOT/target/release/sw" "$REPO_ROOT/target/release/sw.exe" \
  "$REPO_ROOT/target/debug/sw" "$REPO_ROOT/target/debug/sw.exe"; do
  if [ -x "$candidate" ]; then
    SW_BIN="$candidate"
    break
  fi
done
[ -n "$SW_BIN" ] || { echo "FATAL: no sw binary found under target/{release,debug} — run 'cargo build --bin sw' first" >&2; exit 1; }
echo "== sw binary: $SW_BIN =="

NODE_MODULES_FOR_HASH_WASM="$REPO_ROOT/tools/swim-bot/node_modules"
[ -d "$NODE_MODULES_FOR_HASH_WASM/hash-wasm" ] || {
  echo "FATAL: hash-wasm not found under $NODE_MODULES_FOR_HASH_WASM — run: (cd tools/swim-bot && npm install)" >&2
  exit 1
}

# ── config ───────────────────────────────────────────────────────────────
GATE_CODE="TEST-CODE-1234"
BAD_CODE="WRONG-CODE-0000"
TOTAL_CAP=3
# HOURLY_CAP DEVIATION FROM THE BRIEF'S LITERAL "HOURLY_CAP=2", DOCUMENTED:
# with HOURLY_CAP=2, gate-logic's shared (cross-tier) state.approvedAtMs
# means the 3rd approval this rehearsal needs (Step 7's good-code re-claim)
# would be blocked by the HOURLY cap before TOTAL_CAP=3 ever binds — every
# approval this script drives happens within seconds of the others, well
# inside gate-logic.mjs's trailing-1h hourlyCount window, so there is no
# practical way to prove "3 successful approvals, 4th blocked by TOTAL_CAP"
# (the brief's own Step 8) while ALSO honoring a literal HOURLY_CAP=2,
# short of pausing this script for the better part of an hour. HOURLY_CAP's
# own fail-closed behavior is already proven at the pure-logic level by
# gate-logic.test.mjs ("gateDecision skips at hourly cap using the trailing
# window", "hourly window slides: old approvals free the cap" — both green),
# so this script sets HOURLY_CAP comfortably above what it exercises and lets
# TOTAL_CAP be the cap proven live end-to-end here, which is what Step 8
# actually asks for.
HOURLY_CAP=10
POLL_MS=3000

A_P2P=29835
A_RPC=29836
B_P2P=29845
B_RPC=29846

GENESIS_SEED="11b0b8c92806d893c77b547b87ad5763cb1005104ba13086e0bf184e3a277471"
GENESIS_PASSWORD="testpass123"
B_PASSWORD="testpass123"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/defcon-rehearse.XXXXXX")"
echo "== scratch workdir: $WORK =="

NODE_A_BASE="$WORK/node-a"
NODE_B_BASE="$WORK/node-b"
# sw's CliConfig::data_dir() appends "-regtest" as a literal string suffix to
# whatever --data-dir was given (src/cli/config.rs:168-172) — NOT a path
# join. So the actual on-disk directory is node-a-regtest, not node-a/.
NODE_A_DIR="${NODE_A_BASE}-regtest"
NODE_B_DIR="${NODE_B_BASE}-regtest"

STATE_FILE="$WORK/defcon-gate-state.json"
KEEPER_LOG="$WORK/keeper.log"
NODE_A_LOG="$WORK/node-a.log"
NODE_B_LOG="$WORK/node-b.log"

PIDS=""
NODE_A_PID=""
NODE_B_PID=""
KEEPER_PID=""

cleanup() {
  local rc=$?
  echo "" >&2
  echo "== cleanup: stopping background processes (workdir kept: $WORK) ==" >&2
  for pid in $PIDS; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  sleep 1
  for pid in $PIDS; do
    kill -9 "$pid" >/dev/null 2>&1 || true
  done
  exit $rc
}
trap cleanup EXIT INT TERM

# ── small helpers ────────────────────────────────────────────────────────

rpc_raw() {
  # rpc_raw <data_dir> <method> <json_params>
  local dir="$1" method="$2" params="$3"
  local addr cookie auth
  addr=$(cat "$dir/.rpc_addr")
  cookie=$(cat "$dir/.cookie")
  auth=$(printf '%s' "__cookie__:$cookie" | base64 -w0)
  curl -sS -m 10 -X POST "http://$addr/" \
    -H "Content-Type: application/json" \
    -H "Authorization: Basic $auth" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":$params,\"id\":1}"
}

wait_for_rpc() {
  # wait_for_rpc <data_dir> <label>
  local dir="$1" label="$2" i
  for i in $(seq 1 120); do
    if [ -f "$dir/.rpc_addr" ] && [ -f "$dir/.cookie" ]; then
      if rpc_raw "$dir" get_info '{}' | jq -e '.result' >/dev/null 2>&1; then
        echo "== $label RPC ready: $(cat "$dir/.rpc_addr") =="
        return 0
      fi
    fi
    sleep 0.5
  done
  echo "FATAL: $label RPC never became ready after 60s — see $dir's node log" >&2
  exit 1
}

wait_for_peer() {
  # wait_for_peer <data_dir> <label>
  local dir="$1" label="$2" i count
  for i in $(seq 1 60); do
    count=$(rpc_raw "$dir" get_info '{}' | jq -r '.result.peer_count // 0')
    if [ "$count" -ge 1 ] 2>/dev/null; then
      echo "PASS: $label sees >=1 peer (peer_count=$count)"
      return 0
    fi
    sleep 1
  done
  echo "FATAL: $label never saw a peer after 60s" >&2
  exit 1
}

# ── the sponsorship oracle: get_sponsorship_status, NOT get_sponsorship_info ─
#
# IMPORTANT FINDING (this task, not assumed from the brief): the brief's
# literal wording says to poll `get_sponsorship_info` for `is_sponsored`. Read
# directly against the live server, `get_sponsorship_info` has an
# UNCONDITIONAL regtest bypass (src/rpc/methods.rs:16894-16912): "In regtest
# mode, all identities are considered sponsored for easier testing" —
# `is_sponsored: true` for ANY 32-byte pubkey on regtest that has no store
# record, no pending mempool Sponsor action, and is not in the genesis list
# (i.e. every never-sponsored OR just-rejected identity too). Verified live
# during this script's own development: a bad-code claim's claimant, freshly
# generated and definitely never approved, reported `is_sponsored: true`
# straight from `get_sponsorship_info` on the SAME regtest node running the
# real keeper — which would make every assertion in this script that used
# it vacuously true regardless of whether the real approve/reject flow ran
# correctly at all. This bypass only fires in `get_sponsorship_info`'s
# `Ok(None)` (no store record) fallback branch, on regtest specifically — it
# does NOT affect an identity that already has a real record (that hits the
# `Ok(Some(sponsorship))` branch first, which is faithful).
#
# `get_sponsorship_status` (src/rpc/methods.rs:9111-9195, backed by
# `SponsorshipManager::status`, src/sponsorship/manager.rs:207-222) has no
# such bypass anywhere in it (confirmed by reading both, not assumed) and is
# the EXACT RPC `swimchain-react/src/lib/ensureSponsored.ts`'s `isSponsored()`
# calls in every real client (`st.has_sponsorship ?? st.is_sponsored`) — so
# using it here is not just a workaround, it is the more faithful proof: this
# script now asserts on the same oracle a real browser/CLI onboarding flow
# actually depends on, rather than the brief's named RPC, which regtest
# neuters into a constant.
sponsorship_status() {
  # sponsorship_status <data_dir> <pubkey_hex>
  rpc_raw "$1" get_sponsorship_status "{\"identity\":\"$2\"}"
}

poll_sponsored() {
  # poll_sponsored <data_dir> <pubkey_hex> <timeout_secs>
  # Sets LAST_SPONSOR_RESP (get_sponsorship_status) on success.
  local dir="$1" pubkey="$2" timeout="$3" start resp sponsored
  start=$SECONDS
  while [ $((SECONDS - start)) -lt "$timeout" ]; do
    resp=$(sponsorship_status "$dir" "$pubkey")
    sponsored=$(echo "$resp" | jq -r '.result.has_sponsorship // false')
    if [ "$sponsored" = "true" ]; then
      LAST_SPONSOR_RESP="$resp"
      echo "PASS: $pubkey has_sponsorship=true (after $((SECONDS - start))s)"
      return 0
    fi
    sleep 2
  done
  echo "FATAL: $pubkey never became sponsored within ${timeout}s — last response: $resp" >&2
  exit 1
}

not_sponsored() {
  # not_sponsored <data_dir> <pubkey_hex> <message>
  local resp has
  resp=$(sponsorship_status "$1" "$2")
  has=$(echo "$resp" | jq -r '.result.has_sponsorship // false')
  assert_eq "$has" "false" "$3"
}

claim_still_pending() {
  # claim_still_pending <offer_id> <claimant_pubkey>
  rpc_raw "$NODE_A_DIR" get_sponsorship_offer \
    "{\"offer_id\":\"$1\",\"caller_pubkey\":\"$SPONSOR_PUBKEY\"}" \
    | jq -r --arg c "$2" '.result.pending_claims[]? | select(.claimant_pubkey == $c) | .claimant_pubkey'
}

wait_for_claim_gone() {
  # wait_for_claim_gone <offer_id> <claimant_pubkey> <timeout_secs>
  local offer_id="$1" claimant="$2" timeout="$3" start still
  start=$SECONDS
  while [ $((SECONDS - start)) -lt "$timeout" ]; do
    still=$(claim_still_pending "$offer_id" "$claimant")
    if [ -z "$still" ]; then
      echo "PASS: claim from $claimant on $offer_id no longer pending (keeper rejected it)"
      return 0
    fi
    sleep 2
  done
  echo "FATAL: claim from $claimant on $offer_id still pending after ${timeout}s — keeper never rejected it" >&2
  exit 1
}

run_mint_space() {
  RPC_URL="http://127.0.0.1:$A_RPC" \
  COOKIE_FILE="$NODE_A_DIR/.cookie" \
  NODE_PATH="$NODE_MODULES_FOR_HASH_WASM" \
  node "$SCRIPT_DIR/mint-space.mjs"
}

run_claim() {
  # run_claim <offer_id> <application_text> [seed_hex]
  local offer_id="$1" application="$2" seed="${3:-}"
  RPC_URL="http://127.0.0.1:$A_RPC" \
  COOKIE_FILE="$NODE_A_DIR/.cookie" \
  OFFER_ID="$offer_id" \
  APPLICATION_TEXT="$application" \
  SEED_HEX="$seed" \
  node "$SCRIPT_DIR/rehearse-claim.mjs"
}

start_keeper() {
  local end_at
  end_at=$(node -e "console.log(new Date(Date.now()+3600*1000).toISOString())")
  RPC_URL="http://127.0.0.1:$A_RPC" \
  COOKIE_FILE="$NODE_A_DIR/.cookie" \
  GATE_CODE="$GATE_CODE" \
  END_AT="$end_at" \
  DEFCON_SPACE_HEX="$DEFCON_SPACE_HEX" \
  TOTAL_CAP="$TOTAL_CAP" \
  HOURLY_CAP="$HOURLY_CAP" \
  POLL_MS="$POLL_MS" \
  STATE_FILE="$STATE_FILE" \
  nohup node "$SCRIPT_DIR/defcon-gate.mjs" >>"$KEEPER_LOG" 2>&1 &
  KEEPER_PID=$!
  PIDS="$PIDS $KEEPER_PID"
  echo "== keeper started, pid=$KEEPER_PID, end_at=$end_at, log=$KEEPER_LOG =="
}

retry_claim_b() {
  # retry_claim_b <offer_id> <application_text>
  # Bounded retry for the known offer-sync timing gap: node B's local
  # offer_store only learns of an offer via P2P gossip broadcast at creation
  # time. If B's claim races that broadcast, `claim_sponsorship_offer` on B
  # answers "Offer not found" — not a real failure, just not synced yet.
  local offer_id="$1" application="$2" max_attempts=40 delay=2 attempt out
  for attempt in $(seq 1 "$max_attempts"); do
    if out=$(SWIMCHAIN_PASSWORD="$B_PASSWORD" "$SW_BIN" --regtest --data-dir="$NODE_B_BASE" \
      sponsor claim "$offer_id" --application "$application" 2>&1); then
      echo "$out"
      echo "PASS: node B's claim accepted on attempt $attempt/$max_attempts"
      return 0
    fi
    if echo "$out" | grep -qi "offer not found"; then
      echo "attempt $attempt/$max_attempts: node B hasn't synced offer $offer_id yet — retrying in ${delay}s"
      sleep "$delay"
      continue
    fi
    echo "FATAL: node B's claim failed with an unexpected error: $out" >&2
    exit 1
  done
  echo "FATAL: node B never saw offer $offer_id after $((max_attempts * delay))s — offer-sync gap did not resolve" >&2
  exit 1
}

assert_eq() {
  # assert_eq <actual> <expected> <message>
  if [ "$1" != "$2" ]; then
    echo "FATAL: $3 — expected '$2', got '$1'" >&2
    exit 1
  fi
  echo "PASS: $3 ($1)"
}

# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "########## Step 1: two-node regtest ##########"
# ═══════════════════════════════════════════════════════════════════════
echo "== importing genesis identity into node A (the gate/sponsor) =="
SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" "$SW_BIN" --regtest --data-dir="$NODE_A_BASE" \
  identity import-seed "$GENESIS_SEED" > "$WORK/node-a-import.log" 2>&1
grep -qi "success\|imported\|complete" "$WORK/node-a-import.log" || cat "$WORK/node-a-import.log"

echo "== starting node A (listen 127.0.0.1:$A_P2P) =="
SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" nohup "$SW_BIN" --regtest --data-dir="$NODE_A_BASE" \
  node start --listen "127.0.0.1:$A_P2P" > "$NODE_A_LOG" 2>&1 &
NODE_A_PID=$!
PIDS="$PIDS $NODE_A_PID"
wait_for_rpc "$NODE_A_DIR" "node A"

echo "== creating fresh identity for node B (the attendee) =="
SWIMCHAIN_PASSWORD="$B_PASSWORD" "$SW_BIN" --regtest --data-dir="$NODE_B_BASE" \
  identity create > "$WORK/node-b-create.log" 2>&1

echo "== starting node B (listen 127.0.0.1:$B_P2P, connect -> A) =="
SWIMCHAIN_PASSWORD="$B_PASSWORD" nohup "$SW_BIN" --regtest --data-dir="$NODE_B_BASE" \
  node start --listen "127.0.0.1:$B_P2P" --connect "127.0.0.1:$A_P2P" > "$NODE_B_LOG" 2>&1 &
NODE_B_PID=$!
PIDS="$PIDS $NODE_B_PID"
wait_for_rpc "$NODE_B_DIR" "node B"

wait_for_peer "$NODE_A_DIR" "node A"
wait_for_peer "$NODE_B_DIR" "node B"
echo "PASS: Step 1 — two-node regtest up, peered both directions"

# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "########## Step 2: node A self-establishes as sponsor ##########"
# ═══════════════════════════════════════════════════════════════════════
# Regtest bypasses LEVEL checks (check_identity_sponsored short-circuits to
# Ok(()) for regtest — src/rpc/methods.rs:756-759), but that is a DIFFERENT
# gate from being a registered SPONSOR able to create_sponsorship_offer,
# which regtest does NOT bypass (src/rpc/methods.rs:17316-17325 falls back to
# the hardcoded genesis list, but only for an identity actually IN that
# list). Node A's identity is the repo's documented dev genesis seed, which
# genesis_list.rs's active_genesis_list() serves for BOTH testnet and
# regtest — so node A already satisfies create_sponsorship_offer's check via
# that fallback alone, with no CLI step. This script still runs the CLI's
# own "establish as sponsor" step (`sponsor genesis-claim`) because that is
# the intended, documented path (also what Task 10's real go-live runbook
# will run for defcon34's real sponsor identity) and it upgrades node A from
# "tolerated via fallback" to a real StoredSponsorship record.
SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" "$SW_BIN" --regtest --data-dir="$NODE_A_BASE" \
  sponsor genesis-claim --slot 0

SPONSOR_PUBKEY=$(rpc_raw "$NODE_A_DIR" get_identity_info '{}' | jq -r '.result.public_key')
[ -n "$SPONSOR_PUBKEY" ] && [ "$SPONSOR_PUBKEY" != "null" ] || { echo "FATAL: could not read node A's public key" >&2; exit 1; }
echo "node A / sponsor pubkey: $SPONSOR_PUBKEY"

RESP2=$(rpc_raw "$NODE_A_DIR" get_sponsorship_info "{\"identity_pubkey\":\"$SPONSOR_PUBKEY\"}")
assert_eq "$(echo "$RESP2" | jq -r '.result.is_sponsored')" "true" "node A shows is_sponsored after genesis-claim"
assert_eq "$(echo "$RESP2" | jq -r '.result.is_genesis')" "true" "node A shows is_genesis after genesis-claim"
echo "PASS: Step 2 — node A established as sponsor"

# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "########## Step 3: mint-space.mjs, run twice, assert idempotent ##########"
# ═══════════════════════════════════════════════════════════════════════
echo "-- run 1 --"
MINT_OUT_1="$(run_mint_space)"
echo "$MINT_OUT_1"
DEFCON_SPACE_HEX=$(echo "$MINT_OUT_1" | grep '^DEFCON_SPACE_HEX=' | cut -d= -f2)
DEFCON_SPACE_BECH32=$(echo "$MINT_OUT_1" | grep '^DEFCON_SPACE_BECH32=' | cut -d= -f2)
[ -n "$DEFCON_SPACE_HEX" ] || { echo "FATAL: no DEFCON_SPACE_HEX from mint-space run 1" >&2; exit 1; }
[ -n "$DEFCON_SPACE_BECH32" ] || { echo "FATAL: no DEFCON_SPACE_BECH32 from mint-space run 1" >&2; exit 1; }

echo "-- run 2 (idempotence check) --"
MINT_OUT_2="$(run_mint_space)"
echo "$MINT_OUT_2"
DEFCON_SPACE_HEX_2=$(echo "$MINT_OUT_2" | grep '^DEFCON_SPACE_HEX=' | cut -d= -f2)
assert_eq "$DEFCON_SPACE_HEX_2" "$DEFCON_SPACE_HEX" "mint-space is idempotent across two runs"
echo "PASS: Step 3 — DEFCON_SPACE_HEX=$DEFCON_SPACE_HEX DEFCON_SPACE_BECH32=$DEFCON_SPACE_BECH32"

# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "########## Step 4: start defcon-gate.mjs keeper against A ##########"
# ═══════════════════════════════════════════════════════════════════════
start_keeper

echo "== waiting for the keeper to mint BOTH tiers' offers (known first-tick same-second collision self-heals ~1 tick later — see Task 6/8 context notes) =="
GLOBAL_OFFER_ID=""
SCOPED_OFFER_ID=""
for i in $(seq 1 30); do
  LIST=$(rpc_raw "$NODE_A_DIR" list_sponsorship_offers '{"limit":100}')
  GLOBAL_OFFER_ID=$(echo "$LIST" | jq -r --arg sp "$SPONSOR_PUBKEY" \
    '.result.offers[] | select(.sponsor_pubkey==$sp and .space_scope==null) | .offer_id' | head -1)
  SCOPED_OFFER_ID=$(echo "$LIST" | jq -r --arg sp "$SPONSOR_PUBKEY" \
    '.result.offers[] | select(.sponsor_pubkey==$sp and .space_scope!=null) | .offer_id' | head -1)
  if [ -n "$GLOBAL_OFFER_ID" ] && [ -n "$SCOPED_OFFER_ID" ]; then
    break
  fi
  sleep 3
done
[ -n "$GLOBAL_OFFER_ID" ] || { echo "FATAL: keeper never created a global offer — see $KEEPER_LOG" >&2; cat "$KEEPER_LOG" >&2; exit 1; }
[ -n "$SCOPED_OFFER_ID" ] || { echo "FATAL: keeper never created a scoped offer — see $KEEPER_LOG" >&2; cat "$KEEPER_LOG" >&2; exit 1; }
echo "PASS: Step 4 — both tiers live: global=$GLOBAL_OFFER_ID scoped=$SCOPED_OFFER_ID"
echo "-- keeper log so far --"
cat "$KEEPER_LOG"

# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "########## Step 5: node B claims the GLOBAL tier via 'sw sponsor claim', good code ##########"
# ═══════════════════════════════════════════════════════════════════════
retry_claim_b "$GLOBAL_OFFER_ID" "$GATE_CODE"

B_PUBKEY=$(rpc_raw "$NODE_B_DIR" get_identity_info '{}' | jq -r '.result.public_key')
[ -n "$B_PUBKEY" ] && [ "$B_PUBKEY" != "null" ] || { echo "FATAL: could not read node B's public key" >&2; exit 1; }
echo "node B pubkey: $B_PUBKEY"

echo "-- polling node B's get_sponsorship_status until has_sponsorship=true (<=60s) --"
poll_sponsored "$NODE_B_DIR" "$B_PUBKEY" 60
echo "PASS: Step 5 — GLOBAL tier proven (node B, real 'sw sponsor claim' CLI, cross-node claim gossip + approval)"

# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "########## Step 6: browser-tier claim via raw RPC to A, SCOPED offer, good code ##########"
# ═══════════════════════════════════════════════════════════════════════
CLAIM6_OUT=$(run_claim "$SCOPED_OFFER_ID" "$GATE_CODE")
echo "$CLAIM6_OUT"
BROWSER_PUBKEY=$(echo "$CLAIM6_OUT" | grep '^CLAIMANT_PUBKEY=' | cut -d= -f2)
[ -n "$BROWSER_PUBKEY" ] || { echo "FATAL: no CLAIMANT_PUBKEY from step 6 claim" >&2; exit 1; }

poll_sponsored "$NODE_A_DIR" "$BROWSER_PUBKEY" 60
# Secondary, informational read via get_sponsorship_info: NOT the pass/fail
# oracle (see the big comment on sponsorship_status()/poll_sponsored() above
# for why), but now meaningful, because a real StoredSponsorship record (or
# at minimum a pending-mempool Sponsor action) genuinely exists for this
# pubkey at this point — get_sponsorship_info's `Ok(Some(...))`/pending-scan
# branches take priority over the regtest bypass and only the bypass is
# unfaithful, not those branches.
INFO6=$(rpc_raw "$NODE_A_DIR" get_sponsorship_info "{\"identity_pubkey\":\"$BROWSER_PUBKEY\"}")
assert_eq "$(echo "$INFO6" | jq -r '.result.sponsor_pubkey')" "$SPONSOR_PUBKEY" \
  "scoped-tier claimant's sponsor_pubkey is node A"
# NOT asserting a specific `status` string here: get_sponsorship_info
# legitimately answers "Pending" (Sponsor action seen in the block builder's
# mempool, not yet mined into a block — src/rpc/methods.rs's
# get_sponsorship_info Ok(None) branch, "Found pending sponsorship in
# mempool") right up until the block forms, then "Active" afterward. Both
# are real per this project's "chain + mempool = reality" design law
# (waiting for finalization before treating a mempool-visible grant as real
# is the bug that law exists to prevent) — has_sponsorship:true (asserted by
# poll_sponsored above, via the faithful get_sponsorship_status oracle) is
# what actually matters here.
echo "sponsorship status observed (informational): $(echo "$INFO6" | jq -r '.result.status')"
# NOTE: the offer's `offer_type` is "probationary" (the keeper always mints
# Probationary-type offers — see defcon-gate.mjs's offerCreationSigMessage
# doc comment), but that is NOT the same thing as the resulting sponsee
# record's own `probationary` flag, which auto_approve::execute_claim_approval
# derives from the SPONSOR's own depth/status, not the offer's type. Node A
# is a depth-0 genesis sponsor, so its sponsees come back non-probationary
# (verified live: `probationary: false`) — asserting `probationary: true`
# here was this script's own wrong assumption during development, caught by
# actually running it rather than reasoned about in the abstract, and
# removed rather than "fixed" to expect a value with no real invariant
# behind it.
# NOTE ON THE BRIEF'S "get_sponsorship_info shows the scope": read directly
# against the actual RPC response type (src/rpc/types.rs's SponsorshipInfo,
# ~line 1733) — is_sponsored/status/sponsor_pubkey/depth/is_genesis/
# is_under_penalty/probationary/created_at. There is no scope field. The
# space-scope this offer's approval signature bound the claimant to lives in
# a SEPARATE side-index (SponsorshipStore::scopes,
# src/sponsorship/storage.rs:31-35/60-80, `get_scope`/`set_scope`), which no
# RPC method exposes today. The brief's wording is inaccurate to the current
# server (same class of brief/reality drift Task 5's and Task 6's own
# reports each caught and documented once). What Step 6 actually needs to
# prove — that the scoped approval's signature (claimant || timestamp ||
# offer's 32-byte scope, per Action::sponsor_sig_message) is byte-correct
# against the live Rust verifier — IS proven here: is_sponsored flips to
# true, and it can only do so via approve_sponsorship_claim's inline
# signature check succeeding (src/rpc/methods.rs:18139-18166) against
# exactly that scoped preimage; a wrong scope encoding would have made that
# check fail and is_sponsored would stay false forever. That is the load-
# bearing assertion above.
echo "PASS: Step 6 — SCOPED tier approval signature proven against the live Rust verifier"

# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "########## Step 7: single-identity bad-code reject -> good-code re-claim ##########"
# ═══════════════════════════════════════════════════════════════════════
CLAIM7A_OUT=$(run_claim "$GLOBAL_OFFER_ID" "$BAD_CODE")
echo "$CLAIM7A_OUT"
IDENTITY7_PUBKEY=$(echo "$CLAIM7A_OUT" | grep '^CLAIMANT_PUBKEY=' | cut -d= -f2)
IDENTITY7_SEED=$(echo "$CLAIM7A_OUT" | grep '^CLAIMANT_SEED=' | cut -d= -f2)
[ -n "$IDENTITY7_PUBKEY" ] && [ -n "$IDENTITY7_SEED" ] || { echo "FATAL: no claimant pubkey/seed from step 7's bad-code claim" >&2; exit 1; }

echo "-- waiting for the keeper to reject the bad-code claim --"
wait_for_claim_gone "$GLOBAL_OFFER_ID" "$IDENTITY7_PUBKEY" 30

not_sponsored "$NODE_A_DIR" "$IDENTITY7_PUBKEY" \
  "identity from Step 7's bad-code claim is NOT sponsored after reject"

echo "-- same identity re-claims the same offer with the GOOD code --"
CLAIM7B_OUT=$(run_claim "$GLOBAL_OFFER_ID" "$GATE_CODE" "$IDENTITY7_SEED")
echo "$CLAIM7B_OUT"
IDENTITY7_PUBKEY_2=$(echo "$CLAIM7B_OUT" | grep '^CLAIMANT_PUBKEY=' | cut -d= -f2)
assert_eq "$IDENTITY7_PUBKEY_2" "$IDENTITY7_PUBKEY" "re-claim used the SAME identity as the bad-code claim"

poll_sponsored "$NODE_A_DIR" "$IDENTITY7_PUBKEY" 60
echo "PASS: Step 7 — reject + retry proven, single identity throughout"

# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "########## Step 8: fourth good-code claim stays pending (TOTAL_CAP=3) ##########"
# ═══════════════════════════════════════════════════════════════════════
# Approvals so far: Step 5 (#1), Step 6 (#2), Step 7's re-claim (#3) — this
# is the 4th DISTINCT good-code claim/identity.
CLAIM8_OUT=$(run_claim "$GLOBAL_OFFER_ID" "$GATE_CODE")
echo "$CLAIM8_OUT"
IDENTITY8_PUBKEY=$(echo "$CLAIM8_OUT" | grep '^CLAIMANT_PUBKEY=' | cut -d= -f2)
[ -n "$IDENTITY8_PUBKEY" ] || { echo "FATAL: no claimant pubkey from step 8's claim" >&2; exit 1; }

echo "-- letting the keeper tick a few times over the pending claim --"
sleep 12

not_sponsored "$NODE_A_DIR" "$IDENTITY8_PUBKEY" \
  "4th good-code claim is NOT sponsored (TOTAL_CAP=3 reached)"

STILL_PENDING=$(claim_still_pending "$GLOBAL_OFFER_ID" "$IDENTITY8_PUBKEY")
assert_eq "$STILL_PENDING" "$IDENTITY8_PUBKEY" "4th good-code claim is still PENDING (skipped, not rejected)"

TOTAL_APPROVED_NOW=$(jq -r '.totalApproved' "$STATE_FILE")
assert_eq "$TOTAL_APPROVED_NOW" "3" "keeper state file shows totalApproved=3"
echo "PASS: Step 8 — TOTAL_CAP fail-closed, proven live"

# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "########## Step 9: kill keeper mid-run, restart, state + pending-skip survive ##########"
# ═══════════════════════════════════════════════════════════════════════
echo "-- killing keeper (pid=$KEEPER_PID) --"
kill "$KEEPER_PID" >/dev/null 2>&1 || true
wait "$KEEPER_PID" 2>/dev/null || true
sleep 1

TOTAL_APPROVED_AFTER_KILL=$(jq -r '.totalApproved' "$STATE_FILE")
assert_eq "$TOTAL_APPROVED_AFTER_KILL" "3" "state file counter survives the kill (totalApproved=3)"

echo "-- restarting keeper against the SAME state file --"
start_keeper
sleep 12

not_sponsored "$NODE_A_DIR" "$IDENTITY8_PUBKEY" \
  "step 8's pending claim is STILL not sponsored after restart"

STILL_PENDING_2=$(claim_still_pending "$GLOBAL_OFFER_ID" "$IDENTITY8_PUBKEY")
assert_eq "$STILL_PENDING_2" "$IDENTITY8_PUBKEY" "step 8's claim is still pending after restart (only skipped, never approved)"

TOTAL_APPROVED_FINAL=$(jq -r '.totalApproved' "$STATE_FILE")
assert_eq "$TOTAL_APPROVED_FINAL" "3" "totalApproved unchanged after restart (3)"
echo "PASS: Step 9 — restart safety proven"

echo ""
echo "########################################################"
echo "ALL 9 STEPS PASSED — DEF CON 34 gate rehearsal is green"
echo "########################################################"
echo "DEFCON_SPACE_HEX=$DEFCON_SPACE_HEX"
echo "DEFCON_SPACE_BECH32=$DEFCON_SPACE_BECH32"
echo "GLOBAL_OFFER_ID=$GLOBAL_OFFER_ID"
echo "SCOPED_OFFER_ID=$SCOPED_OFFER_ID"
echo "workdir (kept for inspection): $WORK"
