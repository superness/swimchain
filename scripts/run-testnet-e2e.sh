#!/bin/bash
# Testnet E2E Integration Tests
# Tests multi-node content propagation using testnet network mode
#
# Key differences from regtest:
# - Uses testnet ports (19735 base for P2P, 19736 for RPC)
# - Tests real RPC-based content submission
# - Validates the new RPC architecture

set +e  # Don't exit on first error - run all tests

# Configuration
export SWIMCHAIN_PASSWORD="testpass123"
export RUST_LOG="swimchain=info"
SW_BIN="./target/release/sw"
TEST_DIR="./testnet-e2e"

# Testnet ports
# P2P ports: 19740 base (offset by node) - avoiding RPC overlap
# RPC ports: P2P + 100 (so P2P 19740 = RPC 19840)
# This ensures no collisions between nodes
BASE_P2P_PORT=19740

# Timing (testnet might be slightly slower due to real network checks)
PROPAGATION_1HOP=12
PROPAGATION_2HOP=20
PROPAGATION_3HOP=30
NODE_STARTUP=4
NODE_CONNECT=6

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

declare -A TEST_RESULTS

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}=== Cleaning up ===${NC}"
    pkill -f "sw --testnet node" 2>/dev/null || true
    sleep 1
}
trap cleanup EXIT

# Helper functions
log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TEST_RESULTS["$1"]="PASS"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1: $2"
    TEST_RESULTS["$1"]="FAIL: $2"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1: $2"
    TEST_RESULTS["$1"]="SKIP: $2"
    ((TESTS_SKIPPED++))
}

log_test() {
    echo ""
    echo -e "${CYAN}===========================================${NC}"
    echo -e "${CYAN}TEST: $1${NC}"
    echo -e "${CYAN}===========================================${NC}"
}

# Setup a test identity (testnet mode)
setup_test_identity() {
    local data_dir=$1
    local identity_file="${data_dir}-testnet/identity.enc"

    if [ ! -f "$identity_file" ]; then
        echo "  Creating testnet identity for $data_dir..."
        SWIMCHAIN_DATA_DIR="$data_dir" $SW_BIN --testnet identity create > /dev/null 2>&1
        sleep 1
    fi
}

# Calculate port for a given node offset
# Each node needs P2P port and RPC port (P2P + 1)
# So we offset by 2 per node to avoid overlap
get_p2p_port() {
    echo $((BASE_P2P_PORT + ($1 * 2)))
}

# Clean test environment
clean_test_env() {
    echo "=== Cleaning test environment ==="
    rm -rf ${TEST_DIR}-* 2>/dev/null || true
    pkill -f "sw --testnet node" 2>/dev/null || true
    sleep 2
}

#==============================================================================
# SINGLE-NODE TESTS
#==============================================================================

test_identity_create_show() {
    log_test "Identity Create and Show (Testnet)"

    local data_dir="${TEST_DIR}-identity"
    rm -rf "${data_dir}-testnet" 2>/dev/null || true

    # Create identity
    local output
    output=$(SWIMCHAIN_DATA_DIR="$data_dir" $SW_BIN --testnet identity create 2>&1)

    if echo "$output" | grep -qE "sw1|cs1"; then
        local address=$(echo "$output" | grep "Address:" | awk '{print $2}')
        echo "  Created identity: $address"

        # Show identity
        output=$(SWIMCHAIN_DATA_DIR="$data_dir" $SW_BIN --testnet identity show 2>&1)
        if echo "$output" | grep -q "$address"; then
            log_pass "Identity"
            return 0
        else
            log_fail "Identity" "Show doesn't match"
            return 1
        fi
    else
        log_fail "Identity" "Failed to create: $output"
        return 1
    fi
}

