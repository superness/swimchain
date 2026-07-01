/**
 * Swimchain RPC Client for Bridge Client
 *
 * Full-featured client for reading and writing to Swimchain.
 * Supports signature authentication for posting bridged content.
 */

export interface RpcConfig {
  host: string;
  port: number;
  protocol?: 'http' | 'https';
}

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

export const LOCAL_CONFIG: RpcConfig = {
  host: 'localhost',
  port: 19736,
  protocol: 'http',
};

interface NodeInfo {
  version: string;
  network: string;
  peer_count: number;
  block_height: number;
}

interface SyncStatus {
  state: string;
  chain_percent: number;
  peer_count: number;
  storage_mb: number;
}

interface SpaceInfo {
  space_id: string;
  post_count: number;
  name: string | null;
}

interface ContentItem {
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

export class SwimchainRpc {
  private baseUrl: string;
  private rpcEndpoint: string;
  private nodeInfo: NodeInfo | null = null;
  private requestId = 1;

  // Identity for signature auth
  private publicKeyHex: string | null = null;
  private signFn: ((message: Uint8Array) => Uint8Array) | null = null;

  constructor(config: RpcConfig) {
    const protocol = config.protocol ?? 'http';
    this.baseUrl = `${protocol}://${config.host}:${config.port}`;
    this.rpcEndpoint = this.baseUrl;
  }

  /**
   * Set identity for signature authentication
   */
  setIdentity(publicKeyHex: string, signFn: (message: Uint8Array) => Uint8Array): void {
    this.publicKeyHex = publicKeyHex;
    this.signFn = signFn;
    console.log('[RPC] Identity set:', publicKeyHex.substring(0, 16) + '...');
  }

  /**
   * Clear identity
   */
  clearIdentity(): void {
    this.publicKeyHex = null;
    this.signFn = null;
  }

  /**
   * Check if identity is set
   */
  hasIdentity(): boolean {
    return this.publicKeyHex !== null && this.signFn !== null;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async connect(): Promise<boolean> {
    try {
      this.nodeInfo = await this.fetch<NodeInfo>('/info');
      console.log('[RPC] Connected to node:', this.nodeInfo);
      return true;
    } catch (error) {
      console.error('[RPC] Connection failed:', error);
      this.nodeInfo = null;
      return false;
    }
  }

  isConnected(): boolean {
    return this.nodeInfo !== null;
  }

  getNodeInfo(): NodeInfo | null {
    return this.nodeInfo;
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return this.fetch<SyncStatus>('/sync/status');
  }

  async listSpaces(): Promise<{ spaces: SpaceInfo[] }> {
    return this.fetch<{ spaces: SpaceInfo[] }>('/spaces');
  }

  async listSpaceContent(
    spaceId: string,
    options?: { limit?: number; sort?: 'recent' | 'hot' }
  ): Promise<{ items: ContentItem[] }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.sort) params.set('sort', options.sort);
    const query = params.toString();
    const path = `/spaces/${spaceId}/content${query ? `?${query}` : ''}`;
    return this.fetch<{ items: ContentItem[] }>(path);
  }

  async getContent(contentId: string): Promise<ContentItem> {
    return this.fetch<ContentItem>(`/content/${contentId}`);
  }

  /**
   * Get recent content across all spaces (for bridge monitoring)
   */
  async getRecentContent(limit: number = 20): Promise<{ items: ContentItem[] }> {
    return this.fetch<{ items: ContentItem[] }>(`/content/recent?limit=${limit}`);
  }

  /**
   * Watch for new content in a space since a given timestamp.
   * Returns content created after the given timestamp.
   */
  async getContentSince(
    spaceId: string,
    sinceTimestamp: number
  ): Promise<{ items: ContentItem[] }> {
    const items = await this.listSpaceContent(spaceId, { limit: 50, sort: 'recent' });
    return {
      items: items.items.filter((item) => item.created_at > sinceTimestamp),
    };
  }

  // ==========================================================================
  // JSON-RPC Methods (for posting with PoW)
  // ==========================================================================

  /**
   * Make a JSON-RPC call with optional signature authentication
   */
  private async rpcCall<T = unknown>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const request: RpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add signature auth if available
    if (this.publicKeyHex && this.signFn) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const paramsJson = JSON.stringify(params);
      const paramsHash = await sha256Hex(paramsJson);

      // Build signed message
      const message = `swimchain-rpc:${method}:${paramsHash}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);

      const signature = this.signFn(messageBytes);
      const signatureHex = bytesToHex(signature);

      headers['X-CS-Identity'] = this.publicKeyHex;
      headers['X-CS-Timestamp'] = timestamp;
      headers['X-CS-Signature'] = signatureHex;
    }

    const response = await fetch(this.rpcEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const rpcResponse = (await response.json()) as RpcResponse<T>;

    if (rpcResponse.error) {
      throw new Error(`RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
    }

    return rpcResponse.result as T;
  }

  /**
   * Submit a reply with PoW proof
   */
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
    return this.rpcCall('submit_reply', {
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

  /**
   * Get spam attestation status for a piece of content.
   * Returns whether content is flagged as spam.
   */
  async getSpamStatus(contentId: string): Promise<{
    content_id: string;
    is_flagged: boolean;
    is_cleared: boolean;
    unique_tree_count: number;
    total_attestations: number;
    spam_threshold: number;
    counter_attestations: number;
  }> {
    return this.rpcCall('get_spam_status', { content_id: contentId });
  }

  /**
   * Submit a new post with PoW proof
   */
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
    return this.rpcCall('submit_post', {
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
}

// Helper functions
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

// Singleton for shared use
let _instance: SwimchainRpc | null = null;

export function getRpcClient(): SwimchainRpc {
  if (!_instance) {
    _instance = new SwimchainRpc(LOCAL_CONFIG);
  }
  return _instance;
}

export function setRpcClient(client: SwimchainRpc): void {
  _instance = client;
}
