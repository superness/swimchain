/**
 * SwimChain RPC Client
 *
 * HTTP/JSON-RPC client for communicating with SwimChain nodes.
 * Supports both basic auth and signature-based authentication.
 */

import {
  RpcConfig,
  RpcRequest,
  RpcResponse,
  NodeInfo,
  SyncStatus,
  PeerInfo,
  Space,
  ContentItem,
  IdentityLevel,
  PoolInfo,
  Reply,
  ReactionCounts,
} from './types.js';
import { hexToBytes, bytesToHex, sha256String } from './utils.js';

// =============================================================================
// Type Converters (snake_case RPC -> camelCase client)
// =============================================================================

interface RpcNodeInfo {
  version: string;
  network: string;
  uptime_seconds: number;
  peer_count: number;
  block_height: number;
  node_id: string;
  rpc_port: number;
  p2p_port: number;
}

interface RpcSyncStatus {
  state: string;
  chain_percent: number;
  peer_count: number;
  peers_receiving?: number;
  peers_sending?: number;
  storage_mb: number;
  storage_target_mb: number;
  last_block_time: number | null;
}

interface RpcContentItem {
  content_id: string;
  content_type: string;
  author_id: string;
  space_id: string;
  parent_id: string | null;
  created_at: number;
  last_engagement: number;
  body: string | null;
  title: string | null;
  engagement_count: number;
  decay_state: string;
  seconds_until_decay: number | null;
}

interface RpcSpaceSummary {
  space_id: string;
  post_count: number;
  last_activity: number | null;
  name: string | null;
}

interface RpcIdentityLevel {
  identity_id: string;
  level: number;
  level_name: string;
  is_genesis: boolean;
  streak_days: number;
  bandwidth_served: number;
  contribution_score: number;
}

interface RpcPoolInfo {
  pool_id: string;
  content_id: string;
  total_pow: number;
  required_pow: number;
  status: string;
  contributor_count: number;
  expires_at: number;
}

interface RpcReply {
  content_id: string;
  author_id: string;
  body: string;
  parent_id: string;
  created_at: number;
  last_engagement: number;
}

interface RpcPeer {
  peer_id: string;
  address: string;
  direction: string;
}

function toNodeInfo(rpc: RpcNodeInfo): NodeInfo {
  return {
    version: rpc.version,
    network: rpc.network,
    uptimeSeconds: rpc.uptime_seconds,
    peerCount: rpc.peer_count,
    blockHeight: rpc.block_height,
    nodeId: rpc.node_id,
    rpcPort: rpc.rpc_port,
    p2pPort: rpc.p2p_port,
  };
}

function toSyncStatus(rpc: RpcSyncStatus): SyncStatus {
  return {
    state: rpc.state as SyncStatus['state'],
    chainPercent: rpc.chain_percent,
    peerCount: rpc.peer_count,
    peersReceiving: rpc.peers_receiving,
    peersSending: rpc.peers_sending,
    storageMB: rpc.storage_mb,
    storageTargetMB: rpc.storage_target_mb,
    lastBlockTime: rpc.last_block_time,
  };
}

function toContentItem(rpc: RpcContentItem): ContentItem {
  return {
    contentId: rpc.content_id,
    contentType: rpc.content_type as ContentItem['contentType'],
    authorId: rpc.author_id,
    spaceId: rpc.space_id,
    parentId: rpc.parent_id,
    createdAt: rpc.created_at,
    lastEngagement: rpc.last_engagement,
    title: rpc.title,
    body: rpc.body,
    engagementCount: rpc.engagement_count,
    decayState: rpc.decay_state as ContentItem['decayState'],
    secondsUntilDecay: rpc.seconds_until_decay,
  };
}

function toSpace(rpc: RpcSpaceSummary): Space {
  return {
    id: rpc.space_id,
    name: rpc.name || rpc.space_id,
    postCount: rpc.post_count,
    lastActivity: rpc.last_activity ?? undefined,
  };
}

function toIdentityLevel(rpc: RpcIdentityLevel): IdentityLevel {
  return {
    identityId: rpc.identity_id,
    level: rpc.level,
    levelName: rpc.level_name,
    isGenesis: rpc.is_genesis,
    streakDays: rpc.streak_days,
    bandwidthServed: rpc.bandwidth_served,
    contributionScore: rpc.contribution_score,
  };
}

function toPoolInfo(rpc: RpcPoolInfo): PoolInfo {
  return {
    poolId: rpc.pool_id,
    contentId: rpc.content_id,
    totalPow: rpc.total_pow,
    requiredPow: rpc.required_pow,
    status: rpc.status,
    contributorCount: rpc.contributor_count,
    expiresAt: rpc.expires_at,
  };
}

function toPeerInfo(rpc: RpcPeer): PeerInfo {
  return {
    peerId: rpc.peer_id,
    address: rpc.address,
    direction: rpc.direction as PeerInfo['direction'],
  };
}

// =============================================================================
// Signer Interface
// =============================================================================

