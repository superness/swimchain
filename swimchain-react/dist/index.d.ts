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
export { SwimchainProvider, useSwimchain, useRequireSwimchain, type SwimchainProviderProps, type SwimchainContextValue, } from "./SwimchainProvider";
export { useKeypair, useAddressValidation, useEncodeAddress, useDecodeAddress, useVerifySignature, useIsValidAddress, } from "./hooks/useIdentity";
export { useDecay, useDecayOnce, useIsProtected, useIsDecayed, type UseDecayOptions, } from "./hooks/useDecay";
export { usePow, usePowSync, useVerifyPow, useMiningEstimate, type UsePowResult, } from "./hooks/usePow";
export { RpcProvider, useRpc, useSyncStatus, usePeers, type RpcProviderProps, type RpcContextValue, } from "./hooks/useRpc";
export { useSpaces, useSpaceThreads, useThread, useReplies, useReactions, useUserPosts, type Space, type Thread, type Reply, type UserPost, } from "./hooks/useContent";
export { useStoredIdentity, useStoredKeypair, createNewIdentity, loadStoredIdentity, type StoredIdentity, type UseStoredIdentityResult, type UseStoredKeypairResult, } from "./hooks/useStoredIdentity";
export { SwimchainRpc, getLocalConfig, LOCAL_TESTNET, LOCAL_REGTEST, LOCAL_MAINNET, TESTNET_SEED_SF, TESTNET_SEED_NYC, type RpcConfig, type SignatureAuth, type NodeInfo, type SyncStatus, type ContentResult, type SpaceContentResult, type SpaceSummary, type ListSpacesResult, type UserPostsResult, type IdentityLevel, type PoolInfo, type ReplyResult, type ReactionResult, type SpamReason, type SpamStatus, } from "./lib/rpc";
export { ActionType, computePow, createChallenge, createPostChallenge, createReplyChallenge, createEngageChallenge, createSpaceChallenge, solutionToRpcParams, getDifficulty, getConfig, estimateMiningTime, serializeChallenge, leadingZeros, hexToBytes, bytesToHex, sha256, generateNonceSpace, DIFFICULTY, TESTNET_DIFFICULTY, PRODUCTION_CONFIG, TESTNET_CONFIG, TEST_CONFIG, type PoWConfig, type PoWChallenge, type PoWSolution, type ProgressCallback, type CancellationCheck, } from "./lib/action-pow";
export { signAction, actionSignaturePreimage, contentHashForPost, contentHashForReply, type SignFn, } from "./lib/signAction";
export { getMediaFromCache, setMediaInCache, getContentFromCache, setContentInCache, deleteContentFromCache, getFromMemory, setInMemory, invalidateMemory, getFromStorage, setInStorage, removeFromStorage, getCacheStats, clearDecryptedMediaCache, clearAllCaches, type CachedMedia, type CachedContent, } from "./lib/cache";
export { isEncrypted, encryptContent, decryptContent, encryptPost, decryptPost, generatePassphrase, encryptMedia, decryptMedia, base64ToBytes, bytesToBase64, isPrivateEncrypted, encryptWithSpaceKey, decryptWithSpaceKey, encryptPrivatePost, decryptPrivatePost, encryptPrivateMedia, decryptPrivateMedia, encryptSpaceName, decryptSpaceName, } from "./lib/encryption";
export { ed25519PrivateToX25519, ed25519PublicToX25519, deriveX25519Keys, x25519SharedSecret, x25519Box, x25519Unbox, generateSpaceKey, encryptSpaceKeyForRecipient, decryptSpaceKey, hexToBytes as x25519HexToBytes, bytesToHex as x25519BytesToHex, } from "./lib/x25519";
export { getDMSpaceId, isDMSpace, getDMSpaceName, canInitiateDM, getDMStatusText, getDMAction, type DMStatus, type DMInfo, } from "./lib/dm";
export { getProfileSpaceId, isProfileSpace, encodeProfileInfo, decodeProfileInfo, encodeAvatarInfo, decodeAvatarInfo, getAvatarColor, getAvatarInitials, createEmptyProfile, deriveProfileKey, encryptProfileInfo, decryptProfileInfo, encodePrivateProfileInfo, decodePrivateProfileInfo, isPrivateProfile, decodeAnyProfileInfo, PROFILE_INFO_TYPE, PROFILE_AVATAR_TYPE, PROFILE_INFO_PRIVATE_TYPE, type ProfileInfo, type PrivateProfileMeta, type AvatarInfo, type UserProfile, } from "./lib/profile";
export type { DecayState, PowSolution, AddressValidation, MiningState, } from "@swimchain/core";
//# sourceMappingURL=index.d.ts.map