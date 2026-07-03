/**
 * Swimchain RPC Client
 *
 * Provides connection to a Swimchain node via JSON-RPC over HTTP.
 * Supports signature-based authentication with the user's identity keypair.
 *
 * @packageDocumentation
 */
// =========================================================================
// Utilities
// =========================================================================
import { bytesToHex } from './utils';
async function sha256(data) {
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return new Uint8Array(hashBuffer);
}
// =========================================================================
// RPC Client
// =========================================================================
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
export class SwimchainRpc {
    constructor(config) {
        this.signatureAuth = null;
        this.requestId = 1;
        this.connected = false;
        this.nodeInfo = null;
        this.endpoint = config.endpoint;
        this.auth = config.auth;
        this.timeout = config.timeout ?? 30000;
    }
    /**
     * Set signature authentication (for browser clients)
     */
    setSignatureAuth(auth) {
        this.signatureAuth = auth;
    }
    /**
     * Check if signature auth is configured
     */
    hasSignatureAuth() {
        return this.signatureAuth !== null;
    }
    /**
     * Make a raw RPC call
     */
    async call(method, params = {}) {
        const request = {
            jsonrpc: '2.0',
            method,
            params,
            id: this.requestId++,
        };
        const headers = {
            'Content-Type': 'application/json',
        };
        // Use signature auth if available
        if (this.signatureAuth) {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const paramsJson = JSON.stringify(params);
            const paramsHash = await sha256(new TextEncoder().encode(paramsJson));
            const paramsHashHex = bytesToHex(paramsHash);
            const message = `swimchain-rpc:${method}:${paramsHashHex}:${timestamp}`;
            const messageBytes = new TextEncoder().encode(message);
            const signature = await this.signatureAuth.sign(messageBytes);
            const signatureHex = bytesToHex(signature);
            headers['X-CS-Identity'] = this.signatureAuth.publicKey;
            headers['X-CS-Timestamp'] = timestamp;
            headers['X-CS-Signature'] = signatureHex;
        }
        else if (this.auth) {
            const credentials = `${this.auth.username}:${this.auth.password}`;
            headers['Authorization'] = `Basic ${btoa(credentials)}`;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(request),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const rpcResponse = (await response.json());
            if (rpcResponse.error) {
                throw new Error(`RPC Error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
            }
            return rpcResponse.result;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    /**
     * Connect and verify node is reachable
     */
    async connect() {
        try {
            this.nodeInfo = await this.call('get_info');
            this.connected = true;
            return true;
        }
        catch (error) {
            this.connected = false;
            this.nodeInfo = null;
            console.error('Failed to connect to node:', error);
            return false;
        }
    }
    isConnected() {
        return this.connected;
    }
    getNodeInfo() {
        return this.nodeInfo;
    }
    // =========================================================================
    // Node Status
    // =========================================================================
    async getInfo() {
        return this.call('get_info');
    }
    async getSyncStatus() {
        return this.call('get_sync_status');
    }
    async getPeers() {
        return this.call('get_peers');
    }
    // =========================================================================
    // Content
    // =========================================================================
    async getContent(contentId) {
        return this.call('get_content', { content_id: contentId });
    }
    async listSpaces(options) {
        return this.call('list_spaces', {
            limit: options?.limit ?? 100,
            offset: options?.offset ?? 0,
        });
    }
    async listSpaceContent(spaceId, options) {
        return this.call('list_space_content', {
            space_id: spaceId,
            limit: options?.limit ?? 50,
            offset: options?.offset ?? 0,
            sort: options?.sort ?? 'recent',
        });
    }
    async listSpacePosts(spaceId, options) {
        return this.call('list_space_posts', {
            space_id: spaceId,
            limit: options?.limit ?? 50,
            offset: options?.offset ?? 0,
            sort: 'recent',
        });
    }
    /**
     * Get posts by a specific user (for feed-style clients)
     *
     * @param userId - User's public key (32-byte hex)
     * @param options - Pagination and filter options
     * @returns User's posts (and optionally replies)
     */
    async getUserPosts(userId, options) {
        return this.call('get_user_posts', {
            user_id: userId,
            limit: options?.limit ?? 50,
            offset: options?.offset ?? 0,
            include_replies: options?.includeReplies ?? false,
        });
    }
    async requestContent(contentId) {
        return this.call('request_content', { content_id: contentId });
    }
    async getReplies(contentId) {
        return this.call('get_replies', { content_id: contentId });
    }
    // =========================================================================
    // Identity
    // =========================================================================
    async getIdentityLevel(identityId) {
        return this.call('get_identity_level', { identity_id: identityId });
    }
    // =========================================================================
    // Pools
    // =========================================================================
    async getPoolInfo(poolId) {
        return this.call('get_pool_info', { pool_id: poolId });
    }
    async getPoolForContent(contentId) {
        return this.call('get_pool_for_content', { content_id: contentId });
    }
    // =========================================================================
    // Reactions
    // =========================================================================
    async getReactions(contentId) {
        return this.call('get_reactions', { content_id: contentId });
    }
    async getUserReactions(contentId, userId) {
        return this.call('get_user_reactions', {
            content_id: contentId,
            user_id: userId,
        });
    }
    // =========================================================================
    // Content Submission
    // =========================================================================
    async submitPost(params) {
        return this.call('submit_post', {
            space_id: params.spaceId,
            title: params.title,
            body: params.body,
            author_id: params.authorId,
            pow_nonce: params.powNonce,
            pow_difficulty: params.powDifficulty,
            pow_nonce_space: params.powNonceSpace,
            pow_hash: params.powHash,
            signature: params.signature,
            timestamp: params.timestamp,
        });
    }
    async submitReply(params) {
        return this.call('submit_reply', {
            parent_id: params.parentId,
            body: params.body,
            author_id: params.authorId,
            pow_nonce: params.powNonce,
            pow_difficulty: params.powDifficulty,
            pow_nonce_space: params.powNonceSpace,
            pow_hash: params.powHash,
            signature: params.signature,
            timestamp: params.timestamp,
        });
    }
    async submitEngagement(params) {
        return this.call('submit_engagement', {
            content_id: params.contentId,
            author_id: params.authorId,
            pow_nonce: params.powNonce,
            pow_difficulty: params.powDifficulty,
            pow_nonce_space: params.powNonceSpace,
            pow_hash: params.powHash,
            signature: params.signature,
            timestamp: params.timestamp,
            emoji: params.emoji,
        });
    }
    async createSpace(params) {
        return this.call('create_space', {
            name: params.name,
            creator_id: params.creatorId,
            pow_nonce: params.powNonce,
            pow_difficulty: params.powDifficulty,
            pow_nonce_space: params.powNonceSpace,
            pow_hash: params.powHash,
            signature: params.signature,
            timestamp: params.timestamp,
        });
    }
    // =========================================================================
    // Spam Attestation (SPEC_12 §3)
    // =========================================================================
    /**
     * Submit a spam attestation to flag content
     */
    async submitSpamAttestation(params) {
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
    async submitCounterAttestation(params) {
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
    async getSpamStatus(contentId) {
        return this.call('get_spam_status', {
            content_id: contentId,
        });
    }
    // =========================================================================
    // Direct Messages
    // =========================================================================
    /**
     * Send a DM request to another user
     *
     * @param requester - Requester's public key (hex)
     * @param recipient - Recipient's public key (hex)
     * @param keyShare - Requester's key share for DH exchange (hex)
     * @param signature - Signature of the request
     * @param timestamp - Unix timestamp
     */
    async requestDM(params) {
        return this.call('request_dm', {
            requester: params.requester,
            recipient: params.recipient,
            key_share: params.keyShare,
            pow_nonce: params.powNonce,
            pow_difficulty: params.powDifficulty,
            pow_nonce_space: params.powNonceSpace,
            pow_hash: params.powHash,
            signature: params.signature,
            timestamp: params.timestamp,
        });
    }
    /**
     * Accept a DM request from another user
     *
     * @param requester - Requester's public key (hex)
     * @param acceptor - Acceptor's public key (hex)
     * @param keyShare - Acceptor's key share for completing DH exchange (hex)
     * @param signature - Signature of the acceptance
     * @param timestamp - Unix timestamp
     */
    async acceptDM(params) {
        return this.call('accept_dm', {
            requester: params.requester,
            acceptor: params.acceptor,
            key_share: params.keyShare,
            signature: params.signature,
            timestamp: params.timestamp,
        });
    }
    /**
     * Decline a DM request from another user
     */
    async declineDM(params) {
        return this.call('decline_dm', {
            requester: params.requester,
            decliner: params.decliner,
            signature: params.signature,
            timestamp: params.timestamp,
        });
    }
    /**
     * Get pending DM requests for a user
     */
    async getPendingDMRequests(userId) {
        return this.call('get_pending_dm_requests', { user_id: userId });
    }
    // =========================================================================
    // Private Space Management
    // =========================================================================
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
    async kickMember(params) {
        return this.call('kick_member', {
            space_id: params.spaceId,
            admin: params.admin,
            member: params.member,
            new_encrypted_keys: params.newEncryptedKeys,
            key_version: params.keyVersion,
            pow_nonce: params.powNonce,
            pow_difficulty: params.powDifficulty,
            pow_nonce_space: params.powNonceSpace,
            pow_hash: params.powHash,
            signature: params.signature,
            timestamp: params.timestamp,
        });
    }
    /**
     * Leave a private space
     */
    async leaveSpace(params) {
        return this.call('leave_space', {
            space_id: params.spaceId,
            member: params.member,
            signature: params.signature,
            timestamp: params.timestamp,
        });
    }
    /**
     * Get members of a private space
     */
    async getSpaceMembers(spaceId) {
        return this.call('get_space_members', { space_id: spaceId });
    }
}
// =========================================================================
// Configuration Helpers
// =========================================================================
const RPC_PORTS = {
    mainnet: 9736,
    testnet: 19756,
    regtest: 29736,
};
/**
 * Get RPC config for local node
 */
export function getLocalConfig(network = 'testnet') {
    return {
        endpoint: `http://127.0.0.1:${RPC_PORTS[network]}`,
        timeout: 30000,
    };
}
export const LOCAL_TESTNET = getLocalConfig('testnet');
export const LOCAL_REGTEST = getLocalConfig('regtest');
export const LOCAL_MAINNET = getLocalConfig('mainnet');
// Public testnet seeds
export const TESTNET_SEED_SF = {
    endpoint: 'http://64.225.115.108:8736',
    timeout: 30000,
};
export const TESTNET_SEED_NYC = {
    endpoint: 'http://104.236.106.124:8736',
    timeout: 30000,
};
//# sourceMappingURL=rpc.js.map