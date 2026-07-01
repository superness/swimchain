#!/bin/bash
# Deploy SwimChain binaries to testnet seed nodes
# Usage: ./scripts/deploy-to-seeds.sh [OPTIONS]
#
# Options:
#   --restart     Restart nodes after deploying binaries
#   --wipe        Wipe chain/content data (fresh start)
#   --password    Password for node identity (default: from SWIMCHAIN_PASSWORD env)
#
# Deploys:
#   - sw (main node binary)
#   - swimchain-dns-seeder (DNS seed server)
#   - systemd service configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BINARY_PATH="$PROJECT_ROOT/target/release/sw"
DNS_SEEDER_PATH="$PROJECT_ROOT/tools/dns-seeder/target/release/swimchain-dns-seeder"
REMOTE_PATH="/usr/local/bin/sw"
REMOTE_DNS_SEEDER_PATH="/usr/local/bin/swimchain-dns-seeder"

# Seed node IPs (override via env: SEED_NODE=1.2.3.4 ./scripts/deploy-to-seeds.sh)
SEED_NODE="${SEED_NODE:-161.35.177.191}"

# Configuration
DATA_DIR="/var/lib/swimchain"
DNS_PORT=5353
HTTP_PORT=8053

# Parse arguments
RESTART_NODES=false
WIPE_DATA=false
NODE_PASSWORD="${SWIMCHAIN_PASSWORD:-testpass123}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --restart)
            RESTART_NODES=true
            shift
            ;;
        --wipe)
            WIPE_DATA=true
            shift
            ;;
        --password)
            NODE_PASSWORD="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--restart] [--wipe] [--password PASSWORD]"
            exit 1
            ;;
    esac
done

echo "============================================================"
echo "SWIMCHAIN SEED NODE DEPLOYMENT"
echo "============================================================"
echo ""
echo "Options:"
echo "  Restart: $RESTART_NODES"
echo "  Wipe data: $WIPE_DATA"
echo ""

# Check if main binary exists
if [[ ! -f "$BINARY_PATH" ]]; then
    echo "ERROR: Binary not found at $BINARY_PATH"
    echo "Run 'cargo build --release' first"
    exit 1
fi

# Check if DNS seeder binary exists
if [[ ! -f "$DNS_SEEDER_PATH" ]]; then
    echo "WARNING: DNS seeder not found at $DNS_SEEDER_PATH"
    echo "Building DNS seeder..."
    (cd "$PROJECT_ROOT/tools/dns-seeder" && cargo build --release)
fi

BINARY_SIZE=$(du -h "$BINARY_PATH" | cut -f1)
BINARY_DATE=$(stat -c %y "$BINARY_PATH" 2>/dev/null || stat -f %Sm "$BINARY_PATH")
echo "Node Binary: $BINARY_PATH"
echo "  Size: $BINARY_SIZE"
echo "  Modified: $BINARY_DATE"

if [[ -f "$DNS_SEEDER_PATH" ]]; then
    DNS_SIZE=$(du -h "$DNS_SEEDER_PATH" | cut -f1)
    DNS_DATE=$(stat -c %y "$DNS_SEEDER_PATH" 2>/dev/null || stat -f %Sm "$DNS_SEEDER_PATH")
    echo "DNS Seeder: $DNS_SEEDER_PATH"
    echo "  Size: $DNS_SIZE"
    echo "  Modified: $DNS_DATE"
fi
echo ""

