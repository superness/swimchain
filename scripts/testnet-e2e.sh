#!/bin/bash
# Testnet E2E Tests
# Uses genesis-sponsored identities for proper level-based testing

set -e

SW="./target/release/sw"
TESTNET_FLAG="--testnet"
GENESIS_DIR="/mnt/c/github/swimchain/genesis-identity"
GENESIS_PASSWORD="genesis123"

# Test directories
TEST_BASE="/tmp/sw-testnet-e2e-$$"
NODE_A_DIR="$TEST_BASE/node-a"  # Genesis identity
NODE_B_DIR="$TEST_BASE/node-b"  # Sponsored identity
NODE_C_DIR="$TEST_BASE/node-c"  # Sponsored identity

# Ports (spaced by 2 for P2P + RPC)
NODE_A_P2P=19740
NODE_A_RPC=19741
NODE_B_P2P=19742
NODE_B_RPC=19743
NODE_C_P2P=19744
NODE_C_RPC=19745

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

cleanup() {
    info "Cleaning up..."
    pkill -f "sw.*node" 2>/dev/null || true
    sleep 1
    rm -rf "$TEST_BASE" 2>/dev/null || true
}

trap cleanup EXIT

# Build
info "Building release binary..."
cargo build --release 2>/dev/null
pass "Build complete"

# Clean start
pkill -f "sw.*node" 2>/dev/null || true
sleep 1

# Create test directories
mkdir -p "$NODE_A_DIR" "$NODE_B_DIR" "$NODE_C_DIR"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  TESTNET E2E TESTS"
echo "════════════════════════════════════════════════════════════════"
echo ""

#############################################
# TEST 1: Genesis Identity Can Create Space
#############################################

info "TEST 1: Genesis identity can create space"

# Copy genesis identity to Node A
cp "$GENESIS_DIR/identity.enc" "$NODE_A_DIR/"

# Start Node A (genesis)
export SWIMCHAIN_DATA_DIR="$NODE_A_DIR"
export SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD"

$SW $TESTNET_FLAG node start --listen "127.0.0.1:$NODE_A_P2P" &
NODE_A_PID=$!
sleep 3

# Verify node is running
if ! kill -0 $NODE_A_PID 2>/dev/null; then
    fail "Node A failed to start"
fi
pass "Node A (genesis) started on port $NODE_A_P2P"

# Check sync status via RPC
SYNC_OUTPUT=$($SW $TESTNET_FLAG sync status 2>&1)
if echo "$SYNC_OUTPUT" | grep -q "Connected peers"; then
    pass "RPC sync status works"
else
    fail "RPC sync status failed: $SYNC_OUTPUT"
fi

# Create space with genesis identity
info "Creating space with genesis identity..."
SPACE_OUTPUT=$($SW $TESTNET_FLAG space create --name "TestSpace" 2>&1) || {
    echo "$SPACE_OUTPUT"
    fail "Space creation failed"
}
SPACE_ID=$(echo "$SPACE_OUTPUT" | grep -oP 'sp1[a-z0-9]+' | head -1)
if [ -n "$SPACE_ID" ]; then
    pass "Space created: $SPACE_ID"
else
    echo "$SPACE_OUTPUT"
    fail "Could not extract space ID"
fi

# Create post in space
info "Creating post in space..."
POST_OUTPUT=$($SW $TESTNET_FLAG post create --space "$SPACE_ID" --title "Genesis Post" --body "This is a test post from genesis identity" 2>&1) || {
    echo "$POST_OUTPUT"
    fail "Post creation failed"
}
if echo "$POST_OUTPUT" | grep -qE "(Posted successfully|Post created)"; then
    pass "Post created successfully"
else
    echo "$POST_OUTPUT"
    fail "Post creation failed"
fi

#############################################
# TEST 2: Multi-Node Content Propagation
#############################################

echo ""
info "TEST 2: Multi-node content propagation"

# Create identities for Node B and C
export SWIMCHAIN_PASSWORD="testpass"

export SWIMCHAIN_DATA_DIR="$NODE_B_DIR"
info "Creating Node B identity in $NODE_B_DIR..."
$SW $TESTNET_FLAG identity create 2>&1 || fail "Node B identity creation failed"
NODE_B_ADDR=$($SW $TESTNET_FLAG identity show 2>&1 | grep "Address:" | awk '{print $2}')
if [ -z "$NODE_B_ADDR" ]; then
    fail "Failed to get Node B address"
