/**
 * Action proof-of-work (SPEC_03, Argon2id) — Node.js port of the exact
 * algorithm wiki-client mines with (swimchain-frontend/src/lib/action-pow.ts).
 *
 * Byte contract (must match the node's verify_pow_submission):
 *   challenge = [action_type u8][sha256(content) 32][author_pubkey 32]
 *               [timestamp u64 BE][difficulty u8][nonce_space 8]   (82 bytes)
 *   input     = challenge || nonce u64 BE                          (90 bytes)
 *   hash      = argon2id(input, salt = nonce_space)                (32 bytes)
 *   accept when leading_zero_bits(hash) >= difficulty
 */

import { createHash, randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';

export const ActionType = {
  SpaceCreation: 1,
  Post: 2,
  Reply: 3,
  Engage: 4,
  IdentityUpdate: 5,
  SpamAttestation: 6,
};

/** Argon2id params per network (mirrors action-pow.ts configs). */
export const POW_CONFIG = {
  regtest: { memoryKib: 1024, iterations: 1, parallelism: 1 },
  testnet: { memoryKib: 8192, iterations: 1, parallelism: 2 },
};

/** Difficulty (leading zero bits) per network per action type. */
export const POW_DIFFICULTY = {
  regtest: {
    [ActionType.SpaceCreation]: 6,
    [ActionType.Post]: 6,
    [ActionType.Reply]: 6,
    [ActionType.Engage]: 6,
  },
  testnet: {
    [ActionType.SpaceCreation]: 12,
    [ActionType.Post]: 10,
    [ActionType.Reply]: 8,
    [ActionType.Engage]: 6,
  },
};

function sha256(data) {
  return createHash('sha256').update(data).digest();
}

function leadingZeros(hash) {
  let zeros = 0;
  for (const byte of hash) {
    if (byte === 0) {
      zeros += 8;
    } else {
      zeros += Math.clz32(byte) - 24;
      break;
    }
  }
  return zeros;
}

export function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

export function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

/**
 * Mine action PoW over the EXACT content bytes the node re-hashes
 * (wiki page create: `${title}\n\n${body}` — the PR #45 byte contract).
 *
 * @param {number} actionType - ActionType.*
 * @param {string} content - exact content string
 * @param {Uint8Array} authorPubkey - 32-byte Ed25519 public key
 * @param {'regtest'|'testnet'} network
 * @returns {Promise<{pow_nonce: number, pow_difficulty: number,
 *                    pow_nonce_space: string, pow_hash: string, timestamp: number}>}
 */
export async function mineActionPow(actionType, content, authorPubkey, network) {
  const config = POW_CONFIG[network];
  const difficulty = POW_DIFFICULTY[network][actionType];
  if (!config || difficulty === undefined) {
    throw new Error(`Unsupported network for PoW: ${network}`);
  }

  const contentHash = sha256(Buffer.from(content, 'utf-8'));
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceSpace = randomBytes(8);

  // 82-byte challenge + 8-byte nonce
  const input = Buffer.alloc(90);
  input[0] = actionType;
  contentHash.copy(input, 1);
  Buffer.from(authorPubkey).copy(input, 33);
  input.writeBigUInt64BE(BigInt(timestamp), 65);
  input[73] = difficulty;
  nonceSpace.copy(input, 74);

  let nonce = 0n;
  for (;;) {
    input.writeBigUInt64BE(nonce, 82);
    const hash = await argon2id({
      password: new Uint8Array(input),
      salt: new Uint8Array(nonceSpace),
      parallelism: config.parallelism,
      memorySize: config.memoryKib,
      iterations: config.iterations,
      hashLength: 32,
      outputType: 'binary',
    });
    if (leadingZeros(hash) >= difficulty) {
      return {
        pow_nonce: Number(nonce),
        pow_difficulty: difficulty,
        pow_nonce_space: nonceSpace.toString('hex'),
        pow_hash: Buffer.from(hash).toString('hex'),
        timestamp,
      };
    }
    nonce++;
  }
}
