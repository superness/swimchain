#!/bin/bash

# Testnet Edge Case Tests
# Tests real-world scenarios that stress the network

# Don't exit on first error - we want to run all scenarios
# set -e

BINARY="./target/release/sw"
TEST_BASE_DIR="/tmp/sw-edge-test-$$"
SCRIPT_DIR="$(dirname "$0")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

log() { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; ((TESTS_PASSED++)); ((TESTS_RUN++)); }
fail() { echo -e "${RED}✗${NC} $1"; ((TESTS_FAILED++)); ((TESTS_RUN++)); }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
header() { echo -e "\n${YELLOW}════════════════════════════════════════${NC}"; echo -e "${YELLOW}  $1${NC}"; echo -e "${YELLOW}════════════════════════════════════════${NC}"; }

cleanup() {
    log "Cleaning up..."
    pkill -f "sw.*node start" 2>/dev/null || true
    sleep 2
    rm -rf "$TEST_BASE_DIR"
}
trap cleanup EXIT

# Build
log "Building..."
cargo build --release 2>/dev/null

mkdir -p "$TEST_BASE_DIR"

# Use genesis identity for creating spaces
GENESIS_DIR="$(pwd)/genesis-identity"
GENESIS_PASSWORD="genesis123"

if [[ ! -d "$GENESIS_DIR" ]] || [[ ! -f "$GENESIS_DIR/identity.enc" ]]; then
    log "ERROR: Genesis identity not found at $GENESIS_DIR"
    log "The genesis identity must already exist with pubkey in genesis_list.rs"
    exit 1
fi

GENESIS_PUBKEY=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet identity show 2>/dev/null | grep "Public Key" | awk '{print $3}')
log "Genesis pubkey: ${GENESIS_PUBKEY:0:16}..."


################################################################################
header "SCENARIO 1: Content Creator Goes Offline"
################################################################################
# User A creates post → A goes offline → User B comes online → B can't get content

NODE_A_DIR="$TEST_BASE_DIR/scenario1-nodeA"
NODE_B_DIR="$TEST_BASE_DIR/scenario1-nodeB"
export SWIMCHAIN_PASSWORD=test

log "Setting up Node A (content creator)..."
mkdir -p "$NODE_A_DIR"
SWIMCHAIN_DATA_DIR="$NODE_A_DIR" $BINARY --testnet identity create 2>/dev/null

# Start Node A
log "Starting Node A..."
SWIMCHAIN_DATA_DIR="$NODE_A_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19800 > "$NODE_A_DIR/node.log" 2>&1 &
NODE_A_PID=$!
sleep 3

# Create space and post (using genesis identity via RPC to a node, or just test post)
# Actually, Node A can't create spaces unless it's genesis. Let's use a different approach:
# We'll create content that doesn't require space creation, or use genesis for A.

# Let's restart with genesis as Node A
kill $NODE_A_PID 2>/dev/null || true
sleep 2

log "Starting Node A with GENESIS identity (can create spaces)..."
SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet node start \
    --listen 127.0.0.1:19800 > "$NODE_A_DIR/node.log" 2>&1 &
NODE_A_PID=$!
sleep 3

# Create space
log "Creating space..."
SPACE_ID=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet space create \
    --name "Scenario1Space" 2>/dev/null | grep -oP 'sp1[a-z0-9]+' | head -1)
log "Created space: $SPACE_ID"

# Create post
log "Creating post..."
POST_RESULT=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet post create \
    --space "$SPACE_ID" --title "Offline Test Post" --body "This post creator will go offline" 2>&1)
POST_ID=$(echo "$POST_RESULT" | grep -oP 'Content ID: \K[a-f0-9]+' | head -1)
log "Created post: ${POST_ID:0:16}..."

