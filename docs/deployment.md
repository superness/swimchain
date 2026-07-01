# Swimchain Deployment Guide

This guide covers deploying Swimchain nodes from local development to production seed nodes.

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Rust | 1.75+ | Compile swimchain |
| Git | 2.x | Clone repository |

### Hardware Requirements

| Tier | CPU | RAM | Storage | Bandwidth | Use Case |
|------|-----|-----|---------|-----------|----------|
| Minimum | 2 cores | 2 GB | 10 GB | 5 Mbps | Personal node |
| Recommended | 4 cores | 4 GB | 50 GB | 20 Mbps | Active participant |
| Seed Node | 4+ cores | 8 GB | 100 GB | 100 Mbps | Bootstrap infrastructure |

---

## Local Development

### Quick Start

```bash
# Clone and build
git clone https://github.com/adminwizardtech/swimchain.git
cd swimchain
cargo build --release

# Create identity (takes ~30s for PoW)
./target/release/cs identity create

# Start node
./target/release/cs node start --listen 127.0.0.1:9735
```

### Two-Node Local Network

Terminal 1 (Node A):
```bash
# Start first node
cs node start --listen 127.0.0.1:9735

# Output:
# Node started on 127.0.0.1:9735
# Identity: cs1qz8h...
# Waiting for peers...
```

Terminal 2 (Node B):
```bash
# Start second node, connect to first
cs node start --listen 127.0.0.1:9736 --connect 127.0.0.1:9735

# Output:
# Node started on 127.0.0.1:9736
# Connected to 127.0.0.1:9735
# Chain synced (height: 0)
```

Terminal 2:
```bash
# Create a post on node B
cs post create --content "Hello from node B!"

# Output:
# Mining PoW... [=========>    ] 60%
# Post created: sha256:7a4f2e...
# Broadcasting to 1 peer...
```

Terminal 1:
```bash
# Check status - should show the new post
cs node status

# View the post
cs post view sha256:7a4f2e...
```

### Three-Node Development Network

```bash
# Terminal 1: Node A (will be the connection hub)
cs node start --listen 127.0.0.1:9735

# Terminal 2: Node B connects to A
cs node start --listen 127.0.0.1:9736 --connect 127.0.0.1:9735

# Terminal 3: Node C connects to A
cs node start --listen 127.0.0.1:9737 --connect 127.0.0.1:9735

# Now B and C will discover each other through A's peer exchange
```

---

## VPS Seed Node Deployment

### Overview

Seed nodes provide bootstrap infrastructure for new nodes to discover peers. They should be:
- Geographically distributed
- Highly available
- Running on different providers (resilience)

### Provider Options (~$5-10/month each)

| Provider | Location Options | Notes |
|----------|------------------|-------|
| DigitalOcean | NYC, AMS, SFO, SGP | Reliable, easy setup |
| Vultr | Global (25+ locations) | Good price/performance |
| Linode | US, EU, Asia | Consistent performance |
| Hetzner | Germany, Finland | Cheapest EU option |

### Deployment Steps

#### 1. Provision VPS

```bash
# Example: DigitalOcean CLI
doctl compute droplet create \
  --region nyc1 \
  --size s-2vcpu-2gb \
  --image ubuntu-22-04-x64 \
  --ssh-keys $(doctl compute ssh-key list --format ID --no-header) \
  swimchain-seed-1
```

#### 2. Initial Server Setup

```bash
# SSH to server
ssh root@<server-ip>

# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y build-essential pkg-config libssl-dev

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

#### 3. Build Swimchain

```bash
# Clone repository
git clone https://github.com/adminwizardtech/swimchain.git
cd swimchain

# Build release binary
cargo build --release

# Copy to /usr/local/bin
sudo cp target/release/cs /usr/local/bin/
```

#### 4. Create Systemd Service

```bash
# Create service user
sudo useradd -r -s /bin/false swimchain

# Create data directory
sudo mkdir -p /var/lib/swimchain
sudo chown swimchain:swimchain /var/lib/swimchain

