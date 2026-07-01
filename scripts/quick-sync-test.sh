#!/bin/bash
# Quick bidirectional sync test for debugging content propagation

set -e

export SWIMCHAIN_PASSWORD="testpass"
export RUST_LOG="swimchain=info"

LOG_A="/tmp/node_a_test.log"
LOG_B="/tmp/node_b_test.log"
SW_BIN="./target/release/sw"
DATA_A="./test-node-a-regtest"
DATA_B="./test-node-b-regtest"

echo "=== Cleaning up ==="
pkill -f "sw --regtest" 2>/dev/null || true
sleep 1
rm -rf "$DATA_A" "$DATA_B" 2>/dev/null || true

echo "=== Creating identities ==="
$SW_BIN --regtest identity create --data-dir ./test-node-a 2>&1 | grep -E "Created|address" || true
$SW_BIN --regtest identity create --data-dir ./test-node-b 2>&1 | grep -E "Created|address" || true

echo "=== Starting Node A (listener) ==="
SWIMCHAIN_DATA_DIR="./test-node-a" \
  $SW_BIN --regtest node start --listen 127.0.0.1:29735 > "$LOG_A" 2>&1 &
NODE_A_PID=$!
echo "Node A PID: $NODE_A_PID"
sleep 3

echo "=== Starting Node B (connector) ==="
SWIMCHAIN_DATA_DIR="./test-node-b" \
  $SW_BIN --regtest node start --listen 127.0.0.1:29736 --connect 127.0.0.1:29735 > "$LOG_B" 2>&1 &
NODE_B_PID=$!
echo "Node B PID: $NODE_B_PID"
sleep 5

echo ""
echo "=== Checking connection setup ==="
echo "Node A (should show ACCEPT for inbound from B):"
grep -E "ACCEPT|BOOTSTRAP" "$LOG_A" | head -5 || echo "(no matches)"

echo ""
echo "Node B (should show BOOTSTRAP for outbound to A):"
grep -E "ACCEPT|BOOTSTRAP" "$LOG_B" | head -5 || echo "(no matches)"

echo ""
echo "=== Creating content on Node A ==="
SWIMCHAIN_DATA_DIR="./test-node-a" $SW_BIN --regtest space create --name "Test Space" 2>&1 | grep -oE "sp1[a-z0-9]+" > /tmp/space_id.txt
SPACE_ID=$(cat /tmp/space_id.txt)
echo "Space: $SPACE_ID"

SWIMCHAIN_DATA_DIR="./test-node-a" $SW_BIN --regtest post create --space "$SPACE_ID" --title "From A" --body "Content from Node A" 2>&1 | grep -oE "sha256:[a-f0-9]+" > /tmp/content_a.txt
CONTENT_A=$(cat /tmp/content_a.txt)
echo "Content A: $CONTENT_A"

echo ""
echo "=== Creating content on Node B ==="
SWIMCHAIN_DATA_DIR="./test-node-b" $SW_BIN --regtest space create --name "B Space" 2>&1 | grep -oE "sp1[a-z0-9]+" > /tmp/space_b_id.txt
SPACE_B_ID=$(cat /tmp/space_b_id.txt)
echo "Space B: $SPACE_B_ID"

SWIMCHAIN_DATA_DIR="./test-node-b" $SW_BIN --regtest post create --space "$SPACE_B_ID" --title "From B" --body "Content from Node B" 2>&1 | grep -oE "sha256:[a-f0-9]+" > /tmp/content_b.txt
CONTENT_B=$(cat /tmp/content_b.txt)
echo "Content B: $CONTENT_B"

echo ""
echo "=== Waiting 20 seconds for bidirectional propagation ==="
sleep 20

echo ""
echo "=== Testing A->B propagation ==="
SWIMCHAIN_DATA_DIR="./test-node-b" $SW_BIN --regtest post view "$CONTENT_A" 2>&1 | head -5
if SWIMCHAIN_DATA_DIR="./test-node-b" $SW_BIN --regtest post view "$CONTENT_A" 2>&1 | grep -q "From A"; then
    echo "✓ A->B propagation: WORKING"
else
    echo "✗ A->B propagation: FAILED"
fi

echo ""
echo "=== Testing B->A propagation ==="
SWIMCHAIN_DATA_DIR="./test-node-a" $SW_BIN --regtest post view "$CONTENT_B" 2>&1 | head -5
if SWIMCHAIN_DATA_DIR="./test-node-a" $SW_BIN --regtest post view "$CONTENT_B" 2>&1 | grep -q "From B"; then
    echo "✓ B->A propagation: WORKING"
else
    echo "✗ B->A propagation: FAILED"
fi

echo ""
echo "=== Sync logs ==="
echo "Node A broadcasts:"
grep -E "CONTENT-BROADCAST.*Broadcasting|I_HAVE" "$LOG_A" | tail -5 || echo "(none)"
echo ""
echo "Node B broadcasts:"
grep -E "CONTENT-BROADCAST.*Broadcasting|I_HAVE" "$LOG_B" | tail -5 || echo "(none)"

echo ""
echo "=== Cleanup ==="
kill $NODE_A_PID $NODE_B_PID 2>/dev/null || true
wait 2>/dev/null || true
echo "Done"