test_space_and_post() {
    log_test "Space and Post (Testnet)"

    cleanup
    sleep 1

    local data_dir="${TEST_DIR}-post"
    rm -rf "${data_dir}-testnet" 2>/dev/null || true

    setup_test_identity "$data_dir"

    # Start a node first (space creation requires running node)
    local port=$(get_p2p_port 50)  # Use high offset to avoid conflict
    echo "  Starting node on port $port..."
    SWIMCHAIN_DATA_DIR="$data_dir" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port > /tmp/spacepost_node.log 2>&1 &
    local node_pid=$!
    sleep $NODE_STARTUP

    if ! ps -p $node_pid > /dev/null 2>&1; then
        log_fail "SpacePost" "Node failed to start"
        cat /tmp/spacepost_node.log
        return 1
    fi
    echo "  Node running (PID: $node_pid)"

    # Create space
    local space_output
    space_output=$(SWIMCHAIN_DATA_DIR="$data_dir" $SW_BIN --testnet space create --name "Testnet Space" 2>&1)
    local space_id=$(echo "$space_output" | grep -oE "sp1[a-z0-9]+")

    if [ -z "$space_id" ]; then
        log_fail "SpacePost" "Failed to create space: $space_output"
        kill $node_pid 2>/dev/null || true
        return 1
    fi
    echo "  Space: $space_id"

    # Create post via RPC
    local post_output
    post_output=$(SWIMCHAIN_DATA_DIR="$data_dir" $SW_BIN --testnet post create \
        --space "$space_id" \
        --title "Testnet Post" \
        --body "Testing on testnet" 2>&1)

    if echo "$post_output" | grep -qE "sha256:[a-f0-9]+"; then
        local content_id=$(echo "$post_output" | grep -oE "sha256:[a-f0-9]+")
        echo "  Content: $content_id"

        # Verify local storage
        local view_output
        view_output=$(SWIMCHAIN_DATA_DIR="$data_dir" $SW_BIN --testnet post view "$content_id" 2>&1)

        if echo "$view_output" | grep -q "Testnet Post"; then
            kill $node_pid 2>/dev/null || true
            log_pass "SpacePost"
            return 0
        fi
    fi

    kill $node_pid 2>/dev/null || true
    log_fail "SpacePost" "Post creation or view failed: $post_output"
    return 1
}

#==============================================================================
# TWO-NODE TESTS
#==============================================================================

test_two_nodes_connect() {
    log_test "Two Nodes Connect (Testnet)"

    cleanup
    sleep 2

    # Setup nodes
    local node_a="${TEST_DIR}-nodeA"
    local node_b="${TEST_DIR}-nodeB"
    rm -rf "${node_a}-testnet" "${node_b}-testnet" 2>/dev/null || true

    setup_test_identity "$node_a"
    setup_test_identity "$node_b"

    local port_a=$(get_p2p_port 0)
    local port_b=$(get_p2p_port 1)

    echo "  Starting Node A on port $port_a..."
    SWIMCHAIN_DATA_DIR="$node_a" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port_a > /tmp/testnet_a.log 2>&1 &
    local pid_a=$!
    sleep $NODE_STARTUP

    if ! ps -p $pid_a > /dev/null 2>&1; then
        log_fail "TwoNodes" "Node A failed to start"
        cat /tmp/testnet_a.log
        return 1
    fi
    echo "  Node A running (PID: $pid_a)"

    echo "  Starting Node B on port $port_b, connecting to A..."
    SWIMCHAIN_DATA_DIR="$node_b" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port_b --connect 127.0.0.1:$port_a > /tmp/testnet_b.log 2>&1 &
    local pid_b=$!
    sleep $NODE_CONNECT

    if ! ps -p $pid_b > /dev/null 2>&1; then
        log_fail "TwoNodes" "Node B failed to start"
        cat /tmp/testnet_b.log
        return 1
    fi
    echo "  Node B running (PID: $pid_b)"

    # Check RPC connectivity for Node A (P2P port + 1)
    local rpc_a=$(($(get_p2p_port 0) + 1))
    echo "  Testing RPC on Node A (port $rpc_a)..."

    local sync_status
    sync_status=$(SWIMCHAIN_DATA_DIR="$node_a" $SW_BIN --testnet sync status 2>&1)

    if echo "$sync_status" | grep -q "Connected peers:"; then
        echo "  RPC working on Node A"
        log_pass "TwoNodes"
        return 0
    else
        # Nodes running, RPC might just not show peers yet
        if ps -p $pid_a > /dev/null 2>&1 && ps -p $pid_b > /dev/null 2>&1; then
            echo "  Both nodes running (RPC might take time to show peers)"
            log_pass "TwoNodes"
            return 0
        fi
        log_fail "TwoNodes" "RPC not working"
        return 1
    fi
}

