#!/bin/bash
# Debug script to test forum-client behavior

GENESIS_RPC="http://127.0.0.1:19736"
IDENTITY=$(cat genesis-identity/.identity 2>/dev/null | head -1)
PASSWORD="genesis123"

# Get current timestamp
TIMESTAMP=$(date +%s)

# Generate auth signature (simplified - just for testing)
generate_auth() {
    local method=$1
    local params=$2
    echo "X-Swimchain-Signature: test"
}

echo "=== Forum Client Debug ==="
echo ""

# 1. Check if node is responding
echo "1. Checking node connection..."
curl -s -X POST $GENESIS_RPC \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"get_sync_status","params":{}}' | head -100

echo ""
echo ""

# 2. List spaces and their content counts
echo "2. Listing spaces..."
SPACES=$(curl -s -X POST $GENESIS_RPC \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"list_spaces","params":{}}')
echo "$SPACES" | head -200

echo ""
echo ""

# 3. Get content for a specific space (the one you mentioned)
SPACE_ID="sp1qruc7h2sm5gyc8levfwquh77wtssku826e"
echo "3. Getting content for space $SPACE_ID..."
CONTENT=$(curl -s -X POST $GENESIS_RPC \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"list_space_content\",\"params\":{\"space_id\":\"$SPACE_ID\"}}")
echo "$CONTENT" | head -500

echo ""
echo ""

# 4. Count what we got
echo "4. Analyzing content..."
TOTAL=$(echo "$CONTENT" | jq '.result.items | length' 2>/dev/null || echo "parse error")
WITH_BODY=$(echo "$CONTENT" | jq '[.result.items[] | select(.body != null)] | length' 2>/dev/null || echo "parse error")
echo "Total items: $TOTAL"
echo "With body: $WITH_BODY"
echo "Missing body: $((TOTAL - WITH_BODY))"

echo ""
echo ""

# 5. Show first few items structure
echo "5. Sample items (first 3)..."
echo "$CONTENT" | jq '.result.items[:3]' 2>/dev/null || echo "parse error"

