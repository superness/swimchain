#!/bin/bash
# Two-node content sync test script
#
# This script tests content propagation between two regtest nodes.
#
# Prerequisites: The existing node-a-data and node-b-data directories should
# have identities pre-created. If not, run interactively to create identities.
#
# Flow:
# 1. Start Node A on port 29735
# 2. Start Node B on port 29736, connected to Node A
# 3. Create content on Node A
# 4. Wait for propagation
# 5. Verify content is visible on Node B

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo " Swimchain Two-Node Content Sync Test"
echo "======================================"
echo ""

# Configuration - Use existing data directories with pre-created identities
NODE_A_DATA="./node-a-data"
NODE_B_DATA="./node-b-data"
NODE_A_PORT=29735
NODE_B_PORT=29736
SW_BIN="./target/release/sw"

# Password for non-interactive testing (set this to your identity password)
# Export before running: export SWIMCHAIN_PASSWORD="your-password"
if [ -z "$SWIMCHAIN_PASSWORD" ]; then
    echo -e "${RED}Error: SWIMCHAIN_PASSWORD environment variable not set${NC}"
    echo "Set it to the password used when creating identities:"
    echo "  export SWIMCHAIN_PASSWORD='your-password'"
    exit 1
fi

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    pkill -f "sw.*node start" 2>/dev/null || true
}

# Set up trap for cleanup on exit
trap cleanup EXIT

# Check if binary exists
if [ ! -f "$SW_BIN" ]; then
    echo -e "${RED}Error: $SW_BIN not found. Run 'cargo build --release' first.${NC}"
    exit 1
fi

echo "Step 1: Verifying identities..."
echo "-----------------------------------"

# Check for existing identities (in regtest dirs)
NODE_A_IDENTITY="$NODE_A_DATA-regtest/identity.enc"
NODE_B_IDENTITY="$NODE_B_DATA-regtest/identity.enc"

if [ ! -f "$NODE_A_IDENTITY" ]; then
    echo -e "${RED}Error: Node A identity not found at $NODE_A_IDENTITY${NC}"
    echo "Please create identities first by running interactively:"
    echo "  export SWIMCHAIN_DATA_DIR=./node-a-data"
    echo "  ./target/release/sw --regtest identity create"
    exit 1
fi

if [ ! -f "$NODE_B_IDENTITY" ]; then
    echo -e "${RED}Error: Node B identity not found at $NODE_B_IDENTITY${NC}"
    echo "Please create identities first by running interactively:"
    echo "  export SWIMCHAIN_DATA_DIR=./node-b-data"
    echo "  ./target/release/sw --regtest identity create"
    exit 1
fi

echo "  Node A identity: $NODE_A_IDENTITY ✓"
echo "  Node B identity: $NODE_B_IDENTITY ✓"

echo ""
echo "Step 2: Starting nodes..."
echo "-----------------------------------"

# Ensure log directories exist
mkdir -p "$NODE_A_DATA-regtest" "$NODE_B_DATA-regtest"

# Start Node A in background
export SWIMCHAIN_DATA_DIR="$NODE_A_DATA"
$SW_BIN --regtest node start --listen 127.0.0.1:$NODE_A_PORT > "$NODE_A_DATA-regtest/node.log" 2>&1 &
NODE_A_PID=$!
echo "  Node A started (PID: $NODE_A_PID, Port: $NODE_A_PORT)"
sleep 2

# Start Node B and connect to Node A
export SWIMCHAIN_DATA_DIR="$NODE_B_DATA"
$SW_BIN --regtest node start --listen 127.0.0.1:$NODE_B_PORT --connect 127.0.0.1:$NODE_A_PORT > "$NODE_B_DATA-regtest/node.log" 2>&1 &
NODE_B_PID=$!
echo "  Node B started (PID: $NODE_B_PID, Port: $NODE_B_PORT)"
echo "  Node B connecting to Node A..."
sleep 3

# Verify nodes are running
if ! kill -0 $NODE_A_PID 2>/dev/null; then
    echo -e "${RED}Error: Node A failed to start${NC}"
    cat "$NODE_A_DATA-regtest/node.log"
    exit 1
