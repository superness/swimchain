/**
 * @swimchain/rpc - Swimchain RPC Client
 *
 * JSON-RPC 2.0 client for connecting to Swimchain nodes.
 */

// Types for RPC requests/responses
export interface RpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: number | string;
}

export interface RpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: RpcError;
  id: number | string;
}

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Node status types
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

export interface PeerInfo {
  peer_id: string;
  address: string;
  direction: string;
  connected_seconds: number;
  user_agent: string;
}

export interface SyncStatus {
  state: string;
  pending_items: number;
  last_sync_at: number | null;
  progress: number;
}

// Content types
export interface Content {
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

export interface SpaceContentList {
  items: Content[];
  total: number;
}

// Submit types
export interface SubmitPostParams {
  space_id: string;
  title: string;
  body: string;
  author_id: string;
  pow_nonce: number;
  pow_difficulty: number;
  pow_nonce_space: string;
  pow_hash: string;
  signature: string;
  timestamp: number;
}

export interface SubmitReplyParams {
  parent_id: string;
  body: string;
  author_id: string;
  pow_nonce: number;
  pow_difficulty: number;
  pow_nonce_space: string;
  pow_hash: string;
  signature: string;
  timestamp: number;
}

export interface SubmitResult {
  content_id: string;
  broadcast: boolean;
  recipients: number;
}

// Identity/level types
export interface IdentityLevel {
  identity_id: string;
  level: number;
  level_name: string;
  is_genesis: boolean;
  streak_days: number;
  bandwidth_served: number;
  contribution_score: number;
}

// Pool types
export interface PoolInfo {
  pool_id: string;
  content_id: string;
  total_pow: number;
  required_pow: number;
  status: string;
  contributor_count: number;
  expires_at: number;
}

export interface CreatePoolResult {
  pool_id: string;
  content_id: string;
  expires_at: number;
  required_pow: number;
}

export interface ContributeResult {
  accepted: boolean;
  total_pow: number;
  pool_complete: boolean;
  status: string;
}

// Fork types
export interface ForkInfo {
  fork_id: string;
  name: string;
  description?: string;
  parent_fork?: string;
  parent_height?: number;
  creator?: string;
  timestamp?: number;
  excluded_count?: number;
  supporter_count?: number;
  is_active?: boolean;
}

export interface ForkListItem {
  fork_id: string;
  name: string;
  is_active: boolean;
}

// Client configuration
export interface SwimchainClientConfig {
  /** RPC endpoint URL (e.g., http://127.0.0.1:19736) */
  endpoint: string;
  /** Optional authentication credentials */
  auth?: {
    username: string;
    password: string;
  };
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * SwimchainClient - RPC client for Swimchain nodes
 *
 * @example
 * ```typescript
 * const client = new SwimchainClient({
 *   endpoint: 'http://127.0.0.1:19736',
 *   auth: { username: '__cookie__', password: 'your-cookie-value' }
 * });
 *
 * const info = await client.getInfo();
 * console.log(`Connected to ${info.network} node v${info.version}`);
 * ```
 */
export class SwimchainClient {
  private endpoint: string;
  private auth?: { username: string; password: string };
  private timeout: number;
  private requestId = 1;

  constructor(config: SwimchainClientConfig) {
    this.endpoint = config.endpoint;
    this.auth = config.auth;
    this.timeout = config.timeout ?? 30000;
  }

  // =========================================================================
  // Core RPC call method
  // =========================================================================

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

    if (this.auth) {
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
        throw new SwimchainRpcError(
          -1,
          `HTTP error: ${response.status} ${response.statusText}`
        );
      }

      const rpcResponse = await response.json() as RpcResponse<T>;

      if (rpcResponse.error) {
        throw new SwimchainRpcError(
          rpcResponse.error.code,
          rpcResponse.error.message,
          rpcResponse.error.data
        );
      }

