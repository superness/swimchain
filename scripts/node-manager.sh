#!/bin/bash
# Swimchain Node Manager
# Manage multiple local node instances for testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SW_BIN="$PROJECT_ROOT/target/release/sw"
NETWORK="--testnet"  # Change to --regtest for local-only testing

# Default password for testnet nodes (set via environment or use default)
# For production, always prompt interactively
export SWIMCHAIN_PASSWORD="${SWIMCHAIN_PASSWORD:-testpass123}"

################################################################################
# GENESIS IDENTITY - HARDCODED TO PREVENT LOSS
# This is the official genesis identity for testnet. DO NOT CHANGE.
# The public key is in src/sponsorship/genesis_list.rs as a hardcoded sponsor.
################################################################################
GENESIS_SEED="11b0b8c92806d893c77b547b87ad5763cb1005104ba13086e0bf184e3a277471"
GENESIS_PUBKEY="9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420"
GENESIS_ADDRESS="cs1qz0vjesa82t4452pe2jal8c5k0zxeae92z08lgzycxwjdlnkh5zzqed2kj7"
GENESIS_PASSWORD="testpass123"
################################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default nodes
DEFAULT_NODES=("genesis" "alpha" "beta" "gamma")

# Action log file - tracks all created actions for verification
ACTION_LOG="$PROJECT_ROOT/action-log.jsonl"

# Log an action to the action log
log_action() {
    local action_type=$1
    local node=$2
    local content_id=$3
    local space_id=$4
    local timestamp=$(date +%s)
    echo "{\"type\":\"$action_type\",\"node\":\"$node\",\"content_id\":\"$content_id\",\"space_id\":\"$space_id\",\"timestamp\":$timestamp}" >> "$ACTION_LOG"
}

# Port assignments (P2P port, RPC is P2P+1)
declare -A NODE_PORTS
NODE_PORTS["genesis"]=19735
NODE_PORTS["alpha"]=19745
NODE_PORTS["beta"]=19755
NODE_PORTS["gamma"]=19765

# Get P2P port for a node
get_p2p_port() {
    local name=$1
    if [ -n "${NODE_PORTS[$name]}" ]; then
        echo "${NODE_PORTS[$name]}"
        return
    fi
    # Hash-based port with wide spacing (every 5 ports) over large range
    local hash=$(echo "$name" | cksum | cut -d' ' -f1)
    echo "$((20000 + (hash % 2000) * 5))"
}

usage() {
    echo "Swimchain Node Manager"
    echo ""
    echo "Usage: $0 <command> [node-name|all] [options]"
    echo ""
    echo "Commands:"
    echo "  list                    List all nodes and their status"
    echo "  create <name>           Create a new node (identity + directories)"
    echo "  start <name|all>        Start node(s)"
    echo "  stop <name|all>         Stop node(s)"
    echo "  wipe <name|all>         Wipe node data (keeps identity)"
    echo "  nuke <name|all>         Delete everything including identity"
    echo "  status <name|all>       Show node status"
    echo "  logs <name>             Tail node logs"
    echo "  rpc <name> <method>     Call RPC method on node"
    echo "  connect <name> <peer>   Connect node to peer address"
    echo "  bootstrap               Create and start default nodes (genesis, alpha, beta, gamma)"
    echo ""
    echo "Automation:"
    echo "  post <name>             Create a random post from node"
    echo "  reply <name>            Create a reply to a random post from node"
    echo "  engage <name>           Engage with random content from node"
    echo "  chaos [count]           Run chaos mode: random actions from random nodes"
    echo "  simulate [mins] [secs]  Continuous simulation (default: 5 mins, 10s delay)"
    echo ""
    echo "Verification:"
    echo "  verify                  Check all logged actions are finalized in blockchain"
    echo "  clear-log               Clear the action log"
    echo ""
    echo "Options:"
    echo "  --regtest               Use regtest mode (default: testnet)"
    echo "  --mainnet               Use mainnet mode"
    echo ""
    echo "Examples:"
    echo "  $0 create mynode"
    echo "  $0 start all"
    echo "  $0 wipe alpha"
    echo "  $0 rpc genesis get_info"
    echo "  $0 connect alpha 127.0.0.1:19735"
    echo "  $0 bootstrap"
}

# Get data directory for a node
get_data_dir() {
    local name=$1
    case "$NETWORK" in
        "--testnet") echo "$PROJECT_ROOT/${name}-testnet" ;;
        "--regtest") echo "$PROJECT_ROOT/${name}-regtest" ;;
        *) echo "$PROJECT_ROOT/${name}" ;;
    esac
}

# Get network suffix
get_suffix() {
    case "$NETWORK" in
        "--testnet") echo "-testnet" ;;
        "--regtest") echo "-regtest" ;;
        *) echo "" ;;
    esac
}

# Check if node is running
is_running() {
    local name=$1
    local data_dir=$(get_data_dir "$name")

    # First check if there's actually a process running
    local pid=$(get_pid "$name")
    if [ -z "$pid" ]; then
        # No process - clean up any stale files
        if [ -f "$data_dir/.rpc_addr" ]; then
            rm -f "$data_dir/.rpc_addr" "$data_dir/.cookie" "$data_dir/.p2p_addr" 2>/dev/null
        fi
        return 1
    fi

    # Verify process is actually running (not zombie)
    if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$data_dir/.rpc_addr" "$data_dir/.cookie" "$data_dir/.p2p_addr" 2>/dev/null
        return 1
    fi

    # Then verify RPC is responding
    if [ -f "$data_dir/.rpc_addr" ]; then
        local rpc_addr=$(cat "$data_dir/.rpc_addr")
        if nc -z ${rpc_addr/:/ } 2>/dev/null; then
            return 0
        fi
    fi

    # Process exists but RPC not ready yet - still consider "running" for startup purposes
    return 0
}