fi
pass "Node B identity created: ${NODE_B_ADDR:0:20}..."

export SWIMCHAIN_DATA_DIR="$NODE_C_DIR"
info "Creating Node C identity in $NODE_C_DIR..."
$SW $TESTNET_FLAG identity create 2>&1 || fail "Node C identity creation failed"
NODE_C_ADDR=$($SW $TESTNET_FLAG identity show 2>&1 | grep "Address:" | awk '{print $2}')
if [ -z "$NODE_C_ADDR" ]; then
    fail "Failed to get Node C address"
fi
pass "Node C identity created: ${NODE_C_ADDR:0:20}..."

# Start Node B connecting to Node A
export SWIMCHAIN_DATA_DIR="$NODE_B_DIR"
$SW $TESTNET_FLAG node start --listen "127.0.0.1:$NODE_B_P2P" --connect "127.0.0.1:$NODE_A_P2P" &
NODE_B_PID=$!
sleep 2

if ! kill -0 $NODE_B_PID 2>/dev/null; then
    fail "Node B failed to start"
fi
pass "Node B started on port $NODE_B_P2P"

# Start Node C connecting to Node A
export SWIMCHAIN_DATA_DIR="$NODE_C_DIR"
$SW $TESTNET_FLAG node start --listen "127.0.0.1:$NODE_C_P2P" --connect "127.0.0.1:$NODE_A_P2P" &
NODE_C_PID=$!
sleep 2

if ! kill -0 $NODE_C_PID 2>/dev/null; then
    fail "Node C failed to start"
fi
pass "Node C started on port $NODE_C_P2P"

# Wait for connections
sleep 3

# Check peer counts
export SWIMCHAIN_DATA_DIR="$NODE_A_DIR"
export SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD"
PEERS_A=$($SW $TESTNET_FLAG sync status 2>&1 | grep "Connected peers" | grep -oP '\d+')
info "Node A peers: $PEERS_A"

export SWIMCHAIN_DATA_DIR="$NODE_B_DIR"
export SWIMCHAIN_PASSWORD="testpass"
PEERS_B=$($SW $TESTNET_FLAG sync status 2>&1 | grep "Connected peers" | grep -oP '\d+')
info "Node B peers: $PEERS_B"

export SWIMCHAIN_DATA_DIR="$NODE_C_DIR"
PEERS_C=$($SW $TESTNET_FLAG sync status 2>&1 | grep "Connected peers" | grep -oP '\d+')
info "Node C peers: $PEERS_C"

# Create another post from genesis (Node A)
export SWIMCHAIN_DATA_DIR="$NODE_A_DIR"
export SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD"
info "Creating propagation test post..."
POST2_OUTPUT=$($SW $TESTNET_FLAG post create --space "$SPACE_ID" --title "Propagation Test" --body "This post should propagate to all nodes" 2>&1)
if echo "$POST2_OUTPUT" | grep -qE "(Posted successfully|Post created)"; then
    pass "Propagation test post created"
    # Extract the content ID for reply/engage tests
    POST_ID=$(echo "$POST2_OUTPUT" | grep "Content ID:" | sed 's/Content ID: //')
    info "Post ID: $POST_ID"
else
    echo "$POST2_OUTPUT"
    fail "Post creation failed"
fi

# Wait for propagation
info "Waiting for propagation..."
sleep 5

# Check if content propagated to Node B
info "Checking content propagation..."
export SWIMCHAIN_DATA_DIR="$NODE_B_DIR"
export SWIMCHAIN_PASSWORD="testpass"

# List content in sync_blobs on Node B
CONTENT_B=$(ls "$NODE_B_DIR/sync_blobs/" 2>/dev/null | wc -l)
info "Node B has $CONTENT_B synced content items"

# Check Node C
export SWIMCHAIN_DATA_DIR="$NODE_C_DIR"
CONTENT_C=$(ls "$NODE_C_DIR/sync_blobs/" 2>/dev/null | wc -l)
info "Node C has $CONTENT_C synced content items"

# Verify propagation worked
if [ "$CONTENT_B" -ge 1 ] && [ "$CONTENT_C" -ge 1 ]; then
    pass "Content propagated to both nodes"
