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
  host: import.meta.env.VITE_RPC_HOST || 'localhost',
  port: parseInt(import.meta.env.VITE_RPC_PORT || '3030', 10),
  protocol: (import.meta.env.VITE_RPC_PROTOCOL as 'http' | 'https') || 'http',
};

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

// =========================================================================
// Constants
// =========================================================================

const RPC_TIMEOUT_MS = 10_000; // 10 second timeout for all RPC calls

// =========================================================================
// RPC Client
// =========================================================================

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = RPC_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
        return false;
      }

      this.nodeInfo = await response.json();
      return true;
    } catch {
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
   * List public sponsorship offers
   */
  async listSponsorshipOffers(limit = 100, offset = 0): Promise<SponsorshipOffersResponse> {
    const response = await fetchWithTimeout(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'list_sponsorship_offers',
        params: { limit, offset },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to list sponsorship offers: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error.message ?? 'RPC error');
    return data.result;
  }

  /**
   * Submit a spam attestation report for content
   *
   * Flags content as spam with a reason and signature.
   * Requires Argon2id PoW to prevent abuse.
   */
  async submitSpamAttestation(params: SpamAttestationParams): Promise<SpamAttestationResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'submit_spam_attestation',
        params: {
          content_id: params.content_id,
          attester_id: params.attester_id,
          reason: params.reason,
          signature: params.signature,
          pow_nonce: params.pow_nonce,
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit spam attestation: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error.message ?? 'RPC error');
    return data.result;
  }

  /**
   * Submit a counter-attestation (vouch that content is NOT spam)
   */
  async submitCounterAttestation(params: SpamAttestationParams): Promise<SpamAttestationResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'submit_counter_attestation',
        params: {
          content_id: params.content_id,
          attester_id: params.attester_id,
          reason: params.reason,
          signature: params.signature,
          pow_nonce: params.pow_nonce,
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit counter-attestation: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error.message ?? 'RPC error');
    return data.result;
  }

  /**
   * Check spam status of content
   */
  async getSpamStatus(contentId: string): Promise<SpamStatusResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'get_spam_status',
        params: { content_id: contentId },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get spam status: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error.message ?? 'RPC error');
    return data.result;
  }

  /**
   * Get chain-wide engagement stats
   *
   * Returns aggregated engagement data from the chain, with per-content breakdowns.
   * When verbose=true, individual actions with timestamps are included for time-based filtering.
   */
  async getChainEngagements(contentId?: string, verbose = false): Promise<ChainEngagementsResponse> {
    const response = await fetchWithTimeout(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'get_chain_engagements',
        params: {
          content_id: contentId,
          verbose,
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get chain engagements: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error.message ?? 'RPC error');
    return data.result;
  }
}

// =========================================================================
// Sponsorship Types
// =========================================================================

export interface SponsorshipOfferSummary {
  offer_id: string;
  sponsor_pubkey: string;
  offer_type: string;
  slots_total: number;
  slots_remaining: number;
  expires_at: number;
  created_at: number;
  requirements: {
    min_pow_difficulty: number;
    application_required: boolean;
  };
}

export interface SponsorshipOffersResponse {
  offers: SponsorshipOfferSummary[];
  total: number;
}

// =========================================================================
// Chain Engagement Types
// =========================================================================

export interface EngageActionInfo {
  content_hash: string;
  actor: string;
  timestamp: number;
  pow_work: number;
  emoji: string | null;
  block_hash: string;
}

export interface ContentEngagementStats {
  content_hash: string;
  total_engagements: number;
  total_pow_work: number;
  unique_actors: number;
  emoji_counts: Record<string, number>;
}

export interface ChainEngagementsResponse {
  total_engage_actions: number;
  content_stats: ContentEngagementStats[];
  actions?: EngageActionInfo[];
}

// =========================================================================
// Spam Attestation Types
// =========================================================================

export interface SpamAttestationParams {
  content_id: string;
  attester_id: string;
  reason: string;
  signature: string;
  pow_nonce: number;
}

export interface SpamAttestationResult {
  success: boolean;
  message: string;
}

export interface SpamStatusResult {
  content_id: string;
  is_flagged: boolean;
  attestation_count: number;
  threshold: number;
  is_spam: boolean;
}

// =========================================================================
// Factory
// =========================================================================

export function initRpc(config: RpcConfig): SwimchainRpc {
  return new SwimchainRpc(config);
}
