#!/bin/bash
# Network Status Dashboard
# Shows status of all nodes: height, peers, mempool, sync state

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SEED_SF="64.225.115.108"
SEED_NYC="104.236.106.124"
LOCAL_RPC_BASE_PORT=19800
PASSWORD="${SWIMCHAIN_PASSWORD:-testpass}"

# Find local testnet directories
LOCAL_DIRS=$(ls -d *-testnet 2>/dev/null | head -20)

echo "============================================================"
echo "           SWIMCHAIN NETWORK STATUS"
echo "============================================================"
echo ""

printf "%-20s %-8s %-8s %-10s %-12s %-10s\n" "NODE" "HEIGHT" "PEERS" "MEMPOOL" "SYNC STATE" "STATUS"
printf "%-20s %-8s %-8s %-10s %-12s %-10s\n" "----" "------" "-----" "-------" "----------" "------"

# Function to query node status via RPC
query_node() {
    local name=$1
    local host=$2
    local port=$3
    local data_dir=$4
    local is_remote=$5

    if [[ "$is_remote" == "true" ]]; then
        # Remote node - use SSH
        result=$(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "root@$host" \
            "SWIMCHAIN_PASSWORD='testpass123' /usr/local/bin/sw --testnet --data-dir /var/lib/swimchain sync status --json 2>/dev/null" 2>/dev/null) || result=""
    else
        # Local node - use sw command directly
        result=$(SWIMCHAIN_PASSWORD="$PASSWORD" ./target/release/sw --testnet --data-dir="$data_dir" sync status --json 2>/dev/null) || result=""
    fi

    if [[ -z "$result" ]]; then
        printf "%-20s %-8s %-8s %-10s %-12s ${RED}%-10s${NC}\n" "$name" "-" "-" "-" "-" "OFFLINE"
        return
    fi

    # Parse JSON (simple grep-based parsing)
    height=$(echo "$result" | grep -o '"chain_height":[0-9]*' | cut -d: -f2 || echo "0")
    peers=$(echo "$result" | grep -o '"connected_peers":[0-9]*' | cut -d: -f2 || echo "0")
    syncing=$(echo "$result" | grep -o '"syncing":[a-z]*' | cut -d: -f2 || echo "false")

    # Get mempool info if available
    mempool=$(echo "$result" | grep -o '"pending_actions":[0-9]*' | cut -d: -f2 || echo "?")

    if [[ "$syncing" == "true" ]]; then
        sync_state="syncing"
        status_color=$YELLOW
    else
        sync_state="synced"
        status_color=$GREEN
    fi

    printf "%-20s %-8s %-8s %-10s %-12s ${status_color}%-10s${NC}\n" \
        "$name" "$height" "$peers" "$mempool" "$sync_state" "ONLINE"
}

# Query seed nodes
echo ""
echo "SEED NODES:"
query_node "SF Seed" "$SEED_SF" "" "" "true"
query_node "NYC Seed" "$SEED_NYC" "" "" "true"

# Query local nodes
if [[ -n "$LOCAL_DIRS" ]]; then
    echo ""
    echo "LOCAL NODES:"
    for dir in $LOCAL_DIRS; do
        name=$(basename "$dir" | sed 's/-testnet//')
        query_node "$name" "localhost" "" "$dir" "false"
    done
fi

echo ""
echo "============================================================"

# Summary
echo ""
echo "Quick Commands:"
echo "  Watch logs:     ssh root@$SEED_SF 'journalctl -u swimchain -f'"
echo "  Check mempool:  SWIMCHAIN_PASSWORD=testpass ./target/release/sw --testnet --data-dir=genesis-testnet rpc mempool"
echo ""
