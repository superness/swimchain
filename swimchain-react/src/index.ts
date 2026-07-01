/**
 * Swimchain React Library
 *
 * Provides React hooks and components for Swimchain integration.
 *
 * @example
 * ```tsx
 * import { SwimchainProvider, useKeypair, useDecay, usePow, RpcProvider, useRpc } from '@swimchain/react';
 *
 * function App() {
 *   return (
 *     <SwimchainProvider fallback={<div>Loading...</div>}>
 *       <RpcProvider autoConnect>
 *         <MyApp />
 *       </RpcProvider>
 *     </SwimchainProvider>
 *   );
 * }
 *
 * function MyApp() {
 *   const { keypair, generate } = useKeypair();
 *   const { rpc, connected } = useRpc();
 *   const { spaces, loading } = useSpaces();
 *   const decay = useDecay(createdAt, lastEngagement);
 *   const { mine, state, solution } = usePow();
 *
 *   return (
 *     // Your UI here
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */

// Provider
export {
  SwimchainProvider,
  useSwimchain,
  useRequireSwimchain,
  type SwimchainProviderProps,
  type SwimchainContextValue,
} from "./SwimchainProvider";

// Identity hooks
export {
  useKeypair,
  useAddressValidation,
  useEncodeAddress,
  useDecodeAddress,
  useVerifySignature,
  useIsValidAddress,
} from "./hooks/useIdentity";

// Decay hooks
export {
  useDecay,
  useDecayOnce,
  useIsProtected,
  useIsDecayed,
  type UseDecayOptions,
} from "./hooks/useDecay";

// PoW hooks
export {
  usePow,
  usePowSync,
  useVerifyPow,
  useMiningEstimate,
  type UsePowResult,
} from "./hooks/usePow";

// RPC hooks and provider
export {
  RpcProvider,
  useRpc,
  useSyncStatus,
  usePeers,
  type RpcProviderProps,
  type RpcContextValue,
} from "./hooks/useRpc";

// Content hooks
export {
  useSpaces,
  useSpaceThreads,
  useThread,
  useReplies,
  useReactions,
  useUserPosts,
  type Space,
  type Thread,
  type Reply,
  type UserPost,
} from "./hooks/useContent";

// Stored identity hooks
export {
  useStoredIdentity,
  useStoredKeypair,
  createNewIdentity,
  loadStoredIdentity,
  type StoredIdentity,
  type UseStoredIdentityResult,
  type UseStoredKeypairResult,
} from "./hooks/useStoredIdentity";

// RPC client
export {
  SwimchainRpc,
  getLocalConfig,
  LOCAL_TESTNET,
  LOCAL_REGTEST,
  LOCAL_MAINNET,
  TESTNET_SEED_SF,
  TESTNET_SEED_NYC,
  type RpcConfig,
  type SignatureAuth,
  type NodeInfo,
  type SyncStatus,
  type ContentResult,
  type SpaceContentResult,
  type SpaceSummary,
  type ListSpacesResult,
  type UserPostsResult,
  type IdentityLevel,
  type PoolInfo,
  type ReplyResult,
  type ReactionResult,
  type SpamReason,
  type SpamStatus,
} from "./lib/rpc";

// Action PoW (Argon2id)
export {
  ActionType,
  computePow,
  createChallenge,
  createPostChallenge,
  createReplyChallenge,
  createEngageChallenge,
  createSpaceChallenge,
  solutionToRpcParams,
  getDifficulty,
  getConfig,
  estimateMiningTime,
  serializeChallenge,
  leadingZeros,
  hexToBytes,
  bytesToHex,
  sha256,
  generateNonceSpace,
  DIFFICULTY,
  TESTNET_DIFFICULTY,
  PRODUCTION_CONFIG,
  TESTNET_CONFIG,
  TEST_CONFIG,
  type PoWConfig,
  type PoWChallenge,
  type PoWSolution,
  type ProgressCallback,
  type CancellationCheck,
} from "./lib/action-pow";

// Caching utilities
export {
  getMediaFromCache,
  setMediaInCache,
  getContentFromCache,
  setContentInCache,
  deleteContentFromCache,
  getFromMemory,
  setInMemory,
  invalidateMemory,
  getFromStorage,
  setInStorage,
  removeFromStorage,
  getCacheStats,
  clearDecryptedMediaCache,
  clearAllCaches,
  type CachedMedia,
  type CachedContent,
} from "./lib/cache";

// Encryption utilities
export {
  isEncrypted,
  encryptContent,
  decryptContent,
  encryptPost,
  decryptPost,
  generatePassphrase,
  encryptMedia,
  decryptMedia,
  base64ToBytes,
  bytesToBase64,
  isPrivateEncrypted,
  encryptWithSpaceKey,
  decryptWithSpaceKey,
  encryptPrivatePost,
  decryptPrivatePost,
  encryptPrivateMedia,
  decryptPrivateMedia,
  encryptSpaceName,
  decryptSpaceName,
} from "./lib/encryption";

// X25519 key exchange (for private spaces)
export {
  ed25519PrivateToX25519,
  ed25519PublicToX25519,
  deriveX25519Keys,
  x25519SharedSecret,
  x25519Box,
  x25519Unbox,
  generateSpaceKey,
  encryptSpaceKeyForRecipient,
  decryptSpaceKey,
  hexToBytes as x25519HexToBytes,
  bytesToHex as x25519BytesToHex,
} from "./lib/x25519";

// DM utilities
export {
  getDMSpaceId,
  isDMSpace,
  getDMSpaceName,
  canInitiateDM,
  getDMStatusText,
  getDMAction,
  type DMStatus,
  type DMInfo,
} from "./lib/dm";

// Profile utilities
export {
  getProfileSpaceId,
  isProfileSpace,
  encodeProfileInfo,
  decodeProfileInfo,
  encodeAvatarInfo,
  decodeAvatarInfo,
  getAvatarColor,
  getAvatarInitials,
  createEmptyProfile,
  deriveProfileKey,
  encryptProfileInfo,
  decryptProfileInfo,
  encodePrivateProfileInfo,
  decodePrivateProfileInfo,
  isPrivateProfile,
  decodeAnyProfileInfo,
  PROFILE_INFO_TYPE,
  PROFILE_AVATAR_TYPE,
  PROFILE_INFO_PRIVATE_TYPE,
  type ProfileInfo,
  type PrivateProfileMeta,
  type AvatarInfo,
  type UserProfile,
} from "./lib/profile";

// Re-export core types that are commonly needed
export type {
  DecayState,
  PowSolution,
  AddressValidation,
  MiningState,
} from "@swimchain/core";
