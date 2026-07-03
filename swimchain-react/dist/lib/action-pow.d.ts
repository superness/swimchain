/**
 * Action Proof-of-Work for Swimchain
 *
 * Implements SPEC_03 action PoW using Argon2id.
 * This is DISTINCT from identity PoW (SHA-256) used for creating identities.
 *
 * Action PoW is required for:
 * - Creating posts (difficulty 20, testnet: 10)
 * - Creating replies (difficulty 18, testnet: 8)
 * - Engaging with content (difficulty 16, testnet: 6)
 * - Creating spaces (difficulty 22, testnet: 12)
 *
 * @packageDocumentation
 */
/** Action types per SPEC_03 */
export declare enum ActionType {
    SpaceCreation = 1,
    Post = 2,
    Reply = 3,
    Engage = 4,
    IdentityUpdate = 5,
    SpamAttestation = 6
}
/** PoW configuration */
export interface PoWConfig {
    memoryKib: number;
    iterations: number;
    parallelism: number;
}
/** Challenge structure per SPEC_03 */
export interface PoWChallenge {
    actionType: ActionType;
    contentHash: Uint8Array;
    authorId: Uint8Array;
    timestamp: number;
    difficulty: number;
    nonceSpace: Uint8Array;
}
/** Solution structure */
export interface PoWSolution {
    challenge: PoWChallenge;
    nonce: bigint;
    hash: Uint8Array;
}
/** Progress callback */
export type ProgressCallback = (attempts: number, elapsedMs: number, hashRate: number) => void;
/** Cancellation check */
export type CancellationCheck = () => boolean;
/** Default difficulty per action type (mainnet) */
export declare const DIFFICULTY: Record<ActionType, number>;
/** Testnet difficulty (reduced for faster testing) */
export declare const TESTNET_DIFFICULTY: Record<ActionType, number>;
/** Production config (64 MiB - heavy) */
export declare const PRODUCTION_CONFIG: PoWConfig;
/** Testnet config (8 MiB - reasonable for browser) */
export declare const TESTNET_CONFIG: PoWConfig;
/** Test/regtest config (1 MiB - fast) */
export declare const TEST_CONFIG: PoWConfig;
/**
 * Compute SHA-256 hash
 */
export declare function sha256(data: Uint8Array): Promise<Uint8Array>;
export { hexToBytes, bytesToHex } from './utils';
/**
 * Count leading zero bits in a hash
 */
export declare function leadingZeros(hash: Uint8Array): number;
/**
 * Generate a random nonce space (8 bytes)
 */
export declare function generateNonceSpace(): Uint8Array;
/**
 * Serialize a challenge to 82-byte canonical format per SPEC_03 §4.2
 */
export declare function serializeChallenge(challenge: PoWChallenge): Uint8Array;
/**
 * Create a challenge for content
 */
export declare function createChallenge(actionType: ActionType, content: Uint8Array, authorPubkey: Uint8Array, difficulty: number): Promise<PoWChallenge>;
/**
 * Create a challenge for a post
 */
export declare function createPostChallenge(spaceId: string, title: string, body: string, authorPubkeyHex: string, isTestnet?: boolean): Promise<PoWChallenge>;
/**
 * Create a challenge for a reply
 */
export declare function createReplyChallenge(parentId: string, body: string, authorPubkeyHex: string, isTestnet?: boolean): Promise<PoWChallenge>;
/**
 * Create a challenge for engagement
 */
export declare function createEngageChallenge(contentId: string, authorPubkeyHex: string, isTestnet?: boolean): Promise<PoWChallenge>;
/**
 * Create a challenge for space creation
 */
export declare function createSpaceChallenge(name: string, authorPubkeyHex: string, isTestnet?: boolean): Promise<PoWChallenge>;
/**
 * Compute PoW solution for a challenge
 *
 * This is the main mining function. It iterates through nonces until
 * it finds one that produces a hash with the required leading zeros.
 */
export declare function computePow(challenge: PoWChallenge, config: PoWConfig, onProgress?: ProgressCallback, isCancelled?: CancellationCheck): Promise<PoWSolution>;
/**
 * Convert solution to RPC-compatible parameters
 *
 * Note: nonce is passed as a string to avoid precision loss for large values.
 * JavaScript numbers (IEEE 754 doubles) lose precision above 2^53.
 */
export declare function solutionToRpcParams(solution: PoWSolution): {
    pow_nonce: string;
    pow_difficulty: number;
    pow_nonce_space: string;
    pow_hash: string;
    timestamp: number;
};
/**
 * Get difficulty for action type based on network
 */
export declare function getDifficulty(actionType: ActionType, isTestnet?: boolean): number;
/**
 * Get PoW config based on network
 */
export declare function getConfig(isTestnet?: boolean): PoWConfig;
/**
 * Estimate mining time in seconds
 */
export declare function estimateMiningTime(difficulty: number, hashRate?: number): number;
//# sourceMappingURL=action-pow.d.ts.map