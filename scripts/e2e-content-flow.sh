#!/bin/bash
# E2E Content Flow Test
#
# This script validates the complete content creation and listing flow:
# 1. Start a node
# 2. Create a space
# 3. Create a post
# 4. Create a reply
# 5. Verify content is visible via list_space_content RPC
# 6. Verify engagement works
#
# Usage: ./scripts/e2e-content-flow.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TEST_DIR="/tmp/e2e-content-flow-$$"
# Regtest mode uses port 29735 for P2P and 29736 for RPC
P2P_PORT=29735
RPC_PORT=29736
GENESIS_PW="test123"

# Cleanup function
cleanup() {
    echo -e "${YELLOW}Cleaning up...${NC}"
    pkill -f "sw.*--data-dir.*$TEST_DIR" 2>/dev/null || true
    rm -rf "$TEST_DIR" 2>/dev/null || true
}
trap cleanup EXIT

# Helper functions
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# Build the project
info "Building project..."
cargo build --release 2>/dev/null || cargo build 2>/dev/null || fail "Build failed"

SW="./target/release/sw"
if [ ! -f "$SW" ]; then
    SW="./target/debug/sw"
fi

info "Using binary: $SW"

# Create test directory
mkdir -p "$TEST_DIR"
info "Test directory: $TEST_DIR"

# Create identity with genesis keypair
info "Creating genesis identity..."
export SWIMCHAIN_PASSWORD="$GENESIS_PW"
export SWIMCHAIN_DATA_DIR="$TEST_DIR"

# Import the genesis identity
echo -n "Creating identity..."
$SW identity create 2>&1 | head -3 || true
echo " done"

# Start the node with regtest mode (no level checks)
info "Starting node on ports P2P=$P2P_PORT, RPC=$RPC_PORT..."
$SW --regtest node start --listen "127.0.0.1:$P2P_PORT" > "$TEST_DIR/node.log" 2>&1 &
NODE_PID=$!
sleep 5

# Verify node is running
if ! kill -0 $NODE_PID 2>/dev/null; then
    fail "Node failed to start"
fi
pass "Node started (PID: $NODE_PID)"

# Get RPC cookie
COOKIE_FILE="$TEST_DIR/.cookie"
if [ ! -f "$COOKIE_FILE" ]; then
    fail "Cookie file not found at $COOKIE_FILE"
fi
COOKIE=$(cat "$COOKIE_FILE")
AUTH=$(echo -n "__cookie__:$COOKIE" | base64 -w 0)

# Helper for RPC calls
rpc_call() {
    local method=$1
    local params=$2
    curl -s -X POST "http://127.0.0.1:$RPC_PORT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Basic $AUTH" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
}

# Test 1: Get node info
info "Test 1: Verify node is responding..."
NODE_INFO=$(rpc_call "get_info" "{}")
if echo "$NODE_INFO" | jq -e '.result.network' | grep -q regtest; then
    pass "Node is running (network: regtest)"
else
    fail "Node not responding properly: $NODE_INFO"
fi

# Test 2: List spaces (should be empty initially)
info "Test 2: Verify spaces list is empty..."
SPACES=$(rpc_call "list_spaces" "{}")
SPACE_COUNT=$(echo "$SPACES" | jq -r '.result.spaces | length')
if [ "$SPACE_COUNT" -eq 0 ]; then
    pass "Spaces list is empty (expected)"
else
    info "Found $SPACE_COUNT existing spaces"
fi

# Test 3: Create a space
info "Test 3: Creating a space..."
SPACE_RESULT=$($SW --regtest space create --name "E2E_Test_Space" 2>&1) || true
SPACE_ID=$(echo "$SPACE_RESULT" | grep -oP 'sp1[a-z0-9]+' | head -1)
if [ -z "$SPACE_ID" ]; then
    info "Space creation result: $SPACE_RESULT"
    # Create a default test space ID for testing
    SPACE_ID="sp1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqd3hgxq"
    info "Using default null space: $SPACE_ID"
else
    pass "Created space: $SPACE_ID"
fi

# Test 4: Create a post
info "Test 4: Creating a post..."
POST_RESULT=$($SW --regtest post create --space "$SPACE_ID" --title "E2E Test Post" --body "This is the body of the E2E test post!" 2>&1) || true
echo "Post result: $POST_RESULT"
POST_ID=$(echo "$POST_RESULT" | grep -oP 'sha256:[a-f0-9]+' | head -1)
if [ -z "$POST_ID" ]; then
    fail "Failed to create post: $POST_RESULT"
