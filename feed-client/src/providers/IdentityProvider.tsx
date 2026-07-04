/**
 * Identity context provider - manages identity state globally
 * Redirects to identity creation if no valid identity exists
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { StoredIdentity } from '../types';
import { useParentRpcConfig, isInIframe } from '../hooks/useParentRpcConfig';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { selectIdentityMode, type IdentityMode } from '../hooks/identityMode';

const STORAGE_KEY = 'swimchain-identity';

interface IdentityContextValue {
  identity: StoredIdentity | null;
  isLoading: boolean;
  hasValidIdentity: boolean;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
  /**
   * Which identity source is active: 'browser' (localStorage seed),
   * 'node' (desktop shell, node holds the identity), or 'pending' (embedded,
   * awaiting the shell's config).
   */
  mode: IdentityMode;
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
  const [identity, setIdentityState] = useState<StoredIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Node mode (desktop shell): the node owns the identity and signs via RPC, so
  // there is no browser seed. A node identity IS a valid identity for the gates
  // (RequireIdentity), sponsorship checks and "current user" display. Standalone
  // browser behaviour below is unchanged.
  const parentConfig = useParentRpcConfig();
  const mode = selectIdentityMode(parentConfig, isInIframe());
  const node = useNodeIdentity();

  // Check if identity has seed (required for RPC auth)
  const hasValidIdentity = Boolean(identity?.seed && identity?.address);

  // Load identity from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredIdentity;
        console.log('[Identity] Loaded from storage:', {
          address: parsed.address,
          hasSeed: Boolean(parsed.seed),
          seedLength: parsed.seed?.length,
        });
        setIdentityState(parsed);
      } else {
        console.log('[Identity] No identity in storage');
      }
    } catch (error) {
      console.error('[Identity] Failed to load:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setIdentity = useCallback((newIdentity: StoredIdentity) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
      console.log('[Identity] Saved:', {
        address: newIdentity.address,
        hasSeed: Boolean(newIdentity.seed),
      });
      setIdentityState(newIdentity);
    } catch (error) {
      console.error('[Identity] Failed to save:', error);
    }
  }, []);

  const clearIdentity = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      console.log('[Identity] Cleared');
      setIdentityState(null);
    } catch (error) {
      console.error('[Identity] Failed to clear:', error);
    }
  }, []);

  // In node mode, surface the node's identity in the browser StoredIdentity
  // shape (empty seed — signing goes through the node's sign_message RPC via
  // useFeedIdentity, never through this seed).
  if (mode === 'node') {
    const nodeIdentity: StoredIdentity | null = node.identity
      ? {
          address: node.identity.address,
          publicKey: node.identity.publicKey,
          seed: '',
          createdAt: 0,
        }
      : null;
    return (
      <IdentityContext.Provider
        value={{
          identity: nodeIdentity,
          isLoading: node.isLoading && node.identity === null,
          hasValidIdentity: nodeIdentity !== null,
          setIdentity: () => {},
          clearIdentity: () => {},
          mode,
        }}
      >
        {children}
      </IdentityContext.Provider>
    );
  }

  return (
    <IdentityContext.Provider
      value={{
        identity,
        isLoading,
        hasValidIdentity,
        setIdentity,
        clearIdentity,
        mode,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}
