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
import { getBlockedUserIds } from '../hooks/useBlocklist';
import {
  ActionType,
  computePow,
  createChallenge,
  solutionToRpcParams,
  getDifficulty,
  getConfig,
  hexToBytes,
  bytesToHex,
  sha256,
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

  // SWIM-B7: message queue — messages arriving during mining are queued, not dropped
  private messageQueue: Array<{
    message: BridgeMessage;
    threadParentId: string | null;
  }> = [];
  private processingQueue: boolean = false;

  // SWIM-B7: thread tracking — maps source (channel/room) to the most recent bridged content_id
  // so inbound replies can be posted as threaded replies
  private threadMap: Map<string, { contentId: string; timestamp: number }> = new Map();
  private readonly THREAD_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

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
   * Check if content is spam-flagged via RPC.
   * Returns true if content has 3+ unique spam attestations (the protocol threshold).
   */
  private async isSpamFlagged(contentId: string): Promise<boolean> {
    if (!this.rpcClient) return false;

    try {
      const status = await this.rpcClient.getSpamStatus(contentId);
      return status.is_flagged && !status.is_cleared;
    } catch (error) {
      // If spam check fails, err on the side of caution and skip
      console.warn(`[BridgeEngine] Spam check failed for ${contentId}:`, error);
      return false;
    }
  }

  /**
   * Check if content is encrypted with a private space key
   */
  private isPrivateEncrypted(content: string): boolean {
    return content.startsWith('[PRIVATE:v1:') || content.startsWith('[ENCRYPTED:v1:');
  }

  /**
   * Try to decrypt content using stored private space keys.
   * Returns decrypted content or null if no key available.
   */
  private async tryDecryptContent(content: string, spaceId: string): Promise<string | null> {
    if (!content.startsWith('[PRIVATE:v1:')) return null;

    // Load key from localStorage
    const STORAGE_KEY = 'swimchain-bridge-private-keys';
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const keys: Record<string, { keyHex: string }> = JSON.parse(raw);
      const keyEntry = keys[spaceId];
      if (!keyEntry?.keyHex) return null;

      // Extract the base64 payload
      const prefix = '[PRIVATE:v1:';
      const suffix = ']';
      const endIdx = content.indexOf(suffix, prefix.length);
      if (endIdx === -1) return null;

      const base64Payload = content.substring(prefix.length, endIdx);
      const rawBytes = Uint8Array.from(atob(base64Payload), c => c.charCodeAt(0));

      // First 12 bytes = IV, rest = ciphertext
      const iv = rawBytes.slice(0, 12);
      const ciphertext = rawBytes.slice(12);

      // Convert hex key to bytes
      const keyHex = keyEntry.keyHex;
      const keyBytes = new Uint8Array(keyHex.length / 2);
      for (let i = 0; i < keyBytes.length; i++) {
        keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
      }

      // Decrypt with AES-256-GCM
      const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
      const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
      const decryptedText = new TextDecoder().decode(decryptedBuffer);

      console.log(`[BridgeEngine] Successfully decrypted private content for space ${spaceId.slice(0, 12)}...`);
      return decryptedText;
    } catch (error) {
      console.warn(`[BridgeEngine] Decryption failed for space ${spaceId}:`, error);
      return null;
    }
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

        const blockedUsers = getBlockedUserIds();

        for (const item of result.items) {
          // Skip if this was bridged TO Swimchain (would create echo)
          if (this.echoTracker.wasBridgedTo(item.content_id)) {
            continue;
          }

          // Skip content from blocked users
          if (blockedUsers.has(item.author_id)) {
            console.log(`[BridgeEngine] Skipping content from blocked user: ${item.author_id}`);
            continue;
          }

          // Check spam attestation status before bridging
          if (await this.isSpamFlagged(item.content_id)) {
            console.log(`[BridgeEngine] Skipping spam-flagged content: ${item.content_id}`);
            this.logActivity('spam_blocked', {
              direction: 'outbound',
              sourcePlatform: 'cs',
              description: `Spam-flagged content blocked: ${(item.body ?? item.title ?? '').slice(0, 40)}... (${item.content_id.slice(0, 12)}...)`,
            });
            continue;
          }

          // Bridge to external platforms
          let content = item.body ?? item.title ?? '';

          // Try to decrypt if content is encrypted and we have the key
          if (content && this.isPrivateEncrypted(content)) {
            const decrypted = await this.tryDecryptContent(content, item.space_id);
            if (decrypted) {
              content = decrypted;
            } else {
              // Can't decrypt - skip bridging encrypted content without key
              console.log(`[BridgeEngine] Skipping encrypted content (no key): ${item.content_id.slice(0, 12)}...`);
              continue;
            }
          }

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
   *
   * SWIM-B7 changes:
   * 1. Messages arriving during mining are queued (not dropped) and processed sequentially
   * 2. Inbound messages are threaded as replies when they follow a recent bridged post
   *    from the same channel/room (within 30-minute window)
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

    // SWIM-B7: resolve thread parent — if same source (channel/room) has a recent bridged post, reply to it
    const threadParentId = this.resolveThreadParent(message);

    // SWIM-B7: if currently mining, queue the message (including resolved thread parent)
    if (this.isMining || this.processingQueue) {
      console.log('[BridgeEngine] Already mining, queuing message for later processing');
      this.messageQueue.push({ message, threadParentId });
      return;
    }

    await this.processMessage(message, threadParentId);
  }

  /**
   * SWIM-B7: Resolve whether this message should be posted as a threaded reply.
   * Checks if the same channel/room has a recent bridged post (within THREAD_WINDOW_MS).
   * Returns the parent content_id to reply to, or null to post as a new post.
   */
  private resolveThreadParent(message: BridgeMessage): string | null {
    // Threading is per-source (channel/room) — e.g., "#swimchain" or "!room:matrix.org"
    const sourceKey = `${message.platform}:${message.source}`;
    const entry = this.threadMap.get(sourceKey);

    if (!entry) {
      return null;
    }

    // Check if the entry is still within the thread window
    if (Date.now() - entry.timestamp > this.THREAD_WINDOW_MS) {
      // Stale entry — remove it
      this.threadMap.delete(sourceKey);
      return null;
    }

    console.log(`[BridgeEngine] Threading message to parent ${entry.contentId.slice(0, 16)}... (source: ${sourceKey})`);
    return entry.contentId;
  }

  /**
   * SWIM-B7: Process a single message — mine PoW and submit as post or reply.
   * If threadParentId is provided, submits as a reply instead of a new post.
   */
  private async processMessage(message: BridgeMessage, threadParentId: string | null): Promise<void> {
    // Re-check identity and RPC client — queued messages may be processed after state changes
    const identity = this.identity;
    const keypair = this.keypair;
    const rpcClient = this.rpcClient;
    if (!identity || !keypair || !rpcClient) {
      console.log('[BridgeEngine] No identity or RPC client available for posting');
      this.logActivity('error', { description: 'No identity configured for posting' });
      return;
    }

    // Format for Swimchain
    const prefix = message.platform === 'matrix' ? MATRIX_PREFIX : IRC_PREFIX;
    const formattedContent = `${prefix}${message.senderDisplayName}] ${message.content}`;

    try {
      this.isMining = true;
      console.log(`[BridgeEngine] Mining PoW for: ${formattedContent.slice(0, 60)}...${threadParentId ? ' (reply to ' + threadParentId.slice(0, 12) + '...)' : ' (new post)'}`);

      // Create PoW challenge over the EXACT bytes the node re-hashes
      // (rpc/methods.rs verify_pow_submission):
      //   submit_post:  `${title}\n\n${body}`
      //   submit_reply: body
      // Mining over `formattedContent` (the old behavior) matched neither
      // submission, so every bridged message was rejected by a real node
      // with "PoW verification failed" (SWIM-Q2 finding). Replies also need
      // ActionType.Reply, not Post.
      const postTitle = `${prefix}${message.senderDisplayName}`;
      const actionType = threadParentId ? ActionType.Reply : ActionType.Post;
      const powContent = threadParentId
        ? message.content
        : `${postTitle}\n\n${message.content}`;

      const contentBytes = new TextEncoder().encode(powContent);
      const publicKey = hexToBytes(identity.publicKey);
      const difficulty = getDifficulty(actionType, true); // testnet
      const powConfig = getConfig(true); // testnet

      const challenge = await createChallenge(
        actionType,
        contentBytes,
        publicKey,
        difficulty
      );

      // Mine PoW
      const solution = await computePow(
        challenge,
        powConfig,
        (attempts, _elapsedMs, hashRate) => {
          if (attempts % 50 === 0) {
            console.log(`[BridgeEngine] Mining: ${attempts} attempts, ${hashRate.toFixed(1)} H/s`);
          }
        }
      );

      // Create signature over the canonical action preimage the node verifies:
      //   content_hash(32) || timestamp_u64_LE(8) || private(1)
      // content_hash = sha256(post: `${title}\n\n${body}` | reply: body).
      // powContent already equals that canonical string for both cases, but we
      // hash it explicitly rather than reuse the PoW challenge hash.
      const sigContentHash = await sha256(contentBytes);
      const preimage = new Uint8Array(41);
      preimage.set(sigContentHash, 0);
      new DataView(preimage.buffer).setBigUint64(32, BigInt(challenge.timestamp), true);
      preimage[40] = 0; // public space

      const signature = keypair.sign(preimage);

      // Get RPC params
      const powParams = solutionToRpcParams(solution);

      let resultContentId: string;

      if (threadParentId) {
        // SWIM-B7: Submit as threaded reply
        const result = await rpcClient.submitReply({
          parentId: threadParentId,
          body: message.content,
          authorId: identity.publicKey,
          powNonce: powParams.pow_nonce,
          powDifficulty: powParams.pow_difficulty,
          powNonceSpace: powParams.pow_nonce_space,
          powHash: powParams.pow_hash,
          signature: bytesToHex(signature),
          timestamp: powParams.timestamp,
        });
        resultContentId = result.content_id;
        console.log(`[BridgeEngine] Replied to thread (${threadParentId.slice(0, 12)}...): ${resultContentId}`);
      } else {
        // New post
        const result = await rpcClient.submitPost({
          spaceId: this.config.targetSpace,
          title: `${prefix}${message.senderDisplayName}`,
          body: message.content,
          authorId: identity.publicKey,
          powNonce: powParams.pow_nonce,
          powDifficulty: powParams.pow_difficulty,
          powNonceSpace: powParams.pow_nonce_space,
          powHash: powParams.pow_hash,
          signature: bytesToHex(signature),
          timestamp: powParams.timestamp,
        });
        resultContentId = result.content_id;
        console.log(`[BridgeEngine] Posted to Swimchain: ${resultContentId}`);
      }

      // Record the bridging
      this.echoTracker.markBridged(message.platform, message.id, resultContentId);
      this.rateLimiter.recordPost(this.config.targetSpace);
      this.dailyPowUsed += 10;
      this.savePowState();

      // SWIM-B7: Update thread map — track the most recent bridged content for this source
      const sourceKey = `${message.platform}:${message.source}`;
      this.threadMap.set(sourceKey, { contentId: resultContentId, timestamp: Date.now() });

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
        description: `${message.senderDisplayName}: ${message.content.slice(0, 40)}...${threadParentId ? ' (reply)' : ''}`,
      });
    } catch (error) {
      console.error('[BridgeEngine] Failed to post to Swimchain:', error);
      this.logActivity('error', {
        sourcePlatform: message.platform,
        description: `Post failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      this.isMining = false;
      // SWIM-B7: process next queued message
      this.drainQueue();
    }
  }

  /**
   * SWIM-B7: Drain the message queue — process queued messages one at a time.
   */
  private async drainQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.messageQueue.length > 0) {
      const entry = this.messageQueue.shift();
      if (!entry) continue;

      // Re-check rate limit and budget before processing each queued message
      if (!this.rateLimiter.canPost(this.config.targetSpace)) {
        console.log('[BridgeEngine] Queue: rate limited, dropping queued message');
        this.logActivity('rate_limited', {
          sourcePlatform: entry.message.platform,
          description: `Rate limited (queued): ${entry.message.content.slice(0, 30)}...`,
        });
        continue;
      }

      if (!this.canSpendPow(10)) {
        console.log('[BridgeEngine] Queue: PoW budget exceeded, dropping queued message');
        continue;
      }

      await this.processMessage(entry.message, entry.threadParentId);

      // Small delay to avoid thundering the node with consecutive PoW solves
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.processingQueue = false;
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