      return rpcResponse.result as T;
    } catch (error) {
      if (error instanceof SwimchainRpcError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new SwimchainRpcError(-2, 'Request timeout');
        }
        throw new SwimchainRpcError(-3, `Network error: ${error.message}`);
      }
      throw new SwimchainRpcError(-4, 'Unknown error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // =========================================================================
  // Node Status Methods
  // =========================================================================

  /** Get node information */
  async getInfo(): Promise<NodeInfo> {
    return this.call<NodeInfo>('get_info');
  }

  /** Get connected peers */
  async getPeers(): Promise<PeerInfo[]> {
    return this.call<PeerInfo[]>('get_peers');
  }

  /** Get sync status */
  async getSyncStatus(): Promise<SyncStatus> {
    return this.call<SyncStatus>('get_sync_status');
  }

  /** Check if node is reachable */
  async ping(): Promise<boolean> {
    try {
      await this.getInfo();
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // Content Query Methods
  // =========================================================================

  /** Get content by ID */
  async getContent(contentId: string): Promise<Content> {
    return this.call<Content>('get_content', { content_id: contentId });
  }

  /** List content in a space */
  async listSpaceContent(
    spaceId: string,
    options?: { limit?: number; offset?: number; sort?: 'recent' | 'hot' | 'top' }
  ): Promise<SpaceContentList> {
    return this.call<SpaceContentList>('list_space_content', {
      space_id: spaceId,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      sort: options?.sort ?? 'recent',
    });
  }

  /** Request content from network (triggers view-to-host fetch) */
  async requestContent(contentId: string): Promise<{ status: string; message: string }> {
    return this.call<{ status: string; message: string }>('request_content', {
      content_id: contentId,
    });
  }

  // =========================================================================
  // Content Submission Methods
  // =========================================================================

  /**
   * Submit a post (requires pre-computed PoW)
   *
   * Note: Use @swimchain/core to compute PoW before calling this method.
   */
  async submitPost(params: SubmitPostParams): Promise<SubmitResult> {
    return this.call<SubmitResult>('submit_post', params);
  }

  /**
   * Submit a reply (requires pre-computed PoW)
   */
  async submitReply(params: SubmitReplyParams): Promise<SubmitResult> {
    return this.call<SubmitResult>('submit_reply', params);
  }

  // =========================================================================
  // Identity/Level Methods
  // =========================================================================

  /** Get swimmer level for an identity */
  async getIdentityLevel(identityId: string): Promise<IdentityLevel> {
    return this.call<IdentityLevel>('get_identity_level', { identity_id: identityId });
  }

  // =========================================================================
  // Engagement Pool Methods
  // =========================================================================

  /** Create an engagement pool for content */
  async createPool(contentId: string, initiatorId: string): Promise<CreatePoolResult> {
    return this.call<CreatePoolResult>('create_pool', {
      content_id: contentId,
      initiator_id: initiatorId,
    });
  }

  /** Get pool information */
  async getPoolInfo(poolId: string): Promise<PoolInfo> {
    return this.call<PoolInfo>('get_pool_info', { pool_id: poolId });
  }

  /** Contribute to an engagement pool */
  async contributeToPool(params: {
    poolId: string;
    contributorId: string;
    powNonce: number;
    powWork: number;
    powTarget: string;
    nonceSpace: string;
    signature: string;
  }): Promise<ContributeResult> {
    return this.call<ContributeResult>('contribute_to_pool', {
      pool_id: params.poolId,
      contributor_id: params.contributorId,
      pow_nonce: params.powNonce,
      pow_work: params.powWork,
      pow_target: params.powTarget,
      nonce_space: params.nonceSpace,
      signature: params.signature,
    });
  }

  // =========================================================================
  // Fork Methods
  // =========================================================================

  /** List all known forks */
  async listForks(): Promise<{ forks: ForkListItem[]; count: number }> {
    return this.call<{ forks: ForkListItem[]; count: number }>('list_forks');
  }

  /** Get fork information */
  async getForkInfo(forkId: string): Promise<ForkInfo> {
    return this.call<ForkInfo>('get_fork_info', { fork_id: forkId });
  }

  /** Get active fork */
  async getActiveFork(): Promise<{ fork_id: string; name: string; is_main_chain: boolean }> {
    return this.call<{ fork_id: string; name: string; is_main_chain: boolean }>('get_active_fork');
  }

  /** Switch to a different fork */
  async switchFork(forkId: string): Promise<{ success: boolean; active_fork: string }> {
    return this.call<{ success: boolean; active_fork: string }>('switch_fork', { fork_id: forkId });
  }

  // =========================================================================
  // Peer Management Methods
  // =========================================================================

  /** Add a peer */
  async addPeer(address: string): Promise<{ added: boolean; address: string }> {
    return this.call<{ added: boolean; address: string }>('add_peer', { address });
  }

  /** Remove a peer */
  async removePeer(peerId: string): Promise<{ removed: boolean }> {
    return this.call<{ removed: boolean }>('remove_peer', { peer_id: peerId });
  }

  /** Stop the node */
  async stop(): Promise<{ stopping: boolean }> {
    return this.call<{ stopping: boolean }>('stop');
  }
}

/**
 * SwimchainRpcError - Error from RPC calls
 */
export class SwimchainRpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'SwimchainRpcError';
    this.code = code;
    this.data = data;
  }
}

// RPC Error codes (matching Rust implementation)
export const RpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // Custom error codes (1000+)
  AUTHENTICATION_REQUIRED: 1001,
  AUTHENTICATION_FAILED: 1002,
  SUBSYSTEM_UNAVAILABLE: 1003,
  STORAGE_ERROR: 1004,
  NETWORK_ERROR: 1005,
  CONTENT_NOT_FOUND: 1006,
  INVALID_CONTENT_ID: 1007,
  POW_INVALID: 1008,
  PEER_NOT_FOUND: 1009,
  CONTENT_BLOCKED: 1010,
  LEVEL_INSUFFICIENT: 1011,
} as const;

// Default export
export default SwimchainClient;
