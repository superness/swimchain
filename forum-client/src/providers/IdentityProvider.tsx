/**
 * Identity context provider - manages identity state globally
 *
 * Uses node identity exclusively via RPC. No browser-stored identity.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { StoredIdentity } from '../types';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { logger } from '../lib/logger';

interface IdentityContextValue {
  identity: StoredIdentity | null;
  isLoading: boolean;
  hasValidIdentity: boolean;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function useIdentityContext(): IdentityContextValue {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentityContext must be used within IdentityProvider');
  }
  return context;
}

interface IdentityProviderProps {
  children: ReactNode;
}

export function IdentityProvider({ children }: IdentityProviderProps): JSX.Element {
  logger.info('[IdentityProvider] ===== MOUNTING =====');

  const { identity: nodeIdentity, isLoading } = useNodeIdentity();

  // Create a pseudo-identity from node identity for compatibility with existing code
  const identity: StoredIdentity | null = nodeIdentity ? {
    address: nodeIdentity.address,
    publicKey: nodeIdentity.publicKey,
    seed: '', // No seed in browser for node identity
    createdAt: Date.now(),
  } : null;

  // Valid identity = node identity with public key
  const hasValidIdentity = Boolean(nodeIdentity?.publicKey);

  logger.info('[IdentityProvider] State:', {
    hasNodeIdentity: !!nodeIdentity,
    nodeIdentityPubKey: nodeIdentity?.publicKey?.substring(0, 20),
    isLoading,
    hasValidIdentity,
    finalIdentityAddress: identity?.address?.substring(0, 20),
  });

  // No-op functions since identity is managed by node
  const setIdentity = () => {
    logger.warn('[IdentityProvider] setIdentity called but identity is managed by node');
  };

  const clearIdentity = () => {
    logger.warn('[IdentityProvider] clearIdentity called but identity is managed by node');
  };

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<IdentityContextValue>(
    () => ({
      identity,
      isLoading,
      hasValidIdentity,
      setIdentity,
      clearIdentity,
    }),
    [identity, isLoading, hasValidIdentity]
  );

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}
