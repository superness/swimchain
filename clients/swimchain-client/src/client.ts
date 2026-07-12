/**
 * SwimChain Client
 *
 * High-level client that combines RPC and PoW for easy content interaction.
 */

import { SwimchainRpc, Signer, createTestnetClient, createMainnetClient, createClient } from './rpc.js';
import {
  computePow,
  createChallenge,
  solutionToRpcParams,
  getDifficulty,
  getPoWConfig,
} from './pow.js';
import {
  ActionType,
  ContentItem,
  Space,
  NodeInfo,
  SyncStatus,
  PeerInfo,
  ProgressCallback,
  CancellationCheck,
} from './types.js';
import { hexToBytes, bytesToHex, sha256 } from './utils.js';

// =============================================================================
// Client Options
// =============================================================================

export interface SwimchainClientOptions {
  /** RPC endpoint (default: testnet localhost) */
  endpoint?: string;
  /** RPC port (default: 19736 for testnet) */
  port?: number;
  /** Whether this is testnet (default: true) */
  testnet?: boolean;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

export interface IdentityOptions {
  /** Hex-encoded public key (64 chars = 32 bytes) */
  publicKey: string;
  /** Hex-encoded private key/seed (64 chars = 32 bytes) */
  seed: string;
}

// =============================================================================
// SwimChain Client
// =============================================================================

export class SwimchainClient {
  private rpc: SwimchainRpc;
  private isTestnet: boolean;
  private signer: Signer | null = null;
  private publicKey: Uint8Array | null = null;
  private publicKeyHex: string | null = null;

  constructor(options: SwimchainClientOptions = {}) {
    this.isTestnet = options.testnet ?? true;

    if (options.endpoint) {
      this.rpc = createClient(options.endpoint, { timeout: options.timeout });
    } else {
      const port = options.port ?? (this.isTestnet ? 19736 : 9736);
      this.rpc = this.isTestnet ? createTestnetClient(port) : createMainnetClient(port);
    }
  }

  /**
   * Set identity for authenticated operations
   *
   * Requires @noble/ed25519 for signing. If not available, use setCustomSigner().
   */
  async setIdentity(options: IdentityOptions): Promise<void> {
    this.publicKeyHex = options.publicKey;
    this.publicKey = hexToBytes(options.publicKey);

    // Create a signer using @noble/ed25519 if available
    try {
      // Dynamic import to support both environments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ed25519 = await (import('@noble/ed25519') as Promise<any>);
      const seed = hexToBytes(options.seed);

      // Create signer that signs with the seed
      this.signer = {
        sign: (message: Uint8Array) => {
          return ed25519.sign(message, seed);
        },
      };

      this.rpc.setSigner(this.signer, options.publicKey);
    } catch (e) {
      console.warn('Ed25519 not available, use setCustomSigner() instead');
    }
  }

  /**
   * Set a custom signer (for WASM or other implementations)
   */
  setCustomSigner(signer: Signer, publicKeyHex: string): void {
    this.signer = signer;
    this.publicKeyHex = publicKeyHex;
    this.publicKey = hexToBytes(publicKeyHex);
    this.rpc.setSigner(signer, publicKeyHex);
  }

  /**
   * Connect to the node
   */
  async connect(): Promise<boolean> {
    return this.rpc.connect();
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.rpc.isConnected();
  }

  // ===========================================================================
  // Node Status
  // ===========================================================================

  async getInfo(): Promise<NodeInfo> {
    return this.rpc.getInfo();
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return this.rpc.getSyncStatus();
  }

  async getPeers(): Promise<PeerInfo[]> {
    return this.rpc.getPeers();
  }

  // ===========================================================================
  // Spaces
  // ===========================================================================

  async listSpaces(options?: { limit?: number; offset?: number }): Promise<{ spaces: Space[]; total: number }> {
    return this.rpc.listSpaces(options);
  }

  // ===========================================================================
  // Content Retrieval
  // ===========================================================================

