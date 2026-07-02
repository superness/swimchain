/**
 * Swimchain Node RPC Client (Server-side)
 *
 * Ported from wiki-client's SwimchainRpc to work in Next.js SSR context.
 * Uses fetch() which is available in Node 18+ / Next.js server components.
 *
 * Provides read-only access to a Swimchain node via JSON-RPC.
 * Returns the same strongly-typed interfaces used throughout the gateway.
 */

import type {
  ContentResponse,
  SpaceActivitySummary,
  ReputationSummary,
  HealthStatus,
  ContentEvent,
} from '@/types/gateway';

// =========================================================================
// RPC Types
// =========================================================================

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

interface SyncStatus {
  state: string;
  chain_percent: number;
  peer_count: number;
  storage_mb: number;
  storage_target_mb: number;
  last_block_time: number | null;
}

interface NodePeer {
  peer_id: string;
  address: string;
  direction: string;
}

interface RpcContentInfo {
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
  reply_count?: number;
}

interface RpcSpaceInfo {
  space_id: string;
  name: string;
  post_count: number;
  last_activity: number | null;
}

interface RpcIdentityInfo {
  identity_id: string;
  display_name?: string;
  post_count: number;
  reply_count: number;
  reactions_received: number;
  created_at: number;
}

// =========================================================================
// Raw RPC response types from the node
// =========================================================================

interface RawContentResponse {
  item: {
    content_id: string;
    author_id: string;
    signature: string;
    created_at: number;
    last_engagement: number;
    content_type: string;
    parent_id: string | null;
    space_id: string;
    body_inline: string | null;
    content_hash: string | null;
    content_size: number | null;
    pow_nonce: number;
    pow_difficulty: number;
    engagement_count: number;
  };
  survival_probability: number;
  is_decayed: boolean;
  is_protected: boolean;
  hours_until_decay: number | null;
  pool: {
    poolId: string;
    contributedSeconds: number;
    requiredSeconds: number;
    contributorCount: number;
    timeRemainingMs: number | null;
    progressPercentage: number;
  } | null;
  children?: RawContentResponse[];
}

interface RawSpaceActivity {
  space_id: string;
  space_name: string;
  description?: string;
  post_count: number;
  active_posts: number;
  unique_participants: number;
  last_activity: number;
  decay_health: number;
  created_at: number;
}

interface RawReputationSummary {
  identity: string;
  first_block: number;
  post_count: number;
  reply_count: number;
  received_replies: number;
  age_seconds: number;
}

// =========================================================================
// RPC Client
// =========================================================================

export class NodeRpcClient {
  private endpoint: string;
  private timeout: number;
  private requestId = 1;
  private _nodeInfo: NodeInfo | null = null;

  constructor(endpoint: string, timeout = 10000) {
    // Ensure endpoint is the HTTP RPC URL (not WebSocket)
    this.endpoint = endpoint.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
    // Remove trailing /rpc or / if present, then append /rpc
    this.endpoint = this.endpoint.replace(/\/?(rpc)?$/, '');
    this.endpoint = `${this.endpoint}/rpc`;
    this.timeout = timeout;
  }