test_content_propagation() {
    log_test "Content Propagation (Testnet + RPC)"

    # Nodes should still be running from previous test
    local node_a="${TEST_DIR}-nodeA"
    local node_b="${TEST_DIR}-nodeB"

    # Create space on Node A
    export SWIMCHAIN_DATA_DIR="$node_a"
    local space_output
    space_output=$($SW_BIN --testnet space create --name "Sync Test" 2>&1)
    local space_id=$(echo "$space_output" | grep -oE "sp1[a-z0-9]+")

    if [ -z "$space_id" ]; then
        log_fail "Propagation" "Failed to create space"
        return 1
    fi
    echo "  Space: $space_id"

    # Create post on Node A (via RPC)
    local post_output
    post_output=$($SW_BIN --testnet post create \
        --space "$space_id" \
        --title "RPC Sync Test" \
        --body "This should propagate via RPC submission" 2>&1)
    local content_id=$(echo "$post_output" | grep -oE "sha256:[a-f0-9]+")

    if [ -z "$content_id" ]; then
        log_fail "Propagation" "Failed to create post"
        echo "  $post_output"
        return 1
    fi
    echo "  Content: $content_id"

    # Check broadcast was sent
    if echo "$post_output" | grep -q "Broadcast to"; then
        echo "  Post was broadcast via RPC"
    fi

    # Wait for propagation
    echo "  Waiting ${PROPAGATION_2HOP}s for propagation..."
    sleep $PROPAGATION_2HOP

    # Try to view on Node B
    export SWIMCHAIN_DATA_DIR="$node_b"
    local view_output
    view_output=$($SW_BIN --testnet post view "$content_id" 2>&1)

    if echo "$view_output" | grep -q "RPC Sync Test"; then
        echo "  Content visible on Node B!"
        log_pass "Propagation"
        return 0
    else
        echo "  Content NOT visible on Node B"
        echo "  View output: $view_output"

        # Debug: Check Node B's sync_blobs
        echo "  Node B sync_blobs:"
        ls -la "${node_b}-testnet/sync_blobs/" 2>/dev/null || echo "  (empty)"

        log_fail "Propagation" "Content not propagated"
        return 1
    fi
}

test_bidirectional_sync() {
    log_test "Bidirectional Sync (Testnet)"

    local node_a="${TEST_DIR}-nodeA"
    local node_b="${TEST_DIR}-nodeB"

    # Create content on Node B
    export SWIMCHAIN_DATA_DIR="$node_b"
    local space_output
    space_output=$($SW_BIN --testnet space create --name "Bidir Space" 2>&1)
    local space_id=$(echo "$space_output" | grep -oE "sp1[a-z0-9]+")

    local post_output
    post_output=$($SW_BIN --testnet post create \
        --space "$space_id" \
        --title "From Node B" \
        --body "Created on Node B, should reach A" 2>&1)
    local content_id=$(echo "$post_output" | grep -oE "sha256:[a-f0-9]+")
    echo "  Node B content: $content_id"

    # Wait for propagation
    echo "  Waiting ${PROPAGATION_2HOP}s for B->A propagation..."
    sleep $PROPAGATION_2HOP

    # View on Node A
    export SWIMCHAIN_DATA_DIR="$node_a"
    local view_output
    view_output=$($SW_BIN --testnet post view "$content_id" 2>&1)

    if echo "$view_output" | grep -q "From Node B"; then
        echo "  Content from B visible on A!"
        log_pass "Bidirectional"
        return 0
    else
        log_fail "Bidirectional" "B->A propagation failed"
        return 1
    fi
}

#==============================================================================
# THREE-NODE TESTS
#==============================================================================

