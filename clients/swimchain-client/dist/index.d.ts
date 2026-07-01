/**
 * SwimChain Client Types
 *
 * Core type definitions for the SwimChain protocol
 */
/**
 * Stored identity data - all fields are hex strings
 */
interface StoredIdentity {
    address: string;
    publicKey: string;
    seed: string;
    createdAt: number;
}
/**
 * Identity level info from the network
 */
interface IdentityLevel {
    identityId: string;
    level: number;
    levelName: string;
    isGenesis: boolean;
    streakDays: number;
    bandwidthServed: number;
    contributionScore: number;
}
/**
 * Space represents a discussion category/forum
 */
interface Space {
    id: string;
    name: string;
    description?: string;
    creator?: string;
    postCount: number;
    activePostCount?: number;
    lastActivity?: number;
    createdAt?: number;
}
/**
 * Content type enum matching backend
 */
declare enum ContentType {
    Post = "Post",
    Reply = "Reply",
    Quote = "Quote"
}
/**
 * Decay state for content
 */
type DecayState = 'protected' | 'active' | 'stale' | 'decayed';
/**
 * Decay information
 */
interface DecayInfo {
    state: DecayState;
    survivalProbability: number;
    isProtected: boolean;
    secondsUntilDecayStarts: number | null;
    secondsUntilPruned: number | null;
    timeSinceEngagement: number;
}
/**
 * Content item from RPC
 */
interface ContentItem {
    contentId: string;
    contentType: ContentType;
    authorId: string;
    spaceId: string;
    parentId: string | null;
    createdAt: number;
    lastEngagement: number;
    title: string | null;
    body: string | null;
    engagementCount: number;
    decayState: DecayState;
    secondsUntilDecay: number | null;
    decay?: DecayInfo;
}
/**
 * Thread (post with replies)
 */
interface Thread extends ContentItem {
    replyCount: number;
    reactions?: ReactionCounts;
    pool?: PoolState;
}
/**
 * Reply to a thread or another reply
 */
interface Reply {
    id: string;
    threadId: string;
    parentId: string | null;
    author: string;
    content: string;
    createdAt: number;
    lastEngagement: number;
    depth: number;
    childCount?: number;
    children: Reply[];
    decay?: DecayInfo;
    reactions?: ReactionCounts;
    bodyLoading?: boolean;
}
/**
 * Reaction types matching backend enum
 */
type ReactionType = 'heart' | 'thumbs_up' | 'thumbs_down' | 'laugh' | 'thinking' | 'mind_blown' | 'fire' | 'swimming';
/**
 * Reaction type to numeric code mapping
 */
declare const REACTION_CODES: Record<ReactionType, number>;
/**
 * Reaction type to emoji mapping
 */
declare const REACTION_EMOJIS: Record<ReactionType, string>;
/**
 * Single emoji reaction count
 */
interface EmojiCount {
    emoji: string;
    reactionType: number;
    count: number;
}
/**
 * Aggregated reaction counts
 */
interface ReactionCounts {
    reactions: EmojiCount[];
    total: number;
    userReactions?: number[];
}
/**
 * Engagement pool state
 */
interface PoolState {
    contributedSeconds: number;
    requiredSeconds: number;
    contributorCount: number;
    status: 'empty' | 'partial' | 'complete' | 'locked';
}
/**
 * Pool info from RPC
 */
interface PoolInfo {
    poolId: string;
    contentId: string;
    totalPow: number;
    requiredPow: number;
    status: string;
    contributorCount: number;
    expiresAt: number;
}
/**
 * Node info from RPC
 */
interface NodeInfo {
    version: string;
    network: string;
    uptimeSeconds: number;
    peerCount: number;
    blockHeight: number;
    nodeId: string;
    rpcPort: number;
    p2pPort: number;
}
/**
 * Peer info
 */
