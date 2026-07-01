#!/usr/bin/env node
/**
 * daemon-control.js - Start/stop swimchain node and forum-client with health checks
 *
 * Usage:
 *   node scripts/daemon-control.js start [--node-only|--client-only]
 *   node scripts/daemon-control.js stop [--node-only|--client-only]
 *   node scripts/daemon-control.js status
 *   node scripts/daemon-control.js restart [--node-only|--client-only]
 *   node scripts/daemon-control.js health
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    projectRoot: path.resolve(__dirname, '..'),
    node: {
        binary: 'target/release/sw',
        network: '--testnet',
        dataDir: 'genesis',
        p2pPort: 19735,
        rpcPort: 19736,
        logFile: 'node-genesis.log',
        password: process.env.SWIMCHAIN_PASSWORD || 'testpass123',
        healthTimeout: 5000,
        startupTimeout: 30000,
    },
    forumClient: {
        dir: 'forum-client',
        port: 5173,
        healthTimeout: 5000,
        startupTimeout: 60000,
    },
    pidDir: '.daemon-pids',
};

// Ensure pid directory exists
const pidDir = path.join(CONFIG.projectRoot, CONFIG.pidDir);
if (!fs.existsSync(pidDir)) {
    fs.mkdirSync(pidDir, { recursive: true });
}

// Colors for terminal output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
};

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// PID file management
function getPidFile(service) {
    return path.join(pidDir, `${service}.pid`);
}

function writePid(service, pid) {
    fs.writeFileSync(getPidFile(service), String(pid));
}

function readPid(service) {
    const pidFile = getPidFile(service);
    if (fs.existsSync(pidFile)) {
        return parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    }
    return null;
}

function clearPid(service) {
    const pidFile = getPidFile(service);
    if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
    }
}

function isProcessRunning(pid) {
    if (!pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

// Health check functions
async function checkNodeHealth() {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'get_sync_status',
            params: {},
        });

        const options = {
            hostname: '127.0.0.1',
            port: CONFIG.node.rpcPort,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
            timeout: CONFIG.node.healthTimeout,
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve({
                        healthy: !result.error,
                        data: result.result || result.error,
                    });
                } catch {
                    resolve({ healthy: false, error: 'Invalid JSON response' });
                }
            });
        });

        req.on('error', (e) => resolve({ healthy: false, error: e.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ healthy: false, error: 'Timeout' });
        });

        req.write(body);
        req.end();
    });
}

async function checkForumClientHealth() {
    return new Promise((resolve) => {
        const options = {
            hostname: '127.0.0.1',
            port: CONFIG.forumClient.port,
            path: '/',
            method: 'GET',
            timeout: CONFIG.forumClient.healthTimeout,
        };

        const req = http.request(options, (res) => {
            resolve({
                healthy: res.statusCode === 200,
                statusCode: res.statusCode,
            });
        });

        req.on('error', (e) => resolve({ healthy: false, error: e.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ healthy: false, error: 'Timeout' });
        });

        req.end();
    });
}

// Wait for service to become healthy
async function waitForHealth(checkFn, timeout, serviceName) {
    const start = Date.now();
    const interval = 1000;

    while (Date.now() - start < timeout) {
        const result = await checkFn();
        if (result.healthy) {
            return { success: true, result };
        }
        await new Promise((r) => setTimeout(r, interval));
    }

    return { success: false, error: `${serviceName} failed to become healthy within ${timeout}ms` };
}

// Start swimchain node
async function startNode() {
    const pid = readPid('node');
    if (pid && isProcessRunning(pid)) {
        log('yellow', 'Node is already running (PID: ' + pid + ')');
        return true;
    }

    log('blue', 'Starting swimchain node...');

    const binaryPath = path.join(CONFIG.projectRoot, CONFIG.node.binary);
    if (!fs.existsSync(binaryPath)) {
        log('red', `Binary not found: ${binaryPath}`);
        log('yellow', 'Run: cargo build --release');
        return false;
    }

    const logFile = path.join(CONFIG.projectRoot, CONFIG.node.logFile);
    const logStream = fs.openSync(logFile, 'a');

    const env = {
        ...process.env,
        SWIMCHAIN_PASSWORD: CONFIG.node.password,
    };

    const args = [
        CONFIG.node.network,
        `--data-dir=${CONFIG.node.dataDir}`,
        'node',
        'start',
        '--listen',
        `0.0.0.0:${CONFIG.node.p2pPort}`,
    ];

    const child = spawn(binaryPath, args, {
        cwd: CONFIG.projectRoot,
        env,
        detached: true,
        stdio: ['ignore', logStream, logStream],
    });

    child.unref();
    writePid('node', child.pid);

    log('blue', `Node started (PID: ${child.pid})`);
    log('blue', `Log file: ${logFile}`);
    log('blue', `RPC endpoint: http://127.0.0.1:${CONFIG.node.rpcPort}`);

    // Wait for health
    log('blue', 'Waiting for node to become healthy...');
    const healthResult = await waitForHealth(
        checkNodeHealth,
        CONFIG.node.startupTimeout,
        'Node'
    );

    if (healthResult.success) {
        log('green', 'Node is healthy!');
        return true;
    } else {
        log('yellow', `Warning: ${healthResult.error}`);
        log('yellow', 'Node may still be starting up. Check logs for details.');
        return true; // Still return true as process started
    }
}

// Start forum-client
async function startForumClient() {
    const pid = readPid('forum-client');
    if (pid && isProcessRunning(pid)) {
        log('yellow', 'Forum client is already running (PID: ' + pid + ')');
        return true;
    }

    log('blue', 'Starting forum-client...');

    const clientDir = path.join(CONFIG.projectRoot, CONFIG.forumClient.dir);
    if (!fs.existsSync(clientDir)) {
        log('red', `Forum client directory not found: ${clientDir}`);
        return false;
    }

    // Check if node_modules exists, install if not
    const nodeModules = path.join(clientDir, 'node_modules');
    if (!fs.existsSync(nodeModules)) {
        log('blue', 'Installing forum-client dependencies...');
        try {
            execSync('npm install', { cwd: clientDir, stdio: 'inherit' });
        } catch (e) {
            log('red', 'Failed to install dependencies');
            return false;
        }
    }

    const logFile = path.join(CONFIG.projectRoot, 'forum-client.log');
    const logStream = fs.openSync(logFile, 'a');

    const child = spawn('npm', ['run', 'dev'], {
        cwd: clientDir,
        detached: true,
        stdio: ['ignore', logStream, logStream],
        shell: true,
    });

    child.unref();
    writePid('forum-client', child.pid);

    log('blue', `Forum client started (PID: ${child.pid})`);
    log('blue', `Log file: ${logFile}`);
    log('blue', `URL: http://localhost:${CONFIG.forumClient.port}`);

    // Wait for health
    log('blue', 'Waiting for forum-client to become healthy...');
    const healthResult = await waitForHealth(
        checkForumClientHealth,
        CONFIG.forumClient.startupTimeout,
        'Forum client'
    );

    if (healthResult.success) {
        log('green', 'Forum client is healthy!');
        return true;
    } else {
        log('yellow', `Warning: ${healthResult.error}`);
        log('yellow', 'Forum client may still be starting up. Check logs for details.');
        return true;
    }
}

// Stop a service
function stopService(service, displayName) {
    const pid = readPid(service);
    if (!pid) {
        log('yellow', `${displayName} is not running (no PID file)`);
        return true;
    }

    if (!isProcessRunning(pid)) {
        log('yellow', `${displayName} is not running (stale PID: ${pid})`);
        clearPid(service);
        return true;
    }

    log('blue', `Stopping ${displayName} (PID: ${pid})...`);

    try {
        // Kill the process group (negative PID kills the group)
        process.kill(-pid, 'SIGTERM');
    } catch (e) {
        // If group kill fails, try individual process
        try {
            process.kill(pid, 'SIGTERM');
        } catch (e2) {
            log('yellow', `Process ${pid} already dead`);
        }
    }

    // Wait briefly for graceful shutdown
    let attempts = 10;
    while (attempts > 0 && isProcessRunning(pid)) {
        execSync('sleep 0.5');
        attempts--;
    }

    // Force kill if still running
    if (isProcessRunning(pid)) {
        log('yellow', 'Graceful shutdown failed, force killing...');
        try {
            process.kill(-pid, 'SIGKILL');
        } catch (e) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch (e2) {
                // Ignore
            }
        }
    }

    clearPid(service);
    log('green', `${displayName} stopped`);
    return true;
}

// Status check
async function getStatus() {
    const nodePid = readPid('node');
    const nodeRunning = nodePid && isProcessRunning(nodePid);
    const nodeHealth = nodeRunning ? await checkNodeHealth() : null;

    const clientPid = readPid('forum-client');
    const clientRunning = clientPid && isProcessRunning(clientPid);
    const clientHealth = clientRunning ? await checkForumClientHealth() : null;

    return {
        node: {
            running: nodeRunning,
            pid: nodePid,
            healthy: nodeHealth?.healthy || false,
            details: nodeHealth,
        },
        forumClient: {
            running: clientRunning,
            pid: clientPid,
            healthy: clientHealth?.healthy || false,
            details: clientHealth,
        },
    };
}

// Print status
async function printStatus() {
    log('blue', '\n=== Swimchain Daemon Status ===\n');

    const status = await getStatus();

    // Node status
    const nodeStatus = status.node.running
        ? status.node.healthy
            ? `${colors.green}RUNNING & HEALTHY${colors.reset}`
            : `${colors.yellow}RUNNING (unhealthy)${colors.reset}`
        : `${colors.red}STOPPED${colors.reset}`;
    console.log(`Swimchain Node:  ${nodeStatus}`);
    if (status.node.running) {
        console.log(`  PID: ${status.node.pid}`);
        console.log(`  RPC: http://127.0.0.1:${CONFIG.node.rpcPort}`);
        if (status.node.details?.data) {
            console.log(`  Sync: ${JSON.stringify(status.node.details.data).slice(0, 80)}...`);
        }
    }

    console.log('');

    // Forum client status
    const clientStatus = status.forumClient.running
        ? status.forumClient.healthy
            ? `${colors.green}RUNNING & HEALTHY${colors.reset}`
            : `${colors.yellow}RUNNING (unhealthy)${colors.reset}`
        : `${colors.red}STOPPED${colors.reset}`;
    console.log(`Forum Client:    ${clientStatus}`);
    if (status.forumClient.running) {
        console.log(`  PID: ${status.forumClient.pid}`);
        console.log(`  URL: http://localhost:${CONFIG.forumClient.port}`);
    }

    console.log('');
    return status;
}

// Main command handling
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const nodeOnly = args.includes('--node-only');
    const clientOnly = args.includes('--client-only');

    switch (command) {
        case 'start':
            if (!clientOnly) {
                await startNode();
            }
            if (!nodeOnly) {
                await startForumClient();
            }
            await printStatus();
            break;

        case 'stop':
            if (!clientOnly) {
                stopService('node', 'Swimchain Node');
            }
            if (!nodeOnly) {
                stopService('forum-client', 'Forum Client');
            }
            await printStatus();
            break;

        case 'restart':
            if (!clientOnly) {
                stopService('node', 'Swimchain Node');
                await startNode();
            }
            if (!nodeOnly) {
                stopService('forum-client', 'Forum Client');
                await startForumClient();
            }
            await printStatus();
            break;

        case 'status':
            await printStatus();
            break;

        case 'health':
            const status = await getStatus();
            const allHealthy = status.node.healthy && status.forumClient.healthy;
            if (allHealthy) {
                log('green', 'All services healthy');
                process.exit(0);
            } else {
                log('red', 'Some services unhealthy');
                await printStatus();
                process.exit(1);
            }
            break;

        default:
            console.log(`
Swimchain Daemon Control

Usage:
  node scripts/daemon-control.js <command> [options]

Commands:
  start     Start node and forum-client
  stop      Stop node and forum-client
  restart   Restart node and forum-client
  status    Show status of all services
  health    Check health (exit 0 if healthy, 1 otherwise)

Options:
  --node-only     Only affect swimchain node
  --client-only   Only affect forum-client

Examples:
  node scripts/daemon-control.js start
  node scripts/daemon-control.js stop --node-only
  node scripts/daemon-control.js restart --client-only
  node scripts/daemon-control.js health
`);
            break;
    }
}

main().catch((e) => {
    log('red', `Error: ${e.message}`);
    process.exit(1);
});
