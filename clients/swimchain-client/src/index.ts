/**
 * SwimChain Client Library
 *
 * A portable client library for interacting with SwimChain nodes.
 * Works in both Node.js and browser environments.
 *
 * @example
 * ```typescript
 * import { swimchainTestnet } from '@swimchain/client';
 *
 * const client = swimchainTestnet();
 * await client.connect();
 *
 * // Set identity for authenticated operations
 * await client.setIdentity({
 *   publicKey: '...',
 *   seed: '...',
 * });
 *
 * // Get content
 * const { spaces } = await client.listSpaces();
 * const { items } = await client.getSpacePosts(spaces[0].id);
 *
 * // Create content (with automatic PoW)
 * const result = await client.createPost(
 *   spaces[0].id,
 *   'Hello World',
 *   'This is my first post!',
 * );
 * ```
 */

// Types
export * from './types.js';

// Utils
export * from './utils.js';

// PoW
export {
  createChallenge,
  serializeChallenge,
  computePow,
  leadingZeros,
  solutionToRpcParams,
  getDifficulty,
  getPoWConfig,
  estimateMiningTime,
  DIFFICULTY,
  TESTNET_DIFFICULTY,
  PRODUCTION_CONFIG,
  TESTNET_CONFIG,
  TEST_CONFIG,
} from './pow.js';

// RPC
export {
  SwimchainRpc,
  createTestnetClient,
  createMainnetClient,
  createClient,
  type Signer,
} from './rpc.js';

// High-level Client
export {
  SwimchainClient,
  swimchainTestnet,
  swimchainMainnet,
  swimchain,
  type SwimchainClientOptions,
  type IdentityOptions,
} from './client.js';