  /**
   * Make a raw JSON-RPC call
   */
  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const request: RpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
        // Next.js caching: never cache RPC responses
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
      }

      const rpcResponse = await response.json() as RpcResponse<T>;

      if (rpcResponse.error) {
        throw new Error(`RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
      }

      return rpcResponse.result as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // =========================================================================
  // Connection & Status
  // =========================================================================

  /**
   * Ping the node to check connectivity
   */
  async ping(): Promise<boolean> {
    try {
      const info = await this.call<NodeInfo>('get_info');
      this._nodeInfo = info;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cached node info
   */
  getNodeInfo(): NodeInfo | null {
    return this._nodeInfo;
  }

  /**
   * Get full node info
   */
  async getInfo(): Promise<NodeInfo> {
    const info = await this.call<NodeInfo>('get_info');
    this._nodeInfo = info;
    return info;
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    return this.call<SyncStatus>('get_sync_status');
  }

  /**
   * Get connected peers
   */
  async getPeers(): Promise<NodePeer[]> {
    return this.call<NodePeer[]>('get_peers');
  }

  // =========================================================================
  // Content
  // =========================================================================

  /**
   * Get content by ID with full response tree
   */
  async getContent(contentId: string): Promise<ContentResponse | null> {
    try {
      const raw = await this.call<RawContentResponse>('get_content', { content_id: contentId });
      return this.normalizeContentResponse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Get content in a space (paginated)
   */
  async getSpaceContent(spaceId: string, limit = 50, offset = 0): Promise<ContentResponse[]> {
    try {
      const raw = await this.call<RawContentResponse[]>('list_space_content', {
        space_id: spaceId,
        limit,
        offset,
      });
      return (raw || []).map(r => this.normalizeContentResponse(r));
    } catch {
      return [];
    }
  }

  /**
   * Get content by identity/author (paginated)
   */
  async getContentByIdentity(address: string, limit = 50, offset = 0): Promise<ContentResponse[]> {
    try {
      const raw = await this.call<RawContentResponse[]>('get_user_posts', {
        identity: address,
        limit,
        offset,
      });
      return (raw || []).map(r => this.normalizeContentResponse(r));
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Spaces
  // =========================================================================

  /**
   * Get all spaces
   */
  async getAllSpaces(): Promise<SpaceActivitySummary[]> {
    try {
      const raw = await this.call<RawSpaceActivity[]>('get_all_spaces');
      return (raw || []).map(r => ({
        space_id: r.space_id,
        space_name: r.space_name,
        description: r.description,
        post_count: r.post_count,
        active_posts: r.active_posts,
        unique_participants: r.unique_participants,
        last_activity: r.last_activity,
        decay_health: r.decay_health,
        created_at: r.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get space info
   */
  async getSpaceInfo(spaceId: string): Promise<SpaceActivitySummary | null> {
    try {
      const raw = await this.call<RawSpaceActivity>('get_space_info', { space_id: spaceId });
      return {
        space_id: raw.space_id,
        space_name: raw.space_name,
        description: raw.description,
        post_count: raw.post_count,
        active_posts: raw.active_posts,
        unique_participants: raw.unique_participants,
        last_activity: raw.last_activity,
        decay_health: raw.decay_health,
        created_at: raw.created_at,
      };
    } catch {
      return null;
    }
  }

  // =========================================================================
  // Identity
  // =========================================================================

  /**
   * Get identity reputation
   */
  async getIdentityReputation(address: string): Promise<ReputationSummary | null> {
    try {
      const raw = await this.call<RawReputationSummary>('get_identity_reputation', { identity: address });
      return {
        identity: raw.identity,
        first_block: raw.first_block,
        post_count: raw.post_count,
        reply_count: raw.reply_count,
        received_replies: raw.received_replies,
        age_seconds: raw.age_seconds,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get identity info
   */
  async getIdentityInfo(address: string): Promise<RpcIdentityInfo | null> {
    try {
      return await this.call<RpcIdentityInfo>('get_identity_info', { identity_id: address });
    } catch {
      return null;
    }
  }

  // =========================================================================
  // Search
  // =========================================================================

  /**
   * Search content with the node's built-in search (fallback for when lunr isn't available server-side)
   */
  async search(params: {
    query: string;
    space_id?: string;
    author?: string;
    limit?: number;
    offset?: number;
    sort_by?: string;
    types?: string[];
    after_timestamp?: number;
    before_timestamp?: number;
    has_media?: boolean;
    min_replies?: number;
  }): Promise<RawContentResponse[]> {
    try {
      const result = await this.call<RawContentResponse[]>('search', {
        query: params.query,
        space_id: params.space_id,
        author: params.author,
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
        sort_by: params.sort_by ?? 'relevance',
        types: params.types,
        after_timestamp: params.after_timestamp,
        before_timestamp: params.before_timestamp,
        has_media: params.has_media,
        min_replies: params.min_replies,
      });
      return result || [];
    } catch {
      return [];
    }
  }

  /**
   * Get search suggestions
   */
  async searchSuggest(prefix: string, limit = 8): Promise<string[]> {
    try {
      return await this.call<string[]>('search_suggest', { prefix, limit });
    } catch {
      return [];
    }
  }

  /**
   * Get trending searches
   */
  async trendingSearches(limit = 10): Promise<string[]> {
    try {
      return await this.call<string[]>('trending_searches', { limit });
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Normalize raw content response to gateway types
   */
  private normalizeContentResponse(raw: RawContentResponse): ContentResponse {
    return {
      item: {
        content_id: raw.item.content_id,
        author_id: raw.item.author_id,
        signature: raw.item.signature,
        created_at: raw.item.created_at,
        last_engagement: raw.item.last_engagement,
        content_type: raw.item.content_type as ContentResponse['item']['content_type'],
        parent_id: raw.item.parent_id,
        space_id: raw.item.space_id,
        body_inline: raw.item.body_inline,
        content_hash: raw.item.content_hash,
        content_size: raw.item.content_size,
        pow_nonce: raw.item.pow_nonce,
        pow_difficulty: raw.item.pow_difficulty,
        engagement_count: raw.item.engagement_count,
      },
      survival_probability: raw.survival_probability,
      is_decayed: raw.is_decayed,
      is_protected: raw.is_protected,
      hours_until_decay: raw.hours_until_decay,
      pool: raw.pool ? {
        poolId: raw.pool.poolId,
        contributedSeconds: raw.pool.contributedSeconds,
        requiredSeconds: raw.pool.requiredSeconds,
        contributorCount: raw.pool.contributorCount,
        timeRemainingMs: raw.pool.timeRemainingMs,
        progressPercentage: raw.pool.progressPercentage,
      } : null,
      children: raw.children?.map(c => this.normalizeContentResponse(c)),
    };
  }
}

// =========================================================================
// Client Management
// =========================================================================

let _client: NodeRpcClient | null = null;

/**
 * Get the default RPC endpoint from config
 */
function getDefaultEndpoint(): string {
  return process.env.NODE_RPC_URL || process.env.NODE_WEBSOCKET_URL || 'http://127.0.0.1:19736';
}

/**
 * Get or create the global RPC client
 */
export function getNodeRpc(): NodeRpcClient {
  if (!_client) {
    _client = new NodeRpcClient(getDefaultEndpoint());
  }
  return _client;
}

/**
 * Create an RPC client for a specific endpoint
 */
export function createNodeRpc(endpoint: string): NodeRpcClient {
  return new NodeRpcClient(endpoint);
}

/**
 * Reset the global client (for testing or reconfiguration)
 */
export function resetNodeRpc(): void {
  _client = null;
}