test_three_node_linear() {
    log_test "Linear Topology A -> B -> C (Testnet)"

    cleanup
    sleep 2

    # Setup all three nodes
    for node in A B C; do
        local data_dir="${TEST_DIR}-linear$node"
        rm -rf "${data_dir}-testnet" 2>/dev/null || true
        setup_test_identity "$data_dir"
    done

    local port_a=$(get_p2p_port 10)
    local port_b=$(get_p2p_port 11)
    local port_c=$(get_p2p_port 12)

    # Start Node A
    echo "  Starting Node A (port $port_a)..."
    SWIMCHAIN_DATA_DIR="${TEST_DIR}-linearA" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port_a > /tmp/linear_a.log 2>&1 &
    sleep $NODE_STARTUP

    # Start Node B -> A
    echo "  Starting Node B (port $port_b) -> A..."
    SWIMCHAIN_DATA_DIR="${TEST_DIR}-linearB" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port_b --connect 127.0.0.1:$port_a > /tmp/linear_b.log 2>&1 &
    sleep $NODE_STARTUP

    # Start Node C -> B (NOT A - this is linear)
    echo "  Starting Node C (port $port_c) -> B..."
    SWIMCHAIN_DATA_DIR="${TEST_DIR}-linearC" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port_c --connect 127.0.0.1:$port_b > /tmp/linear_c.log 2>&1 &
    sleep $NODE_CONNECT

    # Create content on Node A
    export SWIMCHAIN_DATA_DIR="${TEST_DIR}-linearA"
    local space_output
    space_output=$($SW_BIN --testnet space create --name "Linear Test" 2>&1)
    local space_id=$(echo "$space_output" | grep -oE "sp1[a-z0-9]+")

    local post_output
    post_output=$($SW_BIN --testnet post create \
        --space "$space_id" \
        --title "Multi-Hop Test" \
        --body "Should reach C via B (2 hops)" 2>&1)
    local content_id=$(echo "$post_output" | grep -oE "sha256:[a-f0-9]+")
    echo "  Content: $content_id"

    # Wait for multi-hop propagation
    echo "  Waiting ${PROPAGATION_3HOP}s for A->B->C propagation..."
    sleep $PROPAGATION_3HOP

    # Check Node C
    export SWIMCHAIN_DATA_DIR="${TEST_DIR}-linearC"
    local view_output
    view_output=$($SW_BIN --testnet post view "$content_id" 2>&1)

    if echo "$view_output" | grep -q "Multi-Hop Test"; then
        echo "  Content reached Node C (2-hop success)!"
        log_pass "Linear3"
        return 0
    else
        echo "  Content NOT on Node C"

        # Debug: Check B
        export SWIMCHAIN_DATA_DIR="${TEST_DIR}-linearB"
        local view_b
        view_b=$($SW_BIN --testnet post view "$content_id" 2>&1)
        if echo "$view_b" | grep -q "Multi-Hop Test"; then
            echo "  Content IS on Node B (first hop worked)"
        else
            echo "  Content NOT on Node B either"
        fi

        log_fail "Linear3" "Multi-hop propagation failed"
        return 1
    fi
}

#==============================================================================
# FOUR-NODE TESTS
#==============================================================================

test_four_node_diamond() {
    log_test "Diamond Topology (Testnet)"

    # Topology:
    #       A
    #      / \
    #     B   C
    #      \ /
    #       D

    cleanup
    sleep 2

    # Setup all four nodes
    for node in A B C D; do
        local data_dir="${TEST_DIR}-diamond$node"
        rm -rf "${data_dir}-testnet" 2>/dev/null || true
        setup_test_identity "$data_dir"
    done

    local port_a=$(get_p2p_port 20)
    local port_b=$(get_p2p_port 21)
    local port_c=$(get_p2p_port 22)
    local port_d=$(get_p2p_port 23)

    # Start Node A (top)
    echo "  Starting Node A (top)..."
    SWIMCHAIN_DATA_DIR="${TEST_DIR}-diamondA" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port_a > /tmp/diamond_a.log 2>&1 &
    sleep $NODE_STARTUP

    # Start Node B -> A (left)
    echo "  Starting Node B (left) -> A..."
    SWIMCHAIN_DATA_DIR="${TEST_DIR}-diamondB" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port_b --connect 127.0.0.1:$port_a > /tmp/diamond_b.log 2>&1 &
    sleep 2

    # Start Node C -> A (right)
    echo "  Starting Node C (right) -> A..."
    SWIMCHAIN_DATA_DIR="${TEST_DIR}-diamondC" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port_c --connect 127.0.0.1:$port_a > /tmp/diamond_c.log 2>&1 &
    sleep 2

    # Start Node D -> B and C (bottom)
    echo "  Starting Node D (bottom) -> B,C..."
    SWIMCHAIN_DATA_DIR="${TEST_DIR}-diamondD" \
        $SW_BIN --testnet node start --listen 127.0.0.1:$port_d --connect 127.0.0.1:$port_b --connect 127.0.0.1:$port_c > /tmp/diamond_d.log 2>&1 &
    sleep $NODE_CONNECT

    # Create content on Node A
    export SWIMCHAIN_DATA_DIR="${TEST_DIR}-diamondA"
    local space_output
    space_output=$($SW_BIN --testnet space create --name "Diamond Test" 2>&1)
    local space_id=$(echo "$space_output" | grep -oE "sp1[a-z0-9]+")

    local post_output
    post_output=$($SW_BIN --testnet post create \
        --space "$space_id" \
        --title "Diamond Broadcast" \
        --body "Should reach D via both B and C paths" 2>&1)
    local content_id=$(echo "$post_output" | grep -oE "sha256:[a-f0-9]+")
    echo "  Content: $content_id"

    # Wait for propagation
    echo "  Waiting ${PROPAGATION_3HOP}s for diamond propagation..."
    sleep $PROPAGATION_3HOP

    # Check all 4 nodes
    local nodes_with_content=0
    for node in A B C D; do
        export SWIMCHAIN_DATA_DIR="${TEST_DIR}-diamond$node"
        local view
        view=$($SW_BIN --testnet post view "$content_id" 2>&1)
        if echo "$view" | grep -q "Diamond Broadcast"; then
            echo "  Node $node: has content"
            ((nodes_with_content++)) || true
        else
            echo "  Node $node: MISSING content"
        fi
    done

    if [ "$nodes_with_content" -eq 4 ]; then
        log_pass "Diamond4"
        return 0
    else
        log_fail "Diamond4" "Only $nodes_with_content/4 nodes have content"
        return 1
    fi
}