/**
 * Interface for signing messages (Ed25519)
 */
export interface Signer {
  sign(message: Uint8Array): Uint8Array | Promise<Uint8Array>;
}

// =============================================================================
// RPC Client
// =============================================================================

/**
 * SwimchainRpc - HTTP RPC client with optional signature authentication
 */
export class SwimchainRpc {
  private endpoint: string;
  private auth?: { username: string; password: string };
  private signer: Signer | null = null;
  private publicKeyHex: string | null = null;
  private timeout: number;
  private requestId = 1;
  private connected = false;
  private nodeInfo: NodeInfo | null = null;

  constructor(config: RpcConfig) {
    this.endpoint = config.endpoint;
    this.auth = config.auth;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Set signer for signature authentication
   */
  setSigner(signer: Signer, publicKeyHex: string): void {
    this.signer = signer;
    this.publicKeyHex = publicKeyHex;
  }

  /**
   * Clear signer
   */
  clearSigner(): void {
    this.signer = null;
    this.publicKeyHex = null;
  }

  /**
   * Get current public key (hex)
   */
  getPublicKey(): string | null {
    return this.publicKeyHex;
  }

  /**
   * Make a raw RPC call
   */
  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const request: RpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Use signature auth if we have a signer
    if (this.signer && this.publicKeyHex) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const paramsJson = JSON.stringify(params);
      const paramsHash = await sha256String(paramsJson);
      const paramsHashHex = bytesToHex(paramsHash);

      const message = `swimchain-rpc:${method}:${paramsHashHex}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);

      const signature = await this.signer.sign(messageBytes);
      const signatureHex = bytesToHex(signature);

      headers['X-CS-Identity'] = this.publicKeyHex;
      headers['X-CS-Timestamp'] = timestamp;
      headers['X-CS-Signature'] = signatureHex;
    } else if (this.auth) {
      const credentials = `${this.auth.username}:${this.auth.password}`;
      headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const rpcResponse = (await response.json()) as RpcResponse<T>;

      if (rpcResponse.error) {
        throw new Error(`RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
      }