interface PeerInfo {
    peerId: string;
    address: string;
    direction: 'inbound' | 'outbound';
}
/**
 * Sync status from RPC
 */
interface SyncStatus {
    state: 'synced' | 'syncing' | 'behind' | 'offline';
    chainPercent: number;
    peerCount: number;
    peersReceiving?: number;
    peersSending?: number;
    storageMB: number;
    storageTargetMB: number;
    lastBlockTime: number | null;
}
/**
 * RPC request format
 */
interface RpcRequest {
    jsonrpc: '2.0';
    method: string;
    params: Record<string, unknown>;
    id: number | string;
}
/**
 * RPC response format
 */
interface RpcResponse<T = unknown> {
    jsonrpc: '2.0';
    result?: T;
    error?: RpcError;
    id: number | string;
}
/**
 * RPC error
 */
interface RpcError {
    code: number;
    message: string;
    data?: unknown;
}
/**
 * RPC client configuration
 */
interface RpcConfig {
    endpoint: string;
    auth?: {
        username: string;
        password: string;
    };
    /** Signature auth: hex-encoded 32-byte seed */
    seed?: string;
    /** Signature auth: hex-encoded 32-byte public key */
    publicKey?: string;
    timeout?: number;
}
/**
 * Action types for PoW
 */
declare enum ActionType {
    SpaceCreation = 1,
    Post = 2,
    Reply = 3,
    Engage = 4,
    IdentityUpdate = 5
}
/**
 * PoW configuration
 */
interface PoWConfig {
    memoryKib: number;
    iterations: number;
    parallelism: number;
}
/**
 * PoW challenge
 */
interface PoWChallenge {
    actionType: ActionType;
    contentHash: Uint8Array;
    authorId: Uint8Array;
    timestamp: number;
    difficulty: number;
    nonceSpace: Uint8Array;
}
/**
 * PoW solution
 */
interface PoWSolution {
    challenge: PoWChallenge;
    nonce: bigint;
    hash: Uint8Array;
}
/**
 * Progress callback for mining
 */
type ProgressCallback = (attempts: number, elapsedMs: number, hashRate: number) => void;
/**
 * Cancellation check for mining
 */
type CancellationCheck = () => boolean;

/**
 * SwimChain Client Utilities
 *
 * Helper functions for hex/bytes conversion, hashing, etc.
 */
/**
 * Convert hex string to Uint8Array
 */
declare function hexToBytes(hex: string): Uint8Array;
/**
 * Convert Uint8Array to hex string
 */
declare function bytesToHex(bytes: Uint8Array): string;
/**
 * Compute SHA-256 hash
 */
declare function sha256(data: Uint8Array): Promise<Uint8Array>;
/**
 * Compute SHA-256 hash of a string
 */
declare function sha256String(str: string): Promise<Uint8Array>;
/**
 * Compute SHA-256 hash and return as hex
 */
declare function sha256Hex(data: Uint8Array): Promise<string>;
/**
 * Sleep for a given number of milliseconds
 */
declare function sleep(ms: number): Promise<void>;
/**
 * Current timestamp in Unix seconds
 */
declare function nowSeconds(): number;
/**
 * Format a Unix timestamp for display
 */
declare function formatTimestamp(ts: number): string;
/**
 * Calculate time ago in human-readable form
 */
declare function timeAgo(ts: number): string;
/**
 * Truncate a string with ellipsis
 */
declare function truncate(str: string, maxLen: number): string;
/**
 * Truncate an address for display (cs1abc...xyz)
 */
declare function truncateAddress(address: string, startLen?: number, endLen?: number): string;
/**
 * Generate random bytes
 */
declare function randomBytes(length: number): Uint8Array;

/**
 * SwimChain Action Proof-of-Work
 *
 * Implements SPEC_03 action PoW using Argon2id.
 * This is used for creating posts, replies, and engagements.
 */

