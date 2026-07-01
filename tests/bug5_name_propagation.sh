#!/usr/bin/env bash
# Bug #5 reproduction script.
#
# Expected (when bug present):  remote-created space displays as "Space xxxxxxxx"
#                               on the LOCAL node.
# Expected (when bug fixed):    remote-created space displays with its REAL name
#                               on the LOCAL node after the block carrying
#                               space_metadata arrives.
#
# Requires: local genesis node running on 127.0.0.1:19735, remote at
#           167.71.241.252 already paired with local. Genesis identity already
#           sponsored remote identity. ACTUAL space name pulled from sw.

set -uo pipefail
cd "$(dirname "$0")/.."

# 1. Have the remote create a new space with a known name.
NAME="BugFiveTest-$(date +%s)"
echo "=== Remote creating space: $NAME ==="
SPACE_ID=$(ssh root@167.71.241.252 "SWIMCHAIN_PASSWORD=testpass123 /usr/local/bin/sw --testnet --data-dir=/var/lib/swimchain space create --name '$NAME' 2>&1" \
  | grep -oE 'sp1[0-9a-z]+' | head -1)
echo "Remote space id: $SPACE_ID"
[ -z "$SPACE_ID" ] && { echo "FAIL: could not get space id"; exit 1; }

# 2. Wait for gossip + (eventually) block.
echo ""
echo "=== Waiting 45s for gossip + block sync ==="
sleep 45

# 3. Read what local sees for that space.
echo "=== Local view of space $SPACE_ID ==="
export SWIMCHAIN_PASSWORD=testpass123
LOCAL_VIEW=$(./target/release/sw.exe --testnet --data-dir=genesis space browse 2>&1 \
  | grep "$SPACE_ID" || echo "NOT FOUND")
echo "$LOCAL_VIEW"

# 4. Assertion.
if echo "$LOCAL_VIEW" | grep -q "\"$NAME\""; then
  echo ""
  echo "PASS: local sees the real name"
  exit 0
elif echo "$LOCAL_VIEW" | grep -qE 'Space [0-9a-f]{8}'; then
  echo ""
  echo "FAIL: local sees placeholder 'Space xxxxxxxx' instead of '$NAME' (Bug #5)"
  exit 1
else
  echo ""
  echo "INCONCLUSIVE: local view did not contain '$NAME' or 'Space xxxxxxxx'"
  exit 2
fi