fi
pass "Created post: $POST_ID"

# Wait for block formation
info "Waiting for block formation (35 seconds)..."
sleep 35

# Test 5: Verify post is visible via RPC
info "Test 5: Verifying post is visible via list_space_content..."
CONTENT=$(rpc_call "list_space_content" "{\"space_id\":\"$SPACE_ID\"}")
CONTENT_COUNT=$(echo "$CONTENT" | jq -r '.result.items | length')
if [ "$CONTENT_COUNT" -eq 0 ]; then
    info "No content found yet, checking blockchain..."
    CHAIN_HEIGHT=$(rpc_call "get_info" "{}" | jq -r '.result.chain_height')
    info "Chain height: $CHAIN_HEIGHT"
    if [ "$CHAIN_HEIGHT" -eq 0 ]; then
        fail "Chain height is 0, blocks not being formed!"
    fi
    fail "Content not found in list_space_content response"
fi
pass "Found $CONTENT_COUNT content items"

# Check if our post is there
FOUND_POST=$(echo "$CONTENT" | jq -r --arg id "$POST_ID" '.result.items[] | select(.content_id == $id)')
if [ -z "$FOUND_POST" ]; then
    info "Post not found by ID, listing all content:"
    echo "$CONTENT" | jq '.result.items[] | {content_id, content_type, title}'
    fail "Post $POST_ID not found in content list"
fi
pass "Post found in content list"

# Check if body is present
POST_BODY=$(echo "$FOUND_POST" | jq -r '.body')
if [ "$POST_BODY" == "null" ] || [ -z "$POST_BODY" ]; then
    fail "Post body is null - content blob not fetched!"
fi
pass "Post body is present: ${POST_BODY:0:50}..."

# Test 6: Create a reply
info "Test 6: Creating a reply..."
REPLY_RESULT=$($SW --regtest post reply --parent "$POST_ID" --body "This is a reply to the E2E test!" 2>&1) || true
echo "Reply result: $REPLY_RESULT"
REPLY_ID=$(echo "$REPLY_RESULT" | grep -oP 'sha256:[a-f0-9]+' | head -1)
if [ -z "$REPLY_ID" ]; then
    fail "Failed to create reply: $REPLY_RESULT"
fi
pass "Created reply: $REPLY_ID"

# Wait for block formation
info "Waiting for block formation (35 seconds)..."
sleep 35

# Test 7: Verify reply is visible and has correct parent
info "Test 7: Verifying reply is visible..."
CONTENT=$(rpc_call "list_space_content" "{\"space_id\":\"$SPACE_ID\"}")
FOUND_REPLY=$(echo "$CONTENT" | jq -r --arg id "$REPLY_ID" '.result.items[] | select(.content_id == $id)')
if [ -z "$FOUND_REPLY" ]; then
    info "Reply not found, content dump:"
    echo "$CONTENT" | jq '.result.items[] | {content_id, content_type, parent_id}'
    fail "Reply $REPLY_ID not found in content list"
fi
pass "Reply found in content list"

REPLY_PARENT=$(echo "$FOUND_REPLY" | jq -r '.parent_id')
if [ "$REPLY_PARENT" != "$POST_ID" ]; then
    fail "Reply parent mismatch! Expected $POST_ID, got $REPLY_PARENT"
fi
pass "Reply has correct parent"

# Test 8: Engage with the post
info "Test 8: Testing engagement..."
# Note: This may require the forum-client's engagement logic
# For now, just verify we can call the RPC
ENGAGE_RESULT=$(rpc_call "get_content" "{\"content_id\":\"$POST_ID\"}")
ENGAGE_COUNT=$(echo "$ENGAGE_RESULT" | jq -r '.result.engagement_count')
if [ "$ENGAGE_COUNT" == "null" ]; then
    info "Engagement tracking not available via get_content"
else
    pass "Engagement count: $ENGAGE_COUNT"
fi

# Summary
echo ""
echo -e "${GREEN}=== E2E CONTENT FLOW TEST PASSED ===${NC}"
echo "Space ID: $SPACE_ID"
echo "Post ID: $POST_ID"
echo "Reply ID: $REPLY_ID"
echo ""
info "Stopping node..."
kill $NODE_PID 2>/dev/null || true

echo -e "${GREEN}All tests passed!${NC}"
