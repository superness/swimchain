#!/usr/bin/env bash
# Bug #1 reproduction script.
#
# Expected (when bug present): cryptic sled error: "could not acquire lock on ..."
# Expected (when fix applied): clean actionable message naming RPC-routed alternatives
#
# Requires: local genesis node running on 127.0.0.1:19735.

set -uo pipefail
cd "$(dirname "$0")/.."
export SWIMCHAIN_PASSWORD=testpass123

# Use a known content_hash (sufficient — direct DB is tried for action lookups)
HASH=28231dec64fd13ddcb16e72ae3e2a3947221c01ae4384cafb6c88a0ad3a24820

echo "=== sw block action <hash> while node running ==="
OUT=$(./target/release/sw.exe --testnet --data-dir=genesis block action "$HASH" 2>&1)
echo "$OUT" | tail -8

echo ""
if echo "$OUT" | grep -qE "could not acquire lock|Resource temporarily unavailable"; then
  echo "FAIL: still shows raw sled lock error (Bug #1)"
  exit 1
elif echo "$OUT" | grep -qiE "node is running|stop the running node|RPC-routed"; then
  echo "PASS: clear actionable message"
  exit 0
else
  echo "INCONCLUSIVE: neither cryptic nor actionable. Output above."
  exit 2
fi
