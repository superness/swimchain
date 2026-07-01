/**
 * @swimchain/daemon - Embedded Node Daemon Manager
 *
 * Manages a local Swimchain node that runs as part of the client app.
 * Multiple client apps can share the same daemon.
 *
 * Architecture:
 *   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
 *   │ forum-client │  │ chat-client  │  │ CLI          │
 *   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
 *          │                 │                 │
 *          └─────────────────┼─────────────────┘
 *                            ▼
 *               ┌────────────────────────┐
 *               │  EMBEDDED NODE DAEMON  │ ← This package manages this
 *               │  RPC: localhost:9100   │
 *               └───────────┬────────────┘
 *                           │
 *                           ▼
 *                    ┌──────────────┐
 *                    │   NETWORK    │
 *                    └──────────────┘
 *
 * The daemon:
 * - Starts automatically when first client connects
 * - Keeps running while any client is using it
 * - Shuts down gracefully when all clients disconnect
 * - Uses reference counting to track active clients
 */

import { SwimchainClient } from '@swimchain/rpc';
import { spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';

// ============================================================================
// Types
// ============================================================================

export interface DaemonConfig {
  /** Network to connect to: 'mainnet' | 'testnet' | 'regtest' */
  network: 'mainnet' | 'testnet' | 'regtest';

  /** Data directory for node storage (default: ~/.swimchain) */
  dataDir?: string;

  /** RPC port (default: 9100 for mainnet, 19100 for testnet, 29100 for regtest) */
  rpcPort?: number;

  /** P2P port (default: 9735 for mainnet, 19735 for testnet, 29735 for regtest) */
  p2pPort?: number;

  /** Seed nodes to connect to (default: network-specific seeds) */
  seeds?: string[];

  /** Path to the sw binary (default: searches PATH) */
  binaryPath?: string;

  /** Timeout in ms to wait for node startup (default: 30000) */
  startupTimeout?: number;

  /** Enable debug logging */
  debug?: boolean;
}

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  rpcPort?: number;
  uptime?: number;
  network?: string;
  peerCount?: number;
  blockHeight?: number;
  clientCount: number;
}

interface DaemonState {
  pid: number;
  rpcPort: number;
  network: string;
  startedAt: number;
  clientRefs: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PORTS = {
  mainnet: { rpc: 9100, p2p: 9735 },
  testnet: { rpc: 19100, p2p: 19735 },
  regtest: { rpc: 29100, p2p: 29735 },
};

const DEFAULT_SEEDS = {
  mainnet: [],  // No mainnet yet
  testnet: [
    '64.225.115.108:19735',   // SFO
    '104.236.106.124:19735',  // NYC
  ],
  regtest: [],  // Local only
};

const DAEMON_STATE_FILE = 'daemon.json';
const DAEMON_LOCK_FILE = 'daemon.lock';
const RPC_COOKIE_FILE = '.cookie';

// ============================================================================
// Daemon Manager (Singleton per process)
// ============================================================================

/**
 * DaemonManager - Manages the embedded node daemon
 *
 * This is a singleton that handles starting, stopping, and connecting to
 * the local node daemon. Multiple clients can share the same daemon.
 *
 * @example
 * ```typescript
 * const daemon = new DaemonManager({ network: 'testnet' });
 *
 * // This starts the daemon if not running, or connects to existing
 * const client = await daemon.connect();
 *
 * // Use the client
 * const info = await client.getInfo();
 *
 * // Disconnect when done (daemon keeps running if other clients exist)
 * await daemon.disconnect();
 * ```
 */
export class DaemonManager {
  private config: Required<DaemonConfig>;
  private dataDir: string;
  private stateFile: string;
  private lockFile: string;
  private cookieFile: string;
  private process: ChildProcess | null = null;
  private client: SwimchainClient | null = null;
  private connected = false;

