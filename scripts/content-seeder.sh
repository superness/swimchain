#!/bin/bash
# Content Seeder Script
# Lazily explores and downloads content to help seed the network
#
# Run this on seed nodes to make them act as content mirrors

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default settings
DATA_DIR="${1:-/var/lib/swimchain}"  # data directory (or node name for local dev)
INTERVAL="${2:-60}"  # seconds between sweeps
CONTENT_LIMIT=50     # max content items to fetch per space per sweep
SPACE_LIMIT=20       # max spaces to check per sweep

# If first arg doesn't start with /, treat it as a node name (local dev mode)
if [[ ! "$DATA_DIR" == /* ]]; then
    NODE_NAME="$DATA_DIR"
    DATA_DIR="$PROJECT_ROOT/${NODE_NAME}-testnet"
fi

usage() {
    echo "Content Seeder - Download content to help seed the network"
    echo ""
    echo "Usage: $0 [data-dir|node-name] [interval-seconds]"
    echo ""
    echo "Arguments:"
    echo "  data-dir         Full path to node data dir (default: /var/lib/swimchain)"
    echo "  node-name        Or just a node name for local dev (e.g., genesis)"
    echo "  interval-seconds Seconds between content sweeps (default: 60)"
    echo ""
    echo "Examples:"
    echo "  $0                              # Production: /var/lib/swimchain, 60s"
    echo "  $0 /var/lib/swimchain 120       # Production: custom interval"
    echo "  $0 genesis 30                   # Local dev: genesis node, 30s"
    echo ""
    echo "This script will:"
    echo "  1. List all known spaces"
    echo "  2. For each space, list recent content"
    echo "  3. Request any content not already cached locally"
    echo "  4. Sleep and repeat"
}

# Check for help flag
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    usage
    exit 0
fi

# Verify node exists (check both paths since --testnet adds suffix)
if [ ! -d "$DATA_DIR" ] && [ ! -d "${DATA_DIR}-testnet" ]; then
    echo -e "${YELLOW}Warning: Data dir $DATA_DIR (or ${DATA_DIR}-testnet) doesn't exist${NC}"
    echo "Make sure the node is created first"
    exit 1
fi

# Get RPC connection info
# Handles both /path and /path-testnet (testnet mode appends -testnet)
get_rpc_info() {
    local rpc_file=""
    local cookie_file=""

    # Try the exact path first, then with -testnet suffix
    for dir in "$DATA_DIR" "${DATA_DIR}-testnet"; do
        if [ -f "$dir/.rpc_addr" ] && [ -f "$dir/.cookie" ]; then
            rpc_file="$dir/.rpc_addr"
            cookie_file="$dir/.cookie"
            break
        fi
    done

    if [ -z "$rpc_file" ] || [ -z "$cookie_file" ]; then
        echo ""
        return
    fi

    local rpc_addr=$(cat "$rpc_file")
    local cookie=$(cat "$cookie_file" | tr -d '\n')
    local auth=$(printf "%s" "__cookie__:$cookie" | base64 -w0)

    echo "$rpc_addr|$auth"
}

# Make RPC call
rpc_call() {
    local rpc_addr=$1
    local auth=$2
    local method=$3
    local params=$4

    curl -s -X POST "http://$rpc_addr/" \
        -H "Content-Type: application/json" \
        -H "Authorization: Basic $auth" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":$params,\"id\":1}" 2>/dev/null
}

# List all spaces
list_spaces() {
    local rpc_addr=$1
    local auth=$2

    rpc_call "$rpc_addr" "$auth" "list_spaces" "{\"limit\":$SPACE_LIMIT}"
}

# List content in a space
list_space_content() {
    local rpc_addr=$1
    local auth=$2
    local space_id=$3

    rpc_call "$rpc_addr" "$auth" "list_space_content" "{\"space_id\":\"$space_id\",\"limit\":$CONTENT_LIMIT}"
}

# Request content (triggers network fetch)
request_content() {
    local rpc_addr=$1
    local auth=$2
    local content_id=$3

    rpc_call "$rpc_addr" "$auth" "request_content" "{\"content_id\":\"$content_id\"}"
}

# Get content (check if we have it)
get_content() {
    local rpc_addr=$1
    local auth=$2
    local content_id=$3

    rpc_call "$rpc_addr" "$auth" "get_content" "{\"content_id\":\"$content_id\"}"
}

# Main seeding loop
seed_content() {
    local rpc_info=$(get_rpc_info)

    if [ -z "$rpc_info" ]; then
        echo -e "${YELLOW}Node not running or RPC not available${NC}"
        return 1
    fi

    local rpc_addr=$(echo "$rpc_info" | cut -d'|' -f1)
    local auth=$(echo "$rpc_info" | cut -d'|' -f2)

    echo -e "${BLUE}[$(date '+%H:%M:%S')] Starting content sweep...${NC}"

    # Get all spaces
    local spaces_json=$(list_spaces "$rpc_addr" "$auth")
    local spaces=$(echo "$spaces_json" | jq -r '.result.spaces[]?.id // empty' 2>/dev/null)

    if [ -z "$spaces" ]; then
        echo -e "  ${YELLOW}No spaces found${NC}"
        return 0
    fi

    local space_count=$(echo "$spaces" | wc -l)
    echo -e "  Found ${CYAN}$space_count${NC} spaces"

    local total_requested=0
    local total_cached=0

    # For each space, get content
    while IFS= read -r space_id; do
        [ -z "$space_id" ] && continue

        local content_json=$(list_space_content "$rpc_addr" "$auth" "$space_id")
        local content_ids=$(echo "$content_json" | jq -r '.result.content[]?.id // empty' 2>/dev/null)

        if [ -z "$content_ids" ]; then
            continue
        fi

        local space_name=$(echo "$content_json" | jq -r '.result.space_name // "unknown"' 2>/dev/null)
        local content_count=$(echo "$content_ids" | wc -l)

        # Request each content item
        while IFS= read -r content_id; do
            [ -z "$content_id" ] && continue

            # Try to get content - if it fails or returns null body, request it
            local existing=$(get_content "$rpc_addr" "$auth" "$content_id")
            local has_body=$(echo "$existing" | jq -r '.result.body // empty' 2>/dev/null)

            if [ -z "$has_body" ]; then
                # Request from network
                request_content "$rpc_addr" "$auth" "$content_id" >/dev/null
                total_requested=$((total_requested + 1))
            else
                total_cached=$((total_cached + 1))
            fi
        done <<< "$content_ids"

    done <<< "$spaces"

    echo -e "  ${GREEN}Requested: $total_requested${NC} | Already cached: $total_cached"
}

# Main loop
echo -e "${GREEN}Content Seeder Started${NC}"
echo -e "Node: ${CYAN}$NODE_NAME${NC}"
echo -e "Interval: ${CYAN}${INTERVAL}s${NC}"
echo -e "Data dir: ${CYAN}$DATA_DIR${NC}"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Trap for clean exit
trap 'echo -e "\n${YELLOW}Seeder stopped${NC}"; exit 0' INT TERM

# Run initial sweep immediately
seed_content

# Then loop
while true; do
    sleep "$INTERVAL"
    seed_content
done
