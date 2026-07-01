#!/bin/bash
# List all locally running SwimChain testnet nodes
# Shows: PID, P2P port, RPC port, data directory, and identity address

set -e

SW_BIN="${SW_BIN:-./target/release/sw}"

echo "============================================================"
echo "SWIMCHAIN TESTNET NODES"
echo "============================================================"

# Find all sw processes running with --testnet and node
pids=$(pgrep -f "sw.*--testnet.*node" 2>/dev/null || true)

if [ -z "$pids" ]; then
    echo "No testnet nodes currently running."
    echo ""
    echo "Start a node with:"
    echo "  $SW_BIN --testnet node start"
    exit 0
fi

# Collect node info
declare -A node_data_dirs
declare -A node_rpc_ports
declare -A node_p2p_ports
declare -A node_node_ids
declare -A node_levels

for pid in $pids; do
    # Get working directory
    cwd=$(readlink /proc/$pid/cwd 2>/dev/null || echo "")

    # Get command line arguments
    cmdline=$(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ' || echo "")

    # Determine data directory
    # Priority: --data-dir flag > cwd-based detection > default
    data_dir=""

    if echo "$cmdline" | grep -qE '\-\-data-dir[= ]'; then
        # Extract --data-dir value
        data_dir=$(echo "$cmdline" | sed -n 's/.*--data-dir[= ]*\([^ ]*\).*/\1/p')
    fi

    # If no explicit data-dir, check if cwd has identity.enc (node running from data dir)
    if [ -z "$data_dir" ]; then
        if [ -f "$cwd/identity.enc" ]; then
            data_dir="$cwd"
        elif [ -f "$cwd/.cookie" ]; then
            data_dir="$cwd"
        else
            # Check for nested testnet dir pattern (swimchain-testnet or agent-*/agent-*)
            if [ -d "$cwd/swimchain-testnet" ]; then
                data_dir="$cwd/swimchain-testnet"
            elif echo "$cwd" | grep -q "agent-"; then
                # Check for nested agent dir
                agent_name=$(basename "$cwd")
                if [ -d "$cwd/$agent_name" ]; then
                    data_dir="$cwd/$agent_name"
                fi
            fi
        fi
    fi

    # Fall back to default testnet directory
    if [ -z "$data_dir" ] || [ ! -d "$data_dir" ]; then
        data_dir="${HOME}/.local/share/swimchain-testnet"
    fi

    # Verify the data_dir by checking for .cookie file and matching RPC port
    # First, get the actual RPC port this process is listening on
    actual_rpc=$(ss -tlnp 2>/dev/null | grep "pid=$pid" | awk '{print $4}' | grep -oE '[0-9]+$' | sort -n | tail -1)

    # If data_dir doesn't have .cookie but genesis-identity-testnet does, and ports match
    if [ -z "$data_dir" ] || [ ! -f "$data_dir/.cookie" ]; then
        for candidate in "${cwd}/genesis-identity-testnet" "${HOME}/.local/share/swimchain-testnet"; do
            if [ -f "$candidate/.rpc_addr" ]; then
                candidate_port=$(cat "$candidate/.rpc_addr" | grep -oE '[0-9]+$')
                if [ "$candidate_port" = "$actual_rpc" ]; then
                    data_dir="$candidate"
                    break
                fi
            fi
        done
    fi

    # Get RPC address from .rpc_addr file
    rpc_port=""
    if [ -f "$data_dir/.rpc_addr" ]; then
        rpc_addr=$(cat "$data_dir/.rpc_addr")
        rpc_port=$(echo "$rpc_addr" | grep -oE '[0-9]+$')
    fi

    # Get P2P port from command line or socket list
    p2p_port=""
    if echo "$cmdline" | grep -qE '\-\-listen'; then
        p2p_port=$(echo "$cmdline" | grep -oE '\-\-listen[= ]*[0-9.:]+:[0-9]+' | grep -oE '[0-9]+$')
    fi

    # If not in cmdline, get from socket list (first testnet-range port that's not RPC)
    if [ -z "$p2p_port" ]; then
        for port in $(ss -tlnp 2>/dev/null | grep "pid=$pid" | awk '{print $4}' | grep -oE '[0-9]+$' | sort -n); do
            if [ "$port" != "$rpc_port" ]; then
                if [ "$port" -ge 19735 ] && [ "$port" -le 49999 ]; then
                    p2p_port=$port
                    break
                fi
            fi
        done
    fi

    # Get identity node_id via RPC (uses HTTP Basic Auth with __cookie__:cookie_hex)
    node_id=""
    if [ -n "$rpc_port" ] && [ -f "$data_dir/.cookie" ]; then
        cookie=$(cat "$data_dir/.cookie")
        response=$(curl -s --max-time 2 -X POST "http://127.0.0.1:$rpc_port" \
            -H "Content-Type: application/json" \
            -u "__cookie__:$cookie" \
            -d '{"jsonrpc":"2.0","method":"get_info","params":{},"id":1}' 2>/dev/null || echo "")

        if [ -n "$response" ]; then
            node_id=$(echo "$response" | grep -oE '"node_id":"[^"]+"' | cut -d'"' -f4)
        fi
    fi

    # Get identity level if we have node_id
    level=""
    if [ -n "$node_id" ] && [ -n "$rpc_port" ] && [ -f "$data_dir/.cookie" ]; then
        level_response=$(curl -s --max-time 2 -X POST "http://127.0.0.1:$rpc_port" \
            -H "Content-Type: application/json" \
            -u "__cookie__:$cookie" \
            -d "{\"jsonrpc\":\"2.0\",\"method\":\"get_identity_level\",\"params\":{\"identity_id\":\"$node_id\"},\"id\":1}" 2>/dev/null || echo "")

        if [ -n "$level_response" ]; then
            level=$(echo "$level_response" | grep -oE '"level_name":"[^"]+"' | cut -d'"' -f4)
        fi
    fi

    node_data_dirs[$pid]="$data_dir"
    node_rpc_ports[$pid]="$rpc_port"
    node_p2p_ports[$pid]="$p2p_port"
    node_node_ids[$pid]="$node_id"
    node_levels[$pid]="$level"
done

echo ""
printf "%-8s %-10s %-10s %-66s\n" "PID" "P2P" "RPC" "Node ID (Identity Hash)"
echo "-------- ---------- ---------- ------------------------------------------------------------------"

for pid in $pids; do
    p2p="${node_p2p_ports[$pid]:-?}"
    rpc="${node_rpc_ports[$pid]:-?}"
    node_id="${node_node_ids[$pid]:-[unknown]}"
    printf "%-8s %-10s %-10s %-66s\n" "$pid" "$p2p" "$rpc" "$node_id"
done

echo ""
echo "============================================================"
echo "NODE DETAILS"
echo "============================================================"

for pid in $pids; do
    data_dir="${node_data_dirs[$pid]}"
    rpc_port="${node_rpc_ports[$pid]}"
    node_id="${node_node_ids[$pid]}"

    echo ""
    echo "PID: $pid"
    echo "Data Dir: $data_dir"

    if [ -f "$data_dir/identity.enc" ]; then
        echo "Identity: EXISTS"
        if [ -n "$node_id" ]; then
            echo "Node ID: $node_id"
        fi
        level="${node_levels[$pid]}"
        if [ -n "$level" ]; then
            echo "Level: $level"
        fi
    else
        echo "Identity: NONE"
        echo "  Create with: $SW_BIN --testnet --data-dir \"$data_dir\" identity create"
    fi

    if [ -f "$data_dir/.cookie" ]; then
        cookie=$(cat "$data_dir/.cookie")
        echo "Cookie: ${cookie:0:16}..."
    fi

    # Get sync status
    if [ -n "$rpc_port" ] && [ -f "$data_dir/.cookie" ]; then
        cookie=$(cat "$data_dir/.cookie")
        sync_response=$(curl -s --max-time 2 -X POST "http://127.0.0.1:$rpc_port" \
            -H "Content-Type: application/json" \
            -u "__cookie__:$cookie" \
            -d '{"jsonrpc":"2.0","method":"get_sync_status","params":{},"id":1}' 2>/dev/null || echo "")

        if [ -n "$sync_response" ]; then
            height=$(echo "$sync_response" | grep -oE '"chain_height":[0-9]+' | cut -d':' -f2)
            peers=$(echo "$sync_response" | grep -oE '"connected_peers":[0-9]+' | cut -d':' -f2)
            if [ -n "$height" ]; then
                echo "Chain Height: $height"
            fi
            if [ -n "$peers" ]; then
                echo "Connected Peers: $peers"
            fi
        fi

        # Get space count
        spaces_response=$(curl -s --max-time 2 -X POST "http://127.0.0.1:$rpc_port" \
            -H "Content-Type: application/json" \
            -u "__cookie__:$cookie" \
            -d '{"jsonrpc":"2.0","method":"list_spaces","params":{},"id":1}' 2>/dev/null || echo "")

        if [ -n "$spaces_response" ]; then
            # Count spaces (simplified - look for space_id occurrences)
            space_count=$(echo "$spaces_response" | grep -oE '"space_id"' | wc -l)
            echo "Spaces: $space_count"
        fi
    fi

    echo "---"
done

echo ""
echo "============================================================"
echo "CLI COMMANDS"
echo "============================================================"
echo ""

# Show CLI usage for each node
for pid in $pids; do
    data_dir="${node_data_dirs[$pid]}"
    echo "# Node PID $pid"
    echo "export SWIMCHAIN_DATA_DIR=\"$data_dir\""
    echo "$SW_BIN --testnet --data-dir \"\$SWIMCHAIN_DATA_DIR\" identity show"
    echo "$SW_BIN --testnet --data-dir \"\$SWIMCHAIN_DATA_DIR\" space list"
    echo "$SW_BIN --testnet --data-dir \"\$SWIMCHAIN_DATA_DIR\" sync status"
    echo ""
done
