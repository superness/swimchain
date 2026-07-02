/**
 * Hook exports
 */

export { useRpc, RpcProvider, useNetworkStatus } from './useRpc';
export { useStoredIdentity } from '@swimchain/frontend';
export { useParentRpcConfig, isInIframe, getParentConfig } from './useParentRpcConfig';
export { useWikiPage } from './useWikiPage';
export { useWikiNamespaces } from './useWikiNamespaces';
export { useWikiRevisions, fetchWikiRevisions } from './useWikiRevisions';
export { useWikiSearch } from './useWikiSearch';
export { useRecentChanges } from './useRecentChanges';
export { useSpamStatus, useSpamReport } from './useSpamAttestation';
export type { SpamReason, SpamStatus } from './useSpamAttestation';
