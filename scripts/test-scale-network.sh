#!/bin/bash
# Large-Scale Network Test Script
# Tests 25, 50, or 100 node networks for content propagation
#
# Usage:
#   ./scripts/test-scale-network.sh 25      # 25-node chain
#   ./scripts/test-scale-network.sh 50 mesh # 50-node mesh
#   ./scripts/test-scale-network.sh 100     # 100-node chain (default)

# Don't exit on first error during verification phase
# set -e is used only for setup

# Configuration
export SWIMCHAIN_PASSWORD="testpass123"
export RUST_LOG="swimchain=warn"  # Reduced logging for large networks
SW_BIN="./target/release/sw"
BASE_PORT=30000
NODE_COUNT=${1:-25}
TOPOLOGY=${2:-chain}  # chain, mesh, or ring

# Timing - scales with network size
if [ "$TOPOLOGY" = "chain" ]; then
    # Chain: content must traverse N-1 hops, 5s per hop
    PROPAGATION_TIME=$((5 + (NODE_COUNT - 1) * 5))
else
    # Mesh/Ring: content reaches all in 1-2 hops
    PROPAGATION_TIME=$((15 + NODE_COUNT / 10))
fi
NODE_STARTUP=2
BATCH_SIZE=20  # Start nodes in batches

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Track PIDs for cleanup
declare -a NODE_PIDS

cleanup() {
    echo ""
    echo -e "${YELLOW}=== Cleaning up $NODE_COUNT nodes ===${NC}"
    for pid in "${NODE_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    pkill -f "sw --regtest node" 2>/dev/null || true
    sleep 2
    echo -e "${GREEN}Cleanup complete${NC}"
}
trap cleanup EXIT

# Verify binary exists
if [ ! -f "$SW_BIN" ]; then
    echo -e "${RED}Error: $SW_BIN not found. Run 'cargo build --release' first.${NC}"
    exit 1
fi

# Exit on error for setup phase
set -e

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         SWIMCHAIN LARGE-SCALE NETWORK TEST                 ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Nodes: ${NODE_COUNT}                                                 ║${NC}"
echo -e "${CYAN}║  Topology: ${TOPOLOGY}                                           ║${NC}"
echo -e "${CYAN}║  Propagation estimate: ${PROPAGATION_TIME}s                              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

#==============================================================================
# PHASE 1: Setup identities
#==============================================================================
echo -e "${YELLOW}=== Phase 1: Creating $NODE_COUNT identities ===${NC}"

for i in $(seq 1 $NODE_COUNT); do
    DATA_DIR="./scale-test-node-${i}"
    export SWIMCHAIN_DATA_DIR="$DATA_DIR"

    # Remove old data
    rm -rf "${DATA_DIR}-regtest" 2>/dev/null || true

    # Create identity (in parallel batches)
    if [ ! -f "${DATA_DIR}-regtest/identity.enc" ]; then
        $SW_BIN --regtest identity create > /dev/null 2>&1 &
    fi

    # Wait after each batch
    if [ $((i % BATCH_SIZE)) -eq 0 ]; then
        wait
        echo "  Created identities 1-$i"
    fi
done
wait
echo -e "${GREEN}✓ All $NODE_COUNT identities created${NC}"

#==============================================================================
# PHASE 2: Start nodes
#==============================================================================
echo ""
echo -e "${YELLOW}=== Phase 2: Starting $NODE_COUNT nodes (${TOPOLOGY} topology) ===${NC}"

start_node() {
    local idx=$1
    local port=$((BASE_PORT + idx))
    local data_dir="./scale-test-node-${idx}"
    local log_file="./scale-test-node-${idx}.log"
    export SWIMCHAIN_DATA_DIR="$data_dir"

    # Build connection list based on topology
    local connect_args=""

    if [ "$TOPOLOGY" = "chain" ]; then
        # Chain: each node connects to previous
        if [ $idx -gt 1 ]; then
            local prev_port=$((BASE_PORT + idx - 1))
            connect_args="--connect 127.0.0.1:${prev_port}"
        fi
    elif [ "$TOPOLOGY" = "ring" ]; then
        # Ring: chain + last connects to first
        if [ $idx -gt 1 ]; then
            local prev_port=$((BASE_PORT + idx - 1))
            connect_args="--connect 127.0.0.1:${prev_port}"
        fi
        if [ $idx -eq $NODE_COUNT ]; then
            connect_args="$connect_args --connect 127.0.0.1:${BASE_PORT}1"
        fi
    elif [ "$TOPOLOGY" = "mesh" ]; then
        # Mesh: connect to up to 5 random earlier nodes
        local max_connections=5
        if [ $idx -gt 1 ]; then
            for j in $(seq 1 $((idx < max_connections ? idx - 1 : max_connections))); do
                local target=$((RANDOM % (idx - 1) + 1))
                local target_port=$((BASE_PORT + target))
                connect_args="$connect_args --connect 127.0.0.1:${target_port}"
            done
        fi
    fi

    # Start node
    $SW_BIN --regtest node start --listen "127.0.0.1:${port}" $connect_args > "$log_file" 2>&1 &
    NODE_PIDS+=($!)
}

