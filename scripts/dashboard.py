#!/usr/bin/env python3
"""
Swimchain Network Dashboard + Block Explorer
Shows status of all nodes, mempool, and block history.
"""

import http.server
import json
import os
import subprocess
import threading
import time
from pathlib import Path

# Configuration
REFRESH_INTERVAL = 2  # seconds
HTTP_PORT = 8080
PASSWORD = os.environ.get('SWIMCHAIN_PASSWORD', 'testpass')
PROJECT_ROOT = Path(__file__).parent.parent
SW_BINARY = PROJECT_ROOT / 'target' / 'release' / 'sw'

# Find all testnet directories and return the base names (without -testnet suffix)
def find_testnet_dirs():
    dirs = []
    for d in PROJECT_ROOT.iterdir():
        if d.is_dir() and d.name.endswith('-testnet') and not d.name.endswith('-testnet-testnet'):
            # Return the base name (e.g., "alpha" not "alpha-testnet")
            # because --data-dir=alpha automatically appends -testnet in testnet mode
            base_name = d.name.replace('-testnet', '')
            dirs.append((base_name, d))
    return sorted(dirs, key=lambda x: x[0])

# Get a working data dir for queries (returns base name)
def get_data_dir():
    dirs = find_testnet_dirs()
    return dirs[0][0] if dirs else None

# Query a node's status
def query_node(data_dir):
    try:
        env = os.environ.copy()
        env['SWIMCHAIN_PASSWORD'] = PASSWORD
        result = subprocess.run(
            [str(SW_BINARY), '--testnet', f'--data-dir={data_dir}', 'sync', 'status', '--json'],
            capture_output=True, text=True, timeout=5, env=env
        )
        for line in result.stdout.split('\n'):
            line = line.strip()
            if line.startswith('{'):
                return json.loads(line)
    except Exception as e:
        return {'error': str(e)}
    return {'error': 'no response'}

