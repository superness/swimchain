#!/bin/bash
# Swimchain BVT Tier 1 — automated network/consensus/funnel checks.
# Usage: bash scripts/bvt.sh [--e2e] [--failover]
#   --e2e       run B5 (end-to-end sponsorship; consumes one faucet slot)
#   --failover  run B6 (briefly stops the seed rpc proxy)
# Read-only otherwise. Exits non-zero if any test FAILs. See docs/qa/BVT.md.
set -u

SEED=167.71.241.252
BOT=165.22.47.107
CLIENT2=167.172.236.60
GATEWAY=167.99.116.63
KEY="$HOME/.ssh/swimchain_seed_ed25519"
FAUCET_PK=2fa758fcf4e7f8cbc0949dc8e528cf2ccedbf02f163b572440bbcfb668e90844

E2E=false; FAILOVER=false
for a in "$@"; do
  [ "$a" = "--e2e" ] && E2E=true
  [ "$a" = "--failover" ] && FAILOVER=true
done

PASS=0; FAIL=0; RESULTS=""
report() { # report <id> <ok|fail> <detail>
  local mark="PASS"; [ "$2" != "ok" ] && { mark="FAIL"; FAIL=$((FAIL+1)); } || PASS=$((PASS+1))
  RESULTS="$RESULTS$1  $mark  $3\n"
}

droplet_rpc() { # droplet_rpc <ip> <needs_key> <method> <params>
  local keyarg=""; [ "$2" = "key" ] && keyarg="-i $KEY"
  ssh -o ConnectTimeout=8 $keyarg root@"$1" \
    'COOKIE=$(cat /var/lib/swimchain-testnet/.cookie); curl -s --max-time 5 --user "__cookie__:$COOKIE" -X POST -H "Content-Type: application/json" --data '"'"'{"jsonrpc":"2.0","method":"'"$3"'","params":'"$4"',"id":1}'"'"' http://127.0.0.1:19736' 2>/dev/null
}

py() { python -c "$1" 2>/dev/null; }

# ---- A1/A4: heights + sanity ------------------------------------------------
H_SEED=$(droplet_rpc $SEED nokey get_chain_stats '{}' | py "import json,sys;print(json.load(sys.stdin)['result']['latest_height'])")
H_BOT=$(droplet_rpc $BOT key get_chain_stats '{}' | py "import json,sys;print(json.load(sys.stdin)['result']['latest_height'])")
H_C2=$(droplet_rpc $CLIENT2 key get_chain_stats '{}' | py "import json,sys;print(json.load(sys.stdin)['result']['latest_height'])")
if [ -n "${H_SEED:-}" ] && [ "$H_SEED" = "${H_BOT:-}" ] && [ "$H_SEED" = "${H_C2:-}" ]; then
  report A1 ok "converged at height $H_SEED"
else
  report A1 fail "heights seed=${H_SEED:-?} bot=${H_BOT:-?} client2=${H_C2:-?}"
fi

SANITY=$(droplet_rpc $SEED nokey get_chain_stats '{}' | py "
import json,sys
r=json.load(sys.stdin)['result']
print('ok' if r['root_blocks'] >= (r['latest_height'] or 0) else 'bad')")
[ "$SANITY" = "ok" ] && report A4 ok "root_blocks >= height, RPC responsive" || report A4 fail "store sanity: $SANITY"

# ---- A2: liveness (tip block timestamp fresh) --------------------------------
TIP_AGE=$(ssh -o ConnectTimeout=8 root@$SEED \
  'journalctl -u swimchain.service --since "2 hours ago" --no-pager --output=cat 2>/dev/null | grep -cE "Formed block|Stored .* root blocks|\[BLOCK\] Accepted"' 2>/dev/null)
if [ "${TIP_AGE:-0}" -gt 0 ] 2>/dev/null; then
  report A2 ok "block activity in last 2h ($TIP_AGE log lines)"
else
  report A2 fail "no block activity on seed in last 2h"
fi

# ---- A3: consensus quiet -----------------------------------------------------
# Tip-level rollback is NORMAL fork resolution (two nodes racing a block);
# only CASCADING rollback (suffix rewind) is pathological.
ANOMALIES=$(ssh -o ConnectTimeout=8 root@$SEED \
  'journalctl -u swimchain.service --since "24 hours ago" --no-pager --output=cat 2>/dev/null | grep -cE "Cascading rollback"' 2>/dev/null)
GUARDS=$(ssh -o ConnectTimeout=8 root@$SEED \
  'journalctl -u swimchain.service --since "24 hours ago" --no-pager --output=cat 2>/dev/null | grep -cE "Deep-fork guard"' 2>/dev/null)
if [ "${ANOMALIES:-0}" -eq 0 ] 2>/dev/null && [ "${GUARDS:-0}" -lt 10 ] 2>/dev/null; then
  report A3 ok "0 cascading rollbacks, $GUARDS guard hits (24h, seed)"
else
  report A3 fail "cascading=$ANOMALIES guard-hits=$GUARDS (24h, seed)"
fi

# ---- B1: website up through gateway ------------------------------------------
B1_OK=true; B1_DETAIL=""
for path in / /reef/ /chess/ /example/ /download; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -H "Host: swimchain.io" "http://$GATEWAY$path")
  B1_DETAIL="$B1_DETAIL$path=$CODE "
  [ "$CODE" = "200" ] || B1_OK=false
