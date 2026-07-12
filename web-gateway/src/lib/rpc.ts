/**
 * Swimchain JSON-RPC Client (Read-Only Subset)
 *
 * Pure fetch-based client with no WASM dependencies.
 * Isomorphic: works in Next.js SSR and browser.
 * Only implements the read-only methods needed by the web gateway,
 * matching the node's actual RPC surface (src/rpc/methods.rs).
 */

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

/** Thrown when the node cannot be reached (network/timeout/HTTP failure). */
export class NodeUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeUnreachableError';
  }
}

/** Thrown when the node responded with a JSON-RPC error (node IS reachable). */
export class RpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(`RPC Error ${code}: ${message}`);
    this.name = 'RpcError';
    this.code = code;
  }
}

// ============================================================================
// Node RPC result shapes (mirroring src/rpc/types.rs)
// ============================================================================

/** get_info result */
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

/** get_sync_status result */
export interface SyncStatus {
  state: string;
  chain_percent: number;
  peer_count: number;
  chain_height: number;
  tip_hash: string | null;
  storage_mb: number;
  storage_target_mb: number;
  last_block_time: number | null;
}

/** list_spaces result entry */
export interface NodeSpaceSummary {
  space_id: string; // sp1... bech32m
  post_count: number;
  last_activity: number | null;
  name: string | null;
  /** App namespace, e.g. 'wiki'; null for ordinary public spaces. */
  app?: string | null;
  /** True when the node has a space id but no resolved human name yet. */
  name_unresolved?: boolean;
}

export interface ListSpacesResult {
  spaces: NodeSpaceSummary[];
  total: number;
}

/** list_space_content / get_user_posts result item */
export interface NodeContentSummary {
  content_id: string; // sha256:hex
  content_type: string; // "Post" | "Reply" | "Engage"
  author_id: string; // cs1... bech32m
  space_id: string; // sp1... bech32m
  parent_id: string | null;
  created_at: number; // unix ms
  last_engagement: number; // unix ms
  title: string | null;
  body: string | null;
  body_preview: string | null;
  engagement_count: number;
  reply_count: number;
  /** Attached media blobs (content-addressed). */
  media_refs?: { media_hash: string; media_type: string; size_bytes: number }[];
  decay_state: string; // "protected" | "active" | "stale" | "decayed"
  seconds_until_decay: number | null;
  survival_probability: number; // 0.0-1.0
  is_protected: boolean;
  seconds_until_decay_starts: number | null;
  seconds_until_pruned: number | null;
  pool_progress: number; // 0.0-1.0
  has_pool: boolean;
  pool_status: string;
  pending?: boolean;
}

export interface ListSpaceContentResult {
  items: NodeContentSummary[];
  total: number;
}

/** get_content result */
export interface NodeContent {
  content_id: string;
  content_type: string;
  author_id: string; // cs1... bech32m
  space_id: string; // sp1... bech32m
  parent_id: string | null;
  created_at: number; // unix ms
  last_engagement: number; // unix ms
  body: string | null;
  title: string | null;
  engagement_count: number;
  decay_state: string;
  seconds_until_decay_starts: number | null;
  seconds_until_pruned: number | null;
  survival_probability: number;
  is_protected: boolean;
  time_since_engagement: number;
  reply_count: number;
  /** Attached media blobs (content-addressed). */
  media_refs?: { media_hash: string; media_type: string; size_bytes: number }[];
  display_name?: string | null;
}

/** get_replies result entry */
export interface NodeReply {
  content_id: string; // sha256:hex
  author_id: string; // 64-char hex public key (NOT bech32)
  body: string;
  parent_id: string; // sha256:hex
  created_at: number; // unix ms
  last_engagement: number; // unix ms
  depth: number;
  child_count: number;
  display_name?: string | null;
  media_refs?: { media_hash: string; media_type: string; size_bytes: number }[];
}

export interface GetRepliesResult {
  parent_id: string;
  replies: NodeReply[];
  total_count: number;
}