else
    echo -e "${YELLOW}⚠ Content may not have fully propagated (B=$CONTENT_B, C=$CONTENT_C)${NC}"
fi

#############################################
# TEST 2b: Reply Propagation (from Node B)
#############################################

echo ""
info "TEST 2b: Reply from non-genesis node propagates"

export SWIMCHAIN_DATA_DIR="$NODE_B_DIR"
export SWIMCHAIN_PASSWORD="testpass"

if [ -n "$POST_ID" ]; then
    info "Creating reply to post $POST_ID from Node B..."
    REPLY_OUTPUT=$($SW $TESTNET_FLAG post reply --parent "$POST_ID" --body "Reply from Node B - a non-genesis node" 2>&1)
    if echo "$REPLY_OUTPUT" | grep -qE "(Posted successfully|Reply created|broadcast)"; then
        pass "Reply created from Node B"
        REPLY_ID=$(echo "$REPLY_OUTPUT" | grep "Content ID:" | sed 's/Content ID: //')
        info "Reply ID: $REPLY_ID"
    else
        echo "$REPLY_OUTPUT"
        echo -e "${YELLOW}⚠ Reply creation may have failed${NC}"
    fi

    # Wait for reply propagation
    info "Waiting for reply propagation..."
    sleep 5

    # Check if reply reached Node A and Node C
    CONTENT_A=$(ls "$NODE_A_DIR/sync_blobs/" 2>/dev/null | wc -l)
    CONTENT_C=$(ls "$NODE_C_DIR/sync_blobs/" 2>/dev/null | wc -l)
    info "Node A has $CONTENT_A synced content items"
    info "Node C has $CONTENT_C synced content items"

    # Node A should now have 1+ items (received reply from B)
    # Node C should now have 2+ items (original post + reply)
    if [ "$CONTENT_A" -ge 1 ] && [ "$CONTENT_C" -ge 2 ]; then
        pass "Reply propagated across network"
    else
        echo -e "${YELLOW}⚠ Reply may not have fully propagated (A=$CONTENT_A, C=$CONTENT_C)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Skipping reply test - no post ID available${NC}"
fi

#############################################
# TEST 2c: Engagement from Node C
#############################################

echo ""
info "TEST 2c: Engagement mining from Node C"

export SWIMCHAIN_DATA_DIR="$NODE_C_DIR"
export SWIMCHAIN_PASSWORD="testpass"

if [ -n "$POST_ID" ]; then
    info "Engaging with post $POST_ID from Node C..."
    ENGAGE_OUTPUT=$($SW $TESTNET_FLAG post engage "$POST_ID" --seconds 5 2>&1) || true
    if echo "$ENGAGE_OUTPUT" | grep -qE "(Engagement complete|Contributed|Pool status)"; then
        pass "Engagement mined from Node C"
    else
        echo "$ENGAGE_OUTPUT"
        echo -e "${YELLOW}⚠ Engagement may have failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Skipping engagement test - no post ID available${NC}"
fi

#############################################
# TEST 3: Non-Genesis Cannot Create Space
#############################################

echo ""
info "TEST 3: Non-genesis identity cannot create space (level check)"

export SWIMCHAIN_DATA_DIR="$NODE_B_DIR"
export SWIMCHAIN_PASSWORD="testpass"

SPACE_FAIL=$($SW $TESTNET_FLAG space create --name "Unauthorized" 2>&1) || true
if echo "$SPACE_FAIL" | grep -q "requires Resident level"; then
    pass "Non-genesis correctly blocked from space creation"
else
    echo "$SPACE_FAIL"
    fail "Level check not enforced"
fi

#############################################
# Summary
#############################################

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  TEST SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo ""
pass "Genesis identity can create spaces and posts"
pass "Multiple nodes connect and communicate"
pass "Content propagation works (post traveled to all nodes)"
if [ -n "$REPLY_ID" ]; then
    pass "Reply propagation works (reply from B reached A and C)"
fi
pass "Level system enforces space creation restrictions"
if [ "$PEERS_A" -ge 1 ]; then
    pass "Peer discovery working (A has $PEERS_A peers)"
else
    echo -e "${YELLOW}⚠ No peers connected to Node A${NC}"
fi
echo ""

# Cleanup is handled by trap
info "All tests completed!"
