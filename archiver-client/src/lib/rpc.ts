/**
 * Swimchain RPC Client - Archiver Client
 * Reads via HTTP/JSON-RPC; signing is delegated to the node's identity
 * via the localhost-exempt sign_message method (no client-side keys).
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

/**
 * Parameters for submit_engagement JSON-RPC call.
 * Matches the node's SubmitEngagementParams struct.
 */
export interface SubmitEngagementParams {
  /** Content ID to engage with (sha256:... format) */
  content_id: string;
  /** Author public key (32-byte hex, 64 hex chars) */
  author_id: string;
  /** Engagement PoW nonce */
  pow_nonce: number;
  /** PoW difficulty */
  pow_difficulty: number;
  /** PoW nonce space (8-byte hex, 16 hex chars) */
  pow_nonce_space: string;
  /** PoW hash (32-byte hex, 64 hex chars) */
  pow_hash: string;
  /** Ed25519 signature (64-byte hex, 128 hex chars) */
  signature: string;
  /** Timestamp (unix seconds) */
  timestamp: number;
  /** Optional emoji type (1-8) */
  emoji?: number;
}

/**
 * Response from sign_message JSON-RPC call.
 * The node signs with its own identity keypair (localhost only).
 */
export interface SignMessageResult {
  /** Ed25519 signature (64-byte hex, 128 hex chars) */
  signature: string;
  /** Public key the node signed with (32-byte hex, 64 hex chars) */
  public_key: string;
}

/**
 * Response from submit_engagement JSON-RPC call.
 */
export interface SubmitEngagementResponse {
  /** Whether the engagement was recorded (decay timer reset) */
  engaged: boolean;
  /** Whether a reaction was stored (always false, goes to mempool) */
  reaction_stored: boolean;
  /** The content ID that was engaged */
  content_id: string;
  /** The emoji that was sent (null if none) */
  emoji: number | null;
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

  /**
   * Sign a message with the node's identity keypair via JSON-RPC.
   *
   * The node's sign_message method is localhost-exempt from auth so browser
   * clients can use the node identity. The message is hex-encoded before
   * sending, as required by the node.
   *
   * @param message - UTF-8 message to sign
   * @returns Signature and the public key that signed it
   * @throws Error if the RPC call fails or the node returns an error
   */
  async signMessage(message: string): Promise<SignMessageResult> {
    const messageHex = Array.from(new TextEncoder().encode(message))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const response = await fetchWithTimeout(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'sign_message',
        params: { message: messageHex },
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`sign_message failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`sign_message failed: ${data.error.message ?? JSON.stringify(data.error)}`);
    }
    return data.result as SignMessageResult;
  }

  /**
   * Submit engagement PoW for content via JSON-RPC.
   *
   * Sends the solved Argon2id PoW proof to the node, which records
   * the engagement (resets decay timer) and adds an ENGAGE action
   * to the block builder for network propagation.
   *
   * @param params - Engagement parameters including solved PoW and signature
   * @returns Response indicating whether engagement was recorded
   * @throws Error if the RPC call fails or the node rejects the submission
   */
  async submitEngagement(params: SubmitEngagementParams): Promise<SubmitEngagementResponse> {
    const rpcParams = {
      content_id: params.content_id,
      author_id: params.author_id,
      pow_nonce: params.pow_nonce,
      pow_difficulty: params.pow_difficulty,
      pow_nonce_space: params.pow_nonce_space,
      pow_hash: params.pow_hash,
      signature: params.signature,
      timestamp: params.timestamp,
      emoji: params.emoji,
    };

    // submit_engagement is NOT auth-exempt on the node (rpc/server.rs), so
    // an unauthenticated request gets HTTP 401 before the PoW is even
    // checked. The archiver has no client-side keys; authenticate with the
    // node identity via remote signing (sign_message), mirroring the forum
    // client's remote-signer pattern:
    //   sig over "swimchain-rpc:<method>:<sha256(params_json)>:<timestamp>"
    const paramsJson = JSON.stringify(rpcParams);
    const paramsHashBuf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(paramsJson),
    );
    const paramsHashHex = Array.from(new Uint8Array(paramsHashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const authTimestamp = Math.floor(Date.now() / 1000).toString();
    const authMessage = `swimchain-rpc:submit_engagement:${paramsHashHex}:${authTimestamp}`;
    const signResult = await this.signMessage(authMessage);

    const response = await fetchWithTimeout(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CS-Identity': signResult.public_key,
        'X-CS-Timestamp': authTimestamp,
        'X-CS-Signature': signResult.signature,
      },
      // IMPORTANT: the node hashes the raw params bytes from the body; the
      // nested `params` here serializes identically to `paramsJson` above.
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'submit_engagement',
        params: rpcParams,
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`submit_engagement failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      console.error('[RPC] submit_engagement error:', data.error);
      throw new Error(
        `submit_engagement rejected: ${data.error.message ?? JSON.stringify(data.error)}`
      );
    }
    return data.result as SubmitEngagementResponse;
  }
}

// =========================================================================
// Factory
// =========================================================================

export function initRpc(config: RpcConfig): SwimchainRpc {
  return new SwimchainRpc(config);
}
