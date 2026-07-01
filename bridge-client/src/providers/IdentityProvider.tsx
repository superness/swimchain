/**
 * Identity context provider for bridge-client
 *
 * Wraps the useStoredIdentity hook in a React Context so identity
 * state is available throughout the component tree.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useStoredIdentity } from '../hooks/useStoredIdentity';
import type { StoredIdentity } from '../types';

interface IdentityContextValue {
  identity: StoredIdentity | null;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
  isLoading: boolean;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }): JSX.Element {
  const { identity, setIdentity, clearIdentity, isLoading } = useStoredIdentity();

  return (
    <IdentityContext.Provider value={{ identity, setIdentity, clearIdentity, isLoading }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentityContext(): IdentityContextValue {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentityContext must be used within IdentityProvider');
  }
  return context;
}
