/**
 * Identity context provider - manages identity state globally
 * Redirects to identity creation if no valid identity exists
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { StoredIdentity } from '../types';

const STORAGE_KEY = 'swimchain-identity';

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
  const [identity, setIdentityState] = useState<StoredIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <IdentityContext.Provider
      value={{
        identity,
        isLoading,
        hasValidIdentity,
        setIdentity,
        clearIdentity,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}
