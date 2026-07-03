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
import { argon2id, createSHA256 } from 'hash-wasm';
import { hexToBytes, bytesToHex } from './utils';
// =========================================================================
// Types
// =========================================================================
/** Action types per SPEC_03 */
export var ActionType;
(function (ActionType) {
    ActionType[ActionType["SpaceCreation"] = 1] = "SpaceCreation";
    ActionType[ActionType["Post"] = 2] = "Post";
    ActionType[ActionType["Reply"] = 3] = "Reply";
    ActionType[ActionType["Engage"] = 4] = "Engage";
    ActionType[ActionType["IdentityUpdate"] = 5] = "IdentityUpdate";
    ActionType[ActionType["SpamAttestation"] = 6] = "SpamAttestation";
})(ActionType || (ActionType = {}));
// =========================================================================
// Constants
// =========================================================================
/** Default difficulty per action type (mainnet) */
export const DIFFICULTY = {
    [ActionType.SpaceCreation]: 22,
    [ActionType.Post]: 20,
    [ActionType.Reply]: 18,
    [ActionType.Engage]: 16,
    [ActionType.IdentityUpdate]: 20,
    [ActionType.SpamAttestation]: 22,
};
/** Testnet difficulty (reduced for faster testing) */
export const TESTNET_DIFFICULTY = {
    [ActionType.SpaceCreation]: 12,
    [ActionType.Post]: 10,
    [ActionType.Reply]: 8,
    [ActionType.Engage]: 6,
    [ActionType.IdentityUpdate]: 10,
    [ActionType.SpamAttestation]: 12,
};
/** Production config (64 MiB - heavy) */
export const PRODUCTION_CONFIG = {
    memoryKib: 65536,
    iterations: 3,
    parallelism: 4,
};
/** Testnet config (8 MiB - reasonable for browser) */
export const TESTNET_CONFIG = {
    memoryKib: 8192,
    iterations: 1,
    parallelism: 2,
};
/** Test/regtest config (1 MiB - fast) */
export const TEST_CONFIG = {
    memoryKib: 1024,
    iterations: 1,
    parallelism: 1,
};
// =========================================================================
// Utilities
// =========================================================================
/**
 * Compute SHA-256 hash
 */
export async function sha256(data) {
    const hasher = await createSHA256();
    hasher.update(data);
    return hasher.digest('binary');
}
// Re-export hexToBytes and bytesToHex from shared utils
export { hexToBytes, bytesToHex } from './utils';
/**
 * Count leading zero bits in a hash
 */
export function leadingZeros(hash) {
    let zeros = 0;
    for (const byte of hash) {
        if (byte === 0) {
            zeros += 8;
        }
        else {
            zeros += Math.clz32(byte) - 24;
            break;
        }
    }
    return zeros;
}
/**
 * Generate a random nonce space (8 bytes)
 */
export function generateNonceSpace() {
    const nonceSpace = new Uint8Array(8);
    crypto.getRandomValues(nonceSpace);
    return nonceSpace;
}
/**
 * Serialize a challenge to 82-byte canonical format per SPEC_03 §4.2
 */
export function serializeChallenge(challenge) {
    const buf = new Uint8Array(82);
    buf[0] = challenge.actionType;
    buf.set(challenge.contentHash, 1);
    buf.set(challenge.authorId, 33);
    const view = new DataView(buf.buffer);
    const ts = BigInt(challenge.timestamp);
    view.setBigUint64(65, ts, false); // big-endian
    buf[73] = challenge.difficulty;
    buf.set(challenge.nonceSpace, 74);
    return buf;
}
// =========================================================================
// Challenge Creation
// =========================================================================
/**
 * Create a challenge for content
 */
export async function createChallenge(actionType, content, authorPubkey, difficulty) {
    const contentHash = await sha256(content);
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceSpace = generateNonceSpace();
    return {
        actionType,
        contentHash,
        authorId: authorPubkey,
        timestamp,
        difficulty,
        nonceSpace,
    };
}
/**
 * Create a challenge for a post
 */
export async function createPostChallenge(spaceId, title, body, authorPubkeyHex, isTestnet = true) {
    const content = new TextEncoder().encode(`${spaceId}:${title}:${body}`);
    const authorPubkey = hexToBytes(authorPubkeyHex);
    const difficulty = isTestnet ? TESTNET_DIFFICULTY[ActionType.Post] : DIFFICULTY[ActionType.Post];
    return createChallenge(ActionType.Post, content, authorPubkey, difficulty);
}
/**
 * Create a challenge for a reply
 */