done
$B1_OK && report B1 ok "$B1_DETAIL" || report B1 fail "$B1_DETAIL"

# ---- B2: RPC through gateway, named spaces ------------------------------------
NAMED=$(curl -s --max-time 10 -X POST -H "Host: swimchain.io" -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"list_spaces","params":{"limit":50},"id":1}' "http://$GATEWAY/rpc" \
  | py "import json,sys;print(sum(1 for s in json.load(sys.stdin)['result']['spaces'] if s.get('name')))")
[ "${NAMED:-0}" -ge 1 ] 2>/dev/null && report B2 ok "$NAMED named spaces via gateway" || report B2 fail "no named spaces via gateway"

# ---- B3: faucet offer availability --------------------------------------------
SLOTS=$(curl -s --max-time 10 -X POST -H "Host: swimchain.io" -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"list_sponsorship_offers","params":{},"id":1}' "http://$GATEWAY/rpc" \
  | py "
import json,sys
offers=json.load(sys.stdin)['result']['offers']
print(sum(o['slots_remaining'] for o in offers if o.get('auto_approve') and o['sponsor_pubkey']=='$FAUCET_PK'))")
[ "${SLOTS:-0}" -ge 1 ] 2>/dev/null && report B3 ok "faucet auto-approve slots: $SLOTS" || report B3 fail "no faucet auto-approve slots"

# ---- B4: search finds spaces by name -------------------------------------------
FOUND=$(droplet_rpc $SEED nokey search '{"query":"reef","types":["space"],"limit":5}' \
  | py "import json,sys;print(len(json.load(sys.stdin)['result']['results']))")
[ "${FOUND:-0}" -ge 1 ] 2>/dev/null && report B4 ok "space search hits: $FOUND" || report B4 fail "search('reef') found no spaces"

# ---- B5 (--e2e): sponsorship end-to-end ----------------------------------------
if $E2E; then
  B5_OUT=$(python "$(dirname "$0")/bvt_e2e_sponsorship.py" "http://$GATEWAY/rpc" 2>&1 | tail -1)
  case "$B5_OUT" in
    SPONSORED*) report B5 ok "$B5_OUT" ;;
    *)          report B5 fail "$B5_OUT" ;;
  esac
else
  RESULTS="${RESULTS}B5  SKIP  (run with --e2e)\n"
fi

# ---- B6 (--failover): gateway rides over to client2 ----------------------------
if $FAILOVER; then
  ssh -o ConnectTimeout=8 root@$SEED 'systemctl stop chess-rpc-proxy' 2>/dev/null
  FO_NODE=$(curl -s --max-time 15 -X POST -H "Host: swimchain.io" -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"get_info","params":{},"id":1}' "http://$GATEWAY/rpc" \
    | py "import json,sys;print(json.load(sys.stdin)['result']['node_id'][:8])")
  ssh -o ConnectTimeout=8 root@$SEED 'systemctl start chess-rpc-proxy' 2>/dev/null
  [ -n "${FO_NODE:-}" ] && report B6 ok "failover answered from node $FO_NODE" || report B6 fail "no answer with seed proxy down"
else
  RESULTS="${RESULTS}B6  SKIP  (run with --failover)\n"
fi

echo
echo "=== Swimchain BVT Tier 1 — $(date -u +%Y-%m-%dT%H:%MZ) ==="
printf "$RESULTS" | column -t -s'  ' 2>/dev/null || printf "$RESULTS"
echo "=== $PASS pass, $FAIL fail ==="
[ $FAIL -eq 0 ]
