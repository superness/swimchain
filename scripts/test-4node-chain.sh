#!/bin/bash
# 4-Node Chain Test: A -> B -> C -> D (3-hop propagation)
set -e

export SWIMCHAIN_PASSWORD="test123"

echo "=== Setting up 4-Node Chain Test ==="
echo "A -> B -> C -> D (3-hop propagation)"

# Clean up
rm -rf e2e-test-diamond* 2>/dev/null
pkill -f "sw.*regtest.*node" 2>/dev/null || true
sleep 1

# Create identities
for node in A B C D; do
    mkdir -p e2e-test-diamond${node}-regtest
    SWIMCHAIN_DATA_DIR=./e2e-test-diamond${node}-regtest ./target/release/sw --regtest identity create 2>/dev/null
done

# Create space on A
SPACE_RESULT=$(SWIMCHAIN_DATA_DIR=./e2e-test-diamondA-regtest ./target/release/sw --regtest space create --name "4-Node Test" 2>&1)
SPACE_ID=$(echo "$SPACE_RESULT" | grep -oP 'sp1[a-z0-9]+' | head -1)
echo "Space ID: $SPACE_ID"

# Start nodes in chain
echo "Starting node A..."
SWIMCHAIN_DATA_DIR=./e2e-test-diamondA-regtest ./target/release/sw --regtest node start --listen 127.0.0.1:29740 > ./e2e-test-diamondA-regtest/node.log 2>&1 &
PID_A=$!
sleep 2

echo "Starting node B -> A..."
SWIMCHAIN_DATA_DIR=./e2e-test-diamondB-regtest ./target/release/sw --regtest node start --listen 127.0.0.1:29741 --connect 127.0.0.1:29740 > ./e2e-test-diamondB-regtest/node.log 2>&1 &
PID_B=$!
sleep 2

echo "Starting node C -> B..."
SWIMCHAIN_DATA_DIR=./e2e-test-diamondC-regtest ./target/release/sw --regtest node start --listen 127.0.0.1:29742 --connect 127.0.0.1:29741 > ./e2e-test-diamondC-regtest/node.log 2>&1 &
PID_C=$!
sleep 2

echo "Starting node D -> C..."
SWIMCHAIN_DATA_DIR=./e2e-test-diamondD-regtest ./target/release/sw --regtest node start --listen 127.0.0.1:29743 --connect 127.0.0.1:29742 > ./e2e-test-diamondD-regtest/node.log 2>&1 &
PID_D=$!
sleep 3

# Check all running
echo ""
echo "=== Node Status ==="
for node in A B C D; do
    if ps aux | grep -q "[s]w.*diamond${node}"; then
        echo "Node $node: RUNNING"
    else
        echo "Node $node: DEAD"
    fi
done

# Create post on A
echo ""
echo "=== Creating post on Node A ==="
POST_RESULT=$(SWIMCHAIN_DATA_DIR=./e2e-test-diamondA-regtest ./target/release/sw --regtest post create --space "$SPACE_ID" --title "4-Node Chain Test" --body "Should propagate A to B to C to D" 2>&1)
CONTENT_ID=$(echo "$POST_RESULT" | grep -oP 'sha256:[a-f0-9]+' | head -1)
echo "Content ID: $CONTENT_ID"

echo ""
echo "Waiting 15 seconds for propagation..."
sleep 15

# Check all nodes
echo ""
echo "=== Propagation Results ==="
for node in A B C D; do
    echo ""
    echo "--- Node $node ---"
    VIEW_RESULT=$(SWIMCHAIN_DATA_DIR=./e2e-test-diamond${node}-regtest ./target/release/sw --regtest post view "$CONTENT_ID" 2>&1)
    if echo "$VIEW_RESULT" | grep -q "4-Node Chain Test"; then
        echo "✅ Content VISIBLE"
    else
        echo "❌ Content NOT FOUND"
        echo "$VIEW_RESULT" | grep -v "REGTEST MODE" | head -5
    fi
done

# Cleanup
echo ""
echo "=== Cleanup ==="
kill $PID_A $PID_B $PID_C $PID_D 2>/dev/null || true
echo "All nodes stopped"