  async getContent(contentId: string): Promise<ContentItem> {
    return this.rpc.getContent(contentId);
  }

  async getSpaceContent(
    spaceId: string,
    options?: { limit?: number; offset?: number; sort?: 'recent' | 'hot' | 'top' },
  ): Promise<{ items: ContentItem[]; total: number }> {
    return this.rpc.listSpaceContent(spaceId, options);
  }

  async getSpacePosts(
    spaceId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ items: ContentItem[]; total: number }> {
    return this.rpc.listSpacePosts(spaceId, options);
  }

  async getReplies(contentId: string) {
    return this.rpc.getReplies(contentId);
  }

  async getReactions(contentId: string) {
    return this.rpc.getReactions(contentId);
  }

  async requestContent(contentId: string) {
    return this.rpc.requestContent(contentId);
  }

  // ===========================================================================
  // Content Creation (with PoW)
  // ===========================================================================

  /**
   * Create a new post (mines PoW automatically)
   */
  async createPost(
    spaceId: string,
    title: string,
    body: string,
    options?: {
      onProgress?: ProgressCallback;
      isCancelled?: CancellationCheck;
    },
  ): Promise<{ contentId: string; broadcast: boolean; recipients: number }> {
    if (!this.publicKey || !this.signer || !this.publicKeyHex) {
      throw new Error('Identity not set');
    }

    // Create content for hashing
    const content = new TextEncoder().encode(JSON.stringify({ spaceId, title, body }));

    // Create and solve PoW challenge
    const difficulty = getDifficulty(ActionType.Post, this.isTestnet);
    const challenge = await createChallenge(ActionType.Post, content, this.publicKey, difficulty);
    const solution = await computePow(
      challenge,
      getPoWConfig(this.isTestnet),
      options?.onProgress,
      options?.isCancelled,
    );

    // Create signature over the canonical action preimage the node verifies:
    //   content_hash(32) || timestamp_u64_LE(8) || private(1)
    // Post content_hash = sha256(`${title}\n\n${body}`)
    const sigContentHash = await sha256(new TextEncoder().encode(`${title}\n\n${body}`));
    const preimage = new Uint8Array(41);
    preimage.set(sigContentHash, 0);
    new DataView(preimage.buffer).setBigUint64(32, BigInt(challenge.timestamp), true);
    preimage[40] = 0; // public space
    const signatureBytes = await this.signer.sign(preimage);
    const signature = bytesToHex(signatureBytes);

    // Submit to node
    const powParams = solutionToRpcParams(solution);
    return this.rpc.submitPost({
      spaceId,
      title,
      body,
      authorId: this.publicKeyHex,
      signature,
      ...powParams,
    });
  }

  /**
   * Create a reply (mines PoW automatically)
   */
  async createReply(
    parentId: string,
    body: string,
    options?: {
      onProgress?: ProgressCallback;
      isCancelled?: CancellationCheck;
    },
  ): Promise<{ contentId: string; message: string }> {
    if (!this.publicKey || !this.signer || !this.publicKeyHex) {
      throw new Error('Identity not set');
    }

    // Create content for hashing
    const content = new TextEncoder().encode(JSON.stringify({ parentId, body }));

    // Create and solve PoW challenge
    const difficulty = getDifficulty(ActionType.Reply, this.isTestnet);
    const challenge = await createChallenge(ActionType.Reply, content, this.publicKey, difficulty);
    const solution = await computePow(
      challenge,
      getPoWConfig(this.isTestnet),
      options?.onProgress,
      options?.isCancelled,
    );

    // Create signature over the canonical action preimage the node verifies:
    //   content_hash(32) || timestamp_u64_LE(8) || private(1)
    // Reply content_hash = sha256(body)
    const sigContentHash = await sha256(new TextEncoder().encode(body));
    const preimage = new Uint8Array(41);
    preimage.set(sigContentHash, 0);
    new DataView(preimage.buffer).setBigUint64(32, BigInt(challenge.timestamp), true);
    preimage[40] = 0; // public space
    const signatureBytes = await this.signer.sign(preimage);
    const signature = bytesToHex(signatureBytes);

    // Submit to node
    const powParams = solutionToRpcParams(solution);
    return this.rpc.submitReply({
      parentId,
      body,
      authorId: this.publicKeyHex,
      signature,
      ...powParams,
    });
  }

