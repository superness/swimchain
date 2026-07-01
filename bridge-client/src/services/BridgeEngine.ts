/**
 * Bridge Engine
 *
 * Coordinates bidirectional message bridging between platforms.
 * Handles PoW requirements for Swimchain posting.
 */

import type {
  BridgeConfig,
  BridgeMessage,
  Platform,
  PlatformStatus,
  ActivityLogEntry,
} from '../types';
import { getDefaultConfig, getDefaultPlatformStatus } from '../types';
import {
  STORAGE_KEYS,
  MATRIX_PREFIX,
  IRC_PREFIX,
  CS_PREFIX,
  MAX_ACTIVITY_LOG_ENTRIES,
  DAILY_POW_BUDGET_SECS,
} from '../types/constants';
import { MatrixAdapter } from '../adapters/MatrixAdapter';
import { IrcAdapter } from '../adapters/IrcAdapter';
import { EchoTracker, getEchoTracker } from './EchoTracker';
import { HourlyRateLimiter, getRateLimiter } from './RateLimiter';
import type { SwimchainRpc } from '../lib/rpc';
import type { StoredIdentity } from '../types';
import { getStoredIdentity } from '../hooks/useStoredIdentity';
import {
  ActionType,
  computePow,
  createChallenge,
  solutionToRpcParams,
  getDifficulty,
  getConfig,
  hexToBytes,
  bytesToHex,
} from '../lib/action-pow';
import { Keypair } from '@swimchain/core';

/**
 * Activity log handler.
 */
type ActivityHandler = (entry: ActivityLogEntry) => void;

/**
 * Main bridge engine coordinating all adapters.
 */
export class BridgeEngine {
  private config: BridgeConfig;
  private matrixAdapter: MatrixAdapter | null = null;
  private ircAdapter: IrcAdapter | null = null;
  private echoTracker: EchoTracker;
  private rateLimiter: HourlyRateLimiter;
  private platformStatuses: Map<Platform, PlatformStatus> = new Map();
  private activityLog: ActivityLogEntry[] = [];
  private activityHandlers: Set<ActivityHandler> = new Set();
  private dailyPowUsed: number = 0;
  private lastPowResetDate: string = '';
  private rpcClient: SwimchainRpc | null = null;
  private contentWatchTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeenTimestamp: number = Math.floor(Date.now() / 1000) - 3600;
  private keypair: Keypair | null = null;
  private identity: StoredIdentity | null = null;
  private isMining: boolean = false;

  constructor() {
    this.config = this.loadConfig();
    this.echoTracker = getEchoTracker();
    this.rateLimiter = getRateLimiter();
    this.initPlatformStatuses();
    this.loadActivityLog();
    this.loadPowState();
  }

  /**
   * Set the RPC client for Swimchain connectivity.
   */
  setRpcClient(client: SwimchainRpc | null): void {
    this.rpcClient = client;
    if (client) {
      this.updatePlatformStatus('cs', 'connected');
      this.logActivity('connection', { description: 'Swimchain node connected' });

      // Load stored identity and set on RPC client
      this.loadIdentity();
    } else {
      this.updatePlatformStatus('cs', 'disconnected');
    }
  }

  /**
   * Load identity from storage and create keypair.
   */
  private loadIdentity(): void {
    try {
      const stored = getStoredIdentity();
      if (!stored) {
        console.log('[BridgeEngine] No stored identity found');
        return;
      }

      this.identity = stored;
      const seedBytes = hexToBytes(stored.seed);
      this.keypair = Keypair.fromSeed(seedBytes);

      // Set identity on RPC client for signature auth
      if (this.rpcClient) {
        const signFn = (message: Uint8Array) => {
          if (!this.keypair) throw new Error('No keypair');
          return this.keypair.sign(message);
        };
        this.rpcClient.setIdentity(stored.publicKey, signFn);
      }

      console.log('[BridgeEngine] Identity loaded:', stored.address);
    } catch (error) {
      console.error('[BridgeEngine] Failed to load identity:', error);
    }
  }