/** Default difficulty per action type (mainnet) */
declare const DIFFICULTY: Record<ActionType, number>;
/** Testnet difficulty (reduced ~10 bits) */
declare const TESTNET_DIFFICULTY: Record<ActionType, number>;
/** Production config (64 MiB) */
declare const PRODUCTION_CONFIG: PoWConfig;
/** Testnet config (8 MiB) */
declare const TESTNET_CONFIG: PoWConfig;
/** Fast test config (1 MiB) */
declare const TEST_CONFIG: PoWConfig;
/**
 * Create a challenge for content
 */
declare function createChallenge(actionType: ActionType, content: Uint8Array, authorPubkey: Uint8Array, difficulty: number): Promise<PoWChallenge>;
/**
 * Serialize a challenge to 82-byte canonical format per SPEC_03
 */
declare function serializeChallenge(challenge: PoWChallenge): Uint8Array;
/**
 * Count leading zero bits in a hash
 */
declare function leadingZeros(hash: Uint8Array): number;
/**
 * Compute PoW solution for a challenge
 *
 * @param challenge The challenge to solve
 * @param config PoW configuration
 * @param onProgress Optional progress callback
 * @param isCancelled Optional cancellation check
 * @returns The solution with nonce and hash
 */
declare function computePow(challenge: PoWChallenge, config: PoWConfig, onProgress?: ProgressCallback, isCancelled?: CancellationCheck): Promise<PoWSolution>;
/**
 * Convert solution to RPC-compatible format (camelCase)
 */
declare function solutionToRpcParams(solution: PoWSolution): {
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    timestamp: number;
};
/**
 * Get difficulty for action type
 */
declare function getDifficulty(actionType: ActionType, isTestnet?: boolean): number;
/**
 * Get PoW config for network
 */
declare function getPoWConfig(isTestnet?: boolean): PoWConfig;
/**
 * Estimate mining time in seconds
 */
declare function estimateMiningTime(difficulty: number, hashRate?: number): number;

/**
 * SwimChain RPC Client
 *
 * HTTP/JSON-RPC client for communicating with SwimChain nodes.
 * Supports both basic auth and signature-based authentication.
 */

/**
 * Interface for signing messages (Ed25519)
 */
interface Signer {
    sign(message: Uint8Array): Uint8Array | Promise<Uint8Array>;
}
/**
 * SwimchainRpc - HTTP RPC client with optional signature authentication
 */