# Get node PID
get_pid() {
    local name=$1
    # Match process by data-dir argument - handle both --data-dir=NAME and --data-dir NAME
    # The = and quotes are handled flexibly
    local pid=$(pgrep -f "sw.*--data-dir[= ]?\"?${name}\"?.*node" 2>/dev/null | head -1)
    if [ -z "$pid" ]; then
        # Fallback: match by LISTENING port for this node (NOT --connect which would match other nodes)
        local p2p_port=$(get_p2p_port "$name")
        # Use word boundary to ensure we match --listen specifically, not --connect
        pid=$(pgrep -f "sw.*--listen[= ]0\.0\.0\.0:${p2p_port}" 2>/dev/null | head -1)
    fi
    echo "$pid"
}

# List all nodes
cmd_list() {
    echo -e "${BLUE}Swimchain Nodes ($NETWORK)${NC}"
    echo "================================"

    local suffix=$(get_suffix)
    for dir in "$PROJECT_ROOT"/*${suffix}; do
        if [ -d "$dir" ]; then
            local name=$(basename "$dir" "$suffix")
            local status="stopped"
            local color=$RED

            if is_running "$name"; then
                status="running"
                color=$GREEN
            fi

            local has_identity="no"
            if [ -f "$dir/identity.enc" ] || [ -f "$dir/identity.bin" ]; then
                has_identity="yes"
            fi

            printf "  %-15s ${color}%-10s${NC} identity: %s\n" "$name" "$status" "$has_identity"
        fi
    done
}

# Create a new node
cmd_create() {
    local name=$1
    if [ -z "$name" ]; then
        echo -e "${RED}Error: Node name required${NC}"
        exit 1
    fi

    local data_dir=$(get_data_dir "$name")

    echo -e "${BLUE}Creating node: $name${NC}"
    echo "Data directory: $data_dir"

    # Create directories
    mkdir -p "$data_dir"

    # Create identity if it doesn't exist
    if [ ! -f "$data_dir/identity.enc" ] && [ ! -f "$data_dir/identity.bin" ]; then
        # Special handling for genesis node - use hardcoded identity
        if [ "$name" = "genesis" ]; then
            echo -e "${YELLOW}Creating GENESIS node with hardcoded identity${NC}"
            echo "Address: $GENESIS_ADDRESS"
            echo "This identity is in genesis_list.rs as a hardcoded sponsor."

            # Import genesis identity from seed using new import-seed command
            SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $SW_BIN $NETWORK --data-dir="$name" identity import-seed "$GENESIS_SEED" 2>&1 | grep -v "^Password:" || true

            if [ -f "$data_dir/identity.enc" ] || [ -f "$data_dir/identity.bin" ]; then
                # Verify the identity matches expected
                local created_addr
                created_addr=$(SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $SW_BIN $NETWORK --data-dir="$name" identity show 2>/dev/null | grep "Address:" | awk '{print $2}')
                if [ "$created_addr" = "$GENESIS_ADDRESS" ]; then
                    echo -e "${GREEN}Genesis identity restored successfully!${NC}"
                else
                    echo -e "${RED}WARNING: Created identity ($created_addr) doesn't match expected ($GENESIS_ADDRESS)${NC}"
                fi
            else
                echo -e "${RED}Failed to create genesis identity${NC}"
            fi
        else
            # Regular node - create new identity
            echo "Creating identity with password from SWIMCHAIN_PASSWORD env var..."
            echo "Password hint: ${SWIMCHAIN_PASSWORD:0:2}***"
            # SWIMCHAIN_PASSWORD is already exported at top of script
            $SW_BIN $NETWORK --data-dir="$name" identity create 2>&1 | grep -v "^Password:" || true

            if [ -f "$data_dir/identity.enc" ] || [ -f "$data_dir/identity.bin" ]; then
                echo -e "${GREEN}Identity created${NC}"
            else
                echo -e "${RED}Failed to create identity${NC}"
            fi
        fi
    else
        echo "Identity already exists"
        # For genesis, verify it's the correct identity
        if [ "$name" = "genesis" ]; then
            local existing_addr
            existing_addr=$(SWIMCHAIN_PASSWORD="$GENESIS_PASSWORD" $SW_BIN $NETWORK --data-dir="$name" identity show 2>/dev/null | grep "Address:" | awk '{print $2}')
            if [ "$existing_addr" = "$GENESIS_ADDRESS" ]; then
                echo -e "${GREEN}Genesis identity verified: $GENESIS_ADDRESS${NC}"
            else
                echo -e "${YELLOW}WARNING: Existing identity ($existing_addr) is NOT the official genesis identity!${NC}"
                echo -e "${YELLOW}Expected: $GENESIS_ADDRESS${NC}"
                echo -e "${YELLOW}Run: $0 nuke genesis && $0 create genesis${NC}"
            fi
        fi
    fi

    echo -e "${GREEN}Node $name created${NC}"
}

# Start a node
cmd_start() {
    local name=$1

    if [ "$name" = "all" ]; then
        local suffix=$(get_suffix)
        for dir in "$PROJECT_ROOT"/*${suffix}; do
            if [ -d "$dir" ]; then
                local n=$(basename "$dir" "$suffix")
                cmd_start "$n"
            fi
        done
        return
    fi

    if [ -z "$name" ]; then
        echo -e "${RED}Error: Node name required${NC}"
        exit 1
    fi

    local data_dir=$(get_data_dir "$name")

    if [ ! -d "$data_dir" ]; then
        echo -e "${RED}Error: Node $name does not exist. Create it first.${NC}"
        exit 1
    fi

    if is_running "$name"; then
        echo -e "${YELLOW}Node $name is already running${NC}"
        return
    fi

    echo -e "${BLUE}Starting node: $name${NC}"

    local log_file="$PROJECT_ROOT/node-${name}.log"
    local p2p_port=$(get_p2p_port "$name")

    echo "P2P Port: $p2p_port"

    # Start node in background with password from env
    # Non-genesis nodes connect to genesis for local peer discovery
    local connect_flag=""
    local node_password="$SWIMCHAIN_PASSWORD"
    if [ "$name" != "genesis" ]; then
        connect_flag="--connect 127.0.0.1:19735"
    else
        # Use the hardcoded genesis password
        node_password="$GENESIS_PASSWORD"
    fi
    SWIMCHAIN_PASSWORD="$node_password" nohup $SW_BIN $NETWORK --data-dir="$name" node start --listen "0.0.0.0:$p2p_port" $connect_flag > "$log_file" 2>&1 &
    local pid=$!

    echo "PID: $pid"
    echo "Log: $log_file"

    # Wait for RPC to be ready (check for .rpc_addr file AND verify port is listening)
    echo -n "Waiting for RPC..."
    for i in {1..60}; do
        sleep 0.5
        if [ -f "$data_dir/.rpc_addr" ]; then
            local rpc_addr=$(cat "$data_dir/.rpc_addr" 2>/dev/null)
            if [ -n "$rpc_addr" ] && nc -z ${rpc_addr/:/ } 2>/dev/null; then
                echo -e " ${GREEN}ready${NC}"
                echo "RPC: $rpc_addr"
                return
            fi
        fi
        # Check if process is still running
        if ! kill -0 $pid 2>/dev/null; then
            echo -e " ${RED}process exited${NC}"
            echo "Check logs: tail -f $log_file"
            return 1
        fi
        echo -n "."
    done

    echo -e " ${RED}timeout${NC}"
    echo "Check logs: tail -f $log_file"
}

# Stop a node
cmd_stop() {
    local name=$1

    if [ "$name" = "all" ]; then
        local suffix=$(get_suffix)
        for dir in "$PROJECT_ROOT"/*${suffix}; do
            if [ -d "$dir" ]; then
                local n=$(basename "$dir" "$suffix")
                cmd_stop "$n"
            fi
        done
        return
    fi

    if [ -z "$name" ]; then
        echo -e "${RED}Error: Node name required${NC}"
        exit 1
    fi

    local data_dir=$(get_data_dir "$name")

    if ! is_running "$name"; then
        echo -e "${YELLOW}Node $name is not running${NC}"
        return
    fi

    echo -e "${BLUE}Stopping node: $name${NC}"

    # Try graceful shutdown via RPC first
    if [ -f "$data_dir/.cookie" ]; then
        local rpc_addr=$(cat "$data_dir/.rpc_addr" 2>/dev/null)
        local cookie=$(cat "$data_dir/.cookie" 2>/dev/null)
        if [ -n "$rpc_addr" ] && [ -n "$cookie" ]; then
            local auth=$(echo -n "__cookie__:$cookie" | base64 -w0)
            curl -s -X POST "http://$rpc_addr/" \
                -H "Content-Type: application/json" \
                -H "Authorization: Basic $auth" \
                -d '{"jsonrpc":"2.0","method":"stop","params":{},"id":1}' >/dev/null 2>&1 || true
        fi
    fi

    # Wait for graceful shutdown
    for i in {1..10}; do
        sleep 0.5
        if ! is_running "$name"; then
            echo -e "${GREEN}Node $name stopped${NC}"
            return
        fi
    done

    # Force kill if still running
    local pid=$(get_pid "$name")
    if [ -n "$pid" ]; then
        echo "Force killing PID $pid..."
        kill -9 $pid 2>/dev/null || true
        sleep 1
    fi

    # Clean up stale RPC files
    rm -f "$data_dir/.rpc_addr" "$data_dir/.cookie" "$data_dir/.p2p_addr" 2>/dev/null || true

    echo -e "${GREEN}Node $name stopped${NC}"
}

# Wipe node data (keep identity)
cmd_wipe() {
    local name=$1

    if [ "$name" = "all" ]; then
        local suffix=$(get_suffix)
        for dir in "$PROJECT_ROOT"/*${suffix}; do
            if [ -d "$dir" ]; then
                local n=$(basename "$dir" "$suffix")
                cmd_wipe "$n"
            fi
        done
        return
    fi

    if [ -z "$name" ]; then
        echo -e "${RED}Error: Node name required${NC}"
        exit 1
    fi

    local data_dir=$(get_data_dir "$name")

    if [ ! -d "$data_dir" ]; then
        echo -e "${YELLOW}Node $name does not exist${NC}"
        return
    fi

    # Stop if running
    if is_running "$name"; then
        cmd_stop "$name"
    fi

    echo -e "${BLUE}Wiping data for node: $name${NC}"

    # Preserve identity, wipe everything else
    local identity_backup=""
    local identity_file=""
    if [ -f "$data_dir/identity.enc" ]; then
        identity_file="identity.enc"
        identity_backup=$(mktemp)
        cp "$data_dir/identity.enc" "$identity_backup"
    elif [ -f "$data_dir/identity.bin" ]; then
        identity_file="identity.bin"
        identity_backup=$(mktemp)
        cp "$data_dir/identity.bin" "$identity_backup"
    fi

    # Remove data directories
    rm -rf "$data_dir/chain"
    rm -rf "$data_dir/content_db"
    rm -rf "$data_dir/content_blobs"
    rm -rf "$data_dir/peers"
    rm -rf "$data_dir/dht"
    rm -f "$data_dir/.cookie"
    rm -f "$data_dir/.rpc_addr"
    rm -f "$data_dir/.p2p_addr"
    rm -f "$data_dir/config.toml"

    # Restore identity
    if [ -n "$identity_backup" ] && [ -n "$identity_file" ]; then
        cp "$identity_backup" "$data_dir/$identity_file"
        rm "$identity_backup"
    fi

    echo -e "${GREEN}Node $name wiped (identity preserved)${NC}"
}

# Nuke node completely
cmd_nuke() {
    local name=$1

    if [ "$name" = "all" ]; then
        local suffix=$(get_suffix)
        for dir in "$PROJECT_ROOT"/*${suffix}; do
            if [ -d "$dir" ]; then
                local n=$(basename "$dir" "$suffix")
                cmd_nuke "$n"
            fi
        done
        return
    fi

    if [ -z "$name" ]; then
        echo -e "${RED}Error: Node name required${NC}"
        exit 1
    fi

    local data_dir=$(get_data_dir "$name")

    if [ ! -d "$data_dir" ]; then
        echo -e "${YELLOW}Node $name does not exist${NC}"
        return
    fi

    # Stop if running
    if is_running "$name"; then
        cmd_stop "$name"
    fi

    echo -e "${RED}Nuking node: $name${NC}"
    rm -rf "$data_dir"
    rm -f "$PROJECT_ROOT/node-${name}.log"

    echo -e "${GREEN}Node $name deleted${NC}"
}

# Show node status
cmd_status() {
    local name=$1

    if [ "$name" = "all" ]; then
        cmd_list
        return
    fi

    if [ -z "$name" ]; then
        cmd_list
        return
    fi

    local data_dir=$(get_data_dir "$name")

    if [ ! -d "$data_dir" ]; then
        echo -e "${RED}Node $name does not exist${NC}"
        exit 1
    fi

    echo -e "${BLUE}Node: $name${NC}"
    echo "Data dir: $data_dir"

    if [ -f "$data_dir/identity.enc" ] || [ -f "$data_dir/identity.bin" ]; then
        echo -e "Identity: ${GREEN}exists${NC}"
        local id_password="$SWIMCHAIN_PASSWORD"
        [ "$name" = "genesis" ] && id_password="$GENESIS_PASSWORD"
        SWIMCHAIN_PASSWORD="$id_password" $SW_BIN $NETWORK --data-dir="$name" identity show 2>/dev/null | grep -E "Address|Public" | sed 's/^/  /'
    else
        echo -e "Identity: ${RED}none${NC}"
    fi

    if is_running "$name"; then
        echo -e "Status: ${GREEN}running${NC}"
        if [ -f "$data_dir/.rpc_addr" ] && [ -f "$data_dir/.cookie" ]; then
            local rpc_addr=$(cat "$data_dir/.rpc_addr" 2>/dev/null)
            echo "RPC: $rpc_addr"

            # Get info via RPC
            local cookie=$(cat "$data_dir/.cookie" 2>/dev/null)
            local auth=$(echo -n "__cookie__:$cookie" | base64 -w0)
            local info=$(curl -s -X POST "http://$rpc_addr/" \
                -H "Content-Type: application/json" \
                -H "Authorization: Basic $auth" \
                -d '{"jsonrpc":"2.0","method":"get_info","params":{},"id":1}')

            if [ -n "$info" ]; then
                echo "$info" | jq -r '.result | "Peers: \(.peer_count)\nHeight: \(.block_height)"' 2>/dev/null | sed 's/^/  /'
            fi
        else
            echo "  (RPC not ready yet)"
        fi
    else
        echo -e "Status: ${RED}stopped${NC}"
    fi
}

# Tail logs
cmd_logs() {
    local name=$1
    if [ -z "$name" ]; then
        echo -e "${RED}Error: Node name required${NC}"
        exit 1
    fi

    local log_file="$PROJECT_ROOT/node-${name}.log"
    if [ ! -f "$log_file" ]; then
        echo -e "${RED}Log file not found: $log_file${NC}"
        exit 1
    fi

    tail -f "$log_file"
}

# Call RPC method
cmd_rpc() {
    local name=$1
    local method=$2
    shift 2
    local params="${*:-{}}"

    if [ -z "$name" ] || [ -z "$method" ]; then
        echo -e "${RED}Error: Node name and method required${NC}"
        echo "Usage: $0 rpc <name> <method> [params_json]"
        exit 1
    fi

    local data_dir=$(get_data_dir "$name")

    if [ ! -f "$data_dir/.rpc_addr" ]; then
        echo -e "${RED}Node $name is not running${NC}"
        exit 1
    fi

    local rpc_addr=$(cat "$data_dir/.rpc_addr")
    local cookie=$(cat "$data_dir/.cookie")
    local auth=$(echo -n "__cookie__:$cookie" | base64 -w0)

    curl -s -X POST "http://$rpc_addr/" \
        -H "Content-Type: application/json" \
        -H "Authorization: Basic $auth" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":$params,\"id\":1}" | jq .
}

# Connect to peer
cmd_connect() {
    local name=$1
    local peer=$2

    if [ -z "$name" ] || [ -z "$peer" ]; then
        echo -e "${RED}Error: Node name and peer address required${NC}"
        echo "Usage: $0 connect <name> <ip:port>"
        exit 1
    fi

    cmd_rpc "$name" "add_peer" "{\"address\":\"$peer\"}"
}

# Bootstrap default nodes
cmd_bootstrap() {
    echo -e "${BLUE}Bootstrapping default nodes...${NC}"
    echo ""

    # Create all nodes
    for name in "${DEFAULT_NODES[@]}"; do
        cmd_create "$name"
        echo ""
    done

    # Start genesis first
    echo -e "${BLUE}Starting genesis node...${NC}"
    cmd_start "genesis"
    sleep 2

    # Get genesis P2P address
    local genesis_dir=$(get_data_dir "genesis")
    local genesis_port=$(get_p2p_port "genesis")
    local genesis_p2p=""
    if [ -f "$genesis_dir/.p2p_addr" ]; then
        genesis_p2p=$(cat "$genesis_dir/.p2p_addr")
    else
        genesis_p2p="127.0.0.1:$genesis_port"
    fi

    echo "Genesis P2P: $genesis_p2p"
    echo ""

    # Start other nodes and connect to genesis
    for name in "${DEFAULT_NODES[@]:1}"; do
        echo -e "${BLUE}Starting $name...${NC}"
        cmd_start "$name"
        sleep 1

        echo "Connecting $name to genesis..."
        cmd_connect "$name" "$genesis_p2p" >/dev/null 2>&1 || true
        echo ""
    done

    echo -e "${GREEN}Bootstrap complete!${NC}"
    echo ""
    cmd_list
}

# ============================================================================
# Automation Functions
# ============================================================================

# Random content generators
ADJECTIVES=("amazing" "brilliant" "curious" "daring" "elegant" "fantastic" "glorious" "heroic" "incredible" "jovial" "keen" "legendary" "majestic" "noble" "outstanding" "powerful" "quick" "radiant" "stellar" "tremendous" "ultimate" "vibrant" "wonderful" "xenial" "youthful" "zealous")
NOUNS=("adventure" "blockchain" "community" "discovery" "ecosystem" "frontier" "galaxy" "horizon" "innovation" "journey" "knowledge" "landscape" "momentum" "network" "opportunity" "progress" "quest" "revolution" "symphony" "technology" "universe" "vision" "wisdom" "xenolith" "yearning" "zenith")
TOPICS=("decentralization" "proof-of-work" "consensus" "peer-to-peer" "cryptography" "distributed systems" "social protocols" "content persistence" "engagement pools" "chain synchronization" "identity management" "space governance")
EMOJIS=("heart" "thumbsup" "thumbsdown" "laugh" "thinking" "mindblown" "fire" "swimming")

random_element() {
    local arr=("$@")
    echo "${arr[$RANDOM % ${#arr[@]}]}"
}

generate_title() {
    local adj=$(random_element "${ADJECTIVES[@]}")
    local noun=$(random_element "${NOUNS[@]}")
    local topic=$(random_element "${TOPICS[@]}")
    echo "The ${adj^} ${noun^} of ${topic^}"
}

generate_body() {
    local topic=$(random_element "${TOPICS[@]}")
    local adj1=$(random_element "${ADJECTIVES[@]}")
    local adj2=$(random_element "${ADJECTIVES[@]}")
    local noun=$(random_element "${NOUNS[@]}")
    echo "Exploring ${topic} reveals ${adj1} insights about the ${adj2} nature of our ${noun}. This is post #$RANDOM from the network simulation."
}

generate_reply() {
    local responses=(
        "Great point! This really makes me think about the future."
        "I disagree - we need to consider alternative approaches."
        "Fascinating perspective on this topic!"
        "This aligns with my experience in the ecosystem."
        "Could you elaborate more on this?"
        "The implications here are quite significant."
        "I've been thinking about this too - glad someone brought it up!"
        "This is exactly what the community needs to discuss."
    )
    echo "$(random_element "${responses[@]}") [Reply #$RANDOM]"
}

# Get list of running nodes
get_running_nodes() {
    local running=()
    local suffix=$(get_suffix)
    for dir in "$PROJECT_ROOT"/*${suffix}; do
        if [ -d "$dir" ]; then
            local name=$(basename "$dir" "$suffix")
            if is_running "$name"; then
                running+=("$name")
            fi
        fi
    done
    echo "${running[@]}"
}

# Get a random running node
get_random_node() {
    local nodes=($(get_running_nodes))
    if [ ${#nodes[@]} -eq 0 ]; then
        echo ""
        return
    fi
    echo "${nodes[$RANDOM % ${#nodes[@]}]}"
}

# Get spaces from a node
get_spaces() {
    local name=$1
    local data_dir=$(get_data_dir "$name")
    local rpc_addr=$(cat "$data_dir/.rpc_addr" 2>/dev/null)
    local cookie=$(cat "$data_dir/.cookie" 2>/dev/null)

    if [ -z "$rpc_addr" ] || [ -z "$cookie" ]; then
        return
    fi

    local auth=$(echo -n "__cookie__:$cookie" | base64 -w0)
    curl -s -X POST "http://$rpc_addr/" \
        -H "Content-Type: application/json" \
        -H "Authorization: Basic $auth" \
        -d '{"jsonrpc":"2.0","method":"list_spaces","params":{"limit":10},"id":1}' 2>/dev/null
}

# Get content from a space
get_space_content() {
    local name=$1
    local space_id=$2
    local data_dir=$(get_data_dir "$name")
    local rpc_addr=$(cat "$data_dir/.rpc_addr" 2>/dev/null)
    local cookie=$(cat "$data_dir/.cookie" 2>/dev/null)

    if [ -z "$rpc_addr" ] || [ -z "$cookie" ]; then
        return
    fi

    local auth=$(echo -n "__cookie__:$cookie" | base64 -w0)
    curl -s -X POST "http://$rpc_addr/" \
        -H "Content-Type: application/json" \
        -H "Authorization: Basic $auth" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"list_space_content\",\"params\":{\"space_id\":\"$space_id\",\"limit\":20},\"id\":1}" 2>/dev/null
}

# Create a post from a node
cmd_auto_post() {
    local name=$1

    if [ -z "$name" ]; then
        name=$(get_random_node)
        if [ -z "$name" ]; then
            echo -e "${RED}No running nodes found${NC}"
            return 1
        fi
    fi

    if ! is_running "$name"; then
        echo -e "${RED}Node $name is not running${NC}"
        return 1
    fi

    echo -e "${BLUE}[$name]${NC} Creating post..."

    # Get first available space
    local spaces_json=$(get_spaces "$name")
    local space_id=$(echo "$spaces_json" | jq -r '.result.spaces[0].space_id // empty' 2>/dev/null)

    if [ -z "$space_id" ]; then
        echo -e "${YELLOW}No spaces found on $name${NC}"
        return 1
    fi

    local title=$(generate_title)
    local body=$(generate_body)

    echo "  Space: ${space_id:0:20}..."
    echo "  Title: $title"

    # Run CLI command
    local output=$($SW_BIN $NETWORK --data-dir="$name" post create --space "$space_id" --title "$title" --body "$body" 2>&1)

    if echo "$output" | grep -q "sha256:"; then
        local content_id=$(echo "$output" | grep -oE 'sha256:[a-f0-9]+' | head -1)
        echo -e "  ${GREEN}Created: ${content_id:0:30}...${NC}"
        # Log action for verification
        log_action "post" "$name" "$content_id" "$space_id"
        return 0
    else
        echo -e "  ${RED}Failed: ${output:0:100}${NC}"
        return 1
    fi
}

# Create a reply from a node
cmd_auto_reply() {
    local name=$1

    if [ -z "$name" ]; then
        name=$(get_random_node)
        if [ -z "$name" ]; then
            echo -e "${RED}No running nodes found${NC}"
            return 1
        fi
    fi

    if ! is_running "$name"; then
        echo -e "${RED}Node $name is not running${NC}"
        return 1
    fi

    echo -e "${BLUE}[$name]${NC} Creating reply..."

    # Get a space and find content to reply to
    local spaces_json=$(get_spaces "$name")
    local space_id=$(echo "$spaces_json" | jq -r '.result.spaces[0].space_id // empty' 2>/dev/null)

    if [ -z "$space_id" ]; then
        echo -e "${YELLOW}No spaces found on $name${NC}"
        return 1
    fi

    local content_json=$(get_space_content "$name" "$space_id")
    local content_ids=($(echo "$content_json" | jq -r '.result.items[].content_id // empty' 2>/dev/null))

    if [ ${#content_ids[@]} -eq 0 ]; then
        echo -e "${YELLOW}No content to reply to${NC}"
        return 1
    fi

    # Pick random content to reply to
    local parent_id="${content_ids[$RANDOM % ${#content_ids[@]}]}"
    local body=$(generate_reply)

    echo "  Parent: ${parent_id:0:30}..."

    local output=$($SW_BIN $NETWORK --data-dir="$name" post reply --parent "$parent_id" --body "$body" 2>&1)

    if echo "$output" | grep -q "sha256:"; then
        local content_id=$(echo "$output" | grep -oE 'sha256:[a-f0-9]+' | head -1)
        echo -e "  ${GREEN}Created: ${content_id:0:30}...${NC}"
        # Log action for verification
        log_action "reply" "$name" "$content_id" "$space_id"
        return 0
    else
        echo -e "  ${RED}Failed: ${output:0:100}${NC}"
        return 1
    fi
}

# Engage with content from a node
cmd_auto_engage() {
    local name=$1

    if [ -z "$name" ]; then
        name=$(get_random_node)
        if [ -z "$name" ]; then
            echo -e "${RED}No running nodes found${NC}"
            return 1
        fi
    fi

    if ! is_running "$name"; then
        echo -e "${RED}Node $name is not running${NC}"
        return 1
    fi

    echo -e "${BLUE}[$name]${NC} Engaging with content..."

    # Get a space and find content
    local spaces_json=$(get_spaces "$name")
    local space_id=$(echo "$spaces_json" | jq -r '.result.spaces[0].space_id // empty' 2>/dev/null)

    if [ -z "$space_id" ]; then
        echo -e "${YELLOW}No spaces found on $name${NC}"
        return 1
    fi

    local content_json=$(get_space_content "$name" "$space_id")
    local content_ids=($(echo "$content_json" | jq -r '.result.items[].content_id // empty' 2>/dev/null))

    if [ ${#content_ids[@]} -eq 0 ]; then
        echo -e "${YELLOW}No content to engage with${NC}"
        return 1
    fi

    # Pick random content and emoji
    local content_id="${content_ids[$RANDOM % ${#content_ids[@]}]}"
    local emoji=$(random_element "${EMOJIS[@]}")

    echo "  Content: ${content_id:0:30}..."
    echo "  Emoji: $emoji"

    local output=$($SW_BIN $NETWORK --data-dir="$name" post engage "$content_id" --emoji "$emoji" --seconds 5 2>&1)

    if echo "$output" | grep -qi "complete\|success\|engaged\|added"; then
        echo -e "  ${GREEN}Engaged successfully${NC}"
        # Log action for verification (engagements don't create new content, log target)
        log_action "engage" "$name" "$content_id" "$space_id"
        return 0
    else
        echo -e "  ${RED}Failed: $(echo "$output" | grep -i "error\|failed" | head -1)${NC}"
        return 1
    fi
}

# Chaos mode - random actions from random nodes
cmd_chaos() {
    set +e  # Disable exit on error for chaos mode
    local count=${1:-10}

    echo -e "${BLUE}=== CHAOS MODE ===${NC}"
    echo "Running $count random actions..."
    echo ""

    local nodes=($(get_running_nodes))
    if [ ${#nodes[@]} -eq 0 ]; then
        echo -e "${RED}No running nodes found${NC}"
        return 1
    fi

    echo "Active nodes: ${nodes[*]}"
    echo ""

    local posts=0
    local replies=0
    local engages=0
    local failures=0

    for ((i=1; i<=count; i++)); do
        echo -e "${YELLOW}--- Action $i/$count ---${NC}"

        local node="${nodes[$RANDOM % ${#nodes[@]}]}"
        local action=$((RANDOM % 3))

        case $action in
            0)
                if cmd_auto_post "$node"; then
                    ((posts++)) || true
                else
                    ((failures++)) || true
                fi
                ;;
            1)
                if cmd_auto_reply "$node"; then
                    ((replies++)) || true
                else
                    ((failures++)) || true
                fi
                ;;
            2)
                if cmd_auto_engage "$node"; then
                    ((engages++)) || true
                else
                    ((failures++)) || true
                fi
                ;;
        esac

        echo ""
        sleep 1
    done

    echo -e "${GREEN}=== CHAOS COMPLETE ===${NC}"
    echo "Posts: $posts | Replies: $replies | Engagements: $engages | Failures: $failures"
    set -e  # Re-enable
}

# Continuous simulation
cmd_simulate() {
    set +e  # Disable exit on error for simulation
    local duration_mins=${1:-5}
    local delay_secs=${2:-10}  # Delay in seconds (default 10)
    local end_time=$(($(date +%s) + duration_mins * 60))

    echo -e "${BLUE}=== SIMULATION MODE ===${NC}"
    echo "Running for $duration_mins minutes, ${delay_secs}s between actions"
    echo "Press Ctrl+C to stop early"
    echo ""

    local nodes=($(get_running_nodes))
    if [ ${#nodes[@]} -eq 0 ]; then
        echo -e "${RED}No running nodes found${NC}"
        return 1
    fi

    echo "Active nodes: ${nodes[*]}"
    echo ""

    local total=0
    local successes=0

    trap 'echo ""; echo -e "${YELLOW}Simulation interrupted${NC}"; echo "Total: $total | Successes: $successes"; set -e; exit 0' INT

    while [ $(date +%s) -lt $end_time ]; do
        local node="${nodes[$RANDOM % ${#nodes[@]}]}"
        local action=$((RANDOM % 20))  # Fine-grained distribution

        ((total++)) || true

        if [ $action -lt 2 ]; then
            # 10% chance: new post (thread starter)
            cmd_auto_post "$node" && { ((successes++)) || true; }
        elif [ $action -lt 10 ]; then
            # 40% chance: reply (drives discussion)
            cmd_auto_reply "$node" && { ((successes++)) || true; }
        else
            # 50% chance: engage (reactions to posts AND replies)
            cmd_auto_engage "$node" && { ((successes++)) || true; }
        fi

        echo ""
        echo -e "${BLUE}Next action in ${delay_secs}s...${NC}"
        sleep $delay_secs
    done

    echo -e "${GREEN}=== SIMULATION COMPLETE ===${NC}"
    echo "Total: $total | Successes: $successes"
    set -e  # Re-enable
}

# Verify all logged actions are finalized in the blockchain on all nodes
cmd_verify() {
    echo -e "${BLUE}=== VERIFY BLOCKCHAIN INCLUSION ===${NC}"

    if [ ! -f "$ACTION_LOG" ]; then
        echo -e "${RED}No action log found at $ACTION_LOG${NC}"
        echo "Run 'simulate' or 'chaos' first to create actions"
        return 1
    fi

    local nodes=($(get_running_nodes))
    if [ ${#nodes[@]} -eq 0 ]; then
        echo -e "${RED}No running nodes found${NC}"
        return 1
    fi

    echo "Verifying actions are finalized in blockchain across ${#nodes[@]} nodes"
    echo "Action log: $ACTION_LOG"
    echo ""

    local total=0
    local verified=0
    local missing=0
    local missing_details=""

    # Read each logged action
    while IFS= read -r line; do
        local action_type=$(echo "$line" | jq -r '.type')
        local content_id=$(echo "$line" | jq -r '.content_id')
        local created_on=$(echo "$line" | jq -r '.node')

        # Skip engagements for now - they have different content_id handling
        if [ "$action_type" = "engage" ]; then
            continue
        fi

        total=$((total + 1))

        # Pick a random node that's NOT the creator to verify cross-node consistency
        local test_node=""
        local shuffled=($(shuf -e "${nodes[@]}"))
        for node in "${shuffled[@]}"; do
            if [ "$node" != "$created_on" ]; then
                test_node="$node"
                break
            fi
        done

        if [ -z "$test_node" ]; then
            test_node="${nodes[0]}"
        fi

        echo -n "[$total] $action_type from $created_on -> verify on $test_node: ${content_id:0:20}... "

        local data_dir=$(get_data_dir "$test_node")
        local rpc_addr=$(cat "$data_dir/.rpc_addr" 2>/dev/null)
        local cookie=$(cat "$data_dir/.cookie" 2>/dev/null)

        if [ -z "$rpc_addr" ] || [ -z "$cookie" ]; then
            echo -e "${RED}FAILED (no RPC)${NC}"
            missing=$((missing + 1))
            continue
        fi

        local auth=$(echo -n "__cookie__:$cookie" | base64 -w0)

        # Check if action is finalized in blockchain
        local result=$(curl -s -X POST "http://$rpc_addr/" \
            -H "Content-Type: application/json" \
            -H "Authorization: Basic $auth" \
            -d "{\"jsonrpc\":\"2.0\",\"method\":\"verify_action_finalized\",\"params\":{\"content_id\":\"$content_id\"},\"id\":1}" 2>/dev/null)

        local finalized=$(echo "$result" | jq -r '.result.finalized // false')
        local block_height=$(echo "$result" | jq -r '.result.block_height // "null"')

        if [ "$finalized" = "true" ]; then
            echo -e "${GREEN}OK (block $block_height)${NC}"
            verified=$((verified + 1))
        else
            echo -e "${RED}NOT IN CHAIN${NC}"
            missing=$((missing + 1))
            missing_details="$missing_details\n  $content_id ($action_type from $created_on) not found on $test_node"
        fi
    done < "$ACTION_LOG"

    echo ""
    echo -e "${BLUE}=== VERIFICATION COMPLETE ===${NC}"
    echo "Total actions: $total"
    echo -e "Finalized in chain: ${GREEN}$verified${NC}"
    echo -e "Missing from chain: ${RED}$missing${NC}"

    if [ $missing -gt 0 ]; then
        echo ""
        echo "Missing actions:"
        echo -e "$missing_details"
        return 1
    fi

    return 0
}

# Clear action log
cmd_clear_log() {
    if [ -f "$ACTION_LOG" ]; then
        rm "$ACTION_LOG"
        echo -e "${GREEN}Cleared action log${NC}"
    else
        echo "No action log to clear"
    fi
}

# Parse network flag
for arg in "$@"; do
    case $arg in
        --regtest)
            NETWORK="--regtest"
            shift
            ;;
        --mainnet)
            NETWORK=""
            shift
            ;;
        --testnet)
            NETWORK="--testnet"
            shift
            ;;
    esac
done

# Main command dispatch
case "${1:-}" in
    list)
        cmd_list
        ;;
    create)
        cmd_create "$2"
        ;;
    start)
        cmd_start "$2"
        ;;
    stop)
        cmd_stop "$2"
        ;;
    wipe)
        cmd_wipe "$2"
        ;;
    nuke)
        cmd_nuke "$2"
        ;;
    status)
        cmd_status "$2"
        ;;
    logs)
        cmd_logs "$2"
        ;;
    rpc)
        shift
        cmd_rpc "$@"
        ;;
    connect)
        cmd_connect "$2" "$3"
        ;;
    bootstrap)
        cmd_bootstrap
        ;;
    post)
        cmd_auto_post "$2"
        ;;
    reply)
        cmd_auto_reply "$2"
        ;;
    engage)
        cmd_auto_engage "$2"
        ;;
    chaos)
        cmd_chaos "$2"
        ;;
    simulate)
        cmd_simulate "$2" "$3"
        ;;
    verify)
        cmd_verify
        ;;
    clear-log)
        cmd_clear_log
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        usage
        exit 1
        ;;
esac
