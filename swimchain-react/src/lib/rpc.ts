/**
 * Swimchain RPC Client
 *
 * Provides connection to a Swimchain node via JSON-RPC over HTTP.
 * Supports signature-based authentication with the user's identity keypair.
 *
 * @packageDocumentation
 */

// =========================================================================
// Types
// =========================================================================

export interface RpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: number | string;
}

export interface RpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: { code: number; message: string; data?: unknown };
  id: number | string;
}

export interface NodeInfo {
  version: string;
  network: string;
  uptime_seconds: number;
  peer_count: number;
  block_height: number;
  node_id: string;
  rpc_port: number;
  p2p_port: number;
}

export interface SyncStatus {
  state: string;
  chain_percent: number;
  peer_count: number;
  storage_mb: number;
  storage_target_mb: number;
  last_block_time: number | null;
}

export interface ContentResult {
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
  reply_count?: number;
  has_pool?: boolean;
  pool_progress?: number;
  pool_status?: string;
}

export interface SpaceContentResult {
  items: ContentResult[];
  total: number;
}

export interface SpaceSummary {
  space_id: string;
  post_count: number;
  last_activity: number | null;
  name: string | null;
}

export interface ListSpacesResult {
  spaces: SpaceSummary[];
  total: number;
}

export interface UserPostsResult {
  user_id: string;
  items: ContentResult[];
  total_posts: number;
  total_content: number;
}

export interface IdentityLevel {
  identity_id: string;
  level: number;
  level_name: string;
  is_genesis: boolean;
  streak_days: number;
  bandwidth_served: number;
  contribution_score: number;
}

export interface PoolInfo {
  pool_id: string;
  content_id: string;
  total_pow: number;
  required_pow: number;
  status: string;
  contributor_count: number;
  expires_at: number;
}

export interface ReplyResult {
  content_id: string;
  author_id: string;
  body: string;
  parent_id: string;
  created_at: number;
  last_engagement: number;
  depth?: number;
  child_count?: number;
  decay_state?: string;
  seconds_until_decay_starts?: number | null;
  seconds_until_pruned?: number | null;
  survival_probability?: number;
  is_protected?: boolean;
  time_since_engagement?: number;
}

export interface ReactionResult {
  emoji: string;
  reaction_type: number;
  count: number;
}

export type SpamReason = 'advertising' | 'repetitive' | 'off_topic' | 'harassment' | 'illegal_content';

export interface SpamStatus {
  content_id: string;
  is_flagged: boolean;
  attestation_count: number;
  counter_count: number;
  reasons: string[];
  spam_threshold: number;
  counter_threshold: number;
}

// =========================================================================
// Configuration
// =========================================================================

export interface RpcConfig {
  /** RPC endpoint URL */
  endpoint: string;
  /** Basic auth credentials (optional) */
  auth?: {
    username: string;
    password: string;
  };
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface SignatureAuth {
  /** Sign a message and return the signature bytes */
  sign: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>;
  /** Public key as hex string */
  publicKey: string;
}

// =========================================================================
// Utilities
// =========================================================================

import { bytesToHex } from './utils';

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(hashBuffer);
}

// =========================================================================
// RPC Client
// =========================================================================

/**
 * SwimchainRpc - RPC client for Swimchain nodes
 *
 * @example
 * ```ts
 * const rpc = new SwimchainRpc({ endpoint: 'http://localhost:19756' });
 * await rpc.connect();
 *
 * const spaces = await rpc.listSpaces();
 * console.log(spaces);
 * ```
 */
export class SwimchainRpc {
  private endpoint: string;
  private auth?: { username: string; password: string };
  private signatureAuth: SignatureAuth | null = null;
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
   * Set signature authentication (for browser clients)
   */
  setSignatureAuth(auth: SignatureAuth | null): void {
    this.signatureAuth = auth;
  }