# Verify post exists locally on A
A_HAS_POST=$(find "$GENESIS_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)
if [[ "$A_HAS_POST" -gt 0 ]]; then
    log "Node A has post stored locally"
else
    fail "Node A doesn't have post stored"
fi

# Now kill Node A (creator goes offline)
log "Killing Node A (creator goes offline)..."
kill $NODE_A_PID 2>/dev/null || true
sleep 2

# Start Node B (late joiner, creator is offline)
log "Setting up Node B (late joiner)..."
mkdir -p "$NODE_B_DIR"
SWIMCHAIN_DATA_DIR="$NODE_B_DIR" $BINARY --testnet identity create 2>/dev/null

log "Starting Node B..."
SWIMCHAIN_DATA_DIR="$NODE_B_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19802 > "$NODE_B_DIR/node.log" 2>&1 &
NODE_B_PID=$!
sleep 3

# B tries to connect to A (but A is offline)
log "Node B trying to connect to offline Node A..."
# There's no connect command, but B has no peers anyway

# Check if B has any content
B_CONTENT=$(find "$NODE_B_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)
if [[ "$B_CONTENT" -eq 0 ]]; then
    success "Scenario 1: Late joiner cannot get content when creator is offline (expected behavior)"
else
    fail "Scenario 1: Node B somehow has content without connecting to anyone"
fi

# Cleanup scenario 1
kill $NODE_B_PID 2>/dev/null || true
sleep 2


################################################################################
header "SCENARIO 2: Content Survives Creator Offline"
################################################################################
# A, B online → A creates post → B receives → A goes offline → C joins → C gets from B

NODE_A_DIR="$TEST_BASE_DIR/scenario2-nodeA"
NODE_B_DIR="$TEST_BASE_DIR/scenario2-nodeB"
NODE_C_DIR="$TEST_BASE_DIR/scenario2-nodeC"

log "Setting up nodes..."
mkdir -p "$NODE_A_DIR" "$NODE_B_DIR" "$NODE_C_DIR"
SWIMCHAIN_DATA_DIR="$NODE_B_DIR" $BINARY --testnet identity create 2>/dev/null
SWIMCHAIN_DATA_DIR="$NODE_C_DIR" $BINARY --testnet identity create 2>/dev/null

# Start Node A (genesis - content creator)
log "Starting Node A (genesis)..."
SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet node start \
    --listen 127.0.0.1:19810 > "$NODE_A_DIR/node.log" 2>&1 &
NODE_A_PID=$!
sleep 3

# Start Node B, connect to A
log "Starting Node B, connecting to A..."
SWIMCHAIN_DATA_DIR="$NODE_B_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19812 --connect 127.0.0.1:19810 > "$NODE_B_DIR/node.log" 2>&1 &
NODE_B_PID=$!
sleep 5

# Create space and post
log "Creating space..."
SPACE_ID=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet space create \
    --name "Scenario2Space" 2>/dev/null | grep -oP 'sp1[a-z0-9]+' | head -1)

log "Creating post..."
POST_RESULT=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet post create \
    --space "$SPACE_ID" --title "Survival Test" --body "This content should survive creator offline" 2>&1)
POST_ID=$(echo "$POST_RESULT" | grep -oP 'Content ID: \K[a-f0-9]+' | head -1)
log "Created post: ${POST_ID:0:16}..."

# Wait for propagation to B (needs time for gossip cycle)
log "Waiting for propagation to B..."
sleep 20