# Query remote seed nodes
def query_seed(host):
    try:
        result = subprocess.run(
            ['ssh', '-o', 'ConnectTimeout=3', '-o', 'StrictHostKeyChecking=no', f'root@{host}',
             f"SWIMCHAIN_PASSWORD='testpass123' /usr/local/bin/sw --testnet --data-dir /var/lib/swimchain sync status --json 2>/dev/null"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.split('\n'):
            line = line.strip()
            if line.startswith('{'):
                return json.loads(line)
    except Exception as e:
        return {'error': str(e)}
    return {'error': 'no response'}

# Query block info from seed node
def query_block(height):
    try:
        result = subprocess.run(
            ['ssh', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=no', 'root@64.225.115.108',
             f"SWIMCHAIN_PASSWORD='testpass123' /usr/local/bin/sw --testnet --data-dir /var/lib/swimchain block view {height} 2>/dev/null"],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            return {'error': f'Block {height} not found', 'raw': result.stderr}
        return {'raw': result.stdout}
    except Exception as e:
        return {'error': str(e)}

# Query chain stats
def query_stats():
    data_dir = get_data_dir()
    if not data_dir:
        return {'error': 'no data dir'}
    try:
        env = os.environ.copy()
        env['SWIMCHAIN_PASSWORD'] = PASSWORD
        result = subprocess.run(
            [str(SW_BINARY), '--testnet', f'--data-dir={data_dir}', 'block', 'stats', '--json'],
            capture_output=True, text=True, timeout=5, env=env
        )
        for line in result.stdout.split('\n'):
            line = line.strip()
            if line.startswith('{'):
                return json.loads(line)
        return {'raw': result.stdout}
    except Exception as e:
        return {'error': str(e)}

# Query seed logs for block formation
def query_seed_logs():
    try:
        result = subprocess.run(
            ['ssh', '-o', 'ConnectTimeout=3', '-o', 'StrictHostKeyChecking=no', 'root@64.225.115.108',
             "journalctl -u swimchain --no-pager -n 100 2>/dev/null | grep -E '(BLOCK|REORG|MEMPOOL|threshold)' | tail -30"],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip().split('\n')
    except Exception as e:
        return [f'Error: {e}']

# Global state
node_states = {}
recent_logs = []
lock = threading.Lock()

def update_states():
    global node_states, recent_logs
    while True:
        new_states = {}

        # Query local nodes
        for base_name, full_path in find_testnet_dirs():
            new_states[base_name] = query_node(base_name)
            new_states[base_name]['type'] = 'local'

        # Query seed nodes
        new_states['SF-Seed'] = query_seed('64.225.115.108')
        new_states['SF-Seed']['type'] = 'seed'
        new_states['NYC-Seed'] = query_seed('104.236.106.124')
        new_states['NYC-Seed']['type'] = 'seed'

        # Get recent logs
        logs = query_seed_logs()

        with lock:
            node_states = new_states
            recent_logs = logs

        time.sleep(REFRESH_INTERVAL)

# HTML Dashboard
HTML = '''<!DOCTYPE html>
<html>
<head>
    <title>Swimchain Network Dashboard</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0f;
            color: #eee;
            margin: 0;
            padding: 20px;
        }
        h1 { color: #00d9ff; margin-bottom: 5px; }
        h2 { color: #00d9ff; margin-top: 30px; border-bottom: 1px solid #333; padding-bottom: 10px; }
        .subtitle { color: #888; margin-bottom: 20px; }

        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        .tab {
            padding: 10px 20px;
            background: #16213e;
            border: none;
            border-radius: 5px;
            color: #888;
            cursor: pointer;
            font-size: 14px;
        }
        .tab.active { background: #00d9ff; color: #000; }
        .tab:hover { background: #1a3a5c; color: #fff; }
        .tab.active:hover { background: #00d9ff; }

        .panel { display: none; }
        .panel.active { display: block; }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 12px;
        }
        .card {
            background: #12121a;
            border-radius: 8px;
            padding: 12px;
            border-left: 3px solid #00d9ff;
        }
        .card.seed { border-left-color: #ff6b6b; }
        .card.offline { border-left-color: #444; opacity: 0.5; }
        .card h3 { margin: 0 0 8px 0; color: #00d9ff; font-size: 14px; }
        .card.seed h3 { color: #ff6b6b; }
        .stat { display: flex; justify-content: space-between; margin: 3px 0; font-size: 12px; }
        .stat-label { color: #666; }
        .stat-value { font-weight: bold; font-family: 'SF Mono', Monaco, monospace; }
        .stat-value.synced { color: #4ade80; }
        .stat-value.syncing { color: #fbbf24; }
        .stat-value.offline { color: #ef4444; }
        .height { font-size: 28px; color: #00d9ff; font-weight: bold; }

        .summary {
            background: #12121a;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            display: flex;
            gap: 40px;
            flex-wrap: wrap;
        }
        .summary-stat { text-align: center; }
        .summary-stat .value { font-size: 36px; color: #00d9ff; font-weight: bold; }
        .summary-stat .label { color: #666; font-size: 11px; text-transform: uppercase; }

        .logs {
            background: #0d0d12;
            border-radius: 8px;
            padding: 15px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 11px;
            max-height: 400px;
            overflow-y: auto;
            line-height: 1.6;
        }
        .log-line { white-space: pre-wrap; word-break: break-all; }
        .log-line.reorg { color: #fbbf24; }
        .log-line.block { color: #4ade80; }
        .log-line.mempool { color: #a78bfa; }

        .block-explorer {
            background: #12121a;
            border-radius: 8px;
            padding: 20px;
        }
        .block-nav {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            align-items: center;
        }
        .block-nav input {
            background: #0d0d12;
            border: 1px solid #333;
            border-radius: 5px;
            padding: 8px 12px;
            color: #fff;
            width: 100px;
            font-family: monospace;
        }
        .block-nav button {
            padding: 8px 15px;
            background: #00d9ff;
            border: none;
            border-radius: 5px;
            color: #000;
            cursor: pointer;
            font-weight: bold;
        }
        .block-info { font-family: monospace; font-size: 13px; line-height: 1.8; }
        .block-info .label { color: #666; display: inline-block; width: 150px; }
        .block-info .hash { color: #00d9ff; }
    </style>
</head>
<body>
    <h1>Swimchain Network Dashboard</h1>
    <p class="subtitle">Auto-refreshes every 2 seconds</p>

    <div class="tabs">
        <button class="tab active" onclick="showTab('nodes')">Nodes</button>
        <button class="tab" onclick="showTab('logs')">Live Logs</button>
        <button class="tab" onclick="showTab('explorer')">Block Explorer</button>
    </div>

    <div id="nodes-panel" class="panel active">
        <div class="summary" id="summary">
            <div class="summary-stat">
                <div class="value" id="total-nodes">-</div>
                <div class="label">Total Nodes</div>
            </div>
            <div class="summary-stat">
                <div class="value" id="online-nodes">-</div>
                <div class="label">Online</div>
            </div>
            <div class="summary-stat">
                <div class="value" id="max-height">-</div>
                <div class="label">Chain Height</div>
            </div>
            <div class="summary-stat">
                <div class="value" id="total-peers">-</div>
                <div class="label">Peer Connections</div>
            </div>
            <div class="summary-stat">
                <div class="value" id="unique-tips">-</div>
                <div class="label">Unique Tips</div>
            </div>
            <div class="summary-stat">
                <div class="value" id="eligible-nodes">-</div>
                <div class="label">Eligible Leaders</div>
            </div>
        </div>
        <div id="tip-summary" style="background:#12121a;border-radius:8px;padding:10px;margin-bottom:20px;font-family:monospace;font-size:12px;display:none;">
        </div>
        <div class="grid" id="nodes"></div>
    </div>

    <div id="logs-panel" class="panel">
        <h2>Recent Block & Mempool Activity (SF Seed)</h2>
        <div class="logs" id="logs">Loading...</div>
    </div>

    <div id="explorer-panel" class="panel">
        <h2>Block Explorer</h2>
        <div class="block-explorer">
            <div class="block-nav">
                <button onclick="loadBlock(currentBlock - 1)">◀ Prev</button>
                <input type="number" id="block-height" value="1" min="0">
                <button onclick="loadBlock(document.getElementById('block-height').value)">Go</button>
                <button onclick="loadBlock(currentBlock + 1)">Next ▶</button>
                <button onclick="loadBlock('latest')">Latest</button>
            </div>
            <div class="block-info" id="block-info">Select a block to view details</div>
        </div>
    </div>

    <script>
        let currentBlock = 1;

        function showTab(name) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            document.querySelector(`[onclick="showTab('${name}')"]`).classList.add('active');
            document.getElementById(name + '-panel').classList.add('active');
        }

        // Format large distance values in a readable way
        function formatDistance(val) {
            if (val === 0) return '0';
            if (val === undefined || val === null) return '-';

            // Convert to hex and show first 8 chars
            let hex = val.toString(16).toUpperCase().padStart(16, '0');
            return hex.substring(0, 8) + '...';
        }

        async function refresh() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();

                const nodes = document.getElementById('nodes');
                nodes.innerHTML = '';

                let totalNodes = 0, onlineNodes = 0, maxHeight = 0, totalPeers = 0, eligibleNodes = 0;

                const sorted = Object.entries(data).sort((a, b) => {
                    if (a[1].type === 'seed' && b[1].type !== 'seed') return -1;
                    if (a[1].type !== 'seed' && b[1].type === 'seed') return 1;
                    return a[0].localeCompare(b[0]);
                });

                for (const [name, status] of sorted) {
                    totalNodes++;
                    const isOnline = !status.error && status.connected_peers !== undefined;
                    const isSeed = status.type === 'seed';

                    if (isOnline) {
                        onlineNodes++;
                        maxHeight = Math.max(maxHeight, status.local_chain_height || 0);
                        totalPeers += status.connected_peers || 0;
                        if (status.leader_eligible) eligibleNodes++;
                    }

                    const card = document.createElement('div');
                    card.className = 'card' + (isSeed ? ' seed' : '') + (!isOnline ? ' offline' : '');

                    if (isOnline) {
                        const syncClass = status.syncing ? 'syncing' : 'synced';
                        const syncText = status.syncing ? 'SYNCING' : 'SYNCED';
                        const tipHash = status.tip_hash || '-';
                        const mempoolPow = status.mempool_pow || 0;
                        const mempoolThreshold = status.mempool_threshold || 30;
                        const mempoolActions = status.mempool_actions || 0;
                        const mempoolWaiting = status.mempool_waiting_secs || 0;
                        const mempoolPct = Math.min(100, Math.round(mempoolPow / mempoolThreshold * 100));
                        const mempoolColor = mempoolPow >= mempoolThreshold ? '#4ade80' : (mempoolPow > 0 ? '#fbbf24' : '#666');
                        const waitingText = mempoolWaiting > 0 ? ` (wait ${mempoolWaiting}s)` : '';

                        // Leader election info
                        const nodeId = status.node_identity || '-';
                        const leaderDistance = status.leader_distance !== undefined ? formatDistance(status.leader_distance) : '-';
                        const leaderThreshold = status.leader_threshold !== undefined ? formatDistance(status.leader_threshold) : '-';
                        const isEligible = status.leader_eligible;
                        const etaSecs = status.leader_eta_secs || 0;
                        const eligibleColor = isEligible ? '#4ade80' : '#fbbf24';
                        const eligibleText = isEligible ? 'ELIGIBLE' : `ETA ${etaSecs}s`;

                        card.innerHTML = `
                            <h3>${name}</h3>
                            <div class="height">${status.local_chain_height || 0}</div>
                            <div class="stat"><span class="stat-label">Tip</span><span class="stat-value" style="font-family:monospace;color:#00d9ff;">${tipHash}</span></div>
                            <div class="stat"><span class="stat-label">Peers</span><span class="stat-value">${status.connected_peers || 0}</span></div>
                            <div class="stat"><span class="stat-label">Mempool</span><span class="stat-value" style="color:${mempoolColor}">${mempoolPow}/${mempoolThreshold}s (${mempoolActions} actions)${waitingText}</span></div>
                            <div class="stat"><span class="stat-label">Status</span><span class="stat-value ${syncClass}">${syncText}</span></div>
                            <div class="stat" style="margin-top:8px;padding-top:8px;border-top:1px solid #333;"><span class="stat-label">Node ID</span><span class="stat-value" style="color:#888;font-size:10px;">${nodeId}</span></div>
                            <div class="stat"><span class="stat-label">Distance</span><span class="stat-value" style="font-size:10px;">${leaderDistance}</span></div>
                            <div class="stat"><span class="stat-label">Threshold</span><span class="stat-value" style="font-size:10px;">${leaderThreshold}</span></div>
                            <div class="stat"><span class="stat-label">Leader</span><span class="stat-value" style="color:${eligibleColor}">${eligibleText}</span></div>
                        `;
                    } else {
                        card.innerHTML = `
                            <h3>${name}</h3>
                            <div class="stat"><span class="stat-label">Status</span><span class="stat-value offline">OFFLINE</span></div>
                        `;
                    }
                    nodes.appendChild(card);
                }

                document.getElementById('total-nodes').textContent = totalNodes;
                document.getElementById('online-nodes').textContent = onlineNodes;
                document.getElementById('max-height').textContent = maxHeight;
                document.getElementById('total-peers').textContent = totalPeers;
                document.getElementById('eligible-nodes').textContent = eligibleNodes;
                document.getElementById('eligible-nodes').style.color = eligibleNodes > 0 ? '#4ade80' : '#fbbf24';

                // Count unique tip hashes and show summary
                const tipCounts = {};
                for (const [name, status] of sorted) {
                    if (!status.error && status.tip_hash) {
                        const tip = status.tip_hash;
                        if (!tipCounts[tip]) tipCounts[tip] = [];
                        tipCounts[tip].push(name);
                    }
                }
                const uniqueTips = Object.keys(tipCounts).length;
                document.getElementById('unique-tips').textContent = uniqueTips;
                document.getElementById('unique-tips').style.color = uniqueTips <= 1 ? '#4ade80' : '#ef4444';

                // Show tip summary if multiple unique tips (potential fork)
                const tipSummary = document.getElementById('tip-summary');
                if (uniqueTips > 1) {
                    tipSummary.style.display = 'block';
                    tipSummary.innerHTML = '<strong style="color:#fbbf24">Warning: Multiple chain tips detected!</strong><br>' +
                        Object.entries(tipCounts).map(([tip, nodes]) =>
                            `<span style="color:#00d9ff">${tip}</span>: ${nodes.join(', ')}`
                        ).join('<br>');
                } else if (uniqueTips === 1) {
                    tipSummary.style.display = 'block';
                    const tip = Object.keys(tipCounts)[0];
                    tipSummary.innerHTML = `<span style="color:#4ade80">All nodes on same tip:</span> <span style="color:#00d9ff">${tip}</span>`;
                } else {
                    tipSummary.style.display = 'none';
                }

                // Update logs
                const logsRes = await fetch('/api/logs');
                const logs = await logsRes.json();
                const logsEl = document.getElementById('logs');
                logsEl.innerHTML = logs.map(line => {
                    let cls = 'log-line';
                    if (line.includes('REORG')) cls += ' reorg';
                    else if (line.includes('BLOCK')) cls += ' block';
                    else if (line.includes('MEMPOOL')) cls += ' mempool';
                    return `<div class="${cls}">${escapeHtml(line)}</div>`;
                }).join('');

            } catch (e) {
                console.error('Refresh failed:', e);
            }
        }

        async function loadBlock(height) {
            if (height === 'latest') {
                height = parseInt(document.getElementById('max-height').textContent) || 1;
            }
            height = parseInt(height);
            if (height < 0) height = 0;
            currentBlock = height;
            document.getElementById('block-height').value = height;

            try {
                const res = await fetch('/api/block/' + height);
                const data = await res.json();
                const el = document.getElementById('block-info');

                if (data.error) {
                    el.innerHTML = `<span style="color:#ef4444">Error: ${data.error}</span>`;
                } else if (data.raw) {
                    el.innerHTML = `<pre>${escapeHtml(data.raw)}</pre>`;
                } else {
                    el.innerHTML = `
                        <div><span class="label">Height:</span> ${data.height || height}</div>
                        <div><span class="label">Hash:</span> <span class="hash">${data.hash || '-'}</span></div>
                        <div><span class="label">Timestamp:</span> ${data.timestamp || '-'}</div>
                        <div><span class="label">Total PoW:</span> ${data.total_pow || '-'} seconds</div>
                        <div><span class="label">Prev Hash:</span> <span class="hash">${data.prev_root_hash || '-'}</span></div>
                        <div><span class="label">Space Blocks:</span> ${data.space_block_count || '-'}</div>
                    `;
                }
            } catch (e) {
                document.getElementById('block-info').innerHTML = `<span style="color:#ef4444">Error loading block</span>`;
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        refresh();
        setInterval(refresh, 2000);
    </script>
</body>
</html>
'''

class DashboardHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(HTML.encode())
        elif self.path == '/api/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            with lock:
                self.wfile.write(json.dumps(node_states).encode())
        elif self.path == '/api/logs':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            with lock:
                self.wfile.write(json.dumps(recent_logs).encode())
        elif self.path.startswith('/api/block/'):
            height = self.path.split('/')[-1]
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(query_block(height)).encode())
        else:
            self.send_response(404)
            self.end_headers()

def main():
    print(f"╔════════════════════════════════════════════════════════╗")
    print(f"║  Swimchain Network Dashboard                           ║")
    print(f"╚════════════════════════════════════════════════════════╝")
    print(f"")
    print(f"  URL: http://localhost:{HTTP_PORT}")
    print(f"  Nodes: {len(find_testnet_dirs())} local + 2 seeds")
    print(f"")

    updater = threading.Thread(target=update_states, daemon=True)
    updater.start()

    server = http.server.HTTPServer(('0.0.0.0', HTTP_PORT), DashboardHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")

if __name__ == '__main__':
    main()
