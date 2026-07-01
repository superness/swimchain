#!/bin/bash
set -e

echo "Starting Node A..."
export SWIMCHAIN_DATA_DIR=test-node-a
export SWIMCHAIN_PASSWORD=test
nohup ./target/release/sw --testnet node start > node-a.log 2>&1 &
NODE_A_PID=$!
echo "Node A PID: $NODE_A_PID"

sleep 5

echo "Starting Node B on separate port..."
export SWIMCHAIN_DATA_DIR=test-node-b
export SWIMCHAIN_PASSWORD=test
nohup ./target/release/sw --testnet node start --listen 127.0.0.1:29735 > node-b.log 2>&1 &
NODE_B_PID=$!
echo "Node B PID: $NODE_B_PID"

sleep 5

echo "Node A log:"
tail -10 node-a.log

echo ""
echo "Node B log:"
tail -10 node-b.log

echo ""
echo "RPC addresses:"
cat test-node-a/.rpc_addr 2>/dev/null || echo "Node A: not yet ready"
cat test-node-b/.rpc_addr 2>/dev/null || echo "Node B: not yet ready"
