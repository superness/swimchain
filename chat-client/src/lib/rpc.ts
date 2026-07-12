/**
 * Swimchain RPC Client for Forum UI
 *
 * This module provides the connection between the forum UI and a Swimchain node.
 * Uses signature-based authentication with the user's identity keypair.
 */

import { wasm } from '@swimchain/frontend';

type WasmKeypair = InstanceType<typeof wasm.WasmKeypair>;

// RPC Types (inline to avoid build dependencies for now)
interface RpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: number | string;
}

interface RpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: { code: number; message: string; data?: unknown };
  id: number | string;
}

// Node types from RPC
interface NodeInfo {
  version: string;
  network: string;
  uptime_seconds: number;
  peer_count: number;
  block_height: number;
  node_id: string;
  rpc_port: number;
  p2p_port: number;
}

interface ContentResult {
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
  /** Attached media (images) on the post — same shape get_replies returns. */
  media_refs?: Array<{ media_hash: string; media_type: string; size_bytes: number }>;
}

interface SpaceContentResult {
  items: ContentResult[];
  total: number;
}

interface SpaceSummary {
  space_id: string;
  post_count: number;
  last_activity: number | null;
  name: string | null;
  /** App-namespace tag (e.g. "wiki"). Set = a specialized space; general clients hide it. */
  app?: string | null;
  /** True if this is a real public space whose name (and therefore `app`) isn't resolved yet. */
  name_unresolved?: boolean;
}

/**
 * Allowlist filter for a general "main-view" client: show ONLY a space we can positively
 * confirm is a plain, public, main-view space. Any app-namespaced space (dm/profile/wiki/…),
 * `@app:`-named space, or space whose name/`app` the node hasn't resolved yet (could be a
 * utility space in disguise) is hidden. New utility space types only need the `@<app>:`
 * prefix convention to hide here automatically — this filter never needs per-type updates.
 */
export function isMainViewSpace(s: SpaceSummary): boolean {
  if (typeof s.app === 'string' && s.app.length > 0) return false;
  const name = typeof s.name === 'string' ? s.name.toLowerCase() : '';
  if (/^@[a-z0-9-]+:/.test(name)) return false;
  if (s.name_unresolved) return false;
  return true;
}

interface ListSpacesResult {
  spaces: SpaceSummary[];
  total: number;
}

interface IdentityLevel {
  identity_id: string;
  level: number;
  level_name: string;
  is_genesis: boolean;
  streak_days: number;
  bandwidth_served: number;
  contribution_score: number;
}

interface PoolInfo {
  pool_id: string;
  content_id: string;
  total_pow: number;
  required_pow: number;
  status: string;
  contributor_count: number;
  expires_at: number;
}

/**
 * Remote signing function type for node identity
 */
export type RemoteSignFunction = (messageHex: string) => Promise<string | null>;

/**
 * RPC client configuration
 */
export interface RpcConfig {
  endpoint: string;
  auth?: {
    username: string;
    password: string;
  };
  /** Raw Authorization header value (e.g., 'Basic base64...') - takes precedence over auth */
  authHeader?: string;
  /** Signature auth: hex-encoded 32-byte seed (private key) */
  seed?: string;
  /** Signature auth: hex-encoded 32-byte public key */
  publicKey?: string;
  timeout?: number;
}

/**
 * Helper: Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Helper: Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Helper: SHA-256 hash (using Web Crypto API)
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(hashBuffer);
}

/**
 * SwimchainRpc - Browser RPC client with signature authentication
 */
export class SwimchainRpc {
  private endpoint: string;
  private auth?: { username: string; password: string };
  private authHeader?: string;
  private keypair: WasmKeypair | null = null;
  private publicKeyHex: string | null = null;
  private remoteSignFn: RemoteSignFunction | null = null;
  private remotePublicKeyHex: string | null = null;
  private timeout: number;
  private requestId = 1;
  private connected = false;
  private nodeInfo: NodeInfo | null = null;

  constructor(config: RpcConfig) {
    this.endpoint = config.endpoint;
    this.auth = config.auth;
    this.authHeader = config.authHeader;
    this.timeout = config.timeout ?? 30000;

    // Initialize keypair from seed if provided
    if (config.seed && config.publicKey) {
      try {
        const seedBytes = hexToBytes(config.seed);
        this.keypair = wasm.WasmKeypair.fromSeed(seedBytes);
        this.publicKeyHex = config.publicKey;
      } catch (error) {
        console.error('Failed to initialize keypair from seed:', error);
      }
    }
  }