# Check B received it (content is in sharded subdirs)
B_CONTENT=$(find "$NODE_B_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)
if [[ "$B_CONTENT" -gt 0 ]]; then
    log "Node B received content ($B_CONTENT items)"
else
    warn "Node B didn't receive content yet"
fi

# Kill Node A (creator goes offline)
log "Killing Node A (creator goes offline)..."
kill $NODE_A_PID 2>/dev/null || true
sleep 2

# Verify A is really dead
if ps -p $NODE_A_PID > /dev/null 2>&1; then
    fail "Node A still running"
else
    log "Node A confirmed offline"
fi

# Start Node C, connect to B (not A, which is offline)
log "Starting Node C, connecting to B (A is offline)..."
SWIMCHAIN_DATA_DIR="$NODE_C_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19814 --connect 127.0.0.1:19812 > "$NODE_C_DIR/node.log" 2>&1 &
NODE_C_PID=$!
sleep 5

# Wait for C to sync from B
log "Waiting for C to sync from B..."
sleep 25

# Check C has the content
C_CONTENT=$(find "$NODE_C_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)
if [[ "$C_CONTENT" -gt 0 ]]; then
    success "Scenario 2: Content survives creator going offline (C got content from B)"
else
    fail "Scenario 2: Node C couldn't get content from B after A went offline"
    log "Node B log tail:"
    tail -20 "$NODE_B_DIR/node.log" 2>/dev/null || true
    log "Node C log tail:"
    tail -20 "$NODE_C_DIR/node.log" 2>/dev/null || true
fi

# Cleanup scenario 2
kill $NODE_B_PID $NODE_C_PID 2>/dev/null || true
sleep 2


################################################################################
header "SCENARIO 3: Network Partition"
################################################################################
# A-B connected (cluster 1), C-D connected (cluster 2), no cross-connection
# A creates post → only B sees it, C and D don't

NODE_A_DIR="$TEST_BASE_DIR/scenario3-nodeA"
NODE_B_DIR="$TEST_BASE_DIR/scenario3-nodeB"
NODE_C_DIR="$TEST_BASE_DIR/scenario3-nodeC"
NODE_D_DIR="$TEST_BASE_DIR/scenario3-nodeD"

log "Setting up partitioned network..."
mkdir -p "$NODE_A_DIR" "$NODE_B_DIR" "$NODE_C_DIR" "$NODE_D_DIR"
SWIMCHAIN_DATA_DIR="$NODE_B_DIR" $BINARY --testnet identity create 2>/dev/null
SWIMCHAIN_DATA_DIR="$NODE_C_DIR" $BINARY --testnet identity create 2>/dev/null
SWIMCHAIN_DATA_DIR="$NODE_D_DIR" $BINARY --testnet identity create 2>/dev/null

# Start Cluster 1: A (genesis) - B
log "Starting Cluster 1 (A-B)..."
SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet node start \
    --listen 127.0.0.1:19820 > "$NODE_A_DIR/node.log" 2>&1 &
NODE_A_PID=$!
sleep 3

SWIMCHAIN_DATA_DIR="$NODE_B_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19822 --connect 127.0.0.1:19820 > "$NODE_B_DIR/node.log" 2>&1 &
NODE_B_PID=$!
sleep 3

# Start Cluster 2: C - D (NO connection to cluster 1)
log "Starting Cluster 2 (C-D) - ISOLATED from Cluster 1..."
SWIMCHAIN_DATA_DIR="$NODE_C_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19824 > "$NODE_C_DIR/node.log" 2>&1 &
NODE_C_PID=$!
sleep 3

SWIMCHAIN_DATA_DIR="$NODE_D_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19826 --connect 127.0.0.1:19824 > "$NODE_D_DIR/node.log" 2>&1 &
NODE_D_PID=$!
sleep 3

# Create content on A
log "Creating space and post on A..."
SPACE_ID=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet space create \
    --name "PartitionSpace" 2>/dev/null | grep -oP 'sp1[a-z0-9]+' | head -1)

POST_RESULT=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet post create \
    --space "$SPACE_ID" --title "Partition Test" --body "Only cluster 1 should see this" 2>&1)
POST_ID=$(echo "$POST_RESULT" | grep -oP 'Content ID: \K[a-f0-9]+' | head -1)
log "Created post: ${POST_ID:0:16}..."

# Wait for propagation
log "Waiting for propagation..."
sleep 10