# Create service file
sudo tee /etc/systemd/system/swimchain.service << 'EOF'
[Unit]
Description=Swimchain Node
After=network.target

[Service]
Type=simple
User=swimchain
Group=swimchain
ExecStart=/usr/local/bin/cs node start --listen 0.0.0.0:9735
WorkingDirectory=/var/lib/swimchain
Environment="CHAINSOCIAL_DATA_DIR=/var/lib/swimchain"
Restart=always
RestartSec=5

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/swimchain

[Install]
WantedBy=multi-user.target
EOF
```

#### 5. Initialize Identity

```bash
# Generate identity as service user
sudo -u swimchain /usr/local/bin/cs identity create

# Note: This takes ~30s for PoW
# Save the identity address (cs1q...)
```

#### 6. Configure Firewall

```bash
# Allow SSH and Swimchain port
sudo ufw allow 22/tcp
sudo ufw allow 9735/tcp
sudo ufw enable
```

#### 7. Start Service

```bash
# Enable and start
sudo systemctl enable swimchain
sudo systemctl start swimchain

# Check status
sudo systemctl status swimchain

# View logs
sudo journalctl -u swimchain -f
```

### Seed Node Configuration

For seed nodes, increase connection limits:

```bash
# Create config file
sudo tee /var/lib/swimchain/config.toml << 'EOF'
listen_addr = "0.0.0.0:9735"
max_connections = 500
target_peers = 100
min_peers = 50
storage_target_mb = 5000

# Seed node should seed aggressively
seeding_mode = "FullSpace"
bandwidth_limit_mbps = 50
EOF
```

---

## Multi-Region Seed Network

### Recommended Topology

```
                    ┌─────────────────────┐
                    │    Europe Seed      │
                    │   (Hetzner, DE)     │
                    │   seed1.swimchain.io│
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   US East Seed  │   │   US West Seed  │   │   Asia Seed     │
│ (DigitalOcean)  │   │    (Vultr)      │   │   (Linode)      │
│ seed2.swimchain │   │ seed3.swimchain │   │ seed4.swimchain │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

### Configuring Seed Connections

Each seed should know about the others:

```toml
# /var/lib/swimchain/seeds.toml

[[seeds]]
address = "seed1.swimchain.io:9735"
transport = "tcp_v4"

[[seeds]]
address = "seed2.swimchain.io:9735"
transport = "tcp_v4"

[[seeds]]
address = "seed3.swimchain.io:9735"
transport = "tcp_v4"

[[seeds]]
address = "seed4.swimchain.io:9735"
transport = "tcp_v4"
```

---

## Monitoring

### Health Checks

```bash
# Check if node is running
cs node status

# Check peer count
cs node peers | wc -l

# Check sync status
cs node sync

# Check contribution metrics
cs node contribution
```

### Prometheus Metrics

The node exposes metrics at `/metrics` (when HTTP endpoint is enabled):

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'swimchain'
    static_configs:
      - targets: ['localhost:9736']
```

Key metrics:
- `swimchain_peers_connected` - Current peer count
- `swimchain_chain_height` - Current block height
- `swimchain_bytes_sent_total` - Total bytes sent
- `swimchain_bytes_received_total` - Total bytes received
- `swimchain_content_stored_bytes` - Storage usage

### Alerting

Basic alerts for seed nodes:

```yaml
# alertmanager rules
groups:
  - name: swimchain
    rules:
      - alert: LowPeerCount
        expr: swimchain_peers_connected < 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Low peer count on {{ $labels.instance }}"

      - alert: SyncLag
        expr: swimchain_sync_lag_seconds > 300
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Node {{ $labels.instance }} is out of sync"
```

---

## Backup and Recovery

### What to Backup

| Item | Location | Importance |
|------|----------|------------|
| Identity | `data_dir/identity.enc` | **Critical** - lose this, lose identity |
| Config | `data_dir/config.toml` | Low - can recreate |
| Peer cache | `data_dir/peers/` | Low - will rediscover |
| Chain data | `data_dir/chain/` | Medium - can resync |
| Content cache | `data_dir/blobs/` | Low - will refetch |

### Backup Script

```bash
#!/bin/bash
# backup-swimchain.sh