  constructor(config: DaemonConfig) {
    const network = config.network;
    const ports = DEFAULT_PORTS[network];

    this.config = {
      network,
      dataDir: config.dataDir ?? join(homedir(), '.swimchain'),
      rpcPort: config.rpcPort ?? ports.rpc,
      p2pPort: config.p2pPort ?? ports.p2p,
      seeds: config.seeds ?? DEFAULT_SEEDS[network],
      binaryPath: config.binaryPath ?? this.findBinary(),
      startupTimeout: config.startupTimeout ?? 30000,
      debug: config.debug ?? false,
    };

    // Ensure data directory exists
    this.dataDir = join(this.config.dataDir, network);
    mkdirSync(this.dataDir, { recursive: true });

    this.stateFile = join(this.dataDir, DAEMON_STATE_FILE);
    this.lockFile = join(this.dataDir, DAEMON_LOCK_FILE);
    this.cookieFile = join(this.dataDir, RPC_COOKIE_FILE);
  }

  /**
   * Connect to the daemon, starting it if necessary
   *
   * @returns SwimchainClient connected to the local node
   */
  async connect(): Promise<SwimchainClient> {
    if (this.connected && this.client) {
      return this.client;
    }

    // Check if daemon is already running
    const existingState = this.readState();
    if (existingState && this.isProcessRunning(existingState.pid)) {
      this.log('Connecting to existing daemon', { pid: existingState.pid });
      this.client = await this.createClient();

      // Increment reference count
      existingState.clientRefs++;
      this.writeState(existingState);
      this.connected = true;

      return this.client;
    }

    // Start new daemon
    this.log('Starting new daemon');
    await this.startDaemon();

    this.client = await this.createClient();
    this.connected = true;

    return this.client;
  }

  /**
   * Disconnect from the daemon
   *
   * The daemon keeps running if other clients are connected.
   * Shuts down only when the last client disconnects.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    const state = this.readState();
    if (state) {
      state.clientRefs = Math.max(0, state.clientRefs - 1);

      if (state.clientRefs === 0) {
        this.log('Last client disconnected, stopping daemon');
        await this.stopDaemon();
      } else {
        this.log(`Disconnected, ${state.clientRefs} clients remaining`);
        this.writeState(state);
      }
    }

    this.client = null;
    this.connected = false;
  }

  /**
   * Get daemon status
   */
  async getStatus(): Promise<DaemonStatus> {
    const state = this.readState();

    if (!state || !this.isProcessRunning(state.pid)) {
      return { running: false, clientCount: 0 };
    }

    const status: DaemonStatus = {
      running: true,
      pid: state.pid,
      rpcPort: state.rpcPort,
      uptime: Math.floor((Date.now() - state.startedAt) / 1000),
      network: state.network,
      clientCount: state.clientRefs,
    };

    // Try to get node info
    try {
      const client = await this.createClient();
      const info = await client.getInfo();
      status.peerCount = info.peer_count;
      status.blockHeight = info.block_height;
    } catch {
      // Node might be starting up
    }

    return status;
  }