declare class SwimchainRpc {
    private endpoint;
    private auth?;
    private signer;
    private publicKeyHex;
    private timeout;
    private requestId;
    private connected;
    private nodeInfo;
    constructor(config: RpcConfig);
    /**
     * Set signer for signature authentication
     */
    setSigner(signer: Signer, publicKeyHex: string): void;
    /**
     * Clear signer
     */
    clearSigner(): void;
    /**
     * Get current public key (hex)
     */
    getPublicKey(): string | null;
    /**
     * Make a raw RPC call
     */
    call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    /**
     * Connect and verify node is reachable
     */
    connect(): Promise<boolean>;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Get cached node info
     */
    getNodeInfo(): NodeInfo | null;
    getInfo(): Promise<NodeInfo>;
    getSyncStatus(): Promise<SyncStatus>;
    getPeers(): Promise<PeerInfo[]>;
    listSpaces(options?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        spaces: Space[];
        total: number;
    }>;
    getContent(contentId: string): Promise<ContentItem>;
    listSpaceContent(spaceId: string, options?: {
        limit?: number;
        offset?: number;
        sort?: 'recent' | 'hot' | 'top';
    }): Promise<{
        items: ContentItem[];
        total: number;
    }>;
    listSpacePosts(spaceId: string, options?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        items: ContentItem[];
        total: number;
    }>;
    requestContent(contentId: string): Promise<{
        status: string;
        message: string;
    }>;
    getReplies(contentId: string): Promise<{
        parentId: string;
        replies: Array<{
            contentId: string;
            authorId: string;
            body: string;
            parentId: string;
            createdAt: number;
            lastEngagement: number;
        }>;
        totalCount: number;
    }>;
    getReactions(contentId: string): Promise<{
        contentId: string;
        reactions: Array<{
            emoji: string;
            reactionType: number;
            count: number;
        }>;
        total: number;
    }>;
    getIdentityLevel(identityId: string): Promise<IdentityLevel>;
    getPoolInfo(poolId: string): Promise<PoolInfo>;
    getPoolForContent(contentId: string): Promise<{
        hasPool: boolean;
        poolId?: string;
        totalPow: number;
        requiredPow: number;
        status: string;
        contributorCount: number;
        expiresAt: number;
    }>;
    submitPost(params: {
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
    }): Promise<{
        contentId: string;
        broadcast: boolean;
        recipients: number;
    }>;
    submitReply(params: {
        parentId: string;
        body: string;
        authorId: string;
        powNonce: number;
        powDifficulty: number;
        powNonceSpace: string;
        powHash: string;
        signature: string;
        timestamp: number;
    }): Promise<{
        contentId: string;
        message: string;
    }>;
    submitEngagement(params: {
        contentId: string;
        authorId: string;
        powNonce: number;
        powDifficulty: number;
        powNonceSpace: string;
        powHash: string;
        signature: string;
        timestamp: number;
        emoji?: number;
    }): Promise<{
        engaged: boolean;
        reactionStored: boolean;
        contentId: string;
        emoji?: number;
    }>;
    createSpace(params: {
        name: string;
        creatorId: string;
        powNonce: number;
        powDifficulty: number;
        powNonceSpace: string;
        powHash: string;
        signature: string;
        timestamp: number;
    }): Promise<{
        spaceId: string;
        name: string;
        success: boolean;
    }>;
}
/**
 * Create RPC client for local testnet node
 */
declare function createTestnetClient(port?: number): SwimchainRpc;
/**
 * Create RPC client for local mainnet node
 */
declare function createMainnetClient(port?: number): SwimchainRpc;
/**
 * Create RPC client for a custom endpoint
 */
declare function createClient(endpoint: string, config?: Partial<RpcConfig>): SwimchainRpc;