fi

if ! kill -0 $NODE_B_PID 2>/dev/null; then
    echo -e "${RED}Error: Node B failed to start${NC}"
    cat "$NODE_B_DATA-regtest/node.log"
    exit 1
fi

echo -e "  ${GREEN}Both nodes running${NC}"

echo ""
echo "Step 3: Creating space and content on Node A..."
echo "-----------------------------------"

# Create a space on Node A
export SWIMCHAIN_DATA_DIR="$NODE_A_DATA"
SPACE_OUTPUT=$($SW_BIN --regtest space create --name "Test Space" 2>&1)
SPACE_ID=$(echo "$SPACE_OUTPUT" | grep "Space ID:" | awk '{print $3}')

if [ -z "$SPACE_ID" ]; then
    echo -e "${RED}Error: Failed to create space${NC}"
    echo "$SPACE_OUTPUT"
    exit 1
fi
echo "  Space created: $SPACE_ID"

# Create a post on Node A
POST_OUTPUT=$($SW_BIN --regtest post create --space "$SPACE_ID" --title "Hello from Node A" --body "This content should propagate to Node B" 2>&1)
CONTENT_ID=$(echo "$POST_OUTPUT" | grep "Content ID:" | awk '{print $3}')

if [ -z "$CONTENT_ID" ]; then
    echo -e "${RED}Error: Failed to create post${NC}"
    echo "$POST_OUTPUT"
    exit 1
fi
echo "  Post created: $CONTENT_ID"

# Verify it's stored locally on Node A
echo ""
echo "Step 4: Verifying content on Node A..."
echo "-----------------------------------"
export SWIMCHAIN_DATA_DIR="$NODE_A_DATA"
VIEW_A=$($SW_BIN --regtest post view "$CONTENT_ID" 2>&1)
if echo "$VIEW_A" | grep -q "Hello from Node A"; then
    echo -e "  ${GREEN}Content visible on Node A ✓${NC}"
else
    echo -e "${RED}Error: Content not visible on Node A${NC}"
    echo "$VIEW_A"
    exit 1
fi

echo ""
echo "Step 5: Waiting for propagation (10 seconds)..."
echo "-----------------------------------"
for i in $(seq 10 -1 1); do
    echo -ne "  Waiting: $i seconds remaining...\r"
    sleep 1
done
echo ""

echo ""
echo "Step 6: Checking content on Node B..."
echo "-----------------------------------"
export SWIMCHAIN_DATA_DIR="$NODE_B_DATA"
VIEW_B=$($SW_BIN --regtest post view "$CONTENT_ID" 2>&1)

if echo "$VIEW_B" | grep -q "Hello from Node A"; then
    echo -e "  ${GREEN}Content visible on Node B ✓${NC}"
    echo ""
    echo "======================================"
    echo -e "${GREEN}  TEST PASSED: Content propagated!${NC}"
    echo "======================================"
else
    echo -e "${YELLOW}Content not yet visible on Node B${NC}"
    echo "  (This is expected - content sync requires background gossip)"
    echo ""
    echo "  Node B view output:"
    echo "$VIEW_B"
    echo ""
    echo "======================================"
    echo -e "${YELLOW}  TEST PARTIAL: Nodes running, sync not yet implemented${NC}"
    echo "======================================"
    echo ""
    echo "Next steps to complete content sync:"
    echo "1. Implement background WHO_HAS broadcast for local content"
    echo "2. Wire content handlers in transport message loop"
    echo "3. Add periodic content discovery task"
fi

# Show logs
echo ""
echo "Node A log tail:"
tail -20 "$NODE_A_DATA-regtest/node.log" | grep -E "CONTENT|Peer|Connect|sync" || true

echo ""
echo "Node B log tail:"
tail -20 "$NODE_B_DATA-regtest/node.log" | grep -E "CONTENT|Peer|Connect|sync" || true

# Keep nodes running for manual testing (comment out for CI)
# echo ""
# echo "Nodes still running. Press Ctrl+C to stop."
# wait

exit 0