/** search result hit (the node returns loosely-typed JSON here) */
export interface NodeSearchHit {
  id: string;
  type: 'space' | 'thread';
  score: number;
  highlights: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface NodeSearchResult {
  results: NodeSearchHit[];
  total: number;
  took_ms: number;
}

/** get_user_profile result (null if no profile published) */
export interface NodeUserProfile {
  display_name: string | null;
  bio: string | null;
  website: string | null;
  avatar_url: string | null;
  updated_at: number | null;
}

/** get_user_posts result */
export interface GetUserPostsResult {
  user_id: string;
  items: NodeContentSummary[];
  total_posts: number;
  total_content: number;
}

export interface RpcConfig {
  endpoint: string;
  auth?: { username: string; password: string };
  timeout?: number;
  /**
   * Path to the node's cookie file. When set, auth is read from this file
   * fresh and re-read on an auth failure — so a node restart that rotates the
   * cookie self-heals instead of spamming stale credentials (which trips the
   * node's per-IP auth-failure lockout).
   */
  cookieFile?: string;
}

// ============================================================================
// Client
// ============================================================================

export class SwimchainRpc {
  private endpoint: string;
  private auth?: { username: string; password: string };
  private timeout: number;
  private requestId = 1;
  private cookieFile?: string;

  constructor(config: RpcConfig) {
    this.endpoint = config.endpoint;
    this.auth = config.auth;
    this.timeout = config.timeout ?? 10000;
    this.cookieFile = config.cookieFile;
    if (this.cookieFile) this.reloadCookie();
  }

  /** Re-read the cookie file into current auth. Silent on failure (keeps prior). */
  private reloadCookie(): void {
    if (!this.cookieFile) return;
    try {
      // Lazy require: this module is also bundled for client-side type imports.
      const fs = require('fs') as typeof import('fs');
      const raw = fs.readFileSync(this.cookieFile, 'utf8').trim();
      if (!raw) return;
      const idx = raw.indexOf(':');
      this.auth =
        idx > 0
          ? { username: raw.slice(0, idx), password: raw.slice(idx + 1) }
          : { username: '__cookie__', password: raw };
    } catch {
      // Cookie file unreadable — keep whatever auth we had.
    }
  }

  private async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    authRetry = false
  ): Promise<T> {
    const request: RpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.auth) {
      const credentials = `${this.auth.username}:${this.auth.password}`;
      headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
        // Live chain data: never serve from Next.js fetch cache
        cache: 'no-store',
      });
    } catch (err) {
      throw new NodeUnreachableError(
        err instanceof Error ? err.message : 'Failed to reach node'
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // Auth failure after a node cookie rotation: re-read the cookie file and
      // retry ONCE. Never loop — repeated stale-cookie hits trip the node's
      // per-IP auth-failure lockout (429 for everyone). 429 itself we surface;
      // if we're already locked out, retrying only deepens it.
      if (
        (response.status === 401 || response.status === 403) &&
        this.cookieFile &&
        !authRetry
      ) {
        this.reloadCookie();
        return this.call<T>(method, params, true);
      }
      throw new NodeUnreachableError(`HTTP ${response.status}`);
    }

    const rpcResponse = (await response.json()) as RpcResponse<T>;
    if (rpcResponse.error) {
      throw new RpcError(rpcResponse.error.code, rpcResponse.error.message);
    }
    return rpcResponse.result as T;
  }

  // === Node status ===

  async getInfo(): Promise<NodeInfo> {
    return this.call<NodeInfo>('get_info');
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return this.call<SyncStatus>('get_sync_status');
  }

  // === Spaces ===

  async listSpaces(limit = 100, offset = 0): Promise<ListSpacesResult> {
    return this.call<ListSpacesResult>('list_spaces', { limit, offset });
  }

  async listSpaceContent(
    spaceId: string,
    limit = 50,
    offset = 0
  ): Promise<ListSpaceContentResult> {
    return this.call<ListSpaceContentResult>('list_space_content', {
      space_id: spaceId,
      limit,
      offset,
    });
  }

  // === Content ===

  async getContent(contentId: string): Promise<NodeContent> {
    return this.call<NodeContent>('get_content', { content_id: contentId });
  }

  /** Fetch a content-addressed media blob by 32-byte hex hash (base64 payload). */
  async getMedia(
    mediaHash: string
  ): Promise<{ media_hash: string; media_type: string; data: string; size_bytes: number }> {
    return this.call('get_media', { media_hash: mediaHash });
  }

  /**
   * Ask the node to retrieve a content body from the network (view-to-host:
   * a headless gateway node holds chain metadata but not bodies until it
   * requests them). Async on the node side — returns immediately with
   * status 'found_locally' | 'requested'; poll get_content afterwards.
   */
  async requestContent(
    contentId: string
  ): Promise<{ status: string; message?: string }> {
    return this.call<{ status: string; message?: string }>('request_content', {
      content_id: contentId,
    });
  }

  async getReplies(
    contentId: string,
    limit = 200,
    depthLimit = 8
  ): Promise<GetRepliesResult> {
    return this.call<GetRepliesResult>('get_replies', {
      content_id: contentId,
      limit,
      depth_limit: depthLimit,
    });
  }

  // === Search ===

  async search(params: {
    query: string;
    space_id?: string;
    limit?: number;
    offset?: number;
    types?: string[];
  }): Promise<NodeSearchResult> {
    return this.call<NodeSearchResult>('search', {
      query: params.query,
      space_id: params.space_id,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      types: params.types,
    });
  }

  // === Identity ===

  /** userIdHex: 64-char hex public key (decode cs1 address first) */
  async getUserProfile(userIdHex: string): Promise<NodeUserProfile | null> {
    return this.call<NodeUserProfile | null>('get_user_profile', {
      user_id: userIdHex,
    });
  }

  /** userIdHex: 64-char hex public key (decode cs1 address first) */
  async getUserPosts(
    userIdHex: string,
    limit = 50,
    offset = 0,
    includeReplies = false
  ): Promise<GetUserPostsResult> {
    return this.call<GetUserPostsResult>('get_user_posts', {
      user_id: userIdHex,
      limit,
      offset,
      include_replies: includeReplies,
    });
  }
}

