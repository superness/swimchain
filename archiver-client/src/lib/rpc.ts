/**
 * Swimchain RPC Client - Analytics Client (Read-Only)
 * Simplified version without WASM/signing for read-only analytics
 */

// =========================================================================
// Types
// =========================================================================

export interface RpcConfig {
  host: string;
  port: number;
  protocol?: 'http' | 'https';
}

export const LOCAL_CONFIG: RpcConfig = {
  host: 'localhost',
  port: 3030,
  protocol: 'http',
};

/** Default timeout for RPC requests in milliseconds */
const RPC_TIMEOUT_MS = 10_000;

/**
 * Fetch with timeout using AbortController.
 * @param url - URL to fetch
 * @param init - Fetch init options
 * @param timeoutMs - Timeout in milliseconds (default: 10 seconds)
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = RPC_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =========================================================================
// RPC Response Types
// =========================================================================

export interface NodeInfo {
  version: string;
  network: string;
  peer_count: number;
}

export interface SyncStatus {
  chain_percent: number;
  peer_count: number;
  storage_mb: number;
  storage_target_mb: number;
  last_block_time: number | null;
  state: 'synced' | 'syncing' | 'behind' | 'offline';
}

export interface PeerInfo {
  peer_id: string;
  address: string;
  direction: 'Inbound' | 'Outbound';
  connected_at: number;
}

export interface SpaceInfo {
  space_id: string;
  name: string | null;
  post_count: number;
  last_activity: number | null;
}

export interface ContentResult {
  content_id: string;
  space_id: string;
  author_id: string;
  title: string | null;
  body: string | null;
  created_at: number;
  last_engagement: number;
  content_type?: string;
  parent_id?: string | null;
  decay_state?: string;
  seconds_until_decay_starts?: number | null;
  seconds_until_pruned?: number | null;
  survival_probability?: number;
  is_protected?: boolean;
  time_since_engagement?: number;
  reply_count?: number;
  has_pool?: boolean;
  pool_progress?: number;
  pool_status?: string;
}

export interface SpamStatus {
  content_id: string;
  is_flagged: boolean;
  is_cleared: boolean;
  unique_tree_count: number;
  total_attestations: number;
  spam_threshold: number;
  counter_attestations: number;
  counter_threshold: number;
}

export interface PoolForContentResult {
  has_pool: boolean;
  pool_id?: string;
  total_pow: number;
  required_pow: number;
  status: string;
  contributor_count: number;
  expires_at: number;
}

// =========================================================================
// RPC Client
// =========================================================================

export class SwimchainRpc {
  private baseUrl: string;
  private nodeInfo: NodeInfo | null = null;

  constructor(config: RpcConfig) {
    const protocol = config.protocol ?? 'http';
    this.baseUrl = `${protocol}://${config.host}:${config.port}`;
  }

  /**
   * Connect to the node and verify it's accessible
   */
  async connect(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/info`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.error('[RPC] Failed to connect:', response.status);
        return false;
      }

      this.nodeInfo = await response.json();
      console.log('[RPC] Connected to node:', this.nodeInfo);
      return true;
    } catch (error) {
      console.error('[RPC] Connection error:', error);
      return false;
    }
  }

  getNodeInfo(): NodeInfo | null {
    return this.nodeInfo;
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const response = await fetchWithTimeout(`${this.baseUrl}/sync/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to get sync status: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get connected peers
   */
  async getPeers(): Promise<PeerInfo[]> {
    const response = await fetchWithTimeout(`${this.baseUrl}/peers`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to get peers: ${response.status}`);
    }

    const data = await response.json();
    return data.peers ?? [];
  }

  /**
   * List all spaces
   */
  async listSpaces(): Promise<{ spaces: SpaceInfo[] }> {
    const response = await fetchWithTimeout(`${this.baseUrl}/spaces`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to list spaces: ${response.status}`);
    }

    return response.json();
  }

  /**
   * List content in a space
   */
  async listSpaceContent(spaceId: string): Promise<{ items: ContentResult[] }> {
    const response = await fetchWithTimeout(`${this.baseUrl}/spaces/${encodeURIComponent(spaceId)}/content`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to list space content: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get spam status for a content item via JSON-RPC.
   * Returns whether content is spam-flagged (accelerated decay per SPEC_12).
   */
  async getSpamStatus(contentId: string): Promise<SpamStatus | null> {
    try {
      const response = await fetchWithTimeout(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'get_spam_status',
          params: { content_id: contentId },
          id: 1,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data.error) return null;
      return data.result as SpamStatus;
    } catch {
      return null;
    }
  }

  /**
   * Batch check spam status for multiple content items.
   * Returns a Set of content IDs that are spam-flagged.
   */
  async getSpamFlaggedIds(contentIds: string[]): Promise<Set<string>> {
    const flagged = new Set<string>();
    // Check in parallel with concurrency limit of 5
    const batchSize = 5;
    for (let i = 0; i < contentIds.length; i += batchSize) {
      const batch = contentIds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((id) => this.getSpamStatus(id))
      );
      for (let j = 0; j < batch.length; j++) {
        const status = results[j];
        if (status?.is_flagged && !status.is_cleared) {
          flagged.add(batch[j]!);
        }
      }
    }
    return flagged;
  }

  /**
   * Get pool info for a content item via JSON-RPC.
   * Returns contributor count and pool progress.
   */
  async getPoolForContent(contentId: string): Promise<PoolForContentResult | null> {
    try {
      const response = await fetchWithTimeout(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'get_pool_for_content',
          params: { content_id: contentId },
          id: 1,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data.error) return null;
      return data.result as PoolForContentResult;
    } catch {
      return null;
    }
  }

  /**
   * Get specific content
   */
  async getContent(contentId: string): Promise<ContentResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/content/${encodeURIComponent(contentId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to get content: ${response.status}`);
    }

    return response.json();
  }
}

// =========================================================================
// Factory
// =========================================================================

export function initRpc(config: RpcConfig): SwimchainRpc {
  return new SwimchainRpc(config);
}