  /**
   * Check if identity is available for posting.
   */
  hasIdentity(): boolean {
    return this.keypair !== null && this.identity !== null;
  }

  /**
   * Check if currently mining PoW.
   */
  isMiningPow(): boolean {
    return this.isMining;
  }

  /**
   * Start watching for new Swimchain content to bridge outward.
   */
  startContentWatcher(intervalMs: number = 10000): void {
    if (this.contentWatchTimer) {
      console.log('[BridgeEngine] Content watcher already running');
      return;
    }

    console.log('[BridgeEngine] Starting content watcher');

    const poll = async () => {
      if (!this.rpcClient || !this.config.targetSpace) return;

      try {
        const result = await this.rpcClient.getContentSince(
          this.config.targetSpace,
          this.lastSeenTimestamp
        );

        for (const item of result.items) {
          // Skip if this was bridged TO Swimchain (would create echo)
          if (this.echoTracker.wasBridgedTo(item.content_id)) {
            continue;
          }

          // Bridge to external platforms
          const content = item.body ?? item.title ?? '';
          if (content) {
            await this.bridgeToExternal(content, item.author_id, item.content_id);
          }
        }

        // Update timestamp to newest seen
        if (result.items.length > 0) {
          const newest = Math.max(...result.items.map((i) => i.created_at));
          this.lastSeenTimestamp = newest;
        }
      } catch (error) {
        console.error('[BridgeEngine] Content watch poll failed:', error);
      }
    };

    // Initial poll
    poll();

    // Set up interval
    this.contentWatchTimer = setInterval(poll, intervalMs);
  }

  /**
   * Stop watching for Swimchain content.
   */
  stopContentWatcher(): void {
    if (this.contentWatchTimer) {
      clearInterval(this.contentWatchTimer);
      this.contentWatchTimer = null;
      console.log('[BridgeEngine] Content watcher stopped');
    }
  }

  /**
   * Initialize the bridge engine.
   */
  async initialize(): Promise<void> {
    if (this.config.matrix.enabled) {
      this.matrixAdapter = new MatrixAdapter(this.config.matrix);
      this.setupMatrixHandlers();
    }

    if (this.config.irc.enabled) {
      this.ircAdapter = new IrcAdapter(this.config.irc);
      this.setupIrcHandlers();
    }
  }

  /**
   * Connect all enabled adapters.
   */
  async connect(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.matrixAdapter && this.config.matrix.enabled) {
      promises.push(
        this.matrixAdapter.connect().then(() => {
          this.updatePlatformStatus('matrix', 'connected');
          this.logActivity('connection', { description: 'Matrix connected' });
        }).catch((error) => {
          this.updatePlatformStatus('matrix', 'error', error.message);
          this.logActivity('error', { description: `Matrix: ${error.message}` });
        })
      );
    }

    if (this.ircAdapter && this.config.irc.enabled) {
      promises.push(
        this.ircAdapter.connect().then(() => {
          this.updatePlatformStatus('irc', 'connected');
          this.logActivity('connection', { description: 'IRC connected' });
        }).catch((error) => {
          this.updatePlatformStatus('irc', 'error', error.message);
          this.logActivity('error', { description: `IRC: ${error.message}` });
        })
      );
    }

    await Promise.allSettled(promises);

