/**
 * Swimchain RPC Client
 *
 * Provides connection to a Swimchain node via JSON-RPC over HTTP.
 * Supports signature-based authentication with the user's identity keypair.
 *
 * @packageDocumentation
 */
export interface RpcRequest {
    jsonrpc: '2.0';
    method: string;
    params: Record<string, unknown>;
    id: number | string;
}
export interface RpcResponse<T = unknown> {
    jsonrpc: '2.0';
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
    id: number | string;
}
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
export interface SyncStatus {
    state: string;
    chain_percent: number;
    peer_count: number;
    storage_mb: number;
    storage_target_mb: number;
    last_block_time: number | null;
}
export interface ContentResult {
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
    reply_count?: number;
    has_pool?: boolean;
    pool_progress?: number;
    pool_status?: string;
}
export interface SpaceContentResult {
    items: ContentResult[];
    total: number;
}
export interface SpaceSummary {
    space_id: string;
    post_count: number;
    last_activity: number | null;
    name: string | null;
}
export interface ListSpacesResult {
    spaces: SpaceSummary[];
    total: number;
}
export interface UserPostsResult {
    user_id: string;
    items: ContentResult[];
    total_posts: number;
    total_content: number;
}
export interface IdentityLevel {
    identity_id: string;
    level: number;
    level_name: string;
    is_genesis: boolean;
    streak_days: number;
    bandwidth_served: number;
    contribution_score: number;
}
export interface PoolInfo {
    pool_id: string;
    content_id: string;
    total_pow: number;
    required_pow: number;
    status: string;
    contributor_count: number;
    expires_at: number;
}
export interface ReplyResult {
    content_id: string;
    author_id: string;
    body: string;
    parent_id: string;
    created_at: number;
    last_engagement: number;
    depth?: number;
    child_count?: number;
    decay_state?: string;
    seconds_until_decay_starts?: number | null;
    seconds_until_pruned?: number | null;
    survival_probability?: number;
    is_protected?: boolean;
    time_since_engagement?: number;
    /** Block height where this reply was finalized; null/absent while pending (tentative). */
    block_height?: number | null;
}
export interface ReactionResult {
    emoji: string;
    reaction_type: number;
    count: number;
}
export type SpamReason = 'advertising' | 'repetitive' | 'off_topic' | 'harassment' | 'illegal_content';
export interface SpamStatus {
    content_id: string;
    is_flagged: boolean;
    attestation_count: number;
    counter_count: number;
    reasons: string[];
    spam_threshold: number;
    counter_threshold: number;
}
export interface RpcConfig {
    /** RPC endpoint URL */
    endpoint: string;
    /** Basic auth credentials (optional) */
    auth?: {
        username: string;
        password: string;
    };
    /** Request timeout in milliseconds */
    timeout?: number;
}
export interface SignatureAuth {
    /** Sign a message and return the signature bytes */
    sign: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>;
    /** Public key as hex string */
    publicKey: string;
}
/**
 * SwimchainRpc - RPC client for Swimchain nodes
 *
 * @example
 * ```ts
 * const rpc = new SwimchainRpc({ endpoint: 'http://localhost:19756' });
 * await rpc.connect();
 *
 * const spaces = await rpc.listSpaces();
 * console.log(spaces);
 * ```
 */