  /**
   * Check if signature auth is configured
   */
  hasSignatureAuth(): boolean {
    return this.signatureAuth !== null;
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

    // Use signature auth if available
    if (this.signatureAuth) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const paramsJson = JSON.stringify(params);
      const paramsHash = await sha256(new TextEncoder().encode(paramsJson));
      const paramsHashHex = bytesToHex(paramsHash);

      const message = `swimchain-rpc:${method}:${paramsHashHex}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);

      const signature = await this.signatureAuth.sign(messageBytes);
      const signatureHex = bytesToHex(signature);

      headers['X-CS-Identity'] = this.signatureAuth.publicKey;
      headers['X-CS-Timestamp'] = timestamp;
      headers['X-CS-Signature'] = signatureHex;
    } else if (this.auth) {
      const credentials = `${this.auth.username}:${this.auth.password}`;
      headers['Authorization'] = `Basic ${btoa(credentials)}`;
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
      this.nodeInfo = await this.call<NodeInfo>('get_info');
      this.connected = true;
      return true;
    } catch (error) {
      this.connected = false;
      this.nodeInfo = null;
      console.error('Failed to connect to node:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getNodeInfo(): NodeInfo | null {
    return this.nodeInfo;
  }

  // =========================================================================
  // Node Status
  // =========================================================================

  async getInfo(): Promise<NodeInfo> {
    return this.call<NodeInfo>('get_info');
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return this.call<SyncStatus>('get_sync_status');
  }

  async getPeers(): Promise<Array<{ peer_id: string; address: string; direction: string }>> {
    return this.call('get_peers');
  }

  // =========================================================================
  // Content
  // =========================================================================

  async getContent(contentId: string): Promise<ContentResult> {
    return this.call<ContentResult>('get_content', { content_id: contentId });
  }

  async listSpaces(options?: { limit?: number; offset?: number }): Promise<ListSpacesResult> {
    return this.call<ListSpacesResult>('list_spaces', {
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    });
  }

  async listSpaceContent(
    spaceId: string,
    options?: { limit?: number; offset?: number; sort?: 'recent' | 'hot' | 'top' }
  ): Promise<SpaceContentResult> {
    return this.call<SpaceContentResult>('list_space_content', {
      space_id: spaceId,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      sort: options?.sort ?? 'recent',
    });
  }

  async listSpacePosts(
    spaceId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<SpaceContentResult> {
    return this.call<SpaceContentResult>('list_space_posts', {
      space_id: spaceId,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      sort: 'recent',
    });
  }

  /**
   * Get posts by a specific user (for feed-style clients)
   *
   * @param userId - User's public key (32-byte hex)
   * @param options - Pagination and filter options
   * @returns User's posts (and optionally replies)
   */
  async getUserPosts(
    userId: string,
    options?: { limit?: number; offset?: number; includeReplies?: boolean }
  ): Promise<UserPostsResult> {
    return this.call<UserPostsResult>('get_user_posts', {
      user_id: userId,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      include_replies: options?.includeReplies ?? false,
    });
  }

  async requestContent(contentId: string): Promise<{ status: string; message: string }> {
    return this.call('request_content', { content_id: contentId });
  }

  async getReplies(contentId: string): Promise<{
    parent_id: string;
    replies: ReplyResult[];
    total_count: number;
  }> {
    return this.call('get_replies', { content_id: contentId });
  }

  // =========================================================================
  // Identity
  // =========================================================================

  async getIdentityLevel(identityId: string): Promise<IdentityLevel> {
    return this.call<IdentityLevel>('get_identity_level', { identity_id: identityId });
  }

  // =========================================================================
  // Pools
  // =========================================================================

  async getPoolInfo(poolId: string): Promise<PoolInfo> {
    return this.call<PoolInfo>('get_pool_info', { pool_id: poolId });
  }

  async getPoolForContent(contentId: string): Promise<{
    has_pool: boolean;
    pool_id?: string;
    total_pow: number;
    required_pow: number;
    status: string;
    contributor_count: number;
    expires_at: number;
  }> {
    return this.call('get_pool_for_content', { content_id: contentId });
  }

  // =========================================================================
  // Reactions
  // =========================================================================

  async getReactions(contentId: string): Promise<{
    content_id: string;
    reactions: ReactionResult[];
    total: number;
  }> {
    return this.call('get_reactions', { content_id: contentId });
  }

  async getUserReactions(
    contentId: string,
    userId: string
  ): Promise<{
    content_id: string;
    user_id: string;
    reaction_types: number[];
  }> {
    return this.call('get_user_reactions', {
      content_id: contentId,
      user_id: userId,
    });
  }

  // =========================================================================
  // Content Submission
  // =========================================================================

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
  }): Promise<{ content_id: string; broadcast: boolean; recipients: number }> {
    return this.call('submit_post', {
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
  }): Promise<{ content_id: string; message: string }> {
    return this.call('submit_reply', {
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
    reaction_stored: boolean;
    content_id: string;
    emoji?: number;
  }> {
    return this.call('submit_engagement', {
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
  }): Promise<{
    space_id: string;
    name: string;
    success: boolean;
  }> {
    return this.call('create_space', {
      name: params.name,
      creator_id: params.creatorId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  // =========================================================================
  // Spam Attestation (SPEC_12 §3)
  // =========================================================================

  /**
   * Submit a spam attestation to flag content
   */
  async submitSpamAttestation(params: {
    contentId: string;
    attesterId: string;
    reason: SpamReason;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{
    stored: boolean;
    content_id: string;
    attestation_count: number;
    threshold_reached: boolean;
  }> {
    return this.call('submit_spam_attestation', {
      content_id: params.contentId,
      attester_id: params.attesterId,
      reason: params.reason,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  /**
   * Submit a counter-attestation to dispute a spam flag
   */
  async submitCounterAttestation(params: {
    contentId: string;
    attesterId: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{
    stored: boolean;
    content_id: string;
    counter_count: number;
    threshold_reached: boolean;
  }> {
    return this.call('submit_counter_attestation', {
      content_id: params.contentId,
      attester_id: params.attesterId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  /**
   * Get spam status for content
   */
  async getSpamStatus(contentId: string): Promise<SpamStatus> {
    return this.call<SpamStatus>('get_spam_status', {
      content_id: contentId,
    });
  }

  // =========================================================================
  // Direct Messages
  // =========================================================================

  /**
   * Send a DM request to another user
   *
   * @param requester - Requester's public key (hex)
   * @param recipient - Recipient's public key (hex)
   * @param keyShare - Requester's key share for DH exchange (hex)
   * @param signature - Signature of the request
   * @param timestamp - Unix timestamp
   */
  async requestDM(params: {
    requester: string;
    recipient: string;
    keyShare: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ request_hash: string; broadcast: boolean }> {
    return this.call('request_dm', {
      requester: params.requester,
      recipient: params.recipient,
      key_share: params.keyShare,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  /**
   * Accept a DM request from another user
   *
   * @param requester - Requester's public key (hex)
   * @param acceptor - Acceptor's public key (hex)
   * @param keyShare - Acceptor's key share for completing DH exchange (hex)
   * @param signature - Signature of the acceptance
   * @param timestamp - Unix timestamp
   */
  async acceptDM(params: {
    requester: string;
    acceptor: string;
    keyShare: string;
    signature: string;
    timestamp: number;
  }): Promise<{ space_id: string; broadcast: boolean }> {
    return this.call('accept_dm', {
      requester: params.requester,
      acceptor: params.acceptor,
      key_share: params.keyShare,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  /**
   * Decline a DM request from another user
   */
  async declineDM(params: {
    requester: string;
    decliner: string;
    signature: string;
    timestamp: number;
  }): Promise<{ success: boolean; broadcast: boolean }> {
    return this.call('decline_dm', {
      requester: params.requester,
      decliner: params.decliner,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  /**
   * Get pending DM requests for a user
   */
  async getPendingDMRequests(userId: string): Promise<{
    requests: Array<{
      request_hash: string;
      requester: string;
      key_share: string;
      created_at: number;
    }>;
  }> {
    return this.call('get_pending_dm_requests', { user_id: userId });
  }

  // =========================================================================
  // Private Space Management
  // =========================================================================

  /**
   * Kick a member from a private space (admin/mod only)
   *
   * This removes the member and rotates keys for remaining members.
   *
   * @param spaceId - Space ID (hex)
   * @param admin - Admin's public key (hex)
   * @param member - Member to kick (hex)
   * @param newEncryptedKeys - Map of member pubkey → new encrypted space key
   * @param keyVersion - New key version number
   */
  async kickMember(params: {
    spaceId: string;
    admin: string;
    member: string;
    newEncryptedKeys: Record<string, string>;
    keyVersion: number;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ success: boolean; key_version: number; broadcast: boolean }> {
    return this.call('kick_member', {
      space_id: params.spaceId,
      admin: params.admin,
      member: params.member,
      new_encrypted_keys: params.newEncryptedKeys,
      key_version: params.keyVersion,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  /**
   * Leave a private space
   */
  async leaveSpace(params: {
    spaceId: string;
    member: string;
    signature: string;
    timestamp: number;
  }): Promise<{ success: boolean; broadcast: boolean }> {
    return this.call('leave_space', {
      space_id: params.spaceId,
      member: params.member,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  /**
   * Get members of a private space
   */
  async getSpaceMembers(spaceId: string): Promise<{
    members: Array<{
      member_id: string;
      role: string;
      joined_at: number;
      invited_by: string;
      key_version: number;
    }>;
  }> {
    return this.call('get_space_members', { space_id: spaceId });
  }
}

// =========================================================================
// Configuration Helpers
// =========================================================================

const RPC_PORTS = {
  mainnet: 9736,
  testnet: 19756,
  regtest: 29736,
} as const;

export type Network = keyof typeof RPC_PORTS;

/**
 * Get RPC config for local node
 */
export function getLocalConfig(network: Network = 'testnet'): RpcConfig {
  return {
    endpoint: `http://127.0.0.1:${RPC_PORTS[network]}`,
    timeout: 30000,
  };
}

export const LOCAL_TESTNET: RpcConfig = getLocalConfig('testnet');
export const LOCAL_REGTEST: RpcConfig = getLocalConfig('regtest');
export const LOCAL_MAINNET: RpcConfig = getLocalConfig('mainnet');

// Public testnet seeds
export const TESTNET_SEED_SF: RpcConfig = {
  endpoint: 'http://64.225.115.108:8736',
  timeout: 30000,
};

export const TESTNET_SEED_NYC: RpcConfig = {
  endpoint: 'http://104.236.106.124:8736',
  timeout: 30000,
};