    // Start watching Swimchain for outbound bridging if RPC is connected
    if (this.rpcClient && this.config.targetSpace) {
      this.startContentWatcher();
    }
  }

  /**
   * Disconnect all adapters.
   */
  disconnect(): void {
    this.matrixAdapter?.disconnect();
    this.ircAdapter?.disconnect();
    this.stopContentWatcher();
    this.updatePlatformStatus('matrix', 'disconnected');
    this.updatePlatformStatus('irc', 'disconnected');
    this.logActivity('connection', { description: 'Bridge disconnected' });
  }

  /**
   * Get platform status.
   */
  getPlatformStatus(platform: Platform): PlatformStatus {
    return this.platformStatuses.get(platform) ?? getDefaultPlatformStatus(platform);
  }

  /**
   * Get all platform statuses.
   */
  getAllPlatformStatuses(): PlatformStatus[] {
    return Array.from(this.platformStatuses.values());
  }

  /**
   * Get current configuration.
   */
  getConfig(): BridgeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<BridgeConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();

    if (config.matrix && this.matrixAdapter) {
      this.matrixAdapter.updateConfig({ ...this.config.matrix, ...config.matrix });
    }

    if (config.irc && this.ircAdapter) {
      this.ircAdapter.updateConfig({ ...this.config.irc, ...config.irc });
    }
  }

  /**
   * Get activity log.
   */
  getActivityLog(): ActivityLogEntry[] {
    return [...this.activityLog];
  }

  /**
   * Subscribe to activity log updates.
   */
  onActivity(handler: ActivityHandler): () => void {
    this.activityHandlers.add(handler);
    return () => this.activityHandlers.delete(handler);
  }

  /**
   * Get remaining PoW budget for today.
   */
  getRemainingPowBudget(): number {
    this.resetPowIfNeeded();
    return Math.max(0, DAILY_POW_BUDGET_SECS - this.dailyPowUsed);
  }

  /**
   * Check if we can spend PoW.
   */
  canSpendPow(seconds: number): boolean {
    this.resetPowIfNeeded();
    return this.dailyPowUsed + seconds <= DAILY_POW_BUDGET_SECS;
  }

  /**
   * Set up Matrix message handlers.
   */
  private setupMatrixHandlers(): void {
    if (!this.matrixAdapter) return;

    this.matrixAdapter.onMessage((message) => {
      this.handleIncomingMessage(message).catch((error) => {
        console.error('[BridgeEngine] Error handling Matrix message:', error);
      });
    });

    this.matrixAdapter.onError((error) => {
      this.updatePlatformStatus('matrix', 'error', error.message);
      this.logActivity('error', { description: `Matrix: ${error.message}` });
    });
  }

  /**
   * Set up IRC message handlers.
   */
  private setupIrcHandlers(): void {
    if (!this.ircAdapter) return;

    this.ircAdapter.onMessage((message) => {
      this.handleIncomingMessage(message).catch((error) => {
        console.error('[BridgeEngine] Error handling IRC message:', error);
      });
    });

    this.ircAdapter.onError((error) => {
      this.updatePlatformStatus('irc', 'error', error.message);
      this.logActivity('error', { description: `IRC: ${error.message}` });
    });
  }

  /**
   * Handle an incoming message from any platform.
   */
  private async handleIncomingMessage(message: BridgeMessage): Promise<void> {
    console.log(`[BridgeEngine] Incoming from ${message.platform}: ${message.content.slice(0, 50)}...`);

    // Check echo - was this already bridged to us?
    if (this.echoTracker.isBridged(message.platform, message.id)) {
      console.log('[BridgeEngine] Skipping echo');
      return;
    }

    // Check rate limit
    if (!this.rateLimiter.canPost(this.config.targetSpace)) {
      console.log('[BridgeEngine] Rate limited');
      this.logActivity('rate_limited', {
        sourcePlatform: message.platform,
        description: `Rate limited: ${message.content.slice(0, 30)}...`,
      });
      return;
    }

    // Check PoW budget
    if (!this.canSpendPow(10)) {
      console.log('[BridgeEngine] PoW budget exceeded');
      return;
    }

    // Check identity
    if (!this.hasIdentity() || !this.keypair || !this.identity) {
      console.log('[BridgeEngine] No identity available for posting');
      this.logActivity('error', { description: 'No identity configured for posting' });
      return;
    }

    // Check RPC client
    if (!this.rpcClient) {
      console.log('[BridgeEngine] No RPC client available');
      return;
    }

    // Check if already mining
    if (this.isMining) {
      console.log('[BridgeEngine] Already mining, queuing message');
      return;
    }

    // Format for Swimchain
    const prefix = message.platform === 'matrix' ? MATRIX_PREFIX : IRC_PREFIX;
    const formattedContent = `${prefix}${message.senderDisplayName}] ${message.content}`;

    try {
      this.isMining = true;
      console.log(`[BridgeEngine] Mining PoW for: ${formattedContent.slice(0, 60)}...`);

      // Create PoW challenge
      const contentBytes = new TextEncoder().encode(formattedContent);
      const publicKey = hexToBytes(this.identity.publicKey);
      const difficulty = getDifficulty(ActionType.Post, true); // testnet
      const config = getConfig(true); // testnet

      const challenge = await createChallenge(
        ActionType.Post,
        contentBytes,
        publicKey,
        difficulty
      );

      // Mine PoW
      const solution = await computePow(
        challenge,
        config,
        (attempts, _elapsedMs, hashRate) => {
          if (attempts % 50 === 0) {
            console.log(`[BridgeEngine] Mining: ${attempts} attempts, ${hashRate.toFixed(1)} H/s`);
          }
        }
      );

      // Create signature
      const signatureData = new Uint8Array(1 + 32 + 8 + 8);
      signatureData[0] = ActionType.Post;
      signatureData.set(challenge.contentHash, 1);
      const view = new DataView(signatureData.buffer);
      view.setBigUint64(33, BigInt(challenge.timestamp), false);
      view.setBigUint64(41, solution.nonce, false);

      const signature = this.keypair.sign(signatureData);

      // Get RPC params
      const powParams = solutionToRpcParams(solution);

      // Submit post to Swimchain
      const result = await this.rpcClient.submitPost({
        spaceId: this.config.targetSpace,
        title: `${prefix}${message.senderDisplayName}`,
        body: message.content,
        authorId: this.identity.publicKey,
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature: bytesToHex(signature),
        timestamp: powParams.timestamp,
      });

      console.log(`[BridgeEngine] Posted to Swimchain: ${result.content_id}`);

      // Record the bridging
      this.echoTracker.markBridged(message.platform, message.id, result.content_id);
      this.rateLimiter.recordPost(this.config.targetSpace);
      this.dailyPowUsed += 10;
      this.savePowState();

      // Update status
      const status = this.platformStatuses.get(message.platform);
      if (status) {
        status.messagesBridgedToday++;
        status.lastSync = new Date();
      }

      this.logActivity('message_bridged', {
        direction: 'inbound',
        sourcePlatform: message.platform,
        targetPlatform: 'cs',
        description: `${message.senderDisplayName}: ${message.content.slice(0, 40)}...`,
      });
    } catch (error) {
      console.error('[BridgeEngine] Failed to post to Swimchain:', error);
      this.logActivity('error', {
        sourcePlatform: message.platform,
        description: `Post failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      this.isMining = false;
    }
  }

  /**
   * Bridge a Swimchain message to external platforms.
   */
  async bridgeToExternal(
    content: string,
    sender: string,
    postHash: string
  ): Promise<void> {
    // Check echo
    if (this.echoTracker.wasBridgedTo(postHash)) {
      console.log('[BridgeEngine] Skipping echo on outbound');
      return;
    }

    const formattedContent = `${CS_PREFIX}${sender}] ${content}`;

    // Bridge to Matrix
    if (this.matrixAdapter && this.config.matrix.enabled) {
      for (const roomId of this.config.matrix.roomIds) {
        try {
          const eventId = await this.matrixAdapter.sendMessage(roomId, formattedContent);
          this.echoTracker.markBridged('cs', postHash, eventId);
        } catch (error) {
          console.error('[BridgeEngine] Failed to bridge to Matrix:', error);
        }
      }
    }

    // Bridge to IRC
    if (this.ircAdapter && this.config.irc.enabled) {
      for (const channel of this.config.irc.channels) {
        try {
          this.ircAdapter.sendMessage(channel, formattedContent);
          this.echoTracker.markBridged('cs', postHash, `irc:${channel}:${Date.now()}`);
        } catch (error) {
          console.error('[BridgeEngine] Failed to bridge to IRC:', error);
        }
      }
    }

    this.logActivity('message_bridged', {
      direction: 'outbound',
      sourcePlatform: 'cs',
      description: `${sender}: ${content.slice(0, 40)}...`,
    });
  }

  /**
   * Initialize platform statuses.
   */
  private initPlatformStatuses(): void {
    this.platformStatuses.set('matrix', getDefaultPlatformStatus('matrix'));
    this.platformStatuses.set('irc', getDefaultPlatformStatus('irc'));
    this.platformStatuses.set('cs', getDefaultPlatformStatus('cs'));
  }

  /**
   * Update a platform's status.
   */
  private updatePlatformStatus(
    platform: Platform,
    status: 'connected' | 'connecting' | 'disconnected' | 'error',
    error?: string
  ): void {
    const current = this.platformStatuses.get(platform);
    if (current) {
      current.status = status;
      current.lastError = error;
      if (status === 'connected') {
        current.lastSync = new Date();
      }
    }
  }

  /**
   * Log an activity.
   */
  private logActivity(
    type: ActivityLogEntry['type'],
    data: Partial<ActivityLogEntry>
  ): void {
    const entry: ActivityLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
      type,
      ...data,
    } as ActivityLogEntry;

    this.activityLog.unshift(entry);

    // Trim log
    if (this.activityLog.length > MAX_ACTIVITY_LOG_ENTRIES) {
      this.activityLog = this.activityLog.slice(0, MAX_ACTIVITY_LOG_ENTRIES);
    }

    this.saveActivityLog();

    // Notify handlers
    for (const handler of this.activityHandlers) {
      try {
        handler(entry);
      } catch (e) {
        console.error('[BridgeEngine] Error in activity handler:', e);
      }
    }
  }

  /**
   * Load configuration from localStorage.
   */
  private loadConfig(): BridgeConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (stored) {
        return { ...getDefaultConfig(), ...JSON.parse(stored) };
      }
    } catch {
      // Use default
    }
    return getDefaultConfig();
  }

  /**
   * Save configuration to localStorage.
   */
  private saveConfig(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    } catch {
      // Ignore
    }
  }

  /**
   * Load activity log from localStorage.
   */
  private loadActivityLog(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOG);
      if (stored) {
        this.activityLog = JSON.parse(stored);
      }
    } catch {
      // Use empty log
    }
  }

  /**
   * Save activity log to localStorage.
   */
  private saveActivityLog(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOG, JSON.stringify(this.activityLog));
    } catch {
      // Ignore
    }
  }

  /**
   * Load PoW state from localStorage.
   */
  private loadPowState(): void {
    try {
      const stored = localStorage.getItem('bridge_pow_state');
      if (stored) {
        const state = JSON.parse(stored);
        this.dailyPowUsed = state.used ?? 0;
        this.lastPowResetDate = state.date ?? '';
      }
    } catch {
      // Use defaults
    }
    this.resetPowIfNeeded();
  }

  /**
   * Save PoW state to localStorage.
   */
  private savePowState(): void {
    try {
      localStorage.setItem(
        'bridge_pow_state',
        JSON.stringify({
          used: this.dailyPowUsed,
          date: this.lastPowResetDate,
        })
      );
    } catch {
      // Ignore
    }
  }

  /**
   * Reset PoW budget if new UTC day.
   */
  private resetPowIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastPowResetDate !== today) {
      this.dailyPowUsed = 0;
      this.lastPowResetDate = today ?? '';
      this.savePowState();
    }
  }
}

/**
 * Singleton instance.
 */
let _instance: BridgeEngine | null = null;

export function getBridgeEngine(): BridgeEngine {
  if (!_instance) {
    _instance = new BridgeEngine();
  }
  return _instance;
}