deploy_to_node() {
    local NODE_IP=$1
    local NODE_NAME=$2
    local OTHER_NODE_IP=$3

    echo "------------------------------------------------------------"
    echo "Deploying to $NODE_NAME ($NODE_IP)..."
    echo "------------------------------------------------------------"

    # Copy main binary
    echo "  Copying sw binary..."
    scp "$BINARY_PATH" "root@$NODE_IP:$REMOTE_PATH.new"

    # Copy DNS seeder binary
    if [[ -f "$DNS_SEEDER_PATH" ]]; then
        echo "  Copying dns-seeder binary..."
        scp "$DNS_SEEDER_PATH" "root@$NODE_IP:$REMOTE_DNS_SEEDER_PATH.new"
    fi

    # Stop services, replace binaries, configure systemd
    # NOTE: OTHER_NODE_IP must be the LAST positional arg — ssh drops empty args
    # when re-parsing the remote command line, which would shift subsequent args.
    echo "  Stopping services and replacing binaries..."
    ssh "root@$NODE_IP" bash -s -- "$NODE_PASSWORD" "$DATA_DIR" "$DNS_PORT" "$HTTP_PORT" "$WIPE_DATA" "$OTHER_NODE_IP" <<'REMOTE_SCRIPT'
        NODE_PASSWORD="$1"
        DATA_DIR="$2"
        DNS_PORT="$3"
        HTTP_PORT="$4"
        WIPE_DATA="$5"
        OTHER_NODE_IP="$6"

        # Stop systemd services
        systemctl stop swimchain 2>/dev/null || true
        systemctl stop swimchain-dns-seeder 2>/dev/null || true

        # Kill any stray processes
        pkill -f '/usr/local/bin/sw' 2>/dev/null || true
        pkill -f 'swimchain-dns-seeder' 2>/dev/null || true
        sleep 2

        # Replace main binary
        mv /usr/local/bin/sw.new /usr/local/bin/sw
        chmod +x /usr/local/bin/sw

        # Replace DNS seeder binary if present
        if [[ -f /usr/local/bin/swimchain-dns-seeder.new ]]; then
            mv /usr/local/bin/swimchain-dns-seeder.new /usr/local/bin/swimchain-dns-seeder
            chmod +x /usr/local/bin/swimchain-dns-seeder
        fi

        echo "  Binaries deployed:"
        ls -la /usr/local/bin/sw
        ls -la /usr/local/bin/swimchain-dns-seeder 2>/dev/null || true

        # Wipe data if requested
        if [[ "$WIPE_DATA" == "true" ]]; then
            echo "  Wiping data directory..."
            rm -rf "${DATA_DIR}-testnet"
            echo "  Data wiped."
        fi

        # Create environment file
        echo "  Setting up environment..."
        cat > /etc/swimchain.env << EOF
SWIMCHAIN_PASSWORD=${NODE_PASSWORD}
EOF
        chmod 600 /etc/swimchain.env

        # Create systemd service for main node
        echo "  Setting up systemd service..."
        cat > /etc/systemd/system/swimchain.service << EOF
[Unit]
Description=Swimchain Testnet Seed Node
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/swimchain.env
ExecStart=/usr/local/bin/sw --testnet --seed-node --data-dir ${DATA_DIR} node start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

        # Create systemd service for DNS seeder
        BOOTSTRAP_EXTRA=""
        if [[ -n "$OTHER_NODE_IP" ]]; then
            BOOTSTRAP_EXTRA="--bootstrap ${OTHER_NODE_IP}:19735"
        fi
        cat > /etc/systemd/system/swimchain-dns-seeder.service << EOF
[Unit]
Description=Swimchain DNS Seeder
After=swimchain.service
Requires=swimchain.service

[Service]
Type=simple
ExecStart=/usr/local/bin/swimchain-dns-seeder --bootstrap 127.0.0.1:19735 ${BOOTSTRAP_EXTRA} --dns-port ${DNS_PORT} --http-port ${HTTP_PORT}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload
        systemctl enable swimchain swimchain-dns-seeder

        # Create identity if needed
        DATA_DIR_TESTNET="${DATA_DIR}-testnet"
        if [[ ! -f "${DATA_DIR_TESTNET}/identity.enc" ]]; then
            echo "  Creating new identity..."
            export SWIMCHAIN_PASSWORD="${NODE_PASSWORD}"
            /usr/local/bin/sw --testnet --data-dir "${DATA_DIR}" identity create
        else
            echo "  Identity already exists."
        fi

        echo "  Setup complete."
REMOTE_SCRIPT

    if [[ "$RESTART_NODES" == "true" ]]; then
        echo "  Starting services..."
        ssh "root@$NODE_IP" bash -s <<'REMOTE_SCRIPT'
            systemctl start swimchain
            sleep 3
            systemctl start swimchain-dns-seeder
            sleep 2

            echo "  Service status:"
            if systemctl is-active --quiet swimchain; then
                echo "    swimchain: RUNNING"
            else
                echo "    swimchain: FAILED"
                journalctl -u swimchain --no-pager -n 5
            fi

            if systemctl is-active --quiet swimchain-dns-seeder; then
                echo "    swimchain-dns-seeder: RUNNING"
            else
                echo "    swimchain-dns-seeder: FAILED"
            fi
REMOTE_SCRIPT
    else
        echo "  Services configured but not started. Use --restart to start them."
    fi

    echo "  Done with $NODE_NAME"
    echo ""
}

# Deploy to seed node
deploy_to_node "$SEED_NODE" "SEED" ""

echo "============================================================"
echo "DEPLOYMENT COMPLETE"
echo "============================================================"
echo ""
echo "Binary deployed to:"
echo "  - SEED: $SEED_NODE"
echo ""

if [[ "$RESTART_NODES" == "true" ]]; then
    echo "Services are running via systemd."
    echo ""
    echo "To check status:"
    echo "  ssh root@$SEED_NODE 'systemctl status swimchain swimchain-dns-seeder'"
    echo ""
    echo "To view logs:"
    echo "  ssh root@$SEED_NODE 'journalctl -u swimchain -f'"
    echo ""
    echo "To test sync status:"
    echo "  ssh root@$SEED_NODE 'SWIMCHAIN_PASSWORD=\"$NODE_PASSWORD\" /usr/local/bin/sw --testnet --data-dir $DATA_DIR sync status'"
else
    echo "Services are configured but NOT started."
    echo ""
    echo "To start services:"
    echo "  ssh root@$SEED_NODE 'systemctl start swimchain swimchain-dns-seeder'"
    echo ""
    echo "Or run this script with --restart flag:"
    echo "  ./scripts/deploy-to-seeds.sh --restart"
fi
echo ""
echo "DNS seeder endpoint:"
echo "  curl http://$SEED_NODE:$HTTP_PORT/peers"