// ============================================================================
// Global RPC instance management
// ============================================================================

let globalRpc: SwimchainRpc | null = null;

const DEFAULT_ENDPOINT = 'http://127.0.0.1:19736';

/**
 * Resolve optional RPC credentials from the environment.
 * - NODE_RPC_COOKIE: either "username:password" or a bare cookie token
 *   (the contents of the node's .cookie file; username defaults to
 *   "__cookie__" per the node's cookie-auth convention)
 * - NODE_RPC_USER / NODE_RPC_PASSWORD: explicit basic-auth credentials
 */
function getRpcAuth(): { username: string; password: string } | undefined {
  const cookie = process.env.NODE_RPC_COOKIE?.trim();
  if (cookie) {
    const idx = cookie.indexOf(':');
    if (idx > 0) {
      return {
        username: cookie.slice(0, idx),
        password: cookie.slice(idx + 1),
      };
    }
    // Bare cookie token (node's .cookie file content)
    return { username: '__cookie__', password: cookie };
  }
  if (process.env.NODE_RPC_USER && process.env.NODE_RPC_PASSWORD) {
    return {
      username: process.env.NODE_RPC_USER,
      password: process.env.NODE_RPC_PASSWORD,
    };
  }
  return undefined;
}

/** Get the shared read-only RPC client (server-side singleton). */
export function getRpc(): SwimchainRpc {
  if (!globalRpc) {
    globalRpc = new SwimchainRpc({
      endpoint: process.env.NODE_RPC_URL || DEFAULT_ENDPOINT,
      auth: getRpcAuth(),
      timeout: parseInt(process.env.NODE_RPC_TIMEOUT || '10000', 10),
      // When set, the client reads auth from this file fresh and re-reads it on
      // an auth failure, so node cookie rotation self-heals.
      cookieFile: process.env.NODE_RPC_COOKIE_FILE || undefined,
    });
  }
  return globalRpc;
}

/** Reset the shared client (for testing / config changes). */
export function resetRpc(): void {
  globalRpc = null;
}

/** Ping the node with get_info. Never throws. */
export async function checkNodeHealth(): Promise<{
  healthy: boolean;
  info: NodeInfo | null;
  latencyMs: number | null;
  error?: string;
}> {
  const start = Date.now();
  try {
    const info = await getRpc().getInfo();
    return { healthy: true, info, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      healthy: false,
      info: null,
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
