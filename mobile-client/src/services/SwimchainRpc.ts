/**
 * Swimchain RPC Client for React Native
 *
 * Uses JSON-RPC 2.0 protocol to communicate with Swimchain nodes.
 */

export interface RpcConfig {
  host: string;
  port: number;
  protocol?: 'http' | 'https';
}

// Default local config - can be changed in settings
export const DEFAULT_CONFIG: RpcConfig = {
  host: '10.0.2.2', // Android emulator localhost
  port: 39736, // Testnet RPC port (P2P 39735 + 1)
  protocol: 'http',
};

// For iOS simulator, use localhost
export const IOS_CONFIG: RpcConfig = {
  host: 'localhost',
  port: 39736,
  protocol: 'http',
};

// JSON-RPC Types
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
}

export interface SpaceInfo {
  space_id: string;
  post_count: number;
  name: string | null;
  last_activity: number | null;
}

export interface ContentItem {
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
  survival_probability?: number;
  reply_count?: number;
}

export interface ReplyItem {
  content_id: string;
  author_id: string;
  body: string;
  parent_id: string;
  created_at: number;
  last_engagement: number;
}

type ConnectionListener = (connected: boolean) => void;

export class SwimchainRpc {
  private endpoint: string;
  private nodeInfo: NodeInfo | null = null;
  private listeners: Set<ConnectionListener> = new Set();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private requestId = 1;
  private timeout = 10000;

  // Dev cookie for testnet - must be set via setDevCookie() or environment
  // SECURITY: Never hardcode credentials in source code
  private devCookie: string | null = null;

  constructor(config: RpcConfig = DEFAULT_CONFIG) {
    const protocol = config.protocol ?? 'http';
    this.endpoint = `${protocol}://${config.host}:${config.port}`;
  }

  setDevCookie(cookie: string | null): void {
    this.devCookie = cookie;
  }

  /**
   * Make a JSON-RPC call
   */
  private async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const request: RpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Build headers with auth
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add cookie auth for dev
    if (this.devCookie) {
      const authString = `__cookie__:${this.devCookie}`;
      // Base64 encode for React Native (btoa may not exist)
      const base64 = typeof btoa !== 'undefined'
        ? btoa(authString)
        : Buffer.from(authString).toString('base64');
      headers['Authorization'] = `Basic ${base64}`;
    }

