/**
 * Identity context provider for analytics-client
 * Node-based identity - fetches identity from the connected Swimchain node
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface NodeIdentity {
  address: string;
  publicKey: string;
}

interface IdentityContextValue {
  identity: NodeIdentity | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  displayName: string | null;
  setDisplayName: (name: string | null) => Promise<boolean>;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

const RPC_PORT = import.meta.env.VITE_RPC_PORT || '19736';
const RPC_HOST = import.meta.env.VITE_RPC_HOST || 'localhost';
const RPC_URL = `http://${RPC_HOST}:${RPC_PORT}`;

async function rpcCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result as T;
}

export function IdentityProvider({ children }: { children: ReactNode }): JSX.Element {
  const [identity, setIdentity] = useState<NodeIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayNameState] = useState<string | null>(null);

  const fetchIdentity = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await rpcCall<{ address: string; public_key: string }>('get_identity_info', {});
      setIdentity({ address: result.address, publicKey: result.public_key });

      // Also fetch display name
      try {
        const nameResult = await rpcCall<{ name: string | null }>('get_identity_name', {});
        setDisplayNameState(nameResult.name);
      } catch {
        // Display name fetch is optional
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch identity');
      setIdentity(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setDisplayName = useCallback(async (name: string | null): Promise<boolean> => {
    try {
      await rpcCall('set_identity_name', { name: name || null });
      setDisplayNameState(name);
      return true;
    } catch (err) {
      console.error('[Identity] Failed to set display name:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    fetchIdentity();
  }, [fetchIdentity]);

  return (
    <IdentityContext.Provider
      value={{ identity, isLoading, error, refetch: fetchIdentity, displayName, setDisplayName }}
    >
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