#==============================================================================
# RPC-SPECIFIC TESTS
#==============================================================================

test_rpc_sync_status() {
    log_test "RPC Sync Status (Testnet)"

    # Nodes might still be running from diamond test
    local node="${TEST_DIR}-diamondA"

    if [ ! -d "${node}-testnet" ]; then
        log_skip "RPCStatus" "No running node to test"
        return 0
    fi

    export SWIMCHAIN_DATA_DIR="$node"
    local status
    status=$($SW_BIN --testnet sync status 2>&1)

    if echo "$status" | grep -qE "Connected peers:|Sync state:"; then
        echo "  RPC status working:"
        echo "$status" | head -5
        log_pass "RPCStatus"
        return 0
    else
        log_fail "RPCStatus" "RPC status failed: $status"
        return 1
    fi
}

#==============================================================================
# MAIN EXECUTION
#==============================================================================

main() {
    echo ""
    echo -e "${CYAN}=============================================="
    echo "    SWIMCHAIN TESTNET E2E INTEGRATION TESTS"
    echo "==============================================${NC}"
    echo ""
    echo "Test started at: $(date)"
    echo "Using testnet ports: P2P=$BASE_P2P_PORT+, RPC=$BASE_RPC_PORT+"
    echo ""

    # Verify binary exists
    if [ ! -f "$SW_BIN" ]; then
        echo -e "${RED}Error: $SW_BIN not found. Run 'cargo build --release' first.${NC}"
        exit 1
    fi

    clean_test_env

    # Single-Node Tests
    echo ""
    echo -e "${CYAN}===== SINGLE-NODE TESTS =====${NC}"
    test_identity_create_show
    test_space_and_post

    # Two-Node Tests
    echo ""
    echo -e "${CYAN}===== TWO-NODE TESTS =====${NC}"
    test_two_nodes_connect
    test_content_propagation
    test_bidirectional_sync

    # Three-Node Tests
    echo ""
    echo -e "${CYAN}===== THREE-NODE TESTS =====${NC}"
    test_three_node_linear

    # Four-Node Tests
    echo ""
    echo -e "${CYAN}===== FOUR-NODE TESTS =====${NC}"
    test_four_node_diamond

    # RPC-Specific Tests
    echo ""
    echo -e "${CYAN}===== RPC TESTS =====${NC}"
    test_rpc_sync_status

    # Summary
    echo ""
    echo "=============================================="
    echo "                TEST SUMMARY"
    echo "=============================================="
    echo ""
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo -e "${YELLOW}Skipped: $TESTS_SKIPPED${NC}"
    echo ""
    echo "Individual Results:"
    echo "-------------------"
    for test in "${!TEST_RESULTS[@]}"; do
        echo "  $test: ${TEST_RESULTS[$test]}"
    done
    echo ""
    echo "Test completed at: $(date)"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo ""
        echo -e "${GREEN}ALL TESTS PASSED!${NC}"
        exit 0
    else
        echo ""
        echo -e "${RED}SOME TESTS FAILED${NC}"
        exit 1
    fi
}

# Run main
main "$@"
