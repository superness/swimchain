/**
 * Swimchain RPC Client for Search UI
 *
 * This module provides the connection between the search UI and a Swimchain node.
 * Uses signature-based authentication with the user's identity keypair.
 */

import { wasm } from '@swimchain/frontend';
import type { SearchParams, SearchResponse } from '../types';

type WasmKeypair = ReturnType<typeof wasm.WasmKeypair.fromSeed>;

// RPC Types (inline to avoid build dependencies for now)
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

// Node types from RPC
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

/**
 * RPC client configuration
 */
export interface RpcConfig {
  endpoint: string;
  auth?: {
    username: string;
    password: string;
  };
  /** Raw Authorization header value (e.g., 'Basic base64...') - takes precedence over auth */
  authHeader?: string;
  /** Signature auth: hex-encoded 32-byte seed (private key) */
  seed?: string;
  /** Signature auth: hex-encoded 32-byte public key */
  publicKey?: string;
  timeout?: number;
}

/**
 * Helper: Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Helper: Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Helper: SHA-256 hash (using Web Crypto API)
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(hashBuffer);
}

/**
 * SwimchainRpc - Browser RPC client with signature authentication
 */
export class SwimchainRpc {
  private endpoint: string;
  private auth?: { username: string; password: string };
  private authHeader?: string;
  private keypair: WasmKeypair | null = null;
  private publicKeyHex: string | null = null;
  private timeout: number;
  private requestId = 1;
  private connected = false;
  private nodeInfo: NodeInfo | null = null;

  constructor(config: RpcConfig) {
    this.endpoint = config.endpoint;
    this.auth = config.auth;
    this.authHeader = config.authHeader;
    this.timeout = config.timeout ?? 30000;

    // Initialize keypair from seed if provided
    if (config.seed && config.publicKey) {
      try {
        const seedBytes = hexToBytes(config.seed);
        this.keypair = wasm.WasmKeypair.fromSeed(seedBytes);
        this.publicKeyHex = config.publicKey;
      } catch (error) {
        console.error('Failed to initialize keypair from seed:', error);
      }
    }
  }

  /**
   * Set identity for signature auth (can be called after construction)
   */
  setIdentity(seed: string, publicKey: string): void {
    try {
      const seedBytes = hexToBytes(seed);
      this.keypair?.free(); // Free previous keypair if any
      this.keypair = wasm.WasmKeypair.fromSeed(seedBytes);
      this.publicKeyHex = publicKey;
    } catch (error) {
      console.error('Failed to set identity:', error);
    }
  }

  /**
   * Clear identity (disconnect from auth)
   */
  clearIdentity(): void {
    this.keypair?.free();
    this.keypair = null;
    this.publicKeyHex = null;
  }

