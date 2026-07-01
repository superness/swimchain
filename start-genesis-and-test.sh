#!/bin/bash
set -e

echo "Starting Genesis Node (Node A)..."
export SWIMCHAIN_DATA_DIR=genesis-identity
export SWIMCHAIN_PASSWORD=genesis123
nohup ./target/release/sw --testnet node start > node-a.log 2>&1 &
sleep 5

echo "Starting Test Node (Node B)..."
export SWIMCHAIN_DATA_DIR=test-node-b
export SWIMCHAIN_PASSWORD=test
nohup ./target/release/sw --testnet node start --listen 127.0.0.1:29735 > node-b.log 2>&1 &
sleep 5

echo "Connecting Node B to Node A directly..."
COOKIE_B=$(cat test-node-b/.cookie)
AUTH_B=$(echo -n "__cookie__:$COOKIE_B" | base64)
curl -s -X POST http://127.0.0.1:29736 \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $AUTH_B" \
  -d '{"jsonrpc":"2.0","method":"add_peer","params":{"address":"127.0.0.1:19735"},"id":1}' | jq '.'

echo ""
echo "Node A RPC: $(cat genesis-identity/.rpc_addr 2>/dev/null || echo 'N/A')"
echo "Node B RPC: $(cat test-node-b/.rpc_addr 2>/dev/null || echo 'N/A')"
