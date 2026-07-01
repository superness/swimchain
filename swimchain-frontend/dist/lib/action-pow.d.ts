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
/** Default difficulty per action type (mainnet) */
export declare const DIFFICULTY: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
    6: number;
};
/** Testnet difficulty (reduced by ~10 bits) */
export declare const TESTNET_DIFFICULTY: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
    6: number;
};
/** PoW configuration per SPEC_03 */
export interface PoWConfig {
    memoryKib: number;
    iterations: number;
    parallelism: number;
}
/** Production config (64 MiB - too heavy for browser) */
export declare const PRODUCTION_CONFIG: PoWConfig;
/** Testnet config (8 MiB - reasonable for browser) */
export declare const TESTNET_CONFIG: PoWConfig;
/** Test/regtest config (1 MiB - fast) */
export declare const TEST_CONFIG: PoWConfig;
/** Challenge structure per SPEC_03 */
export interface PoWChallenge {
    actionType: ActionType;
    contentHash: Uint8Array;
    authorId: Uint8Array;
    timestamp: number;
    difficulty: number;
    nonceSpace: Uint8Array;
}
/** Solution structure per SPEC_03 */
export interface PoWSolution {
    challenge: PoWChallenge;
    nonce: bigint;
    hash: Uint8Array;
}
/** Progress callback */
export type ProgressCallback = (attempts: number, elapsedMs: number, hashRate: number) => void;
/** Cancellation check */
export type CancellationCheck = () => boolean;
/**
 * Compute SHA-256 hash of data
 */
export declare function sha256(data: Uint8Array): Promise<Uint8Array>;
/**
 * Serialize a challenge to 82-byte canonical format per SPEC_03 §4.2
 */
export declare function serializeChallenge(challenge: PoWChallenge): Uint8Array;
/**
 * Count leading zero bits in a hash
 */
export declare function leadingZeros(hash: Uint8Array): number;
/**
 * Generate a random nonce space
 */
export declare function generateNonceSpace(): Uint8Array;
/**
 * Create a challenge for content
 */
export declare function createChallenge(actionType: ActionType, content: Uint8Array, authorPubkey: Uint8Array, difficulty: number): Promise<PoWChallenge>;
/**
 * Compute PoW solution for a challenge
 *
 * This is the main mining function. It iterates through nonces until
 * it finds one that produces a hash with the required leading zeros.
 *
 * @param challenge The challenge to solve
 * @param config PoW configuration (memory, iterations, parallelism)
 * @param onProgress Optional progress callback
 * @param isCancelled Optional cancellation check
 * @returns The solution with nonce and hash
 */
export declare function computePow(challenge: PoWChallenge, config: PoWConfig, onProgress?: ProgressCallback, isCancelled?: CancellationCheck): Promise<PoWSolution>;
/**
 * Convert solution to RPC-compatible format
 */
export declare function solutionToRpcParams(solution: PoWSolution): {
    pow_nonce: number;
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
/**
 * Compute pool PoW target (used for engagement pool contributions)
 *
 * Target = SHA256(content_hash || pool_id || prev_block_hash)
 *
 * @param contentHash - 32-byte content hash
 * @param poolId - 32-byte pool ID
 * @param prevBlockHash - Optional 32-byte previous block hash
 */
export declare function computePoolPowTarget(contentHash: Uint8Array, poolId: Uint8Array, prevBlockHash?: Uint8Array): Promise<Uint8Array>;
/**
 * Convert hex string to Uint8Array
 */
export declare function hexToBytes(hex: string): Uint8Array;
/**
 * Convert Uint8Array to hex string
 */
export declare function bytesToHex(bytes: Uint8Array): string;
//# sourceMappingURL=action-pow.d.ts.map