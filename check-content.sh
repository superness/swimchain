#!/bin/bash
COOKIE=$(cat /mnt/c/github/swimchain/genesis-identity/.cookie)
AUTH=$(echo -n "__cookie__:$COOKIE" | base64 -w 0)

echo "=== Node Info ==="
curl -s -X POST http://127.0.0.1:19736/rpc \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $AUTH" \
  -d '{"jsonrpc":"2.0","method":"get_info","params":{},"id":1}' | jq .

echo ""
echo "=== List Spaces ==="
curl -s -X POST http://127.0.0.1:19736/rpc \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $AUTH" \
  -d '{"jsonrpc":"2.0","method":"list_spaces","params":{"limit":100},"id":1}' | jq .

echo ""
echo "=== List Content in first space (if any) ==="
# Get the first space and list its content
FIRST_SPACE=$(curl -s -X POST http://127.0.0.1:19736/rpc \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $AUTH" \
  -d '{"jsonrpc":"2.0","method":"list_spaces","params":{"limit":1},"id":1}' | jq -r '.result.spaces[0].space_id // empty')

if [ -n "$FIRST_SPACE" ]; then
  echo "Listing content for space: $FIRST_SPACE"
  curl -s -X POST http://127.0.0.1:19736/rpc \
    -H "Content-Type: application/json" \
    -H "Authorization: Basic $AUTH" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"list_space_content\",\"params\":{\"space_id\":\"$FIRST_SPACE\",\"limit\":10},\"id\":1}" | jq .
else
  echo "No spaces found"
fi