  /**
   * Get the HTTP RPC endpoint this client talks to.
   * Used to derive the WebSocket events URL (ws://.../ws).
   */
  getEndpoint(): string {
    return this.endpoint;
  }

  /**
   * Set identity for signature auth (can be called after construction)
   */
  setIdentity(seed: string, publicKey: string): void {
    try {
      const seedBytes = hexToBytes(seed);
      this.keypair?.free(); // Free previous keypair if any
      this.keypair = wasm.WasmKeypair.fromSeed(seedBytes);
      this.publicKeyHex = publicKey;
    } catch (error) {
      console.error('Failed to set identity:', error);
    }
  }

  /**
   * Clear identity (disconnect from auth)
   */
  clearIdentity(): void {
    this.keypair?.free();
    this.keypair = null;
    this.publicKeyHex = null;
    this.remoteSignFn = null;
    this.remotePublicKeyHex = null;
  }

  /**
   * Set remote signing function for node identity
   * Used when the node owns the keypair and signs via RPC
   */
  setRemoteSigner(publicKeyHex: string, signFn: RemoteSignFunction): void {
    this.remotePublicKeyHex = publicKeyHex;
    this.remoteSignFn = signFn;
  }

  /**
   * Check if remote signing is configured
   */
  hasRemoteSigner(): boolean {
    return this.remoteSignFn !== null && this.remotePublicKeyHex !== null;
  }

  /**
   * Make a raw RPC call with signature authentication
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

    // Use signature auth if we have a keypair
    if (this.keypair && this.publicKeyHex) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const paramsJson = JSON.stringify(params);
      const paramsHash = await sha256(new TextEncoder().encode(paramsJson));
      const paramsHashHex = bytesToHex(paramsHash);

      // Build signed message: "swimchain-rpc:" + method + ":" + sha256(params_json_hex) + ":" + timestamp
      const message = `swimchain-rpc:${method}:${paramsHashHex}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);

      // Sign with keypair
      const signature = this.keypair.sign(messageBytes);
      const signatureHex = bytesToHex(signature);

      // Add signature headers
      headers['X-CS-Identity'] = this.publicKeyHex;
      headers['X-CS-Timestamp'] = timestamp;
      headers['X-CS-Signature'] = signatureHex;
    } else if (this.authHeader) {
      // Use raw auth header (e.g., from parent frame via SWIMCHAIN_RPC_CONFIG)
      headers['Authorization'] = this.authHeader;
    } else if (this.auth) {
      // Fall back to basic auth
      const credentials = `${this.auth.username}:${this.auth.password}`;
      headers['Authorization'] = `Basic ${btoa(credentials)}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('[RPC] Request timeout after', this.timeout, 'ms for method:', method);
      controller.abort();
    }, this.timeout);

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

      const rpcResponse = await response.json() as RpcResponse<T>;

      if (rpcResponse.error) {
        throw new Error(`RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
      }

      return rpcResponse.result as T;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('[RPC] Request aborted for method:', method, 'Was timeout?', controller.signal.aborted);
      }
      throw err;
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

  // =========================================================================
  // Node Status
  // =========================================================================

  async getInfo(): Promise<NodeInfo> {
    return this.call<NodeInfo>('get_info');
  }

  async getSyncStatus(): Promise<{
    state: string;
    chain_percent: number;
    peer_count: number;
    storage_mb: number;
    storage_target_mb: number;
    last_block_time: number | null;
  }> {
    return this.call('get_sync_status');
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
    const result = await this.call<ListSpacesResult>('list_spaces', {
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    });
    // Show only confirmed plain public spaces; hide app-namespaced, @app:-named, and
    // not-yet-resolved spaces. See isMainViewSpace — an allowlist, so new utility space
    // types hide automatically.
    const spaces = result.spaces.filter(isMainViewSpace);
    return { ...result, spaces, total: spaces.length };
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

  async requestContent(contentId: string): Promise<{ status: string; message: string }> {
    return this.call('request_content', { content_id: contentId });
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
  // Pool Contributions
  // =========================================================================

  async createPool(
    contentId: string,
    initiatorId: string
  ): Promise<{ pool_id: string; content_id: string; expires_at: number; required_pow: number }> {
    return this.call('create_pool', {
      content_id: contentId,
      initiator_id: initiatorId,
    });
  }

  async contributeToPool(params: {
    poolId: string;
    contributorId: string;
    powNonce: number;
    powWork: number;
    powTarget: string;
    nonceSpace: string;
    signature: string;
    emoji?: number; // Optional emoji code (1-8)
  }): Promise<{ accepted: boolean; total_pow: number; pool_complete: boolean; status: string }> {
    return this.call('contribute_to_pool', {
      pool_id: params.poolId,
      contributor_id: params.contributorId,
      pow_nonce: params.powNonce,
      pow_work: params.powWork,
      pow_target: params.powTarget,
      nonce_space: params.nonceSpace,
      signature: params.signature,
      emoji: params.emoji,
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
    mediaRefs?: Array<{ mediaHash: string; mediaType: string; sizeBytes: number }>;
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
      media_refs: params.mediaRefs?.map(mr => ({
        media_hash: mr.mediaHash,
        media_type: mr.mediaType,
        size_bytes: mr.sizeBytes,
      })) || [],
    });
  }

  // =========================================================================
  // Reply Queries
  // =========================================================================

  async getReplies(contentId: string): Promise<{
    parent_id: string;
    replies: Array<{
      content_id: string;
      author_id: string;
      body: string;
      parent_id: string;
      created_at: number;
      last_engagement: number;
      display_name?: string;
      media_refs?: Array<{
        media_hash: string;
        media_type: string;
        size_bytes: number;
      }>;
    }>;
    total_count: number;
  }> {
    return this.call('get_replies', {
      content_id: contentId,
    });
  }

  // =========================================================================
  // Reactions (from PoW engagement via submitEngagement)
  // =========================================================================

  /**
   * Get reaction counts for content
   */
  async getReactions(contentId: string): Promise<{
    content_id: string;
    reactions: Array<{ emoji: string; reaction_type: number; count: number }>;
    total: number;
  }> {
    return this.call('get_reactions', {
      content_id: contentId,
    });
  }