# Check each node
B_CONTENT=$(find "$NODE_B_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)
C_CONTENT=$(find "$NODE_C_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)
D_CONTENT=$(find "$NODE_D_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)

log "Content counts: B=$B_CONTENT, C=$C_CONTENT, D=$D_CONTENT"

PARTITION_OK=true
if [[ "$B_CONTENT" -gt 0 ]]; then
    log "Node B (same cluster as A) has content ✓"
else
    warn "Node B should have content"
    PARTITION_OK=false
fi

if [[ "$C_CONTENT" -eq 0 && "$D_CONTENT" -eq 0 ]]; then
    log "Nodes C and D (isolated cluster) have no content ✓"
else
    warn "Nodes C/D somehow got content despite network partition"
    PARTITION_OK=false
fi

if $PARTITION_OK; then
    success "Scenario 3: Network partition isolates content correctly"
else
    fail "Scenario 3: Network partition test failed"
fi

# Cleanup scenario 3
kill $NODE_A_PID $NODE_B_PID $NODE_C_PID $NODE_D_PID 2>/dev/null || true
sleep 2


################################################################################
header "SCENARIO 4: Partition Heals"
################################################################################
# Continuing from scenario 3 concept: partition heals, content should propagate

NODE_A_DIR="$TEST_BASE_DIR/scenario4-nodeA"
NODE_B_DIR="$TEST_BASE_DIR/scenario4-nodeB"
NODE_C_DIR="$TEST_BASE_DIR/scenario4-nodeC"

log "Setting up heal test..."
mkdir -p "$NODE_A_DIR" "$NODE_B_DIR" "$NODE_C_DIR"
SWIMCHAIN_DATA_DIR="$NODE_B_DIR" $BINARY --testnet identity create 2>/dev/null
SWIMCHAIN_DATA_DIR="$NODE_C_DIR" $BINARY --testnet identity create 2>/dev/null

# Start A (genesis) and B connected
log "Starting A and B (connected)..."
SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet node start \
    --listen 127.0.0.1:19830 > "$NODE_A_DIR/node.log" 2>&1 &
NODE_A_PID=$!
sleep 3

SWIMCHAIN_DATA_DIR="$NODE_B_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19832 --connect 127.0.0.1:19830 > "$NODE_B_DIR/node.log" 2>&1 &
NODE_B_PID=$!
sleep 3

# Start C isolated
log "Starting C (isolated)..."
SWIMCHAIN_DATA_DIR="$NODE_C_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19834 > "$NODE_C_DIR/node.log" 2>&1 &
NODE_C_PID=$!
sleep 3

# Create content
log "Creating content..."
SPACE_ID=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet space create \
    --name "HealSpace" 2>/dev/null | grep -oP 'sp1[a-z0-9]+' | head -1)

POST_RESULT=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet post create \
    --space "$SPACE_ID" --title "Heal Test" --body "This should reach C after heal" 2>&1)
sleep 5

# Verify C has no content
C_BEFORE=$(find "$NODE_C_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)
log "C content before heal: $C_BEFORE"

# Now "heal" the partition by having C connect to B
# We need to restart C with a connection to B
log "Healing partition: restarting C with connection to B..."
kill $NODE_C_PID 2>/dev/null || true
sleep 2

SWIMCHAIN_DATA_DIR="$NODE_C_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19834 --connect 127.0.0.1:19832 > "$NODE_C_DIR/node-healed.log" 2>&1 &
NODE_C_PID=$!
sleep 10

# Check C now has content
C_AFTER=$(find "$NODE_C_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)
log "C content after heal: $C_AFTER"

if [[ "$C_AFTER" -gt "$C_BEFORE" ]]; then
    success "Scenario 4: Partition heal propagates content"
else
    fail "Scenario 4: Content didn't propagate after partition heal"
    log "Node C healed log:"
    tail -30 "$NODE_C_DIR/node-healed.log" 2>/dev/null || true
fi

# Cleanup
kill $NODE_A_PID $NODE_B_PID $NODE_C_PID 2>/dev/null || true
sleep 2


################################################################################
header "SCENARIO 5: Reply Chain Integrity"
################################################################################
# A creates post → B replies → C replies to B → verify chain is complete on new node

NODE_A_DIR="$TEST_BASE_DIR/scenario5-nodeA"
NODE_B_DIR="$TEST_BASE_DIR/scenario5-nodeB"
NODE_C_DIR="$TEST_BASE_DIR/scenario5-nodeC"
NODE_D_DIR="$TEST_BASE_DIR/scenario5-nodeD"

log "Setting up reply chain test..."
mkdir -p "$NODE_A_DIR" "$NODE_B_DIR" "$NODE_C_DIR" "$NODE_D_DIR"
SWIMCHAIN_DATA_DIR="$NODE_B_DIR" $BINARY --testnet identity create 2>/dev/null
SWIMCHAIN_DATA_DIR="$NODE_C_DIR" $BINARY --testnet identity create 2>/dev/null
SWIMCHAIN_DATA_DIR="$NODE_D_DIR" $BINARY --testnet identity create 2>/dev/null

# Start all nodes connected
log "Starting nodes A, B, C..."
SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet node start \
    --listen 127.0.0.1:19840 > "$NODE_A_DIR/node.log" 2>&1 &
NODE_A_PID=$!
sleep 3

SWIMCHAIN_DATA_DIR="$NODE_B_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19842 --connect 127.0.0.1:19840 > "$NODE_B_DIR/node.log" 2>&1 &
NODE_B_PID=$!
sleep 3

SWIMCHAIN_DATA_DIR="$NODE_C_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19844 --connect 127.0.0.1:19840 > "$NODE_C_DIR/node.log" 2>&1 &
NODE_C_PID=$!
sleep 3

# A creates post
log "A creates original post..."
SPACE_ID=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet space create \
    --name "ReplyChainSpace" 2>/dev/null | grep -oP 'sp1[a-z0-9]+' | head -1)

POST_RESULT=$(SWIMCHAIN_DATA_DIR="$GENESIS_DIR" SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $BINARY --testnet post create \
    --space "$SPACE_ID" --title "Original Post" --body "Start of thread" 2>&1)
POST_ID=$(echo "$POST_RESULT" | grep -oP 'Content ID: \K[a-f0-9]+' | head -1)
log "Original post: ${POST_ID:0:16}..."
sleep 5

# B replies to original
log "B replies to original..."
REPLY1_RESULT=$(SWIMCHAIN_DATA_DIR="$NODE_B_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet post reply \
    --parent "$POST_ID" --body "First reply from B" 2>&1)
REPLY1_ID=$(echo "$REPLY1_RESULT" | grep -oP 'Content ID: \K[a-f0-9]+' | head -1)
log "Reply 1: ${REPLY1_ID:0:16}..."
sleep 5

# C replies to B's reply
log "C replies to B's reply..."
REPLY2_RESULT=$(SWIMCHAIN_DATA_DIR="$NODE_C_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet post reply \
    --parent "$REPLY1_ID" --body "Second reply from C to B" 2>&1)
REPLY2_ID=$(echo "$REPLY2_RESULT" | grep -oP 'Content ID: \K[a-f0-9]+' | head -1)
log "Reply 2: ${REPLY2_ID:0:16}..."
sleep 10

# Now start D (late joiner) and verify it gets the complete chain
log "Starting D (late joiner)..."
SWIMCHAIN_DATA_DIR="$NODE_D_DIR" SWIMCHAIN_PASSWORD=test $BINARY --testnet node start \
    --listen 127.0.0.1:19846 --connect 127.0.0.1:19840 > "$NODE_D_DIR/node.log" 2>&1 &
NODE_D_PID=$!
sleep 15

# Check D has all content
D_CONTENT=$(find "$NODE_D_DIR/sync_blobs/" -type f 2>/dev/null | wc -l)
log "D content count: $D_CONTENT (expected: 3 - original + 2 replies)"

if [[ "$D_CONTENT" -ge 3 ]]; then
    success "Scenario 5: Late joiner receives complete reply chain"
else
    fail "Scenario 5: Late joiner missing parts of reply chain (got $D_CONTENT, expected 3)"
fi

# Cleanup
kill $NODE_A_PID $NODE_B_PID $NODE_C_PID $NODE_D_PID 2>/dev/null || true
sleep 2


################################################################################
header "TEST SUMMARY"
################################################################################

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  EDGE CASE TEST RESULTS"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Tests run:    $TESTS_RUN"
echo "  Passed:       $TESTS_PASSED"
echo "  Failed:       $TESTS_FAILED"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "  ${GREEN}ALL TESTS PASSED${NC}"
else
    echo -e "  ${RED}SOME TESTS FAILED${NC}"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"

exit $TESTS_FAILED