    try {
      console.log('[RPC] Calling:', method);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const rpcResponse: RpcResponse<T> = await response.json();

      if (rpcResponse.error) {
        throw new Error(`RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
      }

      return rpcResponse.result as T;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async connect(): Promise<boolean> {
    if (this.isConnecting) return false;

    this.isConnecting = true;
    try {
      this.nodeInfo = await this.call<NodeInfo>('get_info', {});
      console.log('[RPC] Connected to node:', this.nodeInfo);
      this.notifyListeners(true);
      return true;
    } catch (error) {
      console.log('[RPC] Connection failed:', error);
      this.nodeInfo = null;
      this.notifyListeners(false);
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Start auto-reconnect loop
   */
  startAutoReconnect(intervalMs: number = 5000): void {
    this.stopAutoReconnect();

    const tryConnect = async () => {
      if (!this.isConnected()) {
        await this.connect();
      }
      this.retryTimer = setTimeout(tryConnect, intervalMs);
    };

    tryConnect();
  }

  /**
   * Stop auto-reconnect loop
   */
  stopAutoReconnect(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  isConnected(): boolean {
    return this.nodeInfo !== null;
  }

  getNodeInfo(): NodeInfo | null {
    return this.nodeInfo;
  }

  /**
   * Subscribe to connection state changes
   */
  onConnectionChange(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    // Notify immediately with current state
    listener(this.isConnected());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(connected: boolean): void {
    this.listeners.forEach((listener) => listener(connected));
  }

  // ==========================================================================
  // API Methods (using JSON-RPC method names)
  // ==========================================================================

  async getSyncStatus(): Promise<SyncStatus> {
    return this.call<SyncStatus>('get_sync_status', {});
  }

  async listSpaces(): Promise<{ spaces: SpaceInfo[] }> {
    const result = await this.call<{ spaces: SpaceInfo[]; total: number }>('list_spaces', {});
    return { spaces: result.spaces };
  }

  async listSpaceContent(
    spaceId: string,
    options?: { limit?: number; offset?: number; sort?: 'recent' | 'hot' }
  ): Promise<{ items: ContentItem[] }> {
    const result = await this.call<{ items: ContentItem[]; total: number }>('list_space_content', {
      space_id: spaceId,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      sort: options?.sort ?? 'recent',
    });
    return { items: result.items };
  }

  async getContent(contentId: string): Promise<ContentItem> {
    return this.call<ContentItem>('get_content', { content_id: contentId });
  }

  async getReplies(contentId: string): Promise<{ replies: ReplyItem[]; total_count: number }> {
    const result = await this.call<{ items: ContentItem[]; total: number }>('get_replies', {
      content_id: contentId,
    });
    // Transform ContentItem to ReplyItem format
    const replies: ReplyItem[] = result.items.map((item) => ({
      content_id: item.content_id,
      author_id: item.author_id,
      body: item.body || '',
      parent_id: item.parent_id || contentId,
      created_at: item.created_at,
      last_engagement: item.last_engagement,
    }));
    return { replies, total_count: result.total };
  }

  async getRecentContent(limit: number = 20): Promise<{ items: ContentItem[] }> {
    // Use list_spaces and list_space_content to get recent content
    const spacesResult = await this.listSpaces();
    // Parallelize RPC calls to spaces for better performance
    const contentPromises = spacesResult.spaces.slice(0, 5).map((space) =>
      this.listSpaceContent(space.space_id, { limit: 10, sort: 'recent' })
    );
    const contentResults = await Promise.all(contentPromises);
    const allItems: ContentItem[] = contentResults.flatMap((result) => result.items);
    return { items: allItems.slice(0, limit) };
  }

  async getPoolsAtRisk(threshold: number = 0.1): Promise<{ items: ContentItem[] }> {
    // Get content with low survival probability
    const result = await this.getRecentContent(50);
    return {
      items: result.items.filter(
        (item) => item.survival_probability !== undefined && item.survival_probability < threshold
      ),
    };
  }

  // ========================
  // Content Submission APIs
  // ========================

  private identity: {
    publicKey: string;
    sign: (message: Uint8Array) => Uint8Array;
  } | null = null;

  setIdentity(publicKey: string, sign: (message: Uint8Array) => Uint8Array): void {
    this.identity = { publicKey, sign };
  }

  clearIdentity(): void {
    this.identity = null;
  }

  hasIdentity(): boolean {
    return this.identity !== null;
  }

  async getChallenge(actionType: 'post' | 'reply' | 'engagement'): Promise<{
    challenge_id: string;
    challenge: string;
    difficulty: number;
    expires_at: number;
  }> {
    return this.call<{
      challenge_id: string;
      challenge: string;
      difficulty: number;
      expires_at: number;
    }>('get_challenge', { action_type: actionType });
  }

  async submitPost(params: {
    spaceId: string;
    title: string;
    body: string;
    authorId: string;
    powNonce: number;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ content_id: string; broadcast: boolean; recipients: number }> {
    return this.call<{ content_id: string; broadcast: boolean; recipients: number }>('submit_content', {
      space_id: params.spaceId,
      parent_id: null,
      title: params.title,
      body: params.body,
      author_id: params.authorId,
      pow_nonce: params.powNonce,
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
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ content_id: string; broadcast: boolean; recipients: number }> {
    return this.call<{ content_id: string; broadcast: boolean; recipients: number }>('submit_content', {
      parent_id: params.parentId,
      title: null,
      body: params.body,
      author_id: params.authorId,
      pow_nonce: params.powNonce,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  async submitEngagement(params: {
    contentId: string;
    authorId: string;
    powNonce: number;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ success: boolean; new_probability: number }> {
    return this.call<{ success: boolean; new_probability: number }>('submit_engagement', {
      content_id: params.contentId,
      author_id: params.authorId,
      pow_nonce: params.powNonce,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }
}

// Singleton instance
let _instance: SwimchainRpc | null = null;

export function getRpcClient(): SwimchainRpc {
  if (!_instance) {
    _instance = new SwimchainRpc();
  }
  return _instance;
}

export function setRpcConfig(config: RpcConfig): void {
  _instance = new SwimchainRpc(config);
}

export default SwimchainRpc;
