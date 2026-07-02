/**
 * Swimchain JSON-RPC Client (Read-Only Subset)
 *
 * Pure fetch-based client with no WASM dependencies.
 * Isomorphic: works in Next.js SSR and browser.
 * Only implements read-only methods needed by the web gateway.
 */

interface RpcRequest { jsonrpc: '2.0'; method: string; params: Record<string, unknown>; id: number | string; }
interface RpcResponse<T = unknown> { jsonrpc: '2.0'; result?: T; error?: { code: number; message: string; data?: unknown }; id: number | string; }

export interface NodeInfo {
  version: string; network: string; uptime_seconds: number; peer_count: number;
  block_height: number; node_id: string; rpc_port: number; p2p_port: number;
}
export interface SyncStatus { state: string; chain_percent: number; peer_count: number; storage_mb: number; storage_target_mb: number; last_block_time: number | null; }
export interface PeerInfo { peer_id: string; address: string; direction: string; }
export interface SpaceInfo { space_id: string; name: string; description?: string; post_count: number; last_activity: number | null; }
export interface ContentItem {
  content_id: string; author_id: string; space_id: string; parent_id: string | null; content_type: string;
  title?: string; body: string | null; created_at: number; last_engagement: number; engagement_count: number;
  reply_count: number; survival_probability: number; is_decayed: boolean;
}
export interface IdentityInfo { identity_id: string; display_name?: string; bio?: string; post_count: number; reply_count: number; reactions_received: number; created_at: number; }
export interface SearchResponse {
  results: Array<{ content_id: string; title: string; body: string; author_id: string; space_id: string; space_name?: string; content_type: string; created_at: number; last_engagement: number; reply_count: number; engagement_count: number; survival_probability: number; is_decayed: boolean; score: number; }>;
  total: number; took_ms: number; suggestions?: string[];
}
export interface RpcConfig { endpoint: string; auth?: { username: string; password: string }; timeout?: number; }

export class SwimchainRpc {
  private endpoint: string; private auth?: { username: string; password: string }; private timeout: number; private requestId = 1;
  constructor(config: RpcConfig) { this.endpoint = config.endpoint; this.auth = config.auth; this.timeout = config.timeout ?? 10000; }

  private async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const request: RpcRequest = { jsonrpc: '2.0', method, params, id: this.requestId++ };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.auth) { headers['Authorization'] = 'Basic ' + btoa(this.auth.username + ':' + this.auth.password); }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.endpoint, { method: 'POST', headers, body: JSON.stringify(request), signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const rpcResponse: RpcResponse<T> = await response.json();
      if (rpcResponse.error) throw new Error('RPC Error ' + rpcResponse.error.code + ': ' + rpcResponse.error.message);
      return rpcResponse.result as T;
    } finally { clearTimeout(timeoutId); }
  }

  async getInfo(): Promise<NodeInfo> { return this.call<NodeInfo>('get_info'); }
  async getSyncStatus(): Promise<SyncStatus> { return this.call<SyncStatus>('get_sync_status'); }
  async getPeers(): Promise<PeerInfo[]> { return this.call<PeerInfo[]>('get_peers'); }
  async search(params: { query: string; space_id?: string; author?: string; limit?: number; offset?: number }): Promise<SearchResponse> {
    return this.call<SearchResponse>('search', params as unknown as Record<string, unknown>);
  }
  async searchSuggest(prefix: string, limit = 8): Promise<string[]> { return this.call<string[]>('search_suggest', { prefix, limit }); }
  async trendingSearches(limit = 10): Promise<string[]> { return this.call<string[]>('trending_searches', { limit }); }
  async getContent(contentId: string): Promise<ContentItem> { return this.call<ContentItem>('get_content', { content_id: contentId }); }
  async getSpaceContent(spaceId: string, limit = 50, offset = 0): Promise<ContentItem[]> {
    return this.call<ContentItem[]>('list_space_content', { space_id: spaceId, limit, offset });
  }
  async getAllSpaces(): Promise<SpaceInfo[]> { return this.call<SpaceInfo[]>('list_spaces'); }
  async getSpaceInfo(spaceId: string): Promise<SpaceInfo> { return this.call<SpaceInfo>('get_space_info', { space_id: spaceId }); }
  async getIdentityInfo(identityId: string): Promise<IdentityInfo> { return this.call<IdentityInfo>('get_identity_info', { identity_id: identityId }); }
  async getContentByIdentity(identityId: string, limit = 50, offset = 0): Promise<ContentItem[]> {
    return this.call<ContentItem[]>('get_identity_content', { identity_id: identityId, limit, offset });
  }
  async listAllContent(limit = 100, offset = 0): Promise<ContentItem[]> { return this.call<ContentItem[]>('list_all_content', { limit, offset }); }
}

let globalRpc: SwimchainRpc | null = null;
const DEFAULT_ENDPOINT = 'http://127.0.0.1:19736';

export function getRpc(): SwimchainRpc {
  if (!globalRpc) {
    globalRpc = new SwimchainRpc({
      endpoint: process.env.NODE_RPC_URL || DEFAULT_ENDPOINT,
      timeout: parseInt(process.env.NODE_RPC_TIMEOUT || '10000', 10),
    });
  }
  return globalRpc;
}

export function resetRpc(): void { globalRpc = null; }

export async function checkNodeHealth(): Promise<{ healthy: boolean; info: NodeInfo | null; error?: string }> {
  try {
    const info = await getRpc().getInfo();
    return { healthy: true, info };
  } catch (err) {
    return { healthy: false, info: null, error: err instanceof Error ? err.message : String(err) };
  }
}