export declare class SwimchainRpc {
    private endpoint;
    private auth?;
    private signatureAuth;
    private timeout;
    private requestId;
    private connected;
    private nodeInfo;
    constructor(config: RpcConfig);
    /**
     * Set signature authentication (for browser clients)
     */
    setSignatureAuth(auth: SignatureAuth | null): void;
    /**
     * Check if signature auth is configured
     */
    hasSignatureAuth(): boolean;
    /**
     * Make a raw RPC call
     */
    call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    /**
     * Connect and verify node is reachable
     */
    connect(): Promise<boolean>;
    isConnected(): boolean;
    getNodeInfo(): NodeInfo | null;
    getInfo(): Promise<NodeInfo>;
    getSyncStatus(): Promise<SyncStatus>;
    getPeers(): Promise<Array<{
        peer_id: string;
        address: string;
        direction: string;
    }>>;
    getContent(contentId: string): Promise<ContentResult>;
    listSpaces(options?: {
        limit?: number;
        offset?: number;
    }): Promise<ListSpacesResult>;
    listSpaceContent(spaceId: string, options?: {
        limit?: number;
        offset?: number;
        sort?: 'recent' | 'hot' | 'top';
    }): Promise<SpaceContentResult>;
    listSpacePosts(spaceId: string, options?: {
        limit?: number;
        offset?: number;
    }): Promise<SpaceContentResult>;
    /**
     * Get posts by a specific user (for feed-style clients)
     *
     * @param userId - User's public key (32-byte hex)
     * @param options - Pagination and filter options
     * @returns User's posts (and optionally replies)
     */
    getUserPosts(userId: string, options?: {
        limit?: number;
        offset?: number;
        includeReplies?: boolean;
    }): Promise<UserPostsResult>;
    requestContent(contentId: string): Promise<{
        status: string;
        message: string;
    }>;
    getReplies(contentId: string, opts?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        parent_id: string;
        replies: ReplyResult[];
        total_count: number;
    }>;
    getIdentityLevel(identityId: string): Promise<IdentityLevel>;
    getPoolInfo(poolId: string): Promise<PoolInfo>;
    getPoolForContent(contentId: string): Promise<{
        has_pool: boolean;
        pool_id?: string;
        total_pow: number;
        required_pow: number;
        status: string;
        contributor_count: number;
        expires_at: number;
    }>;
    getReactions(contentId: string): Promise<{
        content_id: string;
        reactions: ReactionResult[];
        total: number;
    }>;
    getUserReactions(contentId: string, userId: string): Promise<{
        content_id: string;
        user_id: string;
        reaction_types: number[];
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
        content_id: string;
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
        content_id: string;
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
        reaction_stored: boolean;
        content_id: string;
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
        space_id: string;
        name: string;
        success: boolean;
    }>;
    /**
     * Submit a spam attestation to flag content
     */
    submitSpamAttestation(params: {
        contentId: string;
        attesterId: string;
        reason: SpamReason;
        powNonce: number;
        powDifficulty: number;
        powNonceSpace: string;
        powHash: string;
        signature: string;
        timestamp: number;
    }): Promise<{
        stored: boolean;
        content_id: string;
        attestation_count: number;
        threshold_reached: boolean;
    }>;
    /**
     * Submit a counter-attestation to dispute a spam flag
     */
    submitCounterAttestation(params: {
        contentId: string;
        attesterId: string;
        powNonce: number;
        powDifficulty: number;
        powNonceSpace: string;
        powHash: string;
        signature: string;
        timestamp: number;
    }): Promise<{
        stored: boolean;
        content_id: string;
        counter_count: number;
        threshold_reached: boolean;
    }>;
    /**
     * Get spam status for content
     */
    getSpamStatus(contentId: string): Promise<SpamStatus>;
    /**
     * Send a DM request to another user
     *
     * @param requester - Requester's public key (hex)
     * @param recipient - Recipient's public key (hex)
     * @param keyShare - Requester's key share for DH exchange (hex)
     * @param signature - Signature of the request
     * @param timestamp - Unix timestamp
     */
    requestDM(params: {
        requester: string;
        recipient: string;
        keyShare: string;
        powNonce: number;
        powDifficulty: number;
        powNonceSpace: string;
        powHash: string;
        signature: string;
        timestamp: number;
    }): Promise<{
        request_hash: string;
        broadcast: boolean;
    }>;
    /**
     * Accept a DM request from another user
     *
     * @param requester - Requester's public key (hex)
     * @param acceptor - Acceptor's public key (hex)
     * @param keyShare - Acceptor's key share for completing DH exchange (hex)
     * @param signature - Signature of the acceptance
     * @param timestamp - Unix timestamp
     */
    acceptDM(params: {
        requester: string;
        acceptor: string;
        keyShare: string;
        signature: string;
        timestamp: number;
    }): Promise<{
        space_id: string;
        broadcast: boolean;
    }>;
    /**
     * Decline a DM request from another user
     */
    declineDM(params: {
        requester: string;
        decliner: string;
        signature: string;
        timestamp: number;
    }): Promise<{
        success: boolean;
        broadcast: boolean;
    }>;
    /**
     * Get pending DM requests for a user
     */
    getPendingDMRequests(userId: string): Promise<{
        requests: Array<{
            request_hash: string;
            requester: string;
            key_share: string;
            created_at: number;
        }>;
    }>;
    /**
     * Kick a member from a private space (admin/mod only)
     *
     * This removes the member and rotates keys for remaining members.
     *
     * @param spaceId - Space ID (hex)
     * @param admin - Admin's public key (hex)
     * @param member - Member to kick (hex)
     * @param newEncryptedKeys - Map of member pubkey → new encrypted space key
     * @param keyVersion - New key version number
     */
    kickMember(params: {
        spaceId: string;
        admin: string;
        member: string;
        newEncryptedKeys: Record<string, string>;
        keyVersion: number;
        powNonce: number;
        powDifficulty: number;
        powNonceSpace: string;
        powHash: string;
        signature: string;
        timestamp: number;
    }): Promise<{
        success: boolean;
        key_version: number;
        broadcast: boolean;
    }>;
    /**
     * Leave a private space
     */
    leaveSpace(params: {
        spaceId: string;
        member: string;
        signature: string;
        timestamp: number;
    }): Promise<{
        success: boolean;
        broadcast: boolean;
    }>;
    /**
     * Get members of a private space
     */
    getSpaceMembers(spaceId: string): Promise<{
        members: Array<{
            member_id: string;
            role: string;
            joined_at: number;
            invited_by: string;
            key_version: number;
        }>;
    }>;
}
declare const RPC_PORTS: {
    readonly mainnet: 9736;
    readonly testnet: 19756;
    readonly regtest: 29736;
};
export type Network = keyof typeof RPC_PORTS;
/**
 * Get RPC config for local node
 */
export declare function getLocalConfig(network?: Network): RpcConfig;
export declare const LOCAL_TESTNET: RpcConfig;
export declare const LOCAL_REGTEST: RpcConfig;
export declare const LOCAL_MAINNET: RpcConfig;
export declare const TESTNET_SEED_SF: RpcConfig;
export declare const TESTNET_SEED_NYC: RpcConfig;
export {};
//# sourceMappingURL=rpc.d.ts.map