# Start nodes in batches
for i in $(seq 1 $NODE_COUNT); do
    start_node $i

    # Brief pause between nodes
    sleep 0.1

    # Wait after each batch
    if [ $((i % BATCH_SIZE)) -eq 0 ]; then
        sleep $NODE_STARTUP
        echo "  Started nodes 1-$i"
    fi
done

# Wait for all nodes to stabilize
sleep $NODE_STARTUP
echo -e "${GREEN}✓ All $NODE_COUNT nodes started${NC}"

# Verify nodes are running
running=$(pgrep -c -f "sw --regtest node" || echo "0")
echo "  Running processes: $running"

if [ "$running" -lt "$NODE_COUNT" ]; then
    echo -e "${YELLOW}Warning: Only $running of $NODE_COUNT nodes running${NC}"
fi

#==============================================================================
# PHASE 3: Create content on node 1
#==============================================================================
echo ""
echo -e "${YELLOW}=== Phase 3: Creating content on node 1 ===${NC}"

export SWIMCHAIN_DATA_DIR="./scale-test-node-1"

# Create a space
SPACE_OUTPUT=$($SW_BIN --regtest space create --name "Scale Test Space" 2>&1)
SPACE_ID=$(echo "$SPACE_OUTPUT" | grep -oE 'sp1[a-z0-9]+' | head -1)

if [ -z "$SPACE_ID" ]; then
    echo -e "${RED}Failed to create space${NC}"
    echo "$SPACE_OUTPUT"
    exit 1
fi
echo "  Space ID: $SPACE_ID"

# Create a post
POST_OUTPUT=$($SW_BIN --regtest post create --space "$SPACE_ID" --title "Scale Test Post" --body "Testing propagation across $NODE_COUNT nodes" 2>&1)
CONTENT_ID=$(echo "$POST_OUTPUT" | grep -oE 'sha256:[a-f0-9]+' | head -1)

if [ -z "$CONTENT_ID" ]; then
    echo -e "${RED}Failed to create post${NC}"
    echo "$POST_OUTPUT"
    exit 1
fi
echo "  Content ID: $CONTENT_ID"
echo -e "${GREEN}✓ Content created${NC}"

#==============================================================================
# PHASE 4: Wait for propagation
#==============================================================================
echo ""
echo -e "${YELLOW}=== Phase 4: Waiting ${PROPAGATION_TIME}s for propagation ===${NC}"

# Show progress
for i in $(seq 1 $PROPAGATION_TIME); do
    printf "\r  Progress: [%-50s] %d/%ds" $(printf '#%.0s' $(seq 1 $((i * 50 / PROPAGATION_TIME)))) $i $PROPAGATION_TIME
    sleep 1
done
echo ""
echo -e "${GREEN}✓ Propagation wait complete${NC}"

#==============================================================================
# PHASE 5: Verify content on sample nodes
#==============================================================================
# Disable exit-on-error for verification - we want to check all nodes even if some fail
set +e

echo ""
echo -e "${YELLOW}=== Phase 5: Verifying content propagation ===${NC}"

# Sample nodes to check: first, last, middle, random
if [ $NODE_COUNT -le 10 ]; then
    # Check all nodes for small networks
    SAMPLE_NODES=$(seq 1 $NODE_COUNT)
else
    # Check strategic sample for large networks
    SAMPLE_NODES="1 2 $((NODE_COUNT / 4)) $((NODE_COUNT / 2)) $((NODE_COUNT * 3 / 4)) $((NODE_COUNT - 1)) $NODE_COUNT"
fi

SUCCESS_COUNT=0
FAIL_COUNT=0

for node_idx in $SAMPLE_NODES; do
    export SWIMCHAIN_DATA_DIR="./scale-test-node-${node_idx}"

    # Try to view the content
    VIEW_OUTPUT=$($SW_BIN --regtest post view "$CONTENT_ID" 2>&1 || true)

    if echo "$VIEW_OUTPUT" | grep -q "Scale Test Post"; then
        echo -e "  Node $node_idx: ${GREEN}✓${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "  Node $node_idx: ${RED}✗${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

#==============================================================================
# PHASE 6: Results
#==============================================================================
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                     TEST RESULTS                           ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Nodes tested: ${SUCCESS_COUNT} passed, ${FAIL_COUNT} failed                          ║${NC}"
echo -e "${CYAN}║  Topology: ${TOPOLOGY}                                           ║${NC}"

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${CYAN}║  Status: ${GREEN}ALL SAMPLED NODES RECEIVED CONTENT${NC}              ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}=== TEST PASSED ===${NC}"
    exit 0
else
    echo -e "${CYAN}║  Status: ${RED}SOME NODES MISSING CONTENT${NC}                      ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}=== TEST FAILED ===${NC}"

    # Debug: show logs from failing nodes
    echo ""
    echo "Logs from last failing node:"
    if [ -f "./scale-test-node-${NODE_COUNT}.log" ]; then
        tail -20 "./scale-test-node-${NODE_COUNT}.log"
    fi
    exit 1
fi