  /**
   * Get which reactions the current user has added
   */
  async getUserReactions(contentId: string): Promise<{
    content_id: string;
    user_id: string;
    reaction_types: number[];
  }> {
    if (!this.publicKeyHex) {
      throw new Error('No identity set for reactions');
    }
    return this.call('get_user_reactions', {
      content_id: contentId,
      user_id: this.publicKeyHex,
    });
  }

  // =========================================================================
  // Media Upload
  // =========================================================================

  /**
   * Upload media (image) to the node
   * Returns the media hash for use in media_refs
   */
  async uploadMedia(params: {
    data: string;  // Base64-encoded image data
    mediaType: string;  // image/jpeg, image/png, image/gif, image/webp
  }): Promise<{ media_hash: string; size_bytes: number; success: boolean }> {
    return this.call('upload_media', {
      data: params.data,
      media_type: params.mediaType,
    });
  }

  /**
   * Get media by hash
   * Returns base64-encoded image data
   */
  async getMedia(mediaHash: string): Promise<{
    media_hash: string;
    media_type: string;
    data: string;  // Base64-encoded
    size_bytes: number;
  }> {
    return this.call('get_media', {
      media_hash: mediaHash,
    });
  }

  // =========================================================================
  // Engagement Submission (replaces pool contributions)
  // =========================================================================