      return rpcResponse.result as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Connect and verify node is reachable
   */
  async connect(): Promise<boolean> {
    try {
      const info = await this.call<RpcNodeInfo>('get_info');
      this.nodeInfo = toNodeInfo(info);
      this.connected = true;
      return true;
    } catch (error) {
      this.connected = false;
      this.nodeInfo = null;
      return false;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get cached node info
   */
  getNodeInfo(): NodeInfo | null {
    return this.nodeInfo;
  }

  // ===========================================================================
  // Node Status
  // ===========================================================================

  async getInfo(): Promise<NodeInfo> {
    const info = await this.call<RpcNodeInfo>('get_info');
    return toNodeInfo(info);
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const status = await this.call<RpcSyncStatus>('get_sync_status');
    return toSyncStatus(status);
  }

  async getPeers(): Promise<PeerInfo[]> {
    const peers = await this.call<RpcPeer[]>('get_peers');
    return peers.map(toPeerInfo);
  }

  // ===========================================================================
  // Spaces
  // ===========================================================================

  async listSpaces(options?: { limit?: number; offset?: number }): Promise<{ spaces: Space[]; total: number }> {
    const result = await this.call<{ spaces: RpcSpaceSummary[]; total: number }>('list_spaces', {
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    });
    return {
      spaces: result.spaces.map(toSpace),
      total: result.total,
    };
  }

  // ===========================================================================
  // Content
  // ===========================================================================

  async getContent(contentId: string): Promise<ContentItem> {
    const item = await this.call<RpcContentItem>('get_content', { content_id: contentId });
    return toContentItem(item);
  }

  async listSpaceContent(
    spaceId: string,
    options?: { limit?: number; offset?: number; sort?: 'recent' | 'hot' | 'top' },
  ): Promise<{ items: ContentItem[]; total: number }> {
    const result = await this.call<{ items: RpcContentItem[]; total: number }>('list_space_content', {
      space_id: spaceId,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      sort: options?.sort ?? 'recent',
    });
    return {
      items: result.items.map(toContentItem),
      total: result.total,
    };
  }

  async listSpacePosts(
    spaceId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ items: ContentItem[]; total: number }> {
    const result = await this.call<{ items: RpcContentItem[]; total: number }>('list_space_posts', {
      space_id: spaceId,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      sort: 'recent',
    });
    return {
      items: result.items.map(toContentItem),
      total: result.total,
    };
  }

  async requestContent(contentId: string): Promise<{ status: string; message: string }> {
    return this.call('request_content', { content_id: contentId });
  }

  // ===========================================================================
  // Replies
  // ===========================================================================

  async getReplies(contentId: string): Promise<{
    parentId: string;
    replies: Array<{
      contentId: string;
      authorId: string;
      body: string;
      parentId: string;
      createdAt: number;
      lastEngagement: number;
    }>;
    totalCount: number;
  }> {
    const result = await this.call<{
      parent_id: string;
      replies: RpcReply[];
      total_count: number;
    }>('get_replies', { content_id: contentId });

    return {
      parentId: result.parent_id,
      replies: result.replies.map((r) => ({
        contentId: r.content_id,
        authorId: r.author_id,
        body: r.body,
        parentId: r.parent_id,
        createdAt: r.created_at,
        lastEngagement: r.last_engagement,
      })),
      totalCount: result.total_count,
    };
  }

  // ===========================================================================
  // Reactions
  // ===========================================================================

  async getReactions(contentId: string): Promise<{
    contentId: string;
    reactions: Array<{ emoji: string; reactionType: number; count: number }>;
    total: number;
  }> {
    const result = await this.call<{
      content_id: string;
      reactions: Array<{ emoji: string; reaction_type: number; count: number }>;
      total: number;
    }>('get_reactions', { content_id: contentId });

    return {
      contentId: result.content_id,
      reactions: result.reactions.map((r) => ({
        emoji: r.emoji,
        reactionType: r.reaction_type,
        count: r.count,
      })),
      total: result.total,
    };
  }

  // ===========================================================================
  // Identity
  // ===========================================================================

  async getIdentityLevel(identityId: string): Promise<IdentityLevel> {
    const level = await this.call<RpcIdentityLevel>('get_identity_level', { identity_id: identityId });
    return toIdentityLevel(level);
  }

  // ===========================================================================
  // Pools
  // ===========================================================================

  async getPoolInfo(poolId: string): Promise<PoolInfo> {
    const pool = await this.call<RpcPoolInfo>('get_pool_info', { pool_id: poolId });
    return toPoolInfo(pool);
  }

  async getPoolForContent(contentId: string): Promise<{
    hasPool: boolean;
    poolId?: string;
    totalPow: number;
    requiredPow: number;
    status: string;
    contributorCount: number;
    expiresAt: number;
  }> {
    const result = await this.call<{
      has_pool: boolean;
      pool_id?: string;
      total_pow: number;
      required_pow: number;
      status: string;
      contributor_count: number;
      expires_at: number;
    }>('get_pool_for_content', { content_id: contentId });

    return {
      hasPool: result.has_pool,
      poolId: result.pool_id,
      totalPow: result.total_pow,
      requiredPow: result.required_pow,
      status: result.status,
      contributorCount: result.contributor_count,
      expiresAt: result.expires_at,
    };
  }

  // ===========================================================================
  // Content Submission
  // ===========================================================================

  async submitPost(params: {
    spaceId: string;
    title: string;
    body: string;
    authorId: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ contentId: string; broadcast: boolean; recipients: number }> {
    const result = await this.call<{ content_id: string; broadcast: boolean; recipients: number }>('submit_post', {
      space_id: params.spaceId,
      title: params.title,
      body: params.body,
      author_id: params.authorId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });

    return {
      contentId: result.content_id,
      broadcast: result.broadcast,
      recipients: result.recipients,
    };
  }

  async submitReply(params: {
    parentId: string;
    body: string;
    authorId: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ contentId: string; message: string }> {
    const result = await this.call<{ content_id: string; message: string }>('submit_reply', {
      parent_id: params.parentId,
      body: params.body,
      author_id: params.authorId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });

    return {
      contentId: result.content_id,
      message: result.message,
    };
  }

  async submitEngagement(params: {
    contentId: string;
    authorId: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
    emoji?: number;
  }): Promise<{
    engaged: boolean;
    reactionStored: boolean;
    contentId: string;
    emoji?: number;
  }> {
    const result = await this.call<{
      engaged: boolean;
      reaction_stored: boolean;
      content_id: string;
      emoji?: number;
    }>('submit_engagement', {
      content_id: params.contentId,
      author_id: params.authorId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
      emoji: params.emoji,
    });

    return {
      engaged: result.engaged,
      reactionStored: result.reaction_stored,
      contentId: result.content_id,
      emoji: result.emoji,
    };
  }

  async createSpace(params: {
    name: string;
    creatorId: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ spaceId: string; name: string; success: boolean }> {
    const result = await this.call<{ space_id: string; name: string; success: boolean }>('create_space', {
      name: params.name,
      creator_id: params.creatorId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });

    return {
      spaceId: result.space_id,
      name: result.name,
      success: result.success,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create RPC client for local testnet node
 */
export function createTestnetClient(port = 19736): SwimchainRpc {
  return new SwimchainRpc({
    endpoint: `http://127.0.0.1:${port}`,
    timeout: 30000,
  });
}

/**
 * Create RPC client for local mainnet node
 */
export function createMainnetClient(port = 9736): SwimchainRpc {
  return new SwimchainRpc({
    endpoint: `http://127.0.0.1:${port}`,
    timeout: 30000,
  });
}

/**
 * Create RPC client for a custom endpoint
 */
export function createClient(endpoint: string, config?: Partial<RpcConfig>): SwimchainRpc {
  return new SwimchainRpc({
    endpoint,
    timeout: config?.timeout ?? 30000,
    auth: config?.auth,
  });
}
