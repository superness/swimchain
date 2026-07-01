/**
 * Hook for accessing identity
 *
 * This is a compatibility wrapper that uses the IdentityContext.
 * Identity is now managed by the node, not stored in localStorage.
 */

import { useIdentityContext } from '../providers/IdentityProvider';
import type { StoredIdentity } from '../types';
import { logger } from '../lib/logger';

interface UseStoredIdentityResult {
  /** The identity (null if not loaded) */
  identity: StoredIdentity | null;
  /** Whether an identity exists */
  hasStoredIdentity: boolean;
  /** Always false - no encryption with node identity */
  isEncrypted: boolean;
  /** Always false - no passphrase needed */
  needsPassphrase: boolean;
  /** No-op - identity is managed by node */
  setIdentity: (identity: StoredIdentity, passphrase: string) => Promise<void>;
  /** No-op - always returns true */
  unlockIdentity: (passphrase: string) => Promise<boolean>;
  /** No-op */
  lockIdentity: () => void;
  /** No-op */
  clearIdentity: () => void;
  /** No-op - always returns true */
  migrateToEncrypted: (passphrase: string) => Promise<boolean>;
  /** Whether we're still loading */
  isLoading: boolean;
  /** Error message */
  error: string | null;
}

export function useStoredIdentity(): UseStoredIdentityResult {
  const { identity, isLoading, hasValidIdentity } = useIdentityContext();

  logger.info('[useStoredIdentity] Using node identity wrapper:', {
    hasIdentity: !!identity,
    address: identity?.address || null,
    isLoading,
  });

  return {
    identity,
    hasStoredIdentity: hasValidIdentity,
    isEncrypted: false,
    needsPassphrase: false,
    setIdentity: async () => {
      logger.warn('[useStoredIdentity] setIdentity is a no-op - identity is managed by node');
    },
    unlockIdentity: async () => {
      logger.warn('[useStoredIdentity] unlockIdentity is a no-op - identity is managed by node');
      return true;
    },
    lockIdentity: () => {
      logger.warn('[useStoredIdentity] lockIdentity is a no-op - identity is managed by node');
    },
    clearIdentity: () => {
      logger.warn('[useStoredIdentity] clearIdentity is a no-op - identity is managed by node');
    },
    migrateToEncrypted: async () => {
      logger.warn('[useStoredIdentity] migrateToEncrypted is a no-op - identity is managed by node');
      return true;
    },
    isLoading,
    error: null,
  };
}