interface SwimchainClientOptions {
    /** RPC endpoint (default: testnet localhost) */
    endpoint?: string;
    /** RPC port (default: 19736 for testnet) */
    port?: number;
    /** Whether this is testnet (default: true) */
    testnet?: boolean;
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
}
interface IdentityOptions {
    /** Hex-encoded public key (64 chars = 32 bytes) */
    publicKey: string;
    /** Hex-encoded private key/seed (64 chars = 32 bytes) */
    seed: string;
}
declare class SwimchainClient {
    private rpc;
    private isTestnet;
    private signer;
    private publicKey;
    private publicKeyHex;
    constructor(options?: SwimchainClientOptions);
    /**
     * Set identity for authenticated operations
     *
     * Requires @noble/ed25519 for signing. If not available, use setCustomSigner().
     */
    setIdentity(options: IdentityOptions): Promise<void>;
    /**
     * Set a custom signer (for WASM or other implementations)
     */
    setCustomSigner(signer: Signer, publicKeyHex: string): void;
    /**
     * Connect to the node
     */
    connect(): Promise<boolean>;
    /**
     * Check connection status
     */
    isConnected(): boolean;
    getInfo(): Promise<NodeInfo>;
    getSyncStatus(): Promise<SyncStatus>;
    getPeers(): Promise<PeerInfo[]>;
    listSpaces(options?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        spaces: Space[];
        total: number;
    }>;
    getContent(contentId: string): Promise<ContentItem>;
    getSpaceContent(spaceId: string, options?: {
        limit?: number;
        offset?: number;
        sort?: 'recent' | 'hot' | 'top';
    }): Promise<{
        items: ContentItem[];
        total: number;
    }>;
    getSpacePosts(spaceId: string, options?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        items: ContentItem[];
        total: number;
    }>;
    getReplies(contentId: string): Promise<{
        parentId: string;
        replies: Array<{
            contentId: string;
            authorId: string;
            body: string;
            parentId: string;
            createdAt: number;
            lastEngagement: number;
        }>;
        totalCount: number;
    }>;
    getReactions(contentId: string): Promise<{
        contentId: string;
        reactions: Array<{
            emoji: string;
            reactionType: number;
            count: number;
        }>;
        total: number;
    }>;
    requestContent(contentId: string): Promise<{
        status: string;
        message: string;
    }>;
    /**
     * Create a new post (mines PoW automatically)
     */
    createPost(spaceId: string, title: string, body: string, options?: {
        onProgress?: ProgressCallback;
        isCancelled?: CancellationCheck;
    }): Promise<{
        contentId: string;
        broadcast: boolean;
        recipients: number;
    }>;
    /**
     * Create a reply (mines PoW automatically)
     */
    createReply(parentId: string, body: string, options?: {
        onProgress?: ProgressCallback;
        isCancelled?: CancellationCheck;
    }): Promise<{
        contentId: string;
        message: string;
    }>;
    /**
     * Engage with content (mines PoW automatically)
     */
    engage(contentId: string, emoji?: number, options?: {
        onProgress?: ProgressCallback;
        isCancelled?: CancellationCheck;
    }): Promise<{
        engaged: boolean;
        reactionStored: boolean;
        contentId: string;
    }>;
    /**
     * Create a new space (mines PoW automatically)
     */
    createSpace(name: string, options?: {
        onProgress?: ProgressCallback;
        isCancelled?: CancellationCheck;
    }): Promise<{
        spaceId: string;
        name: string;
        success: boolean;
    }>;
    getIdentityLevel(identityId: string): Promise<IdentityLevel>;
    getPoolInfo(poolId: string): Promise<PoolInfo>;
    getPoolForContent(contentId: string): Promise<{
        hasPool: boolean;
        poolId?: string;
        totalPow: number;
        requiredPow: number;
        status: string;
        contributorCount: number;
        expiresAt: number;
    }>;
    /**
     * Get underlying RPC client for advanced usage
     */
    getRpc(): SwimchainRpc;
}
/**
 * Create a testnet client
 */
declare function swimchainTestnet(port?: number): SwimchainClient;
/**
 * Create a mainnet client
 */
declare function swimchainMainnet(port?: number): SwimchainClient;
/**
 * Create a client with custom endpoint
 */
declare function swimchain(endpoint: string, testnet?: boolean): SwimchainClient;

export { ActionType, type CancellationCheck, type ContentItem, ContentType, DIFFICULTY, type DecayInfo, type DecayState, type EmojiCount, type IdentityLevel, type IdentityOptions, type NodeInfo, PRODUCTION_CONFIG, type PeerInfo, type PoWChallenge, type PoWConfig, type PoWSolution, type PoolInfo, type PoolState, type ProgressCallback, REACTION_CODES, REACTION_EMOJIS, type ReactionCounts, type ReactionType, type Reply, type RpcConfig, type RpcError, type RpcRequest, type RpcResponse, type Signer, type Space, type StoredIdentity, SwimchainClient, type SwimchainClientOptions, SwimchainRpc, type SyncStatus, TESTNET_CONFIG, TESTNET_DIFFICULTY, TEST_CONFIG, type Thread, bytesToHex, computePow, createChallenge, createClient, createMainnetClient, createTestnetClient, estimateMiningTime, formatTimestamp, getDifficulty, getPoWConfig, hexToBytes, leadingZeros, nowSeconds, randomBytes, serializeChallenge, sha256, sha256Hex, sha256String, sleep, solutionToRpcParams, swimchain, swimchainMainnet, swimchainTestnet, timeAgo, truncate, truncateAddress };