DATA_DIR="${CHAINSOCIAL_DATA_DIR:-$HOME/.swimchain}"
BACKUP_DIR="/backup/swimchain/$(date +%Y%m%d)"

mkdir -p "$BACKUP_DIR"

# Backup critical files
cp "$DATA_DIR/identity.enc" "$BACKUP_DIR/"
cp "$DATA_DIR/config.toml" "$BACKUP_DIR/" 2>/dev/null || true

# Compress
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

echo "Backup created: $BACKUP_DIR.tar.gz"
```

### Recovery

```bash
# Restore identity
cp backup/identity.enc /var/lib/swimchain/

# Restart node - it will resync chain from peers
sudo systemctl restart swimchain
```

---

## Troubleshooting

### Common Issues

#### Node won't start

```bash
# Check if port is in use
sudo lsof -i :9735

# Check logs
journalctl -u swimchain -n 100

# Run manually for detailed output
RUST_LOG=debug cs node start
```

#### No peers connecting

```bash
# Check firewall
sudo ufw status

# Test port is reachable (from another machine)
nc -zv <server-ip> 9735

# Check seed configuration
cat /var/lib/swimchain/seeds.toml
```

#### Sync stuck

```bash
# Check current sync status
cs node sync --verbose

# Try connecting to different peer
cs node connect <known-good-peer>:9735

# Force resync from scratch (loses local chain)
cs node stop
rm -rf /var/lib/swimchain/chain/
cs node start
```

#### High memory usage

```bash
# Check connection count
cs node peers | wc -l

# Reduce max connections in config
# max_connections = 50

# Check cache size
du -sh /var/lib/swimchain/blobs/

# Reduce storage target
# storage_target_mb = 500
```

---

## Security Checklist

### Server Hardening

- [ ] SSH key authentication only (disable password)
- [ ] Firewall enabled (only SSH + 9735)
- [ ] Automatic security updates enabled
- [ ] Non-root service user
- [ ] Systemd security hardening (PrivateTmp, etc.)

### Network Security

- [ ] Consider Tor hidden service for anonymity
- [ ] Use VPN if ISP blocks P2P traffic
- [ ] Monitor for unusual traffic patterns

### Identity Security

- [ ] Strong password on identity.enc
- [ ] Backup identity to secure location
- [ ] Never expose identity.enc publicly

---

## Upgrading

### Manual Upgrade

```bash
# Stop service
sudo systemctl stop swimchain

# Pull latest code
cd /path/to/swimchain
git pull

# Rebuild
cargo build --release

# Copy new binary
sudo cp target/release/cs /usr/local/bin/

# Start service
sudo systemctl start swimchain
```

### Automated Upgrade Script

```bash
#!/bin/bash
# upgrade-swimchain.sh

set -e

cd /opt/swimchain

# Check for updates
git fetch
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "Already up to date"
    exit 0
fi

echo "Upgrading swimchain..."

sudo systemctl stop swimchain

git pull
cargo build --release
sudo cp target/release/cs /usr/local/bin/

sudo systemctl start swimchain

echo "Upgrade complete!"
```

---

## Cost Estimates

### Monthly VPS Costs

| Configuration | Provider | Cost/month |
|---------------|----------|------------|
| Single seed | DigitalOcean | $6 |
| Single seed | Hetzner | €4 |
| 4-node network | Mixed | $25-30 |

### Bandwidth Estimates

| Node Type | Upload/month | Download/month |
|-----------|--------------|----------------|
| Personal node | 10-50 GB | 5-20 GB |
| Active seeder | 100-500 GB | 50-200 GB |
| Seed node | 1-5 TB | 500 GB - 2 TB |

---

## Related Documentation

- [Node Manager Design](node-manager.md) - Architecture details
- [SPEC_10 Node Operations](../specs/SPEC_10_NODE_OPERATIONS.md) - Formal specification
- [CLI Reference](cli-reference.md) - Command documentation
- [Mobile Viability](mobile-viability.md) - Mobile-specific considerations

---

*Created: 2025-12-26*
