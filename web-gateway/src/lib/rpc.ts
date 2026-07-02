/**
 * Swimchain Web Gateway RPC Client
 *
 * Ported from wiki-client's src/lib/rpc.ts (SWIM-B8 R1)
 * Read-only subset: node status, content query, search methods.
 */

import { getConfig } from '@/lib/config/gateway';

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
  version: string; network: string; uptime_seconds: number; peer_count: number;
  block_height: number; node_id: string; rpc_port: number; p2p_port: number;
}

export interface SyncStatus {
  state: string; chain_percent: number; peer_count: number; chain_height: number;
  tip_hash: string | null; storage_mb: number; storage_target_mb: number;
  last_block_time: number | null; mempool_pow: number; mempool_threshold: number;
  mempool_actions: number; mempool_waiting_secs: number;
  node_identity: string | null; leader_distance: number | null;
  leader_threshold: number | null; leader_eligible: boolean | null; leader_eta_secs: number | null;
}

export interface SpaceSummary { space_id: string; post_count: number; last_activity: number | null; name: string | null; }

export interface ContentSummary {
  content_id: string; content_type: string; author_id: string; space_id: string;
  parent_id: string | null; created_at: number; last_engagement: number;
  title: string | null; body: string | null; body_preview: string | null;
  engagement_count: number; reply_count: number; decay_state: string;
  seconds_until_decay: number | null; survival_probability: number;
  is_protected: boolean; seconds_until_decay_starts: number | null;
  seconds_until_pruned: number | null; pool_progress: number; has_pool: boolean;
  pool_status: string; pending: boolean; media_refs: MediaRef[];
}

export interface MediaRef { media_hash: string; media_type: string; size_bytes: number; }

export interface GetContentResult {
  content_id: string; content_type: string; author_id: string; space_id: string;
  parent_id: string | null; created_at: number; last_engagement: number;
  body: string | null; title: string | null; engagement_count: number;
  decay_state: string; seconds_until_decay_starts: number | null;
  seconds_until_pruned: number | null; survival_probability: number;
  is_protected: boolean; time_since_engagement: number; media_refs: MediaRef[];
  reply_count: number; display_name: string | null;
}

export interface SearchResponse { results: SearchResultItem[]; total: number; took_ms: number; suggestions?: string[]; }
export interface SearchResultItem { id: string; type: string; score: number; highlights: Record<string, string>; data: Record<string, unknown>; }

export interface GetRepliesResult { parent_id: string; replies: ReplyInfo[]; total_count: number; }
export interface ReplyInfo { content_id: string; author_id: string; body: string; parent_id: string; created_at: number; last_engagement: number; depth: number; child_count: number; display_name: string | null; }

export interface RpcConfig { endpoint: string; timeout?: number; }

export class SwimchainRpc {
  private endpoint: string;
  private timeout: number;
  private requestId = 1;
  private connected = false;
  private nodeInfo: NodeInfo | null = null;

  constructor(config: RpcConfig) {
    this.endpoint = config.endpoint;
    this.timeout = config.timeout ?? 30000;
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const request: RpcRequest = { jsonrpc: '2.0' as const, method, params, id: this.requestId++ };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: controller.signal,
      });
      if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
      const rpcResponse = (await response.json()) as RpcResponse<T>;
      if (rpcResponse.error) throw new Error('RPC Error ' + rpcResponse.error.code + ': ' + rpcResponse.error.message);
      return rpcResponse.result as T;
    } finally { clearTimeout(timeoutId); }
  }

  async connect(): Promise<boolean> {
    try {
      this.nodeInfo = await this.call<NodeInfo>('get_info');
      this.connected = true;
      return true;
    } catch (error) {
      this.connected = false; this.nodeInfo = null;
      console.error('[RPC] Failed to connect:', error);
      return false;
    }
  }

  isConnected(): boolean { return this.connected; }
  getNodeInfo(): NodeInfo | null { return this.nodeInfo; }

  async getInfo(): Promise<NodeInfo> { return this.call<NodeInfo>('get_info'); }
  async getSyncStatus(): Promise<SyncStatus> { return this.call<SyncStatus>('get_sync_status'); }
  async getPeers(): Promise<{ peer_id: string; address: string; direction: string; connected_seconds: number; user_agent: string; }[]> {
    return this.call('get_peers');
  }

  async getContent(contentId: string): Promise<GetContentResult> {
    return this.call<GetContentResult>('get_content', { content_id: contentId });
  }

  async listSpaces(limit = 50, offset = 0): Promise<{ spaces: SpaceSummary[]; total: number }> {
    return this.call('list_spaces', { limit, offset });
  }

  async listSpaceContent(spaceId: string, limit = 50, offset = 0, contentType?: string): Promise<{ items: ContentSummary[]; total: number }> {
    const params: Record<string, unknown> = { space_id: spaceId, limit, offset };
    if (contentType) params.content_type = contentType;
    return this.call('list_space_content', params);
  }

  async listSpacePosts(spaceId: string, limit = 50, offset = 0): Promise<{ items: ContentSummary[]; total: number }> {
    return this.call('list_space_posts', { space_id: spaceId, limit, offset });
  }

  async getUserPosts(userId: string, limit = 50, offset = 0, includeReplies = false): Promise<{ user_id: string; items: ContentSummary[]; total_posts: number; total_content: number }> {
    return this.call('get_user_posts', { user_id: userId, limit, offset, include_replies: includeReplies });
  }

  async getReplies(contentId: string, limit = 1000, depthLimit?: number): Promise<GetRepliesResult> {
    const params: Record<string, unknown> = { content_id: contentId, limit };
    if (depthLimit !== undefined) params.depth_limit = depthLimit;
    return this.call<GetRepliesResult>('get_replies', params);
  }

  async search(params: { query: string; types?: string[]; space_id?: string; author?: string; sort_by?: string; limit?: number; offset?: number; }): Promise<SearchResponse> {
    return this.call<SearchResponse>('search', params);
  }

  async searchSuggest(prefix: string, limit = 8): Promise<string[]> {
    return this.call<string[]>('search_suggest', { prefix, limit });
  }
}

let globalRpc: SwimchainRpc | null = null;
export function getRpc(): SwimchainRpc | null { return globalRpc; }
export function initRpc(config: RpcConfig): SwimchainRpc { globalRpc = new SwimchainRpc(config); return globalRpc; }

export function getDefaultRpcEndpoint(): string {
  try {
    const config = getConfig();
    if (config.nodeWebsocketUrl) {
      const parsed = new URL(config.nodeWebsocketUrl);
      const rpcPort = parseInt(parsed.port || '9001', 10) + 1;
      return 'http://' + parsed.hostname + ':' + rpcPort;
    }
  } catch { }
  return 'http://127.0.0.1:19736';
}

export async function initDefaultRpc(): Promise<SwimchainRpc | null> {
  const endpoint = getDefaultRpcEndpoint();
  const rpc = new SwimchainRpc({ endpoint });
  try {
    if (await rpc.connect()) { initRpc({ endpoint }); console.log('[RPC] Connected at', endpoint); return rpc; }
  } catch (e) { console.warn('[RPC] No connection at', endpoint, e); }
  return null;
}