export async function createReplyChallenge(parentId, body, authorPubkeyHex, isTestnet = true) {
    const content = new TextEncoder().encode(`${parentId}:${body}`);
    const authorPubkey = hexToBytes(authorPubkeyHex);
    const difficulty = isTestnet
        ? TESTNET_DIFFICULTY[ActionType.Reply]
        : DIFFICULTY[ActionType.Reply];
    return createChallenge(ActionType.Reply, content, authorPubkey, difficulty);
}
/**
 * Create a challenge for engagement
 */
export async function createEngageChallenge(contentId, authorPubkeyHex, isTestnet = true) {
    const contentHashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
    const contentHash = hexToBytes(contentHashHex);
    const authorPubkey = hexToBytes(authorPubkeyHex);
    const difficulty = isTestnet
        ? TESTNET_DIFFICULTY[ActionType.Engage]
        : DIFFICULTY[ActionType.Engage];
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceSpace = generateNonceSpace();
    return {
        actionType: ActionType.Engage,
        contentHash,
        authorId: authorPubkey,
        timestamp,
        difficulty,
        nonceSpace,
    };
}
/**
 * Create a challenge for space creation
 */
export async function createSpaceChallenge(name, authorPubkeyHex, isTestnet = true) {
    const content = new TextEncoder().encode(`space:${name}`);
    const authorPubkey = hexToBytes(authorPubkeyHex);
    const difficulty = isTestnet
        ? TESTNET_DIFFICULTY[ActionType.SpaceCreation]
        : DIFFICULTY[ActionType.SpaceCreation];
    return createChallenge(ActionType.SpaceCreation, content, authorPubkey, difficulty);
}
// =========================================================================
// Mining
// =========================================================================
/**
 * Compute Argon2id hash for PoW
 */
async function computeArgon2id(input, salt, config) {
    const hash = await argon2id({
        password: input,
        salt: salt,
        parallelism: config.parallelism,
        memorySize: config.memoryKib,
        iterations: config.iterations,
        hashLength: 32,
        outputType: 'binary',
    });
    return new Uint8Array(hash);
}
/**
 * Compute PoW solution for a challenge
 *
 * This is the main mining function. It iterates through nonces until
 * it finds one that produces a hash with the required leading zeros.
 */
export async function computePow(challenge, config, onProgress, isCancelled) {
    const serialized = serializeChallenge(challenge);
    let nonce = 0n;
    const startTime = Date.now();
    let attempts = 0;
    // Pre-allocate input buffer (82 challenge + 8 nonce = 90 bytes)
    const input = new Uint8Array(90);
    input.set(serialized, 0);
    const view = new DataView(input.buffer);
    while (true) {
        if (isCancelled?.()) {
            throw new Error('Mining cancelled');
        }
        // Set nonce as big-endian u64
        view.setBigUint64(82, nonce, false);
        // Compute Argon2id hash
        const hash = await computeArgon2id(input, challenge.nonceSpace, config);
        attempts++;
        // Check if hash meets difficulty
        if (leadingZeros(hash) >= challenge.difficulty) {
            return {
                challenge,
                nonce,
                hash,
            };
        }
        // Progress callback every 10 attempts
        if (attempts % 10 === 0) {
            const elapsedMs = Date.now() - startTime;
            const hashRate = (attempts / elapsedMs) * 1000;
            onProgress?.(attempts, elapsedMs, hashRate);
        }
        nonce = nonce + 1n;
    }
}
// =========================================================================
// Helpers
// =========================================================================
/**
 * Convert solution to RPC-compatible parameters
 *
 * Note: nonce is passed as a string to avoid precision loss for large values.
 * JavaScript numbers (IEEE 754 doubles) lose precision above 2^53.
 */
export function solutionToRpcParams(solution) {
    return {
        pow_nonce: solution.nonce.toString(),
        pow_difficulty: solution.challenge.difficulty,
        pow_nonce_space: bytesToHex(solution.challenge.nonceSpace),
        pow_hash: bytesToHex(solution.hash),
        timestamp: solution.challenge.timestamp,
    };
}
/**
 * Get difficulty for action type based on network
 */
export function getDifficulty(actionType, isTestnet = true) {
    return isTestnet ? TESTNET_DIFFICULTY[actionType] : DIFFICULTY[actionType];
}
/**
 * Get PoW config based on network
 */
export function getConfig(isTestnet = true) {
    return isTestnet ? TESTNET_CONFIG : PRODUCTION_CONFIG;
}
/**
 * Estimate mining time in seconds
 */
export function estimateMiningTime(difficulty, hashRate = 1) {
    const expectedAttempts = Math.pow(2, difficulty);
    return expectedAttempts / hashRate;
}
//# sourceMappingURL=action-pow.js.map