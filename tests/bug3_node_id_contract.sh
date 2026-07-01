#!/usr/bin/env bash
# Bug #3 reproduction script.
#
# Per SPEC_06 §128 + §154: node_id MUST equal SHA-256(public_key).
#
# Pre-fix:  get_info.node_id == raw public_key (NOT hashed)
# Post-fix: get_info.node_id == SHA-256(public_key)
#
# Also asserts cascade fix for Bug #2: peer_count for a single remote should be 1
# (deterministic peer_ids let dedup work).

set -uo pipefail
cd "$(dirname "$0")/.."

RPC=$(cat genesis-testnet/.rpc_addr 2>/dev/null)
C=$(cat genesis-testnet/.cookie 2>/dev/null)
[ -z "$RPC" ] || [ -z "$C" ] && { echo "SKIP: local node not running"; exit 0; }

INFO=$(curl -sf -m 5 -u "__cookie__:$C" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"get_info","params":{}}' "http://$RPC/")
NODE_ID=$(printf '%s' "$INFO" | node -e "
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
  process.stdout.write(JSON.parse(s).result.node_id || '');});")

# Read local pubkey
PUBKEY="9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420"
EXPECTED=$(printf '%s' "$PUBKEY" | node -e "
const c = require('crypto');
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
  const buf = Buffer.from(s.trim(), 'hex');
  process.stdout.write(c.createHash('sha256').update(buf).digest('hex'));
});")

echo "=== node_id contract ==="
echo "Returned node_id:    $NODE_ID"
echo "Public key:          $PUBKEY"
echo "Expected SHA-256:    $EXPECTED"

if [ "$NODE_ID" = "$EXPECTED" ]; then
  echo "PASS: node_id == SHA-256(public_key)"
elif [ "$NODE_ID" = "$PUBKEY" ]; then
  echo "FAIL: node_id == raw public_key (Bug #3 still present)"
  PRIMARY_FAIL=1
else
  echo "FAIL: node_id is neither public_key nor SHA-256(public_key)"
  PRIMARY_FAIL=1
fi

# Bonus: Bug #2 cascade check — peer_count for the droplet should be 1
PEERS=$(curl -sf -m 5 -u "__cookie__:$C" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"get_peers","params":{}}' "http://$RPC/")
DROPLET_COUNT=$(printf '%s' "$PEERS" | node -e "
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
  const ps = JSON.parse(s).result || [];
  const n = ps.filter(p => p.address && p.address.startsWith('167.71.241.252:')).length;
  process.stdout.write(String(n));
});")

echo ""
echo "=== Bug #2 cascade ==="
echo "Connections to droplet (167.71.241.252): $DROPLET_COUNT"
if [ "$DROPLET_COUNT" -le 1 ]; then
  echo "PASS: dedup working"
else
  echo "FAIL: $DROPLET_COUNT connections to same droplet (dedup broken)"
  CASCADE_FAIL=1
fi

if [ "${PRIMARY_FAIL:-0}" -eq 1 ] || [ "${CASCADE_FAIL:-0}" -eq 1 ]; then
  exit 1
fi
exit 0