  /**
   * Submit an engagement (reaction) with PoW proof
   * This directly records the engagement without needing pools
   */
  async submitEngagement(params: {
    contentId: string;
    authorId: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
    emoji?: number; // Optional emoji code (1-8)
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

  // =========================================================================
  // Private Channels/Spaces
  // =========================================================================

  /**
   * Create a private (encrypted) channel/space
   */
  async createPrivateChannel(params: {
    name: string; // Encrypted space name (hex)
    creator: string; // Creator's public key (hex)
    creatorEncryptedKey: string; // Space key encrypted for creator (hex)
    signature: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    timestamp: number;
  }): Promise<{
    space_id: string;
    space_id_bech32: string;
    broadcast: boolean;
  }> {
    return this.call('create_private_space', {
      name: params.name,
      creator: params.creator,
      creator_encrypted_key: params.creatorEncryptedKey,
      signature: params.signature,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      timestamp: params.timestamp,
    });
  }

  /**
   * Invite someone to a private channel/space
   */
  // DM methods

  // DM methods
  async requestDm(a:{targetPk:string;senderPk:string;encryptedSpaceKey:string;signature:string;powNonce:number;powDifficulty:number;powNonceSpace:string;powHash:string;timestamp:number;message?:string;}):Promise<{space_id:string;status:string}>{return this.call('request_dm',{target_pk:a.targetPk,sender_pk:a.senderPk,encrypted_space_key:a.encryptedSpaceKey,signature:a.signature,pow_nonce:a.powNonce,pow_difficulty:a.powDifficulty,pow_nonce_space:a.powNonceSpace,pow_hash:a.powHash,timestamp:a.timestamp,message:a.message});}
  async acceptDm(a:{spaceId:string;accepterPk:string;encryptedSpaceKey:string;signature:string;powNonce:number;powDifficulty:number;powNonceSpace:string;powHash:string;timestamp:number;}):Promise<{space_id:string;status:string}>{return this.call('accept_dm',{space_id:a.spaceId,accepter_pk:a.accepterPk,encrypted_space_key:a.encryptedSpaceKey,signature:a.signature,pow_nonce:a.powNonce,pow_difficulty:a.powDifficulty,pow_nonce_space:a.powNonceSpace,pow_hash:a.powHash,timestamp:a.timestamp});}
  async declineDm(a:{spaceId:string;declinerPk:string;signature:string;powNonce:number;powDifficulty:number;powNonceSpace:string;powHash:string;timestamp:number;}):Promise<{space_id:string;status:string}>{return this.call('decline_dm',{space_id:a.spaceId,decliner_pk:a.declinerPk,signature:a.signature,pow_nonce:a.powNonce,pow_difficulty:a.powDifficulty,pow_nonce_space:a.powNonceSpace,pow_hash:a.powHash,timestamp:a.timestamp});}
  // Node-managed DM methods (desktop / node mode): the node holds the key and does the
  // crypto + PoW, so the browser passes only the counterparty. `recipient` accepts a
  // 32-byte hex pubkey or a cs1… address.
  async requestDmManaged(a:{recipient:string;}):Promise<{space_id:string;space_id_bech32:string;recipient:string;broadcast:boolean;}>{return this.call('request_dm_managed',{recipient:a.recipient});}
  async acceptDmManaged(a:{requester:string;}):Promise<{space_id:string;space_id_bech32:string;requester:string;}>{return this.call('accept_dm_managed',{requester:a.requester});}
  async declineDmManaged(a:{requester:string;}):Promise<{requester:string;declined:boolean;}>{return this.call('decline_dm_managed',{requester:a.requester});}
  async getPendingDmRequests(a:{user:string;}):Promise<{requests:Array<{requester:string;key_share:string;request_hash:string;created_at:number;}>;}>{return this.call('get_pending_dm_requests',{user:a.user});}
  async getSentDmRequests(a:{user:string;}):Promise<{requests:Array<{recipient:string;status:'pending'|'accepted'|'declined';space_id:string|null;created_at:number;}>;}>{return this.call('get_sent_dm_requests',{user:a.user});}
  async encodeAddress(a:{pubkey:string;}):Promise<{address:string;}>{return this.call('encode_address',{pubkey:a.pubkey});}
  async getSponsorshipInfo(c:string):Promise<{sponsor_id:string|null;status:string;total_stake:number;}>{return this.call('get_sponsorship_info',{content_id:c});}
  async listSponsorshipOffers(a?:{limit?:number;offset?:number;status?:string;}):Promise<{offers:Array<{offer_id:string;sponsor_id:string;title:string;description:string;total_stake:number;remaining_stake:number;status:string;}>;total:number;}>{return this.call('list_sponsorship_offers',{limit:a?.limit??20,offset:a?.offset??0,status:a?.status});}
  async claimSponsorshipOffer(a:{offerId:string;claimantPk:string;contentId:string;signature:string;powNonce:number;powDifficulty:number;powNonceSpace:string;powHash:string;timestamp:number;}):Promise<{claim_id:string;status:string}>{return this.call('claim_sponsorship_offer',{offer_id:a.offerId,claimant_pk:a.claimantPk,content_id:a.contentId,signature:a.signature,pow_nonce:a.powNonce,pow_difficulty:a.powDifficulty,pow_nonce_space:a.powNonceSpace,pow_hash:a.powHash,timestamp:a.timestamp});}
  async searchContent(a:{query:string;spaceId?:string;author?:string;types?:string[];sortBy?:"relevance"|"recent"|"heat";limit?:number;offset?:number;minReplies?:number;minReactions?:number;afterTimestamp?:number;beforeTimestamp?:number;}):Promise<{results:Array<{content_id:string;title:string;body:string;author_id:string;space_id:string;space_name?:string;content_type:string;created_at:number;last_engagement:number;reply_count:number;engagement_count:number;survival_probability:number;is_decayed:boolean;score:number;}>;total:number;took_ms:number;}>{return this.call('search',{query:a.query,space_id:a.spaceId,author:a.author,types:a.types,sort_by:a.sortBy??"relevance",limit:a.limit??20,offset:a.offset??0,min_replies:a.minReplies,min_reactions:a.minReactions,after_timestamp:a.afterTimestamp,before_timestamp:a.beforeTimestamp});}  async inviteToChannel(params: {
    spaceId: string;
    inviter: string;
    invitee: string;
    encryptedSpaceKey: string; // Space key encrypted for invitee (hex)
    signature: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    timestamp: number;
    expiresAt?: number;
    message?: string;
  }): Promise<{
    invite_hash: string;
    broadcast: boolean;
  }> {
    return this.call('invite_to_space', {
      space_id: params.spaceId,
      inviter: params.inviter,
      invitee: params.invitee,
      encrypted_space_key: params.encryptedSpaceKey,
      signature: params.signature,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      timestamp: params.timestamp,
      expires_at: params.expiresAt,
      message: params.message,
    });
  }
}

// =========================================================================
// Global RPC instance management
// =========================================================================

let globalRpc: SwimchainRpc | null = null;

/**
 * Get the global RPC client (for use in hooks and components)
 */
export function getRpc(): SwimchainRpc | null {
  return globalRpc;
}

/**
 * Initialize the global RPC client
 */
export function initRpc(config: RpcConfig): SwimchainRpc {
  globalRpc = new SwimchainRpc(config);
  return globalRpc;
}

/**
 * Get RPC connection status
 */
export function isRpcConnected(): boolean {
  return globalRpc?.isConnected() ?? false;
}

// =========================================================================
// LOCAL NODE ONLY - The client connects to YOUR node, not remote seeds
// =========================================================================
//
// The forum-client ONLY connects to localhost. This is by design:
//
//   ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
//   │  forum-client   │ ──▶  │   YOUR NODE     │ ◀─▶  │    NETWORK      │
//   │  (this app)     │      │   (localhost)   │      │  (p2p mesh)     │
//   └─────────────────┘      └─────────────────┘      └─────────────────┘
//
// If you're seeing "connection failed", you need to start your local node.
// The node is embedded in the app and starts automatically.
//
// DO NOT add remote seed endpoints here. The client talks to YOUR node.
// YOUR node talks to the network.
// =========================================================================

// Ports per network (matches the node's default ports)
const RPC_PORTS = {
  mainnet: 9736,   // RPC is P2P port + 1
  testnet: 19736,
  regtest: 29736,
};

/**
 * Get local node RPC config for the specified network
 */
export function getLocalConfig(network: 'mainnet' | 'testnet' | 'regtest' = 'testnet'): RpcConfig {
  return {
    endpoint: `http://127.0.0.1:${RPC_PORTS[network]}`,
    timeout: 10000, // Localhost should be fast
  };
}

// Convenience exports for common networks
export const LOCAL_TESTNET: RpcConfig = getLocalConfig('testnet');
export const LOCAL_REGTEST: RpcConfig = getLocalConfig('regtest');
export const LOCAL_MAINNET: RpcConfig = getLocalConfig('mainnet');

// Default - testnet for development
export const LOCAL_CONFIG = LOCAL_TESTNET;

// =========================================================================
// Tauri Integration
// =========================================================================

/**
 * Check if running inside Tauri
 */
export function isInTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Get RPC auth from Tauri backend (reads cookie file)
 */
export async function getTauriAuth(): Promise<{ username: string; password: string } | null> {
  if (!isInTauri()) return null;

  try {
    // Dynamic import to avoid bundling issues when not in Tauri
    const { invoke } = await import('@tauri-apps/api/core');
    const authHeader = await invoke<string>('get_rpc_auth');

    // authHeader is "Basic <base64>" - decode it
    if (authHeader.startsWith('Basic ')) {
      const decoded = atob(authHeader.substring(6));
      const colonIndex = decoded.indexOf(':');
      if (colonIndex > 0) {
        return {
          username: decoded.substring(0, colonIndex),
          password: decoded.substring(colonIndex + 1),
        };
      }
    }
  } catch (error) {
    console.error('Failed to get Tauri RPC auth:', error);
  }

  return null;
}

/**
 * Get local config with Tauri auth if available
 */
export async function getLocalConfigWithAuth(network: 'mainnet' | 'testnet' | 'regtest' = 'testnet'): Promise<RpcConfig> {
  const config = getLocalConfig(network);

  // If in Tauri, get auth from backend
  const auth = await getTauriAuth();
  if (auth) {
    config.auth = auth;
  }

  return config;
}
