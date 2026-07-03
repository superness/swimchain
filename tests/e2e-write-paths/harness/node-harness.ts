/**
 * Regtest node harness for e2e write-path tests.
 *
 * Responsibilities:
 *  - Locate (or complain about) the `sw` release binary
 *  - Create an isolated temp data dir + node identity
 *  - Start a regtest node and wait for RPC health
 *  - Tear down reliably (kill process tree, remove temp dir)
 *
 * Node under test:
 *   sw --regtest node start --listen 127.0.0.1:39735
 *   RPC = P2P port + 1 = 39736 (http://127.0.0.1:39736)
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, openSync, closeSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root = ../../.. from this file (tests/e2e-write-paths/harness) */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export const P2P_PORT = 39735;
export const RPC_PORT = P2P_PORT + 1;
export const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;

const NODE_PASSWORD = 'e2e-write-paths-password';
const HEALTH_TIMEOUT_MS = 60_000;

function findBinary(): string {
  if (process.env.SW_BIN && existsSync(process.env.SW_BIN)) {
    return process.env.SW_BIN;
  }
  const exe = process.platform === 'win32' ? 'sw.exe' : 'sw';
  const candidates = [
    path.join(REPO_ROOT, 'target', 'release', exe),
    path.join(REPO_ROOT, 'target', 'debug', exe),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    `sw binary not found. Build it first: cargo build --release (looked in ${candidates.join(', ')}). ` +
      'Or set SW_BIN to the binary path.',
  );
}

export class NodeHarness {
  private proc: ChildProcess | null = null;
  private dataDir: string | null = null;
  private logFd: number | null = null;
  public logPath: string | null = null;
  public binary: string;

  constructor() {
    this.binary = findBinary();
  }

  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      SWIMCHAIN_DATA_DIR: this.dataDir!,
      SWIMCHAIN_PASSWORD: NODE_PASSWORD,
      RUST_LOG: process.env.RUST_LOG ?? 'swimchain=info',
    };
  }

  async start(): Promise<void> {
    this.dataDir = mkdtempSync(path.join(tmpdir(), 'swimchain-e2e-'));
    this.logPath = path.join(this.dataDir, 'node.log');

    // 1. Create node identity (required before node start)
    const create = spawnSync(this.binary, ['--regtest', 'identity', 'create'], {
      env: this.env(),
      encoding: 'utf-8',
      timeout: 30_000,
    });
    if (create.status !== 0) {
      throw new Error(
        `identity create failed (exit ${create.status}):\n${create.stdout}\n${create.stderr}`,
      );
    }
    if (!existsSync(path.join(this.dataDir, 'identity.enc'))) {
      throw new Error(`identity.enc not created in ${this.dataDir}:\n${create.stdout}`);
    }

    // 2. Start the node, logging to file
    this.logFd = openSync(this.logPath, 'w');
    this.proc = spawn(
      this.binary,
      ['--regtest', 'node', 'start', '--listen', `127.0.0.1:${P2P_PORT}`],
      {
        env: this.env(),
        stdio: ['ignore', this.logFd, this.logFd],
        windowsHide: true,
      },
    );

    const startedProc = this.proc;
    let exited = false;
    startedProc.on('exit', () => {
      exited = true;
    });

    // 3. Wait for RPC health
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (exited) {
        throw new Error(`node exited early. Log tail:\n${this.logTail()}`);
      }
      try {
        const res = await fetch(`${RPC_URL}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          return;
        }
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    await this.stop();
    throw new Error(`node did not become healthy within ${HEALTH_TIMEOUT_MS}ms. Log tail:\n${this.logTail()}`);
  }

  logTail(lines = 40): string {
    try {
      if (this.logPath && existsSync(this.logPath)) {
        const content = readFileSync(this.logPath, 'utf-8');
        return content.split('\n').slice(-lines).join('\n');
      }
    } catch {
      /* ignore */
    }
    return '(no log available)';
  }

  async stop(): Promise<void> {
    if (this.proc && this.proc.pid && this.proc.exitCode === null) {
      const pid = this.proc.pid;
      if (process.platform === 'win32') {
        // Kill full process tree so no stray node processes remain
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf-8' });
      } else {
        try {
          this.proc.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
      // Wait for exit (max 10s)
      const deadline = Date.now() + 10_000;
      while (this.proc.exitCode === null && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (this.proc.exitCode === null) {
        try {
          this.proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }
    this.proc = null;

    if (this.logFd !== null) {
      try {
        closeSync(this.logFd);
      } catch {
        /* ignore */
      }
      this.logFd = null;
    }

    // Remove temp data dir (sled may hold locks briefly on Windows; retry)
    if (this.dataDir) {
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(this.dataDir, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      this.dataDir = null;
    }
  }
}