  /**
   * Force stop the daemon (even if clients are connected)
   */
  async forceStop(): Promise<void> {
    const state = this.readState();
    if (state && this.isProcessRunning(state.pid)) {
      await this.stopDaemon();
    }
    this.cleanup();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async startDaemon(): Promise<void> {
    const args = this.buildArgs();
    this.log('Starting daemon with args', args);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Daemon failed to start within ${this.config.startupTimeout}ms`));
      }, this.config.startupTimeout);

      this.process = spawn(this.config.binaryPath, args, {
        detached: true,  // Run independently of parent process
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this.dataDir,
      });

      // Capture stderr for debugging
      let stderr = '';
      this.process.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (this.config.debug) {
          console.error('[daemon stderr]', data.toString());
        }
      });

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start daemon: ${err.message}`));
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(timeout);
          reject(new Error(`Daemon exited with code ${code}: ${stderr}`));
        }
      });

      // Wait for RPC to become available
      this.waitForRpc()
        .then(() => {
          clearTimeout(timeout);

          // Write state file
          const state: DaemonState = {
            pid: this.process!.pid!,
            rpcPort: this.config.rpcPort,
            network: this.config.network,
            startedAt: Date.now(),
            clientRefs: 1,
          };
          this.writeState(state);

          // Detach process so it survives parent exit
          this.process!.unref();

          this.log('Daemon started', { pid: state.pid });
          resolve();
        })
        .catch((err) => {
          clearTimeout(timeout);
          this.process?.kill();
          reject(err);
        });
    });
  }

  private async stopDaemon(): Promise<void> {
    const state = this.readState();
    if (!state) {
      return;
    }

    try {
      // Try graceful shutdown via RPC
      const client = await this.createClient();
      await client.stop();
      this.log('Sent stop command to daemon');
    } catch {
      // RPC failed, kill process directly
      if (this.isProcessRunning(state.pid)) {
        this.log('Killing daemon process', { pid: state.pid });
        process.kill(state.pid, 'SIGTERM');
      }
    }

    // Wait for process to exit
    await this.waitForExit(state.pid, 5000);
    this.cleanup();
  }

  private async waitForRpc(): Promise<void> {
    const maxAttempts = 60;  // 30 seconds
    const interval = 500;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const client = await this.createClient();
        await client.ping();
        return;
      } catch {
        await this.sleep(interval);
      }
    }

    throw new Error('RPC did not become available');
  }

  private async waitForExit(pid: number, timeout: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!this.isProcessRunning(pid)) {
        return;
      }
      await this.sleep(100);
    }
    // Force kill if still running
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process may have already exited
    }
  }

  private async createClient(): Promise<SwimchainClient> {
    const auth = this.readCookie();
    return new SwimchainClient({
      endpoint: `http://127.0.0.1:${this.config.rpcPort}`,
      auth: auth ? { username: '__cookie__', password: auth } : undefined,
      timeout: 10000,
    });
  }

  private buildArgs(): string[] {
    const args = ['node', 'start'];

    // Network
    if (this.config.network === 'testnet') {
      args.push('--testnet');
    } else if (this.config.network === 'regtest') {
      args.push('--regtest');
    }

    // Data directory
    args.push('--data-dir', this.dataDir);

    // Ports
    args.push('--rpc-port', String(this.config.rpcPort));
    args.push('--p2p-port', String(this.config.p2pPort));

    // Seeds
    for (const seed of this.config.seeds) {
      args.push('--seed', seed);
    }

    // Daemon mode (no interactive output)
    args.push('--daemon');

    return args;
  }

  private findBinary(): string {
    // Check common locations
    const candidates = [
      'sw',                                    // In PATH
      './target/release/sw',                   // Local release build
      './target/debug/sw',                     // Local debug build
      join(homedir(), '.swimchain', 'bin', 'sw'),  // User install
    ];

    // Platform-specific
    if (platform() === 'win32') {
      candidates.push('sw.exe');
      candidates.push('.\\target\\release\\sw.exe');
    }

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    // Assume it's in PATH
    return 'sw';
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);  // Signal 0 just checks if process exists
      return true;
    } catch {
      return false;
    }
  }

  private readState(): DaemonState | null {
    try {
      if (!existsSync(this.stateFile)) {
        return null;
      }
      const content = readFileSync(this.stateFile, 'utf-8');
      return JSON.parse(content) as DaemonState;
    } catch {
      return null;
    }
  }

  private writeState(state: DaemonState): void {
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  private readCookie(): string | null {
    try {
      if (!existsSync(this.cookieFile)) {
        return null;
      }
      return readFileSync(this.cookieFile, 'utf-8').trim();
    } catch {
      return null;
    }
  }

  private cleanup(): void {
    try {
      if (existsSync(this.stateFile)) {
        unlinkSync(this.stateFile);
      }
      if (existsSync(this.lockFile)) {
        unlinkSync(this.lockFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[DaemonManager] ${message}`, data ?? '');
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let defaultDaemon: DaemonManager | null = null;

/**
 * Get or create the default daemon for the specified network
 */
export function getDaemon(network: 'mainnet' | 'testnet' | 'regtest' = 'testnet'): DaemonManager {
  if (!defaultDaemon || defaultDaemon['config'].network !== network) {
    defaultDaemon = new DaemonManager({ network });
  }
  return defaultDaemon;
}

/**
 * Quick connect to local node (starts daemon if needed)
 *
 * @example
 * ```typescript
 * const client = await quickConnect('testnet');
 * const info = await client.getInfo();
 * ```
 */
export async function quickConnect(
  network: 'mainnet' | 'testnet' | 'regtest' = 'testnet'
): Promise<SwimchainClient> {
  const daemon = getDaemon(network);
  return daemon.connect();
}

// Default export
export default DaemonManager;