  /**
   * Engage with content (mines PoW automatically)
   */
  async engage(
    contentId: string,
    emoji?: number,
    options?: {
      onProgress?: ProgressCallback;
      isCancelled?: CancellationCheck;
    },
  ): Promise<{ engaged: boolean; reactionStored: boolean; contentId: string }> {
    if (!this.publicKey || !this.signer || !this.publicKeyHex) {
      throw new Error('Identity not set');
    }

    // Create content for hashing
    const content = new TextEncoder().encode(JSON.stringify({ contentId, emoji }));

    // Create and solve PoW challenge
    const difficulty = getDifficulty(ActionType.Engage, this.isTestnet);
    const challenge = await createChallenge(ActionType.Engage, content, this.publicKey, difficulty);
    const solution = await computePow(
      challenge,
      getPoWConfig(this.isTestnet),
      options?.onProgress,
      options?.isCancelled,
    );

    // Create signature
    const signatureBytes = await this.signer.sign(content);
    const signature = bytesToHex(signatureBytes);

    // Submit to node
    const powParams = solutionToRpcParams(solution);
    return this.rpc.submitEngagement({
      contentId,
      authorId: this.publicKeyHex,
      signature,
      emoji,
      ...powParams,
    });
  }

  /**
   * Create a new space (mines PoW automatically)
   */
  async createSpace(
    name: string,
    options?: {
      onProgress?: ProgressCallback;
      isCancelled?: CancellationCheck;
    },
  ): Promise<{ spaceId: string; name: string; success: boolean }> {
    if (!this.publicKey || !this.signer || !this.publicKeyHex) {
      throw new Error('Identity not set');
    }

    // Create content for hashing
    const content = new TextEncoder().encode(JSON.stringify({ name }));

    // Create and solve PoW challenge
    const difficulty = getDifficulty(ActionType.SpaceCreation, this.isTestnet);
    const challenge = await createChallenge(ActionType.SpaceCreation, content, this.publicKey, difficulty);
    const solution = await computePow(
      challenge,
      getPoWConfig(this.isTestnet),
      options?.onProgress,
      options?.isCancelled,
    );

    // Create signature
    const signatureBytes = await this.signer.sign(content);
    const signature = bytesToHex(signatureBytes);

    // Submit to node
    const powParams = solutionToRpcParams(solution);
    return this.rpc.createSpace({
      name,
      creatorId: this.publicKeyHex,
      signature,
      ...powParams,
    });
  }

  // ===========================================================================
  // Identity
  // ===========================================================================

  async getIdentityLevel(identityId: string) {
    return this.rpc.getIdentityLevel(identityId);
  }

  // ===========================================================================
  // Pools
  // ===========================================================================

  async getPoolInfo(poolId: string) {
    return this.rpc.getPoolInfo(poolId);
  }

  async getPoolForContent(contentId: string) {
    return this.rpc.getPoolForContent(contentId);
  }

  // ===========================================================================
  // Raw RPC Access
  // ===========================================================================

  /**
   * Get underlying RPC client for advanced usage
   */
  getRpc(): SwimchainRpc {
    return this.rpc;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a testnet client
 */
export function swimchainTestnet(port = 19736): SwimchainClient {
  return new SwimchainClient({ testnet: true, port });
}

/**
 * Create a mainnet client
 */
export function swimchainMainnet(port = 9736): SwimchainClient {
  return new SwimchainClient({ testnet: false, port });
}

/**
 * Create a client with custom endpoint
 */
export function swimchain(endpoint: string, testnet = true): SwimchainClient {
  return new SwimchainClient({ endpoint, testnet });
}