  /**
   * Make a raw RPC call with signature authentication
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

    // Use signature auth if we have a keypair
    if (this.keypair && this.publicKeyHex) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const paramsJson = JSON.stringify(params);
      const paramsHash = await sha256(new TextEncoder().encode(paramsJson));
      const paramsHashHex = bytesToHex(paramsHash);

      // Build signed message: "swimchain-rpc:" + method + ":" + sha256(params_json_hex) + ":" + timestamp
      const message = `swimchain-rpc:${method}:${paramsHashHex}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);

      // Sign with keypair
      const signature = this.keypair.sign(messageBytes);
      const signatureHex = bytesToHex(signature);

      // Add signature headers
      headers['X-CS-Identity'] = this.publicKeyHex;
      headers['X-CS-Timestamp'] = timestamp;
      headers['X-CS-Signature'] = signatureHex;
    } else if (this.authHeader) {
      // Use raw auth header (e.g., from parent frame)
      headers['Authorization'] = this.authHeader;
    } else if (this.auth) {
      // Fall back to basic auth
      const credentials = `${this.auth.username}:${this.auth.password}`;
      headers['Authorization'] = `Basic ${btoa(credentials)}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          // Ignore
        }
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

  /**
   * Connect and verify node is reachable
   */
  async connect(): Promise<boolean> {
    try {
      this.nodeInfo = await this.call<NodeInfo>('get_info');
      this.connected = true;
      return true;
    } catch (error) {
      this.connected = false;
      this.nodeInfo = null;
      console.error('Failed to connect to node:', error);
      return false;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get cached node info
   */
  getNodeInfo(): NodeInfo | null {
    return this.nodeInfo;
  }

  // =========================================================================
  // Node Status
  // =========================================================================

  async getInfo(): Promise<NodeInfo> {
    return this.call<NodeInfo>('get_info');
  }

  async getSyncStatus(): Promise<{
    state: string;
    chain_percent: number;
    peer_count: number;
    storage_mb: number;
    storage_target_mb: number;
    last_block_time: number | null;
  }> {
    return this.call('get_sync_status');
  }

  async getPeers(): Promise<Array<{ peer_id: string; address: string; direction: string }>> {
    return this.call('get_peers');
  }

  // =========================================================================
  // Search Methods
  // =========================================================================

  /**
   * Full-text search across all content types
   */
  async search(params: SearchParams): Promise<SearchResponse> {
    return this.call<SearchResponse>('search', {
      query: params.query,
      types: params.types,
      space_id: params.spaceId,
      author: params.author,
      after_timestamp: params.afterTimestamp,
      before_timestamp: params.beforeTimestamp,
      has_media: params.hasMedia,
      min_replies: params.minReplies,
      min_reactions: params.minReactions,
      sort_by: params.sortBy ?? 'relevance',
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    });
  }

  /**
   * Get autocomplete suggestions for a search prefix
   */
  async searchSuggest(prefix: string, limit = 8): Promise<string[]> {
    return this.call<string[]>('search_suggest', {
      prefix,
      limit,
    });
  }

  /**
   * Get trending searches
   */
  async trendingSearches(limit = 10): Promise<string[]> {
    return this.call<string[]>('trending_searches', {
      limit,
    });
  }

  // =========================================================================
  // Content Methods (for result details)
  // =========================================================================

  async getContent(contentId: string): Promise<{
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
  }> {
    return this.call('get_content', { content_id: contentId });
  }

  async getSpaceInfo(spaceId: string): Promise<{
    space_id: string;
    name: string;
    post_count: number;
    last_activity: number | null;
  }> {
    return this.call('get_space_info', { space_id: spaceId });
  }

  async getIdentityInfo(identityId: string): Promise<{
    identity_id: string;
    display_name?: string;
    post_count: number;
    reply_count: number;
    reactions_received: number;
    created_at: number;
  }> {
    return this.call('get_identity_info', { identity_id: identityId });
  }

  // =========================================================================
  // Spam Attestation Methods (SPEC_12 §3)
  // =========================================================================

  /**
   * Submit a spam attestation to flag content
   * Requires PoW to prevent abuse
   */
  async submitSpamAttestation(params: {
    contentId: string;
    attesterId: string;
    reason: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ success: boolean; threshold_reached: boolean }> {
    return this.call('submit_spam_attestation', {
      content_id: params.contentId,
      attester_id: params.attesterId,
      reason: params.reason,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  /**
   * Submit a counter-attestation to dispute a spam flag
   */
  async submitCounterAttestation(params: {
    contentId: string;
    attesterId: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ success: boolean }> {
    return this.call('submit_counter_attestation', {
      content_id: params.contentId,
      attester_id: params.attesterId,
      pow_nonce: params.powNonce,
      pow_difficulty: params.powDifficulty,
      pow_nonce_space: params.powNonceSpace,
      pow_hash: params.powHash,
      signature: params.signature,
      timestamp: params.timestamp,
    });
  }

  /**
   * Get spam status for content
   */
  async getSpamStatus(contentId: string): Promise<{
    content_id: string;
    is_flagged: boolean;
    attestation_count: number;
    counter_count: number;
    reasons: string[];
    spam_threshold: number;
    counter_threshold: number;
  }> {
    return this.call('get_spam_status', {
      content_id: contentId,
    });
  }
}

// =========================================================================
// Global RPC instance management
// =========================================================================

let globalRpc: SwimchainRpc | null = null;

/**
 * Get the global RPC client (for use in hooks and components)
 */
export function getRpc(): SwimchainRpc | null {
  return globalRpc;
}

/**
 * Initialize the global RPC client
 */
export function initRpc(config: RpcConfig): SwimchainRpc {
  globalRpc = new SwimchainRpc(config);
  return globalRpc;
}

/**
 * Get RPC connection status
 */
export function isRpcConnected(): boolean {
  return globalRpc?.isConnected() ?? false;
}

// =========================================================================
// Network Configurations
// =========================================================================

// Ports per network (matches the node's default ports)
const RPC_PORTS = {
  mainnet: 9736,   // RPC is P2P port + 1
  testnet: 19736,
  regtest: 29736,
};

/**
 * Get local node RPC config for the specified network
 */
export function getLocalConfig(network: 'mainnet' | 'testnet' | 'regtest' = 'testnet'): RpcConfig {
  return {
    endpoint: `http://127.0.0.1:${RPC_PORTS[network]}`,
    timeout: 30000,
  };
}

// Convenience exports for common networks
export const LOCAL_TESTNET: RpcConfig = getLocalConfig('testnet');
export const LOCAL_REGTEST: RpcConfig = getLocalConfig('regtest');
export const LOCAL_MAINNET: RpcConfig = getLocalConfig('mainnet');

// Testnet seeds with nginx proxy for browser access (CORS enabled)
// NOTE: Using HTTPS to prevent MITM attacks on remote endpoints
export const TESTNET_SEED_SF: RpcConfig = {
  endpoint: 'https://64.225.115.108:8736',
  timeout: 30000,
};
export const TESTNET_SEED_NYC: RpcConfig = {
  endpoint: 'https://104.236.106.124:8736',
  timeout: 30000,
};

// Default - use local node for testnet
export const LOCAL_CONFIG = LOCAL_TESTNET;

// =========================================================================
// Tauri Integration
// =========================================================================

/**
 * Check if running inside Tauri
 */
export function isInTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Get RPC auth from Tauri backend (reads cookie file)
 */
export async function getTauriAuth(): Promise<{ username: string; password: string } | null> {
  if (!isInTauri()) return null;

  try {
    // Dynamic import to avoid bundling issues when not in Tauri
    const { invoke } = await import('@tauri-apps/api/core');
    const authHeader = await invoke<string>('get_rpc_auth');

    // authHeader is "Basic <base64>" - decode it
    if (authHeader.startsWith('Basic ')) {
      const decoded = atob(authHeader.substring(6));
      const colonIndex = decoded.indexOf(':');
      if (colonIndex > 0) {
        return {
          username: decoded.substring(0, colonIndex),
          password: decoded.substring(colonIndex + 1),
        };
      }
    }
  } catch (error) {
    console.error('Failed to get Tauri RPC auth:', error);
  }

  return null;
}

/**
 * Get local config with Tauri auth if available
 */
export async function getLocalConfigWithAuth(network: 'mainnet' | 'testnet' | 'regtest' = 'testnet'): Promise<RpcConfig> {
  const config = getLocalConfig(network);

  // If in Tauri, get auth from backend
  const auth = await getTauriAuth();
  if (auth) {
    config.auth = auth;
  }

  return config;
}
